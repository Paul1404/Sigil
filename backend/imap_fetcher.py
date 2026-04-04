import email
import imaplib
import logging
from datetime import datetime, timezone
from email.header import decode_header

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from dmarc_parser import ParsedReport, extract_and_parse
from encryption import decrypt_password
from models import DmarcRecord, DmarcReport, MailboxConfig

logger = logging.getLogger(__name__)


def _decode_header_value(value: str | None) -> str:
    if not value:
        return ""
    decoded_parts = decode_header(value)
    result = []
    for part, charset in decoded_parts:
        if isinstance(part, bytes):
            result.append(part.decode(charset or "utf-8", errors="replace"))
        else:
            result.append(part)
    return " ".join(result)


async def fetch_mailbox(mailbox: MailboxConfig, db: AsyncSession) -> dict:
    result = {"status": "success", "message": "", "reports_found": 0}

    try:
        password = decrypt_password(mailbox.encrypted_password)
    except Exception as e:
        return {"status": "error", "message": f"Failed to decrypt password: {e}", "reports_found": 0}

    imap = None
    try:
        imap = imaplib.IMAP4_SSL(mailbox.imap_host, mailbox.imap_port)
        imap.login(mailbox.username, password)
    except imaplib.IMAP4.error as e:
        return {"status": "error", "message": f"IMAP login failed: {e}", "reports_found": 0}
    except Exception as e:
        return {"status": "error", "message": f"Failed to connect to IMAP server: {e}", "reports_found": 0}

    try:
        status, _ = imap.select(mailbox.folder, readonly=True)
        if status != "OK":
            return {"status": "error", "message": f"Could not select folder '{mailbox.folder}'", "reports_found": 0}

        # Search for all emails (we'll filter by attachment type)
        status, msg_ids = imap.search(None, "ALL")
        if status != "OK" or not msg_ids[0]:
            result["message"] = "No emails found in folder"
            return result

        ids = msg_ids[0].split()
        reports_found = 0

        for msg_id in ids:
            status, msg_data = imap.fetch(msg_id, "(RFC822)")
            if status != "OK":
                continue

            raw_email = msg_data[0][1]
            msg = email.message_from_bytes(raw_email)
            subject = _decode_header_value(msg.get("Subject"))
            date_str = msg.get("Date", "")

            msg_date = None
            try:
                msg_date = email.utils.parsedate_to_datetime(date_str)
                if msg_date.tzinfo is None:
                    msg_date = msg_date.replace(tzinfo=timezone.utc)
            except Exception:
                pass

            # Walk through parts looking for DMARC report attachments
            for part in msg.walk():
                if part.get_content_maintype() == "multipart":
                    continue

                filename = part.get_filename()
                if not filename:
                    continue

                filename = _decode_header_value(filename)
                lower = filename.lower()
                if not (
                    lower.endswith(".xml")
                    or lower.endswith(".xml.gz")
                    or lower.endswith(".gz")
                    or lower.endswith(".zip")
                ):
                    continue

                payload = part.get_payload(decode=True)
                if not payload:
                    continue

                parsed = extract_and_parse(filename, payload)
                if parsed is None:
                    continue

                # Check for duplicate by report_id
                if parsed.report_id:
                    existing = await db.execute(
                        select(DmarcReport).where(
                            DmarcReport.report_id_str == parsed.report_id
                        )
                    )
                    if existing.scalar_one_or_none() is not None:
                        continue

                report = _create_report(parsed, mailbox.id, subject, msg_date)
                db.add(report)
                await db.flush()

                for rec_data in parsed.records:
                    record = DmarcRecord(
                        report_id=report.id,
                        source_ip=rec_data.source_ip,
                        count=rec_data.count,
                        disposition=rec_data.disposition,
                        dkim_domain=rec_data.dkim_domain,
                        dkim_result=rec_data.dkim_result,
                        dkim_alignment=rec_data.dkim_alignment,
                        spf_domain=rec_data.spf_domain,
                        spf_result=rec_data.spf_result,
                        spf_alignment=rec_data.spf_alignment,
                        envelope_from=rec_data.envelope_from,
                        header_from=rec_data.header_from,
                    )
                    db.add(record)

                reports_found += 1

        await db.commit()

        # Update last_fetched_at
        mailbox.last_fetched_at = datetime.now(timezone.utc)
        db.add(mailbox)
        await db.commit()

        result["reports_found"] = reports_found
        result["message"] = f"Successfully fetched {reports_found} new report(s)"

    except Exception as e:
        logger.exception("Error fetching mailbox %s", mailbox.name)
        await db.rollback()
        return {"status": "error", "message": f"Error processing emails: {e}", "reports_found": 0}
    finally:
        if imap:
            try:
                imap.close()
                imap.logout()
            except Exception:
                pass

    return result


def _create_report(
    parsed: ParsedReport,
    mailbox_id: int,
    subject: str | None,
    msg_date: datetime | None,
) -> DmarcReport:
    return DmarcReport(
        mailbox_id=mailbox_id,
        org_name=parsed.org_name,
        email=parsed.email,
        report_id_str=parsed.report_id,
        domain=parsed.domain,
        date_range_begin=parsed.date_range_begin,
        date_range_end=parsed.date_range_end,
        policy_domain=parsed.policy_domain,
        policy_adkim=parsed.policy_adkim,
        policy_aspf=parsed.policy_aspf,
        policy_p=parsed.policy_p,
        policy_sp=parsed.policy_sp,
        policy_pct=parsed.policy_pct,
        email_subject=subject,
        email_date=msg_date,
    )
