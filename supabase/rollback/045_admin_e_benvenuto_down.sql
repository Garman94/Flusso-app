-- Rollback della migration 045.
-- Prima riportare indietro il codice (Vercel → Instant Rollback): quello nuovo legge profiles.onboarded_at
-- (se la colonna manca semplicemente non manda al benvenuto, quindi l'ordine non è critico).
-- ATTENZIONE: rimette la vecchia policy, che fa leggere i feedback di tutti a OGNI founder.
-- Uso: npx --no-install supabase db query --linked -f supabase/rollback/045_admin_e_benvenuto_down.sql
-- Questa cartella non è letta da "supabase db push".

drop policy if exists "Admin full access" on public.feedback_messages;
create policy "Founder full access"
  on public.feedback_messages for all
  using (exists (select 1 from public.profiles where id = auth.uid() and plan = 'founder'))
  with check (exists (select 1 from public.profiles where id = auth.uid() and plan = 'founder'));

drop function if exists public.is_app_admin();
drop table if exists public.app_admins;
alter table public.profiles drop column if exists onboarded_at;
