import unittest

import dns.resolver

from triage_recommender import SpfEvaluation, build_recommendation, evaluate_spf


class FakeResolver:
    def __init__(self, records):
        self.records = records

    def __call__(self, name, rdtype):
        value = self.records.get((name, rdtype))
        if isinstance(value, Exception):
            raise value
        if value is None:
            raise dns.resolver.NoAnswer
        return value


class SpfEvaluationTests(unittest.TestCase):
    def test_nested_include_authorizes_ip(self):
        resolver = FakeResolver(
            {
                ("example.test", "TXT"): ["v=spf1 include:_spf.example.test ~all"],
                ("_spf.example.test", "TXT"): ["v=spf1 ip4:193.138.195.0/24 -all"],
            }
        )

        result = evaluate_spf("193.138.195.141", "example.test", resolver)

        self.assertEqual(result.result, "pass")
        self.assertEqual(result.domain, "example.test")

    def test_non_matching_ip_reaches_softfail(self):
        resolver = FakeResolver(
            {
                ("example.test", "TXT"): ["v=spf1 include:_spf.example.test ~all"],
                ("_spf.example.test", "TXT"): ["v=spf1 ip4:192.0.2.0/24 -all"],
            }
        )

        result = evaluate_spf("193.138.195.141", "example.test", resolver)

        self.assertEqual(result.result, "softfail")

    def test_lookup_limit_returns_permerror(self):
        records = {}
        for index in range(12):
            domain = f"spf{index}.example.test"
            next_domain = f"spf{index + 1}.example.test"
            records[(domain, "TXT")] = [f"v=spf1 include:{next_domain} -all"]

        result = evaluate_spf(
            "192.0.2.1", "spf0.example.test", FakeResolver(records)
        )

        self.assertEqual(result.result, "permerror")
        self.assertIn("lookup limit", result.detail)

    def test_unsupported_mechanism_does_not_guess(self):
        resolver = FakeResolver(
            {("example.test", "TXT"): ["v=spf1 exists:%{i}.example.test -all"]}
        )

        result = evaluate_spf("192.0.2.1", "example.test", resolver)

        self.assertEqual(result.result, "unknown")

    def test_include_without_spf_is_permerror(self):
        resolver = FakeResolver(
            {("example.test", "TXT"): ["v=spf1 include:missing.example.test -all"]}
        )

        result = evaluate_spf("192.0.2.1", "example.test", resolver)

        self.assertEqual(result.result, "permerror")
        self.assertIn("no SPF", result.detail)


class RecommendationTests(unittest.TestCase):
    def test_screenshot_like_failure_recommends_unauthorized_with_high_confidence(self):
        result = build_recommendation(
            source_ip="193.138.195.141",
            policy_domain="schlossmuehle-untereuerheim.de",
            header_from=["schlossmuehle-untereuerheim.de"],
            envelope_from=[],
            dkim_results=[],
            spf_results=["softfail"],
            dkim_alignment_results=["fail"],
            spf_alignment_results=["fail"],
            dispositions=["quarantine"],
            evaluation=SpfEvaluation(
                "softfail", "schlossmuehle-untereuerheim.de"
            ),
        )

        self.assertEqual(result.action, "unauthorized")
        self.assertEqual(result.confidence, "high")
        self.assertTrue(any("no Envelope From" in caveat for caveat in result.caveats))

    def test_current_spf_pass_recommends_trusted_but_not_high_confidence(self):
        result = build_recommendation(
            source_ip="192.0.2.1",
            policy_domain="example.test",
            header_from=["example.test"],
            envelope_from=["example.test"],
            dkim_results=["fail"],
            spf_results=["fail"],
            dkim_alignment_results=["fail"],
            spf_alignment_results=["fail"],
            dispositions=["none"],
            evaluation=SpfEvaluation("pass", "example.test"),
        )

        self.assertEqual(result.action, "trusted")
        self.assertEqual(result.confidence, "medium")

    def test_dns_uncertainty_requires_manual_review(self):
        result = build_recommendation(
            source_ip="192.0.2.1",
            policy_domain="example.test",
            header_from=["example.test"],
            envelope_from=[],
            dkim_results=["fail"],
            spf_results=["fail"],
            dkim_alignment_results=["fail"],
            spf_alignment_results=["fail"],
            dispositions=["reject"],
            evaluation=SpfEvaluation("temperror", "example.test"),
        )

        self.assertEqual(result.action, "review")
        self.assertEqual(result.confidence, "low")


if __name__ == "__main__":
    unittest.main()
