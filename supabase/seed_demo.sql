-- ================================================================
-- FLUSSO — Account Demo per LemonSqueezy
--
-- STEP 1: crea l'utente manualmente da
--   Supabase Dashboard → Authentication → Users → Add user
--   Email: demo@flussoapp.it  |  Password: Flusso2026!
--   Spunta "Auto Confirm User"
--
-- STEP 2: copia l'UUID dell'utente appena creato e incollalo
--   nella variabile demo_id qui sotto, poi esegui questo script
--   in Supabase Studio → SQL Editor
-- ================================================================

BEGIN;

DO $$
DECLARE
  demo_id             uuid := '5037111f-9c4e-4a2e-b00a-b9f0a0182ae9'::uuid;

  cat_alimentari      uuid;
  cat_casa            uuid;
  cat_trasporti       uuid;
  cat_salute          uuid;
  cat_ristoranti      uuid;
  cat_intrattenimento uuid;
  cat_bollette        uuid;
  cat_assicurazioni   uuid;
  cat_stipendio       uuid;
  cat_palestra        uuid;
  cat_tecnologia      uuid;
  cat_abbigliamento   uuid;
  cat_altro           uuid;
BEGIN

  -- ── 1. Profilo: piano premium ────────────────────────────────
  UPDATE public.profiles
  SET plan = 'premium', full_name = 'Marco Demo'
  WHERE id = demo_id;

  -- ── 2. Recupero ID categorie di sistema ──────────────────────
  SELECT id INTO cat_alimentari      FROM public.categories WHERE name='Alimentari'       AND user_id IS NULL LIMIT 1;
  SELECT id INTO cat_casa            FROM public.categories WHERE name='Casa'              AND user_id IS NULL LIMIT 1;
  SELECT id INTO cat_trasporti       FROM public.categories WHERE name='Trasporti'         AND user_id IS NULL LIMIT 1;
  SELECT id INTO cat_salute          FROM public.categories WHERE name='Salute'            AND user_id IS NULL LIMIT 1;
  SELECT id INTO cat_ristoranti      FROM public.categories WHERE name='Ristoranti'        AND user_id IS NULL LIMIT 1;
  SELECT id INTO cat_intrattenimento FROM public.categories WHERE name='Intrattenimento'   AND user_id IS NULL LIMIT 1;
  SELECT id INTO cat_bollette        FROM public.categories WHERE name='Bollette'          AND user_id IS NULL LIMIT 1;
  SELECT id INTO cat_assicurazioni   FROM public.categories WHERE name='Assicurazioni'     AND user_id IS NULL LIMIT 1;
  SELECT id INTO cat_stipendio       FROM public.categories WHERE name='Stipendio'         AND user_id IS NULL LIMIT 1;
  SELECT id INTO cat_palestra        FROM public.categories WHERE name='Palestra'          AND user_id IS NULL LIMIT 1;
  SELECT id INTO cat_tecnologia      FROM public.categories WHERE name='Tecnologia'        AND user_id IS NULL LIMIT 1;
  SELECT id INTO cat_abbigliamento   FROM public.categories WHERE name='Abbigliamento'     AND user_id IS NULL LIMIT 1;
  SELECT id INTO cat_altro           FROM public.categories WHERE name='Altro'             AND user_id IS NULL LIMIT 1;

  -- ── 3. Pulizia dati precedenti (idempotente) ─────────────────
  DELETE FROM public.transactions      WHERE user_id = demo_id;
  DELETE FROM public.goals             WHERE user_id = demo_id;
  DELETE FROM public.budget_items      WHERE user_id = demo_id;
  DELETE FROM public.recurring_expenses WHERE user_id = demo_id;

  -- ── 4. Transazioni (Marzo–Giugno 2026) ──────────────────────
  INSERT INTO public.transactions
    (user_id, date, amount, description, merchant, category_id, source)
  VALUES

  -- ━━ MARZO 2026 ━━
  (demo_id, '2026-02-27',  2100.00, 'Stipendio febbraio',     'Azienda SpA',        cat_stipendio,       'manual'),
  (demo_id, '2026-03-01',   -45.00, 'Palestra mensile',       'FitLife',            cat_palestra,        'manual'),
  (demo_id, '2026-03-04',  -800.00, 'Affitto marzo',          'Agenzia Immob.',     cat_casa,            'manual'),
  (demo_id, '2026-03-05',   -68.50, 'Spesa Esselunga',        'Esselunga',          cat_alimentari,      'manual'),
  (demo_id, '2026-03-07',   -29.00, 'Fastweb Internet',       'Fastweb',            cat_bollette,        'manual'),
  (demo_id, '2026-03-09',   -55.00, 'Carburante Q8',          'Q8',                 cat_trasporti,       'manual'),
  (demo_id, '2026-03-11',   -12.90, 'Tim ricarica',           'Tim',                cat_bollette,        'manual'),
  (demo_id, '2026-03-12',   -72.00, 'Spesa Conad',            'Conad',              cat_alimentari,      'manual'),
  (demo_id, '2026-03-14',   -35.00, 'Cena Osteria del Porto', 'Osteria del Porto',  cat_ristoranti,      'manual'),
  (demo_id, '2026-03-15',   -17.99, 'Netflix',                'Netflix',            cat_intrattenimento, 'manual'),
  (demo_id, '2026-03-16',   -48.00, 'Farmacia San Marco',     'Farmacia',           cat_salute,          'manual'),
  (demo_id, '2026-03-17',   -62.00, 'Carburante Eni',         'Eni',                cat_trasporti,       'manual'),
  (demo_id, '2026-03-18',   150.00, 'Rimborso spese lavoro',  'Azienda SpA',        cat_stipendio,       'manual'),
  (demo_id, '2026-03-19',   -84.00, 'Spesa Esselunga',        'Esselunga',          cat_alimentari,      'manual'),
  (demo_id, '2026-03-20',  -120.00, 'Bolletta Enel Energia',  'Enel Energia',       cat_bollette,        'manual'),
  (demo_id, '2026-03-21',   -19.99, 'Spotify Premium',        'Spotify',            cat_intrattenimento, 'manual'),
  (demo_id, '2026-03-22',   -45.00, 'Cena Pizzeria Da Luca',  'Pizzeria Da Luca',   cat_ristoranti,      'manual'),
  (demo_id, '2026-03-24',   -28.00, 'Amazon ordine libri',    'Amazon',             cat_altro,           'manual'),
  (demo_id, '2026-03-25',   -66.00, 'Spesa Lidl',             'Lidl',               cat_alimentari,      'manual'),
  (demo_id, '2026-03-27',   -90.00, 'Abbigliamento Zara',     'Zara',               cat_abbigliamento,   'manual'),
  (demo_id, '2026-03-28',  2100.00, 'Stipendio marzo',        'Azienda SpA',        cat_stipendio,       'manual'),
  (demo_id, '2026-03-29',   -55.00, 'Carburante Q8',          'Q8',                 cat_trasporti,       'manual'),

  -- ━━ APRILE 2026 ━━
  (demo_id, '2026-04-01',   -45.00, 'Palestra aprile',        'FitLife',            cat_palestra,        'manual'),
  (demo_id, '2026-04-02',  -800.00, 'Affitto aprile',         'Agenzia Immob.',     cat_casa,            'manual'),
  (demo_id, '2026-04-03',   -78.00, 'Spesa Esselunga',        'Esselunga',          cat_alimentari,      'manual'),
  (demo_id, '2026-04-05',   -29.00, 'Fastweb Internet',       'Fastweb',            cat_bollette,        'manual'),
  (demo_id, '2026-04-07',   -12.90, 'Tim ricarica',           'Tim',                cat_bollette,        'manual'),
  (demo_id, '2026-04-08',   -60.00, 'Carburante Eni',         'Eni',                cat_trasporti,       'manual'),
  (demo_id, '2026-04-09',   -55.00, 'Spesa Conad',            'Conad',              cat_alimentari,      'manual'),
  (demo_id, '2026-04-10',   -17.99, 'Netflix',                'Netflix',            cat_intrattenimento, 'manual'),
  (demo_id, '2026-04-11',   -42.00, 'Pranzo Trattoria Bella', 'Trattoria Bella',    cat_ristoranti,      'manual'),
  (demo_id, '2026-04-12',  -145.00, 'Bolletta Enel Energia',  'Enel Energia',       cat_bollette,        'manual'),
  (demo_id, '2026-04-14',   -32.00, 'Farmacia Centrale',      'Farmacia',           cat_salute,          'manual'),
  (demo_id, '2026-04-15',   -19.99, 'Spotify Premium',        'Spotify',            cat_intrattenimento, 'manual'),
  (demo_id, '2026-04-16',   -80.00, 'Spesa Esselunga',        'Esselunga',          cat_alimentari,      'manual'),
  (demo_id, '2026-04-18',   -58.00, 'Carburante Q8',          'Q8',                 cat_trasporti,       'manual'),
  (demo_id, '2026-04-20',  -250.00, 'Volo Milano-Roma',       'Ryanair',            cat_altro,           'manual'),
  (demo_id, '2026-04-22',   -65.00, 'Spesa Lidl',             'Lidl',               cat_alimentari,      'manual'),
  (demo_id, '2026-04-23',   -38.00, 'Cena Sushi House',       'Sushi House',        cat_ristoranti,      'manual'),
  (demo_id, '2026-04-25',   -70.00, 'Carburante Eni',         'Eni',                cat_trasporti,       'manual'),
  (demo_id, '2026-04-27',  2100.00, 'Stipendio aprile',       'Azienda SpA',        cat_stipendio,       'manual'),
  (demo_id, '2026-04-29',   -75.00, 'Spesa Esselunga',        'Esselunga',          cat_alimentari,      'manual'),

  -- ━━ MAGGIO 2026 ━━
  (demo_id, '2026-05-01',   -45.00, 'Palestra maggio',        'FitLife',            cat_palestra,        'manual'),
  (demo_id, '2026-05-02',  -800.00, 'Affitto maggio',         'Agenzia Immob.',     cat_casa,            'manual'),
  (demo_id, '2026-05-03',   -71.00, 'Spesa Conad',            'Conad',              cat_alimentari,      'manual'),
  (demo_id, '2026-05-05',   -29.00, 'Fastweb Internet',       'Fastweb',            cat_bollette,        'manual'),
  (demo_id, '2026-05-06',   -55.00, 'Carburante Q8',          'Q8',                 cat_trasporti,       'manual'),
  (demo_id, '2026-05-07',   -12.90, 'Tim ricarica',           'Tim',                cat_bollette,        'manual'),
  (demo_id, '2026-05-08',   -17.99, 'Netflix',                'Netflix',            cat_intrattenimento, 'manual'),
  (demo_id, '2026-05-09',   -66.00, 'Spesa Esselunga',        'Esselunga',          cat_alimentari,      'manual'),
  (demo_id, '2026-05-10',   -19.99, 'Spotify Premium',        'Spotify',            cat_intrattenimento, 'manual'),
  (demo_id, '2026-05-12',   -48.00, 'Cena Al Vecchio Mulino', 'Al Vecchio Mulino',  cat_ristoranti,      'manual'),
  (demo_id, '2026-05-13',   -62.00, 'Carburante Eni',         'Eni',                cat_trasporti,       'manual'),
  (demo_id, '2026-05-15',   -25.00, 'Farmacia Salute+',       'Farmacia',           cat_salute,          'manual'),
  (demo_id, '2026-05-17',   -88.00, 'Spesa Esselunga',        'Esselunga',          cat_alimentari,      'manual'),
  (demo_id, '2026-05-18',   350.00, 'Bonus performance Q1',   'Azienda SpA',        cat_stipendio,       'manual'),
  (demo_id, '2026-05-19',  -130.00, 'Bolletta Enel Energia',  'Enel Energia',       cat_bollette,        'manual'),
  (demo_id, '2026-05-20',  -199.00, 'Scarpe Nike',            'Nike Store',         cat_abbigliamento,   'manual'),
  (demo_id, '2026-05-21',   -34.00, 'Cena Osteria del Porto', 'Osteria del Porto',  cat_ristoranti,      'manual'),
  (demo_id, '2026-05-22',   -68.00, 'Spesa Lidl',             'Lidl',               cat_alimentari,      'manual'),
  (demo_id, '2026-05-24',   -57.00, 'Carburante Q8',          'Q8',                 cat_trasporti,       'manual'),
  (demo_id, '2026-05-26',   -15.00, 'Apple iCloud',           'Apple',              cat_tecnologia,      'manual'),
  (demo_id, '2026-05-27',  2100.00, 'Stipendio maggio',       'Azienda SpA',        cat_stipendio,       'manual'),
  (demo_id, '2026-05-28',   -77.00, 'Spesa Esselunga',        'Esselunga',          cat_alimentari,      'manual'),
  (demo_id, '2026-05-30',   -40.00, 'Visita medico',          'Studio Medico',      cat_salute,          'manual'),

  -- ━━ GIUGNO 2026 (al 14 giugno) ━━
  (demo_id, '2026-06-01',   -45.00, 'Palestra giugno',        'FitLife',            cat_palestra,        'manual'),
  (demo_id, '2026-06-02',  -800.00, 'Affitto giugno',         'Agenzia Immob.',     cat_casa,            'manual'),
  (demo_id, '2026-06-04',   -29.00, 'Fastweb Internet',       'Fastweb',            cat_bollette,        'manual'),
  (demo_id, '2026-06-05',   -73.00, 'Spesa Esselunga',        'Esselunga',          cat_alimentari,      'manual'),
  (demo_id, '2026-06-06',   -60.00, 'Carburante Eni',         'Eni',                cat_trasporti,       'manual'),
  (demo_id, '2026-06-08',   -12.90, 'Tim ricarica',           'Tim',                cat_bollette,        'manual'),
  (demo_id, '2026-06-10',   -17.99, 'Netflix',                'Netflix',            cat_intrattenimento, 'manual'),
  (demo_id, '2026-06-11',   -19.99, 'Spotify Premium',        'Spotify',            cat_intrattenimento, 'manual'),
  (demo_id, '2026-06-12',   -52.00, 'Spesa Conad',            'Conad',              cat_alimentari,      'manual'),
  (demo_id, '2026-06-13',   -38.00, 'Cena Pizzeria Da Luca',  'Pizzeria Da Luca',   cat_ristoranti,      'manual'),
  (demo_id, '2026-06-14',   -55.00, 'Carburante Q8',          'Q8',                 cat_trasporti,       'manual');

  -- ── 5. Obiettivi di risparmio ────────────────────────────────
  INSERT INTO public.goals (user_id, name, target_amount, current_amount, deadline, icon) VALUES
  (demo_id, 'Vacanza estiva',   2000.00,  820.00, '2026-08-01', '🌴'),
  (demo_id, 'Fondo emergenza',  5000.00, 1650.00, null,         '🛡️'),
  (demo_id, 'MacBook Pro',      2500.00,  400.00, '2026-12-31', '💻');

  -- ── 6. Budget items (Smart > Previsioni) ─────────────────────
  INSERT INTO public.budget_items (user_id, name, amount, frequency, category_id) VALUES
  (demo_id, 'Affitto',           800.00, 'mensile',    cat_casa),
  (demo_id, 'Alimentari',        300.00, 'mensile',    cat_alimentari),
  (demo_id, 'Trasporti',         200.00, 'mensile',    cat_trasporti),
  (demo_id, 'Bollette',          100.00, 'mensile',    cat_bollette),
  (demo_id, 'Ristoranti / cene', 150.00, 'mensile',    cat_ristoranti),
  (demo_id, 'Palestra',           45.00, 'mensile',    cat_palestra),
  (demo_id, 'Netflix',            17.99, 'mensile',    cat_intrattenimento),
  (demo_id, 'Spotify',            19.99, 'mensile',    cat_intrattenimento),
  (demo_id, 'Assicurazione auto', 650.00, 'annuale',   cat_assicurazioni),
  (demo_id, 'Vacanza estiva',    2000.00, 'una_tantum', null);

  -- ── 7. Spese ricorrenti (Smart > Ricorrenti) ─────────────────
  INSERT INTO public.recurring_expenses (
    user_id, name, tipologia, frequency,
    amount, amount_max,
    category_id, notes,
    match_keywords, matching_strategy,
    due_day, due_month,
    next_due_date, saving_start_date
  ) VALUES

  (demo_id, 'Affitto', 'fissa', 'mensile',
   800.00, null,
   cat_casa, 'Affitto appartamento',
   ARRAY['affitto', 'agenzia immob'], 'keyword',
   5, null, '2026-07-05', '2026-06-14'),

  (demo_id, 'Luce & Gas', 'variabile', 'bimestrale',
   80.00, 160.00,
   cat_bollette, 'Bolletta Enel Energia — varia per stagione',
   ARRAY['enel', 'bolletta enel'], 'historical_avg',
   20, null, '2026-07-20', '2026-06-14'),

  (demo_id, 'Internet Fastweb', 'fissa', 'mensile',
   29.00, null,
   cat_bollette, null,
   ARRAY['fastweb'], 'keyword',
   5, null, '2026-07-05', '2026-06-14'),

  (demo_id, 'Telefono Tim', 'fissa', 'mensile',
   12.90, null,
   cat_bollette, null,
   ARRAY['tim', 'tim ricarica'], 'keyword',
   8, null, '2026-07-08', '2026-06-14'),

  (demo_id, 'Netflix', 'fissa', 'mensile',
   17.99, null,
   cat_intrattenimento, null,
   ARRAY['netflix'], 'keyword',
   10, null, '2026-07-10', '2026-06-14'),

  (demo_id, 'Spotify Premium', 'fissa', 'mensile',
   19.99, null,
   cat_intrattenimento, null,
   ARRAY['spotify'], 'keyword',
   10, null, '2026-07-10', '2026-06-14'),

  (demo_id, 'Palestra FitLife', 'fissa', 'mensile',
   45.00, null,
   cat_palestra, 'Abbonamento mensile',
   ARRAY['fitlife', 'palestra'], 'keyword',
   1, null, '2026-07-01', '2026-06-14'),

  (demo_id, 'Assicurazione Auto', 'fissa', 'annuale',
   650.00, null,
   cat_assicurazioni, 'Rinnovo annuale polizza veicolo',
   ARRAY['assicurazione', 'polizza'], 'keyword',
   15, 3, '2027-03-15', '2026-06-14'),

  (demo_id, 'Stipendio', 'entrata', 'mensile',
   2100.00, null,
   cat_stipendio, 'Stipendio mensile netto',
   ARRAY['stipendio', 'azienda spa'], 'keyword',
   27, null, '2026-06-27', '2026-06-14');

END $$;

COMMIT;
