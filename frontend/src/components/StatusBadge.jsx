const colors = {
  pass: "bg-green-500/10 text-green-400 border-green-500/20",
  warn: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  fail: "bg-red-500/10 text-red-400 border-red-500/20",
};

export default function StatusBadge({ status }) {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${colors[status] || colors.fail}`}
    >
      {status.toUpperCase()}
    </span>
  );
}
