-- ============================================================
-- Migration: 005_piggy
-- Adds piggy_balance to profiles — manual piggy-bank counter,
-- completely separate from main balance and transaction sums.
-- ============================================================

alter table public.profiles
  add column if not exists piggy_balance numeric(12, 2) not null default 0;
