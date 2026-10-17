-- Migration 046: coupon a tempo e per più persone (per chi prova Flusso).
--
-- days      se valorizzato il codice dà Premium per N giorni: allunga trial_ends_at e il piano resta free
--           (lib/plans.ts → resolvePlan lo tratta da Premium finché non scade). Se null, piano per sempre come prima.
-- max_uses  quante persone possono usarlo (es. PROVA90 per 30 persone); uses = quante l'hanno usato.
--           used = esaurito, così la vecchia logica (un codice, una persona) resta uguale.
-- coupon_redemptions  chi ha usato quale codice: una volta a testa.
-- redeem_coupon()     tutto il riscatto in un colpo solo e senza doppi usi; la chiama solo l'API col service role.

alter table public.coupon_codes
  add column if not exists days     int check (days is null or days between 1 and 730),
  add column if not exists max_uses int not null default 1 check (max_uses between 1 and 1000),
  add column if not exists uses     int not null default 0 check (uses >= 0);
update public.coupon_codes set uses = 1 where used and uses = 0;

create table if not exists public.coupon_redemptions (
  coupon_id   uuid not null references public.coupon_codes(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  redeemed_at timestamptz not null default now(),
  primary key (coupon_id, user_id)
);
alter table public.coupon_redemptions enable row level security;
-- nessuna policy: solo service role

insert into public.coupon_redemptions (coupon_id, user_id, redeemed_at)
  select id, used_by, coalesce(used_at, now()) from public.coupon_codes where used and used_by is not null
  on conflict do nothing;

create or replace function public.redeem_coupon(p_code text, p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c         public.coupon_codes;
  cur_plan  text;
  cur_trial timestamptz;
  ends      timestamptz;
begin
  select * into c from public.coupon_codes where code = upper(trim(p_code)) for update;
  if not found then return jsonb_build_object('error', 'not_found'); end if;
  if exists (select 1 from public.coupon_redemptions where coupon_id = c.id and user_id = p_user) then
    return jsonb_build_object('error', 'already_redeemed');
  end if;
  if c.uses >= c.max_uses then
    return jsonb_build_object('error', case when c.max_uses > 1 then 'sold_out' else 'used' end);
  end if;

  select plan, trial_ends_at into cur_plan, cur_trial from public.profiles where id = p_user for update;
  if not found then return jsonb_build_object('error', 'no_profile'); end if;
  if cur_plan = 'founder' then return jsonb_build_object('error', 'already_founder'); end if;
  if cur_plan = 'premium' and c.plan = 'premium' then return jsonb_build_object('error', 'already_premium'); end if;

  insert into public.coupon_redemptions (coupon_id, user_id) values (c.id, p_user);
  update public.coupon_codes
     set uses = uses + 1, used = (uses + 1 >= max_uses), used_by = p_user, used_at = now()
   where id = c.id;

  if c.days is not null then
    -- N giorni da oggi; se la prova in corso dura di più, resta quella
    ends := greatest(coalesce(cur_trial, now()), now() + make_interval(days => c.days));
    update public.profiles set trial_ends_at = ends where id = p_user;
    return jsonb_build_object('plan', 'premium', 'days', c.days, 'until', ends);
  end if;

  update public.profiles set plan = c.plan where id = p_user;
  return jsonb_build_object('plan', c.plan);
end;
$$;
revoke all on function public.redeem_coupon(text, uuid) from public, anon, authenticated;
grant execute on function public.redeem_coupon(text, uuid) to service_role;
