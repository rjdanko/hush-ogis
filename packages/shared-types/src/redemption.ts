// Mirrors public.redemptions (supabase/migrations/0021_redemptions.sql).
export interface Redemption {
  id: string;
  userId: string;
  rewardId: string;
  zoneId: string;
  pointsSpent: number;
  createdAt: string;
}
