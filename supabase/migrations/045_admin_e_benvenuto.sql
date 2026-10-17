-- Migration 045: chi è admin nel database + benvenuto per i nuovi iscritti.
--
-- 1) feedback_messages: la policy "Founder full access" (020) dava a OGNI account con piano
--    founder lettura e scrittura di tutti i messaggi di feedback, anche come "risposta admin".
--    I founder sono quasi tutti utenti con Premium regalato: ora serve stare in app_admins.
--    app_admins si riempie a mano (vedi CLAUDE.md), così nel repo pubblico non c'è nessuna email.
-- 2) profiles.onboarded_at: i nuovi iscritti passano una volta da /onboarding (app/dashboard/layout.tsx).
--    Chi è già iscritto risulta già passato.

create table if not exists public.app_admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.app_admins enable row level security;
-- nessuna policy: si legge solo tramite is_app_admin() e col service role

create or replace function public.is_app_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (select 1 from public.app_admins where user_id = auth.uid());
$$;
revoke all on function public.is_app_admin() from public;
grant execute on function public.is_app_admin() to authenticated;

drop policy if exists "Founder full access" on public.feedback_messages;
drop policy if exists "Admin full access" on public.feedback_messages;
create policy "Admin full access"
  on public.feedback_messages for all
  using (public.is_app_admin())
  with check (public.is_app_admin());

alter table public.profiles add column if not exists onboarded_at timestamptz;
update public.profiles set onboarded_at = created_at where onboarded_at is null;
