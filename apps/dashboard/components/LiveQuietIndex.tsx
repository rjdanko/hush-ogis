"use client";

import { useEffect, useState } from "react";
import { createClient } from "../lib/supabase/client";
import {
  formatQuietIndex,
  quietIndexGlowHex,
  type QuietIndexReading,
} from "../lib/quiet-index";

export function LiveQuietIndex({
  zoneId,
  initialReading,
}: {
  zoneId: string;
  initialReading: QuietIndexReading;
}) {
  const [reading, setReading] = useState(initialReading);

  useEffect(() => {
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;

    // Realtime authorizes postgres_changes filters against the connection's
    // own JWT (via has_column_privilege), not the apikey query param -- without
    // this, the socket authenticates as `anon`, which has no grant on
    // quiet_index at all, and every filtered subscribe is rejected server-side
    // with "invalid column for filter" instead of ever firing onUpdate.
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) supabase.realtime.setAuth(data.session.access_token);

      channel = supabase
        .channel(`quiet-index:${zoneId}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "quiet_index", filter: `zone_id=eq.${zoneId}` },
          (payload: { new: { value: number; active_count: number } }) =>
            setReading({ value: Number(payload.new.value), activeCount: Number(payload.new.active_count) })
        )
        .subscribe();
    });

    return () => { channel?.unsubscribe(); };
  }, [zoneId]);

  const glowColor = quietIndexGlowHex(reading.value);
  const hasReading = reading.value !== null;

  return (
    <section className="flex items-center gap-6 py-2">
      {/* Bloom dot — larger for the floating, borderless context */}
      <span
        aria-hidden="true"
        className="shrink-0 rounded-full transition-colors duration-700"
        style={{ width: 48, height: 48, backgroundColor: glowColor, opacity: hasReading ? 0.85 : 0.3 }}
      />

      <div className="flex flex-col gap-2">
        {/* QI chip — paper-world: subtle glow tint bg, charcoal text for contrast */}
        <div
          className="inline-flex flex-col gap-0.5 rounded-[12px] px-4 py-2.5 transition-colors duration-700"
          style={hasReading ? { background: `${glowColor}26` } : undefined}
        >
          <span
            className={[
              "font-display font-light text-4xl leading-none tabular-nums",
              hasReading ? "text-charcoal" : "text-warm-muted",
              hasReading ? "animate-qi-breathe" : "",
            ].filter(Boolean).join(" ")}
            aria-label={`Live Quiet Index: ${formatQuietIndex(reading.value)}`}
          >
            {formatQuietIndex(reading.value)}
          </span>
          <span className="font-sans text-[0.5rem] font-semibold uppercase tracking-[0.15em] text-warm-muted">
            Quiet Index
          </span>
        </div>

        <span className="font-sans text-xs text-warm-muted">
          {reading.activeCount === null
            ? "No active check-ins"
            : reading.activeCount === 1
              ? "1 active check-in"
              : `${reading.activeCount} active check-ins`}
        </span>
      </div>
    </section>
  );
}
