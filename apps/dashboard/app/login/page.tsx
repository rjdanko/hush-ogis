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
      <div className="hidden lg:flex flex-col justify-between w-2/5 bg-night-bg px-12 py-14">
        <span className="font-display font-light text-mist text-xl tracking-tight">
          Hush
        </span>

        <div className="flex flex-col gap-4">
          <p className="font-display font-light text-mist/70 text-4xl leading-[1.15]">
            A quieter place,<br />measured.
          </p>
          <p className="font-sans text-sm text-mist/35 leading-relaxed max-w-xs">
            The Quiet Index updates live. Your guests don&apos;t need to know
            you&apos;re watching — only that the room is calmer than yesterday.
          </p>
        </div>

        <p className="font-sans text-[0.5rem] font-semibold uppercase tracking-[0.2em] text-mist/25">
          Operator Console
        </p>
      </div>

      {/* Right — form panel */}
      <div className="flex flex-1 items-center justify-center bg-paper px-8 py-16">
        <div className="w-full max-w-sm flex flex-col gap-10">

          {/* Mobile-only wordmark */}
          <span className="lg:hidden font-display font-light text-ink text-xl tracking-tight">
            Hush
          </span>

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
