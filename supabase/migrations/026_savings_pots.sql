-- ============================================================
-- Migration: 026_savings_pots
-- Block 3 / Feature 1 — salvadanai multipli.
--
--  - savings_pots: sostituisce il singolo profiles.piggy_balance.
--  - savings_pot_members: ripartizione per componente (family_members, non utenti).
--  - savings_transactions: storico deposito/prelievo.
--  - trigger sync_piggy_balance: mantiene profiles.piggy_balance = SUM(pot.current_balance)
--    così tutto il codice Accantonamenti esistente continua a funzionare.
-- ============================================================

create table if not exists public.savings_pots (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  name            text not null,
  emoji           text not null default '🐷',
  description     text,
  target_amount   numeric(12,2),
  current_balance numeric(12,2) not null default 0,
  is_shared       boolean not null default false,
  color           text not null default '#6366f1',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists savings_pots_user_idx on public.savings_pots(user_id);

alter table public.savings_pots enable row level security;

create policy "Users manage own pots"
  on public.savings_pots for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop trigger if exists set_savings_pots_updated_at on public.savings_pots;
create trigger set_savings_pots_updated_at
  before update on public.savings_pots
  for each row execute function public.set_updated_at();

-- ── savings_pot_members ────────────────────────────────────────────────────
create table if not exists public.savings_pot_members (
  id                 uuid primary key default gen_random_uuid(),
  pot_id             uuid not null references public.savings_pots(id) on delete cascade,
  member_id          uuid references public.family_members(id) on delete cascade,  -- NULL = titolare
  contributed_amount numeric(12,2) not null default 0,
  joined_at          timestamptz not null default now(),
  unique (pot_id, member_id)
);

create index if not exists savings_pot_members_pot_idx on public.savings_pot_members(pot_id);

alter table public.savings_pot_members enable row level security;

create policy "Users manage own pot members"
  on public.savings_pot_members for all
  using (exists (select 1 from public.savings_pots p where p.id = pot_id and p.user_id = auth.uid()))
  with check (exists (select 1 from public.savings_pots p where p.id = pot_id and p.user_id = auth.uid()));

-- ── savings_transactions ──────────────────────────────────────────────────
create table if not exists public.savings_transactions (
  id         uuid primary key default gen_random_uuid(),
  pot_id     uuid not null references public.savings_pots(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  member_id  uuid references public.family_members(id) on delete set null,
  amount     numeric(12,2) not null check (amount > 0),
  type       text not null check (type in ('deposit','withdraw')),
  note       text,
  date       date not null default current_date,
  created_at timestamptz not null default now()
);

create index if not exists savings_transactions_pot_idx on public.savings_transactions(pot_id, date desc);

alter table public.savings_transactions enable row level security;

create policy "Users manage own savings transactions"
  on public.savings_transactions for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ── Trigger: applica il movimento al saldo del pot e alla ripartizione ─────
create or replace function public.apply_savings_transaction()
returns trigger
language plpgsql
as $$
declare
  signed numeric(12,2) := case when new.type = 'withdraw' then -new.amount else new.amount end;
begin
  update public.savings_pots
    set current_balance = current_balance + signed
    where id = new.pot_id;

  insert into public.savings_pot_members (pot_id, member_id, contributed_amount)
    values (new.pot_id, new.member_id, signed)
  on conflict (pot_id, member_id)
    do update set contributed_amount = public.savings_pot_members.contributed_amount + signed;

  return new;
end;
$$;

drop trigger if exists apply_savings_transaction on public.savings_transactions;
create trigger apply_savings_transaction
  after insert on public.savings_transactions
  for each row execute function public.apply_savings_transaction();

-- ── Trigger: profiles.piggy_balance = somma dei pot dell'utente ────────────
create or replace function public.sync_piggy_balance()
returns trigger
language plpgsql
as $$
declare
  uid uuid := coalesce(new.user_id, old.user_id);
begin
  update public.profiles
    set piggy_balance = coalesce(
      (select sum(current_balance) from public.savings_pots where user_id = uid), 0)
    where id = uid;
  return coalesce(new, old);
end;
$$;

drop trigger if exists sync_piggy_balance on public.savings_pots;
create trigger sync_piggy_balance
  after insert or update of current_balance or delete on public.savings_pots
  for each row execute function public.sync_piggy_balance();

-- ── Migrazione dati: un pot "Salvadanaio" dal piggy_balance esistente ──────
insert into public.savings_pots (user_id, name, emoji, current_balance)
select id, 'Salvadanaio', '🐷', coalesce(piggy_balance, 0)
from public.profiles
where coalesce(piggy_balance, 0) <> 0
  and not exists (select 1 from public.savings_pots sp where sp.user_id = profiles.id);

-- ── Demo: includi le nuove tabelle nel blocco scritture ───────────────────
do $$
declare
  t text;
begin
  foreach t in array array[
    'savings_pots','savings_pot_members','savings_transactions'
  ] loop
    execute format('drop trigger if exists block_demo_writes on public.%I', t);
    execute format(
      'create trigger block_demo_writes before insert or update or delete on public.%I
         for each row execute function public.block_demo_writes()', t);
  end loop;
end $$;
