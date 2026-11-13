// "In arrivo" in dashboard: le spese fisse, le rate e le spese dell'anno di questo periodo,
// con lo stato di ognuna (pagata, tra N giorni, non trovata nei movimenti).
// Lo stato di spese fisse e rate viene da planStatus (lib/fixed-expenses.ts), lo stesso di
// Pianifica e della stima di fine periodo: i numeri tornano ovunque.
// Le spese dell'anno (accantonamenti) compaiono solo se la scadenza cade nel periodo: si
// segnano come pagate in Pianifica, perché lì si sceglie se prendere i soldi dal salvadanaio.

import { computeDebtProgress } from "./calculations";
import { expectedAmount, isFixedExpense, planStatus, type PlanItem, type PlanTx } from "./fixed-expenses";
import { daysBetweenISO } from "./spendable";

export type UpcomingKind = "fixed" | "rate" | "sinking";
export type UpcomingState = "missing" | "upcoming" | "unverifiable" | "paid";

export type UpcomingItem = PlanItem & {
  debt_total_amount?: number | null;
  saving_start_date?: string | null;
};

export type UpcomingRow = {
  id: string;
  name: string;
  kind: UpcomingKind;
  /** previsto nel periodo */
  amount: number;
  /** scadenza nel periodo, se si conosce */
  date: string | null;
  /** giorni da oggi alla scadenza (0 = oggi, negativo = già passata) */
  daysTo: number | null;
  state: UpcomingState;
};

/** Prima quello che chiede attenzione: non trovate, poi in arrivo, poi da verificare, per ultime le pagate. */
const ORDER: Record<UpcomingState, number> = { missing: 0, upcoming: 1, unverifiable: 2, paid: 3 };

export const UPCOMING_MAX = 4;

export function upcomingItems(
  items: UpcomingItem[],
  txs: PlanTx[],
  from: string,
  to: string,
  today: string,
): UpcomingRow[] {
  const rows: UpcomingRow[] = [];
  const todayDate = new Date(today + "T12:00:00");

  for (const it of items) {
    let kind: UpcomingKind;
    if (it.debt_type) {
      // rate in corso: né quelle non ancora iniziate né quelle finite
      if (!it.debt_total_amount || !it.debt_start_date) continue;
      const progress = computeDebtProgress(
        { totalAmount: Number(it.debt_total_amount), monthlyAmount: Number(it.amount), startDate: it.debt_start_date },
        todayDate,
      );
      if (progress.status !== "active") continue;
      kind = "rate";
    } else if (isFixedExpense(it)) {
      kind = "fixed";
    } else if (it.next_due_date && it.tipologia !== "entrata") {
      // spesa dell'anno con la scadenza in questo periodo
      const d = it.next_due_date;
      if (d < from || d > to) continue;
      const paid = !!it.last_paid_date && it.last_paid_date >= from && it.last_paid_date <= to;
      rows.push({
        id: it.id, name: it.name, kind: "sinking",
        amount: expectedAmount(it),
        date: d, daysTo: daysBetweenISO(today, d),
        state: paid ? "paid" : d < today ? "missing" : "upcoming",
      });
      continue;
    } else {
      continue;
    }

    const st = planStatus(it, txs, from, to, today);
    if (st.state === "not-due") continue;
    const date = st.due.dates[st.due.dates.length - 1] ?? null;
    rows.push({
      id: it.id, name: it.name, kind,
      amount: st.expected,
      date, daysTo: date ? daysBetweenISO(today, date) : null,
      state: st.state,
    });
  }

  return rows.sort((a, b) =>
    ORDER[a.state] - ORDER[b.state]
    || (a.date ?? "9999").localeCompare(b.date ?? "9999")
    || a.name.localeCompare(b.name, "it"));
}

/** "oggi", "domani", "tra 5 giorni"; null se la data non si conosce o è passata. */
export function inDaysLabel(daysTo: number | null): string | null {
  if (daysTo == null || daysTo < 0) return null;
  if (daysTo === 0) return "oggi";
  if (daysTo === 1) return "domani";
  return `tra ${daysTo} giorni`;
}
