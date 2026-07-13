alter table public.profiles
  add column if not exists power_user boolean not null default false;
