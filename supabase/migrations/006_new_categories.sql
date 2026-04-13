-- 006: aggiunte categorie di sistema Spostamenti e Salvadanaio
insert into public.categories (id, user_id, name, color, icon, is_system) values
  (gen_random_uuid(), null, 'Spostamenti',  '#a78bfa', '🔄', true),
  (gen_random_uuid(), null, 'Salvadanaio',  '#fbbf24', '🐷', true)
on conflict do nothing;
