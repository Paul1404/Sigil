import { useState, useEffect, useMemo, useCallback, useRef } from "react";
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
  Undo2,
  SkipForward,
  Sparkles,
  Zap,
  Keyboard,
  CheckCircle2,
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
  const [triageCount, setTriageCount] = useState(null);

  const refreshTriageCount = useCallback(async () => {
    try {
      const q = await api.getTriageQueue();
      setTriageCount(q.length);
    } catch {
      setTriageCount(null);
    }
  }, []);

  useEffect(() => {
    refreshTriageCount();
  }, [refreshTriageCount]);

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
          onClick={() => setActiveTab("triage")}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-colors inline-flex items-center gap-2 ${
            activeTab === "triage"
              ? "bg-indigo-600 text-white"
              : "text-gray-400 hover:text-gray-200"
          }`}
        >
          <Zap className="w-3.5 h-3.5" />
          Triage Queue
          {triageCount !== null && triageCount > 0 && (
            <span
              className={`inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full text-[10px] font-semibold ${
                activeTab === "triage"
                  ? "bg-white/20 text-white"
                  : "bg-amber-500/20 text-amber-300"
              }`}
            >
              {triageCount}
            </span>
          )}
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

      {activeTab === "dmarc" && (
        <DmarcReportsTab
          triageCount={triageCount}
          onOpenTriage={() => setActiveTab("triage")}
          onClassificationChanged={refreshTriageCount}
        />
      )}
      {activeTab === "triage" && (
        <TriageQueueTab onChanged={refreshTriageCount} />
      )}
      {activeTab === "tls" && <TlsReportsTab />}
    </div>
  );
}

function DmarcReportsTab({ triageCount, onOpenTriage, onClassificationChanged }) {
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
    onClassificationChanged?.();
  }, [fetchAll, refreshDetailIfOpen, onClassificationChanged]);

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

      {/* Triage queue CTA */}
      {triageCount > 0 && (
        <button
          onClick={onOpenTriage}
          className="w-full flex items-center justify-between gap-4 p-4 rounded-xl border border-amber-500/30 bg-amber-500/5 hover:bg-amber-500/10 hover:border-amber-500/50 transition-colors text-left group"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-medium text-white">
                {triageCount} source{triageCount !== 1 ? "s" : ""} waiting to
                triage
              </div>
              <div className="text-xs text-gray-400">
                Open the focused queue to classify them quickly with keyboard
                shortcuts.
              </div>
            </div>
          </div>
          <div className="inline-flex items-center gap-2 text-amber-300 text-sm font-medium group-hover:text-amber-200">
            Open queue
            <ChevronRight className="w-4 h-4" />
          </div>
        </button>
      )}

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

/* ===================== Triage Queue Tab ===================== */

function TriageQueueTab({ onChanged }) {
  const [queue, setQueue] = useState(null); // null = loading
  const [error, setError] = useState(null);
  const [cursor, setCursor] = useState(0);
  const [history, setHistory] = useState([]); // [{ item, classification, classificationId }]
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const q = await api.getTriageQueue();
      setQueue(q);
      setCursor(0);
      setHistory([]);
    } catch (e) {
      setError(e.message);
      setQueue([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const showToast = useCallback((msg, tone = "default") => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ msg, tone });
    toastTimer.current = setTimeout(() => setToast(null), 4000);
  }, []);

  useEffect(() => () => toastTimer.current && clearTimeout(toastTimer.current), []);

  const current = queue && cursor < queue.length ? queue[cursor] : null;
  const remaining = queue ? Math.max(0, queue.length - cursor) : 0;
  const total = queue?.length ?? 0;
  const done = total - remaining;

  const classify = useCallback(
    async (classification) => {
      if (!current || busy) return;
      setBusy(true);
      const item = current;
      try {
        const row = await api.createClassification({
          policy_domain: item.policy_domain,
          match_type: "source_ip",
          match_value: item.source_ip,
          classification,
        });
        setHistory((h) => [
          ...h,
          { item, classification, classificationId: row.id },
        ]);
        setCursor((c) => c + 1);
        const labels = {
          trusted: "marked as trusted",
          unauthorized: "marked as unauthorized",
          ignored: "ignored",
        };
        showToast(`${item.source_ip} ${labels[classification]}`, classification);
        onChanged?.();
      } catch (e) {
        setError(e.message);
      } finally {
        setBusy(false);
      }
    },
    [current, busy, onChanged, showToast],
  );

  const skip = useCallback(() => {
    if (!current || busy) return;
    setCursor((c) => c + 1);
  }, [current, busy]);

  const undo = useCallback(async () => {
    if (busy || history.length === 0 || !queue) return;
    const last = history[history.length - 1];
    setBusy(true);
    try {
      await api.deleteClassification(last.classificationId);
      setHistory((h) => h.slice(0, -1));
      // Items stay in the queue when classified; find the undone item and
      // rewind the cursor to it so the user can re-decide.
      const idx = queue.findIndex(
        (q) =>
          q.source_ip === last.item.source_ip &&
          q.policy_domain === last.item.policy_domain,
      );
      setCursor(idx >= 0 ? idx : Math.max(0, cursor - 1));
      showToast(`Undid ${last.item.source_ip}`, "default");
      onChanged?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }, [busy, history, queue, cursor, onChanged, showToast]);

  // Keyboard shortcuts. Active whenever this tab is mounted and not typing in an input.
  useEffect(() => {
    const handler = (e) => {
      const tag = e.target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || e.target?.isContentEditable) {
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === "t") {
        e.preventDefault();
        classify("trusted");
      } else if (k === "u") {
        e.preventDefault();
        classify("unauthorized");
      } else if (k === "i") {
        e.preventDefault();
        classify("ignored");
      } else if (k === "s" || k === "arrowright" || k === "j") {
        e.preventDefault();
        skip();
      } else if (k === "z") {
        e.preventDefault();
        undo();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [classify, skip, undo]);

  if (queue === null) {
    return (
      <div className="flex items-center justify-center h-32">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-400" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Help banner */}
      <div className="bg-indigo-500/5 border border-indigo-500/20 rounded-xl p-4 flex gap-3 items-start">
        <Sparkles className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
        <div className="text-sm text-gray-400">
          <span className="text-indigo-300 font-medium">Focused triage.</span>{" "}
          Each card is one source IP appearing across one or many reports.
          Classify it once and it dispositions every matching record. Use
          keyboard shortcuts to fly through them.
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Progress */}
      <div className="flex items-center justify-between gap-4">
        <div className="text-sm text-gray-400">
          {total === 0 ? (
            <span>Nothing to triage.</span>
          ) : remaining === 0 ? (
            <span className="text-green-400 inline-flex items-center gap-1">
              <CheckCircle2 className="w-4 h-4" />
              Queue cleared. {done} classified this session.
            </span>
          ) : (
            <span>
              <span className="text-white font-medium">{done}</span> of{" "}
              <span className="text-white font-medium">{total}</span> classified
              <span className="text-gray-500">
                {" "}
                &middot; {remaining} remaining
              </span>
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {history.length > 0 && (
            <button
              onClick={undo}
              disabled={busy}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs text-gray-400 hover:text-white hover:bg-gray-800 rounded-md transition-colors disabled:opacity-50"
              title="Undo last action (Z)"
            >
              <Undo2 className="w-3.5 h-3.5" />
              Undo
            </button>
          )}
          <button
            onClick={load}
            className="px-3 py-1.5 text-xs text-gray-400 hover:text-white hover:bg-gray-800 rounded-md transition-colors"
            title="Reload queue"
          >
            Refresh
          </button>
        </div>
      </div>

      {total > 0 && (
        <div className="h-1 bg-gray-900 rounded-full overflow-hidden">
          <div
            className="h-full bg-indigo-500 transition-all duration-300"
            style={{ width: `${total === 0 ? 0 : (done / total) * 100}%` }}
          />
        </div>
      )}

      {/* Main card */}
      {current ? (
        <TriageCard
          item={current}
          peek={queue.slice(cursor + 1, cursor + 4)}
          busy={busy}
          onClassify={classify}
          onSkip={skip}
        />
      ) : total > 0 ? (
        <div className="rounded-xl border border-green-500/30 bg-green-500/5 p-10 text-center">
          <CheckCircle2 className="w-12 h-12 text-green-400 mx-auto mb-3" />
          <div className="text-lg font-medium text-white">All caught up.</div>
          <div className="text-sm text-gray-400 mt-1">
            You classified {done} source{done !== 1 ? "s" : ""} in this session.
          </div>
          <button
            onClick={load}
            className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors"
          >
            Refresh queue
          </button>
        </div>
      ) : (
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-10 text-center">
          <CheckCircle2 className="w-12 h-12 text-gray-600 mx-auto mb-3" />
          <div className="text-lg font-medium text-white">
            Nothing to triage.
          </div>
          <div className="text-sm text-gray-500 mt-1">
            Every failing source has been classified. New unclassified sources
            will appear here when fresh reports arrive.
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div
          className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-3 rounded-lg shadow-xl border backdrop-blur text-sm flex items-center gap-3 ${
            toast.tone === "trusted"
              ? "bg-green-500/15 border-green-500/30 text-green-200"
              : toast.tone === "unauthorized"
                ? "bg-sky-500/15 border-sky-500/30 text-sky-200"
                : toast.tone === "ignored"
                  ? "bg-gray-700/40 border-gray-600 text-gray-200"
                  : "bg-gray-800 border-gray-700 text-gray-200"
          }`}
        >
          <span>{toast.msg}</span>
          {history.length > 0 && (
            <button
              onClick={undo}
              className="text-xs underline underline-offset-2 hover:no-underline"
            >
              Undo
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function TriageCard({ item, peek, busy, onClassify, onSkip }) {
  const headerFromMatchesDomain =
    item.header_from.length === 1 &&
    item.header_from[0].toLowerCase() === item.policy_domain.toLowerCase();

  const dkimAllFail =
    item.dkim_results.length > 0 &&
    item.dkim_results.every((r) => r !== "pass");
  const spfAllFail =
    item.spf_results.length > 0 && item.spf_results.every((r) => r !== "pass");
  const dispositionRejected = item.dispositions.some(
    (d) => d === "reject" || d === "quarantine",
  );

  // Heuristic hints to help the user decide quickly.
  const hints = [];
  if (headerFromMatchesDomain) {
    hints.push({
      tone: "warn",
      text: "Header From matches your domain. If this is a real sender, mark trusted and fix SPF/DKIM.",
    });
  } else if (item.header_from.length > 0) {
    hints.push({
      tone: "info",
      text: `Header From is ${item.header_from.join(", ")}, not your domain. Often a third party.`,
    });
  }
  if (dkimAllFail && spfAllFail) {
    hints.push({
      tone: "danger",
      text: "Both DKIM and SPF fail. Looks like a spoof unless you recognise this sender.",
    });
  }
  if (dispositionRejected) {
    hints.push({
      tone: "info",
      text: "DMARC already rejected/quarantined. Marking unauthorized confirms it.",
    });
  }

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-800 flex items-baseline justify-between gap-4 flex-wrap">
        <div>
          <div className="text-xs uppercase tracking-wide text-gray-500 mb-1">
            Source IP
          </div>
          <div className="text-2xl font-mono text-white">{item.source_ip}</div>
        </div>
        <div className="text-right">
          <div className="text-xs uppercase tracking-wide text-gray-500 mb-1">
            Impact
          </div>
          <div className="text-white">
            <span className="text-2xl font-semibold">
              {item.total_count.toLocaleString()}
            </span>
            <span className="text-sm text-gray-400 ml-1">
              msg{item.total_count !== 1 ? "s" : ""}
            </span>
          </div>
          <div className="text-xs text-gray-500 mt-0.5">
            across {item.report_count} report{item.report_count !== 1 ? "s" : ""}
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="px-6 py-5 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <Field
            label="Policy domain"
            value={
              <span className="font-mono text-white">{item.domain}</span>
            }
          />
          <Field
            label="Date range"
            value={
              <span className="text-gray-300">
                {item.first_seen
                  ? new Date(item.first_seen).toLocaleDateString()
                  : "?"}
                {" - "}
                {item.last_seen
                  ? new Date(item.last_seen).toLocaleDateString()
                  : "?"}
              </span>
            }
          />
          <Field
            label="Header From"
            value={
              item.header_from.length === 0 ? (
                <span className="text-gray-500">-</span>
              ) : (
                <div className="flex flex-wrap gap-1">
                  {item.header_from.map((h) => (
                    <span
                      key={h}
                      className={`px-2 py-0.5 rounded font-mono text-xs ${
                        h.toLowerCase() === item.policy_domain.toLowerCase()
                          ? "bg-amber-500/10 text-amber-200 border border-amber-500/20"
                          : "bg-gray-800 text-gray-200"
                      }`}
                    >
                      {h}
                    </span>
                  ))}
                </div>
              )
            }
          />
          <Field
            label="Envelope From"
            value={
              item.envelope_from.length === 0 ? (
                <span className="text-gray-500">-</span>
              ) : (
                <div className="flex flex-wrap gap-1">
                  {item.envelope_from.map((h) => (
                    <span
                      key={h}
                      className="px-2 py-0.5 rounded font-mono text-xs bg-gray-800 text-gray-200"
                    >
                      {h}
                    </span>
                  ))}
                </div>
              )
            }
          />
          <Field
            label="DKIM"
            value={
              <div className="flex flex-wrap gap-1">
                {item.dkim_results.length === 0 ? (
                  <span className="text-gray-500">-</span>
                ) : (
                  item.dkim_results.map((r) => (
                    <span
                      key={r}
                      className={`px-2 py-0.5 rounded text-xs ${
                        r === "pass"
                          ? "bg-green-500/10 text-green-300"
                          : "bg-red-500/10 text-red-300"
                      }`}
                    >
                      {r}
                    </span>
                  ))
                )}
              </div>
            }
          />
          <Field
            label="SPF"
            value={
              <div className="flex flex-wrap gap-1">
                {item.spf_results.length === 0 ? (
                  <span className="text-gray-500">-</span>
                ) : (
                  item.spf_results.map((r) => (
                    <span
                      key={r}
                      className={`px-2 py-0.5 rounded text-xs ${
                        r === "pass"
                          ? "bg-green-500/10 text-green-300"
                          : "bg-red-500/10 text-red-300"
                      }`}
                    >
                      {r}
                    </span>
                  ))
                )}
              </div>
            }
          />
        </div>

        {hints.length > 0 && (
          <div className="space-y-1.5">
            {hints.map((h, i) => (
              <div
                key={i}
                className={`text-xs px-3 py-2 rounded-md border flex items-start gap-2 ${
                  h.tone === "danger"
                    ? "bg-red-500/5 border-red-500/20 text-red-200"
                    : h.tone === "warn"
                      ? "bg-amber-500/5 border-amber-500/20 text-amber-200"
                      : "bg-gray-800/60 border-gray-700 text-gray-300"
                }`}
              >
                <Info className="w-3.5 h-3.5 mt-0.5 shrink-0 opacity-80" />
                <span>{h.text}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="px-6 py-4 border-t border-gray-800 bg-gray-950/60 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <TriageAction
            onClick={() => onClassify("trusted")}
            disabled={busy}
            tone="trusted"
            shortcut="T"
            icon={ShieldCheck}
            label="Trusted"
          />
          <TriageAction
            onClick={() => onClassify("unauthorized")}
            disabled={busy}
            tone="unauthorized"
            shortcut="U"
            icon={ShieldOff}
            label="Unauthorized"
          />
          <TriageAction
            onClick={() => onClassify("ignored")}
            disabled={busy}
            tone="ignored"
            shortcut="I"
            icon={EyeOff}
            label="Ignore"
          />
          <button
            onClick={onSkip}
            disabled={busy}
            title="Skip without classifying (S)"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-gray-400 hover:text-white hover:bg-gray-800 disabled:opacity-50 transition-colors"
          >
            <SkipForward className="w-4 h-4" />
            Skip
            <kbd className="ml-1 px-1.5 py-0.5 text-[10px] font-mono bg-gray-800 text-gray-400 rounded border border-gray-700">
              S
            </kbd>
          </button>
        </div>
        <div className="text-xs text-gray-500 inline-flex items-center gap-1.5">
          <Keyboard className="w-3.5 h-3.5" />
          T / U / I to classify, S to skip, Z to undo
        </div>
      </div>

      {/* Peek at upcoming items */}
      {peek.length > 0 && (
        <div className="px-6 py-3 border-t border-gray-800 bg-gray-950/40">
          <div className="text-[10px] uppercase tracking-wide text-gray-500 mb-1.5">
            Up next
          </div>
          <div className="flex flex-col gap-1">
            {peek.map((p) => (
              <div
                key={`${p.policy_domain}|${p.source_ip}`}
                className="flex items-center justify-between text-xs text-gray-500"
              >
                <span className="font-mono">{p.source_ip}</span>
                <span>
                  {p.total_count.toLocaleString()} msg
                  {p.total_count !== 1 ? "s" : ""} &middot; {p.domain}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, value }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-gray-500 mb-1">
        {label}
      </div>
      <div>{value}</div>
    </div>
  );
}

function TriageAction({ onClick, disabled, tone, shortcut, icon: Icon, label }) {
  const tones = {
    trusted:
      "bg-green-500/10 border-green-500/30 text-green-200 hover:bg-green-500/20 hover:border-green-500/50",
    unauthorized:
      "bg-sky-500/10 border-sky-500/30 text-sky-200 hover:bg-sky-500/20 hover:border-sky-500/50",
    ignored:
      "bg-gray-700/40 border-gray-600 text-gray-200 hover:bg-gray-700/60 hover:border-gray-500",
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${tones[tone]}`}
    >
      <Icon className="w-4 h-4" />
      {label}
      <kbd className="ml-1 px-1.5 py-0.5 text-[10px] font-mono bg-black/30 rounded border border-white/10">
        {shortcut}
      </kbd>
    </button>
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
