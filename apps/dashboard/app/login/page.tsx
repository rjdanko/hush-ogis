"use client";

import { useState } from "react";
import { signIn } from "./actions";

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(formData: FormData) {
    setPending(true);
    setError(null);
    const result = await signIn(formData);
    setPending(false);
    if (result?.error) {
      setError(result.error);
    }
  }

  return (
    <div className="flex min-h-screen">
      {/* Left — brand panel */}
      <div className="relative hidden w-2/5 overflow-hidden bg-[#16140F] px-12 py-14 lg:flex lg:flex-col lg:justify-between">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_66%_38%,rgba(232,193,112,0.22),transparent_28%),radial-gradient(circle_at_26%_78%,rgba(107,127,110,0.22),transparent_34%)]" />
        <div className="pointer-events-none absolute right-12 top-28 h-40 w-40 rounded-full bg-glow-high/15 blur-3xl animate-qi-breathe" />
        <div className="pointer-events-none absolute bottom-0 left-0 h-28 w-full bg-[linear-gradient(180deg,transparent,rgba(176,122,94,0.13))]" />

        <div className="relative">
          <img src="/hush-logo.png" alt="Hush Logo" className="h-8 w-auto" />
        </div>

        <div className="relative flex flex-col gap-6">
          <div className="flex h-28 w-28 items-center justify-center rounded-full border border-glow-high/20 bg-[#23201A]/70 shadow-[0_0_80px_rgba(232,193,112,0.18)]">
            <div className="h-16 w-16 rounded-full bg-[radial-gradient(circle,rgba(232,193,112,0.88),rgba(217,168,94,0.30)_58%,transparent_72%)] animate-qi-breathe" />
          </div>
          <p className="font-display font-light text-night-text/80 text-4xl leading-[1.15]">
            A quieter place,<br />measured.
          </p>
          <p className="font-sans text-sm text-night-hint/70 leading-relaxed max-w-xs">
            The Quiet Index updates live. Your guests don&apos;t need to know
            you&apos;re watching — only that the room is calmer than yesterday.
          </p>
        </div>

        <p className="relative font-sans text-[0.5rem] font-semibold uppercase tracking-[0.2em] text-night-muted">
          Operator Console
        </p>
      </div>

      {/* Right — form panel */}
      <div className="flex flex-1 items-center justify-center bg-paper px-8 py-16">
        <div className="w-full max-w-sm flex flex-col gap-10">

          {/* Mobile-only wordmark */}
          <div className="lg:hidden">
            <img src="/hush-logo.png" alt="Hush Logo" className="h-6 w-auto" />
          </div>

          <div className="flex flex-col gap-1">
            <h1 className="font-display font-light text-ink text-[2rem] leading-tight">
              Sign in
            </h1>
            <p className="font-sans text-sm text-warm-muted">
              Operator Console
            </p>
          </div>

          <form action={handleSubmit} className="flex flex-col gap-5">
            <label className="flex flex-col gap-2">
              <span className={labelClass}>Email</span>
              <input
                name="email"
                type="email"
                placeholder="you@yourplace.com"
                required
                autoComplete="email"
                className={inputClass}
              />
            </label>

            <label className="flex flex-col gap-2">
              <span className={labelClass}>Password</span>
              <input
                name="password"
                type="password"
                placeholder="••••••••"
                required
                autoComplete="current-password"
                className={inputClass}
              />
            </label>

            {error && (
              <p className="font-sans text-sm text-alert" role="alert">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={pending}
              className={primaryButtonClass}
            >
              {pending ? "Signing in…" : "Sign in"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

const labelClass =
  "font-sans text-[0.625rem] font-semibold uppercase tracking-[0.15em] text-charcoal";

const inputClass = [
  "w-full rounded-[12px] border border-warm-border bg-surface px-4 py-3",
  "font-sans text-sm text-ink placeholder:text-warm-muted",
  "focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20",
  "transition-colors duration-150",
].join(" ");

const primaryButtonClass = [
  "w-full rounded-[16px] bg-glow-high px-4 py-3.5",
  "font-sans text-xs font-semibold uppercase tracking-[0.12em] text-ink",
  "hover:bg-glow-high/90 focus:outline-none focus:ring-2 focus:ring-glow-high/40",
  "disabled:opacity-40 transition-colors duration-150",
].join(" ");
