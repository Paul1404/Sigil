import logging

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from sqlalchemy import select

from database import async_session
from imap_fetcher import fetch_mailbox
from models import MailboxConfig

logger = logging.getLogger(__name__)

scheduler = AsyncIOScheduler()


async def fetch_all_mailboxes():
    logger.info("Scheduled fetch: starting")
    async with async_session() as db:
        result = await db.execute(
            select(MailboxConfig).where(MailboxConfig.is_active.is_(True))
        )
        mailboxes = result.scalars().all()
        for mailbox in mailboxes:
            try:
                res = await fetch_mailbox(mailbox, db)
                logger.info(
                    "Fetched mailbox %s: %s (%d reports)",
                    mailbox.name,
                    res["status"],
                    res["reports_found"],
                )
            except Exception:
                logger.exception("Error fetching mailbox %s", mailbox.name)


def start_scheduler(interval_hours: int = 6):
    scheduler.add_job(
        fetch_all_mailboxes,
        "interval",
        hours=interval_hours,
        id="fetch_all_mailboxes",
        replace_existing=True,
    )
    scheduler.start()
    logger.info("Scheduler started with %d-hour interval", interval_hours)


def stop_scheduler():
    scheduler.shutdown(wait=False)
    logger.info("Scheduler stopped")
