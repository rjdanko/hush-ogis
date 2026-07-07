"use client";

import { useState } from "react";

interface Suggestion {
  title: string;
  body: string;
}

interface Digest {
  summary: string;
  suggestions: Suggestion[];
}

export function DigestPanel({ zoneId }: { zoneId: string }) {
  const [digest, setDigest] = useState<Digest | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerate() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/digest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ zoneId }),
      });
      if (!response.ok) throw new Error("failed");
      const data = (await response.json()) as Digest;
      setDigest(data);
    } catch {
      setError("Could not generate the digest just now.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="flex flex-col gap-5 rounded-[16px] border border-warm-border bg-surface px-6 py-5">
      <div className="flex items-center justify-between">
        <h2 className="font-sans text-sm font-semibold text-charcoal">Weekly digest</h2>
        <button
          type="button"
          onClick={handleGenerate}
          disabled={pending}
          aria-busy={pending}
          className={generateButtonClass}
        >
          <span aria-live="polite" aria-atomic="true">
            {pending ? "Generating…" : "Generate"}
          </span>
        </button>
      </div>

      {error && !pending && (
        <p className="font-sans text-sm text-alert" role="alert">{error}</p>
      )}

      {digest && !pending && (
        <div className="flex flex-col gap-5">
          <p className="font-sans text-sm text-charcoal leading-relaxed">
            {digest.summary}
          </p>

          {digest.suggestions.length > 0 && (
            <ul className="flex flex-col divide-y divide-warm-border border-t border-warm-border">
              {digest.suggestions.map((suggestion, index) => (
                <li key={index} className="flex flex-col gap-1 py-4">
                  <p className="font-sans text-sm font-semibold text-ink">
                    {suggestion.title}
                  </p>
                  <p className="font-sans text-sm text-warm-muted leading-relaxed">
                    {suggestion.body}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

const generateButtonClass = [
  "rounded-full border border-warm-border px-3 py-1.5",
  "font-sans text-[0.625rem] font-semibold uppercase tracking-[0.15em] text-charcoal",
  "hover:border-accent hover:text-accent transition-colors duration-150",
  "disabled:opacity-40",
].join(" ");
