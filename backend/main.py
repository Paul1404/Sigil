import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy import select, func, case, distinct
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from auth import create_access_token, require_auth, verify_password
from classifier import (
    CLASS_IGNORED,
    CLASS_TRUSTED,
    CLASS_UNAUTHORIZED,
    MATCH_DOMAIN,
    MATCH_ENVELOPE_FROM,
    MATCH_HEADER_FROM,
    MATCH_SOURCE_IP,
    StateCounts,
    build_index,
    classify_record,
    count_record_states,
)
from config import settings
from database import get_db
from dns_checker import run_all_checks
from encryption import encrypt_password
from imap_fetcher import fetch_mailbox
from models import (
    DmarcRecord,
    DmarcReport,
    MailboxConfig,
    MailboxEmail,
    SourceClassification,
    TlsReport,
)
from scheduler import start_scheduler, stop_scheduler
from schemas import (
    DashboardStats,
    DmarcRecordResponse,
    DmarcReportDetail,
    DmarcReportSummary,
    DnsCheckRequest,
    DnsCheckResponse,
    DomainHealthSummary,
    FetchResult,
    MailboxCreate,
    MailboxEmailDetail,
    MailboxEmailSummary,
    MailboxResponse,
    MailboxUpdate,
    SourceClassificationCreate,
    SourceClassificationResponse,
    SourceClassificationUpdate,
    StateCountsResponse,
    TimelinePoint,
    TlsDomainSummary,
    TlsReportSummary,
)

VALID_CLASSIFICATIONS = {CLASS_TRUSTED, CLASS_UNAUTHORIZED, CLASS_IGNORED}
VALID_MATCH_TYPES = {MATCH_DOMAIN, MATCH_SOURCE_IP, MATCH_HEADER_FROM, MATCH_ENVELOPE_FROM}


async def _load_classification_index(db: AsyncSession):
    rows = (await db.execute(select(SourceClassification))).scalars().all()
    return build_index(rows)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    start_scheduler(settings.fetch_interval_hours)
    yield
    stop_scheduler()


