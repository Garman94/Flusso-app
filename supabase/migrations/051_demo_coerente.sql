-- Migration 051 (solo demo): una demo che torna in ogni pagina.
-- Prima (prove del 10/11/2026): movimenti con date future, "aggiornato dal 1 nov" con il periodo
-- che parte il 27/10, ottobre con 1.400 € di entrate contro 2.100 € di stipendio (lo stipendio del
-- 27/9, domenica, cadeva nel periodo prima), risparmio negativo, spesa più grande = giorno più caro,
-- Conti e Carburante vuoti, "Ciao, Marco!", "Vacanza estiva" e "Vacanza 2026" per la stessa cosa.
-- Ora reseed_demo() costruisce i dati sui periodi di paga (giorno 27, spostato come in lib/period.ts:
-- sabato → venerdì, domenica → lunedì), mai dopo oggi:
--   - Giulia (titolare, stipendio il giorno di paga) e Luca (fattura il 10): entrate = quelle di Account;
--   - in ogni periodo chiuso si risparmia circa un quarto delle entrate;
--   - la spesa più grande (un acquisto da solo nel suo giorno) non è il giorno più caro (spesa + cena);
--   - un conto ("Conto in comune") con l'ancora a ieri e tutti i movimenti, salvadanai compresi;
--   - un'auto con i rifornimenti presi dai movimenti (l'ultimo resta da usare) e il tragitto casa-lavoro;
--   - ogni obiettivo col suo salvadanaio, gli accantonamenti nel salvadanaio "Accantonamenti" in pari.
-- reseed_demo_salvadanai() (043) non serve più: resta, vuota, perché /api/demo/reset la chiama.
-- Non tocca dati degli utenti. Rollback: supabase/rollback/051_demo_coerente_down.sql

create or replace function public.reseed_demo()
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  demo_id     uuid := public.demo_user_id();
  giulia_id   uuid;
  luca_id     uuid;
  acc_id      uuid;
  pot_vacanza uuid;
  pot_laptop  uuid;
  pot_emerg   uuid;
  pot_acc     uuid;
  veh_id      uuid;

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
  cat_hobby           uuid;
  cat_shopping        uuid;
  cat_accantonamenti  uuid;
  cat_salvadanaio     uuid;

  opening    numeric := 800.00;  -- saldo del conto prima dei movimenti della demo
  bm         date;               -- primo del mese in cui parte il periodo di paga di oggi
  ms         date;               -- primo del mese in cui parte il periodo del giro
  ps         date;               -- inizio del periodo del giro
  nx         date;               -- primo del mese dopo: il giorno d del periodo è nx + d - 1
  first_ps   date;
  cur_ps     date;
  i          int;
  acc_quota  numeric;
  acc_target numeric;
  acc_amt    numeric;
  r          record;
  pr         numeric;
  q          numeric;

  -- Un valore per periodo, dal più vecchio (1) a quello in corso (7)
  esse1   numeric[] := '{86.40,91.20,82.75,94.10,88.30,80.95,89.60}';
  esse2   numeric[] := '{118.20,112.45,124.80,115.30,121.60,113.90,119.75}';
  conad1  numeric[] := '{52.30,47.80,58.90,44.60,55.10,49.95,53.40}';
  conad2  numeric[] := '{61.20,57.45,49.80,63.10,54.70,59.30,56.85}';
  fuel1   numeric[] := '{48.00,52.50,45.00,55.00,50.00,47.50,53.00}';
  fuel2   numeric[] := '{51.00,46.00,54.50,49.00,45.50,52.00,48.50}';
  enel    numeric[] := '{112.40,106.80,118.30,129.90,124.70,108.20,121.60}';
  fattura numeric[] := '{940.00,985.00,910.00,1020.00,960.00,935.00,990.00}';
  -- Ristoranti: tre volte a periodo con la stessa prima parola, così non sembrano una spesa fissa
  rword   text[]    := '{Pizzeria,Trattoria,Sushi,Osteria,Pizzeria,Trattoria,Sushi}';
  rest1n  text[]    := '{Napoli,da Gino,Zen,del Ponte,Vesuvio,del Borgo,Kyoto}';
  rest1   numeric[] := '{32.50,38.00,41.20,29.80,35.60,44.00,36.40}';
  cenan   text[]    := '{Bella Napoli,dal Nonno,Hana,dei Mercanti,Margherita,La Pergola,Sakura}';
  cena    numeric[] := '{58.00,64.50,71.80,49.90,76.00,55.40,67.20}';
  rest2n  text[]    := '{Sorrento,Toscana,Ichiban,Antica,Partenope,Al Castello,Tokyo}';
  rest2   numeric[] := '{39.00,33.50,46.80,42.10,31.90,37.60,44.30}';
  -- L'acquisto più grande del periodo, da solo nel suo giorno e sempre meno del giorno più caro
  bign    text[]    := '{Zara,MediaWorld,IKEA,Decathlon,Amazon,Leroy Merlin,Unieuro}';
  big     numeric[] := '{134.90,149.00,129.50,139.99,142.30,131.80,145.00}';
  extra   numeric[] := '{24.60,18.90,31.20,22.40,27.80,19.50,26.30}';
  ferr    numeric[] := '{null,23.50,null,null,17.80,null,null}';
  bigcat  uuid[];
