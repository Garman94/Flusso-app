"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { formatEuro } from "@/lib/calculations";
import { parseAmount } from "@/lib/import-parse";
import { addDaysISO, todayISO } from "@/lib/dates";
import { track } from "@/lib/track";
import {
  FUEL, completeRefuel, fullToFull, fuelSummary, isFuelPurchase, monthlyComparison, refuelDistances, routineKm, sortRefuels,
  type FuelType, type Pause, type Refuel, type Routine,
} from "@/lib/fuel";

// Pianifica → "Auto e carburante" (migration 047): veicoli, rifornimenti (euro, litri, prezzo: due su tre),
// consumo da pieno a pieno, costo al km, tragitti abituali e pause, km "extra" mese per mese.
// I rifornimenti si possono partire dai movimenti dei distributori. Calcoli in lib/fuel.ts.

type Vehicle = { id: string; name: string; fuel_type: FuelType; plate: string | null };
type RefuelRow = Refuel & { vehicle_id: string; note: string | null };
type RoutineRow = Routine & { vehicle_id: string };
type PauseRow = Pause & { id: string; vehicle_id: string; note: string | null };
type BankTx = { id: string; date: string; amount: number; description: string };

const inputClass = "border-2 rounded-xl px-3 py-2.5 text-base bg-background focus:outline-none focus:border-primary transition-colors w-full";
const card = "rounded-2xl border p-5 flex flex-col gap-4";
const chip = (on: boolean) => `rounded-full border px-3 py-1.5 text-sm transition-colors ${on ? "border-primary bg-primary/10 text-foreground" : "hover:bg-muted"}`;
const primaryBtn = "bg-primary text-primary-foreground rounded-xl px-4 py-2.5 text-sm font-medium hover:bg-primary/90 disabled:opacity-50";
const WEEKDAYS = [
  { n: 1, short: "L", long: "lunedì" }, { n: 2, short: "M", long: "martedì" }, { n: 3, short: "M", long: "mercoledì" },
  { n: 4, short: "G", long: "giovedì" }, { n: 5, short: "V", long: "venerdì" }, { n: 6, short: "S", long: "sabato" }, { n: 7, short: "D", long: "domenica" },
];
const MONTHS_LONG = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];

const dec = (n: number, digits = 1) => n.toLocaleString("it-IT", { minimumFractionDigits: 0, maximumFractionDigits: digits, useGrouping: "always" });
const num = (s: string): number | null => { const v = parseAmount(s); return v !== null && v > 0 ? v : null; };
const dateIT = (iso: string) => new Date(iso + "T00:00:00").toLocaleDateString("it-IT", { day: "numeric", month: "short" });
const monthLabel = (ym: string) => { const [y, m] = ym.split("-").map(Number); return `${MONTHS_LONG[m - 1]} ${y}`; };

function errorText(message: string): string {
  if (message.includes("DEMO_READONLY")) return "Nella demo non si può salvare: registrati per usare i tuoi dati.";
  if (/relation .* does not exist|vehicle/.test(message)) return "Auto e carburante non è ancora attivo.";
  return `Errore: ${message}`;
}

function daysText(r: Routine): string {
  if (r.kind === "weekly") return `${dec(r.times_per_week ?? 0)} ${r.times_per_week === 1 ? "volta" : "volte"} a settimana`;
  const d = [...r.weekdays].sort();
  if (d.join() === "1,2,3,4,5") return "dal lunedì al venerdì";
  if (d.join() === "1,2,3,4,5,6") return "dal lunedì al sabato";
  if (d.length === 7) return "tutti i giorni";
  return d.map(n => WEEKDAYS[n - 1].long).join(", ");
}

const emptyRefuel = () => ({ date: todayISO(), amount: "", price: "", quantity: "", kmMode: "trip" as "trip" | "odometer", km: "", full: true, note: "", transaction_id: null as string | null });
const emptyRoutine = () => ({ name: "", km: "", roundTrip: true, kind: "days" as "days" | "weekly", weekdays: [1, 2, 3, 4, 5], times: "2" });

