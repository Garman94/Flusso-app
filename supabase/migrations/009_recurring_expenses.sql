-- ============================================================
-- Migration: 009_recurring_expenses
-- Creates recurring_expenses table for Smart recurring cost tracking
-- Supports fixed/variable amounts, custom frequencies, and
-- real-time comparison vs actual transactions.
-- ============================================================

create table if not exists public.recurring_expenses (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,

  -- Dettagli voce
  name             text not null,
  tipologia        text not null default 'fissa',   -- 'fissa' | 'variabile'

  -- Frequenza
  frequency        text not null default 'mensile', -- mensile | bimestrale | trimestrale | semestrale | annuale | personalizzata
  custom_days      int,                              -- solo se frequency = 'personalizzata' (es. ogni 90 giorni)

  -- Importo: fisso o range
  amount           numeric(12, 2) not null,          -- importo fisso (o minimo del range)
  amount_max       numeric(12, 2),                   -- null = fisso; valore = massimo del range (solo tipologia variabile)

  -- Classificazione
  category_id      uuid references public.categories(id) on delete set null,
  notes            text,

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint recurring_expenses_tipologia_check check (
    tipologia in ('fissa', 'variabile')
  ),
  constraint recurring_expenses_frequency_check check (
    frequency in ('mensile', 'bimestrale', 'trimestrale', 'semestrale', 'annuale', 'personalizzata')
  ),
  constraint recurring_expenses_custom_days_check check (
    frequency != 'personalizzata' or (custom_days is not null and custom_days > 0)
  ),
  constraint recurring_expenses_amount_max_check check (
    tipologia != 'variabile' or amount_max is null or amount_max >= amount
  )
);

create index if not exists recurring_expenses_user_id_idx on public.recurring_expenses(user_id);

alter table public.recurring_expenses enable row level security;

create policy "Users can manage own recurring expenses"
  on public.recurring_expenses for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Trigger per updated_at
create trigger set_recurring_expenses_updated_at
  before update on public.recurring_expenses
  for each row
  execute function public.set_updated_at();
