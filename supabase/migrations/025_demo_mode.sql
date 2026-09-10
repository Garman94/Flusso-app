-- ============================================================
-- Migration: 025_demo_mode
-- Feature 5: modalita' demo con account condiviso demo@flussoapp.it
--
--  - public.reseed_demo(): ricarica da zero i dati demo (idempotente).
--    SECURITY DEFINER: gira come owner, quindi auth.jwt() e' NULL e il
--    trigger blocca-scritture qui sotto NON scatta.
--  - trigger block_demo_writes: qualsiasi sessione browser loggata come
--    utente demo (auth.jwt()->>'email' = demo) non puo' scrivere.
--    service-role e reseed_demo() bypassano (auth.jwt() NULL).
-- ============================================================

create or replace function public.demo_user_id()
returns uuid
language sql stable
as $$
  select id from auth.users where email = 'demo@flussoapp.it' limit 1;
$$;

-- ── Blocco scritture per la sessione demo ────────────────────────────────
create or replace function public.block_demo_writes()
returns trigger
language plpgsql
as $$
begin
  if coalesce(auth.jwt() ->> 'email', '') = 'demo@flussoapp.it' then
    raise exception 'DEMO_READONLY: registrati per salvare i tuoi dati';
  end if;
  return coalesce(new, old);
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'transactions','goals','recurring_expenses','family_members',
    'budget_items','categories','category_rules','display_rules',
    'payment_confirmations','import_logs','feedback_messages'
  ] loop
    execute format('drop trigger if exists block_demo_writes on public.%I', t);
    execute format(
      'create trigger block_demo_writes before insert or update or delete on public.%I
         for each row execute function public.block_demo_writes()', t);
  end loop;
end $$;

-- profiles: consenti solo update (non insert/delete) e comunque non alla sessione demo
drop trigger if exists block_demo_writes on public.profiles;
create trigger block_demo_writes
  before update or delete on public.profiles
  for each row execute function public.block_demo_writes();

-- ── Ricarica dati demo ──────────────────────────────────────────────────
create or replace function public.reseed_demo()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  demo_id             uuid := public.demo_user_id();
  samira_id           uuid;
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
  cat_accantonamenti  uuid;
  cat_altro           uuid;
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
  select id into cat_accantonamenti  from categories where name='Accantonamenti'  and user_id is null limit 1;
  select id into cat_altro           from categories where name='Altro'           and user_id is null limit 1;

  -- Profilo
  update profiles set
    plan = 'premium',
    full_name = 'Marco Demo',
    pay_day = 27,
    piggy_balance = 1650.00,
    period_starting_balance = 1750.00,
    period_starting_balance_date = date_trunc('month', current_date)::date,
    income_type = 'employee',
    monthly_income = 2100.00,
    income_frequency = 'monthly',
    income_payday = 27
  where id = demo_id;

  -- Pulizia
  delete from transactions      where user_id = demo_id;
  delete from goals             where user_id = demo_id;
  delete from budget_items      where user_id = demo_id;
  delete from recurring_expenses where user_id = demo_id;
  delete from payment_confirmations where user_id = demo_id;
  delete from import_logs       where user_id = demo_id;
  delete from family_members    where user_id = demo_id;

  -- Componente famiglia
  insert into family_members (user_id, name, color, income_type, monthly_income, income_frequency, income_payday)
  values (demo_id, 'Samira Demo', '#ec4899', 'freelance', 1400.00, 'monthly', null)
  returning id into samira_id;

  -- Transazioni: ultimi ~3 mesi, ancorati a oggi
  insert into transactions (user_id, date, amount, description, merchant, category_id, source, member_id) values
    (demo_id, (date_trunc('month', current_date) - interval '2 month' + interval '26 day')::date,  2100.00, 'Stipendio',            'Azienda SpA',       cat_stipendio,       'manual', null),
    (demo_id, (date_trunc('month', current_date) - interval '2 month' + interval '1 day')::date,   -800.00, 'Affitto',              'Agenzia Immob.',    cat_casa,            'manual', null),
    (demo_id, (date_trunc('month', current_date) - interval '2 month' + interval '4 day')::date,    -92.30, 'Spesa Esselunga',      'Esselunga',         cat_alimentari,      'manual', null),
    (demo_id, (date_trunc('month', current_date) - interval '2 month' + interval '9 day')::date,    -64.00, 'Carburante Q8',        'Q8',                cat_trasporti,       'manual', null),
    (demo_id, (date_trunc('month', current_date) - interval '2 month' + interval '11 day')::date,   -13.99, 'Netflix',              'Netflix',           cat_intrattenimento, 'manual', null),
    (demo_id, (date_trunc('month', current_date) - interval '2 month' + interval '12 day')::date,   -10.99, 'Spotify Premium',      'Spotify',           cat_intrattenimento, 'manual', null),
    (demo_id, (date_trunc('month', current_date) - interval '2 month' + interval '15 day')::date,   -47.00, 'Cena Osteria',         'Osteria del Porto', cat_ristoranti,      'manual', samira_id),
    (demo_id, (date_trunc('month', current_date) - interval '2 month' + interval '18 day')::date,   -30.00, 'Telepass',             'Telepass',          cat_trasporti,       'manual', null),
    (demo_id, (date_trunc('month', current_date) - interval '2 month' + interval '19 day')::date,   -28.00, 'Farmacia',             'Farmacia Comunale', cat_salute,          'manual', null),
    (demo_id, (date_trunc('month', current_date) - interval '2 month' + interval '22 day')::date,  -110.00, 'Bolletta Enel',        'Enel Energia',      cat_bollette,        'manual', null),
    (demo_id, (date_trunc('month', current_date) - interval '2 month' + interval '24 day')::date,   -35.00, 'Modellismo shop',      'Hobby Model',       cat_hobby,           'manual', null),
    (demo_id, (date_trunc('month', current_date) - interval '2 month' + interval '27 day')::date,  -200.00, 'Giroconto risparmio',  'Conto Deposito',    cat_accantonamenti,  'manual', null),

    (demo_id, (date_trunc('month', current_date) - interval '1 month' + interval '26 day')::date,  2100.00, 'Stipendio',            'Azienda SpA',       cat_stipendio,       'manual', null),
    (demo_id, (date_trunc('month', current_date) - interval '1 month' + interval '1 day')::date,   -800.00, 'Affitto',              'Agenzia Immob.',    cat_casa,            'manual', null),
    (demo_id, (date_trunc('month', current_date) - interval '1 month' + interval '3 day')::date,    -88.00, 'Spesa Esselunga',      'Esselunga',         cat_alimentari,      'manual', null),
    (demo_id, (date_trunc('month', current_date) - interval '1 month' + interval '7 day')::date,    -58.00, 'Carburante Eni',       'Eni',               cat_trasporti,       'manual', null),
    (demo_id, (date_trunc('month', current_date) - interval '1 month' + interval '10 day')::date,   -13.99, 'Netflix',              'Netflix',           cat_intrattenimento, 'manual', null),
    (demo_id, (date_trunc('month', current_date) - interval '1 month' + interval '11 day')::date,   -10.99, 'Spotify Premium',      'Spotify',           cat_intrattenimento, 'manual', null),
    (demo_id, (date_trunc('month', current_date) - interval '1 month' + interval '14 day')::date,   -52.00, 'Spesa Conad',          'Conad',             cat_alimentari,      'manual', samira_id),
    (demo_id, (date_trunc('month', current_date) - interval '1 month' + interval '16 day')::date,   -41.00, 'Pizzeria Da Luca',     'Pizzeria Da Luca',  cat_ristoranti,      'manual', null),
    (demo_id, (date_trunc('month', current_date) - interval '1 month' + interval '18 day')::date,   -30.00, 'Telepass',             'Telepass',          cat_trasporti,       'manual', null),
    (demo_id, (date_trunc('month', current_date) - interval '1 month' + interval '20 day')::date,  -135.00, 'Bolletta Enel',        'Enel Energia',      cat_bollette,        'manual', null),
    (demo_id, (date_trunc('month', current_date) - interval '1 month' + interval '25 day')::date,  -200.00, 'Giroconto risparmio',  'Conto Deposito',    cat_accantonamenti,  'manual', null),
    (demo_id, (date_trunc('month', current_date) - interval '1 month' + interval '28 day')::date,   -74.00, 'Spesa Esselunga',      'Esselunga',         cat_alimentari,      'manual', null),

    (demo_id, (date_trunc('month', current_date) + interval '1 day')::date,   -800.00, 'Affitto',          'Agenzia Immob.',    cat_casa,            'manual', null),
    (demo_id, (date_trunc('month', current_date) + interval '4 day')::date,    -79.00, 'Spesa Esselunga',  'Esselunga',         cat_alimentari,      'manual', null),
    (demo_id, (date_trunc('month', current_date) + interval '6 day')::date,    -61.00, 'Carburante Q8',    'Q8',                cat_trasporti,       'manual', null),
    (demo_id, (date_trunc('month', current_date) + interval '9 day')::date,    -13.99, 'Netflix',          'Netflix',           cat_intrattenimento, 'manual', null),
    (demo_id, (date_trunc('month', current_date) + interval '10 day')::date,   -10.99, 'Spotify Premium',  'Spotify',           cat_intrattenimento, 'manual', null),
    (demo_id, (date_trunc('month', current_date) + interval '12 day')::date,   -46.00, 'Cena Sushi House', 'Sushi House',       cat_ristoranti,      'manual', samira_id);

  -- Obiettivi
  insert into goals (user_id, name, target_amount, current_amount, deadline, icon) values
    (demo_id, 'Vacanza estiva',  2000.00,  450.00, (current_date + interval '4 month')::date, '🏖️'),
    (demo_id, 'Fondo emergenza', 3000.00, 1200.00, null,                                      '🛡️'),
    (demo_id, 'Nuovo laptop',     800.00,  480.00, (current_date + interval '3 month')::date, '💻');

  -- Budget items
  insert into budget_items (user_id, name, amount, frequency, category_id) values
    (demo_id, 'Affitto',           800.00, 'mensile',    cat_casa),
    (demo_id, 'Alimentari',        320.00, 'mensile',    cat_alimentari),
    (demo_id, 'Trasporti',         180.00, 'mensile',    cat_trasporti),
    (demo_id, 'Bollette',          120.00, 'mensile',    cat_bollette),
    (demo_id, 'Ristoranti / cene', 150.00, 'mensile',    cat_ristoranti),
    (demo_id, 'Hobby',              40.00, 'mensile',    cat_hobby),
    (demo_id, 'Accantonamenti',    200.00, 'mensile',    cat_accantonamenti);

  -- Ricorrenti
  insert into recurring_expenses (
    user_id, name, tipologia, frequency, amount, amount_max,
    category_id, notes, match_keywords, matching_strategy,
    due_day, due_month, next_due_date, saving_start_date
  ) values
    (demo_id, 'Affitto', 'fissa', 'mensile', 700.00, null, cat_casa, 'Affitto appartamento',
     array['affitto','agenzia immob'], 'keyword', 1, null, null, null),
    (demo_id, 'Bollette', 'variabile', 'mensile', 80.00, 150.00, cat_bollette, 'Luce e gas',
     array['enel','bolletta'], 'historical_avg', 20, null, null, null),
    (demo_id, 'Netflix', 'fissa', 'mensile', 13.99, null, cat_intrattenimento, null,
     array['netflix'], 'keyword', 10, null, null, null),
    (demo_id, 'Assicurazione Auto', 'fissa', 'annuale', 650.00, null, cat_assicurazioni, 'Polizza veicolo',
     array['assicurazione','polizza'], 'keyword', 15, 3, null, null),
    (demo_id, 'Stipendio', 'entrata', 'mensile', 2100.00, null, cat_stipendio, 'Stipendio netto',
     array['stipendio','azienda spa'], 'keyword', 27, null, null, null),
    (demo_id, 'Vacanza 2026', 'fissa', 'annuale', 1200.00, null, cat_accantonamenti, 'Accantonamento vacanza',
     array['vacanza'], 'keyword', 1, 7, (date_trunc('month', current_date) + interval '5 month')::date,
     (date_trunc('month', current_date) - interval '1 month')::date);
end;
$$;

revoke all on function public.reseed_demo() from public, anon, authenticated;
