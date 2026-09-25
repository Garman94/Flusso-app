// Luce e gas (Pianifica → Spese fisse → Utenze → "Calcola luce e gas"): stima della bolletta
// dai consumi (kWh, Smc) e dalla tariffa del fornitore, previsione del mese dai consumi dello
// stesso mese negli anni passati, taratura su una bolletta vera, lettura di bollette e
// contratti con l'AI (prompt e risposta qui, chiamata in app/dashboard/smart/utenze-actions.ts).
//
// La bolletta è semplificata in quello che una persona trova scritto: prezzo dell'energia,
// quote fisse al mese, "altri costi" a consumo (trasporto, oneri di sistema, accise: sono
// tanti e cambiano ogni trimestre, per questo si tarano su una bolletta vera), IVA e, per la
// luce, il canone RAI (addebitato da gennaio a ottobre).

import { parseAmount } from "./import-parse";

export type UtilityKind = "luce" | "gas";

export const UTILITY: Record<UtilityKind, {
  label: string; icon: string; unit: string;
  /** altri costi a consumo di partenza, €/unità, finché non si tara su una bolletta */
  otherDefault: number;
  priceRange: [number, number];
}> = {
  luce: { label: "Luce", icon: "⚡", unit: "kWh", otherDefault: 0.06, priceRange: [0.01, 2] },
  gas: { label: "Gas", icon: "🔥", unit: "Smc", otherDefault: 0.30, priceRange: [0.05, 5] },
};

export type Tariff = {
  supplier: string | null;
  /** prezzo dell'energia o del gas, €/kWh o €/Smc, IVA esclusa */
  unit_price: number;
  /** trasporto, oneri di sistema, accise…, €/unità, IVA esclusa */
  other_unit_costs: number;
  /** quote fisse (commercializzazione, trasporto, potenza) al mese, IVA esclusa */
  fixed_monthly: number;
  vat_pct: number;
  /** canone RAI al mese, solo luce: in bolletta da gennaio a ottobre */
  tv_fee_monthly: number;
};

export type Reading = { year: number; month: number; consumption: number };

