-- 007: regole di visualizzazione descrizioni transazioni
create table if not exists public.display_rules (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  find_text   text not null,          -- testo da cercare nella descrizione
  replace_with text not null,         -- con cosa sostituire la parte trovata (il resto rimane)
  created_at  timestamptz default now()
);

alter table public.display_rules enable row level security;

create policy "Users manage own display rules"
  on public.display_rules for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index display_rules_user_idx on public.display_rules(user_id);
