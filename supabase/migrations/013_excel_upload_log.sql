-- Migration 013: traccia gli upload Excel per piano free (max 3/mese)

create table excel_uploads (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references profiles(id) on delete cascade,
  uploaded_at timestamptz not null default now()
);

create index excel_uploads_user_month_idx
  on excel_uploads (user_id, uploaded_at);

alter table excel_uploads enable row level security;

create policy "Users can insert own uploads"
  on excel_uploads for insert
  with check (user_id = auth.uid());

create policy "Users can read own uploads"
  on excel_uploads for select
  using (user_id = auth.uid());
