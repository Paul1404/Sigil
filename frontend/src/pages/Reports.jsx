import { useState, useEffect, useMemo, useCallback } from "react";
import {
  ChevronDown,
  ChevronRight,
  Search,
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  ShieldOff,
  EyeOff,
  Eye,
  Info,
  LayoutGrid,
  List,
  Lock,
  Unlock,
  AlertTriangle,
  X,
} from "lucide-react";
import { api } from "../api";
import { StateBadge } from "../components/StateBadge";
import ClassifyMenu from "../components/ClassifyMenu";

function healthIcon(rate) {
  if (rate >= 95) return <ShieldCheck className="w-5 h-5 text-green-400" />;
  if (rate >= 75) return <ShieldAlert className="w-5 h-5 text-yellow-400" />;
  return <ShieldX className="w-5 h-5 text-red-400" />;
}

function healthColor(rate) {
  if (rate >= 95) return "text-green-400";
  if (rate >= 75) return "text-yellow-400";
  return "text-red-400";
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
  const [domainSummaries, setDomainSummaries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const [detail, setDetail] = useState(null);
  const [domain, setDomain] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [activeDomainFilter, setActiveDomainFilter] = useState(null);
  const [viewMode, setViewMode] = useState("list"); // "list" or "grouped"
  const [showIgnored, setShowIgnored] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [r, h] = await Promise.all([
        api.getReports({ domain, date_from: dateFrom, date_to: dateTo }),
        api.getDomainHealth(),
      ]);
      setReports(r);
      setDomainSummaries(h);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [domain, dateFrom, dateTo]);

  useEffect(() => {
    fetchAll();
  }, []);

  const refreshDetailIfOpen = useCallback(async () => {
    if (expanded == null) return;
    try {
      const d = await api.getReport(expanded);
      setDetail(d);
    } catch (e) {
      setError(e.message);
    }
  }, [expanded]);

  const handleClassified = useCallback(async () => {
    await Promise.all([fetchAll(), refreshDetailIfOpen()]);
  }, [fetchAll, refreshDetailIfOpen]);

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

  // Ignored domains hidden by default.
  const visibleDomainSummaries = useMemo(
    () => (showIgnored ? domainSummaries : domainSummaries.filter((s) => !s.is_ignored)),
    [domainSummaries, showIgnored]
  );

  const ignoredCount = useMemo(
    () => domainSummaries.filter((s) => s.is_ignored).length,
    [domainSummaries]
  );

  const ignoredDomainSet = useMemo(
    () =>
      new Set(
        domainSummaries.filter((s) => s.is_ignored).map((s) => s.domain.toLowerCase())
      ),
    [domainSummaries]
  );

  const filteredReports = useMemo(() => {
    let out = reports;
    if (!showIgnored) {
      out = out.filter((r) => !ignoredDomainSet.has((r.domain || "").toLowerCase()));
    }
    if (activeDomainFilter) {
      out = out.filter(
        (r) => r.domain?.toLowerCase() === activeDomainFilter.toLowerCase()
      );
    }
    return out;
  }, [reports, activeDomainFilter, showIgnored, ignoredDomainSet]);

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
        <div className="text-sm text-gray-400 space-y-1.5">
          <div>
            <span className="text-indigo-300 font-medium">What is this?</span>{" "}
            DMARC reports show what other mail servers see when receiving
            messages claiming to be from your domains.
          </div>
          <div>
            <span className="text-green-400 inline-flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5" /> Authenticated
            </span>{" "}
            is real mail that passed DKIM or SPF.{" "}
            <span className="text-sky-400 inline-flex items-center gap-1">
              <ShieldOff className="w-3.5 h-3.5" /> Spoof blocked
            </span>{" "}
            is an unauthorized sender being rejected. That's DMARC doing its
            job, not a misconfiguration. The metric that matters is{" "}
            <span className="text-white">auth health</span>, which counts only
            your real mail.
          </div>
        </div>
      </div>

      {/* Domain summary cards */}
      {!loading && visibleDomainSummaries.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-gray-400">
              Domain Health Overview
            </h3>
            {ignoredCount > 0 && (
              <button
                onClick={() => setShowIgnored((v) => !v)}
                className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
              >
                {showIgnored
                  ? `Hide ignored (${ignoredCount})`
                  : `Show ignored (${ignoredCount})`}
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {visibleDomainSummaries.map((s) => (
              <DomainHealthCard
                key={s.domain}
                summary={s}
                isActive={
                  activeDomainFilter?.toLowerCase() === s.domain.toLowerCase()
                }
                onToggleFilter={() =>
                  setActiveDomainFilter(
                    activeDomainFilter?.toLowerCase() === s.domain.toLowerCase()
                      ? null
                      : s.domain,
                  )
                }
                onChanged={fetchAll}
              />
            ))}
          </div>
          {activeDomainFilter && (
            <button
              onClick={() => setActiveDomainFilter(null)}
              className="mt-2 text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
            >
              Clear filter. Show all domains.
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
            onClick={fetchAll}
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
                onClassified={handleClassified}
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
            onClassified={handleClassified}
          />
        </div>
      )}
    </div>
  );
}

function DomainHealthCard({ summary: s, isActive, onToggleFilter, onChanged }) {
  const [busy, setBusy] = useState(false);
  const c = s.counts;
  const showHealth = c.health_total > 0;

  const toggleIgnored = async (e) => {
    e.stopPropagation();
    if (busy) return;
    setBusy(true);
    try {
      const existing = await api.getClassifications(s.domain.toLowerCase());
      const wholeDomainRow = existing.find(
        (r) =>
          r.match_type === "domain" &&
          r.match_value.toLowerCase() === s.domain.toLowerCase(),
      );
      if (s.is_ignored && wholeDomainRow) {
        await api.deleteClassification(wholeDomainRow.id);
      } else {
        await api.createClassification({
          policy_domain: s.domain.toLowerCase(),
          match_type: "domain",
          match_value: s.domain.toLowerCase(),
          classification: "ignored",
        });
      }
      onChanged?.();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      onClick={onToggleFilter}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onToggleFilter();
        }
      }}
      className={`group relative text-left p-4 rounded-xl border transition-all cursor-pointer ${
        isActive
          ? "bg-indigo-500/10 border-indigo-500/40 ring-1 ring-indigo-500/30"
          : "bg-gray-900 border-gray-800 hover:border-gray-700"
      } ${s.is_ignored ? "opacity-60" : ""}`}
    >
      <button
        onClick={toggleIgnored}
        disabled={busy}
        title={s.is_ignored ? "Unignore this domain" : "Hide this domain"}
        className="absolute top-2 right-2 p-1 rounded text-gray-600 hover:text-gray-200 hover:bg-gray-800 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity disabled:opacity-50"
      >
        {s.is_ignored ? (
          <Eye className="w-4 h-4" />
        ) : (
          <EyeOff className="w-4 h-4" />
        )}
      </button>
      <div className="flex items-center gap-2 mb-2 pr-7">
        {s.is_ignored ? (
          <EyeOff className="w-5 h-5 text-gray-500" />
        ) : showHealth ? (
          healthIcon(c.health_rate)
        ) : (
          <Info className="w-5 h-5 text-gray-500" />
        )}
        <span className="text-white font-mono text-sm truncate">
          {s.domain}
        </span>
      </div>
      <div className="flex items-baseline justify-between">
        {s.is_ignored ? (
          <span className="text-sm text-gray-500">Ignored</span>
        ) : showHealth ? (
          <span className={`text-2xl font-bold ${healthColor(c.health_rate)}`}>
            {c.health_rate}%
          </span>
        ) : (
          <span className="text-sm text-gray-500">No real mail seen</span>
        )}
        <span className="text-xs text-gray-500">
          {c.total_messages.toLocaleString()} msgs &middot; {s.report_count}{" "}
          reports
        </span>
      </div>
      <div className="flex gap-3 mt-2 text-[11px] text-gray-500 flex-wrap">
        {c.aligned > 0 && <span className="text-green-400">{c.aligned} ok</span>}
        {c.misaligned_legitimate > 0 && (
          <span className="text-red-400">
            {c.misaligned_legitimate} failing
          </span>
        )}
        {c.rejected_spoof > 0 && (
          <span className="text-sky-400">{c.rejected_spoof} spoofs blocked</span>
        )}
        {c.unknown_failure > 0 && (
          <span className="text-amber-400">{c.unknown_failure} to triage</span>
        )}
      </div>
    </div>
  );
}

