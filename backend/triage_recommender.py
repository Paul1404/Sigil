"""Explainable, read-only recommendations for DMARC source triage.

SPF is evaluated against current DNS. That is useful evidence, but not proof of
what was published when an older aggregate report was generated. Recommendations
therefore always retain the user confirmation step and surface that limitation.
"""

from __future__ import annotations

import ipaddress
import threading
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Callable, Iterable

import dns.exception
import dns.resolver


SPF_DNS_LOOKUP_LIMIT = 10


@dataclass(frozen=True)
class SpfEvaluation:
    result: str
    domain: str
    record: str | None = None
    detail: str | None = None


@dataclass(frozen=True)
class Recommendation:
    action: str
    confidence: str
    title: str
    reasons: list[str]
    caveats: list[str]
    checked_at: datetime
    spf_domain: str
    spf_result: str


Resolver = Callable[[str, str], list[str]]


def _default_resolver(name: str, rdtype: str) -> list[str]:
    answers = dns.resolver.resolve(name, rdtype, lifetime=4.0)
    if rdtype == "TXT":
        return [
            b"".join(answer.strings).decode("utf-8", errors="replace")
            for answer in answers
        ]
    if rdtype == "MX":
        return [str(answer.exchange).rstrip(".") for answer in answers]
    return [str(answer).rstrip(".") for answer in answers]