begin
  if demo_id is null then
    raise notice 'Utente demo@flussoapp.it inesistente: creare prima l''utente in Auth.';
    return;
  end if;

  select id into cat_alimentari      from categories where name='Alimentari'      and user_id is null limit 1;
  select id into cat_casa            from categories where name='Casa'            and user_id is null limit 1;
  select id into cat_trasporti       from categories where name='Trasporti'       and user_id is null limit 1;
  select id into cat_salute          from categories where name='Salute'          and user_id is null limit 1;
  select id into cat_ristoranti      from categories where name='Ristoranti'      and user_id is null limit 1;
  select id into cat_intrattenimento from categories where name='Intrattenimento' and user_id is null limit 1;
  select id into cat_bollette        from categories where name='Bollette'        and user_id is null limit 1;
  select id into cat_assicurazioni   from categories where name='Assicurazioni'   and user_id is null limit 1;
  select id into cat_stipendio       from categories where name='Stipendio'       and user_id is null limit 1;
  select id into cat_palestra        from categories where name='Palestra'        and user_id is null limit 1;
  select id into cat_tecnologia      from categories where name='Tecnologia'      and user_id is null limit 1;
  select id into cat_abbigliamento   from categories where name='Abbigliamento'   and user_id is null limit 1;
  select id into cat_hobby           from categories where name='Hobby'           and user_id is null limit 1;
  select id into cat_shopping        from categories where name='Shopping'        and user_id is null limit 1;
  select id into cat_accantonamenti  from categories where name='Accantonamenti'  and user_id is null limit 1;
  select id into cat_salvadanaio     from categories where name='Salvadanaio'     and user_id is null limit 1;
  bigcat := array[cat_abbigliamento, cat_tecnologia, cat_casa, cat_hobby, cat_shopping, cat_casa, cat_tecnologia];

  -- Pulizia (l'auto prima dei movimenti, il conto dopo i salvadanai)
  delete from vehicle_refuels      where user_id = demo_id;
  delete from vehicle_routines     where user_id = demo_id;
  delete from vehicle_pauses       where user_id = demo_id;
  delete from vehicles             where user_id = demo_id;
  delete from savings_transactions where user_id = demo_id;
  delete from goal_contributions   where user_id = demo_id;
  delete from transactions         where user_id = demo_id;
  delete from goals                where user_id = demo_id;
  delete from budget_items         where user_id = demo_id;
  delete from category_budgets     where user_id = demo_id;
  delete from payment_confirmations where user_id = demo_id;
  delete from recurring_expenses   where user_id = demo_id;
  delete from import_logs          where user_id = demo_id;
  delete from savings_pots         where user_id = demo_id;
  delete from accounts             where user_id = demo_id;
  delete from family_members       where user_id = demo_id;

  -- Periodi di paga: quello di oggi parte nel mese bm
  bm := date_trunc('month', current_date)::date;
  ps := bm + 26;
  ps := case extract(isodow from ps)::int when 6 then ps - 1 when 7 then ps + 1 else ps end;
  if current_date < ps then bm := (bm - interval '1 month')::date; end if;

  -- Profilo: il reddito del titolare sta nel componente "Giulia" (is_owner), qui gli stessi valori
  update profiles set
    plan = 'premium',
    full_name = 'Giulia',
    pay_day = 27,
    income_type = 'employee',
    monthly_income = 1650.00,
    income_frequency = 'monthly',
    income_payday = 27
  where id = demo_id;

  -- Componenti
  insert into family_members (user_id, name, color, is_owner, income_type, monthly_income, income_frequency, income_payday)
    values (demo_id, 'Giulia', '#6366f1', true, 'employee', 1650.00, 'monthly', 27)
    returning id into giulia_id;
  insert into family_members (user_id, name, color, income_type, monthly_income, income_variability)
    values (demo_id, 'Luca', '#ec4899', 'freelance', 950.00, 'low')
    returning id into luca_id;

  -- Conto (l'ancora si scrive alla fine, quando ci sono i movimenti)
  insert into accounts (user_id, name, anchor_balance, anchor_date)
    values (demo_id, 'Conto in comune', 0, current_date - 1)
    returning id into acc_id;

  -- Salvadanai, tutti sul conto
  insert into savings_pots (user_id, name, emoji, target_amount, current_balance, color, account_id)
    values (demo_id, 'Vacanza estiva', '🏖️', 2000.00, 0, '#f59e0b', acc_id) returning id into pot_vacanza;
  insert into savings_pots (user_id, name, emoji, target_amount, current_balance, color, account_id)
    values (demo_id, 'Nuovo laptop', '💻', 1200.00, 0, '#3b82f6', acc_id) returning id into pot_laptop;
  insert into savings_pots (user_id, name, emoji, description, current_balance, color, account_id)
    values (demo_id, 'Emergenza', '🛡️', 'Per gli imprevisti', 0, '#10b981', acc_id) returning id into pot_emerg;
  insert into savings_pots (user_id, name, emoji, current_balance, color, account_id)
    values (demo_id, 'Accantonamenti', '🏦', 0, '#a855f7', acc_id) returning id into pot_acc;

  -- Accantonamenti (spese annuali), nel salvadanaio "Accantonamenti"
  insert into recurring_expenses (
    user_id, name, tipologia, frequency, amount, amount_max,
    category_id, notes, match_keywords, matching_strategy,
    due_day, due_month, next_due_date, saving_start_date, savings_pot_id
  ) values
    (demo_id, 'Assicurazione auto', 'fissa', 'annuale', 650.00, null, cat_assicurazioni, 'Polizza dell''auto',
     array['assicurazione','polizza'], 'keyword', 15, null,
     (date_trunc('month', current_date) + interval '6 month' + interval '14 day')::date,
     (date_trunc('month', current_date) - interval '5 month')::date, pot_acc),
    (demo_id, 'Bollo auto', 'fissa', 'annuale', 220.00, null, cat_trasporti, null,
     array['bollo'], 'keyword', 10, null,
     (date_trunc('month', current_date) + interval '3 month' + interval '9 day')::date,
     (date_trunc('month', current_date) - interval '8 month')::date, pot_acc);

  -- Quota al mese e quanto dovrebbe esserci oggi (come projectSinkingFund in lib/calculations.ts)
  select
    round(sum(amount / tot), 2),
    round(sum(amount / tot * least(greatest(el, 0), tot)), 2)
  into acc_quota, acc_target
  from (
    select amount,
      greatest(1, (extract(year from next_due_date) - extract(year from saving_start_date)) * 12
                  + extract(month from next_due_date) - extract(month from saving_start_date) + 1) as tot,
      (extract(year from current_date) - extract(year from saving_start_date)) * 12
        + extract(month from current_date) - extract(month from saving_start_date) + 1 as el
    from recurring_expenses
    where user_id = demo_id and next_due_date is not null
  ) s;

  -- Spese fisse: riconosciute nei movimenti per parola chiave
  insert into recurring_expenses (
    user_id, name, tipologia, frequency, amount, amount_max,
    category_id, notes, match_keywords, matching_strategy, due_day
  ) values
    (demo_id, 'Affitto',          'fissa',     'mensile', 850.00, null,   cat_casa,            null, array['affitto'],  'keyword',  2),
    (demo_id, 'Palestra',         'fissa',     'mensile',  45.00, null,   cat_palestra,        null, array['palestra'], 'keyword',  4),
    (demo_id, 'Netflix',          'fissa',     'mensile',  13.99, null,   cat_intrattenimento, null, array['netflix'],  'keyword', 10),
    (demo_id, 'Spotify',          'fissa',     'mensile',  10.99, null,   cat_intrattenimento, null, array['spotify'],  'keyword', 11),
    (demo_id, 'Internet casa',    'fissa',     'mensile',  27.90, null,   cat_bollette,        null, array['fastweb'],  'keyword', 15),
    (demo_id, 'Luce e gas',       'variabile', 'mensile', 110.00, 135.00, cat_bollette,        null, array['enel'],     'keyword', 21),
    (demo_id, 'Offerta telefono', 'fissa',     'mensile',   9.99, null,   cat_bollette,        null, array['iliad'],    'keyword', 25);

  -- Budget per categoria: solo le spese che cambiano di mese in mese
  insert into category_budgets (user_id, category_id, monthly_budget) values
    (demo_id, cat_alimentari, 420.00),
    (demo_id, cat_trasporti,  140.00),
    (demo_id, cat_ristoranti, 140.00),
    (demo_id, cat_salute,      40.00),
    (demo_id, cat_hobby,       50.00);

  -- Movimenti: sei periodi chiusi più quello in corso, mai dopo oggi.
  -- Telepass non è tra le spese fisse apposta: è l'esempio di spesa fissa "trovata nei movimenti".
  for k in reverse 6..0 loop
    i  := 7 - k;
    ms := (bm - make_interval(months => k))::date;
    ps := ms + 26;
    ps := case extract(isodow from ps)::int when 6 then ps - 1 when 7 then ps + 1 else ps end;
    nx := (ms + interval '1 month')::date;
    if k = 6 then first_ps := ps; end if;
    if k = 0 then cur_ps := ps; end if;
    -- La quota degli accantonamenti si versa il 1° di ogni mese (dal secondo periodo): dopo il versamento
    -- iniziale il salvadanaio ha sempre quanto previsto per il mese in corso
    acc_amt := case when k <= 5 then acc_quota end;

    insert into transactions (user_id, date, amount, description, merchant, category_id, source, member_id, account_id)
    select demo_id, v.dt, v.amt, v.descr, v.merch, v.cat, 'excel', v.mem, acc_id
    from (values
      (ps,       1650.00,      'Stipendio',                       'Azienda Srl',     cat_stipendio,       giulia_id),
      (ps + 1,   -esse1[i],    'Spesa Esselunga',                 'Esselunga',       cat_alimentari,      giulia_id),
      (nx + 1,   -850.00,      'Affitto casa',                    'Affitto',         cat_casa,            giulia_id),
      (nx + 2,   -fuel1[i],    'Carburante Q8',                   'Q8',              cat_trasporti,       luca_id),
      (nx + 3,   -45.00,       'Palestra FitLife',                'FitLife',         cat_palestra,        giulia_id),
      (nx + 4,   -conad1[i],   'Spesa Conad',                     'Conad',           cat_alimentari,      luca_id),
      (nx + 5,   -rest1[i],    rword[i] || ' ' || rest1n[i],      rword[i] || ' ' || rest1n[i], cat_ristoranti, luca_id),
      (nx + 7,   -extra[i],
                 case when i % 2 = 1 then 'Farmacia Comunale' else 'Libreria Feltrinelli' end,
                 case when i % 2 = 1 then 'Farmacia' else 'Feltrinelli' end,
                 case when i % 2 = 1 then cat_salute else cat_hobby end,                        giulia_id),
      (nx + 9,   fattura[i],   'Fattura cliente',                 'Studio Bianchi',  cat_stipendio,       luca_id),
      (nx + 9,   -13.99,       'Netflix',                         'Netflix',         cat_intrattenimento, giulia_id),
      (nx + 10,  -10.99,       'Spotify Premium',                 'Spotify',         cat_intrattenimento, luca_id),
      (nx + 11,  -esse2[i],    'Spesa Esselunga',                 'Esselunga',       cat_alimentari,      giulia_id),
      (nx + 11,  -cena[i],     rword[i] || ' ' || cenan[i],       rword[i] || ' ' || cenan[i],  cat_ristoranti, giulia_id),
      (nx + 13,  -big[i],      bign[i],                           bign[i],           bigcat[i],           luca_id),
      (nx + 14,  -27.90,       'Addebito diretto Fastweb',        'Fastweb',         cat_bollette,        giulia_id),
      (nx,       -acc_amt,     'Versamento accantonamenti',       null,              cat_accantonamenti,  giulia_id),
      (nx + 15,  -150.00,      'Giroconto salvadanaio Vacanza estiva', null,         cat_salvadanaio,     giulia_id),
      (nx + 15,  -100.00,      'Giroconto salvadanaio Nuovo laptop',   null,         cat_salvadanaio,     luca_id),
      (nx + 17,  -30.00,       'Addebito diretto Telepass',       'Telepass',        cat_trasporti,       luca_id),
      (nx + 18,  -fuel2[i],    'Carburante Eni',                  'Eni',             cat_trasporti,       giulia_id),
      (nx + 19,  -ferr[i],     'Ferramenta Rossi',                'Ferramenta Rossi', cat_casa,           luca_id),
      (nx + 20,  -enel[i],     'Enel Energia bolletta',           'Enel Energia',    cat_bollette,        giulia_id),
      (nx + 22,  -conad2[i],   'Spesa Conad',                     'Conad',           cat_alimentari,      luca_id),
      (nx + 23,  -rest2[i],    rword[i] || ' ' || rest2n[i],      rword[i] || ' ' || rest2n[i], cat_ristoranti, giulia_id),
      (nx + 24,  -9.99,        'Iliad offerta mobile',            'Iliad',           cat_bollette,        luca_id)
    ) as v(dt, amt, descr, merch, cat, mem)
    where v.dt <= current_date and v.amt is not null;

    -- Gli stessi giroconti, visti dai salvadanai
    insert into savings_transactions (pot_id, user_id, amount, type, note, date)
    select v.pot, demo_id, v.amt, 'deposit', v.note, v.dt
    from (values
      (pot_acc,     acc_amt, 'Quota del mese',     nx),
      (pot_vacanza, 150.00,  'Versamento mensile', nx + 15),
      (pot_laptop,  100.00,  'Versamento mensile', nx + 15)
    ) as v(pot, amt, note, dt)
    where v.dt <= current_date and v.amt is not null;
  end loop;

  -- Quanto c'era nei salvadanai prima dei movimenti della demo
  insert into savings_transactions (pot_id, user_id, amount, type, note, date) values
    (pot_vacanza, demo_id,  300.00, 'deposit', 'Già da parte',       first_ps - 5),
    (pot_laptop,  demo_id,  200.00, 'deposit', 'Già da parte',       first_ps - 5),
    (pot_emerg,   demo_id, 1500.00, 'deposit', 'Fondo di sicurezza', first_ps - 5);
  acc_target := acc_target - coalesce((select sum(amount) from savings_transactions where pot_id = pot_acc), 0);
  if acc_target > 0 then
    insert into savings_transactions (pot_id, user_id, amount, type, note, date)
      values (pot_acc, demo_id, acc_target, 'deposit', 'Accantonamenti dei mesi scorsi', first_ps - 5);
  end if;

  -- Obiettivi: ognuno col suo salvadanaio, e vale il suo saldo
  insert into goals (user_id, name, target_amount, current_amount, deadline, icon, savings_pot_id, monthly_contribution)
  select demo_id, 'Vacanza estiva', 2000.00, p.current_balance,
         make_date(extract(year from current_date)::int + case when extract(month from current_date) >= 5 then 1 else 0 end, 7, 1),
         '🏖️', p.id, 150.00
  from savings_pots p where p.id = pot_vacanza;
  insert into goals (user_id, name, target_amount, current_amount, deadline, icon, savings_pot_id, monthly_contribution)
  select demo_id, 'Nuovo laptop', 1200.00, p.current_balance,
         (bm + interval '5 month')::date, '💻', p.id, 100.00
  from savings_pots p where p.id = pot_laptop;

  -- Saldo: il conto quadrato ieri, e il saldo a inizio periodo uguale (stessi movimenti)
  update accounts set
    anchor_balance = opening + coalesce((select sum(amount) from transactions
                                         where user_id = demo_id and date <= current_date - 1), 0),
    anchor_date = current_date - 1,
    checked_at = current_date - 1
  where id = acc_id;
  update profiles set
    period_starting_balance = opening + coalesce((select sum(amount) from transactions
                                                  where user_id = demo_id and date < cur_ps), 0),
    period_starting_balance_date = cur_ps
  where id = demo_id;

  -- Auto: i rifornimenti dai movimenti degli ultimi 120 giorni, tranne l'ultimo ("Usa" lo propone)
  insert into vehicles (user_id, name, fuel_type) values (demo_id, 'Utilitaria', 'benzina')
    returning id into veh_id;
  for r in
    select t.id, t.date, -t.amount as amt
    from transactions t
    where t.user_id = demo_id and t.description like 'Carburante %' and t.date >= current_date - 120
    order by t.date desc
    offset 1
  loop
    pr := 1.82 + ((extract(day from r.date)::int + extract(month from r.date)::int) % 8) / 100.0;
    q  := round(r.amt / pr, 2);
    insert into vehicle_refuels (user_id, vehicle_id, date, amount, quantity, price, trip_km, full_tank, transaction_id)
      values (demo_id, veh_id, r.date, r.amt, q, pr,
              round(q * (15.5 + (extract(day from r.date)::int % 5) * 0.5)), true, r.id);
  end loop;
  insert into vehicle_routines (user_id, vehicle_id, name, km, round_trip, kind, weekdays)
    values (demo_id, veh_id, 'Casa - lavoro', 12, true, 'days', '{1,2,3,4,5}');
end;
$function$;

-- Dal 051 fa tutto reseed_demo(): resta vuota perché /api/demo/reset la chiama ancora.
create or replace function public.reseed_demo_salvadanai()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  return;
end;
$$;

revoke all on function public.reseed_demo_salvadanai() from public, anon, authenticated;

select public.reseed_demo();
