-- Rollback della migration 044: toglie il dizionario condiviso dei negozi.
-- Prima riportare indietro il codice (Vercel → Instant Rollback): quello nuovo legge questa tabella.
-- Le categorie già assegnate ai movimenti restano.
-- Uso: npx --no-install supabase db query --linked -f supabase/rollback/044_dizionario_negozi_down.sql
-- Questa cartella non è letta da "supabase db push".

drop table if exists public.merchant_dictionary;
