-- Rollback della migration 048: toglie i conti. I movimenti restano, senza conto; il saldo torna
-- quello unico di prima (profiles.period_starting_balance, mai toccato dai conti).
-- Prima riportare indietro il codice (Vercel → Instant Rollback): quello nuovo legge queste colonne.
-- Uso: npx --no-install supabase db query --linked -f supabase/rollback/048_conti_down.sql
-- Questa cartella non è letta da "supabase db push".

drop trigger if exists default_transaction_account on public.transactions;
drop function if exists public.default_transaction_account();
alter table public.savings_pots drop column if exists account_id;
drop index if exists public.transactions_account_date;
alter table public.transactions drop column if exists account_id;
drop table if exists public.accounts;
