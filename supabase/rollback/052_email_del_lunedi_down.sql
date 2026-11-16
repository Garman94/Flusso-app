-- Rollback della migration 052: toglie le preferenze email e lo storico degli invii.
-- Prima il codice (revert della PR), poi questo: senza le colonne il codice nuovo non manda email.
-- Uso: incollalo in Supabase → SQL Editor (o supabase db query --linked -f ...).
-- Questa cartella non è letta da "supabase db push".

drop table if exists public.email_sends;

alter table public.profiles
  drop column if exists email_weekly,
  drop column if exists email_monthly;
