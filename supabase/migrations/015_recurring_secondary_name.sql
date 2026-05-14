-- ============================================================
-- Migration: 015_recurring_secondary_name
-- Aggiunge secondary_name a recurring_expenses.
-- Contiene il nome/descrizione della transazione collegata,
-- visualizzato tra parentesi dopo il nome principale.
-- ============================================================

alter table public.recurring_expenses
  add column if not exists secondary_name text;

comment on column public.recurring_expenses.secondary_name is
  'Nome secondario derivato dalla transazione collegata. Mostrato tra parentesi in UI.';
