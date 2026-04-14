-- ============================================================
-- Migration: 008_smart_budget
-- Creates budget_items table for Smart spending predictions
-- ============================================================

create table if not exists public.budget_items (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  amount      numeric(12, 2) not null,
  frequency   text not null default 'mensile',
  category_id uuid references public.categories(id) on delete set null,
  created_at  timestamptz not null default now(),

  constraint budget_items_frequency_check check (
    frequency in ('mensile', 'settimanale', 'annuale', 'una_tantum')
  )
);

create index if not exists budget_items_user_id_idx on public.budget_items(user_id);

alter table public.budget_items enable row level security;

create policy "Users can manage own budget items"
  on public.budget_items for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
