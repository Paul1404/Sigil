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
    dkim_results_json: list[dict] | None = None
    spf_results_json: list[dict] | None = None
    state: str | None = None  # aligned | misaligned_legitimate | rejected_spoof | ignored | unknown_failure


class StateCountsResponse(BaseModel):
    aligned: int = 0
    misaligned_legitimate: int = 0
    rejected_spoof: int = 0
    ignored: int = 0
    unknown_failure: int = 0
    health_rate: float = 0.0
    total_messages: int = 0


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
    pass_rate: float = 0.0  # legacy: dkim or spf aligned, undifferentiated
    counts: StateCountsResponse = StateCountsResponse()


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
    overall_pass_rate: float  # legacy: dkim or spf aligned, undifferentiated
    last_report_date: datetime | None
    top_senders: list[dict]
    counts: StateCountsResponse = StateCountsResponse()


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
    warnings: list[str] = []
    recommendations: list[str] = []
    parsed: dict | None = None  # Structured breakdown of record fields


class DnsCheckResponse(BaseModel):
    domain: str
    results: list[DnsCheckResult]


# --- TLS Reports (RFC 8460) ---


class TlsReportSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    mailbox_id: int
    report_id_str: str
    org_name: str | None
    date_range_begin: datetime | None
    date_range_end: datetime | None
    policy_type: str | None
    policy_domain: str | None
    mx_host: str | None
    total_success: int
    total_failure: int
    failure_details_json: list[dict] | None = None
    created_at: datetime


class TlsDomainSummary(BaseModel):
    domain: str
    total_success: int
    total_failure: int
    report_count: int
    success_rate: float
    latest_report: datetime | None


# --- Inbox (non-DMARC emails) ---


class MailboxEmailSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    mailbox_id: int
    from_address: str | None
    to_address: str | None
    subject: str | None
    date: datetime | None
    is_read: bool
    created_at: datetime


class MailboxEmailDetail(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    mailbox_id: int
    message_id: str | None
    from_address: str | None
    to_address: str | None
    subject: str | None
    date: datetime | None
    body_text: str | None
    body_html: str | None
    is_read: bool
    created_at: datetime


# --- Source classifications ---


class SourceClassificationCreate(BaseModel):
    policy_domain: str
    match_type: str  # "domain" | "source_ip" | "header_from" | "envelope_from"
    match_value: str
    classification: str  # "trusted" | "unauthorized" | "ignored"
    notes: str | None = None


class SourceClassificationUpdate(BaseModel):
    classification: str | None = None
    notes: str | None = None


class SourceClassificationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    policy_domain: str
    match_type: str
    match_value: str
    classification: str
    notes: str | None
    created_at: datetime
    updated_at: datetime


class DomainHealthSummary(BaseModel):
    domain: str
    counts: StateCountsResponse
    report_count: int
    is_ignored: bool = False  # whole-domain ignored classification


class TriageItem(BaseModel):
    """One unclassified failing source, aggregated across every report it
    appears in. One classification on this item dispositions every record."""

    source_ip: str
    policy_domain: str
    domain: str
    header_from: list[str]
    envelope_from: list[str]
    dkim_results: list[str]
    spf_results: list[str]
    dispositions: list[str]
    total_count: int
    report_count: int
    first_seen: datetime | None
    last_seen: datetime | None


# --- Fetch ---


class FetchResult(BaseModel):
    status: str
    message: str
    reports_found: int = 0
    tls_reports_found: int = 0
    emails_found: int = 0
