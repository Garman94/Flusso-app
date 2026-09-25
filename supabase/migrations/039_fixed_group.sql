-- Migration 039: tipo delle spese fisse (Pianifica → Spese fisse): casa, utenze, abbonamenti,
-- trasporti, assicurazioni, altro. Vuoto = dedotto da nome e categoria
-- (lib/fixed-expenses.ts → fixedGroupOf), quindi le voci esistenti non vanno toccate.
-- Solo una colonna in più: il codice precedente la ignora.
-- Rollback: supabase/rollback/039_fixed_group_down.sql (dopo aver riportato indietro il codice).

alter table public.recurring_expenses add column if not exists fixed_group text;

alter table public.recurring_expenses drop constraint if exists recurring_expenses_fixed_group_check;
alter table public.recurring_expenses add constraint recurring_expenses_fixed_group_check
  check (fixed_group is null or fixed_group in ('casa', 'utenze', 'abbonamenti', 'trasporti', 'assicurazioni', 'altro'));
