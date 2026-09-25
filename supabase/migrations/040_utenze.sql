-- Migration 040: luce e gas (Pianifica → Spese fisse → "Calcola luce e gas", lib/utilities.ts).
-- utility_tariffs: la tariffa del fornitore, una per tipo (luce, gas) per utente.
-- utility_readings: consumi mensili (kWh, Smc), anche degli anni passati, per prevedere il mese.
-- reseed_demo_utenze(): dati d'esempio per la demo, ancorati a oggi (chiamata da /api/demo/reset
-- insieme a reseed_demo).
-- Rollback: supabase/rollback/040_utenze_down.sql (dopo aver riportato indietro il codice).

create table if not exists public.utility_tariffs (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  kind             text not null check (kind in ('luce', 'gas')),
  supplier         text,
  unit_price       numeric not null default 0 check (unit_price >= 0),
  other_unit_costs numeric not null default 0 check (other_unit_costs >= 0),
  fixed_monthly    numeric not null default 0 check (fixed_monthly >= 0),
  vat_pct          numeric not null default 10 check (vat_pct between 0 and 30),
  tv_fee_monthly   numeric not null default 0 check (tv_fee_monthly >= 0),
  updated_at       timestamptz not null default now(),
  unique (user_id, kind)
);

alter table public.utility_tariffs enable row level security;

drop policy if exists "Users can manage own utility tariffs" on public.utility_tariffs;
create policy "Users can manage own utility tariffs"
  on public.utility_tariffs
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create table if not exists public.utility_readings (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  kind        text not null check (kind in ('luce', 'gas')),
  year        int not null check (year between 2000 and 2100),
  month       int not null check (month between 1 and 12),
  consumption numeric not null check (consumption >= 0),
  updated_at  timestamptz not null default now(),
  unique (user_id, kind, year, month)
);

alter table public.utility_readings enable row level security;

drop policy if exists "Users can manage own utility readings" on public.utility_readings;
create policy "Users can manage own utility readings"
  on public.utility_readings
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- La sessione demo non scrive, come nelle altre tabelle dati (migration 025).
drop trigger if exists block_demo_writes on public.utility_tariffs;
create trigger block_demo_writes before insert or update or delete on public.utility_tariffs
  for each row execute function public.block_demo_writes();
drop trigger if exists block_demo_writes on public.utility_readings;
create trigger block_demo_writes before insert or update or delete on public.utility_readings
  for each row execute function public.block_demo_writes();

-- Demo: tariffe di luce e gas, due anni pieni di consumi e quest'anno fino al mese scorso
-- con il 5% in meno (così la stima mostra anche la correzione per la tendenza).
create or replace function public.reseed_demo_utenze()
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  demo_id uuid := public.demo_user_id();
  y       int := extract(year from current_date)::int;
  m       int := extract(month from current_date)::int;
  luce    int[] := array[260, 230, 210, 180, 170, 210, 260, 240, 190, 200, 230, 270];
  gas     int[] := array[180, 160, 120, 70, 35, 15, 12, 12, 20, 60, 120, 170];
  i       int;
begin
  if demo_id is null then
    return;
  end if;

  delete from utility_readings where user_id = demo_id;
  delete from utility_tariffs  where user_id = demo_id;

  insert into utility_tariffs (user_id, kind, supplier, unit_price, other_unit_costs, fixed_monthly, vat_pct, tv_fee_monthly) values
    (demo_id, 'luce', 'Enel Energia', 0.13, 0.065, 12.00, 10, 9.00),
    (demo_id, 'gas',  'Enel Energia', 0.45, 0.300, 10.00, 10, 0);

  for i in 1..12 loop
    insert into utility_readings (user_id, kind, year, month, consumption) values
      (demo_id, 'luce', y - 2, i, luce[i] + 10),
      (demo_id, 'luce', y - 1, i, luce[i]),
      (demo_id, 'gas',  y - 2, i, gas[i] + 5),
      (demo_id, 'gas',  y - 1, i, gas[i]);
    if i < m then
      insert into utility_readings (user_id, kind, year, month, consumption) values
        (demo_id, 'luce', y, i, round(luce[i] * 0.95)),
        (demo_id, 'gas',  y, i, round(gas[i] * 0.95));
    end if;
  end loop;
end;
$function$;

revoke all on function public.reseed_demo_utenze() from public, anon, authenticated;

select public.reseed_demo_utenze();
