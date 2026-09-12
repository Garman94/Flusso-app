-- Migration 031: variable_expense_categories
-- Categorie che l'utente considera "spese variabili" ai fini della stima
-- min-max sulla dashboard (BalanceHeroCard) e del pannello Smart > Spese variabili.
-- Se non ci sono righe per l'utente, i client usano un default (Alimentari,
-- Abbigliamento, Tecnologia, Trasporti, Intrattenimento) senza scrivere nulla.

create table if not exists public.variable_expense_categories (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (user_id, category_id)
);

alter table public.variable_expense_categories enable row level security;

create policy "Users can manage own variable expense categories"
  on public.variable_expense_categories
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
