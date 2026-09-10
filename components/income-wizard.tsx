"use client";

import { useState } from "react";
import type { IncomeInfo } from "@/lib/calculations";

const MONTHS = ["Gen","Feb","Mar","Apr","Mag","Giu","Lug","Ago","Set","Ott","Nov","Dic"];

const TYPE_CARDS: { key: NonNullable<IncomeInfo["income_type"]>; icon: string; label: string }[] = [
  { key: "employee", icon: "💼", label: "Dipendente (stipendio fisso)" },
  { key: "freelance", icon: "🔧", label: "Autonomo (reddito variabile)" },
  { key: "seasonal", icon: "🌿", label: "Stagionale" },
  { key: "none", icon: "🎓", label: "Studente / Nessun reddito" },
];

type Draft = {
  income_type: IncomeInfo["income_type"];
  monthly_income: string;
  income_frequency: NonNullable<IncomeInfo["income_frequency"]>;
  income_payday: string;
  income_variability: NonNullable<IncomeInfo["income_variability"]>;
  active_months: number[];
};

function toDraft(v?: Partial<IncomeInfo> | null): Draft {
  return {
    income_type: v?.income_type ?? null,
    monthly_income: v?.monthly_income != null ? String(v.monthly_income) : "",
    income_frequency: v?.income_frequency ?? "monthly",
    income_payday: v?.income_payday != null ? String(v.income_payday) : "",
    income_variability: v?.income_variability ?? "medium",
    active_months: v?.active_months ?? [],
  };
}

