import dns.resolver
import dns.rdatatype
import re

from schemas import DnsCheckResult


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _query_txt(name: str, timeout: float = 5.0) -> tuple[str, list[str]]:
    try:
        answers = dns.resolver.resolve(name, "TXT", lifetime=timeout)
        records = []
        for rdata in answers:
            txt = b"".join(rdata.strings).decode("utf-8", errors="replace")
            records.append(txt)
        return "found", records
    except dns.resolver.NXDOMAIN:
        return "nxdomain", []
    except dns.resolver.NoAnswer:
        return "noanswer", []
    except dns.resolver.Timeout:
        return "timeout", []
    except Exception as e:
        return f"error: {e}", []


# ---------------------------------------------------------------------------
# DMARC – RFC 7489
# ---------------------------------------------------------------------------

_DMARC_VALID_TAGS = {"v", "p", "sp", "adkim", "aspf", "pct", "rua", "ruf", "fo", "rf", "ri"}

_DMARC_TAG_DESCRIPTIONS = {
    "v": "Version",
    "p": "Domain policy",
    "sp": "Subdomain policy",
    "adkim": "DKIM alignment mode",
    "aspf": "SPF alignment mode",
    "pct": "Percentage of messages subject to policy",
    "rua": "Aggregate report URIs",
    "ruf": "Forensic report URIs",
    "fo": "Forensic reporting options",
    "rf": "Forensic report format",
    "ri": "Aggregate report interval (seconds)",
}


def _parse_dmarc_tags(record: str) -> dict[str, str]:
    """Parse a DMARC record into tag-value pairs per RFC 7489 s6.3."""
    tags = {}
    for part in record.split(";"):
        part = part.strip()
        if "=" in part:
            key, _, value = part.partition("=")
            tags[key.strip().lower()] = value.strip()
    return tags


def _validate_dmarc(tags: dict[str, str]) -> tuple[list[str], list[str]]:
    """Validate parsed DMARC tags. Returns (warnings, recommendations)."""
    warnings: list[str] = []
    recommendations: list[str] = []

    # RFC 7489 s6.3: v and p are required
    if "v" not in tags:
        warnings.append("Missing required 'v' tag")
    if "p" not in tags:
        warnings.append("Missing required 'p' tag (domain policy)")

    # Policy strength
    p = tags.get("p", "").lower()
    if p == "none":
        warnings.append("Policy is 'none' — no enforcement on failing messages")
        recommendations.append("Move toward p=quarantine or p=reject once monitoring confirms legitimate sources")
    elif p == "quarantine":
        recommendations.append("Consider upgrading to p=reject for maximum protection once confident in alignment")
    elif p not in ("reject", ""):
        warnings.append(f"Unknown policy value '{p}' — must be none, quarantine, or reject")

    # Subdomain policy
    sp = tags.get("sp", "").lower()
    if sp and sp not in ("none", "quarantine", "reject"):
        warnings.append(f"Unknown subdomain policy value '{sp}' — must be none, quarantine, or reject")
    if not sp:
        recommendations.append("Consider setting 'sp' tag to explicitly control subdomain policy (defaults to 'p' value)")

    # Alignment modes (RFC 7489 s6.3)
    for tag_name, label in [("adkim", "DKIM"), ("aspf", "SPF")]:
        val = tags.get(tag_name, "").lower()
        if val and val not in ("r", "s"):
            warnings.append(f"Invalid {label} alignment mode '{val}' — must be 'r' (relaxed) or 's' (strict)")
        if val == "r" or not val:
            recommendations.append(f"Consider strict {label} alignment (adkim=s/aspf=s) for tighter verification")

    # Percentage
    pct = tags.get("pct")
    if pct is not None:
        try:
            pct_int = int(pct)
            if pct_int < 0 or pct_int > 100:
                warnings.append(f"pct={pct} is out of range (must be 0-100)")
            elif pct_int < 100:
                warnings.append(f"Only {pct}% of messages are subject to the policy — consider increasing to 100")
        except ValueError:
            warnings.append(f"pct value '{pct}' is not a valid integer")

    # Aggregate report URI (rua)
    if "rua" not in tags:
        warnings.append("No aggregate report URI (rua) — you will not receive DMARC reports")
        recommendations.append("Add rua=mailto:dmarc-reports@yourdomain.com to receive aggregate reports")

    # Forensic report URI (ruf)
    if "ruf" not in tags:
        recommendations.append("Consider adding ruf=mailto:... to receive forensic (failure) reports")

    # Report interval
    ri = tags.get("ri")
    if ri is not None:
        try:
            ri_int = int(ri)
            if ri_int < 0:
                warnings.append(f"ri={ri} is negative — must be a positive integer (seconds)")
            elif ri_int < 3600:
                warnings.append(f"ri={ri} is unusually low — most receivers send once per day (86400)")
        except ValueError:
            warnings.append(f"ri value '{ri}' is not a valid integer")

    # Unknown tags
    for tag in tags:
        if tag not in _DMARC_VALID_TAGS:
            warnings.append(f"Unknown tag '{tag}' — may be ignored by receivers")

    return warnings, recommendations


