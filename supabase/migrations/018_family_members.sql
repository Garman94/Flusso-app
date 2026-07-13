-- Migration 018: family_members
-- Tabella per i componenti del nucleo familiare / gruppo.
-- Ogni membro ha un nome e un colore scelto dall'utente.
-- Le transazioni possono essere associate a un membro tramite member_id.

create table if not exists public.family_members (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text not null,
  color      text not null default '#6366f1',
  created_at timestamptz not null default now()
);

alter table public.family_members enable row level security;

create policy "Users can manage own family members"
  on public.family_members
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Aggiungi member_id a transactions (nullable, set null se membro eliminato)
alter table public.transactions
  add column if not exists member_id uuid references public.family_members(id) on delete set null;
