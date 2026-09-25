-- Rollback della migration 039: toglie il tipo delle spese fisse.
-- Prima riportare indietro il codice (Vercel → Instant Rollback): quello nuovo scrive la colonna.
-- Uso: npx --no-install supabase db query --linked -f supabase/rollback/039_fixed_group_down.sql
-- Questa cartella non è letta da "supabase db push".

alter table public.recurring_expenses drop constraint if exists recurring_expenses_fixed_group_check;
alter table public.recurring_expenses drop column if exists fixed_group;
