-- ============================================================
-- Migration: 024_import_logs
-- Feature 2 (livello 1): rilevamento stesso file Excel caricato due volte.
-- Distinta da excel_uploads (che serve al rate-limit del piano free).
-- ============================================================

create table if not exists public.import_logs (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  file_hash         text not null,
  filename          text,
  transaction_count int not null default 0,
  member_id         uuid references public.family_members(id) on delete set null,
  imported_at       timestamptz not null default now()
);

create index if not exists import_logs_user_hash_idx on public.import_logs(user_id, file_hash);

alter table public.import_logs enable row level security;

create policy "Users can manage own import logs"
  on public.import_logs for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
