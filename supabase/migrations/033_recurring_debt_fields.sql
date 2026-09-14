-- Migration 033: campi debito su recurring_expenses (tab Smart > Impegni > Rate)
-- Una "Rata" e' una spesa ricorrente fissa mensile con in piu' l'importo totale
-- finanziato e la data di inizio: da questi due (+ l'amount mensile gia' esistente)
-- si calcola lato client (computeDebtProgress in lib/calculations.ts) quanti mesi
-- mancano, quando finisce e quanto e' stato pagato finora. end_date viene comunque
-- valorizzato al salvataggio con la data di fine calcolata, cosi' la voce continua a
-- sparire da sola dalla lista "prossima scadenza" (logica gia' esistente su end_date)
-- senza bisogno di duplicare quel controllo.

alter table public.recurring_expenses
  add column if not exists debt_type text
    check (debt_type is null or debt_type in ('mutuo', 'rata_acquisto', 'debito_persona', 'altro')),
  add column if not exists debt_total_amount numeric,
  add column if not exists debt_start_date date;
