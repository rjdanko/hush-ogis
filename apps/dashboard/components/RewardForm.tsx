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
    <form onSubmit={handleSubmit} className="flex items-end gap-3">
      <label className="flex flex-col gap-1">
        Reward name
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
          className="rounded border px-3 py-2"
        />
      </label>
      <label className="flex flex-col gap-1">
        Point cost
        <input
          type="number"
          value={pointsCost}
          onChange={(event) => setPointsCost(Number(event.target.value))}
          min={1}
          className="rounded border px-3 py-2"
        />
      </label>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <button type="submit" disabled={submitting} className="rounded bg-black px-3 py-2 text-white">
        {submitting ? "Adding…" : "Add reward"}
      </button>
    </form>
  );
}
