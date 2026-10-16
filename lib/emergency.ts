// Emergenza: prendere soldi dai salvadanai senza restare scoperti sulle prossime spese.
//
// Dal salvadanaio degli accantonamenti si consiglia di prendere al massimo il saldo meno
// quello che serve per le voci che scadono questo mese e il prossimo: per quelle non c'è il
// tempo di rimetterli da parte. Il prelievo si toglie alle voci che scadono più avanti,
// partendo dalla più lontana, e per quelle il piano riparte da questo mese con quello che è
// rimasto: la quota mensile sale quanto basta per arrivare alla scadenza con l'importo intero.
// Oltre il massimo si può andare (è un'emergenza), con un avviso: allora tocca anche le voci
// vicine, e per quelle di questo mese i soldi vanno rimessi entro la scadenza.

import { aggregateSinkingFunds, monthsBetween, projectSinkingFund, type SinkingFundInput } from "./calculations";
import { toISODate } from "./dates";

const round2 = (n: number) => Math.round(n * 100) / 100;

export type DueGroup = { total: number; items: { id: string; name: string; amount: number; due: string }[] };

export type EmergencyLimit = {
  /** quanto si può prendere in tutto dal salvadanaio (o dai salvadanai) degli accantonamenti */
  max: number;
  /** da lasciare: le voci che scadono questo mese e il prossimo */
  reserve: number;
  thisMonth: DueGroup;
  nextMonth: DueGroup;
  balance: number;
};

/** Voci che scadono questo mese (o già scadute e non pagate) e il mese prossimo. */
export function upcomingDues(inputs: SinkingFundInput[], today: Date = new Date()) {
  const thisMonth: DueGroup = { total: 0, items: [] };
  const nextMonth: DueGroup = { total: 0, items: [] };
  for (const input of [...inputs].sort((a, b) => a.next_due_date.localeCompare(b.next_due_date))) {
    const left = projectSinkingFund(input, today).months_remaining;
    const group = left <= 0 ? thisMonth : left === 1 ? nextMonth : null;
    if (!group) continue;
    group.items.push({ id: input.id, name: input.name, amount: input.amount_per_cycle, due: input.next_due_date });
    group.total = round2(group.total + input.amount_per_cycle);
  }
  return { thisMonth, nextMonth };
}

export function emergencyLimit(inputs: SinkingFundInput[], balance: number, today: Date = new Date()): EmergencyLimit {
  const { thisMonth, nextMonth } = upcomingDues(inputs, today);
  const reserve = round2(thisMonth.total + nextMonth.total);
  return { max: Math.max(0, round2(balance - reserve)), reserve, thisMonth, nextMonth, balance: round2(balance) };
}

export type EmergencyItemPlan = {
  id: string;
  name: string;
  due: string;
  /** quanto del prelievo è tolto a questa voce */
  taken: number;
  quotaBefore: number;
  quotaAfter: number;
  /** scade questo mese (o è già scaduta): niente quota, `taken` va rimesso entro `due` */
  dueThisMonth: boolean;
  /** scade questo mese o il prossimo: è oltre il massimo consigliato */
  near: boolean;
  /** nuovi valori da salvare su recurring_expenses */
  savingStart: string;
  savingOffset: number;
};

export type EmergencyPlan = {
  /** preso da quello che c'era in più rispetto al previsto: non cambia nessuna quota */
  fromSurplus: number;
  items: EmergencyItemPlan[];
  monthlyBefore: number;
  monthlyAfter: number;
  /** il prelievo supera il massimo consigliato (tocca le spese di questo mese e del prossimo) */
  exceeds: boolean;
  /** il prelievo supera anche quello che le voci dovrebbero avere: non si può fare */
  uncovered: boolean;
};

/**
 * Cosa cambia negli accantonamenti prendendo `withdrawal` da un salvadanaio che ha `balance`
 * e tiene queste voci.
 */
