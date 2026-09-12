-- Migration 030: family_members.is_owner
-- Permette di marcare UN componente come "sei tu" (il titolare dell'account).
-- Una volta marcato, il reddito del titolare si gestisce solo tramite quel
-- componente: l'aggregazione redditi (lib/calculations.ts aggregateExpectedIncome)
-- ignora profiles.monthly_income quando esiste un componente is_owner, per
-- evitare di sommarlo due volte.

alter table public.family_members
  add column if not exists is_owner boolean not null default false;

-- Al massimo un componente "proprietario" per utente.
create unique index if not exists family_members_one_owner_per_user
  on public.family_members (user_id)
  where is_owner;
