-- Migration 032: category_budgets + category_budget_notes
-- Tab Smart > Budget: budget mensile manuale per categoria, con storico e
-- annotazione dei mesi "speciali" (spesa che si scosta oltre il 50% dalla
-- media dei mesi normali). Sostituisce, nel tab Smart, la selezione +
-- range automatico del vecchio pannello "Spese variabili". La tabella
-- variable_expense_categories resta invariata e in uso per il calcolo
-- "Spese previste" in dashboard, finche' non viene aggiornato a sua volta.

create table if not exists public.category_budgets (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  category_id    uuid not null references public.categories(id) on delete cascade,
  monthly_budget numeric not null default 0,
  updated_at     timestamptz not null default now(),
  unique (user_id, category_id)
);

alter table public.category_budgets enable row level security;

create policy "Users can manage own category budgets"
  on public.category_budgets
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Nota facoltativa su un mese "speciale" di una categoria (es. "questo mese
-- abbiamo speso di piu' perche'..."), per spiegare l'anomalia nella
-- sottopagina di dettaglio. La classificazione "speciale" e' calcolata al
-- volo lato client (classifyCategoryMonths in lib/calculations.ts): qui si
-- persiste solo il testo della nota, non lo stato di classificazione.
create table if not exists public.category_budget_notes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete cascade,
  year        int not null,
  month       int not null check (month between 1 and 12),
  note        text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, category_id, year, month)
);

alter table public.category_budget_notes enable row level security;

create policy "Users can manage own category budget notes"
  on public.category_budget_notes
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