class _SpfEvaluator:
    def __init__(self, source_ip: str, resolver: Resolver):
        self.ip = ipaddress.ip_address(source_ip)
        self.resolver = resolver
        self.lookups = 0
        self.stack: set[str] = set()

    def _query(self, name: str, rdtype: str) -> tuple[str, list[str]]:
        try:
            return "ok", self.resolver(name, rdtype)
        except (dns.resolver.NXDOMAIN, dns.resolver.NoAnswer):
            return "none", []
        except (dns.resolver.Timeout, dns.exception.Timeout):
            return "temperror", []
        except Exception:
            return "temperror", []

    def _consume_lookup(self, domain: str) -> SpfEvaluation | None:
        self.lookups += 1
        if self.lookups > SPF_DNS_LOOKUP_LIMIT:
            return SpfEvaluation("permerror", domain, detail="SPF DNS lookup limit exceeded")
        return None

    def evaluate(self, domain: str) -> SpfEvaluation:
        domain = domain.lower().rstrip(".")
        if not domain or "%" in domain:
            return SpfEvaluation("unknown", domain, detail="Unsupported SPF macro")
        if domain in self.stack:
            return SpfEvaluation("permerror", domain, detail="Recursive SPF include")

        self.stack.add(domain)
        try:
            status, txt_records = self._query(domain, "TXT")
            if status != "ok":
                return SpfEvaluation(status, domain)
            records = [r for r in txt_records if r.lower().startswith("v=spf1")]
            if not records:
                return SpfEvaluation("none", domain)
            if len(records) != 1:
                return SpfEvaluation("permerror", domain, detail="Multiple SPF records")

            record = records[0]
            redirect: str | None = None
            for raw_term in record.split()[1:]:
                if "=" in raw_term and not raw_term.startswith(("+", "-", "~", "?")):
                    key, value = raw_term.split("=", 1)
                    if key.lower() == "redirect":
                        redirect = value
                    continue

                qualifier = "+"
                term = raw_term
                if term[:1] in "+-~?":
                    qualifier, term = term[0], term[1:]
                match = self._mechanism_matches(term, domain)
                if isinstance(match, SpfEvaluation):
                    return SpfEvaluation(match.result, domain, record, match.detail)
                if match:
                    result = {"+": "pass", "-": "fail", "~": "softfail", "?": "neutral"}[qualifier]
                    return SpfEvaluation(result, domain, record)

            if redirect:
                if error := self._consume_lookup(domain):
                    return SpfEvaluation(error.result, domain, record, error.detail)
                redirected = self.evaluate(redirect)
                if redirected.result == "none":
                    return SpfEvaluation(
                        "permerror", domain, record, "Redirected domain has no SPF record"
                    )
                return SpfEvaluation(redirected.result, domain, record, redirected.detail)
            return SpfEvaluation("neutral", domain, record)
        finally:
            self.stack.discard(domain)

    def _mechanism_matches(self, term: str, current_domain: str) -> bool | SpfEvaluation:
        lower = term.lower()
        if lower == "all":
            return True
        if lower.startswith("ip4:") or lower.startswith("ip6:"):
            try:
                return self.ip in ipaddress.ip_network(term.split(":", 1)[1], strict=False)
            except ValueError:
                return SpfEvaluation("permerror", current_domain, detail="Invalid SPF IP network")
        if lower.startswith("include:"):
            if error := self._consume_lookup(current_domain):
                return error
            included = self.evaluate(term.split(":", 1)[1])
            if included.result == "pass":
                return True
            if included.result == "none":
                return SpfEvaluation(
                    "permerror", current_domain, detail="Included domain has no SPF record"
                )
            if included.result in {"temperror", "permerror", "unknown"}:
                return included
            return False
        if lower == "a" or lower.startswith("a:") or lower.startswith("a/"):
            if error := self._consume_lookup(current_domain):
                return error
            return self._address_mechanism(term, current_domain)
        if lower == "mx" or lower.startswith("mx:") or lower.startswith("mx/"):
            if error := self._consume_lookup(current_domain):
                return error
            return self._mx_mechanism(term, current_domain)
        if lower.startswith(("exists:", "ptr")) or "%" in term:
            if error := self._consume_lookup(current_domain):
                return error
            return SpfEvaluation("unknown", current_domain, detail=f"Unsupported SPF mechanism: {term}")
        return SpfEvaluation("permerror", current_domain, detail=f"Invalid SPF mechanism: {term}")

    def _target_and_prefix(self, term: str, current_domain: str) -> tuple[str, int | None]:
        parts = term.split("/")
        if len(parts) > 3:
            raise ValueError("too many CIDR lengths")
        base = parts[0]
        _, colon, target = base.partition(":")
        domain = target if colon else current_domain
        prefix_text = None
        if self.ip.version == 4 and len(parts) >= 2:
            prefix_text = parts[1]
        elif self.ip.version == 6 and len(parts) == 3:
            prefix_text = parts[2]
        if prefix_text == "":
            prefix_text = None
        if prefix_text is not None and not prefix_text.isdigit():
            raise ValueError("invalid CIDR length")
        prefix = int(prefix_text) if prefix_text is not None else None
        return domain.lower().rstrip("."), prefix

    def _addresses_match(self, domain: str, prefix: int | None) -> bool | SpfEvaluation:
        rdtype = "A" if self.ip.version == 4 else "AAAA"
        status, values = self._query(domain, rdtype)
        if status == "none":
            return False
        if status != "ok":
            return SpfEvaluation(status, domain)
        bits = prefix if prefix is not None else self.ip.max_prefixlen
        try:
            return any(
                self.ip in ipaddress.ip_network(f"{value}/{bits}", strict=False)
                for value in values
            )
        except ValueError:
            return SpfEvaluation("temperror", domain, detail="Invalid DNS address response")

    def _address_mechanism(self, term: str, current_domain: str) -> bool | SpfEvaluation:
        try:
            domain, prefix = self._target_and_prefix(term, current_domain)
        except ValueError:
            return SpfEvaluation("permerror", current_domain, detail="Invalid SPF CIDR length")
        return self._addresses_match(domain, prefix)

    def _mx_mechanism(self, term: str, current_domain: str) -> bool | SpfEvaluation:
        try:
            domain, prefix = self._target_and_prefix(term, current_domain)
        except ValueError:
            return SpfEvaluation("permerror", current_domain, detail="Invalid SPF CIDR length")
        status, hosts = self._query(domain, "MX")
        if status == "none":
            return False
        if status != "ok":
            return SpfEvaluation(status, domain)
        for host in hosts:
            matched = self._addresses_match(host, prefix)
            if isinstance(matched, SpfEvaluation):
                return matched
            if matched:
                return True
        return False


