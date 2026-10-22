-- Migration 047: auto e carburante (Pianifica → "Auto e carburante", lib/fuel.ts).
-- vehicles          i veicoli dell'utente
-- vehicle_refuels   rifornimenti: euro, quantità (litri, kg per il metano, kWh per l'elettrico), prezzo,
--                   km (percorsi dal rifornimento precedente oppure contachilometri), pieno sì/no,
--                   movimento della banca da cui viene (transaction_id, così non si propone due volte)
-- vehicle_routines  tragitti abituali: giorni fissi (lavoro lun-ven) o N volte a settimana
-- vehicle_pauses    ferie, malattia, smart working: in quei giorni i tragitti abituali non contano
-- Rollback: supabase/rollback/047_carburante_down.sql (dopo aver riportato indietro il codice).

create table if not exists public.vehicles (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 60),
  fuel_type  text not null check (fuel_type in ('benzina', 'diesel', 'gpl', 'metano', 'elettrico')),
  plate      text check (plate is null or char_length(plate) <= 12),
  archived   boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.vehicle_refuels (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  vehicle_id     uuid not null references public.vehicles(id) on delete cascade,
  date           date not null,
  amount         numeric not null check (amount > 0),
  quantity       numeric not null check (quantity > 0),
  price          numeric not null check (price > 0),
  odometer_km    numeric check (odometer_km is null or odometer_km >= 0),
  trip_km        numeric check (trip_km is null or trip_km > 0),
  full_tank      boolean not null default true,
  transaction_id uuid references public.transactions(id) on delete set null,
  note           text check (note is null or char_length(note) <= 200),
  created_at     timestamptz not null default now()
);
create index if not exists vehicle_refuels_vehicle_date on public.vehicle_refuels (vehicle_id, date);

create table if not exists public.vehicle_routines (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  vehicle_id     uuid not null references public.vehicles(id) on delete cascade,
  name           text not null check (char_length(name) between 1 and 60),
  km             numeric not null check (km > 0 and km <= 2000),
  round_trip     boolean not null default true,
  kind           text not null check (kind in ('days', 'weekly')),
  weekdays       int[] not null default '{}' check (weekdays <@ array[1, 2, 3, 4, 5, 6, 7]), -- 1 = lunedì
  times_per_week numeric check (times_per_week is null or (times_per_week > 0 and times_per_week <= 14)),
  start_date     date,
  end_date       date,
  created_at     timestamptz not null default now()
);

create table if not exists public.vehicle_pauses (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  from_date  date not null,
  to_date    date not null check (to_date >= from_date),
  note       text check (note is null or char_length(note) <= 100),
  created_at timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array['vehicles', 'vehicle_refuels', 'vehicle_routines', 'vehicle_pauses'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "Users can manage own %s" on public.%I', t, t);
    execute format('create policy "Users can manage own %s" on public.%I for all using (user_id = auth.uid()) with check (user_id = auth.uid())', t, t);
    -- La sessione demo non scrive, come nelle altre tabelle dati (migration 025).
    execute format('drop trigger if exists block_demo_writes on public.%I', t);
    execute format('create trigger block_demo_writes before insert or update or delete on public.%I for each row execute function public.block_demo_writes()', t);
  end loop;
end $$;