export type BillEstimate = {
  consumption: number;
  energy: number;
  other: number;
  fixed: number;
  vat: number;
  tv: number;
  total: number;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Il canone RAI si paga in bolletta nei mesi da gennaio a ottobre. */
function tvMonths(firstMonth: number, months: number): number {
  let n = 0;
  for (let i = 0; i < months; i++) if (((firstMonth - 1 + i) % 12) + 1 <= 10) n++;
  return n;
}

/** Bolletta stimata per `months` mesi a partire da `firstMonth` (1-12). */
export function estimateBill(kind: UtilityKind, t: Tariff, consumption: number, firstMonth: number, months = 1): BillEstimate {
  const energy = consumption * t.unit_price;
  const other = consumption * t.other_unit_costs;
  const fixed = t.fixed_monthly * months;
  const vat = (energy + other + fixed) * (t.vat_pct / 100);
  const tv = kind === "luce" ? t.tv_fee_monthly * tvMonths(firstMonth, months) : 0;
  return {
    consumption,
    energy: round2(energy), other: round2(other), fixed: round2(fixed), vat: round2(vat), tv: round2(tv),
    total: round2(energy + other + fixed + vat + tv),
  };
}

/**
 * Altri costi a consumo che fanno tornare una bolletta vera: dal totale si tolgono canone,
 * IVA e quote fisse, quello che resta diviso per il consumo meno il prezzo dell'energia.
 * `ok: false` se il risultato è negativo: vuol dire che quote fisse o prezzo sono troppo alti.
 */
export function calibrateOtherCosts(
  kind: UtilityKind, t: Tariff,
  bill: { total: number; consumption: number; firstMonth: number; months: number },
): { value: number; ok: boolean } | null {
  if (!(bill.consumption > 0) || !(bill.total > 0) || !(bill.months >= 1)) return null;
  const tv = kind === "luce" ? t.tv_fee_monthly * tvMonths(bill.firstMonth, bill.months) : 0;
  const net = (bill.total - tv) / (1 + t.vat_pct / 100) - t.fixed_monthly * bill.months;
  const value = net / bill.consumption - t.unit_price;
  return { value: Math.max(0, Math.round(value * 10000) / 10000), ok: value >= 0 };
}

export type Forecast = {
  consumption: number;
  /** actual: consumo già inserito per quel mese; same-month: stesso mese degli anni prima; recent: ultimi mesi */
  basis: "actual" | "same-month" | "recent";
  /** anni usati (same-month) */
  years: number[];
  /** correzione per come stanno andando i consumi quest'anno rispetto all'anno prima (1 = nessuna) */
  trend: number;
};

const key = (r: { year: number; month: number }) => r.year * 12 + (r.month - 1);

/**
 * Consumo previsto per un mese. Se c'è già il dato, quello. Altrimenti lo stesso mese negli
 * anni prima (media degli ultimi tre), corretto per la tendenza di quest'anno: se nei mesi già
 * passati si è consumato il 10% in meno dell'anno prima, anche questo mese si stima il 10% in
 * meno (correzione tra −30% e +30%, solo con almeno due mesi da confrontare). Senza lo stesso
 * mese, la media degli ultimi tre mesi inseriti.
 */
export function forecastConsumption(readings: Reading[], year: number, month: number): Forecast | null {
  const exact = readings.find(r => r.year === year && r.month === month);
  if (exact) return { consumption: exact.consumption, basis: "actual", years: [year], trend: 1 };

  const same = readings.filter(r => r.month === month && r.year < year).sort((a, b) => b.year - a.year).slice(0, 3);
  if (same.length) {
    const base = same.reduce((s, r) => s + r.consumption, 0) / same.length;
    const byKey = new Map(readings.map(r => [key(r), r.consumption]));
    let now = 0, before = 0, pairs = 0;
    for (const r of readings) {
      if (r.year !== year || r.month >= month) continue;
      const lastYear = byKey.get(key(r) - 12);
      if (lastYear === undefined) continue;
      now += r.consumption; before += lastYear; pairs++;
    }
    const trend = pairs >= 2 && before > 0 ? Math.min(1.3, Math.max(0.7, now / before)) : 1;
    return { consumption: Math.round(base * trend), basis: "same-month", years: same.map(r => r.year), trend: Math.round(trend * 100) / 100 };
  }

  const target = year * 12 + (month - 1);
  const recent = readings.filter(r => key(r) < target).sort((a, b) => key(b) - key(a)).slice(0, 3);
  if (recent.length) {
    return { consumption: Math.round(recent.reduce((s, r) => s + r.consumption, 0) / recent.length), basis: "recent", years: [], trend: 1 };
  }
  return null;
}

/** Il consumo di una bolletta di più mesi diviso in parti uguali sui mesi. */
export function splitConsumption(total: number, year: number, firstMonth: number, months: number): Reading[] {
  const each = Math.round((total / months) * 100) / 100;
  return Array.from({ length: months }, (_, i) => {
    const m0 = firstMonth - 1 + i;
    return { year: year + Math.floor(m0 / 12), month: (m0 % 12) + 1, consumption: each };
  });
}

// ── Lettura di bollette e contratti con l'AI ────────────────────────────────

export type ExtractedSupply = {
  kind: UtilityKind;
  supplier: string | null;
  unit_price: number | null;
  fixed_monthly: number | null;
  vat_pct: number | null;
  tv_fee_monthly: number | null;
  bill: { total: number; consumption: number; from: string; to: string; months: number } | null;
  history: Reading[];
};

export function buildBillPrompt(today: string): string {
  return `Questo è una bolletta o un contratto di luce e/o gas di un fornitore italiano.
Oggi è il ${today}. Leggi solo quello che c'è scritto: se un dato non c'è, usa null. Non inventare.

Per ogni fornitura presente (luce, gas o entrambe) restituisci un oggetto con:
- tipo: "luce" oppure "gas"
- fornitore: nome del fornitore (es. "Enel Energia")
- prezzo_unitario: prezzo dell'energia (luce, €/kWh) o della materia prima gas (€/Smc) dell'offerta, IVA esclusa. Se ci sono fasce (F1, F2, F3) usa la media o il prezzo monorario.
- quota_fissa_mensile: somma delle quote fisse al mese IVA esclusa (commercializzazione/vendita, quota fissa trasporto e gestione contatore, quota potenza). Se sono all'anno, dividi per 12.
- iva_percentuale: aliquota IVA (es. 10)
- canone_rai_mensile: canone RAI addebitato al mese, solo luce, altrimenti null
- bolletta: se è una bolletta, { "totale": importo totale da pagare in euro, "consumo": consumo fatturato del periodo (kWh o Smc), "dal": "YYYY-MM-DD", "al": "YYYY-MM-DD" }, altrimenti null
- storico: consumi mensili se la bolletta li riporta (tabella o grafico "storico consumi"), come [{ "anno": 2025, "mese": 9, "consumo": 180 }]; se lo storico è per bimestre, dividi a metà sui due mesi. Altrimenti [].

Restituisci SOLO un array JSON valido, senza markdown e senza testo prima o dopo.
Esempio: [{"tipo":"luce","fornitore":"Enel Energia","prezzo_unitario":0.132,"quota_fissa_mensile":11.5,"iva_percentuale":10,"canone_rai_mensile":9,"bolletta":{"totale":98.4,"consumo":360,"dal":"2026-07-01","al":"2026-08-31"},"storico":[{"anno":2025,"mese":9,"consumo":175}]}]`;
}

function num(v: unknown, min: number, max: number): number | null {
  const n = typeof v === "number" ? v : parseAmount(v);
  return n !== null && Number.isFinite(n) && n >= min && n <= max ? n : null;
}

function isoDate(v: unknown): string | null {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v.trim()) ? v.trim() : null;
}

