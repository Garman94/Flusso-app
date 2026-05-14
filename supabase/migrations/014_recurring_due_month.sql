-- ============================================================
-- Migration: 014_recurring_due_month
-- Aggiunge due_month a recurring_expenses per le voci annuali.
-- Permette di specificare il mese (1-12) oltre al giorno (1-31).
-- ============================================================

alter table public.recurring_expenses
  add column if not exists due_month int
    constraint recurring_expenses_due_month_check
      check (due_month is null or (due_month >= 1 and due_month <= 12));

comment on column public.recurring_expenses.due_month is
  'Mese in cui cade la spesa (1-12). Usato insieme a due_day per le voci con frequency = annuale.';