def evaluate_spf(source_ip: str, domain: str, resolver: Resolver | None = None) -> SpfEvaluation:
    """Evaluate an IP against a domain's current SPF policy conservatively."""
    try:
        return _SpfEvaluator(source_ip, resolver or _default_resolver).evaluate(domain)
    except ValueError:
        return SpfEvaluation("unknown", domain, detail="Invalid source IP")


_cache_lock = threading.Lock()
_spf_cache: dict[tuple[str, str], tuple[float, SpfEvaluation]] = {}
_CACHE_TTL_SECONDS = 300


def evaluate_spf_cached(source_ip: str, domain: str) -> SpfEvaluation:
    key = (source_ip, domain.lower().rstrip("."))
    now = time.monotonic()
    with _cache_lock:
        cached = _spf_cache.get(key)
        if cached and now - cached[0] < _CACHE_TTL_SECONDS:
            return cached[1]
    result = evaluate_spf(source_ip, domain)
    with _cache_lock:
        _spf_cache[key] = (now, result)
    return result


def build_recommendation(
    *,
    source_ip: str,
    policy_domain: str,
    header_from: Iterable[str],
    envelope_from: Iterable[str],
    dkim_results: Iterable[str],
    spf_results: Iterable[str],
    dkim_alignment_results: Iterable[str] = (),
    spf_alignment_results: Iterable[str] = (),
    dispositions: Iterable[str],
    evaluation: SpfEvaluation,
    checked_at: datetime | None = None,
) -> Recommendation:
    """Combine current SPF evidence with the aggregate report's recorded facts."""
    header_domains = {value.lower().rstrip(".") for value in header_from if value}
    envelope_domains = {value.lower().rstrip(".") for value in envelope_from if value}
    dkim_alignment = {value.lower() for value in dkim_alignment_results if value}
    spf_alignment = {value.lower() for value in spf_alignment_results if value}
    dispositions_set = {value.lower() for value in dispositions if value}
    policy = policy_domain.lower().rstrip(".")

    header_matches = header_domains == {policy}
    alignment_results = dkim_alignment | spf_alignment
    report_auth_failed = bool(alignment_results) and "pass" not in alignment_results
    enforced = bool(dispositions_set & {"quarantine", "reject"})
    reasons: list[str] = []
    caveats = ["Current DNS was checked now, not at the report date."]
    if not envelope_domains:
        caveats.append("The report has no Envelope From identity; the policy domain was checked instead.")
    elif policy not in envelope_domains:
        caveats.append("The reported Envelope From differs from the policy domain checked here.")

    if evaluation.result == "pass":
        reasons.append(f"Current SPF for {policy} authorizes {source_ip}.")
        if header_matches:
            reasons.append("Header From matches the protected policy domain.")
        if report_auth_failed:
            caveats.append("The report itself recorded no aligned SPF or DKIM result.")
        return Recommendation(
            action="trusted",
            confidence="medium" if header_matches else "low",
            title="Likely trusted sender",
            reasons=reasons,
            caveats=caveats,
            checked_at=checked_at or datetime.now(timezone.utc),
            spf_domain=policy,
            spf_result=evaluation.result,
        )

    if evaluation.result in {"fail", "softfail", "neutral", "none"}:
        reasons.append(f"Current SPF for {policy} does not authorize {source_ip} ({evaluation.result}).")
        if report_auth_failed:
            reasons.append("The report recorded no aligned SPF or DKIM result.")
        if enforced:
            reasons.append("DMARC quarantined or rejected the messages.")
        confidence = "high" if header_matches and report_auth_failed and enforced else "medium"
        return Recommendation(
            action="unauthorized",
            confidence=confidence,
            title="Likely unauthorized source",
            reasons=reasons,
            caveats=caveats,
            checked_at=checked_at or datetime.now(timezone.utc),
            spf_domain=policy,
            spf_result=evaluation.result,
        )

    reasons.append("Current SPF could not be evaluated safely.")
    if evaluation.detail:
        caveats.append(evaluation.detail)
    return Recommendation(
        action="review",
        confidence="low",
        title="Manual review recommended",
        reasons=reasons,
        caveats=caveats,
        checked_at=checked_at or datetime.now(timezone.utc),
        spf_domain=policy,
        spf_result=evaluation.result,
    )
