-- ============================================================
-- Migration: 027_goals_wizard
-- Block 3 / Feature 2 — obiettivi: salvadanaio collegato, quota mensile,
-- storico contributi.
-- ============================================================

alter table public.goals
  add column if not exists savings_pot_id uuid references public.savings_pots(id) on delete set null,
  add column if not exists monthly_contribution numeric(12,2);

create table if not exists public.goal_contributions (
  id         uuid primary key default gen_random_uuid(),
  goal_id    uuid not null references public.goals(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  amount     numeric(12,2) not null check (amount <> 0),
  note       text,
  date       date not null default current_date,
  created_at timestamptz not null default now()
);

create index if not exists goal_contributions_goal_idx on public.goal_contributions(goal_id, date desc);

alter table public.goal_contributions enable row level security;

create policy "Users manage own goal contributions"
  on public.goal_contributions for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Il contributo aggiorna il progresso dell'obiettivo
create or replace function public.apply_goal_contribution()
returns trigger
language plpgsql
as $$
begin
  update public.goals
    set current_amount = greatest(0, current_amount + new.amount),
        updated_at = now()
    where id = new.goal_id;
  return new;
end;
$$;

drop trigger if exists apply_goal_contribution on public.goal_contributions;
create trigger apply_goal_contribution
  after insert on public.goal_contributions
  for each row execute function public.apply_goal_contribution();

-- Demo: blocca scritture sessione demo
drop trigger if exists block_demo_writes on public.goal_contributions;
create trigger block_demo_writes
  before insert or update or delete on public.goal_contributions
  for each row execute function public.block_demo_writes();
