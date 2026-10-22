-- Migration 048: conti (pagina /dashboard/conti, lib/accounts.ts).
-- accounts                il conto in banca (o carta, contanti…), con il saldo letto in banca in un certo giorno
--                         (anchor_balance a fine giornata di anchor_date, movimenti di quel giorno compresi):
--                         il saldo di oggi è l'ancora più i movimenti del conto dopo quel giorno.
--                         checked_at = ultimo "Quadra" con la banca andato a buon fine.
--                         bank_ref = numero del conto come lo scrive la banca nel file (es. Intesa "1000/00013046"):
--                         l'import riconosce di quale conto è il file e avvisa se lo si carica sul conto sbagliato.
-- transactions.account_id il conto del movimento. Senza conti resta tutto come prima (un saldo solo, profiles).
-- savings_pots.account_id dove stanno davvero i soldi del salvadanaio (es. il salvadanaio dentro il conto).
-- default_transaction_account: un movimento nuovo senza conto (screenshot, a mano) va sul conto della sua
--                         persona, altrimenti su quello del titolare o sul primo creato; un conto di un altro
--                         utente non si può usare.
-- Rollback: supabase/rollback/048_conti_down.sql (dopo aver riportato indietro il codice).

create table if not exists public.accounts (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  name           text not null check (char_length(name) between 1 and 40),
  member_id      uuid references public.family_members(id) on delete set null,
  anchor_balance numeric not null default 0,
  anchor_date    date not null default current_date,
  checked_at     date,
  bank_ref       text check (bank_ref is null or char_length(bank_ref) <= 40),
  archived       boolean not null default false,
  created_at     timestamptz not null default now()
);

alter table public.accounts enable row level security;
drop policy if exists "Users can manage own accounts" on public.accounts;
create policy "Users can manage own accounts"
  on public.accounts for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- La sessione demo non scrive, come nelle altre tabelle dati (migration 025).
drop trigger if exists block_demo_writes on public.accounts;
create trigger block_demo_writes before insert or update or delete on public.accounts
  for each row execute function public.block_demo_writes();

alter table public.transactions add column if not exists account_id uuid references public.accounts(id) on delete set null;
create index if not exists transactions_account_date on public.transactions (account_id, date);
alter table public.savings_pots add column if not exists account_id uuid references public.accounts(id) on delete set null;

create or replace function public.default_transaction_account()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.account_id is not null
     and not exists (select 1 from public.accounts a where a.id = new.account_id and a.user_id = new.user_id) then
    new.account_id := null;
  end if;
  if tg_op = 'INSERT' and new.account_id is null then
    select a.id into new.account_id
      from public.accounts a
      left join public.family_members f on f.id = a.member_id
     where a.user_id = new.user_id and not a.archived
     order by (new.member_id is not null and a.member_id = new.member_id) desc,
              coalesce(f.is_owner, false) desc,
              a.created_at
     limit 1;
  end if;
  return new;
end;
$$;

drop trigger if exists default_transaction_account on public.transactions;
create trigger default_transaction_account before insert or update of account_id on public.transactions
  for each row execute function public.default_transaction_account();
