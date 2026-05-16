import {
  ShieldCheck,
  ShieldAlert,
  ShieldOff,
  EyeOff,
  HelpCircle,
} from "lucide-react";

export const STATE_META = {
  aligned: {
    label: "Aligned",
    short: "Authenticated",
    color: "text-green-400",
    bg: "bg-green-500/10",
    border: "border-green-500/20",
    icon: ShieldCheck,
    description: "DKIM or SPF aligned with the From domain. Real mail, authenticated.",
  },
  misaligned_legitimate: {
    label: "Real mail failing",
    short: "Needs fix",
    color: "text-red-400",
    bg: "bg-red-500/10",
    border: "border-red-500/20",
    icon: ShieldAlert,
    description: "Source is marked trusted but failed alignment. Investigate.",
  },
  rejected_spoof: {
    label: "Spoof blocked",
    short: "Blocked",
    color: "text-sky-400",
    bg: "bg-sky-500/10",
    border: "border-sky-500/20",
    icon: ShieldOff,
    description: "Unauthorized sender rejected by DMARC policy. Working as intended.",
  },
  ignored: {
    label: "Ignored",
    short: "Ignored",
    color: "text-gray-400",
    bg: "bg-gray-500/10",
    border: "border-gray-500/20",
    icon: EyeOff,
    description: "Excluded from health metrics by user classification.",
  },
  unknown_failure: {
    label: "Needs triage",
    short: "Triage",
    color: "text-amber-400",
    bg: "bg-amber-500/10",
    border: "border-amber-500/20",
    icon: HelpCircle,
    description: "Failing source not yet classified. Decide if it's a real sender or a spoof.",
  },
};

export function StateBadge({ state, size = "sm" }) {
  const meta = STATE_META[state] || STATE_META.unknown_failure;
  const Icon = meta.icon;
  const sizing = size === "xs" ? "text-[10px] px-1.5 py-0.5" : "text-xs px-2 py-0.5";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border font-medium ${meta.bg} ${meta.color} ${meta.border} ${sizing}`}
      title={meta.description}
    >
      <Icon className="w-3 h-3" />
      {meta.short}
    </span>
  );
}
