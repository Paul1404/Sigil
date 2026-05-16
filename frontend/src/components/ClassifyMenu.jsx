import { useState, useRef, useEffect } from "react";
import { MoreHorizontal, ShieldCheck, ShieldOff, EyeOff } from "lucide-react";
import { api } from "../api";

const OPTIONS = [
  {
    classification: "trusted",
    label: "Mark source as trusted",
    hint: "Real sender. Failures should be investigated.",
    icon: ShieldCheck,
    color: "text-green-400",
  },
  {
    classification: "unauthorized",
    label: "Mark source as unauthorized",
    hint: "Known spoof. Failures are the desired outcome.",
    icon: ShieldOff,
    color: "text-sky-400",
  },
  {
    classification: "ignored",
    label: "Ignore source",
    hint: "Misdetected or otherwise excluded from metrics.",
    icon: EyeOff,
    color: "text-gray-300",
  },
];

const MATCH_OPTIONS = [
  { match_type: "source_ip", label: "this source IP" },
  { match_type: "header_from", label: "this header From" },
  { match_type: "envelope_from", label: "this envelope From" },
];

export default function ClassifyMenu({ record, policyDomain, onChanged }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    window.addEventListener("mousedown", handler);
    return () => window.removeEventListener("mousedown", handler);
  }, [open]);

  const availableMatchOptions = MATCH_OPTIONS.filter(({ match_type }) => {
    if (match_type === "source_ip") return !!record.source_ip;
    if (match_type === "header_from") return !!record.header_from;
    if (match_type === "envelope_from") return !!record.envelope_from;
    return false;
  });

  const classify = async (match_type, classification) => {
    let match_value;
    if (match_type === "source_ip") match_value = record.source_ip;
    else if (match_type === "header_from") match_value = record.header_from;
    else if (match_type === "envelope_from") match_value = record.envelope_from;
    if (!match_value) return;

    setBusy(true);
    try {
      await api.createClassification({
        policy_domain: policyDomain,
        match_type,
        match_value,
        classification,
      });
      setOpen(false);
      onChanged?.();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        disabled={busy}
        className="p-1 rounded hover:bg-gray-800 text-gray-500 hover:text-gray-300 transition-colors disabled:opacity-50"
        title="Classify this source"
      >
        <MoreHorizontal className="w-4 h-4" />
      </button>
      {open && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute right-0 top-full mt-1 w-72 bg-gray-900 border border-gray-700 rounded-lg shadow-xl z-20 p-2"
        >
          <div className="text-[10px] uppercase tracking-wide text-gray-500 px-2 py-1">
            Match
          </div>
          {availableMatchOptions.length === 0 ? (
            <div className="text-xs text-gray-500 px-2 py-2">
              No matchable fields on this record.
            </div>
          ) : (
            availableMatchOptions.map(({ match_type, label }) => (
              <div key={match_type} className="mb-2">
                <div className="text-[11px] text-gray-400 px-2 mb-1">{label}</div>
                <div className="flex flex-col">
                  {OPTIONS.map((o) => {
                    const Icon = o.icon;
                    return (
                      <button
                        key={`${match_type}-${o.classification}`}
                        onClick={() => classify(match_type, o.classification)}
                        className="flex items-start gap-2 px-2 py-1.5 hover:bg-gray-800 rounded text-left"
                      >
                        <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${o.color}`} />
                        <div>
                          <div className="text-xs text-gray-200">{o.label}</div>
                          <div className="text-[10px] text-gray-500">{o.hint}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
