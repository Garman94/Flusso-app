-- ================================================================
-- FLUSSO — Account Demo (modalita' "Prova la demo")
--
-- STEP 1: crea l'utente manualmente da
--   Supabase Dashboard -> Authentication -> Users -> Add user
--   Email: demo@flussoapp.it  |  Password: Flusso2026!
--   Spunta "Auto Confirm User"
--
-- STEP 2: applica le migrazioni (supabase db push) — la 025 crea
--   la funzione public.reseed_demo() e i trigger di sola-lettura.
--
-- STEP 3: esegui questo file in Supabase Studio -> SQL Editor.
--   Puoi rieseguirlo quando vuoi: ricarica i dati demo da zero.
--   L'endpoint /api/demo/reset lo richiama a ogni ingresso in demo.
-- ================================================================

select public.reseed_demo();
