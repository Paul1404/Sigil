import { useState, useEffect, useMemo } from "react";
import {
  ChevronDown,
  ChevronRight,
  Search,
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  Info,
  LayoutGrid,
  List,
  Lock,
  Unlock,
  AlertTriangle,
} from "lucide-react";
import { api } from "../api";
import StatusBadge from "../components/StatusBadge";

function getStatusLabel(rate) {
  if (rate >= 90) return "All Passed";
  if (rate >= 50) return "Partial";
  return "All Failed";
}

function getStatusIcon(rate) {
  if (rate >= 90)
    return <ShieldCheck className="w-5 h-5 text-green-400" />;
  if (rate >= 50)
    return <ShieldAlert className="w-5 h-5 text-yellow-400" />;
  return <ShieldX className="w-5 h-5 text-red-400" />;
}

export default function Reports() {
  const [activeTab, setActiveTab] = useState("dmarc");

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white">Reports</h2>
        <p className="text-sm text-gray-500 mt-1">
          Monitor your email authentication and encryption posture
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-900 border border-gray-800 rounded-lg p-1 w-fit">
        <button
          onClick={() => setActiveTab("dmarc")}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
            activeTab === "dmarc"
              ? "bg-indigo-600 text-white"
              : "text-gray-400 hover:text-gray-200"
          }`}
        >
          DMARC Reports
        </button>
        <button
          onClick={() => setActiveTab("tls")}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
            activeTab === "tls"
              ? "bg-indigo-600 text-white"
              : "text-gray-400 hover:text-gray-200"
          }`}
        >
          TLS Reports
        </button>
      </div>

      {activeTab === "dmarc" ? <DmarcReportsTab /> : <TlsReportsTab />}
    </div>
  );
}

