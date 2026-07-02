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
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <Field label="Zone name">
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
          placeholder="e.g. Reading Room A"
          className={inputClass}
        />
      </Field>

      <ZoneMapEditor
        initialPolygon={initialValues?.geofence ?? undefined}
        onChange={(polygon, error) => {
          setGeofence(polygon);
          setMapError(error);
        }}
      />
      {/* ZoneMapEditor never calls onChange when no Mapbox token is configured
          (it would otherwise wipe an existing zone's geofence on mount) -- that
          state renders its own red placeholder instead of populating mapError
          here. Don't "simplify" this into a single error surface without
          re-reading ZoneMapEditor's mount-once comment. */}
      {mapError && <p className="font-sans text-sm text-alert" role="alert">{mapError}</p>}

      <Field label="Suggested silence (minutes)">
        <input
          type="number"
          value={suggestedMinutes}
          onChange={(event) => setSuggestedMinutes(Number(event.target.value))}
          min={1}
          className={inputClass}
        />
      </Field>

      <Field label="Earn rate (points per quiet minute)">
        <input
          type="number"
          value={earnRate}
          onChange={(event) => setEarnRate(Number(event.target.value))}
          min={0}
          step="0.1"
          className={inputClass}
        />
      </Field>

      <Field label="Minimum score to earn (0–100)">
        <input
          type="number"
          value={minScore}
          onChange={(event) => setMinScore(Number(event.target.value))}
          min={0}
          max={100}
          className={inputClass}
        />
      </Field>

      {submitError && <p className="font-sans text-sm text-alert" role="alert">{submitError}</p>}

      <button type="submit" disabled={submitting} className={primaryButtonClass}>
        {submitting ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-2">
      <span className="font-sans text-[0.625rem] font-semibold uppercase tracking-[0.15em] text-charcoal">
        {label}
      </span>
      {children}
    </label>
  );
}

const inputClass = [
  "w-full rounded-[12px] border border-warm-border bg-surface px-4 py-2.5",
  "font-sans text-sm text-ink placeholder:text-warm-muted",
  "focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20",
  "transition-colors duration-150",
].join(" ");

const primaryButtonClass = [
  "self-start rounded-[16px] bg-glow-high px-6 py-3",
  "font-sans text-[0.625rem] font-semibold uppercase tracking-[0.12em] text-ink",
  "hover:bg-glow-high/90 focus:outline-none focus:ring-2 focus:ring-glow-high/40",
  "disabled:opacity-40 transition-colors duration-150",
].join(" ");
