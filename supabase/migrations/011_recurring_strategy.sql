-- ============================================================
-- Migration: 011_recurring_strategy
-- Aggiunge matching_strategy a recurring_expenses.
--
-- matching_strategy:
--   'keyword'       (default) — usa match_keywords per trovare transazioni;
--                               la previsione è l'importo inserito manualmente.
--   'historical_avg' — usa match_keywords per trovare transazioni storiche;
--                      la previsione è la media dello stesso mese calendar
--                      negli anni precedenti (utile per luce/gas con variabilità
--                      stagionale).
-- ============================================================

alter table public.recurring_expenses
  add column if not exists matching_strategy text not null default 'keyword'
    constraint recurring_expenses_strategy_check
      check (matching_strategy in ('keyword', 'historical_avg'));

comment on column public.recurring_expenses.matching_strategy is
  'keyword = previsione manuale; historical_avg = previsione media stesso mese anni precedenti';
