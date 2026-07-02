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
    <section className="flex flex-col gap-4 rounded-[16px] border border-warm-border bg-surface px-6 py-5">
      <div className="flex items-center justify-between">
        <h2 className="font-sans text-sm font-semibold text-charcoal">Certification badge</h2>
        <button
          type="button"
          onClick={handleGenerate}
          disabled={pending}
          aria-busy={pending}
          className={generateButtonClass}
        >
          <span aria-live="polite" aria-atomic="true">
            {pending ? "Generating…" : "Generate snippet"}
          </span>
        </button>
      </div>

      {error && !pending && (
        <p className="font-sans text-sm text-alert" role="alert">{error}</p>
      )}

      {snippet && !pending && (
        <div className="flex flex-col gap-3">
          {expiresIn !== null && (
            <p className="font-sans text-xs text-warm-muted">
              This link expires in {expiresIn} seconds — regenerate before adding it to a live page.
            </p>
          )}
          <textarea
            readOnly
            value={snippet}
            rows={2}
            aria-label="Embed snippet"
            aria-readonly={true}
            className="w-full rounded-[12px] border border-warm-border bg-paper px-3 py-2 font-mono text-xs text-ink resize-none focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
          />
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleCopy}
              className={copyButtonClass}
            >
              Copy
            </button>
            {copied && (
              <span className="font-sans text-xs text-warm-muted" aria-live="polite">
                Copied
              </span>
            )}
          </div>
          {copyError && (
            <p className="font-sans text-xs text-alert" role="alert">{copyError}</p>
          )}
          {/* eslint-disable-next-line @next/next/no-img-element -- external badge image, not a local asset */}
          <img src={embedUrl ?? ""} alt="Hush Quiet Index — verified" width={220} height={60} />
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

const copyButtonClass = [
  "rounded-full border border-warm-border px-3 py-1.5",
  "font-sans text-[0.625rem] font-semibold uppercase tracking-[0.15em] text-charcoal",
  "hover:border-accent hover:text-accent transition-colors duration-150",
].join(" ");
