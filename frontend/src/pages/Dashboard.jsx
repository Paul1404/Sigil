import { useState, useEffect } from "react";
import { FileText, Globe, CheckCircle, Clock } from "lucide-react";
import { api } from "../api";
import StatsCard from "../components/StatsCard";
import TimelineChart from "../components/TimelineChart";

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [timeline, setTimeline] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    Promise.all([api.getStats(), api.getTimeline()])
      .then(([s, t]) => {
        setStats(s);
        setTimeline(t);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-6 text-red-400">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-white">Dashboard</h2>
        <p className="text-sm text-gray-500 mt-1">
          Overview of your email authentication posture
        </p>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard
          icon={FileText}
          label="Total Reports"
          value={stats?.total_reports ?? 0}
        />
        <StatsCard
          icon={Globe}
          label="Domains Seen"
          value={stats?.total_domains ?? 0}
        />
        <StatsCard
          icon={CheckCircle}
          label="Pass Rate"
          value={`${stats?.overall_pass_rate ?? 0}%`}
          sub={`${stats?.total_messages ?? 0} total messages`}
        />
        <StatsCard
          icon={Clock}
          label="Last Report"
          value={
            stats?.last_report_date
              ? new Date(stats.last_report_date).toLocaleDateString()
              : "N/A"
          }
        />
      </div>

      {/* Timeline chart */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-white mb-4">
          Pass/Fail Timeline
        </h3>
        <TimelineChart data={timeline} />
      </div>

      {/* Top senders */}
      {stats?.top_senders?.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-white mb-4">
            Top Sending Sources
          </h3>
          <div className="space-y-2">
            {stats.top_senders.map((s, i) => (
              <div
                key={i}
                className="flex items-center justify-between py-2 px-3 rounded-lg bg-gray-950"
              >
                <span className="text-sm text-gray-300 font-mono">
                  {s.source_ip}
                </span>
                <span className="text-sm text-gray-400">
                  {s.count.toLocaleString()} messages
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
