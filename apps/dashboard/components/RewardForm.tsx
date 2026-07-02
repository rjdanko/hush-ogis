"use client";

import { useState } from "react";

interface RewardFormProps {
  onSubmit: (values: { name: string; pointsCost: number }) => Promise<void>;
}

export function RewardForm({ onSubmit }: RewardFormProps) {
  const [name, setName] = useState("");
  const [pointsCost, setPointsCost] = useState(50);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({ name, pointsCost });
      setName("");
      setPointsCost(50);
    } catch (submitErr) {
      setError(submitErr instanceof Error ? submitErr.message : "Failed to save reward.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <fieldset className="flex flex-wrap items-end gap-4 border-0 p-0 m-0 min-w-0">
        <legend className="sr-only">Add a new reward</legend>

        <label className="flex flex-col gap-2">
          <span className={labelClass}>Reward name</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            placeholder="e.g. Free coffee"
            className={inputClass}
          />
        </label>

        <label className="flex flex-col gap-2">
          <span className={labelClass}>Point cost</span>
          <input
            type="number"
            value={pointsCost}
            onChange={(event) => setPointsCost(Number(event.target.value))}
            min={1}
            className={inputClass}
          />
        </label>

        {error && <p className="w-full font-sans text-sm text-alert" role="alert">{error}</p>}

        <button type="submit" disabled={submitting} className={primaryButtonClass}>
          {submitting ? "Adding…" : "Add reward"}
        </button>
      </fieldset>
    </form>
  );
}

const labelClass =
  "font-sans text-[0.625rem] font-semibold uppercase tracking-[0.15em] text-charcoal";

const inputClass = [
  "rounded-[12px] border border-warm-border bg-surface px-4 py-2.5",
  "font-sans text-sm text-ink placeholder:text-warm-muted",
  "focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20",
  "transition-colors duration-150",
].join(" ");

const primaryButtonClass = [
  "rounded-[16px] bg-glow-high px-5 py-2.5",
  "font-sans text-[0.625rem] font-semibold uppercase tracking-[0.12em] text-ink",
  "hover:bg-glow-high/90 focus:outline-none focus:ring-2 focus:ring-glow-high/40",
  "disabled:opacity-40 transition-colors duration-150",
].join(" ");
