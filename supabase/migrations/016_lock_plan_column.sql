-- Migration 016: blinda la colonna `plan` contro l'auto-promozione
create or replace function public.prevent_plan_self_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() is distinct from 'service_role'
     and new.plan is distinct from old.plan then
    new.plan := old.plan;
  end if;
  return new;
end;
$$;

drop trigger if exists lock_plan_column on public.profiles;

create trigger lock_plan_column
  before update on public.profiles
  for each row
  execute function public.prevent_plan_self_change();
