import { useState, useEffect } from "react";
import { ChevronDown, ChevronRight, Search } from "lucide-react";
import { api } from "../api";
import StatusBadge from "../components/StatusBadge";

export default function Reports() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const [detail, setDetail] = useState(null);
  const [domain, setDomain] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const fetchReports = () => {
    setLoading(true);
    api
      .getReports({ domain, date_from: dateFrom, date_to: dateTo })
      .then(setReports)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchReports();
  }, []);

  const toggleExpand = async (id) => {
    if (expanded === id) {
      setExpanded(null);
      setDetail(null);
      return;
    }
    setExpanded(id);
    try {
      const d = await api.getReport(id);
      setDetail(d);
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white">Reports</h2>
        <p className="text-sm text-gray-500 mt-1">
          DMARC aggregate reports from your mailboxes
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs text-gray-400 mb-1">Domain</label>
          <input
            type="text"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            placeholder="example.com"
            className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">From</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">To</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
          />
        </div>
        <button
          onClick={fetchReports}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <Search className="w-4 h-4" />
          Filter
        </button>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-red-400 text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-32">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-400" />
        </div>
      ) : reports.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          No reports found. Add a mailbox in Settings and fetch reports.
        </div>
      ) : (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-left">
                <th className="px-4 py-3 text-gray-400 font-medium w-8"></th>
                <th className="px-4 py-3 text-gray-400 font-medium">Domain</th>
                <th className="px-4 py-3 text-gray-400 font-medium">Org</th>
                <th className="px-4 py-3 text-gray-400 font-medium">
                  Date Range
                </th>
                <th className="px-4 py-3 text-gray-400 font-medium">
                  Messages
                </th>
                <th className="px-4 py-3 text-gray-400 font-medium">
                  Pass Rate
                </th>
                <th className="px-4 py-3 text-gray-400 font-medium">Policy</th>
              </tr>
            </thead>
            <tbody>
              {reports.map((r) => (
                <>
                  <tr
                    key={r.id}
                    onClick={() => toggleExpand(r.id)}
                    className="border-b border-gray-800/50 hover:bg-gray-800/30 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3">
                      {expanded === r.id ? (
                        <ChevronDown className="w-4 h-4 text-gray-500" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-gray-500" />
                      )}
                    </td>
                    <td className="px-4 py-3 text-white font-mono">
                      {r.domain}
                    </td>
                    <td className="px-4 py-3 text-gray-300">
                      {r.org_name || "-"}
                    </td>
                    <td className="px-4 py-3 text-gray-400">
                      {r.date_range_begin
                        ? new Date(r.date_range_begin).toLocaleDateString()
                        : "-"}
                      {" - "}
                      {r.date_range_end
                        ? new Date(r.date_range_end).toLocaleDateString()
                        : "-"}
                    </td>
                    <td className="px-4 py-3 text-gray-300">
                      {r.total_messages.toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge
                        status={
                          r.pass_rate >= 90
                            ? "pass"
                            : r.pass_rate >= 50
                              ? "warn"
                              : "fail"
                        }
                      />
                      <span className="ml-2 text-gray-300">
                        {r.pass_rate}%
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-400">
                      {r.policy_p || "-"}
                    </td>
                  </tr>
                  {expanded === r.id && detail && (
                    <tr key={`${r.id}-detail`}>
                      <td colSpan={7} className="px-4 py-4 bg-gray-950">
                        <RecordTable records={detail.records} />
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function RecordTable({ records }) {
  if (!records || records.length === 0) {
    return <p className="text-gray-500 text-sm">No records in this report.</p>;
  }

  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="text-left border-b border-gray-800">
          <th className="px-3 py-2 text-gray-400">Source IP</th>
          <th className="px-3 py-2 text-gray-400">Count</th>
          <th className="px-3 py-2 text-gray-400">Disposition</th>
          <th className="px-3 py-2 text-gray-400">DKIM</th>
          <th className="px-3 py-2 text-gray-400">SPF</th>
          <th className="px-3 py-2 text-gray-400">DKIM Align</th>
          <th className="px-3 py-2 text-gray-400">SPF Align</th>
          <th className="px-3 py-2 text-gray-400">Envelope From</th>
          <th className="px-3 py-2 text-gray-400">Header From</th>
        </tr>
      </thead>
      <tbody>
        {records.map((rec) => {
          const dkimPass = rec.dkim_alignment === "pass";
          const spfPass = rec.spf_alignment === "pass";
          return (
            <tr
              key={rec.id}
              className={`border-b border-gray-900 ${dkimPass || spfPass ? "bg-green-500/5" : "bg-red-500/5"}`}
            >
              <td className="px-3 py-2 font-mono text-gray-300">
                {rec.source_ip}
              </td>
              <td className="px-3 py-2 text-gray-300">{rec.count}</td>
              <td className="px-3 py-2 text-gray-300">
                {rec.disposition || "-"}
              </td>
              <td className="px-3 py-2">
                <span
                  className={
                    rec.dkim_result === "pass"
                      ? "text-green-400"
                      : "text-red-400"
                  }
                >
                  {rec.dkim_result || "-"}
                </span>
              </td>
              <td className="px-3 py-2">
                <span
                  className={
                    rec.spf_result === "pass"
                      ? "text-green-400"
                      : "text-red-400"
                  }
                >
                  {rec.spf_result || "-"}
                </span>
              </td>
              <td className="px-3 py-2">
                <span
                  className={dkimPass ? "text-green-400" : "text-red-400"}
                >
                  {rec.dkim_alignment || "-"}
                </span>
              </td>
              <td className="px-3 py-2">
                <span className={spfPass ? "text-green-400" : "text-red-400"}>
                  {rec.spf_alignment || "-"}
                </span>
              </td>
              <td className="px-3 py-2 text-gray-400">
                {rec.envelope_from || "-"}
              </td>
              <td className="px-3 py-2 text-gray-400">
                {rec.header_from || "-"}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
