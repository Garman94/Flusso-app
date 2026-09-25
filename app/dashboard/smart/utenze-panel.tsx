"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { formatEuro } from "@/lib/calculations";
import { parseAmount } from "@/lib/import-parse";
import { prepareImage } from "@/lib/image-prepare";
import { fixedGroupOf, isFixedExpense } from "@/lib/fixed-expenses";
import {
  UTILITY, calibrateOtherCosts, estimateBill, forecastConsumption, splitConsumption,
  type ExtractedSupply, type Forecast, type Reading, type Tariff, type UtilityKind,
} from "@/lib/utilities";
import { readUtilityDocument } from "./utenze-actions";
import type { FixedItem } from "./fixed-expenses-panel";

// Pianifica → Spese fisse → "Calcola luce e gas": stima della bolletta del mese dai consumi
// degli anni passati e dalla tariffa del fornitore, lettura di bollette e contratti con l'AI,
// taratura su una bolletta vera. Calcoli in lib/utilities.ts, tabelle nella migration 040.

type Category = { id: string; name: string };

const KINDS: UtilityKind[] = ["luce", "gas"];
const MONTHS = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];
const MONTHS_LONG = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];
const inputClass = "border-2 rounded-xl px-3 py-2.5 text-base bg-background focus:outline-none focus:border-primary transition-colors w-full";
const card = "rounded-2xl border p-5 flex flex-col gap-4";

const emptyTariff = (kind: UtilityKind): Tariff => ({
  supplier: null, unit_price: 0, other_unit_costs: UTILITY[kind].otherDefault, fixed_monthly: 0, vat_pct: 10, tv_fee_monthly: 0,
});
const hasPrice = (t?: Tariff) => !!t && t.unit_price > 0;
const dec = (n: number, digits = 2) => n.toLocaleString("it-IT", { minimumFractionDigits: 0, maximumFractionDigits: digits });
const num = (s: string) => parseAmount(s);

