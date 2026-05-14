-- ============================================================
-- Migration: 014_recurring_extras
-- Aggiunge campi extra a recurring_expenses:
--   due_month     — mese (1-12) per voci annuali
--   secondary_name — nome dalla transazione collegata (UI: tra parentesi)
--   end_date      — data fine per rate / finanziamenti
-- ============================================================

alter table public.recurring_expenses
  add column if not exists due_month int
    constraint recurring_expenses_due_month_check
      check (due_month is null or (due_month >= 1 and due_month <= 12)),

  add column if not exists secondary_name text,

  add column if not exists end_date date;
