from datetime import datetime

from pydantic import BaseModel, ConfigDict


# --- Mailbox ---


class MailboxCreate(BaseModel):
    name: str
    imap_host: str
    imap_port: int = 993
    username: str
    password: str
    folder: str = "INBOX"


class MailboxUpdate(BaseModel):
    name: str | None = None
    imap_host: str | None = None
    imap_port: int | None = None
    username: str | None = None
    password: str | None = None
    folder: str | None = None
    is_active: bool | None = None


class MailboxResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    imap_host: str
    imap_port: int
    username: str
    folder: str
    is_active: bool
    last_fetched_at: datetime | None
    created_at: datetime
    updated_at: datetime


# --- DMARC Record ---


class DmarcRecordResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    source_ip: str
    count: int
    disposition: str | None
    dkim_domain: str | None
    dkim_result: str | None
    dkim_alignment: str | None
    spf_domain: str | None
    spf_result: str | None
    spf_alignment: str | None
    envelope_from: str | None
    header_from: str | None


# --- DMARC Report ---


class DmarcReportSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    org_name: str | None
    domain: str
    report_id_str: str
    date_range_begin: datetime | None
    date_range_end: datetime | None
    policy_p: str | None
    email_subject: str | None
    email_date: datetime | None
    created_at: datetime
    total_messages: int = 0
    pass_rate: float = 0.0


class DmarcReportDetail(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    mailbox_id: int
    org_name: str | None
    email: str | None
    report_id_str: str
    domain: str
    date_range_begin: datetime | None
    date_range_end: datetime | None
    policy_domain: str | None
    policy_adkim: str | None
    policy_aspf: str | None
    policy_p: str | None
    policy_sp: str | None
    policy_pct: int | None
    email_subject: str | None
    email_date: datetime | None
    created_at: datetime
    records: list[DmarcRecordResponse] = []


# --- Dashboard ---


class DashboardStats(BaseModel):
    total_reports: int
    total_domains: int
    total_messages: int
    overall_pass_rate: float
    last_report_date: datetime | None
    top_senders: list[dict]


class TimelinePoint(BaseModel):
    date: str
    total: int
    passed: int
    failed: int
    pass_rate: float


# --- DNS ---


class DnsCheckRequest(BaseModel):
    domain: str
    dkim_selector: str | None = None


class DnsCheckResult(BaseModel):
    check_type: str
    status: str  # "pass", "warn", "fail"
    value: str | None = None
    details: str | None = None


class DnsCheckResponse(BaseModel):
    domain: str
    results: list[DnsCheckResult]


# --- Fetch ---


class FetchResult(BaseModel):
    status: str
    message: str
    reports_found: int = 0
