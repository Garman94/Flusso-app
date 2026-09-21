-- Migration 035: eventi d'uso (first-party, senza servizi esterni)
-- Servono a capire dove gli utenti si fermano (iscrizione → primo import → ritorno).
-- Regola: niente importi né descrizioni dei movimenti dentro `props`.

create table if not exists public.events (
  id         bigint generated always as identity primary key,
  user_id    uuid        not null references auth.users(id) on delete cascade,
  name       text        not null check (char_length(name) between 1 and 60),
  props      jsonb       not null default '{}'::jsonb check (pg_column_size(props) < 2000),
  created_at timestamptz not null default now()
);

create index if not exists events_user_created_idx on public.events (user_id, created_at desc);
create index if not exists events_name_created_idx on public.events (name, created_at desc);

alter table public.events enable row level security;

-- L'utente può solo aggiungere i propri eventi. Nessuna lettura/modifica/cancellazione
-- dal client: le analisi si fanno lato server (service role) o da SQL editor.
drop policy if exists events_insert_own on public.events;
create policy events_insert_own on public.events
  for insert to authenticated
  with check (user_id = auth.uid());
