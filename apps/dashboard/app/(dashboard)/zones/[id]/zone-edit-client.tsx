"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ZoneForm, type ZoneFormValues } from "../../../../components/ZoneForm";
import { RewardForm } from "../../../../components/RewardForm";
import type { Reward, Zone } from "@hush/shared-types";

interface ZoneEditClientProps {
  zone: Zone;
  rewards: Reward[];
}

export function ZoneEditClient({ zone, rewards: initialRewards }: ZoneEditClientProps) {
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
    // component's state -- map it here so every entry in `rewards` has the
    // same shape regardless of whether it came from the initial server-side
    // load or a fresh POST.
    const row = await response.json();
    const reward: Reward = {
      id: row.id,
      zoneId: row.zone_id,
      name: row.name,
      pointsCost: row.points_cost,
      createdAt: row.created_at,
    };
    setRewards((current) => [...current, reward]);
  }

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-2xl font-light tracking-wide">{zone.name}</h1>
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

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-light tracking-wide">Rewards</h2>
        <ul className="flex flex-col gap-1">
          {rewards.map((reward) => (
            <li key={reward.id}>
              {reward.name} — {reward.pointsCost} points
            </li>
          ))}
        </ul>
        <RewardForm onSubmit={handleRewardSubmit} />
      </section>
    </div>
  );
}