function DmarcReportsTab() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const [detail, setDetail] = useState(null);
  const [domain, setDomain] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [activeDomainFilter, setActiveDomainFilter] = useState(null);
  const [viewMode, setViewMode] = useState("list"); // "list" or "grouped"

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

  // Compute per-domain summaries
  const domainSummaries = useMemo(() => {
    const map = {};
    for (const r of reports) {
      const d = r.domain?.toLowerCase();
      if (!d) continue;
      if (!map[d]) {
        map[d] = { domain: r.domain, totalMessages: 0, totalPassed: 0, reportCount: 0 };
      }
      map[d].totalMessages += r.total_messages;
      map[d].totalPassed += Math.round((r.pass_rate / 100) * r.total_messages);
      map[d].reportCount += 1;
    }
    return Object.values(map)
      .map((s) => ({
        ...s,
        passRate: s.totalMessages > 0 ? Math.round((s.totalPassed / s.totalMessages) * 1000) / 10 : 0,
      }))
      .sort((a, b) => b.totalMessages - a.totalMessages);
  }, [reports]);

  // Filtered reports
  const filteredReports = useMemo(() => {
    if (!activeDomainFilter) return reports;
    return reports.filter(
      (r) => r.domain?.toLowerCase() === activeDomainFilter.toLowerCase()
    );
  }, [reports, activeDomainFilter]);

  // Grouped view
  const groupedReports = useMemo(() => {
    if (viewMode !== "grouped") return null;
    const groups = {};
    for (const r of filteredReports) {
      const d = r.domain || "Unknown";
      if (!groups[d]) groups[d] = [];
      groups[d].push(r);
    }
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [filteredReports, viewMode]);

  return (
    <div className="space-y-6">
      {/* Help banner */}
      <div className="bg-indigo-500/5 border border-indigo-500/20 rounded-xl p-4 flex gap-3 items-start">
        <Info className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
        <div className="text-sm text-gray-400">
          <span className="text-indigo-300 font-medium">What is this?</span>{" "}
          DMARC reports show whether emails sent from your domains pass
          authentication checks (SPF &amp; DKIM). A{" "}
          <span className="text-green-400">high pass rate</span> means your
          legitimate emails are properly authenticated.{" "}
          <span className="text-red-400">Failures</span> may indicate
          unauthorized senders or misconfiguration.
        </div>
      </div>

      {/* Domain summary cards */}
      {!loading && domainSummaries.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-gray-400 mb-3">
            Domain Health Overview
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {domainSummaries.map((s) => {
              const isActive =
                activeDomainFilter?.toLowerCase() === s.domain.toLowerCase();
              return (
                <button
                  key={s.domain}
                  onClick={() =>
                    setActiveDomainFilter(isActive ? null : s.domain)
                  }
                  className={`text-left p-4 rounded-xl border transition-all ${
                    isActive
                      ? "bg-indigo-500/10 border-indigo-500/40 ring-1 ring-indigo-500/30"
                      : "bg-gray-900 border-gray-800 hover:border-gray-700"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    {getStatusIcon(s.passRate)}
                    <span className="text-white font-mono text-sm truncate">
                      {s.domain}
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between">
                    <span
                      className={`text-2xl font-bold ${
                        s.passRate >= 90
                          ? "text-green-400"
                          : s.passRate >= 50
                            ? "text-yellow-400"
                            : "text-red-400"
                      }`}
                    >
                      {s.passRate}%
                    </span>
                    <span className="text-xs text-gray-500">
                      {s.totalMessages.toLocaleString()} msgs &middot;{" "}
                      {s.reportCount} reports
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
          {activeDomainFilter && (
            <button
              onClick={() => setActiveDomainFilter(null)}
              className="mt-2 text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
            >
              Clear filter &mdash; show all domains
            </button>
          )}
        </div>
      )}

      {/* Filters & view toggle */}
      <div className="flex flex-wrap gap-3 items-end justify-between">
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
        <div className="flex gap-1 bg-gray-900 border border-gray-800 rounded-lg p-1">
          <button
            onClick={() => setViewMode("list")}
            className={`p-1.5 rounded ${viewMode === "list" ? "bg-gray-700 text-white" : "text-gray-500 hover:text-gray-300"}`}
            title="Chronological list"
          >
            <List className="w-4 h-4" />
          </button>
          <button
            onClick={() => setViewMode("grouped")}
            className={`p-1.5 rounded ${viewMode === "grouped" ? "bg-gray-700 text-white" : "text-gray-500 hover:text-gray-300"}`}
            title="Group by domain"
          >
            <LayoutGrid className="w-4 h-4" />
          </button>
        </div>
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
      ) : filteredReports.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          No reports found. Add a mailbox in Settings and fetch reports.
        </div>
      ) : viewMode === "grouped" && groupedReports ? (
        // Grouped view
        <div className="space-y-6">
          {groupedReports.map(([domainName, domainReports]) => (
            <div
              key={domainName}
              className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden"
            >
              <div className="px-4 py-3 border-b border-gray-800 bg-gray-900/80">
                <span className="text-white font-mono font-medium">
                  {domainName}
                </span>
                <span className="text-gray-500 text-sm ml-3">
                  {domainReports.length} reports
                </span>
              </div>
              <ReportTable
                reports={domainReports}
                expanded={expanded}
                detail={detail}
                toggleExpand={toggleExpand}
                showDomain={false}
              />
            </div>
          ))}
        </div>
      ) : (
        // Flat list view
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <ReportTable
            reports={filteredReports}
            expanded={expanded}
            detail={detail}
            toggleExpand={toggleExpand}
            showDomain={true}
          />
        </div>
      )}
    </div>
  );
}

function ReportTable({ reports, expanded, detail, toggleExpand, showDomain }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-gray-800 text-left">
          <th className="px-4 py-3 text-gray-400 font-medium w-8"></th>
          {showDomain && (
            <th className="px-4 py-3 text-gray-400 font-medium">Domain</th>
          )}
          <th className="px-4 py-3 text-gray-400 font-medium">
            Reporting Organization
          </th>
          <th className="px-4 py-3 text-gray-400 font-medium">Date Range</th>
          <th className="px-4 py-3 text-gray-400 font-medium">Messages</th>
          <th className="px-4 py-3 text-gray-400 font-medium">
            Authentication
          </th>
          <th className="px-4 py-3 text-gray-400 font-medium">Policy</th>
        </tr>
      </thead>
      <tbody>
        {reports.map((r) => (
          <ReportRow
            key={r.id}
            r={r}
            expanded={expanded}
            detail={detail}
            toggleExpand={toggleExpand}
            showDomain={showDomain}
          />
        ))}
      </tbody>
    </table>
  );
}

function ReportRow({ r, expanded, detail, toggleExpand, showDomain }) {
  const isExpanded = expanded === r.id;
  const colSpan = showDomain ? 7 : 6;

  const statusLabel = getStatusLabel(r.pass_rate);

  return (
    <>
      <tr
        onClick={() => toggleExpand(r.id)}
        className="border-b border-gray-800/50 hover:bg-gray-800/30 cursor-pointer transition-colors"
      >
        <td className="px-4 py-3">
          {isExpanded ? (
            <ChevronDown className="w-4 h-4 text-gray-500" />
          ) : (
            <ChevronRight className="w-4 h-4 text-gray-500" />
          )}
        </td>
        {showDomain && (
          <td className="px-4 py-3 text-white font-mono">{r.domain}</td>
        )}
        <td className="px-4 py-3 text-gray-300">{r.org_name || "-"}</td>
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
          <div className="flex items-center gap-2">
            <StatusBadge
              status={
                r.pass_rate >= 90
                  ? "pass"
                  : r.pass_rate >= 50
                    ? "warn"
                    : "fail"
              }
            />
            <span className="text-gray-300 text-xs">
              {r.pass_rate}% &middot; {statusLabel}
            </span>
          </div>
        </td>
        <td className="px-4 py-3 text-gray-400">{r.policy_p || "-"}</td>
      </tr>
      {isExpanded && detail && (
        <tr>
          <td colSpan={colSpan} className="px-4 py-4 bg-gray-950">
            <RecordTable records={detail.records} />
          </td>
        </tr>
      )}
    </>
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

/* ===================== TLS Reports Tab ===================== */

function TlsReportsTab() {
  const [reports, setReports] = useState([]);
  const [domainSummaries, setDomainSummaries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [domainFilter, setDomainFilter] = useState(null);

  useEffect(() => {
    setLoading(true);
    Promise.all([api.getTlsReports(), api.getTlsReportsSummary()])
      .then(([r, s]) => {
        setReports(r);
        setDomainSummaries(s);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const filteredReports = useMemo(() => {
    if (!domainFilter) return reports;
    return reports.filter(
      (r) => r.policy_domain?.toLowerCase() === domainFilter.toLowerCase()
    );
  }, [reports, domainFilter]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-red-400 text-sm">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Help banner */}
      <div className="bg-indigo-500/5 border border-indigo-500/20 rounded-xl p-4 flex gap-3 items-start">
        <Info className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
        <div className="text-sm text-gray-400">
          <span className="text-indigo-300 font-medium">What is this?</span>{" "}
          TLS reports show whether other mail servers can establish{" "}
          <span className="text-white">encrypted connections</span> when
          sending email to your domains. A{" "}
          <span className="text-green-400">high success rate</span> means your
          mail server's TLS/SSL is working correctly.{" "}
          <span className="text-red-400">Failures</span> may indicate
          certificate issues or misconfigurations.
        </div>
      </div>

      {/* Domain TLS health cards */}
      {domainSummaries.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-gray-400 mb-3">
            TLS Encryption Health
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {domainSummaries.map((s) => {
              const isActive =
                domainFilter?.toLowerCase() === s.domain.toLowerCase();
              const totalSessions = s.total_success + s.total_failure;
              return (
                <button
                  key={s.domain}
                  onClick={() =>
                    setDomainFilter(isActive ? null : s.domain)
                  }
                  className={`text-left p-4 rounded-xl border transition-all ${
                    isActive
                      ? "bg-indigo-500/10 border-indigo-500/40 ring-1 ring-indigo-500/30"
                      : "bg-gray-900 border-gray-800 hover:border-gray-700"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    {s.success_rate >= 90 ? (
                      <Lock className="w-5 h-5 text-green-400" />
                    ) : s.success_rate >= 50 ? (
                      <AlertTriangle className="w-5 h-5 text-yellow-400" />
                    ) : (
                      <Unlock className="w-5 h-5 text-red-400" />
                    )}
                    <span className="text-white font-mono text-sm truncate">
                      {s.domain}
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between">
                    <span
                      className={`text-2xl font-bold ${
                        s.success_rate >= 90
                          ? "text-green-400"
                          : s.success_rate >= 50
                            ? "text-yellow-400"
                            : "text-red-400"
                      }`}
                    >
                      {s.success_rate}%
                    </span>
                    <span className="text-xs text-gray-500">
                      {totalSessions.toLocaleString()} sessions
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    {s.total_failure === 0
                      ? "All connections encrypted"
                      : `${s.total_failure} failed connection${s.total_failure !== 1 ? "s" : ""}`}
                  </p>
                </button>
              );
            })}
          </div>
          {domainFilter && (
            <button
              onClick={() => setDomainFilter(null)}
              className="mt-2 text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
            >
              Clear filter &mdash; show all domains
            </button>
          )}
        </div>
      )}

      {/* TLS reports table */}
      {filteredReports.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <Lock className="w-12 h-12 mx-auto mb-3 opacity-30" />
          No TLS reports found yet. TLS reports will appear here after mail
          servers send reports about your domains.
        </div>
      ) : (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-left">
                <th className="px-4 py-3 text-gray-400 font-medium">Domain</th>
                <th className="px-4 py-3 text-gray-400 font-medium">Reporter</th>
                <th className="px-4 py-3 text-gray-400 font-medium">Date Range</th>
                <th className="px-4 py-3 text-gray-400 font-medium">MX Host</th>
                <th className="px-4 py-3 text-gray-400 font-medium">Encrypted</th>
                <th className="px-4 py-3 text-gray-400 font-medium">Failed</th>
                <th className="px-4 py-3 text-gray-400 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredReports.map((r) => {
                const total = r.total_success + r.total_failure;
                const rate =
                  total > 0
                    ? Math.round((r.total_success / total) * 1000) / 10
                    : 0;
                return (
                  <tr
                    key={r.id}
                    className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors"
                  >
                    <td className="px-4 py-3 text-white font-mono">
                      {r.policy_domain || "-"}
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
                    <td className="px-4 py-3 text-gray-400 font-mono text-xs">
                      {r.mx_host || "-"}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-green-400">
                        {r.total_success.toLocaleString()}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={
                          r.total_failure > 0
                            ? "text-red-400"
                            : "text-gray-500"
                        }
                      >
                        {r.total_failure.toLocaleString()}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {r.total_failure === 0 ? (
                        <span className="inline-flex items-center gap-1 text-green-400 text-xs">
                          <Lock className="w-3 h-3" />
                          Encrypted
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-red-400 text-xs">
                          <Unlock className="w-3 h-3" />
                          {rate}% encrypted
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
