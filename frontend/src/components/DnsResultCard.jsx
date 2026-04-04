import { AlertTriangle, Lightbulb, ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";
import StatusBadge from "./StatusBadge";

function TlsaParsed({ records }) {
  if (!records?.length) return null;
  return (
    <div className="space-y-2 mt-2">
      {records.map((rec, i) => (
        <div key={i} className="bg-gray-950 rounded-lg p-3 text-xs space-y-1">
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            <span className="text-gray-400">
              Usage: <span className="text-indigo-300 font-medium">{rec.usage?.name}</span>
              <span className="text-gray-600"> ({rec.usage?.value})</span>
            </span>
            <span className="text-gray-400">
              Selector: <span className="text-indigo-300 font-medium">{rec.selector?.name}</span>
              <span className="text-gray-600"> ({rec.selector?.value})</span>
            </span>
            <span className="text-gray-400">
              Match: <span className="text-indigo-300 font-medium">{rec.matching_type?.name}</span>
              <span className="text-gray-600"> ({rec.matching_type?.value})</span>
            </span>
          </div>
          <p className="text-gray-600 text-[11px]">{rec.usage?.description}</p>
          {rec.cert_data_preview && (
            <p className="text-gray-600 font-mono text-[11px] break-all">
              Data: {rec.cert_data_preview}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

function DmarcParsed({ parsed }) {
  if (!parsed) return null;
  const tags = Object.entries(parsed);
  if (!tags.length) return null;
  return (
    <div className="mt-2 bg-gray-950 rounded-lg p-3">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-gray-600">
            <th className="text-left pr-3 pb-1 font-medium">Tag</th>
            <th className="text-left pr-3 pb-1 font-medium">Value</th>
            <th className="text-left pb-1 font-medium">Description</th>
          </tr>
        </thead>
        <tbody>
          {tags.map(([tag, info]) => (
            <tr key={tag} className="border-t border-gray-900">
              <td className="pr-3 py-1 text-indigo-300 font-mono font-medium">{tag}</td>
              <td className="pr-3 py-1 text-white font-mono">{info.value}</td>
              <td className="py-1 text-gray-500">{info.description}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function DnsResultCard({ result }) {
  const [expanded, setExpanded] = useState(false);
  const hasExtras =
    (result.warnings?.length > 0) ||
    (result.recommendations?.length > 0) ||
    result.parsed;

  const isTlsa = result.check_type === "TLSA";
  const isDmarc = result.check_type === "DMARC";

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-white">{result.check_type}</h3>
          {result.warnings?.length > 0 && (
            <span className="text-yellow-500 text-xs flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              {result.warnings.length}
            </span>
          )}
        </div>
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

      {hasExtras && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-3 flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
        >
          {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          {expanded ? "Hide" : "Show"} details
        </button>
      )}

      {expanded && (
        <div className="mt-3 space-y-3">
          {/* Parsed DMARC tags */}
          {isDmarc && result.parsed && <DmarcParsed parsed={result.parsed} />}

          {/* Parsed TLSA records */}
          {isTlsa && result.parsed?.records && (
            <TlsaParsed records={result.parsed.records} />
          )}

          {/* Warnings */}
          {result.warnings?.length > 0 && (
            <div className="space-y-1">
              {result.warnings.map((w, i) => (
                <div
                  key={i}
                  className="flex items-start gap-2 text-xs text-yellow-400 bg-yellow-500/5 border border-yellow-500/10 rounded-lg px-3 py-2"
                >
                  <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                  <span>{w}</span>
                </div>
              ))}
            </div>
          )}

          {/* Recommendations */}
          {result.recommendations?.length > 0 && (
            <div className="space-y-1">
              {result.recommendations.map((r, i) => (
                <div
                  key={i}
                  className="flex items-start gap-2 text-xs text-blue-400 bg-blue-500/5 border border-blue-500/10 rounded-lg px-3 py-2"
                >
                  <Lightbulb className="w-3 h-3 mt-0.5 shrink-0" />
                  <span>{r}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
