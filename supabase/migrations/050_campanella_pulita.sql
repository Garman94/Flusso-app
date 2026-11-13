-- Migration 050: spegne le notifiche della campanella che non dicono più il vero.
-- Le due notifiche di partenza della 028 promettono cose superate:
--   - "Benvenuto su Flusso!": "Supportiamo tutti i formati Excel delle banche italiane" (non è
--     così: alcune banche vanno sistemate a mano, e il benvenuto ora lo fa /onboarding);
--   - "Hai già aggiunto le spese ricorrenti?": rimanda alla "sezione Smart", che oggi si chiama
--     Pianifica e ha le Spese fisse.
-- Non cancella niente: is_active = false, così restano nello storico e le "ignorate" degli
-- utenti (notification_dismissals) non si perdono. La notifica del feedback resta accesa.
-- Rollback: supabase/rollback/050_campanella_pulita_down.sql

update public.admin_notifications
   set is_active = false
 where message like '%tutti i formati Excel%'
    or message like '%nella sezione Smart%';
