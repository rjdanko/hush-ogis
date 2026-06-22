"use client";

import { useState } from "react";

export function BadgeEmbed({ zoneId }: { zoneId: string }) {
  const [embedUrl, setEmbedUrl] = useState<string | null>(null);
  const [expiresIn, setExpiresIn] = useState<number | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);

  async function handleGenerate() {
    setPending(true);
    setError(null);
    setCopied(false);
    setCopyError(null);
    try {
      const response = await fetch("/api/badge-token", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ zoneId }),
      });
      if (!response.ok) throw new Error("failed");
      const data = (await response.json()) as { embedUrl: string; expiresIn: number };
      setEmbedUrl(data.embedUrl);
      setExpiresIn(data.expiresIn);
    } catch {
      setError("Could not generate the badge just now.");
    } finally {
      setPending(false);
    }
  }

  const snippet = embedUrl
    ? `<img src="${embedUrl}" alt="Hush Quiet Index — verified" width="220" height="60" />`
    : null;

  async function handleCopy() {
    if (!snippet) return;
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      setCopyError(null);
    } catch {
      setCopyError("Couldn't copy automatically — select the text above and copy manually.");
    }
  }

  return (
    <section className="flex flex-col gap-3 rounded border border-neutral-200 p-4">
      <h2 className="text-sm uppercase tracking-wide text-neutral-500">Certification badge</h2>

      <div>
        <button
          type="button"
          onClick={handleGenerate}
          disabled={pending}
          className="rounded border border-neutral-300 px-4 py-2 text-sm font-light tracking-wide text-neutral-700 disabled:opacity-50"
        >
          Generate embed snippet
        </button>
      </div>

      {pending && <p className="text-sm font-light text-neutral-400">Generating…</p>}
      {error && !pending && <p className="text-sm font-light text-neutral-500">{error}</p>}

      {snippet && !pending && (
        <div className="flex flex-col gap-2">
          {expiresIn !== null && (
            <p className="text-xs font-light text-neutral-400">
              This link expires in {expiresIn} seconds — regenerate before adding it to a live page.
            </p>
          )}
          <textarea
            readOnly
            value={snippet}
            rows={2}
            className="rounded border border-neutral-200 p-2 text-xs font-mono text-neutral-700"
          />
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleCopy}
              className="rounded border border-neutral-300 px-3 py-1 text-xs font-light tracking-wide text-neutral-700"
            >
              Copy
            </button>
            {copied && <span className="text-xs font-light text-neutral-400">Copied</span>}
          </div>
          {copyError && <p className="text-xs font-light text-neutral-500">{copyError}</p>}
          {/* eslint-disable-next-line @next/next/no-img-element -- external badge image, not a local asset */}
          <img src={embedUrl ?? ""} alt="Hush Quiet Index — verified" width={220} height={60} />
        </div>
      )}
    </section>
  );
}
