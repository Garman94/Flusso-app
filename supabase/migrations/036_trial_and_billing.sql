-- Migration 036: prova Premium alla registrazione, fine periodo abbonamento, tipo d'uso.
--
--  trial_ends_at    fine dei giorni di Premium inclusi (impostata dal server, una volta sola)
--  premium_ends_at  fine del periodo già pagato quando un abbonamento viene annullato:
--                   il piano resta 'premium' fino all'evento subscription_expired
--  usage_type       risposta dell'onboarding ("Come userai Flusso?"), prima veniva scartata

alter table public.profiles
  add column if not exists trial_ends_at   timestamptz,
  add column if not exists premium_ends_at timestamptz,
  add column if not exists usage_type      text
    check (usage_type is null or usage_type in ('solo', 'coppia', 'famiglia', 'gruppo'));

-- Estende il blocco dell'auto-promozione (migration 016) alle nuove colonne: solo il
-- service role (webhook Lemon Squeezy, riscatto coupon, avvio della prova) può scriverle.
-- Un utente che prova a estendersi la prova da solo vede il valore tornare com'era.
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
