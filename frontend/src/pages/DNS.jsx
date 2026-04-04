import { useState } from "react";
import { Search, Globe } from "lucide-react";
import { api } from "../api";
import DnsResultCard from "../components/DnsResultCard";

export default function DNS() {
  const [domain, setDomain] = useState("");
  const [selector, setSelector] = useState("");
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const runCheck = async (e) => {
    e.preventDefault();
    if (!domain.trim()) return;
    setLoading(true);
    setError(null);
    setResults(null);
    try {
      const data = await api.checkDns(domain.trim(), selector.trim());
      setResults(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const passCount = results?.results?.filter((r) => r.status === "pass").length ?? 0;
  const totalCount = results?.results?.length ?? 0;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white">DNS Health</h2>
        <p className="text-sm text-gray-500 mt-1">
          Check DMARC, SPF, DKIM, and TLSA records for any domain
        </p>
      </div>

      <form onSubmit={runCheck} className="flex flex-wrap gap-3 items-end">
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
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
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

      {results && (
        <>
          <div className="flex items-center gap-3 p-4 bg-gray-900 border border-gray-800 rounded-xl">
            <Globe className="w-5 h-5 text-indigo-400" />
            <span className="text-white font-mono">{results.domain}</span>
            <span className="text-gray-500">—</span>
            <span className="text-sm text-gray-400">
              {passCount}/{totalCount} checks passing
            </span>
          </div>
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
