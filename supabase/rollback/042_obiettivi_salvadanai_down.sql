-- Rollback della migration 042: gli obiettivi collegati smettono di seguire il saldo del
-- salvadanaio nel database (goals.current_amount resta all'ultimo valore).
-- Prima riportare indietro il codice (Vercel → Instant Rollback).
-- Uso: npx --no-install supabase db query --linked -f supabase/rollback/042_obiettivi_salvadanai_down.sql
-- Questa cartella non è letta da "supabase db push".

drop trigger if exists sync_goal_from_pot on public.savings_pots;
drop function if exists public.sync_goal_from_pot();
