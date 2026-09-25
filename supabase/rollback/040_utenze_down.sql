-- Rollback della migration 040: toglie il calcolatore di luce e gas (tabelle e dati demo).
-- Prima riportare indietro il codice (Vercel → Instant Rollback): quello nuovo legge queste tabelle.
-- ATTENZIONE: cancella anche tariffe e consumi inseriti dagli utenti.
-- Uso: npx --no-install supabase db query --linked -f supabase/rollback/040_utenze_down.sql
-- Questa cartella non è letta da "supabase db push".

drop function if exists public.reseed_demo_utenze();
drop table if exists public.utility_readings;
drop table if exists public.utility_tariffs;
