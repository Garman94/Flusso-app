-- ============================================================
-- Migration: 028_admin_notifications
-- Block 3 / Feature 3 — campanella notifiche sviluppatore.
-- L'admin inserisce le righe direttamente da Supabase Studio.
-- ============================================================

create table if not exists public.admin_notifications (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  message     text not null,
  type        text not null default 'info' check (type in ('info','tip','warning','feedback_request')),
  target_plan text not null default 'all' check (target_plan in ('all','free','premium','founder')),
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz,
  cta_text    text,
  cta_url     text
);

alter table public.admin_notifications enable row level security;

-- Lettura per tutti gli autenticati; scrittura solo service_role / Studio (bypassa RLS)
create policy "Anyone can read notifications"
  on public.admin_notifications for select
  using (true);

create table if not exists public.notification_dismissals (
  id              uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.admin_notifications(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  dismissed_at    timestamptz not null default now(),
  unique (notification_id, user_id)
);

create index if not exists notification_dismissals_user_idx on public.notification_dismissals(user_id);

alter table public.notification_dismissals enable row level security;

create policy "Users manage own dismissals"
  on public.notification_dismissals for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop trigger if exists block_demo_writes on public.notification_dismissals;
create trigger block_demo_writes
  before insert or update or delete on public.notification_dismissals
  for each row execute function public.block_demo_writes();

-- ── Notifiche di default ─────────────────────────────────────────────────
insert into public.admin_notifications (title, message, type, target_plan, is_active, cta_text, cta_url) values
  ('Benvenuto su Flusso! 👋',
   'Inizia importando l''estratto conto della tua banca. Supportiamo tutti i formati Excel delle banche italiane.',
   'info', 'all', true, null, null),
  ('💡 Hai già aggiunto le spese ricorrenti?',
   'Aggiungi affitto, bollette e abbonamenti nella sezione Smart per previsioni più accurate.',
   'tip', 'all', true, null, null),
  ('📣 Come sta andando Flusso?',
   'Siamo in beta e il tuo feedback è prezioso. Cosa miglioreresti?',
   'feedback_request', 'all', true, 'Scrivi un feedback', '/dashboard/account')
on conflict do nothing;
