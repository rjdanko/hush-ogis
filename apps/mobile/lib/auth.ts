// The demo signs users in anonymously (supabase/config.toml's
// enable_anonymous_sign_ins, Task 4) rather than requiring email signup.
// Anonymous users still get a real auth.uid(), so every RLS policy
// (sessions_insert_own etc.) applies to them unchanged.
import { supabase } from "./supabase";

export async function ensureSession() {
  const { data } = await supabase.auth.getSession();
  if (data.session) return data.session;

  const { data: signInData, error } = await supabase.auth.signInAnonymously();
  if (error) throw error;
  return signInData.session;
}
