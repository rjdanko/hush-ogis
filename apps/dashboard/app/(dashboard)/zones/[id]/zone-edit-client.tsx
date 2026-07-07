"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ZoneForm, type ZoneFormValues } from "../../../../components/ZoneForm";
import { RewardForm } from "../../../../components/RewardForm";
import { LiveQuietIndex } from "../../../../components/LiveQuietIndex";
import { AnalyticsPanel } from "../../../../components/AnalyticsPanel";
import { DigestPanel } from "../../../../components/DigestPanel";
import { BadgeEmbed } from "../../../../components/BadgeEmbed";
import { toReward } from "../../../../lib/mappers";
import type { QuietIndexReading } from "../../../../lib/quiet-index";
import type { Reward, Zone } from "@hush/shared-types";

interface ZoneEditClientProps {
  zone: Zone;
  rewards: Reward[];
  initialReading: QuietIndexReading;
}

export function ZoneEditClient({ zone, rewards: initialRewards, initialReading }: ZoneEditClientProps) {
  const router = useRouter();
  const [rewards, setRewards] = useState(initialRewards);

  async function handleZoneSubmit(values: ZoneFormValues) {
    const response = await fetch(`/api/zones/${zone.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: values.name,
        geofence: values.geofence,
        silenceContract: values.silenceContract,
        rewardConfig: values.rewardConfig,
      }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(typeof body.error === "string" ? body.error : "Failed to update zone.");
    }
    router.refresh();
  }

  async function handleRewardSubmit(values: { name: string; pointsCost: number }) {
    const response = await fetch("/api/rewards", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ zoneId: zone.id, name: values.name, pointsCost: values.pointsCost }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(typeof body.error === "string" ? body.error : "Failed to add reward.");
    }
    // The API route returns the raw inserted row with DB column names
    // (e.g. points_cost), not the camelCase Reward shape used by this
    // component's state -- map it (via the same toReward() the initial
    // server-side load uses) so every entry in `rewards` has the same shape
    // regardless of whether it came from the initial load or a fresh POST.
    const row = await response.json();
    setRewards((current) => [...current, toReward(row)]);
  }

  return (
    <div className="flex flex-col gap-10">
      {/* Zone heading */}
      <div className="flex flex-col gap-1">
        <h1 className="font-display font-light text-ink text-[2rem] leading-tight tracking-tight overflow-hidden text-ellipsis whitespace-nowrap">
          {zone.name}
        </h1>
        <p className="font-sans text-sm text-warm-muted">Live data &amp; settings</p>
      </div>

      {/* ── PULSE ────────────────────────────────────────────────────────────
          The primary reason to open this page: observe what's happening now
          and over time. LiveQI floats borderless on paper. Analytics and
          digest follow as natural continuations of the same question. */}
      <div className="flex flex-col gap-8">
        <LiveQuietIndex zoneId={zone.id} initialReading={initialReading} />
        <AnalyticsPanel zoneId={zone.id} />
        <DigestPanel zoneId={zone.id} />
      </div>

      {/* Visual separator between observe and configure modes */}
      <hr className="border-t border-warm-border" />

      {/* ── CONFIGURE ────────────────────────────────────────────────────────
          Operational sections: badge embed, zone settings, rewards. */}
      <div className="flex flex-col gap-10">

        {/* Badge embed */}
        <BadgeEmbed zoneId={zone.id} />

        {/* Zone settings */}
        <section className="flex flex-col gap-5 rounded-[16px] border border-warm-border bg-surface px-6 py-5">
          <h2 className="font-sans text-sm font-semibold text-charcoal">Zone settings</h2>
          <ZoneForm
            key={zone.id}
            initialValues={{
              name: zone.name,
              geofence: zone.geofence,
              silenceContract: zone.silenceContract,
              rewardConfig: zone.rewardConfig,
            }}
            onSubmit={handleZoneSubmit}
            submitLabel="Save changes"
          />
        </section>

        {/* Rewards */}
        <section className="flex flex-col gap-5 rounded-[16px] border border-warm-border bg-surface px-6 py-5">
          <h2 className="font-sans text-sm font-semibold text-charcoal">Rewards</h2>

          {rewards.length > 0 && (
            <ul className="flex flex-col divide-y divide-warm-border">
              {rewards.map((reward) => (
                <li key={reward.id} className="flex items-baseline justify-between py-3">
                  <span className="font-sans text-sm text-ink">{reward.name}</span>
                  <span className="font-sans text-xs text-warm-muted tabular-nums">
                    {reward.pointsCost} pts
                  </span>
                </li>
              ))}
            </ul>
          )}

          <RewardForm onSubmit={handleRewardSubmit} />
        </section>
      </div>
    </div>
  );
}
