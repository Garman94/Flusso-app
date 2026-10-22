-- Rollback della migration 047: toglie auto e carburante (veicoli, rifornimenti, tragitti, pause).
-- Prima riportare indietro il codice (Vercel → Instant Rollback): quello nuovo legge queste tabelle.
-- I movimenti della banca non si toccano.
-- Uso: npx --no-install supabase db query --linked -f supabase/rollback/047_carburante_down.sql
-- Questa cartella non è letta da "supabase db push".

drop table if exists public.vehicle_pauses;
drop table if exists public.vehicle_routines;
drop table if exists public.vehicle_refuels;
drop table if exists public.vehicles;
