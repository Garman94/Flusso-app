-- ============================================================
-- Migration: 003_balance
-- Adds balance field to profiles for manual balance tracking
-- ============================================================

alter table public.profiles
  add column if not exists balance numeric(12, 2) not null default 0;