def check_dmarc(domain: str) -> DnsCheckResult:
    """Check DMARC record per RFC 7489."""
    name = f"_dmarc.{domain}"
    status, records = _query_txt(name)
    dmarc_records = [r for r in records if r.startswith("v=DMARC1")]

    if len(dmarc_records) > 1:
        # RFC 7489 s6.6.3: multiple DMARC records → discard all
        return DnsCheckResult(
            check_type="DMARC",
            status="fail",
            value="; ".join(dmarc_records[:3]),
            details=f"Multiple DMARC records found at {name} — RFC 7489 requires exactly one; all are discarded",
            warnings=["Multiple DMARC records cause all to be ignored per RFC 7489 Section 6.6.3"],
            recommendations=["Remove duplicate DMARC records so exactly one remains"],
        )

    if dmarc_records:
        raw = dmarc_records[0]
        tags = _parse_dmarc_tags(raw)
        warnings, recommendations = _validate_dmarc(tags)

        # Build human-readable parsed breakdown
        parsed = {}
        for k, v in tags.items():
            desc = _DMARC_TAG_DESCRIPTIONS.get(k, k)
            parsed[k] = {"value": v, "description": desc}

        overall_status = "pass"
        if any("required" in w.lower() or "policy is 'none'" in w.lower() for w in warnings):
            overall_status = "warn"

        return DnsCheckResult(
            check_type="DMARC",
            status=overall_status,
            value=raw,
            details=f"Found DMARC record at {name}",
            warnings=warnings,
            recommendations=recommendations,
            parsed=parsed,
        )

    if status in ("nxdomain", "noanswer"):
        return DnsCheckResult(
            check_type="DMARC",
            status="fail",
            details=f"No DMARC record found at {name}",
            recommendations=["Publish a DMARC record to protect your domain from spoofing"],
        )
    if status == "timeout":
        return DnsCheckResult(
            check_type="DMARC",
            status="warn",
            details=f"DNS timeout querying {name}",
        )
    return DnsCheckResult(
        check_type="DMARC", status="fail", details=f"Error querying {name}: {status}"
    )


# ---------------------------------------------------------------------------
# SPF – RFC 7208
# ---------------------------------------------------------------------------

