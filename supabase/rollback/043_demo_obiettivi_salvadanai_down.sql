-- Rollback della migration 043 (solo demo): toglie la funzione e ricarica la demo di prima.
-- Uso: npx --no-install supabase db query --linked -f supabase/rollback/043_demo_obiettivi_salvadanai_down.sql
-- Questa cartella non è letta da "supabase db push".

drop function if exists public.reseed_demo_salvadanai();
select public.reseed_demo();
select public.reseed_demo_utenze();
