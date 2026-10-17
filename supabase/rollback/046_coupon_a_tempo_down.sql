-- Rollback della migration 046.
-- Prima riportare indietro il codice (Vercel → Instant Rollback): quello nuovo chiama redeem_coupon e legge days/max_uses/uses.
-- Chi ha già riscattato un codice a tempo tiene i giorni di Premium (trial_ends_at resta).
-- I codici per più persone tornano "un codice, una persona": used resta com'è.
-- Uso: npx --no-install supabase db query --linked -f supabase/rollback/046_coupon_a_tempo_down.sql
-- Questa cartella non è letta da "supabase db push".

drop function if exists public.redeem_coupon(text, uuid);
drop table if exists public.coupon_redemptions;
alter table public.coupon_codes
  drop column if exists days,
  drop column if exists max_uses,
  drop column if exists uses;
