-- Rollback della migration 053 (notifiche push). Prima il codice (revert della PR), poi questo.
-- Cancella i dispositivi registrati: chi aveva acceso le notifiche dovrà riaccenderle.

delete from public.email_sends where kind = 'push_weekly';

alter table public.email_sends drop constraint if exists email_sends_kind_check;
alter table public.email_sends
  add constraint email_sends_kind_check check (kind in ('weekly', 'monthly'));

drop table if exists public.push_subscriptions;
