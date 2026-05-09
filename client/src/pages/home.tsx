import { useEffect, useState } from "react";
import { useStorage } from "@/hooks/use-storage";

type Period = "daily" | "weekly" | "monthly" | "lifetime";

interface Visit {
  timestamp: number;
  date: string;
}

interface VisitStats {
  total: number;
  visits: Visit[];
}

export default function Home() {
  const [period, setPeriod] = useState<Period>("lifetime");
  const { data, saveData } = useStorage();
  const [stats, setStats] = useState<VisitStats>({ total: 0, visits: [] });

  useEffect(() => {
    // Record visit
    const now = Date.now();
    const dateStr = new Date(now).toISOString();
    const visits = data?.visits || [];
    const newVisits = [...visits, { timestamp: now, date: dateStr }];
    saveData({ ...data, visits: newVisits });
  }, []);

  useEffect(() => {
    if (!data?.visits) return;

    const now = Date.now();
    const visits = data.visits as Visit[];
    let filtered: Visit[] = [];

    switch (period) {
      case "daily":
        const oneDayAgo = now - 24 * 60 * 60 * 1000;
        filtered = visits.filter(v => v.timestamp > oneDayAgo);
        break;
      case "weekly":
        const oneWeekAgo = now - 7 * 24 * 60 * 60 * 1000;
        filtered = visits.filter(v => v.timestamp > oneWeekAgo);
        break;
      case "monthly":
        const oneMonthAgo = now - 30 * 24 * 60 * 60 * 1000;
        filtered = visits.filter(v => v.timestamp > oneMonthAgo);
        break;
      case "lifetime":
      default:
        filtered = visits;
    }

    setStats({ total: filtered.length, visits: filtered });
  }, [period, data]);

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-4xl font-bold mb-8">Demon Finder Analytics</h1>
        
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-2xl font-semibold mb-4">Period View</h2>
          <div className="flex gap-4 mb-6">
            {(["daily", "weekly", "monthly", "lifetime"] as Period[]).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-6 py-2 rounded-lg font-medium transition-colors ${
                  period === p
                    ? "bg-blue-600 text-white"
                    : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                }`}
              >
                {p.charAt(0).toUpperCase() + p.slice(1)}
              </button>
            ))}
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-blue-50 p-6 rounded-lg">
              <h3 className="text-lg font-semibold mb-2">Total Visits</h3>
              <p className="text-4xl font-bold text-blue-600">{stats.total}</p>
            </div>
            
            <div className="bg-green-50 p-6 rounded-lg">
              <h3 className="text-lg font-semibold mb-2">Period</h3>
              <p className="text-4xl font-bold text-green-600">
                {period.charAt(0).toUpperCase() + period.slice(1)}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-2xl font-semibold mb-4">Recent Visits</h2>
          <div className="overflow-auto max-h-96">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-2">Date</th>
                  <th className="text-left p-2">Time</th>
                </tr>
              </thead>
              <tbody>
                {stats.visits.slice(-50).reverse().map((visit, i) => {
                  const d = new Date(visit.timestamp);
                  return (
                    <tr key={i} className="border-b hover:bg-gray-50">
                      <td className="p-2">{d.toLocaleDateString()}</td>
                      <td className="p-2">{d.toLocaleTimeString()}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