export function planEmergency(
  inputs: SinkingFundInput[],
  balance: number,
  withdrawal: number,
  today: Date = new Date(),
): EmergencyPlan {
  const projections = inputs.map(i => projectSinkingFund(i, today));
  const active = projections.filter(p => p.months_remaining > 0);
  const monthlyBefore = round2(active.reduce((s, p) => s + p.monthly_quota, 0));
  const limit = emergencyLimit(inputs, balance, today);
  const exceeds = withdrawal > limit.max + 0.005;

  // Prima quello che c'è in più rispetto al previsto (in anticipo): non tocca nessuna voce.
  const expectedTotal = projections.reduce((s, p) => s + p.expected_saved_so_far, 0);
  const fromSurplus = Math.min(withdrawal, Math.max(0, round2(balance - expectedTotal)));
  let left = round2(withdrawal - fromSurplus);

  // Poi le voci con più tempo davanti: la scadenza più lontana per prima. Le voci di questo
  // mese e del prossimo solo oltre il massimo consigliato, sempre dalla più lontana.
  const firstOfMonth = toISODate(new Date(today.getFullYear(), today.getMonth(), 1));
  const items: EmergencyItemPlan[] = [];
  const latestFirst = (a: { input: SinkingFundInput }, b: { input: SinkingFundInput }) =>
    b.input.next_due_date.localeCompare(a.input.next_due_date);
  const candidates = [
    ...projections.filter(p => p.months_remaining >= 2).sort(latestFirst),
    ...projections.filter(p => p.months_remaining < 2).sort(latestFirst),
  ];
  for (const p of candidates) {
    if (left <= 0) break;
    const taken = round2(Math.min(left, Math.max(0, p.expected_saved_so_far)));
    if (taken <= 0) continue;
    left = round2(left - taken);

    // Il piano riparte da questo mese (compreso) con quello che resta alla voce fino al mese
    // scorso; se non era ancora cominciato, resta com'era.
    const started = p.months_elapsed >= 1;
    const savingStart = started ? firstOfMonth : p.input.saving_start_date;
    const savedBefore = started ? p.expected_saved_so_far - p.monthly_quota : p.expected_saved_so_far;
    const savingOffset = round2(savedBefore - taken);
    const months = Math.max(1, monthsBetween(new Date(savingStart + "T00:00:00"), new Date(p.input.next_due_date + "T00:00:00")) + 1);
    items.push({
      id: p.input.id,
      name: p.input.name,
      due: p.input.next_due_date,
      taken,
      quotaBefore: round2(p.monthly_quota),
      quotaAfter: round2((p.input.amount_per_cycle - savingOffset) / months),
      dueThisMonth: p.months_remaining <= 0,
      near: p.months_remaining < 2,
      savingStart,
      savingOffset,
    });
  }

  // La quota mensile dopo: lo stesso calcolo di dashboard e Accantonamenti sui valori nuovi.
  const after = inputs.map(i => {
    const it = items.find(x => x.id === i.id);
    return it ? { ...i, saving_start_date: it.savingStart, saved_offset: it.savingOffset } : i;
  });
  const monthlyAfter = round2(aggregateSinkingFunds(after, 0, today).this_month_total);
  return { fromSurplus: round2(fromSurplus), items, monthlyBefore, monthlyAfter, exceeds, uncovered: left > 0.005 };
}

// ── Quali salvadanai tengono gli accantonamenti ─────────────────────────────

export type SinkingGroup = { potIds: string[]; itemIds: string[] };

/**
 * Come potsForSinkingFunds: se le voci sono collegate a dei salvadanai, ogni salvadanaio
 * tiene le sue; altrimenti tutti i salvadanai non collegati a un obiettivo tengono tutte le
 * voci insieme.
 */
export function sinkingGroups(
  pots: { id: string }[],
  goalPotIds: (string | null | undefined)[],
  items: { id: string; savings_pot_id: string | null }[],
): SinkingGroup[] {
  if (items.length === 0) return [];
  const linked = items.filter(it => it.savings_pot_id && pots.some(p => p.id === it.savings_pot_id));
  if (linked.length > 0) {
    const byPot = new Map<string, string[]>();
    for (const it of linked) byPot.set(it.savings_pot_id!, [...(byPot.get(it.savings_pot_id!) ?? []), it.id]);
    return [...byPot.entries()].map(([potId, itemIds]) => ({ potIds: [potId], itemIds }));
  }
  const reserved = new Set(goalPotIds.filter((x): x is string => !!x));
  const potIds = pots.filter(p => !reserved.has(p.id)).map(p => p.id);
  return potIds.length ? [{ potIds, itemIds: items.map(it => it.id) }] : [];
}