function ReportTable({ reports, expanded, detail, toggleExpand, showDomain, onClassified }) {
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
            Breakdown
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
            onClassified={onClassified}
          />
        ))}
      </tbody>
    </table>
  );
}

function ReportRow({ r, expanded, detail, toggleExpand, showDomain, onClassified }) {
  const isExpanded = expanded === r.id;
  const colSpan = showDomain ? 7 : 6;
  const c = r.counts || {};

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
          <div className="flex items-center gap-2 flex-wrap">
            {c.aligned > 0 && (
              <span className="inline-flex items-center gap-1 text-green-400 text-xs">
                <ShieldCheck className="w-3 h-3" />
                {c.aligned}
              </span>
            )}
            {c.misaligned_legitimate > 0 && (
              <span className="inline-flex items-center gap-1 text-red-400 text-xs">
                <ShieldAlert className="w-3 h-3" />
                {c.misaligned_legitimate}
              </span>
            )}
            {c.rejected_spoof > 0 && (
              <span className="inline-flex items-center gap-1 text-sky-400 text-xs">
                <ShieldOff className="w-3 h-3" />
                {c.rejected_spoof}
              </span>
            )}
            {c.unknown_failure > 0 && (
              <span className="inline-flex items-center gap-1 text-amber-400 text-xs">
                <AlertTriangle className="w-3 h-3" />
                {c.unknown_failure}
              </span>
            )}
            {c.ignored > 0 && (
              <span className="inline-flex items-center gap-1 text-gray-500 text-xs">
                <EyeOff className="w-3 h-3" />
                {c.ignored}
              </span>
            )}
          </div>
        </td>
        <td className="px-4 py-3 text-gray-400">{r.policy_p || "-"}</td>
      </tr>
      {isExpanded && detail && (
        <tr>
          <td colSpan={colSpan} className="px-4 py-4 bg-gray-950">
            <RecordTable
              records={detail.records}
              policyDomain={detail.policy_domain || detail.domain}
              onClassified={onClassified}
            />
          </td>
        </tr>
      )}
    </>
  );
}