def _validate_spf(record: str) -> tuple[list[str], list[str]]:
    """Basic SPF validation per RFC 7208."""
    warnings: list[str] = []
    recommendations: list[str] = []

    parts = record.split()

    # Check for +all or ?all (permissive)
    if parts:
        last = parts[-1].lower()
        if last == "+all" or last == "all":
            warnings.append("SPF ends with '+all' — allows any server to send as your domain")
            recommendations.append("Use '-all' (hard fail) or '~all' (soft fail) to restrict senders")
        elif last == "?all":
            warnings.append("SPF ends with '?all' (neutral) — provides no restriction")
            recommendations.append("Use '-all' or '~all' for meaningful enforcement")
        elif last == "~all":
            recommendations.append("Consider '-all' (hard fail) for stricter enforcement once all legitimate senders are listed")

    # Count DNS lookups (RFC 7208 s4.6.4: max 10)
    lookup_mechanisms = {"include", "a", "mx", "ptr", "exists", "redirect"}
    lookup_count = 0
    for part in parts[1:]:  # skip v=spf1
        mechanism = part.lstrip("+-~?").split(":")[0].split("/")[0].lower()
        if mechanism in lookup_mechanisms:
            lookup_count += 1
    if lookup_count > 10:
        warnings.append(f"SPF has {lookup_count} DNS lookup mechanisms — RFC 7208 limit is 10")
    elif lookup_count > 7:
        recommendations.append(f"SPF uses {lookup_count}/10 DNS lookups — consider consolidating to stay under the limit")

    # ptr mechanism deprecated in RFC 7208
    if any(p.lstrip("+-~?").lower().startswith("ptr") for p in parts):
        warnings.append("SPF uses deprecated 'ptr' mechanism — RFC 7208 Section 5.5 recommends against it")

    return warnings, recommendations


def check_spf(domain: str) -> DnsCheckResult:
    """Check SPF record per RFC 7208."""
    status, records = _query_txt(domain)
    spf_records = [r for r in records if r.lower().startswith("v=spf1")]

    if len(spf_records) > 1:
        return DnsCheckResult(
            check_type="SPF",
            status="fail",
            value="; ".join(spf_records[:3]),
            details=f"Multiple SPF records found — RFC 7208 requires exactly one",
            warnings=["Multiple SPF records cause a PermError per RFC 7208 Section 4.5"],
            recommendations=["Merge into a single SPF record"],
        )

    if spf_records:
        raw = spf_records[0]
        warnings, recommendations = _validate_spf(raw)

        overall_status = "pass"
        if warnings:
            overall_status = "warn"

        return DnsCheckResult(
            check_type="SPF",
            status=overall_status,
            value=raw,
            details=f"Found SPF record for {domain}",
            warnings=warnings,
            recommendations=recommendations,
        )

    if status in ("nxdomain", "noanswer", "found"):
        return DnsCheckResult(
            check_type="SPF",
            status="fail",
            details=f"No SPF record found for {domain}",
            recommendations=["Publish an SPF record to declare authorized mail senders"],
        )
    if status == "timeout":
        return DnsCheckResult(
            check_type="SPF",
            status="warn",
            details=f"DNS timeout querying {domain}",
        )
    return DnsCheckResult(
        check_type="SPF",
        status="fail",
        details=f"Error querying {domain}: {status}",
    )


# ---------------------------------------------------------------------------
# DKIM – RFC 6376
# ---------------------------------------------------------------------------

def check_dkim(domain: str, selector: str) -> DnsCheckResult:
    name = f"{selector}._domainkey.{domain}"
    status, records = _query_txt(name)
    if records:
        return DnsCheckResult(
            check_type="DKIM",
            status="pass",
            value=records[0][:200],
            details=f"Found DKIM record at {name}",
        )
    if status in ("nxdomain", "noanswer"):
        return DnsCheckResult(
            check_type="DKIM",
            status="fail",
            details=f"No DKIM record found at {name}",
        )
    if status == "timeout":
        return DnsCheckResult(
            check_type="DKIM",
            status="warn",
            details=f"DNS timeout querying {name}",
        )
    return DnsCheckResult(
        check_type="DKIM", status="fail", details=f"Error querying {name}: {status}"
    )


# ---------------------------------------------------------------------------
# TLSA – RFC 6698 (DANE)
# ---------------------------------------------------------------------------