export function IncomeWizard({
  name,
  initial,
  onSave,
  onCancel,
}: {
  name: string;
  initial?: Partial<IncomeInfo> | null;
  onSave: (v: IncomeInfo) => void;
  onCancel: () => void;
}) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [d, setD] = useState<Draft>(toDraft(initial));

  const set = <K extends keyof Draft>(k: K, val: Draft[K]) => setD(prev => ({ ...prev, [k]: val }));

  function finish() {
    const amount = parseFloat(d.monthly_income.replace(",", "."));
    onSave({
      income_type: d.income_type,
      monthly_income: d.income_type && d.income_type !== "none" && !isNaN(amount) ? amount : null,
      income_frequency: d.income_type === "employee" ? d.income_frequency : null,
      income_payday: d.income_type === "employee" && d.income_payday ? parseInt(d.income_payday, 10) : null,
      income_variability: d.income_type === "freelance" ? d.income_variability : null,
      active_months: d.income_type === "seasonal" ? d.active_months : [],
    });
  }

  const canStep2 = d.income_type != null;
  const needsAmount = d.income_type === "employee" || d.income_type === "freelance" || d.income_type === "seasonal";
  const canFinish = !needsAmount || parseFloat(d.monthly_income.replace(",", ".")) > 0;

  return (
    <div className="rounded-lg border p-4 bg-muted/20 flex flex-col gap-4">
      {/* STEP 1 */}
      {step === 1 && (
        <>
          <p className="text-sm font-medium">Che tipo di reddito ha {name || "questa persona"}?</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {TYPE_CARDS.map(c => (
              <button
                key={c.key}
                type="button"
                onClick={() => set("income_type", c.key)}
                className={`flex items-center gap-2 rounded-lg border-2 p-3 text-left text-sm transition-all ${
                  d.income_type === c.key ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
                }`}
              >
                <span className="text-xl">{c.icon}</span>
                <span>{c.label}</span>
              </button>
            ))}
          </div>
          <div className="flex justify-between">
            <button type="button" onClick={onCancel} className="text-sm text-muted-foreground hover:text-foreground">Annulla</button>
            <button
              type="button"
              disabled={!canStep2}
              onClick={() => setStep(d.income_type === "none" ? 3 : 2)}
              className="bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-medium disabled:opacity-40"
            >
              Avanti
            </button>
          </div>
        </>
      )}

      {/* STEP 2 */}
      {step === 2 && (
        <>
          {d.income_type === "employee" && (
            <>
              <label className="text-sm font-medium">Quanto prende al mese? (netto)</label>
              <input inputMode="decimal" value={d.monthly_income} onChange={e => set("monthly_income", e.target.value)}
                placeholder="Es. 1800" className="border rounded-md px-3 py-2 text-sm bg-background" />
              <label className="text-sm font-medium">Ogni quanto viene pagato?</label>
              <div className="flex gap-2 flex-wrap">
                {(["monthly","biweekly","weekly"] as const).map(f => (
                  <button key={f} type="button" onClick={() => set("income_frequency", f)}
                    className={`px-3 py-1.5 rounded-full text-sm border ${d.income_frequency === f ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted/50"}`}>
                    {f === "monthly" ? "Mensile" : f === "biweekly" ? "Quindicinale" : "Settimanale"}
                  </button>
                ))}
              </div>
              <label className="text-sm font-medium">Che giorno arriva lo stipendio?</label>
              <input type="number" min={1} max={31} value={d.income_payday} onChange={e => set("income_payday", e.target.value)}
                placeholder="Es. 27" className="border rounded-md px-3 py-2 text-sm bg-background w-28" />
            </>
          )}

          {d.income_type === "freelance" && (
            <>
              <label className="text-sm font-medium">Qual è il reddito medio mensile?</label>
              <input inputMode="decimal" value={d.monthly_income} onChange={e => set("monthly_income", e.target.value)}
                placeholder="Es. 2200" className="border rounded-md px-3 py-2 text-sm bg-background" />
              <label className="text-sm font-medium">Quanto varia?</label>
              <div className="flex gap-2 flex-wrap">
                {([["low","Poco (±10%)"],["medium","Abbastanza (±30%)"],["high","Molto (±50%)"]] as const).map(([k, lbl]) => (
                  <button key={k} type="button" onClick={() => set("income_variability", k)}
                    className={`px-3 py-1.5 rounded-full text-sm border ${d.income_variability === k ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted/50"}`}>
                    {lbl}
                  </button>
                ))}
              </div>
            </>
          )}

          {d.income_type === "seasonal" && (
            <>
              <label className="text-sm font-medium">In quali mesi lavora?</label>
              <div className="grid grid-cols-6 gap-1.5">
                {MONTHS.map((m, i) => {
                  const mn = i + 1;
                  const on = d.active_months.includes(mn);
                  return (
                    <button key={m} type="button"
                      onClick={() => set("active_months", on ? d.active_months.filter(x => x !== mn) : [...d.active_months, mn])}
                      className={`py-1.5 rounded text-xs border ${on ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted/50"}`}>
                      {m}
                    </button>
                  );
                })}
              </div>
              <label className="text-sm font-medium">Reddito mensile nei mesi attivi?</label>
              <input inputMode="decimal" value={d.monthly_income} onChange={e => set("monthly_income", e.target.value)}
                placeholder="Es. 2500" className="border rounded-md px-3 py-2 text-sm bg-background" />
            </>
          )}

          <div className="flex justify-between">
            <button type="button" onClick={() => setStep(1)} className="text-sm text-muted-foreground hover:text-foreground">← Indietro</button>
            <button type="button" disabled={!canFinish} onClick={() => setStep(3)}
              className="bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-medium disabled:opacity-40">
              Avanti
            </button>
          </div>
        </>
      )}

      {/* STEP 3 */}
      {step === 3 && (
        <>
          <p className="text-sm font-medium">Riepilogo</p>
          <div className="text-sm text-muted-foreground flex flex-col gap-1">
            <span>Tipo: <strong className="text-foreground">{TYPE_CARDS.find(c => c.key === d.income_type)?.label}</strong></span>
            {d.income_type !== "none" && d.income_type != null && (
              <span>Reddito mensile: <strong className="text-foreground">€ {d.monthly_income || "0"}</strong></span>
            )}
            {d.income_type === "employee" && d.income_payday && <span>Giorno paga: <strong className="text-foreground">{d.income_payday}</strong></span>}
            {d.income_type === "seasonal" && (
              <span>Mesi attivi: <strong className="text-foreground">{d.active_months.sort((a,b)=>a-b).map(m => MONTHS[m-1]).join(", ") || "—"}</strong></span>
            )}
          </div>
          <div className="flex justify-between">
            <button type="button" onClick={() => setStep(d.income_type === "none" ? 1 : 2)} className="text-sm text-muted-foreground hover:text-foreground">← Indietro</button>
            <button type="button" onClick={finish} className="bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-medium">
              Salva
            </button>
          </div>
        </>
      )}
    </div>
  );
}
