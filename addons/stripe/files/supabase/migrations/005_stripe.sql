-- ============================================================
-- Migration: 005_stripe
-- Adds stripe_customer_id and subscription_id to profiles.
-- ============================================================

alter table public.profiles
  add column if not exists stripe_customer_id text unique,
  add column if not exists stripe_subscription_id text unique;