_TLSA_USAGE = {
    0: ("PKIX-TA", "CA constraint — certificate must chain to specified CA and pass PKIX validation"),
    1: ("PKIX-EE", "Service certificate constraint — must match and pass PKIX validation"),
    2: ("DANE-TA", "Trust anchor assertion — specified CA is trust anchor, no PKIX required"),
    3: ("DANE-EE", "Domain-issued certificate — exact match, no PKIX or CA required"),
}

_TLSA_SELECTOR = {
    0: ("Full certificate", "Match against the full DER-encoded certificate"),
    1: ("SubjectPublicKeyInfo", "Match against the DER-encoded SubjectPublicKeyInfo"),
}

_TLSA_MATCHING_TYPE = {
    0: ("Exact match", "No hashing — full data comparison"),
    1: ("SHA-256", "SHA-256 hash of the selected content"),
    2: ("SHA-512", "SHA-512 hash of the selected content"),
}


def _parse_tlsa_rdata(rdata_str: str) -> dict | None:
    """Parse TLSA rdata string 'usage selector matching_type cert_data' per RFC 6698."""
    parts = rdata_str.split(None, 3)
    if len(parts) < 4:
        return None
    try:
        usage = int(parts[0])
        selector = int(parts[1])
        matching_type = int(parts[2])
    except ValueError:
        return None

    cert_data = parts[3].replace(" ", "")
    usage_info = _TLSA_USAGE.get(usage, (f"Unknown ({usage})", "Not defined in RFC 6698"))
    selector_info = _TLSA_SELECTOR.get(selector, (f"Unknown ({selector})", "Not defined in RFC 6698"))
    matching_info = _TLSA_MATCHING_TYPE.get(matching_type, (f"Unknown ({matching_type})", "Not defined in RFC 6698"))

    return {
        "usage": {"value": usage, "name": usage_info[0], "description": usage_info[1]},
        "selector": {"value": selector, "name": selector_info[0], "description": selector_info[1]},
        "matching_type": {"value": matching_type, "name": matching_info[0], "description": matching_info[1]},
        "cert_data_preview": cert_data[:64] + ("..." if len(cert_data) > 64 else ""),
        "cert_data_length": len(cert_data),
    }


def _validate_tlsa(parsed: dict) -> tuple[list[str], list[str]]:
    """Validate parsed TLSA fields per RFC 6698."""
    warnings: list[str] = []
    recommendations: list[str] = []

    usage = parsed["usage"]["value"]
    selector = parsed["selector"]["value"]
    matching_type = parsed["matching_type"]["value"]

    # Usage field validation (0-3 per RFC 6698 s2.1.1)
    if usage not in (0, 1, 2, 3):
        warnings.append(f"Certificate usage field {usage} is not defined in RFC 6698 (valid: 0-3)")

    # Selector validation (0-1 per RFC 6698 s2.1.2)
    if selector not in (0, 1):
        warnings.append(f"Selector field {selector} is not defined in RFC 6698 (valid: 0-1)")

    # Matching type validation (0-2 per RFC 6698 s2.1.3)
    if matching_type not in (0, 1, 2):
        warnings.append(f"Matching type {matching_type} is not defined in RFC 6698 (valid: 0-2)")

    # RFC 7672 (SMTP DANE) recommends DANE-EE(3) + SPKI(1) + SHA-256(1) for SMTP
    if usage == 3 and selector == 1 and matching_type == 1:
        pass  # Ideal for SMTP per RFC 7672
    elif usage == 3:
        if selector == 0:
            recommendations.append("RFC 7672 recommends selector=1 (SPKI) with DANE-EE for easier certificate rotation")
        if matching_type == 0:
            recommendations.append("RFC 7672 recommends SHA-256 (matching_type=1) instead of exact match for DANE-EE")
    elif usage == 2:
        recommendations.append("DANE-TA (usage=2) is valid but DANE-EE (usage=3) is simpler to manage for SMTP")
    elif usage in (0, 1):
        warnings.append(f"PKIX-based usage ({usage}) requires a valid CA chain — DANE-EE (3) or DANE-TA (2) are preferred for SMTP per RFC 7672")

    # Matching type 0 (exact match) with usage 3 exposes full cert — prefer hashing
    if matching_type == 0 and usage in (2, 3):
        recommendations.append("Consider using SHA-256 (1) or SHA-512 (2) matching instead of exact match to reduce record size")

    # Verify hash length looks correct
    cert_len = parsed["cert_data_length"]
    if matching_type == 1 and cert_len != 64:
        warnings.append(f"SHA-256 hash should be 64 hex chars, got {cert_len}")
    elif matching_type == 2 and cert_len != 128:
        warnings.append(f"SHA-512 hash should be 128 hex chars, got {cert_len}")

    return warnings, recommendations


