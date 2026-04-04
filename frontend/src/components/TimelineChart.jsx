import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";

export default function TimelineChart({ data }) {
  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">
        No timeline data available
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
        <XAxis
          dataKey="date"
          stroke="#6b7280"
          tick={{ fill: "#9ca3af", fontSize: 12 }}
        />
        <YAxis stroke="#6b7280" tick={{ fill: "#9ca3af", fontSize: 12 }} />
        <Tooltip
          contentStyle={{
            backgroundColor: "#111827",
            border: "1px solid #374151",
            borderRadius: "8px",
            color: "#f3f4f6",
          }}
        />
        <Legend />
        <Line
          type="monotone"
          dataKey="passed"
          stroke="#22c55e"
          strokeWidth={2}
          dot={false}
          name="Passed"
        />
        <Line
          type="monotone"
          dataKey="failed"
          stroke="#ef4444"
          strokeWidth={2}
          dot={false}
          name="Failed"
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
