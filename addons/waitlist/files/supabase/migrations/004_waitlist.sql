-- ============================================================
-- Migration: 004_waitlist
-- Creates the waitlist table with RLS policies.
-- ============================================================

create table if not exists public.waitlist (
  id         uuid primary key default gen_random_uuid(),
  email      text not null unique,
  name       text,
  created_at timestamptz not null default now()
);

-- Enable RLS
alter table public.waitlist enable row level security;

-- Only service role can read/write (managed via API route with service key)
-- No public select/insert policies — all access goes through the API route