def check_tlsa(domain: str) -> list[DnsCheckResult]:
    """Check TLSA records for all MX hosts per RFC 6698 / RFC 7672."""
    results = []
    try:
        mx_answers = dns.resolver.resolve(domain, "MX", lifetime=5.0)
        mx_hosts = sorted(
            [(r.preference, str(r.exchange).rstrip(".")) for r in mx_answers],
            key=lambda x: x[0],
        )
    except Exception:
        return [
            DnsCheckResult(
                check_type="TLSA",
                status="warn",
                details=f"Could not resolve MX records for {domain}",
                recommendations=["Ensure MX records are published for the domain"],
            )
        ]

    for pref, mx in mx_hosts[:5]:
        name = f"_25._tcp.{mx}"
        try:
            answers = dns.resolver.resolve(name, "TLSA", lifetime=5.0)
            tlsa_records = [str(r) for r in answers]

            all_parsed = []
            all_warnings = []
            all_recommendations = []

            for tlsa_str in tlsa_records:
                parsed = _parse_tlsa_rdata(tlsa_str)
                if parsed:
                    all_parsed.append(parsed)
                    w, r = _validate_tlsa(parsed)
                    all_warnings.extend(w)
                    all_recommendations.extend(r)

            # Deduplicate
            all_warnings = list(dict.fromkeys(all_warnings))
            all_recommendations = list(dict.fromkeys(all_recommendations))

            display_value = "\n".join(tlsa_records)
            results.append(
                DnsCheckResult(
                    check_type="TLSA",
                    status="pass",
                    value=display_value,
                    details=f"TLSA: {len(tlsa_records)} record(s) for {mx} (priority {pref})",
                    warnings=all_warnings,
                    recommendations=all_recommendations,
                    parsed={"mx_host": mx, "mx_priority": pref, "records": all_parsed},
                )
            )
        except dns.resolver.NXDOMAIN:
            results.append(
                DnsCheckResult(
                    check_type="TLSA",
                    status="fail",
                    details=f"No TLSA record for {mx} (priority {pref})",
                    recommendations=[f"Publish a TLSA record at {name} to enable DANE for this MX"],
                )
            )
        except dns.resolver.NoAnswer:
            results.append(
                DnsCheckResult(
                    check_type="TLSA",
                    status="fail",
                    details=f"No TLSA record for {mx} (priority {pref})",
                    recommendations=[f"Publish a TLSA record at {name} to enable DANE for this MX"],
                )
            )
        except dns.resolver.Timeout:
            results.append(
                DnsCheckResult(
                    check_type="TLSA",
                    status="warn",
                    details=f"DNS timeout querying TLSA for {mx}",
                )
            )
        except Exception as e:
            results.append(
                DnsCheckResult(
                    check_type="TLSA",
                    status="fail",
                    details=f"Error querying TLSA for {mx}: {e}",
                )
            )

    return results if results else [
        DnsCheckResult(
            check_type="TLSA",
            status="warn",
            details="No MX hosts found to check TLSA",
        )
    ]


# ---------------------------------------------------------------------------
# MTA-STS – RFC 8461
# ---------------------------------------------------------------------------

