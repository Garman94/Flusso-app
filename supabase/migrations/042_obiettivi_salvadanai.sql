-- Migration 042: obiettivi e salvadanai, un numero solo.
-- Un obiettivo collegato a un salvadanaio (goals.savings_pot_id) vale il saldo del salvadanaio:
-- il codice lo legge da lì (lib/goals.ts). Questo trigger tiene allineato anche
-- goals.current_amount quando il saldo cambia (versamenti, prelievi, Emergenza, "Segna come
-- pagata"), ma solo per gli obiettivi che erano già allineati: se l'obiettivo segnava una cifra
-- diversa da prima dell'unione, resta com'è finché l'utente non sceglie quale è giusta.
-- Nessun dato esistente viene modificato da questa migration.
-- Rollback: supabase/rollback/042_obiettivi_salvadanai_down.sql (dopo aver riportato indietro il codice).

create or replace function public.sync_goal_from_pot()
returns trigger
language plpgsql
as $$
begin
  update public.goals
    set current_amount = new.current_balance,
        updated_at = now()
    where savings_pot_id = new.id
      and current_amount = old.current_balance;
  return new;
end;
$$;

drop trigger if exists sync_goal_from_pot on public.savings_pots;
create trigger sync_goal_from_pot
  after update of current_balance on public.savings_pots
  for each row
  when (new.current_balance is distinct from old.current_balance)
  execute function public.sync_goal_from_pot();
