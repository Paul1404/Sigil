"""Derive per-record state from raw DMARC results and user classifications.

A DMARC report row is one of five states, not just pass/fail. See
SourceClassification for the user-facing classifications that drive this.
"""

from dataclasses import dataclass

from models import DmarcRecord, SourceClassification


# Record states surfaced to the UI.
STATE_ALIGNED = "aligned"                       # DKIM or SPF aligned -- real mail, ok
STATE_MISALIGNED_LEGITIMATE = "misaligned_legitimate"  # failing, source trusted -- needs fix
STATE_REJECTED_SPOOF = "rejected_spoof"         # failing, source marked unauthorized -- good
STATE_IGNORED = "ignored"                       # source/domain marked ignored -- excluded
STATE_UNKNOWN_FAILURE = "unknown_failure"       # failing, no classification yet -- triage

ALL_STATES = (
    STATE_ALIGNED,
    STATE_MISALIGNED_LEGITIMATE,
    STATE_REJECTED_SPOOF,
    STATE_IGNORED,
    STATE_UNKNOWN_FAILURE,
)

# Classification values.
CLASS_TRUSTED = "trusted"
CLASS_UNAUTHORIZED = "unauthorized"
CLASS_IGNORED = "ignored"

# Match types.
MATCH_DOMAIN = "domain"
MATCH_SOURCE_IP = "source_ip"
MATCH_HEADER_FROM = "header_from"
MATCH_ENVELOPE_FROM = "envelope_from"

# More-specific matches win over less-specific ones.
MATCH_PRIORITY = [MATCH_SOURCE_IP, MATCH_HEADER_FROM, MATCH_ENVELOPE_FROM, MATCH_DOMAIN]


@dataclass
class StateCounts:
    aligned: int = 0
    misaligned_legitimate: int = 0
    rejected_spoof: int = 0
    ignored: int = 0
    unknown_failure: int = 0

    @property
    def health_total(self) -> int:
        """Denominator for auth health: real mail only."""
        return self.aligned + self.misaligned_legitimate

    @property
    def health_rate(self) -> float:
        return round(self.aligned / self.health_total * 100, 1) if self.health_total > 0 else 0.0

    @property
    def total_messages(self) -> int:
        return (
            self.aligned
            + self.misaligned_legitimate
            + self.rejected_spoof
            + self.ignored
            + self.unknown_failure
        )

    def add(self, state: str, count: int) -> None:
        setattr(self, state, getattr(self, state) + count)

    def as_dict(self) -> dict:
        return {
            "aligned": self.aligned,
            "misaligned_legitimate": self.misaligned_legitimate,
            "rejected_spoof": self.rejected_spoof,
            "ignored": self.ignored,
            "unknown_failure": self.unknown_failure,
            "health_rate": self.health_rate,
            "total_messages": self.total_messages,
        }


# Index of classifications: { policy_domain: { match_type: { match_value: classification } } }
ClassificationIndex = dict[str, dict[str, dict[str, str]]]


def build_index(rows: list[SourceClassification]) -> ClassificationIndex:
    idx: ClassificationIndex = {}
    for c in rows:
        idx.setdefault(c.policy_domain.lower(), {}).setdefault(c.match_type, {})[
            c.match_value.lower()
        ] = c.classification
    return idx


def classify_record(
    record: DmarcRecord, policy_domain: str, index: ClassificationIndex
) -> str:
    """Return one of the five STATE_* constants for a single DmarcRecord."""
    aligned = record.dkim_alignment == "pass" or record.spf_alignment == "pass"
    if aligned:
        return STATE_ALIGNED

    domain_idx = index.get((policy_domain or "").lower())
    if not domain_idx:
        return STATE_UNKNOWN_FAILURE

    candidates = {
        MATCH_SOURCE_IP: record.source_ip,
        MATCH_HEADER_FROM: record.header_from,
        MATCH_ENVELOPE_FROM: record.envelope_from,
        MATCH_DOMAIN: policy_domain,
    }
    for match_type in MATCH_PRIORITY:
        value = candidates.get(match_type)
        if not value:
            continue
        cls = domain_idx.get(match_type, {}).get(value.lower())
        if cls == CLASS_TRUSTED:
            return STATE_MISALIGNED_LEGITIMATE
        if cls == CLASS_UNAUTHORIZED:
            return STATE_REJECTED_SPOOF
        if cls == CLASS_IGNORED:
            return STATE_IGNORED
    return STATE_UNKNOWN_FAILURE


def count_record_states(
    records: list[DmarcRecord], policy_domain: str, index: ClassificationIndex
) -> StateCounts:
    counts = StateCounts()
    for rec in records:
        state = classify_record(rec, policy_domain, index)
        counts.add(state, rec.count)
    return counts
