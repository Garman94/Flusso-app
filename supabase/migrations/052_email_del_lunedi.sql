-- Migration 052: email del lunedì (fase 2 della ricerca UX, «ti richiama»).
-- Additiva: due colonne in profiles e una tabella nuova. Nessun dato esistente cambia.
--
-- profiles.email_weekly  → l'email del lunedì ("quanto puoi spendere questa settimana"): accesa per tutti,
--                          si spegne da Account → Avvisi o dal link in fondo all'email.
-- profiles.email_monthly → il riepilogo del mese per email (prossima PR): già qui per non fare
--                          un'altra migration.
-- Sono preferenze dell'utente: le scrive lui (policy "Users can update own profile"), quindi
-- NON vanno nel trigger prevent_plan_self_change.
--
-- email_sends → un'email per utente, tipo e settimana (o mese). L'invio prima scrive la riga
-- e manda l'email solo se la riga è nuova: se il cron parte due volte nessuno riceve due email.
-- Se l'invio fallisce la riga si cancella, così si può riprovare. Nessuna policy: la leggono
-- e scrivono solo il server (service role) e l'SQL Editor. Mai contenuto dell'email qui.

alter table public.profiles
  add column if not exists email_weekly  boolean not null default true,
  add column if not exists email_monthly boolean not null default true;

create table if not exists public.email_sends (
  id         bigint generated always as identity primary key,
  user_id    uuid        not null references auth.users(id) on delete cascade,
  kind       text        not null check (kind in ('weekly', 'monthly')),
  period_key text        not null check (char_length(period_key) between 1 and 20),
  sent_at    timestamptz not null default now(),
  unique (user_id, kind, period_key)
);

create index if not exists email_sends_kind_period_idx on public.email_sends (kind, period_key);

alter table public.email_sends enable row level security;