function rowStateBg(state) {
  switch (state) {
    case "aligned":
      return "bg-green-500/5";
    case "misaligned_legitimate":
      return "bg-red-500/5";
    case "rejected_spoof":
      return "bg-sky-500/5";
    case "ignored":
      return "bg-gray-500/5 opacity-60";
    case "unknown_failure":
      return "bg-amber-500/5";
    default:
      return "";
  }
}

function RecordTable({ records, policyDomain, onClassified }) {
  const [selected, setSelected] = useState(() => new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  // Drop selections for records that disappeared after a refresh.
  useEffect(() => {
    setSelected((prev) => {
      const valid = new Set(records.map((r) => r.id));
      const next = new Set();
      for (const id of prev) if (valid.has(id)) next.add(id);
      return next.size === prev.size ? prev : next;
    });
  }, [records]);

  if (!records || records.length === 0) {
    return <p className="text-gray-500 text-sm">No records in this report.</p>;
  }

  const triageRecords = records.filter(
    (r) => (r.state || "unknown_failure") === "unknown_failure",
  );

  const allSelected = selected.size > 0 && selected.size === records.length;
  const someSelected = selected.size > 0 && !allSelected;

  const toggleOne = (id, checked) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const toggleAll = () => {
    setSelected((prev) =>
      prev.size === records.length ? new Set() : new Set(records.map((r) => r.id)),
    );
  };

  const selectTriage = () => {
    setSelected(new Set(triageRecords.map((r) => r.id)));
  };

  const clearSelection = () => setSelected(new Set());

  const bulkClassify = async (classification) => {
    if (selected.size === 0 || bulkBusy) return;
    setBulkBusy(true);
    try {
      // Dedupe by (match_type, match_value) so we don't send identical writes.
      const seen = new Set();
      const tasks = [];
      for (const rec of records) {
        if (!selected.has(rec.id)) continue;
        // Prefer source_ip, fall back to header_from / envelope_from.
        let match_type = null;
        let match_value = null;
        if (rec.source_ip) {
          match_type = "source_ip";
          match_value = rec.source_ip;
        } else if (rec.header_from) {
          match_type = "header_from";
          match_value = rec.header_from;
        } else if (rec.envelope_from) {
          match_type = "envelope_from";
          match_value = rec.envelope_from;
        }
        if (!match_value) continue;
        const key = `${match_type}|${match_value.toLowerCase()}`;
        if (seen.has(key)) continue;
        seen.add(key);
        tasks.push(
          api.createClassification({
            policy_domain: policyDomain,
            match_type,
            match_value,
            classification,
          }),
        );
      }
      await Promise.all(tasks);
      setSelected(new Set());
      onClassified?.();
    } finally {
      setBulkBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="text-[11px] text-gray-500">
          {selected.size > 0 ? (
            <span className="text-gray-300">
              {selected.size} selected
            </span>
          ) : triageRecords.length > 0 ? (
            <button
              onClick={selectTriage}
              className="text-amber-400 hover:text-amber-300 transition-colors"
            >
              Select {triageRecords.length} needing triage
            </button>
          ) : (
            <span>All records classified.</span>
          )}
        </div>
        {selected.size > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              onClick={() => bulkClassify("trusted")}
              disabled={bulkBusy}
              className="inline-flex items-center gap-1 px-2 py-1 rounded bg-green-500/10 text-green-300 hover:bg-green-500/20 text-[11px] font-medium border border-green-500/20 disabled:opacity-50"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              Mark trusted
            </button>
            <button
              onClick={() => bulkClassify("unauthorized")}
              disabled={bulkBusy}
              className="inline-flex items-center gap-1 px-2 py-1 rounded bg-sky-500/10 text-sky-300 hover:bg-sky-500/20 text-[11px] font-medium border border-sky-500/20 disabled:opacity-50"
            >
              <ShieldOff className="w-3.5 h-3.5" />
              Mark unauthorized
            </button>
            <button
              onClick={() => bulkClassify("ignored")}
              disabled={bulkBusy}
              className="inline-flex items-center gap-1 px-2 py-1 rounded bg-gray-500/10 text-gray-300 hover:bg-gray-500/20 text-[11px] font-medium border border-gray-500/20 disabled:opacity-50"
            >
              <EyeOff className="w-3.5 h-3.5" />
              Ignore
            </button>
            <button
              onClick={clearSelection}
              disabled={bulkBusy}
              className="inline-flex items-center gap-1 px-2 py-1 rounded text-gray-400 hover:text-gray-200 hover:bg-gray-800 text-[11px] disabled:opacity-50"
              title="Clear selection"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      <table className="w-full text-xs">
        <thead>
          <tr className="text-left border-b border-gray-800">
            <th className="px-3 py-2 w-8">
              <input
                type="checkbox"
                aria-label="Select all records"
                className="accent-indigo-500"
                checked={allSelected}
                ref={(el) => {
                  if (el) el.indeterminate = someSelected;
                }}
                onChange={toggleAll}
              />
            </th>
            <th className="px-3 py-2 text-gray-400">State</th>
            <th className="px-3 py-2 text-gray-400">Source IP</th>
            <th className="px-3 py-2 text-gray-400">Count</th>
            <th className="px-3 py-2 text-gray-400">DKIM</th>
            <th className="px-3 py-2 text-gray-400">SPF</th>
            <th className="px-3 py-2 text-gray-400">DKIM Align</th>
            <th className="px-3 py-2 text-gray-400">SPF Align</th>
            <th className="px-3 py-2 text-gray-400">Envelope From</th>
            <th className="px-3 py-2 text-gray-400">Header From</th>
            <th className="px-3 py-2 text-gray-400 w-8"></th>
          </tr>
        </thead>
        <tbody>
          {records.map((rec) => {
            const state = rec.state || "unknown_failure";
            const dkimPass = rec.dkim_alignment === "pass";
            const spfPass = rec.spf_alignment === "pass";
            const isSelected = selected.has(rec.id);
            return (
              <tr
                key={rec.id}
                className={`border-b border-gray-900 ${rowStateBg(state)} ${
                  isSelected ? "bg-indigo-500/10" : ""
                }`}
              >
                <td className="px-3 py-2">
                  <input
                    type="checkbox"
                    aria-label={`Select record ${rec.id}`}
                    className="accent-indigo-500"
                    checked={isSelected}
                    onChange={(e) => toggleOne(rec.id, e.target.checked)}
                  />
                </td>
                <td className="px-3 py-2">
                  <StateBadge state={state} />
                </td>
                <td className="px-3 py-2 font-mono text-gray-300">
                  {rec.source_ip}
                </td>
                <td className="px-3 py-2 text-gray-300">{rec.count}</td>
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
                <td className="px-3 py-2">
                  <ClassifyMenu
                    record={rec}
                    policyDomain={policyDomain}
                    onChanged={onClassified}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
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
