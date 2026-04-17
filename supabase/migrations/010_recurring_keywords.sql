-- ============================================================
-- Migration: 010_recurring_keywords
-- Aggiunge match_keywords a recurring_expenses per il sistema
-- di riconoscimento automatico delle transazioni.
--
-- match_keywords è un array di stringhe: ogni keyword viene
-- cercata (case-insensitive, contains) nei campi description
-- e merchant delle transazioni. Se almeno una keyword matcha,
-- la transazione viene attribuita alla voce ricorrente.
-- ============================================================

alter table public.recurring_expenses
  add column if not exists match_keywords text[] not null default '{}';

comment on column public.recurring_expenses.match_keywords is
  'Array di parole chiave (case-insensitive contains) per il riconoscimento automatico delle transazioni corrispondenti. Es: ["enel", "bolletta gas"]';
