-- ============================================================
-- Migration: 002_finance
-- Creates the core finance tables:
--   categories, category_rules, transactions, goals
-- ============================================================

-- ────────────────────────────────────────────────
-- 1. CATEGORIES
-- ────────────────────────────────────────────────
create table if not exists public.categories (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references auth.users(id) on delete cascade,
  name       text not null,
  color      text not null default '#6366f1',
  icon       text not null default '💰',
  is_system  boolean not null default false,
  created_at timestamptz not null default now()
);

-- user_id = NULL means it's a global system category visible to everyone
alter table public.categories enable row level security;

create policy "Users can view own and system categories"
  on public.categories for select
  using (user_id = auth.uid() or user_id is null);

create policy "Users can insert own categories"
  on public.categories for insert
  with check (user_id = auth.uid());

create policy "Users can update own categories"
  on public.categories for update
  using (user_id = auth.uid());

create policy "Users can delete own categories"
  on public.categories for delete
  using (user_id = auth.uid());

-- ────────────────────────────────────────────────
-- 2. CATEGORY RULES
-- ────────────────────────────────────────────────
create table if not exists public.category_rules (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete cascade,
  field       text not null default 'description',
  operator    text not null default 'contains',
  value       text not null,
  priority    int  not null default 0,
  created_at  timestamptz not null default now(),

  constraint category_rules_field_check check (field in ('description', 'merchant', 'amount')),
  constraint category_rules_operator_check check (operator in ('contains', 'starts_with', 'ends_with', 'equals'))
);

alter table public.category_rules enable row level security;

create policy "Users can manage own rules"
  on public.category_rules for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ────────────────────────────────────────────────
-- 3. TRANSACTIONS
-- ────────────────────────────────────────────────
create table if not exists public.transactions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  date        date not null,
  amount      numeric(12, 2) not null,
  description text not null default '',
  merchant    text,
  category_id uuid references public.categories(id) on delete set null,
  source      text not null default 'manual',
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint transactions_source_check check (source in ('manual', 'excel', 'import'))
);

create index if not exists transactions_user_id_date_idx on public.transactions(user_id, date desc);
create index if not exists transactions_category_id_idx on public.transactions(category_id);

alter table public.transactions enable row level security;

create policy "Users can manage own transactions"
  on public.transactions for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop trigger if exists set_transactions_updated_at on public.transactions;

create trigger set_transactions_updated_at
  before update on public.transactions
  for each row
  execute function public.set_updated_at();

-- ────────────────────────────────────────────────
-- 4. GOALS
-- ────────────────────────────────────────────────
create table if not exists public.goals (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  name           text not null,
  target_amount  numeric(12, 2) not null,
  current_amount numeric(12, 2) not null default 0,
  deadline       date,
  icon           text not null default '🎯',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists goals_user_id_idx on public.goals(user_id);

alter table public.goals enable row level security;

create policy "Users can manage own goals"
  on public.goals for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop trigger if exists set_goals_updated_at on public.goals;

create trigger set_goals_updated_at
  before update on public.goals
  for each row
  execute function public.set_updated_at();

-- ────────────────────────────────────────────────
-- 5. SYSTEM CATEGORIES (default, visible to all)
-- ────────────────────────────────────────────────
insert into public.categories (id, user_id, name, color, icon, is_system) values
  (gen_random_uuid(), null, 'Alimentari',      '#22c55e', '🛒', true),
  (gen_random_uuid(), null, 'Casa',             '#f59e0b', '🏠', true),
  (gen_random_uuid(), null, 'Trasporti',        '#3b82f6', '🚗', true),
  (gen_random_uuid(), null, 'Salute',           '#ef4444', '❤️', true),
  (gen_random_uuid(), null, 'Abbigliamento',    '#8b5cf6', '👕', true),
  (gen_random_uuid(), null, 'Intrattenimento',  '#ec4899', '🎬', true),
  (gen_random_uuid(), null, 'Ristoranti',       '#f97316', '🍽️', true),
  (gen_random_uuid(), null, 'Viaggi',           '#06b6d4', '✈️', true),
  (gen_random_uuid(), null, 'Istruzione',       '#84cc16', '📚', true),
  (gen_random_uuid(), null, 'Tecnologia',       '#6366f1', '💻', true),
  (gen_random_uuid(), null, 'Palestra',         '#14b8a6', '💪', true),
  (gen_random_uuid(), null, 'Bollette',         '#64748b', '⚡', true),
  (gen_random_uuid(), null, 'Assicurazioni',    '#78716c', '🛡️', true),
  (gen_random_uuid(), null, 'Stipendio',        '#10b981', '💼', true),
  (gen_random_uuid(), null, 'Altro',            '#94a3b8', '📦', true)
on conflict do nothing;
