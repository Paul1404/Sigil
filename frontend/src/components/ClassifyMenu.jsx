import { useState, useRef, useEffect, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
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

const MENU_WIDTH = 288; // matches w-72

export default function ClassifyMenu({ record, policyDomain, onChanged }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [coords, setCoords] = useState(null);
  const buttonRef = useRef(null);
  const menuRef = useRef(null);

  // Position the menu using fixed coords so it escapes parent overflow-hidden.
  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return;
    const updatePosition = () => {
      const rect = buttonRef.current.getBoundingClientRect();
      const viewportW = window.innerWidth;
      const viewportH = window.innerHeight;
      const menuH = menuRef.current?.offsetHeight ?? 0;

      let left = rect.right - MENU_WIDTH;
      if (left < 8) left = 8;
      if (left + MENU_WIDTH > viewportW - 8) left = viewportW - MENU_WIDTH - 8;

      // Flip upward if not enough space below.
      const spaceBelow = viewportH - rect.bottom;
      const top =
        menuH > 0 && spaceBelow < menuH + 12 && rect.top > menuH + 12
          ? rect.top - menuH - 4
          : rect.bottom + 4;

      setCoords({ top, left });
    };
    updatePosition();
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);
    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (buttonRef.current?.contains(e.target)) return;
      if (menuRef.current?.contains(e.target)) return;
      setOpen(false);
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
    <>
      <button
        ref={buttonRef}
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
      {open &&
        createPortal(
          <div
            ref={menuRef}
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "fixed",
              top: coords?.top ?? -9999,
              left: coords?.left ?? -9999,
              width: MENU_WIDTH,
              visibility: coords ? "visible" : "hidden",
            }}
            className="bg-gray-900 border border-gray-700 rounded-lg shadow-xl z-50 p-2"
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
                  <div className="text-[11px] text-gray-400 px-2 mb-1">
                    {label}
                  </div>
                  <div className="flex flex-col">
                    {OPTIONS.map((o) => {
                      const Icon = o.icon;
                      return (
                        <button
                          key={`${match_type}-${o.classification}`}
                          onClick={() => classify(match_type, o.classification)}
                          className="flex items-start gap-2 px-2 py-1.5 hover:bg-gray-800 rounded text-left"
                        >
                          <Icon
                            className={`w-4 h-4 mt-0.5 shrink-0 ${o.color}`}
                          />
                          <div>
                            <div className="text-xs text-gray-200">
                              {o.label}
                            </div>
                            <div className="text-[10px] text-gray-500">
                              {o.hint}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
