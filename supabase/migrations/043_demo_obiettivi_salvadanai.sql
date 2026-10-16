-- Migration 043 (solo demo): la demo mostra obiettivi, salvadanai, accantonamenti ed Emergenza
-- come vorremmo che li usassero tutti.
--   - ogni obiettivo ha il suo salvadanaio ("Nuovo laptop" ne riceve uno con i suoi 480 €);
--   - "Emergenza" resta un salvadanaio libero: l'obiettivo "Fondo emergenza" ripeteva lo stesso
--     numero e lo spingeva in fondo nella finestra Emergenza;
--   - gli accantonamenti stanno nel salvadanaio "Accantonamenti" (circa quanto previsto).
-- reseed_demo() resta com'è: questa funzione si applica dopo, come reseed_demo_utenze(), ed è
-- chiamata da /api/demo/reset. Non tocca dati degli utenti.
-- Rollback: supabase/rollback/043_demo_obiettivi_salvadanai_down.sql

create or replace function public.reseed_demo_salvadanai()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  demo_id    uuid := public.demo_user_id();
  pot_laptop uuid;
  pot_acc    uuid;
begin
  if demo_id is null then return; end if;

  delete from goals where user_id = demo_id and name = 'Fondo emergenza';

  if not exists (select 1 from savings_pots where user_id = demo_id and name = 'Nuovo laptop') then
    insert into savings_pots (user_id, name, emoji, target_amount, current_balance, color)
      values (demo_id, 'Nuovo laptop', '💻', 800.00, 0, '#3b82f6') returning id into pot_laptop;
    insert into savings_transactions (pot_id, user_id, amount, type, note, date)
      values (pot_laptop, demo_id, 480.00, 'deposit', 'Già da parte per l''obiettivo', current_date - 30);
    update goals set savings_pot_id = pot_laptop, current_amount = 480.00, monthly_contribution = 110.00
      where user_id = demo_id and name = 'Nuovo laptop';
  end if;

  if not exists (select 1 from savings_pots where user_id = demo_id and name = 'Accantonamenti') then
    insert into savings_pots (user_id, name, emoji, current_balance, color)
      values (demo_id, 'Accantonamenti', '🏦', 0, '#a855f7') returning id into pot_acc;
    insert into savings_transactions (pot_id, user_id, amount, type, note, date)
      values (pot_acc, demo_id, 670.00, 'deposit', 'Accantonamenti dei mesi scorsi', current_date - 10);
    update recurring_expenses set savings_pot_id = pot_acc
      where user_id = demo_id and next_due_date is not null;
  end if;
end;
$$;

revoke all on function public.reseed_demo_salvadanai() from public, anon, authenticated;

select public.reseed_demo_salvadanai();
