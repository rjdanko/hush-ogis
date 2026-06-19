// Mirrors public.wallet_ledger (supabase/migrations/0009_wallet_ledger.sql).
export interface WalletLedgerEntry {
  id: string;
  userId: string;
  delta: number;
  reason: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}
