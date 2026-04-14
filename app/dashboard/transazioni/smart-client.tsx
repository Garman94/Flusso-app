"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";

type Category = { id: string; name: string; color: string; icon: string };

type BudgetItem = {
  id: string;
  name: string;
  amount: number;
  frequency: "mensile" | "settimanale" | "annuale" | "una_tantum";
  category_id: string | null;
  categories?: Category | null;
};

type Transaction = { amount: number; date: string };

type Props = {
  userId: string;
  categories: Category[];
  transactions: Transaction[];
};

const FREQ_LABELS: Record<BudgetItem["frequency"], string> = {
  mensile:    "/ mese",
  settimanale: "/ sett.",
  annuale:    "/ anno",
  una_tantum: "una tantum",
};

function toMonthly(amount: number, freq: BudgetItem["frequency"]): number {
  if (freq === "mensile")     return amount;
  if (freq === "settimanale") return amount * (52 / 12);
  if (freq === "annuale")     return amount / 12;
  return 0; // una_tantum non conta nel mensile
}

function formatEuro(n: number) {
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(n);
}

const EMPTY_FORM = { name: "", amount: "", frequency: "mensile" as BudgetItem["frequency"], category_id: "" };

export function SmartClient({ userId, categories, transactions }: Props) {
  const [items, setItems] = useState<BudgetItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("budget_items")
      .select("*, categories(id, name, color, icon)")
      .eq("user_id", userId)
      .order("created_at", { ascending: true })
      .then(({ data }) => {
        setItems((data ?? []) as BudgetItem[]);
        setLoading(false);
      });
  }, [userId]);

  // ── Totale previsto mensile ───────────────────────────────────────────────
  const totalMonthly = items.reduce((s, it) => s + toMonthly(it.amount, it.frequency), 0);

  // ── Spesa reale media (ultimi 3 mesi) ────────────────────────────────────
  const now = new Date();
  const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1).toISOString().split("T")[0];
  const recentExpenses = transactions
    .filter(t => Number(t.amount) < 0 && t.date >= threeMonthsAgo)
    .reduce((s, t) => s + Math.abs(Number(t.amount)), 0);
  const avgMonthly = recentExpenses / 3;

  // ── Raggruppamento per categoria ─────────────────────────────────────────
  const byCategory = new Map<string, { label: string; icon: string; color: string; monthly: number }>();
  for (const it of items) {
    const m = toMonthly(it.amount, it.frequency);
    if (m === 0) continue;
    const key   = it.category_id ?? "__none__";
    const label = it.categories?.name  ?? "Senza categoria";
    const icon  = it.categories?.icon  ?? "📦";
    const color = it.categories?.color ?? "#94a3b8";
    const entry = byCategory.get(key);
    if (entry) entry.monthly += m;
    else byCategory.set(key, { label, icon, color, monthly: m });
  }
  const catList = Array.from(byCategory.values()).sort((a, b) => b.monthly - a.monthly);

  // ── CRUD ─────────────────────────────────────────────────────────────────
  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const amt = parseFloat(form.amount.replace(",", "."));
    if (!form.name.trim() || isNaN(amt) || amt <= 0) {
      toast.error("Inserisci nome e importo valido.");
      return;
    }
    setSaving(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("budget_items")
      .insert({
        user_id:     userId,
        name:        form.name.trim(),
        amount:      amt,
        frequency:   form.frequency,
        category_id: form.category_id || null,
      })
      .select("*, categories(id, name, color, icon)")
      .single();

    if (error) {
      toast.error("Errore nel salvataggio.");
    } else {
      setItems(prev => [...prev, data as BudgetItem]);
      setForm(EMPTY_FORM);
      setShowForm(false);
      toast.success("Voce aggiunta!");
    }
    setSaving(false);
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    const supabase = createClient();
    const { error } = await supabase.from("budget_items").delete().eq("id", id);
    if (error) {
      toast.error("Errore nella cancellazione.");
    } else {
      setItems(prev => prev.filter(it => it.id !== id));
    }
    setDeletingId(null);
  }

  const diff = avgMonthly - totalMonthly;
  const pct  = totalMonthly > 0 ? Math.min(100, (avgMonthly / totalMonthly) * 100) : 0;

  return (
    <div className="flex flex-col gap-6">

      {/* ── Riepilogo ── */}
      <div className="rounded-xl border p-5 flex flex-col gap-4">
        <h2 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">Previsione mensile</h2>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="flex flex-col gap-0.5">
            <span className="text-xs text-muted-foreground">Budget previsto</span>
            <span className="text-2xl font-bold tabular-nums">{formatEuro(totalMonthly)}</span>
            <span className="text-xs text-muted-foreground">/ mese</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-xs text-muted-foreground">Spesa reale media</span>
            <span className="text-2xl font-bold tabular-nums text-red-500">{formatEuro(avgMonthly)}</span>
            <span className="text-xs text-muted-foreground">ultimi 3 mesi</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-xs text-muted-foreground">
              {diff >= 0 ? "Spendi di più del budget" : "Spendi meno del budget"}
            </span>
            <span className={`text-2xl font-bold tabular-nums ${diff >= 0 ? "text-red-500" : "text-green-600 dark:text-green-400"}`}>
              {diff >= 0 ? "+" : ""}{formatEuro(diff)}
            </span>
            <span className="text-xs text-muted-foreground">differenza</span>
          </div>
        </div>

        {totalMonthly > 0 && (
          <div className="flex flex-col gap-1.5">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Reale vs Budget</span>
              <span>{pct.toFixed(0)}%</span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${pct > 100 ? "bg-red-500" : pct > 80 ? "bg-yellow-500" : "bg-green-500"}`}
                style={{ width: `${Math.min(pct, 100)}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* ── Breakdown per categoria ── */}
      {catList.length > 0 && totalMonthly > 0 && (
        <div className="rounded-xl border p-5 flex flex-col gap-3">
          <h2 className="font-semibold text-sm">Distribuzione budget</h2>
          {catList.map(c => (
            <div key={c.label} className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2">
                  <span>{c.icon}</span>
                  <span className="font-medium">{c.label}</span>
                </span>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground">{((c.monthly / totalMonthly) * 100).toFixed(0)}%</span>
                  <span className="font-semibold tabular-nums">{formatEuro(c.monthly)}</span>
                </div>
              </div>
              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${(c.monthly / totalMonthly) * 100}%`, backgroundColor: c.color }}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Lista voci ── */}
      <div className="rounded-xl border flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h2 className="font-semibold">Voci di budget</h2>
          <button
            onClick={() => setShowForm(v => !v)}
            className="text-sm bg-primary text-primary-foreground rounded-md px-4 py-2 hover:bg-primary/90 transition-colors"
          >
            {showForm ? "Annulla" : "+ Aggiungi voce"}
          </button>
        </div>

        {/* Form aggiunta */}
        {showForm && (
          <form onSubmit={handleAdd} className="border-b px-5 py-4 flex flex-col gap-4 bg-muted/20">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-muted-foreground">Nome voce</label>
                <input
                  type="text"
                  placeholder="es. Affitto, Netflix, Benzina…"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="border rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                  autoFocus
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-muted-foreground">Importo (€)</label>
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="0,00"
                  value={form.amount}
                  onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                  className="border rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-muted-foreground">Frequenza</label>
                <select
                  value={form.frequency}
                  onChange={e => setForm(f => ({ ...f, frequency: e.target.value as BudgetItem["frequency"] }))}
                  className="border rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="mensile">Mensile</option>
                  <option value="settimanale">Settimanale</option>
                  <option value="annuale">Annuale</option>
                  <option value="una_tantum">Una tantum</option>
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-muted-foreground">Categoria</label>
                <select
                  value={form.category_id}
                  onChange={e => setForm(f => ({ ...f, category_id: e.target.value }))}
                  className="border rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="">— Nessuna —</option>
                  {categories.map(c => (
                    <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={saving}
                className="text-sm bg-primary text-primary-foreground rounded-md px-5 py-2 hover:bg-primary/90 disabled:opacity-50 transition-colors font-medium"
              >
                {saving ? "Salvataggio…" : "Aggiungi"}
              </button>
            </div>
          </form>
        )}

        {/* Voci */}
        {loading ? (
          <div className="px-5 py-8 text-sm text-muted-foreground text-center animate-pulse">Caricamento…</div>
        ) : items.length === 0 ? (
          <div className="px-5 py-10 flex flex-col items-center gap-3 text-center">
            <span className="text-4xl">📋</span>
            <p className="text-sm text-muted-foreground max-w-xs">
              Nessuna voce ancora. Aggiungi le tue spese ricorrenti per prevedere il budget mensile.
            </p>
          </div>
        ) : (
          <div className="divide-y">
            {items.map(it => {
              const monthly = toMonthly(it.amount, it.frequency);
              return (
                <div key={it.id} className="flex items-center justify-between px-5 py-3 hover:bg-muted/30 transition-colors">
                  <div className="flex items-center gap-3">
                    <span className="text-xl">{it.categories?.icon ?? "📦"}</span>
                    <div className="flex flex-col">
                      <span className="text-sm font-medium">{it.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {it.categories?.name ?? "Senza categoria"} · {FREQ_LABELS[it.frequency]}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-sm font-semibold tabular-nums">{formatEuro(it.amount)}</p>
                      {it.frequency !== "mensile" && it.frequency !== "una_tantum" && (
                        <p className="text-xs text-muted-foreground tabular-nums">{formatEuro(monthly)}/mese</p>
                      )}
                      {it.frequency === "una_tantum" && (
                        <p className="text-xs text-muted-foreground">non ricorrente</p>
                      )}
                    </div>
                    <button
                      onClick={() => handleDelete(it.id)}
                      disabled={deletingId === it.id}
                      className="text-muted-foreground hover:text-red-500 transition-colors disabled:opacity-40 p-1"
                      title="Rimuovi"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                        <path d="M10 11v6M14 11v6" />
                        <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                      </svg>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
