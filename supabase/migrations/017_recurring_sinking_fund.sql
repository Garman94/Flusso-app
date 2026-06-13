-- Migration 017: campi per la feature Accantonamenti
alter table public.recurring_expenses
  add column if not exists next_due_date    date,
  add column if not exists saving_start_date date;

comment on column public.recurring_expenses.next_due_date is
  'Prossima data effettiva di pagamento. Se NULL, la voce non rientra nella feature Accantonamenti.';
comment on column public.recurring_expenses.saving_start_date is
  'Data da cui partire a spalmare la quota. Tipicamente coincide con la data di creazione della voce; modificabile via "Ricalcola da oggi".';
