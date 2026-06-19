// Mirrors public.rewards (supabase/migrations/0008_rewards.sql).
export interface Reward {
  id: string;
  zoneId: string;
  name: string;
  pointsCost: number;
  createdAt: string;
}
