// Mirrors public.users (supabase/migrations/0002_roles_and_users.sql).
export type UserRole = "user" | "operator" | "admin";

export interface User {
  id: string;
  anonHandle: string;
  role: UserRole;
  prefs: Record<string, unknown>;
  createdAt: string;
}
