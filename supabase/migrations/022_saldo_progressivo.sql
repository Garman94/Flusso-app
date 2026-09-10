-- ============================================================
-- Migration: 022_saldo_progressivo
-- Feature: Saldo progressivo giornaliero + avviso scadenze non pagate
--
-- period_starting_balance / period_starting_balance_date: ancora manuale
-- per il periodo corrente. Non è un "balance" globale mutabile (rimosso
-- con 015): è l'importo che l'utente dichiara di avere all'inizio del
-- periodo corrente; il saldo attuale si ricava sempre come
-- period_starting_balance + somma delle transazioni da quella data.
-- ============================================================

alter table public.profiles
  add column if not exists period_starting_balance numeric(12, 2),
  add column if not exists period_starting_balance_date date;

alter table public.recurring_expenses
  add column if not exists last_paid_date date,
  add column if not exists payment_status text not null default 'pending'
    constraint recurring_expenses_payment_status_check
      check (payment_status in ('pending', 'paid', 'overdue'));

create table if not exists public.payment_confirmations (
  id                    uuid primary key default gen_random_uuid(),
  recurring_expense_id  uuid not null references public.recurring_expenses(id) on delete cascade,
  user_id               uuid not null references auth.users(id) on delete cascade,
  paid_date             date not null default current_date,
  amount_paid           numeric(12, 2) not null,
  notes                 text,
  created_at            timestamptz not null default now()
);

create index if not exists payment_confirmations_recurring_idx on public.payment_confirmations(recurring_expense_id);
create index if not exists payment_confirmations_user_idx on public.payment_confirmations(user_id);

alter table public.payment_confirmations enable row level security;

create policy "Users can manage own payment confirmations"
  on public.payment_confirmations for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
