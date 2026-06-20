"use client";

import { useState } from "react";
import { signIn } from "./actions";

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(formData: FormData) {
    setPending(true);
    const result = await signIn(formData);
    setPending(false);
    if (result?.error) {
      setError(result.error);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center">
      <form action={handleSubmit} className="flex w-80 flex-col gap-4">
        <h1 className="text-2xl font-light tracking-wide">Operator sign in</h1>
        <input
          name="email"
          type="email"
          placeholder="Email"
          required
          className="rounded border px-3 py-2"
        />
        <input
          name="password"
          type="password"
          placeholder="Password"
          required
          className="rounded border px-3 py-2"
        />
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <button type="submit" disabled={pending} className="rounded bg-black px-3 py-2 text-white">
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}
