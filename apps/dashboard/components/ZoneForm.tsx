"use client";

import { useState } from "react";
import type { GeoJsonPolygon, RewardConfig, SilenceContract } from "@hush/shared-types";
import { ZoneMapEditor } from "./ZoneMapEditor";

export interface ZoneFormValues {
  name: string;
  geofence: GeoJsonPolygon | null;
  silenceContract: SilenceContract;
  rewardConfig: RewardConfig;
}

interface ZoneFormProps {
  initialValues?: Partial<ZoneFormValues>;
  onSubmit: (values: ZoneFormValues) => Promise<void>;
  submitLabel: string;
}

export function ZoneForm({ initialValues, onSubmit, submitLabel }: ZoneFormProps) {
  const [name, setName] = useState(initialValues?.name ?? "");
  const [geofence, setGeofence] = useState<GeoJsonPolygon | null>(initialValues?.geofence ?? null);
  const [mapError, setMapError] = useState<string | null>(null);
  const [suggestedMinutes, setSuggestedMinutes] = useState(
    initialValues?.silenceContract?.suggested_minutes ?? 45
  );
  const [earnRate, setEarnRate] = useState(initialValues?.rewardConfig?.earn_rate_per_quiet_minute ?? 1);
  const [minScore, setMinScore] = useState(initialValues?.rewardConfig?.min_score_for_earning ?? 70);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!geofence) {
      setSubmitError("Draw a zone boundary on the map before saving.");
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      await onSubmit({
        name,
        geofence,
        silenceContract: { suggested_minutes: suggestedMinutes },
        rewardConfig: { earn_rate_per_quiet_minute: earnRate, min_score_for_earning: minScore },
      });
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Failed to save zone.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1">
        Zone name
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
          className="rounded border px-3 py-2"
        />
      </label>

      <ZoneMapEditor
        initialPolygon={initialValues?.geofence ?? undefined}
        onChange={(polygon, error) => {
          setGeofence(polygon);
          setMapError(error);
        }}
      />
      {mapError ? <p className="text-sm text-red-600">{mapError}</p> : null}

      <label className="flex flex-col gap-1">
        Suggested silence minutes
        <input
          type="number"
          value={suggestedMinutes}
          onChange={(event) => setSuggestedMinutes(Number(event.target.value))}
          min={1}
          className="rounded border px-3 py-2"
        />
      </label>

      <label className="flex flex-col gap-1">
        Earn rate (points per quiet minute)
        <input
          type="number"
          value={earnRate}
          onChange={(event) => setEarnRate(Number(event.target.value))}
          min={0}
          step="0.1"
          className="rounded border px-3 py-2"
        />
      </label>

      <label className="flex flex-col gap-1">
        Minimum score to earn (0-100)
        <input
          type="number"
          value={minScore}
          onChange={(event) => setMinScore(Number(event.target.value))}
          min={0}
          max={100}
          className="rounded border px-3 py-2"
        />
      </label>

      {submitError ? <p className="text-sm text-red-600">{submitError}</p> : null}
      <button type="submit" disabled={submitting} className="rounded bg-black px-3 py-2 text-white">
        {submitting ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}
