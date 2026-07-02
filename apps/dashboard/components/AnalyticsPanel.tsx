"use client";

import { useEffect, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { prefersReducedMotion } from "../lib/motion";

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
    return () => { cancelled = true; };
  }, [zoneId]);

  if (error) {
    return <p className="font-sans text-sm text-alert" role="alert">{error}</p>;
  }

  if (!analytics) {
    return (
      <div className="rounded-[16px] border border-warm-border bg-surface px-6 py-5 animate-pulse">
        <div className="h-3 w-24 rounded bg-warm-border mb-4" />
        <div className="h-32 rounded bg-warm-border/60" />
      </div>
    );
  }

  return (
    <section className="flex flex-col gap-6 rounded-[16px] border border-warm-border bg-surface px-6 py-5">
      <h2 className="font-sans text-sm font-semibold text-charcoal">
        {analytics.window_days}-day analytics
      </h2>

      {analytics.quiet_index_trend.length === 0 ? (
        <p className="font-sans text-sm text-warm-muted">
          No Quiet Index history yet for this zone.
        </p>
      ) : (
        <div style={{ width: "100%", height: 180 }}>
          <ResponsiveContainer>
            <LineChart data={analytics.quiet_index_trend}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-warm-border)" />
              <XAxis dataKey="day" tick={{ fontSize: 11, fill: "var(--color-warm-muted)", fontFamily: "var(--font-hanken)" }} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "var(--color-warm-muted)", fontFamily: "var(--font-hanken)" }} />
              <Tooltip
                contentStyle={{
                  background: "var(--color-surface)",
                  border: "1px solid var(--color-warm-border)",
                  borderRadius: 12,
                  fontFamily: "var(--font-hanken)",
                  fontSize: 12,
                  color: "var(--color-ink)",
                }}
              />
              <Line
                type="monotone"
                dataKey="avg_value"
                stroke="var(--color-accent)"
                strokeWidth={1.5}
                dot={false}
                isAnimationActive={!prefersReducedMotion()}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Metric label="Check-ins" value={analytics.check_in_count} />
        <Metric label="Quiet minutes" value={analytics.total_quiet_minutes} />
        <Metric label="Points accrued" value={analytics.total_points_accrued} />
        <Metric label="Redemptions" value={analytics.redemption_count} />
      </div>

      {analytics.peak_window.hour_of_day !== null && (
        <p className="font-sans text-sm text-warm-muted border-t border-warm-border pt-4">
          Peak quiet window: {analytics.peak_window.hour_of_day}:00
          {" "}with {analytics.peak_window.max_active_count} active check-ins.
        </p>
      )}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-display font-light text-2xl text-ink">{value}</span>
      <span className="font-sans text-[0.5rem] font-semibold uppercase tracking-[0.15em] text-warm-muted">
        {label}
      </span>
    </div>
  );
}