def check_mta_sts(domain: str) -> DnsCheckResult:
    """Check MTA-STS DNS record per RFC 8461."""
    name = f"_mta-sts.{domain}"
    status, records = _query_txt(name)
    sts_records = [r for r in records if r.startswith("v=STSv1")]

    if len(sts_records) > 1:
        return DnsCheckResult(
            check_type="MTA-STS",
            status="fail",
            value="; ".join(sts_records[:3]),
            details=f"Multiple MTA-STS records found at {name}",
            warnings=["Multiple MTA-STS records — receivers should use none"],
        )

    if sts_records:
        raw = sts_records[0]
        tags = {}
        for part in raw.split(";"):
            part = part.strip()
            if "=" in part:
                k, _, v = part.partition("=")
                tags[k.strip().lower()] = v.strip()

        warnings = []
        recommendations = []

        if "id" not in tags:
            warnings.append("Missing required 'id' tag in MTA-STS record")

        parsed = {k: {"value": v} for k, v in tags.items()}

        return DnsCheckResult(
            check_type="MTA-STS",
            status="pass",
            value=raw,
            details=f"Found MTA-STS record at {name}",
            warnings=warnings,
            recommendations=recommendations,
            parsed=parsed,
        )

    if status in ("nxdomain", "noanswer"):
        return DnsCheckResult(
            check_type="MTA-STS",
            status="fail",
            details=f"No MTA-STS record found at {name}",
            recommendations=[
                "Publish an MTA-STS policy to require TLS for inbound SMTP (complements DANE/TLSA)",
                "MTA-STS works even without DNSSEC, unlike DANE",
            ],
        )
    if status == "timeout":
        return DnsCheckResult(
            check_type="MTA-STS",
            status="warn",
            details=f"DNS timeout querying {name}",
        )
    return DnsCheckResult(
        check_type="MTA-STS",
        status="fail",
        details=f"Error querying {name}: {status}",
    )


# ---------------------------------------------------------------------------
# SMTP TLS Reporting – RFC 8460
# ---------------------------------------------------------------------------

def check_tlsrpt(domain: str) -> DnsCheckResult:
    """Check SMTP TLS Reporting record per RFC 8460."""
    name = f"_smtp._tls.{domain}"
    status, records = _query_txt(name)
    rpt_records = [r for r in records if "v=TLSRPTv1" in r]

    if rpt_records:
        raw = rpt_records[0]
        tags = {}
        for part in raw.split(";"):
            part = part.strip()
            if "=" in part:
                k, _, v = part.partition("=")
                tags[k.strip().lower()] = v.strip()

        warnings = []
        if "rua" not in tags:
            warnings.append("Missing required 'rua' tag — no report destination specified")

        parsed = {k: {"value": v} for k, v in tags.items()}

        return DnsCheckResult(
            check_type="TLSRPT",
            status="pass",
            value=raw,
            details=f"Found TLS Reporting record at {name}",
            warnings=warnings,
            parsed=parsed,
        )

    if status in ("nxdomain", "noanswer", "found"):
        return DnsCheckResult(
            check_type="TLSRPT",
            status="fail",
            details=f"No TLS Reporting record found at {name}",
            recommendations=[
                "Publish a TLSRPT record to receive reports about TLS connection failures (RFC 8460)",
                "Works with both MTA-STS and DANE to report delivery issues",
            ],
        )
    if status == "timeout":
        return DnsCheckResult(
            check_type="TLSRPT",
            status="warn",
            details=f"DNS timeout querying {name}",
        )
    return DnsCheckResult(
        check_type="TLSRPT",
        status="fail",
        details=f"Error querying {name}: {status}",
    )


# ---------------------------------------------------------------------------
# Orchestrator
# ---------------------------------------------------------------------------

def run_all_checks(domain: str, dkim_selector: str | None = None) -> list[DnsCheckResult]:
    results = [check_dmarc(domain), check_spf(domain)]
    if dkim_selector:
        results.append(check_dkim(domain, dkim_selector))
    results.extend(check_tlsa(domain))
    results.append(check_mta_sts(domain))
    results.append(check_tlsrpt(domain))
    return results
