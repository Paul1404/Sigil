import dns.resolver
import dns.rdatatype

from schemas import DnsCheckResult


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


def check_dmarc(domain: str) -> DnsCheckResult:
    name = f"_dmarc.{domain}"
    status, records = _query_txt(name)
    dmarc_records = [r for r in records if r.startswith("v=DMARC1")]
    if dmarc_records:
        return DnsCheckResult(
            check_type="DMARC",
            status="pass",
            value=dmarc_records[0],
            details=f"Found DMARC record at {name}",
        )
    if status == "nxdomain" or status == "noanswer":
        return DnsCheckResult(
            check_type="DMARC",
            status="fail",
            details=f"No DMARC record found at {name}",
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


def check_spf(domain: str) -> DnsCheckResult:
    status, records = _query_txt(domain)
    spf_records = [r for r in records if r.startswith("v=spf1")]
    if spf_records:
        return DnsCheckResult(
            check_type="SPF",
            status="pass",
            value=spf_records[0],
            details=f"Found SPF record for {domain}",
        )
    if status in ("nxdomain", "noanswer", "found"):
        return DnsCheckResult(
            check_type="SPF",
            status="fail",
            details=f"No SPF record found for {domain}",
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


def check_tlsa(domain: str) -> list[DnsCheckResult]:
    results = []
    try:
        mx_answers = dns.resolver.resolve(domain, "MX", lifetime=5.0)
        mx_hosts = [str(r.exchange).rstrip(".") for r in mx_answers]
    except Exception:
        return [
            DnsCheckResult(
                check_type="TLSA",
                status="warn",
                details=f"Could not resolve MX records for {domain}",
            )
        ]

    for mx in mx_hosts[:5]:
        name = f"_25._tcp.{mx}"
        try:
            answers = dns.resolver.resolve(name, "TLSA", lifetime=5.0)
            tlsa_strs = [str(r) for r in answers]
            results.append(
                DnsCheckResult(
                    check_type="TLSA",
                    status="pass",
                    value=tlsa_strs[0] if tlsa_strs else None,
                    details=f"TLSA record found for {mx}",
                )
            )
        except dns.resolver.NXDOMAIN:
            results.append(
                DnsCheckResult(
                    check_type="TLSA",
                    status="fail",
                    details=f"No TLSA record for {mx}",
                )
            )
        except dns.resolver.NoAnswer:
            results.append(
                DnsCheckResult(
                    check_type="TLSA",
                    status="fail",
                    details=f"No TLSA record for {mx}",
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


def run_all_checks(domain: str, dkim_selector: str | None = None) -> list[DnsCheckResult]:
    results = [check_dmarc(domain), check_spf(domain)]
    if dkim_selector:
        results.append(check_dkim(domain, dkim_selector))
    results.extend(check_tlsa(domain))
    return results
