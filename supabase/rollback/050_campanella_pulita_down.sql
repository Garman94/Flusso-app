-- Rollback della migration 050: riaccende le due notifiche di partenza spente dalla 050
-- ("tutti i formati Excel" e "sezione Smart"). Nessun dato era stato cancellato.
-- Uso: npx --no-install supabase db query --linked -f supabase/rollback/050_campanella_pulita_down.sql
-- Questa cartella non è letta da "supabase db push".

update public.admin_notifications
   set is_active = true
 where message like '%tutti i formati Excel%'
    or message like '%nella sezione Smart%';
