import gzip
import io
import xml.etree.ElementTree as ET
import zipfile
from datetime import datetime, timezone
from dataclasses import dataclass, field


@dataclass
class AuthResult:
    domain: str | None = None
    result: str | None = None
    selector: str | None = None  # DKIM only
    scope: str | None = None     # SPF only


@dataclass
class ParsedRecord:
    source_ip: str = ""
    count: int = 0
    disposition: str | None = None
    dkim_domain: str | None = None
    dkim_result: str | None = None
    dkim_alignment: str | None = None
    spf_domain: str | None = None
    spf_result: str | None = None
    spf_alignment: str | None = None
    envelope_from: str | None = None
    header_from: str | None = None
    # RFC 7489: multiple auth results per record
    dkim_results: list[AuthResult] = field(default_factory=list)
    spf_results: list[AuthResult] = field(default_factory=list)


@dataclass
class ParsedReport:
    org_name: str | None = None
    email: str | None = None
    report_id: str = ""
    domain: str = ""
    date_range_begin: datetime | None = None
    date_range_end: datetime | None = None
    policy_domain: str | None = None
    policy_adkim: str | None = None
    policy_aspf: str | None = None
    policy_p: str | None = None
    policy_sp: str | None = None
    policy_pct: int | None = None
    records: list[ParsedRecord] = field(default_factory=list)


def _text(element: ET.Element | None, tag: str) -> str | None:
    if element is None:
        return None
    child = element.find(tag)
    return child.text.strip() if child is not None and child.text else None


def _int(element: ET.Element | None, tag: str) -> int | None:
    val = _text(element, tag)
    if val is not None:
        try:
            return int(val)
        except ValueError:
            return None
    return None


def _ts_to_dt(ts_str: str | None) -> datetime | None:
    if ts_str is None:
        return None
    try:
        return datetime.fromtimestamp(int(ts_str), tz=timezone.utc)
    except (ValueError, OSError):
        return None


def parse_dmarc_xml(xml_bytes: bytes) -> ParsedReport:
    root = ET.fromstring(xml_bytes)

    report = ParsedReport()

    # Report metadata
    meta = root.find("report_metadata")
    report.org_name = _text(meta, "org_name")
    report.email = _text(meta, "email")
    report.report_id = _text(meta, "report_id") or ""
    date_range = meta.find("date_range") if meta is not None else None
    report.date_range_begin = _ts_to_dt(_text(date_range, "begin"))
    report.date_range_end = _ts_to_dt(_text(date_range, "end"))

    # Policy published
    policy = root.find("policy_published")
    report.policy_domain = _text(policy, "domain")
    report.domain = report.policy_domain or ""
    report.policy_adkim = _text(policy, "adkim")
    report.policy_aspf = _text(policy, "aspf")
    report.policy_p = _text(policy, "p")
    report.policy_sp = _text(policy, "sp")
    report.policy_pct = _int(policy, "pct")

    # Records
    for record_el in root.findall("record"):
        rec = ParsedRecord()
        row = record_el.find("row")
        rec.source_ip = _text(row, "source_ip") or ""
        rec.count = _int(row, "count") or 0
        policy_eval = row.find("policy_evaluated") if row is not None else None
        rec.disposition = _text(policy_eval, "disposition")
        rec.dkim_alignment = _text(policy_eval, "dkim")
        rec.spf_alignment = _text(policy_eval, "spf")

        identifiers = record_el.find("identifiers")
        rec.envelope_from = _text(identifiers, "envelope_from")
        rec.header_from = _text(identifiers, "header_from")

        # Auth results — RFC 7489 allows multiple DKIM and SPF entries
        auth = record_el.find("auth_results")
        if auth is not None:
            # Parse ALL dkim results
            for dkim_el in auth.findall("dkim"):
                ar = AuthResult(
                    domain=_text(dkim_el, "domain") if dkim_el.find("domain") is not None else (dkim_el.findtext("domain") if hasattr(dkim_el, "findtext") else None),
                    result=_text(dkim_el, "result") if dkim_el.find("result") is not None else None,
                    selector=_text(dkim_el, "selector") if dkim_el.find("selector") is not None else None,
                )
                # Use direct child text if the element itself has domain/result attrs
                if ar.domain is None and dkim_el.find("domain") is not None:
                    ar.domain = dkim_el.find("domain").text
                if ar.result is None and dkim_el.find("result") is not None:
                    ar.result = dkim_el.find("result").text
                rec.dkim_results.append(ar)

            # Parse ALL spf results
            for spf_el in auth.findall("spf"):
                ar = AuthResult(
                    domain=_text(spf_el, "domain") if spf_el.find("domain") is not None else None,
                    result=_text(spf_el, "result") if spf_el.find("result") is not None else None,
                    scope=_text(spf_el, "scope") if spf_el.find("scope") is not None else None,
                )
                rec.spf_results.append(ar)

            # Backward compat: populate flat fields from first result
            if rec.dkim_results:
                rec.dkim_domain = rec.dkim_results[0].domain
                rec.dkim_result = rec.dkim_results[0].result
            else:
                # Fallback to old single-element parsing
                dkim = auth.find("dkim")
                rec.dkim_domain = _text(dkim, "domain")
                rec.dkim_result = _text(dkim, "result")

            if rec.spf_results:
                rec.spf_domain = rec.spf_results[0].domain
                rec.spf_result = rec.spf_results[0].result
            else:
                spf = auth.find("spf")
                rec.spf_domain = _text(spf, "domain")
                rec.spf_result = _text(spf, "result")

        report.records.append(rec)

    return report


def extract_and_parse(filename: str, data: bytes) -> ParsedReport | None:
    lower = filename.lower()
    try:
        if lower.endswith(".xml.gz") or lower.endswith(".gz"):
            xml_bytes = gzip.decompress(data)
            return parse_dmarc_xml(xml_bytes)
        elif lower.endswith(".zip"):
            with zipfile.ZipFile(io.BytesIO(data)) as zf:
                for name in zf.namelist():
                    if name.lower().endswith(".xml"):
                        xml_bytes = zf.read(name)
                        return parse_dmarc_xml(xml_bytes)
            return None
        elif lower.endswith(".xml"):
            return parse_dmarc_xml(data)
        else:
            return None
    except Exception:
        return None
