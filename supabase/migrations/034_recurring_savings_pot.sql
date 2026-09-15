-- Migration 034: collega un accantonamento (recurring_expenses) a un salvadanaio
-- specifico (savings_pots). "Segna come pagata" > "scala dal salvadanaio" preleva
-- da questo pot invece che dal primo pot creato dall'utente (fallback invariato
-- per le voci senza salvadanaio collegato).

alter table public.recurring_expenses
  add column if not exists savings_pot_id uuid references public.savings_pots(id) on delete set null;
