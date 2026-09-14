-- ============================================================
-- Migration: 013_smart_wizard_fields
-- Aggiunge due_day a recurring_expenses e amplia tipologia
-- per includere 'entrata' (movimenti ricorrenti in entrata).
-- ============================================================

-- 1. Aggiorna il CHECK su tipologia per includere 'entrata'
alter table public.recurring_expenses
  drop constraint if exists recurring_expenses_tipologia_check;

alter table public.recurring_expenses
  add constraint recurring_expenses_tipologia_check
    check (tipologia in ('fissa', 'variabile', 'entrata'));

-- 2. Aggiunge due_day: giorno del mese in cui avviene la spesa (1-31)
alter table public.recurring_expenses
  add column if not exists due_day int
    constraint recurring_expenses_due_day_check
      check (due_day is null or (due_day >= 1 and due_day <= 31));

comment on column public.recurring_expenses.due_day is
  'Giorno del mese in cui cade solitamente la spesa (1-31). NULL = non specificato / variabile.';
