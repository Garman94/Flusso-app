-- Migration 012: coupon codes for plan upgrades
-- Coupons are created by admin and redeemed once by a user to upgrade their plan.

create table coupon_codes (
  id           uuid        primary key default gen_random_uuid(),
  code         text        unique not null,
  plan         text        not null check (plan in ('premium', 'founder')),
  used         boolean     not null default false,
  used_by      uuid        references profiles(id) on delete set null,
  used_at      timestamptz,
  notes        text,
  created_at   timestamptz not null default now()
);

-- Only service role can manage coupons directly.
-- Authenticated users can only SELECT the coupon they want to redeem (via the API, not direct table access).
alter table coupon_codes enable row level security;

-- No public SELECT: all access goes through the API with service role.
-- This prevents users from enumerating valid coupon codes.
