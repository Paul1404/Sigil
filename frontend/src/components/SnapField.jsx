// Label/value field used inside "snap-in" table rows: on narrow screens the
// right-most table columns are hidden and their values re-appear as these
// fields in a full-width strip below the remaining cells of the row.
export default function SnapField({ label, children }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-wide text-gray-500">
        {label}
      </div>
      <div className="text-gray-300 break-words">{children}</div>
    </div>
  );
}
