// Mirrors public.wallet_ledger (supabase/migrations/0009_wallet_ledger.sql).
export interface WalletLedgerEntry {
  id: string;
  userId: string;
  delta: number;
  reason: string;
  createdAt: string;
}
