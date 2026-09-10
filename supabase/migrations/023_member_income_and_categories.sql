-- ============================================================
-- Migration: 023_member_income_and_categories
-- Feature 3: anagrafica reddito per componente e per titolare
-- Feature 4: categorie di sistema Hobby + Accantonamenti
-- ============================================================

-- ── Campi reddito (family_members + profiles), tutti nullable ──────────────
do $$
declare
  tbl text;
begin
  foreach tbl in array array['family_members', 'profiles'] loop
    execute format($f$
      alter table public.%I
        add column if not exists income_type text
          constraint %I_income_type_check
          check (income_type in ('employee','freelance','seasonal','none')),
        add column if not exists monthly_income numeric(12,2),
        add column if not exists income_frequency text
          constraint %I_income_frequency_check
          check (income_frequency in ('monthly','biweekly','weekly')),
        add column if not exists income_payday int,
        add column if not exists income_variability text
          constraint %I_income_variability_check
          check (income_variability in ('low','medium','high')),
        add column if not exists active_months int[] not null default '{}'
    $f$, tbl, tbl, tbl, tbl);
  end loop;
end $$;

-- ── Categorie di sistema aggiuntive (visibili a tutti: user_id IS NULL) ────
insert into public.categories (id, user_id, name, color, icon, is_system) values
  (gen_random_uuid(), null, 'Hobby',          '#a855f7', '🎮', true),
  (gen_random_uuid(), null, 'Accantonamenti', '#0ea5e9', '🏦', true)
on conflict do nothing;
