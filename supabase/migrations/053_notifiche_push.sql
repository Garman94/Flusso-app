-- Migration 053: notifiche push sul sito e sull'app installata dal browser (fase 2 della
-- ricerca UX, «ti richiama»). Additiva: una tabella nuova e un tipo in più in email_sends.
-- Nessun dato esistente cambia.
--
-- push_subscriptions → i dispositivi su cui l'utente ha acceso le notifiche (Account → Avvisi).
-- Ogni riga è l'indirizzo che il browser riceve dal suo servizio di notifiche (Google, Apple,
-- Mozilla, Microsoft) più le due chiavi per cifrare il messaggio: chi non ha le chiavi non può
-- leggere quello che mandiamo. `device` è solo il tipo di dispositivo (iPhone, Android, Windows…),
-- per contare in Admin chi le usa. Nessuna policy: la leggono e scrivono solo il server (service
-- role, dopo aver controllato chi è collegato) e l'SQL Editor. Un indirizzo appartiene a un solo
-- utente: se sullo stesso browser le accende un altro account, la riga passa a lui.
--
-- email_sends.kind 'push_weekly' → la notifica del lunedì, una per utente e settimana, con la
-- stessa regola delle email: prima la riga, poi l'invio, così il cron lanciato due volte non
-- manda due notifiche.

create table if not exists public.push_subscriptions (
  id         bigint generated always as identity primary key,
  user_id    uuid        not null references auth.users(id) on delete cascade,
  endpoint   text        not null unique
             check (char_length(endpoint) <= 1000
                    and endpoint ~ '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|([a-z0-9-]+\.)*push\.apple\.com|([a-z0-9-]+\.)*notify\.windows\.com)/'),
  p256dh     text        not null check (p256dh ~ '^[A-Za-z0-9_-]{40,200}$'),
  auth       text        not null check (auth ~ '^[A-Za-z0-9_-]{8,64}$'),
  device     text        check (char_length(device) <= 20),
  created_at timestamptz not null default now(),
  last_ok_at timestamptz
);

create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

alter table public.email_sends drop constraint if exists email_sends_kind_check;
alter table public.email_sends
  add constraint email_sends_kind_check check (kind in ('weekly', 'monthly', 'push_weekly'));
