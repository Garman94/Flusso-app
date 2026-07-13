create table if not exists public.feedback_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.feedback_messages enable row level security;

-- utenti leggono solo i propri messaggi
create policy "Users see own feedback"
  on public.feedback_messages for select
  using (user_id = auth.uid());

-- utenti inviano i propri messaggi (non admin)
create policy "Users send feedback"
  on public.feedback_messages for insert
  with check (user_id = auth.uid() and is_admin = false);

-- founder: accesso totale (lettura + inserimento risposte con is_admin=true)
create policy "Founder full access"
  on public.feedback_messages for all
  using (
    exists (select 1 from public.profiles where id = auth.uid() and plan = 'founder')
  )
  with check (
    exists (select 1 from public.profiles where id = auth.uid() and plan = 'founder')
  );
