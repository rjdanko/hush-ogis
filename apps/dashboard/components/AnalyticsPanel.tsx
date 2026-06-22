"use client";

import { useEffect, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

interface TrendPoint {
  day: string;
  avg_value: number;
  avg_active_count: number;
}

interface PeakWindow {
  hour_of_day: number | null;
  max_active_count: number | null;
}

interface Analytics {
  zone_name: string;
  window_days: number;
  quiet_index_trend: TrendPoint[];
  check_in_count: number;
  total_quiet_minutes: number;
  total_points_accrued: number;
  redemption_count: number;
  peak_window: PeakWindow;
}

export function AnalyticsPanel({ zoneId }: { zoneId: string }) {
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const response = await fetch("/api/analytics", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ zoneId }),
        });
        if (!response.ok) throw new Error("failed");
        const data = (await response.json()) as Analytics;
        if (!cancelled) setAnalytics(data);
      } catch {
        if (!cancelled) setError("Could not load analytics just now.");
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [zoneId]);

  if (error) {
    return <p className="text-sm font-light text-neutral-500">{error}</p>;
  }

  if (!analytics) {
    return <p className="text-sm font-light text-neutral-400">Loading analytics…</p>;
  }

  return (
    <section className="flex flex-col gap-4 rounded border border-neutral-200 p-4">
      <h2 className="text-sm uppercase tracking-wide text-neutral-500">{analytics.window_days}-day analytics</h2>

      {analytics.quiet_index_trend.length === 0 ? (
        <p className="text-sm font-light text-neutral-400">No Quiet Index history yet for this zone.</p>
      ) : (
        <div style={{ width: "100%", height: 200 }}>
          <ResponsiveContainer>
            <LineChart data={analytics.quiet_index_trend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
              <XAxis dataKey="day" tick={{ fontSize: 11 }} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Line type="monotone" dataKey="avg_value" stroke="#1c1c1e" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric label="Check-ins" value={analytics.check_in_count} />
        <Metric label="Quiet minutes" value={analytics.total_quiet_minutes} />
        <Metric label="Points accrued" value={analytics.total_points_accrued} />
        <Metric label="Redemptions" value={analytics.redemption_count} />
      </div>

      {analytics.peak_window.hour_of_day !== null && (
        <p className="text-sm font-light text-neutral-500">
          Peak quiet window: {analytics.peak_window.hour_of_day}:00 with {analytics.peak_window.max_active_count}{" "}
          active check-ins.
        </p>
      )}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col">
      <span className="text-xl font-light">{value}</span>
      <span className="text-xs uppercase tracking-wide text-neutral-400">{label}</span>
    </div>
  );
}