app = FastAPI(title="Sigil", description="Email authentication, made visible.", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins.split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- Auth ---


class LoginRequest(BaseModel):
    password: str


@app.post("/api/auth/login")
async def login(body: LoginRequest):
    if not verify_password(body.password):
        raise HTTPException(status_code=401, detail="Invalid password")
    token = create_access_token()
    return {"token": token}


@app.get("/api/auth/me")
async def auth_me(user: str = Depends(require_auth)):
    return {"user": user}


# --- Health ---


@app.get("/api/health")
async def health():
    return {"status": "ok"}


# --- Dashboard ---


@app.get("/api/dashboard/stats", response_model=DashboardStats)
async def dashboard_stats(db: AsyncSession = Depends(get_db), _user: str = Depends(require_auth)):
    total_reports = (await db.execute(func.count(DmarcReport.id))).scalar() or 0
    total_domains = (
        await db.execute(select(func.count(distinct(DmarcReport.domain))))
    ).scalar() or 0
    last_report_date = (
        await db.execute(select(func.max(DmarcReport.date_range_end)))
    ).scalar()

    # Classified counts across all reports/records.
    index = await _load_classification_index(db)
    reports = (
        await db.execute(select(DmarcReport).options(selectinload(DmarcReport.records)))
    ).scalars().all()
    total_counts = StateCounts()
    for r in reports:
        rep_counts = count_record_states(r.records, r.policy_domain or r.domain, index)
        total_counts.aligned += rep_counts.aligned
        total_counts.misaligned_legitimate += rep_counts.misaligned_legitimate
        total_counts.rejected_spoof += rep_counts.rejected_spoof
        total_counts.ignored += rep_counts.ignored
        total_counts.unknown_failure += rep_counts.unknown_failure

    # Legacy pass rate: messages where dkim OR spf aligned, over all messages.
    records_query = select(
        func.coalesce(func.sum(DmarcRecord.count), 0).label("total_messages"),
        func.coalesce(
            func.sum(
                case(
                    (
                        (DmarcRecord.dkim_alignment == "pass")
                        | (DmarcRecord.spf_alignment == "pass"),
                        DmarcRecord.count,
                    ),
                    else_=0,
                )
            ),
            0,
        ).label("passed_messages"),
    )
    row = (await db.execute(records_query)).one()
    total_messages = row.total_messages
    overall_pass_rate = (row.passed_messages / total_messages * 100) if total_messages > 0 else 0.0

    # Top senders -- excludes IPs explicitly classified as ignored at the global level.
    top_query = (
        select(
            DmarcRecord.source_ip,
            func.sum(DmarcRecord.count).label("total"),
        )
        .group_by(DmarcRecord.source_ip)
        .order_by(func.sum(DmarcRecord.count).desc())
        .limit(10)
    )
    top_rows = (await db.execute(top_query)).all()
    top_senders = [{"source_ip": r.source_ip, "count": r.total} for r in top_rows]

    return DashboardStats(
        total_reports=total_reports,
        total_domains=total_domains,
        total_messages=total_messages,
        overall_pass_rate=round(overall_pass_rate, 1),
        last_report_date=last_report_date,
        top_senders=top_senders,
        counts=StateCountsResponse(**total_counts.as_dict()),
    )


@app.get("/api/dashboard/timeline", response_model=list[TimelinePoint])
async def dashboard_timeline(db: AsyncSession = Depends(get_db), _user: str = Depends(require_auth)):
    query = (
        select(
            func.date_trunc("day", DmarcReport.date_range_begin).label("day"),
            func.coalesce(func.sum(DmarcRecord.count), 0).label("total"),
            func.coalesce(
                func.sum(
                    case(
                        (
                            (DmarcRecord.dkim_alignment == "pass")
                            | (DmarcRecord.spf_alignment == "pass"),
                            DmarcRecord.count,
                        ),
                        else_=0,
                    )
                ),
                0,
            ).label("passed"),
        )
        .join(DmarcRecord, DmarcRecord.report_id == DmarcReport.id)
        .where(DmarcReport.date_range_begin.isnot(None))
        .group_by("day")
        .order_by("day")
    )
    rows = (await db.execute(query)).all()
    return [
        TimelinePoint(
            date=r.day.strftime("%Y-%m-%d") if r.day else "",
            total=r.total,
            passed=r.passed,
            failed=r.total - r.passed,
            pass_rate=round(r.passed / r.total * 100, 1) if r.total > 0 else 0.0,
        )
        for r in rows
    ]


# --- Reports ---


@app.get("/api/reports", response_model=list[DmarcReportSummary])
async def list_reports(
    domain: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    db: AsyncSession = Depends(get_db),
    _user: str = Depends(require_auth),
):
    query = select(DmarcReport).options(selectinload(DmarcReport.records))
    if domain:
        query = query.where(DmarcReport.domain.ilike(f"%{domain}%"))
    if date_from:
        query = query.where(DmarcReport.date_range_begin >= date_from)
    if date_to:
        query = query.where(DmarcReport.date_range_end <= date_to)
    query = query.order_by(DmarcReport.date_range_end.desc().nullslast())

    result = await db.execute(query)
    reports = result.scalars().all()

    index = await _load_classification_index(db)
    summaries = []
    for r in reports:
        total = sum(rec.count for rec in r.records)
        if total == 0:
            continue
        passed = sum(
            rec.count
            for rec in r.records
            if rec.dkim_alignment == "pass" or rec.spf_alignment == "pass"
        )
        rate = round(passed / total * 100, 1) if total > 0 else 0.0
        counts = count_record_states(r.records, r.policy_domain or r.domain, index)
        summaries.append(
            DmarcReportSummary(
                id=r.id,
                org_name=r.org_name,
                domain=r.domain,
                report_id_str=r.report_id_str,
                date_range_begin=r.date_range_begin,
                date_range_end=r.date_range_end,
                policy_p=r.policy_p,
                email_subject=r.email_subject,
                email_date=r.email_date,
                created_at=r.created_at,
                total_messages=total,
                pass_rate=rate,
                counts=StateCountsResponse(**counts.as_dict()),
            )
        )
    return summaries


@app.get("/api/reports/{report_id}", response_model=DmarcReportDetail)
async def get_report(report_id: int, db: AsyncSession = Depends(get_db), _user: str = Depends(require_auth)):
    result = await db.execute(
        select(DmarcReport)
        .options(selectinload(DmarcReport.records))
        .where(DmarcReport.id == report_id)
    )
    report = result.scalar_one_or_none()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    index = await _load_classification_index(db)
    policy = report.policy_domain or report.domain
    records = []
    for rec in report.records:
        records.append(
            DmarcRecordResponse(
                id=rec.id,
                source_ip=rec.source_ip,
                count=rec.count,
                disposition=rec.disposition,
                dkim_domain=rec.dkim_domain,
                dkim_result=rec.dkim_result,
                dkim_alignment=rec.dkim_alignment,
                spf_domain=rec.spf_domain,
                spf_result=rec.spf_result,
                spf_alignment=rec.spf_alignment,
                envelope_from=rec.envelope_from,
                header_from=rec.header_from,
                dkim_results_json=rec.dkim_results_json,
                spf_results_json=rec.spf_results_json,
                state=classify_record(rec, policy, index),
            )
        )

    return DmarcReportDetail(
        id=report.id,
        mailbox_id=report.mailbox_id,
        org_name=report.org_name,
        email=report.email,
        report_id_str=report.report_id_str,
        domain=report.domain,
        date_range_begin=report.date_range_begin,
        date_range_end=report.date_range_end,
        policy_domain=report.policy_domain,
        policy_adkim=report.policy_adkim,
        policy_aspf=report.policy_aspf,
        policy_p=report.policy_p,
        policy_sp=report.policy_sp,
        policy_pct=report.policy_pct,
        email_subject=report.email_subject,
        email_date=report.email_date,
        created_at=report.created_at,
        records=records,
    )


@app.get("/api/reports-domains/health", response_model=list[DomainHealthSummary])
async def domain_health(db: AsyncSession = Depends(get_db), _user: str = Depends(require_auth)):
    """Per-domain classification rollup for the Reports overview cards."""
    reports = (
        await db.execute(select(DmarcReport).options(selectinload(DmarcReport.records)))
    ).scalars().all()
    index = await _load_classification_index(db)

    rollup: dict[str, dict] = {}
    for r in reports:
        domain = r.domain
        policy = r.policy_domain or domain
        bucket = rollup.setdefault(domain, {"counts": StateCounts(), "reports": 0})
        bucket["reports"] += 1
        c = count_record_states(r.records, policy, index)
        bucket["counts"].aligned += c.aligned
        bucket["counts"].misaligned_legitimate += c.misaligned_legitimate
        bucket["counts"].rejected_spoof += c.rejected_spoof
        bucket["counts"].ignored += c.ignored
        bucket["counts"].unknown_failure += c.unknown_failure

    summaries: list[DomainHealthSummary] = []
    for domain, data in rollup.items():
        ignored = (index.get(domain.lower(), {}).get(MATCH_DOMAIN, {}).get(domain.lower())
                   == CLASS_IGNORED)
        summaries.append(
            DomainHealthSummary(
                domain=domain,
                counts=StateCountsResponse(**data["counts"].as_dict()),
                report_count=data["reports"],
                is_ignored=ignored,
            )
        )
    summaries.sort(key=lambda s: s.counts.total_messages, reverse=True)
    return summaries


# --- TLS Reports ---


@app.get("/api/tls-reports", response_model=list[TlsReportSummary])
async def list_tls_reports(
    domain: str | None = None,
    db: AsyncSession = Depends(get_db),
    _user: str = Depends(require_auth),
):
    query = select(TlsReport)
    if domain:
        query = query.where(TlsReport.policy_domain.ilike(f"%{domain}%"))
    query = query.order_by(TlsReport.date_range_end.desc().nullslast())
    result = await db.execute(query)
    return result.scalars().all()


@app.get("/api/tls-reports/summary", response_model=list[TlsDomainSummary])
async def tls_reports_summary(
    db: AsyncSession = Depends(get_db),
    _user: str = Depends(require_auth),
):
    query = (
        select(
            TlsReport.policy_domain,
            func.sum(TlsReport.total_success).label("total_success"),
            func.sum(TlsReport.total_failure).label("total_failure"),
            func.count(TlsReport.id).label("report_count"),
            func.max(TlsReport.date_range_end).label("latest_report"),
        )
        .where(TlsReport.policy_domain.isnot(None))
        .group_by(TlsReport.policy_domain)
        .order_by(func.max(TlsReport.date_range_end).desc().nullslast())
    )
    rows = (await db.execute(query)).all()
    return [
        TlsDomainSummary(
            domain=r.policy_domain,
            total_success=r.total_success or 0,
            total_failure=r.total_failure or 0,
            report_count=r.report_count,
            success_rate=round(
                (r.total_success or 0) / max((r.total_success or 0) + (r.total_failure or 0), 1) * 100, 1
            ),
            latest_report=r.latest_report,
        )
        for r in rows
    ]


# --- DNS ---


@app.post("/api/dns/check", response_model=DnsCheckResponse)
async def dns_check(req: DnsCheckRequest, _user: str = Depends(require_auth)):
    results = run_all_checks(req.domain, req.dkim_selector)
    return DnsCheckResponse(domain=req.domain, results=results)


@app.get("/api/dns/domains")
async def dns_domains(db: AsyncSession = Depends(get_db), _user: str = Depends(require_auth)):
    """Return distinct domains seen across DMARC and TLS reports."""
    dmarc_q = select(DmarcReport.domain).where(DmarcReport.domain.isnot(None)).distinct()
    tls_q = select(TlsReport.policy_domain).where(TlsReport.policy_domain.isnot(None)).distinct()

    dmarc_rows = (await db.execute(dmarc_q)).scalars().all()
    tls_rows = (await db.execute(tls_q)).scalars().all()

    all_domains = sorted(set(d.lower() for d in (*dmarc_rows, *tls_rows) if d))
    return {"domains": all_domains}


# --- Source classifications ---


@app.get(
    "/api/source-classifications",
    response_model=list[SourceClassificationResponse],
)
async def list_source_classifications(
    policy_domain: str | None = None,
    db: AsyncSession = Depends(get_db),
    _user: str = Depends(require_auth),
):
    query = select(SourceClassification)
    if policy_domain:
        query = query.where(SourceClassification.policy_domain == policy_domain.lower())
    query = query.order_by(
        SourceClassification.policy_domain, SourceClassification.created_at.desc()
    )
    return (await db.execute(query)).scalars().all()


@app.post(
    "/api/source-classifications",
    response_model=SourceClassificationResponse,
    status_code=201,
)
async def create_source_classification(
    data: SourceClassificationCreate,
    db: AsyncSession = Depends(get_db),
    _user: str = Depends(require_auth),
):
    if data.classification not in VALID_CLASSIFICATIONS:
        raise HTTPException(status_code=400, detail="Invalid classification")
    if data.match_type not in VALID_MATCH_TYPES:
        raise HTTPException(status_code=400, detail="Invalid match_type")

    policy_domain = data.policy_domain.strip().lower()
    match_value = data.match_value.strip().lower()
    if not policy_domain or not match_value:
        raise HTTPException(status_code=400, detail="policy_domain and match_value required")

    existing = await db.execute(
        select(SourceClassification).where(
            SourceClassification.policy_domain == policy_domain,
            SourceClassification.match_type == data.match_type,
            SourceClassification.match_value == match_value,
        )
    )
    row = existing.scalar_one_or_none()
    if row is not None:
        row.classification = data.classification
        row.notes = data.notes
        await db.commit()
        await db.refresh(row)
        return row

    row = SourceClassification(
        policy_domain=policy_domain,
        match_type=data.match_type,
        match_value=match_value,
        classification=data.classification,
        notes=data.notes,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row


@app.patch(
    "/api/source-classifications/{classification_id}",
    response_model=SourceClassificationResponse,
)
async def update_source_classification(
    classification_id: int,
    data: SourceClassificationUpdate,
    db: AsyncSession = Depends(get_db),
    _user: str = Depends(require_auth),
):
    row = (
        await db.execute(
            select(SourceClassification).where(SourceClassification.id == classification_id)
        )
    ).scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Classification not found")

    if data.classification is not None:
        if data.classification not in VALID_CLASSIFICATIONS:
            raise HTTPException(status_code=400, detail="Invalid classification")
        row.classification = data.classification
    if data.notes is not None:
        row.notes = data.notes
    await db.commit()
    await db.refresh(row)
    return row


@app.delete("/api/source-classifications/{classification_id}")
async def delete_source_classification(
    classification_id: int,
    db: AsyncSession = Depends(get_db),
    _user: str = Depends(require_auth),
):
    row = (
        await db.execute(
            select(SourceClassification).where(SourceClassification.id == classification_id)
        )
    ).scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Classification not found")
    await db.delete(row)
    await db.commit()
    return {"status": "deleted"}


# --- Mailboxes ---


@app.get("/api/mailboxes", response_model=list[MailboxResponse])
async def list_mailboxes(db: AsyncSession = Depends(get_db), _user: str = Depends(require_auth)):
    result = await db.execute(
        select(MailboxConfig).order_by(MailboxConfig.created_at.desc())
    )
    return result.scalars().all()


@app.post("/api/mailboxes", response_model=MailboxResponse, status_code=201)
async def create_mailbox(data: MailboxCreate, db: AsyncSession = Depends(get_db), _user: str = Depends(require_auth)):
    mailbox = MailboxConfig(
        name=data.name,
        imap_host=data.imap_host,
        imap_port=data.imap_port,
        username=data.username,
        encrypted_password=encrypt_password(data.password),
        folder=data.folder,
    )
    db.add(mailbox)
    await db.commit()
    await db.refresh(mailbox)
    return mailbox


@app.put("/api/mailboxes/{mailbox_id}", response_model=MailboxResponse)
async def update_mailbox(
    mailbox_id: int, data: MailboxUpdate, db: AsyncSession = Depends(get_db), _user: str = Depends(require_auth),
):
    result = await db.execute(
        select(MailboxConfig).where(MailboxConfig.id == mailbox_id)
    )
    mailbox = result.scalar_one_or_none()
    if not mailbox:
        raise HTTPException(status_code=404, detail="Mailbox not found")

    update_data = data.model_dump(exclude_unset=True)
    if "password" in update_data:
        update_data["encrypted_password"] = encrypt_password(update_data.pop("password"))

    for key, value in update_data.items():
        setattr(mailbox, key, value)

    await db.commit()
    await db.refresh(mailbox)
    return mailbox


@app.delete("/api/mailboxes/{mailbox_id}")
async def delete_mailbox(mailbox_id: int, db: AsyncSession = Depends(get_db), _user: str = Depends(require_auth)):
    result = await db.execute(
        select(MailboxConfig).where(MailboxConfig.id == mailbox_id)
    )
    mailbox = result.scalar_one_or_none()
    if not mailbox:
        raise HTTPException(status_code=404, detail="Mailbox not found")

    await db.delete(mailbox)
    await db.commit()
    return {"status": "deleted"}


@app.post("/api/mailboxes/{mailbox_id}/fetch", response_model=FetchResult)
async def trigger_fetch(mailbox_id: int, db: AsyncSession = Depends(get_db), _user: str = Depends(require_auth)):
    result = await db.execute(
        select(MailboxConfig).where(MailboxConfig.id == mailbox_id)
    )
    mailbox = result.scalar_one_or_none()
    if not mailbox:
        raise HTTPException(status_code=404, detail="Mailbox not found")

    fetch_result = await fetch_mailbox(mailbox, db)
    return FetchResult(**fetch_result)


# --- Inbox (non-DMARC emails) ---


@app.get("/api/inbox", response_model=list[MailboxEmailSummary])
async def list_inbox(
    mailbox_id: int | None = None,
    db: AsyncSession = Depends(get_db),
    _user: str = Depends(require_auth),
):
    query = select(MailboxEmail)
    if mailbox_id is not None:
        query = query.where(MailboxEmail.mailbox_id == mailbox_id)
    query = query.order_by(MailboxEmail.date.desc().nullslast())
    result = await db.execute(query)
    return result.scalars().all()


@app.get("/api/inbox/{email_id}", response_model=MailboxEmailDetail)
async def get_inbox_email(
    email_id: int,
    db: AsyncSession = Depends(get_db),
    _user: str = Depends(require_auth),
):
    result = await db.execute(
        select(MailboxEmail).where(MailboxEmail.id == email_id)
    )
    mail = result.scalar_one_or_none()
    if not mail:
        raise HTTPException(status_code=404, detail="Email not found")

    # Mark as read
    if not mail.is_read:
        mail.is_read = True
        db.add(mail)
        await db.commit()
        await db.refresh(mail)

    return mail


@app.post("/api/inbox/mark-all-read")
async def mark_all_read(
    mailbox_id: int | None = None,
    db: AsyncSession = Depends(get_db),
    _user: str = Depends(require_auth),
):
    from sqlalchemy import update

    stmt = update(MailboxEmail).where(MailboxEmail.is_read == False).values(is_read=True)
    if mailbox_id is not None:
        stmt = stmt.where(MailboxEmail.mailbox_id == mailbox_id)
    result = await db.execute(stmt)
    await db.commit()
    return {"marked": result.rowcount}


# --- Serve frontend static files ---

frontend_dist = Path(__file__).parent.parent / "frontend" / "dist"
if frontend_dist.exists():
    app.mount("/assets", StaticFiles(directory=frontend_dist / "assets"), name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        file_path = frontend_dist / full_path
        if file_path.exists() and file_path.is_file():
            return FileResponse(file_path)
        return FileResponse(frontend_dist / "index.html")
