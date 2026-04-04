import { useState, useEffect } from "react";
import { Search, Globe, Shield, Loader2 } from "lucide-react";
import { api } from "../api";
import DnsResultCard from "../components/DnsResultCard";

export default function DNS() {
  const [domain, setDomain] = useState("");
  const [selector, setSelector] = useState("");
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Detected domains from reports
  const [detectedDomains, setDetectedDomains] = useState([]);
  const [domainsLoading, setDomainsLoading] = useState(true);
  const [activeDomain, setActiveDomain] = useState(null);

  useEffect(() => {
    api
      .getDnsDomains()
      .then((data) => setDetectedDomains(data.domains || []))
      .catch(() => {})
      .finally(() => setDomainsLoading(false));
  }, []);

  const runCheck = async (checkDomain, checkSelector) => {
    const d = (checkDomain || domain).trim();
    if (!d) return;
    setLoading(true);
    setError(null);
    setResults(null);
    setActiveDomain(d);
    try {
      const data = await api.checkDns(d, (checkSelector || selector).trim());
      setResults(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    runCheck(domain, selector);
  };

  const handleDomainClick = (d) => {
    setDomain(d);
    setSelector("");
    runCheck(d, "");
  };

  const passCount =
    results?.results?.filter((r) => r.status === "pass").length ?? 0;
  const warnCount =
    results?.results?.filter((r) => r.status === "warn").length ?? 0;
  const failCount =
    results?.results?.filter((r) => r.status === "fail").length ?? 0;
  const totalCount = results?.results?.length ?? 0;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white">DNS Health</h2>
        <p className="text-sm text-gray-500 mt-1">
          Check MX, DMARC, SPF, DKIM, TLSA/DANE, MTA-STS, and TLS Reporting
          records
        </p>
      </div>

      {/* Detected domains from reports */}
      {!domainsLoading && detectedDomains.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">
            Domains from your reports
          </h3>
          <div className="flex flex-wrap gap-2">
            {detectedDomains.map((d) => (
              <button
                key={d}
                onClick={() => handleDomainClick(d)}
                disabled={loading}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-mono transition-colors ${
                  activeDomain === d
                    ? "bg-indigo-600 text-white"
                    : "bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-white"
                } disabled:opacity-50`}
              >
                <Globe className="w-3 h-3" />
                {d}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Manual check form */}
      <form onSubmit={handleSubmit} className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs text-gray-400 mb-1">Domain</label>
          <input
            type="text"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            placeholder="example.com"
            required
            className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none w-64"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">
            DKIM Selector <span className="text-gray-600">(optional)</span>
          </label>
          <input
            type="text"
            value={selector}
            onChange={(e) => setSelector(e.target.value)}
            placeholder="google, default, s1..."
            className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none w-48"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
        >
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Search className="w-4 h-4" />
          )}
          Check DNS
        </button>
      </form>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-red-400 text-sm">
          {error}
        </div>
      )}

      {loading && !results && (
        <div className="flex items-center justify-center h-32">
          <div className="flex items-center gap-3 text-gray-400">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm">
              Running DNS checks for {activeDomain}...
            </span>
          </div>
        </div>
      )}

      {results && (
        <>
          {/* Summary bar */}
          <div className="flex items-center gap-3 p-4 bg-gray-900 border border-gray-800 rounded-xl">
            <Shield className="w-5 h-5 text-indigo-400" />
            <span className="text-white font-mono">{results.domain}</span>
            <span className="text-gray-700">|</span>
            <div className="flex items-center gap-3 text-sm">
              {passCount > 0 && (
                <span className="text-emerald-400">
                  {passCount} passed
                </span>
              )}
              {warnCount > 0 && (
                <span className="text-yellow-400">
                  {warnCount} warning{warnCount !== 1 ? "s" : ""}
                </span>
              )}
              {failCount > 0 && (
                <span className="text-red-400">
                  {failCount} failed
                </span>
              )}
              <span className="text-gray-500">
                {totalCount} total checks
              </span>
            </div>
          </div>

          {/* Result cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {results.results.map((r, i) => (
              <DnsResultCard key={i} result={r} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
