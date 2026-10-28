-- Migration 049: l'id dell'abbonamento Lemon Squeezy lo scrive solo il server.
-- Prima un utente poteva cambiare `lemon_squeezy_subscription_id` nel proprio profilo (policy
-- "Users can update own profile") e poi chiamare /api/subscription/cancel, che annulla su
-- Lemon Squeezy l'abbonamento con quell'id: anche quello di un altro cliente (analisi del 28/10).
-- Estende il blocco di 016 e 036 a quella colonna: solo il service role (webhook) la cambia.
-- Rollback: supabase/rollback/049_abbonamento_protetto_down.sql

create or replace function public.prevent_plan_self_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() is distinct from 'service_role' then
    new.plan                          := old.plan;
    new.trial_ends_at                 := old.trial_ends_at;
    new.premium_ends_at               := old.premium_ends_at;
    new.lemon_squeezy_subscription_id := old.lemon_squeezy_subscription_id;
  end if;
  return new;
end;
$$;
