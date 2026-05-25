-- ============================================================
-- Migration: 015_drop_balance
-- Removes the manual balance field from profiles
-- ============================================================

alter table public.profiles
  drop column if exists balance;
