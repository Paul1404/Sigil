import StatusBadge from "./StatusBadge";

export default function DnsResultCard({ result }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-white">{result.check_type}</h3>
        <StatusBadge status={result.status} />
      </div>
      {result.value && (
        <pre className="text-xs text-gray-400 bg-gray-950 rounded-lg p-3 overflow-x-auto mb-2 whitespace-pre-wrap break-all">
          {result.value}
        </pre>
      )}
      {result.details && (
        <p className="text-xs text-gray-500">{result.details}</p>
      )}
    </div>
  );
}
