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
      if (!response.ok) {
        throw new Error("Could not generate the digest just now.");
      }
      const data = (await response.json()) as Digest;
      setDigest(data);
    } catch {
      setError("Could not generate the digest just now.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="flex flex-col gap-3 rounded border border-neutral-200 p-4">
      <h2 className="text-sm uppercase tracking-wide text-neutral-500">Weekly digest</h2>

      <div>
        <button
          type="button"
          onClick={handleGenerate}
          disabled={pending}
          className="rounded border border-neutral-300 px-4 py-2 text-sm font-light tracking-wide text-neutral-700 disabled:opacity-50"
        >
          Generate weekly digest
        </button>
      </div>

      {pending && (
        <p className="text-sm font-light text-neutral-400">Generating…</p>
      )}

      {error && !pending && (
        <p className="text-sm font-light text-neutral-500">{error}</p>
      )}

      {digest && !pending && (
        <div className="flex flex-col gap-3">
          <p className="font-light leading-relaxed text-neutral-700">{digest.summary}</p>
          <div className="flex flex-col gap-2">
            {digest.suggestions.map((suggestion, index) => (
              <div key={index} className="flex flex-col gap-1 rounded border border-neutral-200 p-3">
                <p className="font-light text-neutral-700">{suggestion.title}</p>
                <p className="text-sm font-light text-neutral-500">{suggestion.body}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