function monthsBetweenInclusive(from: string, to: string): number {
  return (+to.slice(0, 4) - +from.slice(0, 4)) * 12 + (+to.slice(5, 7) - +from.slice(5, 7)) + 1;
}

/** Legge la risposta del modello; scarta valori fuori misura (un prezzo di 13 €/kWh è un errore di lettura). */
export function parseBillExtraction(raw: string): ExtractedSupply[] {
  const text = raw.replace(/^\s*```[a-z]*\s*/i, "").replace(/\s*```\s*$/i, "").trim();
  let list: unknown;
  try {
    list = JSON.parse(text);
  } catch {
    const start = text.indexOf("["), end = text.lastIndexOf("]");
    if (start < 0 || end <= start) return [];
    try { list = JSON.parse(text.slice(start, end + 1)); } catch { return []; }
  }
  if (!Array.isArray(list)) list = [list];

  const out: ExtractedSupply[] = [];
  for (const item of list as unknown[]) {
    const o = (item ?? {}) as Record<string, unknown>;
    const kind = o.tipo === "luce" || o.tipo === "gas" ? o.tipo : null;
    if (!kind) continue;
    const [lo, hi] = UTILITY[kind].priceRange;

    let bill: ExtractedSupply["bill"] = null;
    const b = (o.bolletta ?? null) as Record<string, unknown> | null;
    if (b) {
      const total = num(b.totale, 1, 20000);
      const consumption = num(b.consumo, 1, 200000);
      const from = isoDate(b.dal), to = isoDate(b.al);
      if (total !== null && consumption !== null && from && to && to >= from) {
        bill = { total, consumption, from, to, months: Math.min(12, Math.max(1, monthsBetweenInclusive(from, to))) };
      }
    }

    const history: Reading[] = [];
    for (const h of Array.isArray(o.storico) ? o.storico : []) {
      const r = (h ?? {}) as Record<string, unknown>;
      const year = num(r.anno, 2000, 2100), month = num(r.mese, 1, 12), consumption = num(r.consumo, 0, 100000);
      if (year !== null && month !== null && consumption !== null && Number.isInteger(year) && Number.isInteger(month)) {
        history.push({ year, month, consumption });
      }
    }

    out.push({
      kind,
      supplier: typeof o.fornitore === "string" && o.fornitore.trim() ? o.fornitore.trim().slice(0, 60) : null,
      unit_price: num(o.prezzo_unitario, lo, hi),
      fixed_monthly: num(o.quota_fissa_mensile, 0, 300),
      vat_pct: num(o.iva_percentuale, 0, 30),
      tv_fee_monthly: kind === "luce" ? num(o.canone_rai_mensile, 0, 20) : null,
      bill,
      history,
    });
  }
  return out;
}
