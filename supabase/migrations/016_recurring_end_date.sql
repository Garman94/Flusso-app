-- ============================================================
-- Migration: 016_recurring_end_date
-- Aggiunge end_date a recurring_expenses per le voci a rate
-- o con scadenza definita (es. mutuo, finanziamento).
-- ============================================================

alter table public.recurring_expenses
  add column if not exists end_date date;

comment on column public.recurring_expenses.end_date is
  'Data di fine per voci a rate o con scadenza (es. finanziamento). NULL = nessuna scadenza.';
