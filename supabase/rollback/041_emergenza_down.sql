-- Rollback della migration 041: toglie quanto c'era già da parte per gli accantonamenti
-- ripartiti dopo un'Emergenza (le loro quote tornano a importo ÷ mesi, quindi più basse).
-- Prima riportare indietro il codice (Vercel → Instant Rollback): quello nuovo legge la colonna.
-- Uso: npx --no-install supabase db query --linked -f supabase/rollback/041_emergenza_down.sql
-- Questa cartella non è letta da "supabase db push".

alter table public.recurring_expenses drop column if exists saving_offset;
