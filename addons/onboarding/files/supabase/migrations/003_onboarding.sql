-- ============================================================
-- Migration: 003_onboarding
-- Adds onboarding_completed flag and use_case field to profiles.
-- ============================================================

alter table public.profiles
  add column if not exists onboarding_completed boolean not null default false,
  add column if not exists use_case text;
