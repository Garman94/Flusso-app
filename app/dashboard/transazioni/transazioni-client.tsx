"use client";

import { useState } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { ImportExcelModal } from "./import-excel-modal";

type Category = { id: string; name: string; color: string; icon: string };
type Transaction = {
  id: string;
  date: string;
  amount: number;
  description: string;
  merchant: string | null;
  notes: string | null;
  category_id: string | null;
  source: string;
  categories: Category | null;
};

function formatEuro(n: number) {
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(n);
}

const FREE_LIMIT = 50;

type FilterType = "all" | "entrate" | "uscite" | "senza_cat";

type Props = {
  userId: string;
  plan: string;
  initialTransactions: Transaction[];
  initialUncategorized: Transaction[];
  categories: Category[];
  initialFilter?: FilterType;
};

export function TransazioniClient({ userId, plan, initialTransactions, initialUncategorized: _initialUncategorized, categories, initialFilter = "all" }: Props) {
  const [transactions, setTransactions] = useState(initialTransactions);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showGearMenu, setShowGearMenu] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [filter, setFilter] = useState<FilterType>(initialFilter);
  const [searchQuery, setSearchQuery] = useState("");

  // Form state
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const isFree = plan === "free";
  const monthCount = transactions.filter(t => {
    const d = new Date(t.date);
    const now = new Date();
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;
  const atLimit = isFree && monthCount >= FREE_LIMIT;

  async function handleAddTransaction(e: React.FormEvent) {
    e.preventDefault();
    if (!amount || !date) return;
    setSubmitting(true);

    const supabase = createClient();
    const numAmount = parseFloat(amount.replace(",", "."));

    const { data, error } = await supabase
      .from("transactions")
      .insert({
        user_id: userId,
        date,
        amount: numAmount,
        description: description.trim(),
        category_id: categoryId || null,
        notes: notes.trim() || null,
        source: "manual",
      })
      .select("*, categories(id, name, color, icon)")
      .single();

    if (error) {
      toast.error("Errore nel salvataggio. Riprova.");
    } else {
      setTransactions(prev => [data as Transaction, ...prev]);
      toast.success("Transazione aggiunta!");
      setShowForm(false);
      setAmount("");
      setDescription("");
      setCategoryId("");
      setNotes("");
    }
    setSubmitting(false);
  }

  async function handleDelete(id: string) {
    const supabase = createClient();
    const { error } = await supabase.from("transactions").delete().eq("id", id);
    if (error) {
      toast.error("Errore nella cancellazione.");
    } else {
      setTransactions(prev => prev.filter(t => t.id !== id));
      toast.success("Transazione eliminata.");
    }
  }

  async function handleCategoryChange(txId: string, newCategoryId: string) {
    const supabase = createClient();
    const { error } = await supabase
      .from("transactions")
      .update({ category_id: newCategoryId || null })
      .eq("id", txId);

    if (error) {
      toast.error("Errore nel salvataggio della categoria.");
      return;
    }

    const category = categories.find(c => c.id === newCategoryId) ?? null;
    setTransactions(prev =>
      prev.map(t =>
        t.id === txId ? { ...t, category_id: newCategoryId || null, categories: category } : t,
      ),
    );
  }

  const filtered = transactions.filter(t => {
    if (filter === "entrate" && Number(t.amount) <= 0) return false;
    if (filter === "uscite" && Number(t.amount) >= 0) return false;
    if (filter === "senza_cat" && t.category_id !== null && t.categories?.name?.toLowerCase() !== "altro") return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchesDesc = t.description.toLowerCase().includes(q);
      const matchesCat  = t.categories?.name?.toLowerCase().includes(q) ?? false;
      if (!matchesDesc && !matchesCat) return false;
    }
    return true;
  });

  function handleImported(count: number) {
    window.location.reload();
  }

  function enterEditMode(filterTo?: FilterType) {
    setShowGearMenu(false);
    setEditMode(true);
    if (filterTo) setFilter(filterTo);
  }

  function exitEditMode() {
    setEditMode(false);
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Choice modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-background border rounded-xl p-6 max-w-sm w-full mx-4 flex flex-col gap-4 shadow-xl">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-lg">Aggiungi movimenti</h2>
              <button onClick={() => setShowAddModal(false)} className="text-muted-foreground hover:text-foreground transition-colors text-xl leading-none">✕</button>
            </div>
            <p className="text-sm text-muted-foreground">Come vuoi aggiungere i movimenti?</p>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => { setShowAddModal(false); setShowForm(true); }}
                disabled={atLimit}
                title={atLimit ? `Limite ${FREE_LIMIT} transazioni/mese raggiunto.` : ""}
                className="flex flex-col items-center gap-3 border rounded-xl p-5 hover:border-primary hover:bg-primary/5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span className="text-3xl">✏️</span>
                <span className="text-sm font-medium">Manuale</span>
                <span className="text-xs text-muted-foreground text-center">Inserisci un singolo movimento</span>
              </button>
              <button
                onClick={() => { setShowAddModal(false); setShowImport(true); }}
                className="flex flex-col items-center gap-3 border rounded-xl p-5 hover:border-primary hover:bg-primary/5 transition-colors"
              >
                <span className="text-3xl">📊</span>
                <span className="text-sm font-medium">Excel / CSV</span>
                <span className="text-xs text-muted-foreground text-center">Importa estratto conto</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Excel import modal */}
      {showImport && (
        <ImportExcelModal
          userId={userId}
          categories={categories}
          onClose={() => setShowImport(false)}
          onImported={handleImported}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Transazioni</h1>
        <div className="flex items-center gap-2">
          {editMode ? (
            <button
              onClick={exitEditMode}
              className="text-sm bg-green-600 text-white rounded-md px-4 py-2 hover:bg-green-700 transition-colors font-medium"
            >
              ✓ Fatto
            </button>
          ) : (
            <>
              {/* Gear menu */}
              <div className="relative">
                <button
                  onClick={() => setShowGearMenu(v => !v)}
                  className="border rounded-md p-2 hover:bg-muted/50 transition-colors text-muted-foreground hover:text-foreground"
                  title="Impostazioni transazioni"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <circle cx="12" cy="12" r="3" />
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                  </svg>
                </button>
                {showGearMenu && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setShowGearMenu(false)} />
                    <div className="absolute right-0 top-full mt-1 z-20 bg-background border rounded-lg shadow-lg py-1 min-w-[240px]">
                      <button
                        onClick={() => enterEditMode("senza_cat")}
                        className="w-full text-left px-4 py-2.5 text-sm hover:bg-muted/50 transition-colors flex items-center gap-2"
                      >
                        <span>🏷️</span>
                        <span>Definisci categorie senza categoria</span>
                      </button>
                      <button
                        onClick={() => enterEditMode()}
                        className="w-full text-left px-4 py-2.5 text-sm hover:bg-muted/50 transition-colors flex items-center gap-2"
                      >
                        <span>✏️</span>
                        <span>Modifica tutte le categorie</span>
                      </button>
                    </div>
                  </>
                )}
              </div>

              <button
                onClick={() => setShowAddModal(true)}
                disabled={atLimit}
                title={atLimit ? `Limite ${FREE_LIMIT} transazioni/mese raggiunto. Passa a Premium.` : ""}
                className="text-sm bg-primary text-primary-foreground rounded-md px-4 py-2 hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                + Aggiungi
              </button>
            </>
          )}
        </div>
      </div>

      {atLimit && (
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 text-sm flex items-center justify-between gap-4">
          <span>Hai raggiunto il limite di {FREE_LIMIT} transazioni mensili del piano gratuito.</span>
          <a href="/pricing" className="text-primary font-medium hover:underline whitespace-nowrap">
            Passa a Premium
          </a>
        </div>
      )}

      {/* Banner edit mode attivo */}
      {editMode && (
        <div className="rounded-xl border border-primary/40 bg-primary/5 px-4 py-3 text-sm flex items-center justify-between gap-3">
          <p className="text-primary">
            <strong>Modalità modifica attiva</strong> — usa i dropdown per assegnare una categoria a ogni transazione.
          </p>
          <button onClick={exitEditMode} className="text-muted-foreground hover:text-foreground transition-colors text-xs shrink-0">
            ✕ Esci
          </button>
        </div>
      )}

      {/* Form aggiunta */}
      {showForm && (
        <form onSubmit={handleAddTransaction} className="rounded-xl border p-5 flex flex-col gap-4 bg-card">
          <h2 className="font-semibold">Nuova transazione</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">Data</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} required
                className="border rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">Importo (€)</label>
              <input type="text" value={amount} onChange={e => setAmount(e.target.value)}
                placeholder="-25.50 per uscita, +1500 per entrata" required
                className="border rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <label className="text-sm font-medium">Descrizione</label>
              <input type="text" value={description} onChange={e => setDescription(e.target.value)}
                placeholder="es. Esselunga, Stipendio, Bolletta luce..."
                className="border rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">Categoria</label>
              <select value={categoryId} onChange={e => setCategoryId(e.target.value)}
                className="border rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary">
                <option value="">— Nessuna categoria —</option>
                {categories.map(c => (
                  <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">Note (opzionale)</label>
              <input type="text" value={notes} onChange={e => setNotes(e.target.value)}
                placeholder="Note aggiuntive..."
                className="border rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
          </div>
          <div className="flex gap-3">
            <button type="submit" disabled={submitting}
              className="bg-primary text-primary-foreground rounded-md px-5 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors">
              {submitting ? "Salvataggio..." : "Salva"}
            </button>
            <button type="button" onClick={() => setShowForm(false)}
              className="border rounded-md px-5 py-2 text-sm hover:bg-muted/50 transition-colors">
              Annulla
            </button>
          </div>
        </form>
      )}

      {/* Filtri */}
      <div className="flex flex-col sm:flex-row gap-3">
        <input
          type="text"
          list="category-suggestions"
          placeholder="Cerca transazioni o categoria..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="border rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary flex-1"
        />
        <datalist id="category-suggestions">
          {categories.map(c => (
            <option key={c.id} value={c.name}>{c.icon} {c.name}</option>
          ))}
        </datalist>
        <div className="flex rounded-md border overflow-hidden text-sm">
          {(["all", "entrate", "uscite", "senza_cat"] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-4 py-2 transition-colors ${filter === f ? "bg-primary text-primary-foreground" : "hover:bg-muted/50"}`}>
              {f === "all" ? "Tutte" : f === "entrate" ? "Entrate" : f === "uscite" ? "Uscite" : "🏷️ Senza cat."}
            </button>
          ))}
        </div>
      </div>

      {/* Lista transazioni */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed p-10 flex flex-col items-center gap-3 text-center">
          <span className="text-4xl">🔍</span>
          <p className="text-muted-foreground text-sm">Nessuna transazione trovata.</p>
        </div>
      ) : (
        <div className="rounded-xl border overflow-hidden">
          {/* Mobile: card list */}
          <div className="sm:hidden flex flex-col divide-y">
            {filtered.map(t => (
              <div key={t.id} className="flex items-start justify-between px-4 py-3 hover:bg-muted/30 transition-colors gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-xl shrink-0">{t.categories?.icon ?? "📦"}</span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{t.description || "—"}</p>
                    {editMode ? (
                      <select
                        defaultValue={t.category_id ?? ""}
                        onChange={e => handleCategoryChange(t.id, e.target.value)}
                        className="mt-1 border rounded px-2 py-1 text-xs bg-background focus:outline-none focus:ring-1 focus:ring-primary w-full max-w-[180px]"
                      >
                        <option value="">— Nessuna —</option>
                        {categories.map(c => (
                          <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
                        ))}
                      </select>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        {new Date(t.date).toLocaleDateString("it-IT")}
                        {t.categories && <span> · {t.categories.name}</span>}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0 pt-0.5">
                  <span className={`text-sm font-semibold tabular-nums ${Number(t.amount) >= 0 ? "text-green-600 dark:text-green-400" : "text-red-500"}`}>
                    {Number(t.amount) >= 0 ? "+" : ""}{formatEuro(Number(t.amount))}
                  </span>
                  {!editMode && (
                    <button onClick={() => handleDelete(t.id)} className="text-muted-foreground hover:text-destructive transition-colors text-xs p-1">✕</button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Desktop: table */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left px-4 py-3 font-medium">Data</th>
                  <th className="text-left px-4 py-3 font-medium">Descrizione</th>
                  <th className="text-left px-4 py-3 font-medium">Categoria</th>
                  <th className="text-right px-4 py-3 font-medium">Importo</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(t => (
                  <tr key={t.id} className="border-b last:border-b-0 hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                      {new Date(t.date).toLocaleDateString("it-IT")}
                    </td>
                    <td className="px-4 py-3 max-w-[200px] truncate">{t.description || "—"}</td>
                    <td className="px-4 py-3">
                      {editMode ? (
                        <select
                          defaultValue={t.category_id ?? ""}
                          onChange={e => handleCategoryChange(t.id, e.target.value)}
                          className="border rounded px-2 py-1 text-xs bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                        >
                          <option value="">— Nessuna —</option>
                          {categories.map(c => (
                            <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
                          ))}
                        </select>
                      ) : t.categories ? (
                        <span className="inline-flex items-center gap-1 text-xs border rounded-full px-2 py-0.5">
                          {t.categories.icon} {t.categories.name}
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </td>
                    <td className={`px-4 py-3 text-right font-semibold whitespace-nowrap ${Number(t.amount) >= 0 ? "text-green-600 dark:text-green-400" : "text-red-500"}`}>
                      {Number(t.amount) >= 0 ? "+" : ""}{formatEuro(Number(t.amount))}
                    </td>
                    <td className="px-4 py-3">
                      {!editMode && (
                        <button onClick={() => handleDelete(t.id)}
                          className="text-muted-foreground hover:text-destructive transition-colors text-xs">
                          ✕
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