export function CarburantePanel({ userId, onBack }: { userId: string; onBack: () => void }) {
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [refuels, setRefuels] = useState<RefuelRow[]>([]);
  const [routines, setRoutines] = useState<RoutineRow[]>([]);
  const [pauses, setPauses] = useState<PauseRow[]>([]);
  const [bankTx, setBankTx] = useState<BankTx[]>([]);
  const [saving, setSaving] = useState(false);

  const [vehicleForm, setVehicleForm] = useState<{ name: string; fuel: FuelType } | null>(null);
  const [rf, setRf] = useState(emptyRefuel);
  const [routineForm, setRoutineForm] = useState<ReturnType<typeof emptyRoutine> | null>(null);
  const [pauseForm, setPauseForm] = useState<{ from: string; to: string; note: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const refuelFormRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const since = addDaysISO(todayISO(), -120);
      const [v, r, ro, p, tx] = await Promise.all([
        supabase.from("vehicles").select("id, name, fuel_type, plate").eq("archived", false).order("created_at"),
        supabase.from("vehicle_refuels").select("id, vehicle_id, date, amount, quantity, price, odometer_km, trip_km, full_tank, transaction_id, note"),
        supabase.from("vehicle_routines").select("id, vehicle_id, name, km, round_trip, kind, weekdays, times_per_week, start_date, end_date").order("created_at"),
        supabase.from("vehicle_pauses").select("id, vehicle_id, from_date, to_date, note").order("from_date", { ascending: false }),
        supabase.from("transactions").select("id, date, amount, description").lt("amount", 0).gte("date", since).order("date", { ascending: false }).limit(1000),
      ]);
      if (v.error || r.error || ro.error || p.error) { setUnavailable(true); setLoading(false); return; }
      const toNum = (x: unknown) => (x === null || x === undefined ? null : Number(x));
      setVehicles((v.data ?? []) as Vehicle[]);
      setSelectedId(v.data?.[0]?.id ?? null);
      setRefuels((r.data ?? []).map(x => ({
        ...x, amount: Number(x.amount), quantity: Number(x.quantity), price: Number(x.price),
        odometer_km: toNum(x.odometer_km), trip_km: toNum(x.trip_km),
      })) as RefuelRow[]);
      setRoutines((ro.data ?? []).map(x => ({ ...x, km: Number(x.km), times_per_week: toNum(x.times_per_week), weekdays: x.weekdays ?? [] })) as RoutineRow[]);
      setPauses((p.data ?? []) as PauseRow[]);
      setBankTx(((tx.data ?? []) as BankTx[]).map(t => ({ ...t, amount: Number(t.amount) })));
      setLoading(false);
    })();
  }, []);

  const vehicle = vehicles.find(v => v.id === selectedId) ?? null;
  const unit = vehicle ? FUEL[vehicle.fuel_type].unit : "l";
  const vRefuels = useMemo(() => sortRefuels(refuels.filter(r => r.vehicle_id === selectedId)), [refuels, selectedId]);
  const vRoutines = useMemo(() => routines.filter(r => r.vehicle_id === selectedId), [routines, selectedId]);
  const vPauses = useMemo(() => pauses.filter(p => p.vehicle_id === selectedId), [pauses, selectedId]);
  const summary = useMemo(() => fuelSummary(vRefuels), [vRefuels]);
  const windowsByEnd = useMemo(() => new Map(fullToFull(vRefuels).map(w => [w.endId, w])), [vRefuels]);
  const distances = useMemo(() => refuelDistances(vRefuels), [vRefuels]);
  const months = useMemo(() => monthlyComparison(vRefuels, vRoutines, vPauses).slice(0, 6), [vRefuels, vRoutines, vPauses]);
  const linked = useMemo(() => new Set(refuels.map(r => r.transaction_id).filter(Boolean)), [refuels]);
  const suggestions = useMemo(() => bankTx.filter(t => !linked.has(t.id) && isFuelPurchase(t.description ?? "")).slice(0, 5), [bankTx, linked]);

  const today = todayISO();
  const monthStart = today.slice(0, 8) + "01";
  const [yy, mm] = today.split("-").map(Number);
  const monthEnd = `${today.slice(0, 7)}-${String(new Date(Date.UTC(yy, mm, 0)).getUTCDate()).padStart(2, "0")}`;
  const routineThisMonth = useMemo(() => routineKm(vRoutines, vPauses, monthStart, monthEnd), [vRoutines, vPauses, monthStart, monthEnd]);

  // Anteprima del rifornimento mentre si scrive
  const filled = completeRefuel({ amount: num(rf.amount), quantity: num(rf.quantity), price: num(rf.price) });
  const previewKmPerUnit = filled && rf.full && rf.kmMode === "trip" && num(rf.km) ? num(rf.km)! / filled.quantity : null;

  // ── Scritture ──
  async function addVehicle() {
    if (!vehicleForm?.name.trim()) return;
    setSaving(true);
    const { data, error } = await createClient().from("vehicles")
      .insert({ user_id: userId, name: vehicleForm.name.trim(), fuel_type: vehicleForm.fuel })
      .select("id, name, fuel_type, plate").single();
    setSaving(false);
    if (error) { toast.error(errorText(error.message)); return; }
    setVehicles(prev => [...prev, data as Vehicle]);
    setSelectedId(data.id);
    setVehicleForm(null);
    void track("fuel_vehicle_added", { fuel: vehicleForm.fuel });
  }

  async function deleteVehicle() {
    if (!vehicle) return;
    const { error } = await createClient().from("vehicles").delete().eq("id", vehicle.id);
    if (error) { toast.error(errorText(error.message)); return; }
    const rest = vehicles.filter(v => v.id !== vehicle.id);
    setVehicles(rest);
    setRefuels(prev => prev.filter(r => r.vehicle_id !== vehicle.id));
    setRoutines(prev => prev.filter(r => r.vehicle_id !== vehicle.id));
    setPauses(prev => prev.filter(p => p.vehicle_id !== vehicle.id));
    setSelectedId(rest[0]?.id ?? null);
    setConfirmDelete(false);
    toast.success(`${vehicle.name} eliminato`);
  }

  function fromBankTx(t: BankTx) {
    setRf({ ...emptyRefuel(), date: t.date, amount: dec(Math.abs(t.amount), 2), transaction_id: t.id });
    setTimeout(() => refuelFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }

  async function addRefuel() {
    if (!vehicle) return;
    if (!filled) { toast.error("Scrivi almeno due tra euro, prezzo e litri."); return; }
    const km = num(rf.km);
    setSaving(true);
    const row = {
      user_id: userId, vehicle_id: vehicle.id, date: rf.date, ...filled,
      trip_km: rf.kmMode === "trip" ? km : null, odometer_km: rf.kmMode === "odometer" ? km : null,
      full_tank: rf.full, transaction_id: rf.transaction_id, note: rf.note.trim() || null,
    };
    const { data, error } = await createClient().from("vehicle_refuels").insert(row).select("id").single();
    setSaving(false);
    if (error) { toast.error(errorText(error.message)); return; }
    setRefuels(prev => [...prev, { ...row, id: data.id } as RefuelRow]);
    void track("fuel_refuel_added", { from_bank: !!rf.transaction_id, full: rf.full, km: rf.kmMode });
    setRf(emptyRefuel());
    toast.success("Rifornimento salvato");
  }

  async function deleteRefuel(id: string) {
    const { error } = await createClient().from("vehicle_refuels").delete().eq("id", id);
    if (error) { toast.error(errorText(error.message)); return; }
    setRefuels(prev => prev.filter(r => r.id !== id));
  }

  async function addRoutine() {
    if (!vehicle || !routineForm) return;
    const km = num(routineForm.km);
    const times = num(routineForm.times);
    if (!routineForm.name.trim() || !km) { toast.error("Scrivi nome e km del tragitto."); return; }
    if (routineForm.kind === "days" && !routineForm.weekdays.length) { toast.error("Scegli almeno un giorno."); return; }
    if (routineForm.kind === "weekly" && !times) { toast.error("Quante volte a settimana?"); return; }
    setSaving(true);
    const row = {
      user_id: userId, vehicle_id: vehicle.id, name: routineForm.name.trim(), km, round_trip: routineForm.roundTrip,
      kind: routineForm.kind, weekdays: routineForm.kind === "days" ? routineForm.weekdays : [],
      times_per_week: routineForm.kind === "weekly" ? times : null, start_date: null, end_date: null,
    };
    const { data, error } = await createClient().from("vehicle_routines").insert(row).select("id").single();
    setSaving(false);
    if (error) { toast.error(errorText(error.message)); return; }
    setRoutines(prev => [...prev, { ...row, id: data.id } as RoutineRow]);
    setRoutineForm(null);
    void track("fuel_routine_added", { kind: row.kind });
  }

  async function deleteRoutine(id: string) {
    const { error } = await createClient().from("vehicle_routines").delete().eq("id", id);
    if (error) { toast.error(errorText(error.message)); return; }
    setRoutines(prev => prev.filter(r => r.id !== id));
  }

  async function addPause() {
    if (!vehicle || !pauseForm?.from || !pauseForm.to) return;
    if (pauseForm.to < pauseForm.from) { toast.error("La fine viene prima dell'inizio."); return; }
    setSaving(true);
    const row = { user_id: userId, vehicle_id: vehicle.id, from_date: pauseForm.from, to_date: pauseForm.to, note: pauseForm.note.trim() || null };
    const { data, error } = await createClient().from("vehicle_pauses").insert(row).select("id").single();
    setSaving(false);
    if (error) { toast.error(errorText(error.message)); return; }
    setPauses(prev => [{ ...row, id: data.id } as PauseRow, ...prev]);
    setPauseForm(null);
  }

  async function deletePause(id: string) {
    const { error } = await createClient().from("vehicle_pauses").delete().eq("id", id);
    if (error) { toast.error(errorText(error.message)); return; }
    setPauses(prev => prev.filter(p => p.id !== id));
  }

  // ── Pezzi di interfaccia ──
  const header = (
    <>
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="text-sm text-muted-foreground hover:text-foreground transition-colors">← Indietro</button>
        <h1 className="text-xl font-bold">Auto e carburante</h1>
      </div>
      <p className="text-sm text-muted-foreground -mt-2">
        Quanto consuma, quanto ti costa ogni km e quanti km fai oltre ai tragitti di tutti i giorni.
      </p>
    </>
  );

  const vehicleFormCard = vehicleForm && (
    <div className={card}>
      <h2 className="font-semibold">{vehicles.length ? "Nuovo veicolo" : "Aggiungi la tua auto"}</h2>
      <input className={inputClass} placeholder="Nome, es. Corsa" value={vehicleForm.name} maxLength={60}
        onChange={e => setVehicleForm({ ...vehicleForm, name: e.target.value })} />
      <div className="flex flex-wrap gap-2">
        {(Object.keys(FUEL) as FuelType[]).map(f => (
          <button key={f} type="button" onClick={() => setVehicleForm({ ...vehicleForm, fuel: f })} className={chip(vehicleForm.fuel === f)}>
            {FUEL[f].label}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <button onClick={addVehicle} disabled={saving || !vehicleForm.name.trim()} className={primaryBtn}>Salva</button>
        {vehicles.length > 0 && <button onClick={() => setVehicleForm(null)} className="text-sm text-muted-foreground px-3">Annulla</button>}
      </div>
    </div>
  );

  if (loading) return <div className="flex flex-col gap-5 max-w-lg mx-auto w-full">{header}<p className="text-sm text-muted-foreground">Caricamento…</p></div>;
  if (unavailable) return <div className="flex flex-col gap-5 max-w-lg mx-auto w-full">{header}<p className="text-sm text-muted-foreground">Auto e carburante non è ancora attivo.</p></div>;
  if (!vehicles.length) {
    return (
      <div className="flex flex-col gap-5 max-w-lg mx-auto w-full">
        {header}
        {vehicleForm ? vehicleFormCard : (
          <div className={card}>
            <p className="text-sm text-muted-foreground">
              Aggiungi la tua auto: poi a ogni rifornimento scrivi euro, prezzo al litro e i km fatti. Flusso calcola consumo e costo al km,
              e trova da solo i rifornimenti tra i movimenti della banca.
            </p>
            <button onClick={() => setVehicleForm({ name: "", fuel: "diesel" })} className={primaryBtn}>🚗 Aggiungi la tua auto</button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 max-w-lg mx-auto w-full">
      {header}

      {/* Veicoli */}
      <div className="flex flex-wrap gap-2">
        {vehicles.map(v => (
          <button key={v.id} onClick={() => { setSelectedId(v.id); setConfirmDelete(false); }} className={chip(v.id === selectedId)}>
            {FUEL[v.fuel_type].icon} {v.name}
          </button>
        ))}
        {!vehicleForm && <button onClick={() => setVehicleForm({ name: "", fuel: "benzina" })} className={chip(false)}>+ Veicolo</button>}
      </div>
      {vehicleFormCard}

      {/* Riepilogo */}
      {vehicle && (
        <div className={card}>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-muted-foreground">Consumo medio</p>
              {summary.kmPerUnit ? (
                <>
                  <p className="text-2xl font-bold tabular-nums">{dec(summary.kmPerUnit)} km/{unit}</p>
                  <p className="text-xs text-muted-foreground">{dec(summary.per100!)} {unit}/100 km</p>
                </>
              ) : <p className="text-sm text-muted-foreground mt-1">Serve un pieno con i km fatti dal pieno precedente</p>}
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Costo al km</p>
              {summary.costPerKm ? (
                <>
                  <p className="text-2xl font-bold tabular-nums">{dec(summary.costPerKm * 100)} cent</p>
                  <p className="text-xs text-muted-foreground">{formatEuro(summary.costPerKm * 100)} ogni 100 km</p>
                </>
              ) : <p className="text-sm text-muted-foreground mt-1">Scrivi i km nei rifornimenti</p>}
            </div>
          </div>
          {summary.windows > 0 && (
            <p className="text-xs text-muted-foreground">
              Media da pieno a pieno su {dec(summary.km, 0)} km ({summary.windows} {summary.windows === 1 ? "pieno" : "pieni"}).
              {summary.windows === 1 ? " Dal prossimo pieno diventa più precisa." : ""}
            </p>
          )}
        </div>
      )}

      {/* Rifornimenti trovati nei movimenti */}
      {suggestions.length > 0 && (
        <div className={card}>
          <h2 className="font-semibold">Rifornimenti trovati nei movimenti</h2>
          <div className="flex flex-col divide-y">
            {suggestions.map(t => (
              <div key={t.id} className="flex items-center gap-3 py-2 text-sm">
                <span className="text-muted-foreground w-14 shrink-0">{dateIT(t.date)}</span>
                <span className="flex-1 min-w-0 truncate">{t.description}</span>
                <span className="tabular-nums shrink-0">{formatEuro(Math.abs(t.amount))}</span>
                <button onClick={() => fromBankTx(t)} className="text-primary text-sm font-medium shrink-0">Usa</button>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">Tocca «Usa»: data ed euro si compilano da soli, tu aggiungi prezzo e km. Il movimento resta una sola spesa.</p>
        </div>
      )}

      {/* Nuovo rifornimento */}
      {vehicle && (
        <div ref={refuelFormRef} className={`${card} scroll-mt-20`}>
          <h2 className="font-semibold">Nuovo rifornimento</h2>
          {rf.transaction_id && <p className="text-xs text-primary -mt-2">Dal movimento della banca</p>}
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-xs text-muted-foreground col-span-2">Data
              <input type="date" className={inputClass} value={rf.date} max={today} onChange={e => setRf({ ...rf, date: e.target.value })} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">Euro
              <input inputMode="decimal" className={inputClass} placeholder="35,65" value={rf.amount} onChange={e => setRf({ ...rf, amount: e.target.value })} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">Prezzo al {unit === "l" ? "litro" : unit}
              <input inputMode="decimal" className={inputClass} placeholder="2,26" value={rf.price} onChange={e => setRf({ ...rf, price: e.target.value })} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground col-span-2">{unit === "l" ? "Litri" : unit} (se non li sai li calcola Flusso)
              <input inputMode="decimal" className={inputClass} placeholder={filled ? dec(filled.quantity, 2) : ""} value={rf.quantity} onChange={e => setRf({ ...rf, quantity: e.target.value })} />
            </label>
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              <button type="button" onClick={() => setRf({ ...rf, kmMode: "trip" })} className={chip(rf.kmMode === "trip")}>Km fatti dall&apos;ultimo rifornimento</button>
              <button type="button" onClick={() => setRf({ ...rf, kmMode: "odometer" })} className={chip(rf.kmMode === "odometer")}>Contachilometri</button>
            </div>
            <input inputMode="numeric" className={inputClass} placeholder={rf.kmMode === "trip" ? "285" : "54.320"} value={rf.km} onChange={e => setRf({ ...rf, km: e.target.value })} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={rf.full} onChange={e => setRf({ ...rf, full: e.target.checked })} />
            Ho fatto il pieno
          </label>
          {filled && (
            <p className="text-sm text-muted-foreground">
              {dec(filled.quantity, 2)} {unit} a {dec(filled.price, 3)} €/{unit}
              {previewKmPerUnit ? ` · circa ${dec(previewKmPerUnit)} km/${unit}` : ""}
            </p>
          )}
          <div className="flex gap-2">
            <button onClick={addRefuel} disabled={saving || !filled} className={primaryBtn}>Salva rifornimento</button>
            {(rf.amount || rf.transaction_id) && <button onClick={() => setRf(emptyRefuel())} className="text-sm text-muted-foreground px-3">Svuota</button>}
          </div>
        </div>
      )}

      {/* Km abituali ed extra */}
      {vehicle && (
        <div className={card}>
          <h2 className="font-semibold">Km abituali ed extra</h2>
          {!vRoutines.length ? (
            <p className="text-sm text-muted-foreground">Aggiungi qui sotto i tragitti che fai sempre (lavoro, impegni fissi): Flusso ti dirà quanti km fai in più.</p>
          ) : (
            <p className="text-sm text-muted-foreground">
              A {MONTHS_LONG[Number(today.slice(5, 7)) - 1]} i tragitti abituali fanno circa <strong className="text-foreground">{dec(routineThisMonth.total, 0)} km</strong>
              {summary.costPerKm ? <> (≈ {formatEuro(routineThisMonth.total * summary.costPerKm)})</> : null}.
            </p>
          )}
          {months.length > 0 ? (
            <div className="flex flex-col divide-y text-sm">
              {months.map(m => (
                <div key={m.month} className="flex flex-col gap-0.5 py-2">
                  <div className="flex justify-between">
                    <span className="font-medium capitalize">{monthLabel(m.month)}</span>
                    <span className="tabular-nums">{dec(m.km, 0)} km</span>
                  </div>
                  {vRoutines.length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      abituali {dec(m.routineKm, 0)} km · <span className={m.extraKm > 0 ? "text-foreground font-medium" : ""}>extra {dec(m.extraKm, 0)} km</span>
                      {summary.costPerKm && m.extraKm > 0 ? ` ≈ ${formatEuro(m.extraKm * summary.costPerKm)}` : ""}
                    </p>
                  )}
                  {m.coveredDays < 28 && <p className="text-[11px] text-muted-foreground">su {m.coveredDays} giorni coperti dai rifornimenti</p>}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">I km di ogni mese si vedono dal secondo rifornimento: servono due date per sapere quando li hai fatti.</p>
          )}
        </div>
      )}

      {/* Tragitti abituali */}
      {vehicle && (
        <div className={card}>
          <h2 className="font-semibold">Tragitti abituali</h2>
          {vRoutines.map(r => (
            <div key={r.id} className="flex items-center gap-3 text-sm">
              <span className="flex-1 min-w-0">
                <span className="font-medium">{r.name}</span>
                <span className="block text-xs text-muted-foreground">
                  {dec(r.km)} km{r.round_trip ? " andata e ritorno" : ""} · {daysText(r)}
                </span>
              </span>
              <button onClick={() => deleteRoutine(r.id)} className="text-muted-foreground hover:text-destructive text-xs p-1" title="Togli">✕</button>
            </div>
          ))}
          {routineForm ? (
            <div className="flex flex-col gap-3 border-t pt-3">
              <input className={inputClass} placeholder="Nome, es. Lavoro" maxLength={60} value={routineForm.name} onChange={e => setRoutineForm({ ...routineForm, name: e.target.value })} />
              <div className="flex items-center gap-3">
                <input inputMode="decimal" className={inputClass} placeholder="Km di andata" value={routineForm.km} onChange={e => setRoutineForm({ ...routineForm, km: e.target.value })} />
                <label className="flex items-center gap-2 text-sm shrink-0">
                  <input type="checkbox" checked={routineForm.roundTrip} onChange={e => setRoutineForm({ ...routineForm, roundTrip: e.target.checked })} />
                  andata e ritorno
                </label>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => setRoutineForm({ ...routineForm, kind: "days" })} className={chip(routineForm.kind === "days")}>Giorni fissi</button>
                <button type="button" onClick={() => setRoutineForm({ ...routineForm, kind: "weekly" })} className={chip(routineForm.kind === "weekly")}>Volte a settimana</button>
              </div>
              {routineForm.kind === "days" ? (
                <div className="flex gap-1.5">
                  {WEEKDAYS.map(d => {
                    const on = routineForm.weekdays.includes(d.n);
                    return (
                      <button key={d.n} type="button" title={d.long}
                        onClick={() => setRoutineForm({ ...routineForm, weekdays: on ? routineForm.weekdays.filter(x => x !== d.n) : [...routineForm.weekdays, d.n] })}
                        className={`w-9 h-9 rounded-full border text-sm ${on ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"}`}>
                        {d.short}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <input inputMode="decimal" className={inputClass} placeholder="2" value={routineForm.times} onChange={e => setRoutineForm({ ...routineForm, times: e.target.value })} />
              )}
              <div className="flex gap-2">
                <button onClick={addRoutine} disabled={saving} className={primaryBtn}>Salva tragitto</button>
                <button onClick={() => setRoutineForm(null)} className="text-sm text-muted-foreground px-3">Annulla</button>
              </div>
            </div>
          ) : (
            <button onClick={() => setRoutineForm(emptyRoutine())} className="text-sm text-primary font-medium text-left">+ Aggiungi un tragitto</button>
          )}
        </div>
      )}

      {/* Pause */}
      {vehicle && (
        <div className={card}>
          <div>
            <h2 className="font-semibold">Pause</h2>
            <p className="text-xs text-muted-foreground">Ferie, malattia, smart working: in quei giorni i tragitti abituali non contano.</p>
          </div>
          {vPauses.map(p => (
            <div key={p.id} className="flex items-center gap-3 text-sm">
              <span className="flex-1">{dateIT(p.from_date)} → {dateIT(p.to_date)}{p.note ? <span className="text-muted-foreground"> · {p.note}</span> : null}</span>
              <button onClick={() => deletePause(p.id)} className="text-muted-foreground hover:text-destructive text-xs p-1" title="Togli">✕</button>
            </div>
          ))}
          {pauseForm ? (
            <div className="flex flex-col gap-3 border-t pt-3">
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1 text-xs text-muted-foreground">Dal
                  <input type="date" className={inputClass} value={pauseForm.from} onChange={e => setPauseForm({ ...pauseForm, from: e.target.value })} />
                </label>
                <label className="flex flex-col gap-1 text-xs text-muted-foreground">Al
                  <input type="date" className={inputClass} value={pauseForm.to} onChange={e => setPauseForm({ ...pauseForm, to: e.target.value })} />
                </label>
              </div>
              <input className={inputClass} placeholder="Nota, es. ferie" maxLength={100} value={pauseForm.note} onChange={e => setPauseForm({ ...pauseForm, note: e.target.value })} />
              <div className="flex gap-2">
                <button onClick={addPause} disabled={saving || !pauseForm.from || !pauseForm.to} className={primaryBtn}>Salva pausa</button>
                <button onClick={() => setPauseForm(null)} className="text-sm text-muted-foreground px-3">Annulla</button>
              </div>
            </div>
          ) : (
            <button onClick={() => setPauseForm({ from: today, to: today, note: "" })} className="text-sm text-primary font-medium text-left">+ Aggiungi una pausa</button>
          )}
        </div>
      )}

      {/* Storico rifornimenti */}
      {vRefuels.length > 0 && (
        <div className={card}>
          <h2 className="font-semibold">Rifornimenti</h2>
          <div className="flex flex-col divide-y text-sm">
            {[...vRefuels].reverse().map(r => {
              const i = vRefuels.indexOf(r);
              const km = distances[i];
              const w = windowsByEnd.get(r.id);
              return (
                <div key={r.id} className="flex items-start gap-3 py-2">
                  <span className="text-muted-foreground w-14 shrink-0">{dateIT(r.date)}</span>
                  <span className="flex-1 min-w-0">
                    <span className="tabular-nums">{formatEuro(r.amount)} · {dec(r.quantity, 2)} {unit} · {dec(r.price, 3)} €/{unit}</span>
                    <span className="block text-xs text-muted-foreground">
                      {km ? `${dec(km, 0)} km` : r.odometer_km ? `contachilometri ${dec(r.odometer_km, 0)}` : "km non indicati"}
                      {r.full_tank ? " · pieno" : " · parziale"}
                      {w ? ` · ${dec(w.kmPerUnit)} km/${unit}` : ""}
                    </span>
                  </span>
                  <button onClick={() => deleteRefuel(r.id)} className="text-muted-foreground hover:text-destructive text-xs p-1" title="Elimina">✕</button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Elimina veicolo */}
      {vehicle && (
        <div className="flex justify-center">
          {confirmDelete ? (
            <span className="flex items-center gap-2 text-sm">
              Eliminare {vehicle.name} con rifornimenti e tragitti?
              <button onClick={deleteVehicle} className="rounded px-2 py-1 bg-destructive text-white text-xs">Sì, elimina</button>
              <button onClick={() => setConfirmDelete(false)} className="text-xs text-muted-foreground">No</button>
            </span>
          ) : (
            <button onClick={() => setConfirmDelete(true)} className="text-xs text-muted-foreground hover:text-destructive">Elimina {vehicle.name}</button>
          )}
        </div>
      )}
    </div>
  );
}
