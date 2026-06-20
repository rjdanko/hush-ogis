"use server";

import { redirect } from "next/navigation";
import { createClient } from "../../lib/supabase/server";
import { checkRateLimit } from "../../lib/rate-limit";

export async function signIn(formData: FormData): Promise<{ error: string } | never> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Email and password are required." };
  }

  // Keyed by the submitted email, not an authenticated identity (there isn't
  // one yet) -- this throttles credential-stuffing against a single account
  // without depending on a trustworthy client IP. A malicious actor could
  // use this to lock out a known victim email faster than brute-forcing it,
  // but that's a smaller blast radius than unthrottled password guessing,
  // and Supabase/GoTrue applies its own server-side throttling underneath
  // this regardless.
  const { allowed } = checkRateLimit(email.toLowerCase(), "auth:signin", { limit: 10, windowMs: 60_000 });
  if (!allowed) {
    return { error: "Too many attempts. Try again in a minute." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: "Invalid email or password." };
  }

  redirect("/zones");
}
