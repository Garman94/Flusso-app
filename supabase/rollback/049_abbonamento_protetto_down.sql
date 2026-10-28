-- Rollback della migration 049: torna la protezione della 036 (piano e date), SENZA l'id
-- dell'abbonamento. ATTENZIONE: riapre la falla per cui un utente può annullare l'abbonamento
-- di un altro cliente. Usarlo solo se la 049 rompe qualcosa, e correggere subito dopo.
-- Uso: npx --no-install supabase db query --linked -f supabase/rollback/049_abbonamento_protetto_down.sql
-- Questa cartella non è letta da "supabase db push".

create or replace function public.prevent_plan_self_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() is distinct from 'service_role' then
    new.plan            := old.plan;
    new.trial_ends_at   := old.trial_ends_at;
    new.premium_ends_at := old.premium_ends_at;
  end if;
  return new;
end;
$$;
