-- ============================================================
-- Migration: 004_payperiod
-- Adds pay_day to profiles for custom pay-period support
-- 0 = standard calendar month, 1-28 = start day of pay period
-- ============================================================

alter table public.profiles
  add column if not exists pay_day smallint not null default 0;
