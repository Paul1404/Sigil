import { useState, useEffect, useCallback } from "react";
import { Plus, Trash2, ShieldCheck, ShieldOff, EyeOff } from "lucide-react";
import { api } from "../api";

const CLASS_OPTIONS = [
  { value: "trusted", label: "Trusted", icon: ShieldCheck, color: "text-green-400" },
  { value: "unauthorized", label: "Unauthorized", icon: ShieldOff, color: "text-sky-400" },
  { value: "ignored", label: "Ignored", icon: EyeOff, color: "text-gray-400" },
];

const MATCH_OPTIONS = [
  { value: "domain", label: "Whole domain" },
  { value: "source_ip", label: "Source IP" },
  { value: "header_from", label: "Header From" },
  { value: "envelope_from", label: "Envelope From" },
];

function classMeta(value) {
  return CLASS_OPTIONS.find((c) => c.value === value) || CLASS_OPTIONS[2];
}

export default function ClassificationsManager() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showAdd, setShowAdd] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getClassifications();
      setRows(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleDelete = async (id) => {
    if (!confirm("Remove this classification?")) return;
    try {
      await api.deleteClassification(id);
      load();
    } catch (e) {
      setError(e.message);
    }
  };

  const handleAdd = async (payload) => {
    try {
      await api.createClassification(payload);
      setShowAdd(false);
      load();
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-white">Source Classifications</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Tell Sigil which sources are real, which are known spoofs, and which to ignore.
          </p>
        </div>
        <button
          onClick={() => setShowAdd((v) => !v)}
          className="flex items-center gap-2 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium rounded-lg transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Add rule
        </button>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-red-400 text-xs">
          {error}
        </div>
      )}

      {showAdd && (
        <AddForm
          onSubmit={handleAdd}
          onCancel={() => setShowAdd(false)}
        />
      )}

      {loading ? (
        <div className="text-xs text-gray-500">Loading...</div>
      ) : rows.length === 0 ? (
        <div className="text-center py-8 text-gray-500 text-sm bg-gray-900/50 border border-gray-800 rounded-xl">
          No classifications yet. Add rules here, or click the menu next to any
          record on the Reports page.
        </div>
      ) : (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-left">
                <th className="px-4 py-3 text-gray-400 font-medium text-xs">Domain</th>
                <th className="px-4 py-3 text-gray-400 font-medium text-xs">Match</th>
                <th className="px-4 py-3 text-gray-400 font-medium text-xs">Value</th>
                <th className="px-4 py-3 text-gray-400 font-medium text-xs">Classification</th>
                <th className="px-4 py-3 text-gray-400 font-medium text-xs">Notes</th>
                <th className="px-4 py-3 text-gray-400 font-medium text-xs w-10"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const meta = classMeta(row.classification);
                const Icon = meta.icon;
                return (
                  <tr key={row.id} className="border-b border-gray-800/50">
                    <td className="px-4 py-3 font-mono text-gray-200 text-xs">
                      {row.policy_domain}
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs">
                      {MATCH_OPTIONS.find((m) => m.value === row.match_type)?.label ||
                        row.match_type}
                    </td>
                    <td className="px-4 py-3 font-mono text-gray-200 text-xs">
                      {row.match_value}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 text-xs ${meta.color}`}>
                        <Icon className="w-3.5 h-3.5" />
                        {meta.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {row.notes || ""}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleDelete(row.id)}
                        className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-gray-800 rounded transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
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

function AddForm({ onSubmit, onCancel }) {
  const [policyDomain, setPolicyDomain] = useState("");
  const [matchType, setMatchType] = useState("domain");
  const [matchValue, setMatchValue] = useState("");
  const [classification, setClassification] = useState("ignored");
  const [notes, setNotes] = useState("");

  // For whole-domain rules, match_value mirrors the policy_domain.
  const resolvedMatchValue = matchType === "domain" ? policyDomain : matchValue;

  const submit = (e) => {
    e.preventDefault();
    if (!policyDomain || !resolvedMatchValue) return;
    onSubmit({
      policy_domain: policyDomain,
      match_type: matchType,
      match_value: resolvedMatchValue,
      classification,
      notes: notes || null,
    });
  };

  return (
    <form
      onSubmit={submit}
      className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3"
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-gray-400 mb-1">Policy domain</label>
          <input
            type="text"
            value={policyDomain}
            onChange={(e) => setPolicyDomain(e.target.value)}
            placeholder="example.com"
            className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
            required
          />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">Match type</label>
          <select
            value={matchType}
            onChange={(e) => setMatchType(e.target.value)}
            className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
          >
            {MATCH_OPTIONS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
        {matchType !== "domain" && (
          <div className="sm:col-span-2">
            <label className="block text-xs text-gray-400 mb-1">Match value</label>
            <input
              type="text"
              value={matchValue}
              onChange={(e) => setMatchValue(e.target.value)}
              placeholder={
                matchType === "source_ip"
                  ? "89.107.70.8"
                  : matchType === "header_from"
                    ? "old.example.com"
                    : "mailer.example.com"
              }
              className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
              required
            />
          </div>
        )}
        <div>
          <label className="block text-xs text-gray-400 mb-1">Classification</label>
          <select
            value={classification}
            onChange={(e) => setClassification(e.target.value)}
            className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
          >
            {CLASS_OPTIONS.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">Notes (optional)</label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Why this rule exists"
            className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
          />
        </div>
      </div>
      <div className="flex gap-2 justify-end">
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1.5 text-xs text-gray-400 hover:text-white"
        >
          Cancel
        </button>
        <button
          type="submit"
          className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium rounded-lg"
        >
          Save rule
        </button>
      </div>
    </form>
  );
}
