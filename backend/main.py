import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from sqlalchemy import select, func, case, distinct
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from config import settings
from database import get_db
from dns_checker import run_all_checks
from encryption import encrypt_password
from imap_fetcher import fetch_mailbox
from models import DmarcRecord, DmarcReport, MailboxConfig
from scheduler import start_scheduler, stop_scheduler
from schemas import (
    DashboardStats,
    DmarcRecordResponse,
    DmarcReportDetail,
    DmarcReportSummary,
    DnsCheckRequest,
    DnsCheckResponse,
    FetchResult,
    MailboxCreate,
    MailboxResponse,
    MailboxUpdate,
    TimelinePoint,
)

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


# --- Health ---


@app.get("/api/health")
async def health():
    return {"status": "ok"}


# --- Dashboard ---


@app.get("/api/dashboard/stats", response_model=DashboardStats)
async def dashboard_stats(db: AsyncSession = Depends(get_db)):
    # Total reports
    total_reports = (await db.execute(func.count(DmarcReport.id))).scalar() or 0

    # Unique domains
    total_domains = (
        await db.execute(select(func.count(distinct(DmarcReport.domain))))
    ).scalar() or 0

    # Total messages and pass rate
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
    passed = row.passed_messages
    overall_pass_rate = (passed / total_messages * 100) if total_messages > 0 else 0.0

    # Last report date
    last_report_date = (
        await db.execute(select(func.max(DmarcReport.date_range_end)))
    ).scalar()

    # Top senders (by message count)
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
    )


@app.get("/api/dashboard/timeline", response_model=list[TimelinePoint])
async def dashboard_timeline(db: AsyncSession = Depends(get_db)):
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

    summaries = []
    for r in reports:
        total = sum(rec.count for rec in r.records)
        passed = sum(
            rec.count
            for rec in r.records
            if rec.dkim_alignment == "pass" or rec.spf_alignment == "pass"
        )
        rate = round(passed / total * 100, 1) if total > 0 else 0.0
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
            )
        )
    return summaries


@app.get("/api/reports/{report_id}", response_model=DmarcReportDetail)
async def get_report(report_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(DmarcReport)
        .options(selectinload(DmarcReport.records))
        .where(DmarcReport.id == report_id)
    )
    report = result.scalar_one_or_none()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    return report


# --- DNS ---


@app.post("/api/dns/check", response_model=DnsCheckResponse)
async def dns_check(req: DnsCheckRequest):
    results = run_all_checks(req.domain, req.dkim_selector)
    return DnsCheckResponse(domain=req.domain, results=results)


# --- Mailboxes ---


@app.get("/api/mailboxes", response_model=list[MailboxResponse])
async def list_mailboxes(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(MailboxConfig).order_by(MailboxConfig.created_at.desc())
    )
    return result.scalars().all()


@app.post("/api/mailboxes", response_model=MailboxResponse, status_code=201)
async def create_mailbox(data: MailboxCreate, db: AsyncSession = Depends(get_db)):
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
    mailbox_id: int, data: MailboxUpdate, db: AsyncSession = Depends(get_db)
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
async def delete_mailbox(mailbox_id: int, db: AsyncSession = Depends(get_db)):
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
async def trigger_fetch(mailbox_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(MailboxConfig).where(MailboxConfig.id == mailbox_id)
    )
    mailbox = result.scalar_one_or_none()
    if not mailbox:
        raise HTTPException(status_code=404, detail="Mailbox not found")

    fetch_result = await fetch_mailbox(mailbox, db)
    return FetchResult(**fetch_result)


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
