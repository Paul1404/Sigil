export default function StatsCard({ icon: Icon, label, value, sub }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
      <div className="flex items-center gap-3 mb-3">
        <div className="p-2 bg-indigo-500/10 rounded-lg">
          <Icon className="w-5 h-5 text-indigo-400" />
        </div>
        <span className="text-sm text-gray-400">{label}</span>
      </div>
      <p className="text-3xl font-bold text-white">{value}</p>
      {sub && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
    </div>
  );
}
