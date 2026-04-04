"""Parse SMTP TLS-RPT reports (RFC 8460).

TLS reports are JSON documents sent by receiving mail servers to report
on TLS connection success/failure when delivering to your domains.
"""

from __future__ import annotations

import gzip
import json
import zipfile
import io
from dataclasses import dataclass, field
from datetime import datetime, timezone


@dataclass
class TlsPolicyResult:
    policy_type: str | None = None
    policy_domain: str | None = None
    policy_strings: list[str] = field(default_factory=list)
    mx_host: str | None = None
    total_success: int = 0
    total_failure: int = 0
    failure_details: list[dict] = field(default_factory=list)


@dataclass
class ParsedTlsReport:
    org_name: str | None = None
    report_id: str | None = None
    date_range_begin: datetime | None = None
    date_range_end: datetime | None = None
    contact_info: str | None = None
    policies: list[TlsPolicyResult] = field(default_factory=list)


def parse_tls_report_json(data: dict) -> ParsedTlsReport | None:
    """Parse a TLS-RPT JSON object into a ParsedTlsReport."""
    try:
        report = ParsedTlsReport()
        report.org_name = data.get("organization-name")
        report.report_id = data.get("report-id")
        report.contact_info = data.get("contact-info")

        date_range = data.get("date-range", {})
        if date_range.get("start-datetime"):
            report.date_range_begin = _parse_datetime(date_range["start-datetime"])
        if date_range.get("end-datetime"):
            report.date_range_end = _parse_datetime(date_range["end-datetime"])

        for policy_data in data.get("policies", []):
            policy = TlsPolicyResult()
            policy_obj = policy_data.get("policy", {})
            policy.policy_type = policy_obj.get("policy-type")
            policy.policy_domain = policy_obj.get("policy-domain")
            policy.policy_strings = policy_obj.get("policy-string", [])
            mx_host = policy_obj.get("mx-host")
            if isinstance(mx_host, list):
                mx_host = mx_host[0] if mx_host else None
            policy.mx_host = mx_host

            summary = policy_data.get("summary", {})
            policy.total_success = summary.get("total-successful-session-count", 0)
            policy.total_failure = summary.get("total-failure-session-count", 0)

            for fd in policy_data.get("failure-details", []):
                policy.failure_details.append(fd)

            report.policies.append(policy)

        return report
    except Exception:
        return None


def extract_and_parse_tls(filename: str, payload: bytes) -> ParsedTlsReport | None:
    """Try to extract and parse a TLS report from an attachment."""
    lower = filename.lower()
    raw_json = None

    try:
        if lower.endswith(".json.gz") or lower.endswith(".gz"):
            raw_json = gzip.decompress(payload)
        elif lower.endswith(".zip"):
            with zipfile.ZipFile(io.BytesIO(payload)) as zf:
                for name in zf.namelist():
                    if name.lower().endswith(".json"):
                        raw_json = zf.read(name)
                        break
        elif lower.endswith(".json"):
            raw_json = payload
        else:
            return None
    except Exception:
        return None

    if not raw_json:
        return None

    try:
        data = json.loads(raw_json)
    except (json.JSONDecodeError, UnicodeDecodeError):
        return None

    # Validate it looks like a TLS-RPT (must have policies key)
    if not isinstance(data, dict) or "policies" not in data:
        return None

    return parse_tls_report_json(data)


def _parse_datetime(value: str) -> datetime | None:
    """Parse an RFC 3339 / ISO 8601 datetime string."""
    if not value:
        return None
    try:
        # Handle trailing Z
        value = value.replace("Z", "+00:00")
        return datetime.fromisoformat(value)
    except (ValueError, TypeError):
        return None
