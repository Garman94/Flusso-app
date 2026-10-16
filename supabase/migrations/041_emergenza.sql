-- Migration 041: Emergenza (dashboard e Pianifica → Accantonamenti → "🚨 Emergenza").
-- Quanto c'era già da parte per un accantonamento all'inizio del piano (saving_start_date).
-- Lo scrive solo l'Emergenza: dopo un prelievo il piano della voce riparte da questo mese con
-- quello che le è rimasto, e la quota mensile sale (lib/emergency.ts → planEmergency).
-- "Segna come pagata" e "Ricalcola da oggi" lo rimettono a 0.
-- Default 0 = piano di prima: le voci esistenti non cambiano.
-- Rollback: supabase/rollback/041_emergenza_down.sql (dopo aver riportato indietro il codice).

alter table public.recurring_expenses
  add column if not exists saving_offset numeric(12,2) not null default 0;