function errorText(message: string): string {
  if (message.includes("DEMO_READONLY")) return "Nella demo non si può salvare: registrati per usare i tuoi dati.";
  if (/relation .* does not exist|utility_/.test(message)) return "Il calcolatore non è ancora attivo.";
  return `Errore: ${message}`;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function basisText(kind: UtilityKind, f: Forecast, month: number): string {
  const unit = UTILITY[kind].unit;
  if (f.basis === "actual") return `Con i ${dec(f.consumption)} ${unit} di ${MONTHS_LONG[month - 1]} che hai inserito.`;
  if (f.basis === "recent") return `Media degli ultimi mesi inseriti: aggiungi ${MONTHS_LONG[month - 1]} degli anni passati per una stima migliore.`;
  const trend = f.trend === 1 ? "" : `, con il ${Math.round(Math.abs(1 - f.trend) * 100)}% ${f.trend < 1 ? "in meno" : "in più"} come quest'anno finora`;
  return `In base a ${MONTHS_LONG[month - 1]} ${f.years.join(" e ")}${trend}.`;
}

type Props = {
  userId: string;
  premium: boolean;
  items: FixedItem[];
  setItems: (fn: (prev: FixedItem[]) => FixedItem[]) => void;
  categories: Category[];
  onBack: () => void;
};

export function UtenzePanel({ userId, premium, items, setItems, categories, onBack }: Props) {
  const [kind, setKind] = useState<UtilityKind>("luce");
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [tariffs, setTariffs] = useState<Partial<Record<UtilityKind, Tariff>>>({});
  const [readings, setReadings] = useState<Record<UtilityKind, Reading[]>>({ luce: [], gas: [] });

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const [t, r] = await Promise.all([
        supabase.from("utility_tariffs").select("kind, supplier, unit_price, other_unit_costs, fixed_monthly, vat_pct, tv_fee_monthly"),
        supabase.from("utility_readings").select("kind, year, month, consumption").order("year").order("month"),
      ]);
      if (t.error || r.error) { setUnavailable(true); setLoading(false); return; }
      const nextTariffs: Partial<Record<UtilityKind, Tariff>> = {};
      for (const row of t.data ?? []) {
        nextTariffs[row.kind as UtilityKind] = {
          supplier: row.supplier, unit_price: Number(row.unit_price), other_unit_costs: Number(row.other_unit_costs),
          fixed_monthly: Number(row.fixed_monthly), vat_pct: Number(row.vat_pct), tv_fee_monthly: Number(row.tv_fee_monthly),
        };
      }
      const nextReadings: Record<UtilityKind, Reading[]> = { luce: [], gas: [] };
      for (const row of r.data ?? []) {
        nextReadings[row.kind as UtilityKind].push({ year: row.year, month: row.month, consumption: Number(row.consumption) });
      }
      setTariffs(nextTariffs);
      setReadings(nextReadings);
      setLoading(false);
    })();
  }, []);

  async function saveTariff(k: UtilityKind, t: Tariff): Promise<boolean> {
    const { error } = await createClient().from("utility_tariffs")
      .upsert({ user_id: userId, kind: k, ...t, updated_at: new Date().toISOString() }, { onConflict: "user_id,kind" });
    if (error) { toast.error(errorText(error.message)); return false; }
    setTariffs(prev => ({ ...prev, [k]: t }));
    return true;
  }

  async function saveReadings(k: UtilityKind, rows: Reading[], removed: { year: number; month: number }[] = []): Promise<boolean> {
    const supabase = createClient();
    if (rows.length) {
      const { error } = await supabase.from("utility_readings").upsert(
        rows.map(r => ({ user_id: userId, kind: k, ...r, updated_at: new Date().toISOString() })),
        { onConflict: "user_id,kind,year,month" },
      );
      if (error) { toast.error(errorText(error.message)); return false; }
    }
    for (const r of removed) {
      const { error } = await supabase.from("utility_readings").delete()
        .eq("user_id", userId).eq("kind", k).eq("year", r.year).eq("month", r.month);
      if (error) { toast.error(errorText(error.message)); return false; }
    }
    setReadings(prev => {
      const same = (a: { year: number; month: number }, b: { year: number; month: number }) => a.year === b.year && a.month === b.month;
      const kept = prev[k].filter(p => !rows.some(r => same(r, p)) && !removed.some(r => same(r, p)));
      return { ...prev, [k]: [...kept, ...rows].sort((a, b) => a.year - b.year || a.month - b.month) };
    });
    return true;
  }

  // ── Stima ──
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth() + 1;
  const nextY = m === 12 ? y + 1 : y, nextM = m === 12 ? 1 : m + 1;
  const estimates = useMemo(() => {
    const out: Partial<Record<UtilityKind, { forecast: Forecast; bill: ReturnType<typeof estimateBill>; next: ReturnType<typeof estimateBill> | null }>> = {};
    for (const k of KINDS) {
      const t = tariffs[k];
      const f = forecastConsumption(readings[k], y, m);
      if (!hasPrice(t) || !f) continue;
      const fNext = forecastConsumption(readings[k], nextY, nextM);
      out[k] = { forecast: f, bill: estimateBill(k, t!, f.consumption, m), next: fNext ? estimateBill(k, t!, fNext.consumption, nextM) : null };
    }
    return out;
  }, [tariffs, readings, y, m, nextY, nextM]);

  if (loading) {
    return <div className="flex flex-col gap-4 animate-pulse"><div className="h-8 w-40 rounded bg-muted" /><div className="h-48 rounded-2xl bg-muted/40" /></div>;
  }

  return (
    <div className="flex flex-col gap-5 max-w-lg mx-auto w-full">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="text-sm text-muted-foreground hover:text-foreground transition-colors">← Indietro</button>
        <h1 className="text-xl font-bold">Luce e gas</h1>
      </div>
      <p className="text-sm text-muted-foreground -mt-2">
        Con i consumi dello stesso mese degli anni passati e i prezzi del tuo fornitore, Flusso stima quanto pagherai.
      </p>

      {unavailable ? (
        <p className="rounded-xl border bg-muted/30 p-4 text-sm">Il calcolatore non è ancora attivo. Riprova più tardi.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-muted">
            {KINDS.map(k => (
              <button key={k} onClick={() => setKind(k)}
                className={`rounded-lg py-2 text-sm font-medium transition-colors ${kind === k ? "bg-background shadow-sm" : "text-muted-foreground"}`}>
                {UTILITY[k].icon} {UTILITY[k].label}
              </button>
            ))}
          </div>

          <EstimateCard
            kind={kind} tariff={tariffs[kind]} estimate={estimates[kind]} month={m} nextMonth={nextM}
            estimates={estimates} items={items} setItems={setItems} categories={categories}
          />

          <UploadCard premium={premium} tariffs={tariffs} saveTariff={saveTariff} saveReadings={saveReadings} onApplied={setKind} />

          <TariffCard key={`t-${kind}-${JSON.stringify(tariffs[kind] ?? null)}`} kind={kind} tariff={tariffs[kind]} saveTariff={saveTariff} />

          <ReadingsCard key={`r-${kind}`} kind={kind} readings={readings[kind]} saveReadings={saveReadings} thisYear={y} />
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════ STIMA ═══════════════════════════════

type Estimate = { forecast: Forecast; bill: ReturnType<typeof estimateBill>; next: ReturnType<typeof estimateBill> | null };

function EstimateCard({ kind, tariff, estimate, month, nextMonth, estimates, items, setItems, categories }: {
  kind: UtilityKind; tariff?: Tariff; estimate?: Estimate; month: number; nextMonth: number;
  estimates: Partial<Record<UtilityKind, Estimate>>;
  items: FixedItem[]; setItems: Props["setItems"]; categories: Category[];
}) {
  const [open, setOpen] = useState(false);
  const unit = UTILITY[kind].unit;

  // Spese fisse di tipo Utenze che la stima può aggiornare. "Luce e gas" = somma delle due.
  const catName = (id?: string | null) => categories.find(c => c.id === id)?.name;
  const utenze = items.filter(it => isFixedExpense(it) && fixedGroupOf(it, catName(it.category_id)) === "utenze");
  const both = (name: string) => /luce/i.test(name) && /gas/i.test(name);
  const guess = utenze.find(it => both(it.name)) ?? utenze.find(it => new RegExp(UTILITY[kind].label, "i").test(it.name)) ?? utenze[0];
  const [targetId, setTargetId] = useState<string>(guess?.id ?? "");
  const target = utenze.find(it => it.id === targetId) ?? guess;
  const amountFor = (it: FixedItem) => both(it.name)
    ? KINDS.reduce((s, k) => s + (estimates[k]?.bill.total ?? 0), 0)
    : estimate?.bill.total ?? 0;
  const [saving, setSaving] = useState(false);

  async function updateFixed() {
    if (!target) return;
    const amount = Math.round(amountFor(target) * 100) / 100;
    setSaving(true);
    const { data, error } = await createClient().from("recurring_expenses")
      .update({ amount, amount_max: null, tipologia: "fissa" }).eq("id", target.id).select("*").single();
    setSaving(false);
    if (error) { toast.error(errorText(error.message)); return; }
    setItems(prev => prev.map(it => it.id === target.id ? data as FixedItem : it));
    toast.success(`"${target.name}" ora prevede ${formatEuro(amount)}`);
  }

  if (!hasPrice(tariff)) {
    return (
      <div className={card}>
        <h2 className="font-semibold">Stima di {MONTHS_LONG[month - 1]}</h2>
        <p className="text-sm text-muted-foreground">
          Per la stima servono i prezzi del tuo fornitore: carica una bolletta o il contratto qui sotto, oppure scrivili nella tariffa.
        </p>
      </div>
    );
  }
  if (!estimate) {
    return (
      <div className={card}>
        <h2 className="font-semibold">Stima di {MONTHS_LONG[month - 1]}</h2>
        <p className="text-sm text-muted-foreground">
          Mancano i consumi: scrivi quelli di {MONTHS_LONG[month - 1]} degli anni passati (li trovi nelle vecchie bollette), più in basso.
        </p>
      </div>
    );
  }

  const b = estimate.bill;
  const line = (label: string, value: number) => (
    <div className="flex justify-between gap-3"><span className="text-muted-foreground">{label}</span><span className="tabular-nums">{formatEuro(value)}</span></div>
  );

  return (
    <div className={card}>
      <div className="flex flex-col gap-1">
        <span className="text-xs uppercase tracking-wider text-muted-foreground">Stima di {MONTHS_LONG[month - 1]}</span>
        <span className="text-3xl font-bold tabular-nums">≈ {formatEuro(b.total)}</span>
        <span className="text-sm text-muted-foreground">{dec(b.consumption)} {unit} · {basisText(kind, estimate.forecast, month)}</span>
        {estimate.next && (
          <span className="text-sm">{MONTHS_LONG[nextMonth - 1].charAt(0).toUpperCase() + MONTHS_LONG[nextMonth - 1].slice(1)}: ≈ <strong>{formatEuro(estimate.next.total)}</strong></span>
        )}
      </div>

      <button onClick={() => setOpen(o => !o)} className="text-sm text-primary hover:underline self-start">
        {open ? "Nascondi il calcolo" : "Come è calcolata"}
      </button>
      {open && tariff && (
        <div className="rounded-lg border bg-muted/30 px-3 py-2 flex flex-col gap-1 text-sm">
          {line(`Energia: ${dec(b.consumption)} ${unit} × ${dec(tariff.unit_price, 4)} €`, b.energy)}
          {line(`Trasporto, oneri, accise: ${dec(b.consumption)} × ${dec(tariff.other_unit_costs, 4)} €`, b.other)}
          {line("Quote fisse del mese", b.fixed)}
          {line(`IVA ${dec(tariff.vat_pct)}%`, b.vat)}
          {b.tv > 0 && line("Canone RAI", b.tv)}
          <div className="flex justify-between gap-3 pt-1 border-t font-semibold"><span>Totale</span><span className="tabular-nums">{formatEuro(b.total)}</span></div>
        </div>
      )}

      {utenze.length > 0 ? (
        <div className="flex flex-col gap-2 pt-3 border-t">
          <span className="text-sm">Usa la stima nelle previsioni del mese:</span>
          {utenze.length > 1 && (
            <select value={target?.id ?? ""} onChange={e => setTargetId(e.target.value)} className={inputClass}>
              {utenze.map(it => <option key={it.id} value={it.id}>{it.name}</option>)}
            </select>
          )}
          {target && (
            <button onClick={updateFixed} disabled={saving}
              className="bg-primary text-primary-foreground rounded-xl px-4 py-2.5 text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors">
              {saving ? "…" : `Aggiorna "${target.name}" a ${formatEuro(amountFor(target))}`}
            </button>
          )}
          {target && both(target.name) && <p className="text-xs text-muted-foreground">Luce e gas insieme: somma delle due stime.</p>}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground pt-3 border-t">
          Aggiungi la bolletta tra le spese fisse (tipo Utenze) per usare questa stima nelle previsioni del mese.
        </p>
      )}
    </div>
  );
}

// ═══════════════════════════════ CARICA ═══════════════════════════════

function UploadCard({ premium, tariffs, saveTariff, saveReadings, onApplied }: {
  premium: boolean;
  tariffs: Partial<Record<UtilityKind, Tariff>>;
  saveTariff: (k: UtilityKind, t: Tariff) => Promise<boolean>;
  saveReadings: (k: UtilityKind, rows: Reading[]) => Promise<boolean>;
  onApplied: (k: UtilityKind) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [reading, setReading] = useState(false);
  const [found, setFound] = useState<ExtractedSupply[]>([]);
  const [applying, setApplying] = useState<number | null>(null);

  async function onFile(file: File) {
    setReading(true);
    setFound([]);
    try {
      let base64: string;
      let mediaType: "application/pdf" | "image/jpeg";
      if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) {
        if (file.size > 3_000_000) { toast.error("Il PDF è troppo grande (massimo 3 MB). Prova con una foto della pagina con i prezzi."); return; }
        base64 = await fileToBase64(file);
        mediaType = "application/pdf";
      } else {
        const prepared = await prepareImage(file);
        base64 = prepared.base64;
        mediaType = prepared.mediaType;
      }
      const res = await readUtilityDocument(base64, mediaType);
      if (res.error) toast.error(res.error);
      else setFound(res.supplies ?? []);
    } catch {
      toast.error("Non riesco ad aprire questo file. Usa un PDF o una foto.");
    } finally {
      setReading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function apply(s: ExtractedSupply, index: number) {
    setApplying(index);
    const base = tariffs[s.kind] ?? emptyTariff(s.kind);
    const t: Tariff = {
      supplier: s.supplier ?? base.supplier,
      unit_price: s.unit_price ?? base.unit_price,
      other_unit_costs: base.other_unit_costs,
      fixed_monthly: s.fixed_monthly ?? base.fixed_monthly,
      vat_pct: s.vat_pct ?? base.vat_pct,
      tv_fee_monthly: s.kind === "luce" ? (s.tv_fee_monthly ?? base.tv_fee_monthly) : 0,
    };
    // Con una bolletta vera si tarano gli altri costi, così la stima torna col totale pagato.
    if (s.bill && t.unit_price > 0) {
      const c = calibrateOtherCosts(s.kind, t, { total: s.bill.total, consumption: s.bill.consumption, firstMonth: +s.bill.from.slice(5, 7), months: s.bill.months });
      if (c) t.other_unit_costs = c.value;
    }
    const rows = [...s.history];
    if (s.bill) {
      for (const r of splitConsumption(s.bill.consumption, +s.bill.from.slice(0, 4), +s.bill.from.slice(5, 7), s.bill.months)) {
        if (!rows.some(x => x.year === r.year && x.month === r.month)) rows.push(r);
      }
    }
    const ok = (await saveTariff(s.kind, t)) && (rows.length === 0 || await saveReadings(s.kind, rows));
    setApplying(null);
    if (!ok) return;
    setFound(prev => prev.filter((_, i) => i !== index));
    onApplied(s.kind);
    toast.success(`${UTILITY[s.kind].label}: dati salvati${rows.length ? `, ${rows.length} mesi di consumi` : ""}.`);
  }

  return (
    <div className={card}>
      <div>
        <h2 className="font-semibold flex items-center gap-2">
          📄 Carica bolletta o contratto
          {!premium && <span className="text-[10px] font-semibold uppercase tracking-wide rounded bg-muted px-1.5 py-0.5 text-muted-foreground">🔒 Premium</span>}
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Flusso legge prezzi, quote fisse, consumi e storico dei consumi e li inserisce per te. PDF o foto.
        </p>
      </div>
      {premium ? (
        <>
          <input ref={inputRef} type="file" accept="application/pdf,image/*" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) void onFile(f); }} />
          <button onClick={() => inputRef.current?.click()} disabled={reading}
            className="rounded-xl border-2 border-dashed px-4 py-4 text-sm font-medium hover:bg-muted/40 disabled:opacity-60 transition-colors">
            {reading ? "Sto leggendo il file… (qualche secondo)" : "Scegli il file"}
          </button>
        </>
      ) : (
        <Link href="/dashboard/account" className="text-sm text-primary hover:underline">Passa a Premium per usarla →</Link>
      )}

      {found.map((s, i) => (
        <div key={i} className="rounded-xl border-2 border-primary/40 bg-primary/5 p-4 flex flex-col gap-2 text-sm">
          <p className="font-medium">{UTILITY[s.kind].icon} {UTILITY[s.kind].label}{s.supplier ? ` · ${s.supplier}` : ""}</p>
          <ul className="text-muted-foreground flex flex-col gap-0.5">
            <li>Prezzo: {s.unit_price !== null ? `${dec(s.unit_price, 4)} €/${UTILITY[s.kind].unit}` : "non trovato"}</li>
            <li>Quote fisse: {s.fixed_monthly !== null ? `${formatEuro(s.fixed_monthly)} al mese` : "non trovate"}</li>
            {s.vat_pct !== null && <li>IVA: {dec(s.vat_pct)}%</li>}
            {s.kind === "luce" && s.tv_fee_monthly !== null && <li>Canone RAI: {formatEuro(s.tv_fee_monthly)} al mese</li>}
            {s.bill && <li>Bolletta: {formatEuro(s.bill.total)} per {dec(s.bill.consumption)} {UTILITY[s.kind].unit} ({s.bill.months} {s.bill.months === 1 ? "mese" : "mesi"})</li>}
            {s.history.length > 0 && <li>Storico: {s.history.length} mesi di consumi</li>}
          </ul>
          <div className="flex gap-2 pt-1">
            <button onClick={() => apply(s, i)} disabled={applying !== null}
              className="bg-primary text-primary-foreground rounded-lg px-3 py-1.5 text-sm font-medium hover:bg-primary/90 disabled:opacity-50">
              {applying === i ? "…" : "Usa questi dati"}
            </button>
            <button onClick={() => setFound(prev => prev.filter((_, j) => j !== i))} className="text-sm text-muted-foreground px-2">Scarta</button>
          </div>
          {s.bill && <p className="text-xs text-muted-foreground">Con la bolletta Flusso tara gli altri costi, così la stima torna con quello che hai pagato.</p>}
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════ TARIFFA ═══════════════════════════════

function TariffCard({ kind, tariff, saveTariff }: {
  kind: UtilityKind; tariff?: Tariff;
  saveTariff: (k: UtilityKind, t: Tariff) => Promise<boolean>;
}) {
  const u = UTILITY[kind];
  const t = tariff ?? emptyTariff(kind);
  const show = (n: number) => (n ? String(n).replace(".", ",") : "");
  const [f, setF] = useState({
    supplier: t.supplier ?? "", price: show(t.unit_price), fixed: show(t.fixed_monthly),
    other: show(t.other_unit_costs), vat: show(t.vat_pct), tv: show(t.tv_fee_monthly),
  });
  const [saving, setSaving] = useState(false);
  const [cal, setCal] = useState({ open: false, total: "", consumption: "", month: new Date().getMonth() || 12, months: 2 });

  function read(): Tariff | null {
    const price = num(f.price), fixed = num(f.fixed || "0"), other = num(f.other || "0"), vat = num(f.vat || "0"), tv = num(f.tv || "0");
    if (price === null || price <= 0) { toast.error(`Scrivi il prezzo dell'energia in €/${u.unit}.`); return null; }
    if (price > u.priceRange[1]) { toast.error(`Il prezzo sembra troppo alto: scrivilo in euro per ${u.unit} (es. 0,13).`); return null; }
    if ([fixed, other, vat, tv].some(v => v === null || v < 0)) { toast.error("Controlla i numeri."); return null; }
    return { supplier: f.supplier.trim() || null, unit_price: price, other_unit_costs: other!, fixed_monthly: fixed!, vat_pct: vat!, tv_fee_monthly: kind === "luce" ? tv! : 0 };
  }

  async function save(next?: Tariff) {
    const value = next ?? read();
    if (!value) return;
    setSaving(true);
    const ok = await saveTariff(kind, value);
    setSaving(false);
    if (ok) toast.success("Tariffa salvata.");
  }

  async function calibrate() {
    const base = read();
    if (!base) return;
    const total = num(cal.total), consumption = num(cal.consumption);
    if (total === null || consumption === null) { toast.error("Scrivi il totale della bolletta e il consumo."); return; }
    const c = calibrateOtherCosts(kind, base, { total, consumption, firstMonth: cal.month, months: cal.months });
    if (!c) { toast.error("Controlla i numeri della bolletta."); return; }
    if (!c.ok) toast.warning("Con questi prezzi la bolletta verrebbe più alta di quella vera: controlla prezzo e quote fisse.");
    setF(prev => ({ ...prev, other: String(c.value).replace(".", ",") }));
    await save({ ...base, other_unit_costs: c.value });
    setCal(prev => ({ ...prev, open: false }));
  }

  const field = (label: string, keyName: keyof typeof f, placeholder: string, hint?: string) => (
    <label className="flex flex-col gap-1">
      <span className="text-sm font-medium">{label}</span>
      <input value={f[keyName]} onChange={e => setF(prev => ({ ...prev, [keyName]: e.target.value }))}
        inputMode={keyName === "supplier" ? "text" : "decimal"} placeholder={placeholder} className={inputClass} />
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </label>
  );

  return (
    <div className={card}>
      <div>
        <h2 className="font-semibold">La tua tariffa {u.label.toLowerCase()}</h2>
        <p className="text-sm text-muted-foreground mt-1">I numeri sono sul contratto o nella seconda pagina della bolletta. Tutti IVA esclusa.</p>
      </div>
      {field("Fornitore", "supplier", "es. Enel Energia")}
      <div className="grid grid-cols-2 gap-3">
        {field(`Prezzo €/${u.unit}`, "price", kind === "luce" ? "es. 0,13" : "es. 0,45")}
        {field("Quote fisse €/mese", "fixed", "es. 12")}
      </div>
      {field(`Altri costi €/${u.unit}`, "other", String(u.otherDefault).replace(".", ","),
        "Trasporto, oneri di sistema e accise. Se non li conosci lascia il valore medio e tara con una bolletta qui sotto.")}
      <div className="grid grid-cols-2 gap-3">
        {field("IVA %", "vat", "10")}
        {kind === "luce" && field("Canone RAI €/mese", "tv", "0", "Se lo paghi in bolletta (gennaio-ottobre)")}
      </div>
      <button onClick={() => save()} disabled={saving}
        className="bg-primary text-primary-foreground rounded-xl px-4 py-2.5 text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors">
        {saving ? "Salvataggio…" : "Salva la tariffa"}
      </button>

      <div className="pt-3 border-t flex flex-col gap-3">
        <button onClick={() => setCal(prev => ({ ...prev, open: !prev.open }))} className="text-sm text-primary hover:underline self-start">
          🎯 Tara con una bolletta vera
        </button>
        {cal.open && (
          <div className="flex flex-col gap-3">
            <p className="text-xs text-muted-foreground">Scrivi totale e consumo di una bolletta che hai pagato: Flusso calcola gli altri costi perché la stima torni.</p>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1"><span className="text-sm font-medium">Totale €</span>
                <input value={cal.total} onChange={e => setCal(p => ({ ...p, total: e.target.value }))} inputMode="decimal" placeholder="es. 98,40" className={inputClass} /></label>
              <label className="flex flex-col gap-1"><span className="text-sm font-medium">Consumo {u.unit}</span>
                <input value={cal.consumption} onChange={e => setCal(p => ({ ...p, consumption: e.target.value }))} inputMode="decimal" placeholder="es. 360" className={inputClass} /></label>
              <label className="flex flex-col gap-1"><span className="text-sm font-medium">Dal mese</span>
                <select value={cal.month} onChange={e => setCal(p => ({ ...p, month: +e.target.value }))} className={inputClass}>
                  {MONTHS_LONG.map((name, i) => <option key={i} value={i + 1}>{name}</option>)}
                </select></label>
              <label className="flex flex-col gap-1"><span className="text-sm font-medium">Mesi</span>
                <select value={cal.months} onChange={e => setCal(p => ({ ...p, months: +e.target.value }))} className={inputClass}>
                  {[1, 2, 3].map(n => <option key={n} value={n}>{n}</option>)}
                </select></label>
            </div>
            <button onClick={calibrate} className="rounded-xl border-2 border-primary px-4 py-2 text-sm font-medium hover:bg-primary/5 transition-colors">Tara e salva</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════ CONSUMI ═══════════════════════════════

function ReadingsCard({ kind, readings, saveReadings, thisYear }: {
  kind: UtilityKind; readings: Reading[]; thisYear: number;
  saveReadings: (k: UtilityKind, rows: Reading[], removed?: { year: number; month: number }[]) => Promise<boolean>;
}) {
  const u = UTILITY[kind];
  const [year, setYear] = useState(thisYear - 1);
  const valuesFor = (yr: number) => Object.fromEntries(
    MONTHS.map((_, i) => [i + 1, String(readings.find(r => r.year === yr && r.month === i + 1)?.consumption ?? "").replace(".", ",")]),
  ) as Record<number, string>;
  const [values, setValues] = useState<Record<number, string>>(() => valuesFor(thisYear - 1));
  const [saving, setSaving] = useState(false);
  const [split, setSplit] = useState({ open: false, year: thisYear, month: 1, months: 2, total: "" });

  function goYear(yr: number) {
    setYear(yr);
    setValues(valuesFor(yr));
  }

  async function save() {
    const rows: Reading[] = [];
    const removed: { year: number; month: number }[] = [];
    for (let month = 1; month <= 12; month++) {
      const text = values[month].trim();
      const had = readings.some(r => r.year === year && r.month === month);
      if (!text) { if (had) removed.push({ year, month }); continue; }
      const v = num(text);
      if (v === null || v < 0) { toast.error(`Controlla il consumo di ${MONTHS_LONG[month - 1]}.`); return; }
      rows.push({ year, month, consumption: v });
    }
    setSaving(true);
    const ok = await saveReadings(kind, rows, removed);
    setSaving(false);
    if (ok) toast.success(`Consumi del ${year} salvati.`);
  }

  async function saveSplit() {
    const total = num(split.total);
    if (total === null || total <= 0) { toast.error(`Scrivi il consumo della bolletta in ${u.unit}.`); return; }
    const rows = splitConsumption(total, split.year, split.month, split.months);
    const ok = await saveReadings(kind, rows);
    if (!ok) return;
    toast.success(`Diviso su ${split.months} mesi: ${Math.round(total / split.months)} ${u.unit} al mese.`);
    setSplit(prev => ({ ...prev, open: false, total: "" }));
    if (rows.some(r => r.year === year)) {
      setValues(prev => ({ ...prev, ...Object.fromEntries(rows.filter(r => r.year === year).map(r => [r.month, String(r.consumption).replace(".", ",")])) }));
    }
  }

  const years = [...new Set(readings.map(r => r.year))].sort();

  return (
    <div className={card}>
      <div>
        <h2 className="font-semibold">Consumi {u.label.toLowerCase()} ({u.unit})</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Più anni inserisci, più la stima è precisa. Li trovi nelle vecchie bollette, spesso nel grafico &quot;storico consumi&quot;.
        </p>
        {years.length > 0 && (
          <p className="text-xs text-muted-foreground mt-1">
            Inseriti: {years.map(yr => `${yr} (${readings.filter(r => r.year === yr).length} mesi)`).join(", ")}
          </p>
        )}
      </div>

      <div className="flex items-center justify-between">
        <button onClick={() => goYear(year - 1)} className="size-9 rounded-full border flex items-center justify-center hover:bg-muted/50" aria-label="Anno prima">‹</button>
        <span className="font-semibold tabular-nums">{year}</span>
        <button onClick={() => goYear(year + 1)} disabled={year >= thisYear} className="size-9 rounded-full border flex items-center justify-center hover:bg-muted/50 disabled:opacity-30" aria-label="Anno dopo">›</button>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {MONTHS.map((name, i) => (
          <label key={name} className="flex flex-col gap-0.5">
            <span className="text-xs text-muted-foreground capitalize">{name}</span>
            <input value={values[i + 1]} onChange={e => setValues(prev => ({ ...prev, [i + 1]: e.target.value }))}
              inputMode="decimal" placeholder={u.unit} className="border rounded-lg px-2 py-1.5 text-sm bg-background focus:outline-none focus:border-primary tabular-nums" />
          </label>
        ))}
      </div>
      <button onClick={save} disabled={saving}
        className="bg-primary text-primary-foreground rounded-xl px-4 py-2.5 text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors">
        {saving ? "Salvataggio…" : `Salva i consumi del ${year}`}
      </button>

      <div className="pt-3 border-t flex flex-col gap-3">
        <button onClick={() => setSplit(prev => ({ ...prev, open: !prev.open }))} className="text-sm text-primary hover:underline self-start">
          Hai una bolletta di due mesi? Dividila qui
        </button>
        {split.open && (
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1"><span className="text-sm font-medium">Dal mese</span>
              <select value={split.month} onChange={e => setSplit(p => ({ ...p, month: +e.target.value }))} className={inputClass}>
                {MONTHS_LONG.map((name, i) => <option key={i} value={i + 1}>{name}</option>)}
              </select></label>
            <label className="flex flex-col gap-1"><span className="text-sm font-medium">Anno</span>
              <input value={split.year} onChange={e => setSplit(p => ({ ...p, year: +e.target.value || p.year }))} inputMode="numeric" className={inputClass} /></label>
            <label className="flex flex-col gap-1"><span className="text-sm font-medium">Mesi</span>
              <select value={split.months} onChange={e => setSplit(p => ({ ...p, months: +e.target.value }))} className={inputClass}>
                {[2, 3, 4, 6].map(n => <option key={n} value={n}>{n}</option>)}
              </select></label>
            <label className="flex flex-col gap-1"><span className="text-sm font-medium">Consumo {u.unit}</span>
              <input value={split.total} onChange={e => setSplit(p => ({ ...p, total: e.target.value }))} inputMode="decimal" placeholder="es. 360" className={inputClass} /></label>
            <button onClick={saveSplit} className="col-span-2 rounded-xl border-2 border-primary px-4 py-2 text-sm font-medium hover:bg-primary/5 transition-colors">
              Dividi e salva
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
