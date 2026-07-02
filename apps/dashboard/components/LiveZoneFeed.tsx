"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "../lib/supabase/client";
import {
  formatQuietIndex,
  quietIndexGlowHex,
  quietIndexGlowTextClass,
  type QuietIndexReading,
} from "../lib/quiet-index";

interface ZoneEntry {
  id: string;
  name: string;
  createdAt: string;
  reading: QuietIndexReading;
}

interface LiveZoneFeedProps {
  zones: ZoneEntry[];
}

export function LiveZoneFeed({ zones: initialZones }: LiveZoneFeedProps) {
  const [zones, setZones] = useState<ZoneEntry[]>(initialZones);
  const [flashingIds, setFlashingIds] = useState<Set<string>>(new Set());
  const flashTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const channelsRef = useRef<RealtimeChannel[]>([]);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;

      if (data.session) supabase.realtime.setAuth(data.session.access_token);

      const channels = initialZones.map((zone) =>
        supabase
          .channel(`live-feed:${zone.id}`)
          .on(
            "postgres_changes",
            {
              event: "INSERT",
              schema: "public",
              table: "quiet_index",
              filter: `zone_id=eq.${zone.id}`,
            },
            (payload: { new: { value: number; active_count: number } }) => {
              setZones((prev) =>
                prev.map((z) =>
                  z.id === zone.id
                    ? { ...z, reading: { value: Number(payload.new.value), activeCount: Number(payload.new.active_count) } }
                    : z
                )
              );

              const existing = flashTimers.current.get(zone.id);
              if (existing) clearTimeout(existing);
              setFlashingIds((prev) => new Set([...prev, zone.id]));
              const timer = setTimeout(() => {
                setFlashingIds((prev) => {
                  const next = new Set(prev);
                  next.delete(zone.id);
                  return next;
                });
                flashTimers.current.delete(zone.id);
              }, 650);
              flashTimers.current.set(zone.id, timer);
            }
          )
          .subscribe()
      );

      channelsRef.current = channels;
    });

    return () => {
      cancelled = true;
      channelsRef.current.forEach((ch) => ch.unsubscribe());
      channelsRef.current = [];
      flashTimers.current.forEach(clearTimeout);
      flashTimers.current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (zones.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-20 text-center">
        <p className="font-sans text-warm-muted text-sm">No quiet zones yet.</p>
        <p className="font-sans text-warm-muted text-sm max-w-xs">
          Create your first zone and it will appear here with its live Quiet Index.
        </p>
      </div>
    );
  }

  return (
    <ul className="flex flex-col divide-y divide-warm-border">
      {zones.map((zone) => (
        <ZoneRow key={zone.id} zone={zone} isFlashing={flashingIds.has(zone.id)} />
      ))}
    </ul>
  );
}

function ZoneRow({ zone, isFlashing }: { zone: ZoneEntry; isFlashing: boolean }) {
  const glowColor = quietIndexGlowHex(zone.reading.value);
  const glowTextClass = quietIndexGlowTextClass(zone.reading.value);
  const hasReading = zone.reading.value !== null;

  return (
    <li
      className={[
        "group flex items-center gap-5 px-1 py-5 rounded-sm transition-colors duration-200",
        "hover:bg-surface",
        isFlashing ? "animate-row-flash" : "",
      ].filter(Boolean).join(" ")}
    >
      {/* Zone bloom dot */}
      <span
        aria-hidden="true"
        className="shrink-0 rounded-full transition-colors duration-700"
        style={{ width: 28, height: 28, backgroundColor: glowColor, opacity: hasReading ? 0.85 : 0.35 }}
      />

      {/* Zone name + check-in count */}
      <div className="flex flex-col gap-0.5 flex-1 min-w-0">
        <Link
          href={`/zones/${zone.id}`}
          className="font-sans font-semibold text-ink text-sm leading-snug hover:text-accent transition-colors duration-150 truncate"
        >
          {zone.name}
        </Link>
        <span className="font-sans text-xs text-warm-muted">
          {zone.reading.activeCount === null
            ? "No reading yet"
            : zone.reading.activeCount === 1
              ? "1 active check-in"
              : `${zone.reading.activeCount} active check-ins`}
        </span>
      </div>

      {/* Live Quiet Index — dark tile chip solves glow-high contrast (10:1 on night-card) */}
      <div
        className="flex flex-col items-center shrink-0 rounded-[12px] bg-night-card px-3 py-2 gap-0.5"
        aria-label={`Quiet Index: ${formatQuietIndex(zone.reading.value)}`}
      >
        <span
          className={[
            "font-display font-light text-3xl leading-none tabular-nums",
            glowTextClass,
            hasReading ? "animate-qi-breathe" : "",
          ].filter(Boolean).join(" ")}
        >
          {formatQuietIndex(zone.reading.value)}
        </span>
        <span className="font-sans text-[0.5rem] uppercase tracking-[0.15em] text-night-muted">
          QI
        </span>
      </div>
    </li>
  );
}
