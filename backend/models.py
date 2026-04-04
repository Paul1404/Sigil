import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class MailboxConfig(Base):
    __tablename__ = "mailbox_configs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(255))
    imap_host: Mapped[str] = mapped_column(String(255))
    imap_port: Mapped[int] = mapped_column(Integer, default=993)
    username: Mapped[str] = mapped_column(String(255))
    encrypted_password: Mapped[str] = mapped_column(Text)
    folder: Mapped[str] = mapped_column(String(255), default="INBOX")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    last_fetched_at: Mapped[datetime.datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    reports: Mapped[list["DmarcReport"]] = relationship(
        back_populates="mailbox", cascade="all, delete-orphan"
    )


class DmarcReport(Base):
    __tablename__ = "dmarc_reports"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    mailbox_id: Mapped[int] = mapped_column(ForeignKey("mailbox_configs.id"))
    org_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    report_id_str: Mapped[str] = mapped_column(String(255), unique=True)
    domain: Mapped[str] = mapped_column(String(255), index=True)
    date_range_begin: Mapped[datetime.datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    date_range_end: Mapped[datetime.datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    policy_domain: Mapped[str | None] = mapped_column(String(255), nullable=True)
    policy_adkim: Mapped[str | None] = mapped_column(String(10), nullable=True)
    policy_aspf: Mapped[str | None] = mapped_column(String(10), nullable=True)
    policy_p: Mapped[str | None] = mapped_column(String(20), nullable=True)
    policy_sp: Mapped[str | None] = mapped_column(String(20), nullable=True)
    policy_pct: Mapped[int | None] = mapped_column(Integer, nullable=True)
    email_subject: Mapped[str | None] = mapped_column(Text, nullable=True)
    email_date: Mapped[datetime.datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    mailbox: Mapped["MailboxConfig"] = relationship(back_populates="reports")
    records: Mapped[list["DmarcRecord"]] = relationship(
        back_populates="report", cascade="all, delete-orphan"
    )


class DmarcRecord(Base):
    __tablename__ = "dmarc_records"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    report_id: Mapped[int] = mapped_column(ForeignKey("dmarc_reports.id"))
    source_ip: Mapped[str] = mapped_column(String(45))
    count: Mapped[int] = mapped_column(Integer)
    disposition: Mapped[str | None] = mapped_column(String(20), nullable=True)
    dkim_domain: Mapped[str | None] = mapped_column(String(255), nullable=True)
    dkim_result: Mapped[str | None] = mapped_column(String(20), nullable=True)
    dkim_alignment: Mapped[str | None] = mapped_column(String(20), nullable=True)
    spf_domain: Mapped[str | None] = mapped_column(String(255), nullable=True)
    spf_result: Mapped[str | None] = mapped_column(String(20), nullable=True)
    spf_alignment: Mapped[str | None] = mapped_column(String(20), nullable=True)
    envelope_from: Mapped[str | None] = mapped_column(String(255), nullable=True)
    header_from: Mapped[str | None] = mapped_column(String(255), nullable=True)

    report: Mapped["DmarcReport"] = relationship(back_populates="records")
