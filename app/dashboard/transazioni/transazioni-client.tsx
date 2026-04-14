"use client";

import { useState } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { ImportExcelModal } from "./import-excel-modal";
import { ScreenshotModal } from "./screenshot-modal";
import { createCategoryRule, deleteCategoryRule } from "./actions";

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
type DisplayRule    = { id: string; find_text: string; replace_with: string };
type CategoryRule   = { id: string; value: string; category_id: string; categories: { name: string; icon: string; color: string } | null };

function formatEuro(n: number) {
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(n);
}

/** Applica le regole display alla descrizione: sostituisce il testo trovato col replacement, il resto rimane */
// Parole che segnalano fine del nome (comuni nelle causali bancarie italiane)
const NAME_STOP = new Set(["per", "causale", "data", "motivo", "rif", "riferimento", "cro", "iban", "bic", "swift", "id", "vs", "ns"]);

/**
 * Dal testo dopo il match estrae le parole iniziali che sembrano nome/cognome:
 * - solo lettere (e trattini), nessun numero
 * - si ferma alla prima parola-stop (per, causale, data…) o dopo max 3 parole
 * - capitalizza ogni parola (TIZIANO ROSSI → Tiziano Rossi)
 */
function extractName(after: string): string {
  const words = after.trim().split(/\s+/);
  const nameWords: string[] = [];
  for (const w of words) {
    if (!w) break;
    if (/[0-9:/\\.,]/.test(w)) break;                  // numeri o punteggiatura
    if (NAME_STOP.has(w.toLowerCase())) break;          // parola-stop
    nameWords.push(w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
    if (nameWords.length >= 3) break;
  }
  return nameWords.join(" ");
}

function applyDisplayRules(description: string, rules: DisplayRule[]): string {
  for (const rule of rules) {
    const idx = description.toLowerCase().indexOf(rule.find_text.toLowerCase());
    if (idx !== -1) {
      const after = description.slice(idx + rule.find_text.length).trim();
      const name  = extractName(after);
      return (rule.replace_with + (name ? " " + name : "")).trim();
    }
  }
  return description;
}

const FREE_LIMIT = 50;

type FilterType = "all" | "entrate" | "uscite" | "senza_cat";

type Props = {
  userId: string;
  plan: string;
  initialTransactions: Transaction[];
  initialUncategorized: Transaction[];
  initialDisplayRules: DisplayRule[];
  initialCategoryRules: CategoryRule[];
  categories: Category[];
  initialFilter?: FilterType;
};

export function TransazioniClient({ userId, plan, initialTransactions, initialUncategorized: _initialUncategorized, initialDisplayRules, initialCategoryRules, categories: initialCategories, initialFilter = "all" }: Props) {
  const [transactions, setTransactions] = useState(initialTransactions);
  const [categories, setCategories] = useState<Category[]>(initialCategories);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showCatForm, setShowCatForm] = useState(false);
  const [showScreenshot, setShowScreenshot] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [newCatIcon, setNewCatIcon] = useState("");
  const [newCatColor, setNewCatColor] = useState("#6366f1");
  const [savingCat, setSavingCat] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [filter, setFilter] = useState<FilterType>(initialFilter);
  const [displayRules, setDisplayRules] = useState<DisplayRule[]>(initialDisplayRules);
  const [newFind, setNewFind] = useState("");
  const [newReplace, setNewReplace] = useState("");
  const [savingRule, setSavingRule] = useState(false);

  const [categoryRules, setCategoryRules] = useState<CategoryRule[]>(initialCategoryRules);
  const [newCatKeyword, setNewCatKeyword] = useState("");
  const [newCatId, setNewCatId] = useState("");
  const [savingCatRule, setSavingCatRule] = useState(false);

  // Pannello regole unificato: null = chiuso, "display" | "categorie" = aperto sul tipo selezionato
  const [rulesPanel, setRulesPanel] = useState<null | "display" | "categorie">(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Navigazione mese/anno
  const _now = new Date();
  const [navYear, setNavYear]   = useState(_now.getFullYear());
  const [navMonth, setNavMonth] = useState(_now.getMonth()); // 0-indexed
  const [navView, setNavView]   = useState<"mese" | "anno">("mese");

  const isAtPresent = navView === "mese"
    ? navYear === _now.getFullYear() && navMonth === _now.getMonth()
    : navYear === _now.getFullYear();

  const navLabel = navView === "mese"
    ? new Date(navYear, navMonth, 1)
        .toLocaleDateString("it-IT", { month: "long", year: "numeric" })
        .replace(/^\w/, c => c.toUpperCase())
    : String(navYear);

  function goToPrev() {
    if (navView === "mese") {
      if (navMonth === 0) { setNavMonth(11); setNavYear(y => y - 1); }
      else setNavMonth(m => m - 1);
    } else {
      setNavYear(y => y - 1);
    }
  }

  function goToNext() {
    if (navView === "mese") {
      if (navMonth === 11) { setNavMonth(0); setNavYear(y => y + 1); }
      else setNavMonth(m => m + 1);
    } else {
      setNavYear(y => y + 1);
    }
  }

  // Form state
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [amount, setAmount] = useState("");
  const [txType, setTxType] = useState<"uscita" | "entrata" | "neutra">("uscita");
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
    const raw = Math.abs(parseFloat(amount.replace(",", ".")));
    const numAmount = txType === "entrata" ? raw : txType === "uscita" ? -raw : raw;

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
      setTxType("uscita");
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
    // Filtro data (navigazione mese/anno)
    const d = new Date(t.date + "T00:00:00");
    if (navView === "mese") {
      if (d.getFullYear() !== navYear || d.getMonth() !== navMonth) return false;
    } else {
      if (d.getFullYear() !== navYear) return false;
    }
    // Filtri tipo
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

  async function handleAddCategory(e: React.FormEvent) {
    e.preventDefault();
    if (!newCatName.trim()) return;
    setSavingCat(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("categories")
      .insert({ user_id: userId, name: newCatName.trim(), icon: newCatIcon.trim() || "📦", color: newCatColor })
      .select("id, name, color, icon")
      .single();
    if (error) {
      toast.error("Errore nel salvataggio della categoria.");
    } else {
      setCategories(prev => [...prev, data as Category].sort((a, b) => a.name.localeCompare(b.name)));
      toast.success(`Categoria "${data.name}" aggiunta!`);
      setNewCatName("");
      setNewCatIcon("");
      setNewCatColor("#6366f1");
      setShowCatForm(false);
    }
    setSavingCat(false);
  }

  function handleImported(_result: number | any[]) {
    window.location.reload();
  }

  async function handleSaveRule(e: React.FormEvent) {
    e.preventDefault();
    if (!newFind.trim() || !newReplace.trim()) return;
    setSavingRule(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("display_rules")
      .insert({ user_id: userId, find_text: newFind.trim(), replace_with: newReplace.trim() })
      .select("id, find_text, replace_with")
      .single();
    if (error) {
      toast.error("Errore nel salvataggio della regola.");
    } else {
      setDisplayRules(prev => [...prev, data as DisplayRule]);
      setNewFind("");
      setNewReplace("");
      toast.success("Regola salvata!");
    }
    setSavingRule(false);
  }

  async function handleDeleteRule(id: string) {
    const supabase = createClient();
    const { error } = await supabase.from("display_rules").delete().eq("id", id);
    if (error) {
      toast.error("Errore nella cancellazione.");
    } else {
      setDisplayRules(prev => prev.filter(r => r.id !== id));
    }
  }

  async function handleSaveCatRule(e: React.FormEvent) {
    e.preventDefault();
    if (!newCatKeyword.trim() || !newCatId) return;
    setSavingCatRule(true);
    const result = await createCategoryRule(newCatKeyword.trim(), newCatId);
    if (result.error) {
      toast.error(result.error);
    } else {
      const cat = categories.find(c => c.id === newCatId) ?? null;
      setCategoryRules(prev => [...prev, {
        id: crypto.randomUUID(),
        value: newCatKeyword.trim().toLowerCase(),
        category_id: newCatId,
        categories: cat,
      }]);
      // Aggiorna stato locale transazioni categorizzate dalla regola
      if ((result.affectedIds ?? []).length > 0) {
        setTransactions(prev => prev.map(t =>
          (result.affectedIds ?? []).includes(t.id)
            ? { ...t, category_id: newCatId, categories: cat }
            : t,
        ));
        toast.success(`Regola salvata e applicata a ${result.count} transazioni.`);
      } else {
        toast.success("Regola salvata.");
      }
      setNewCatKeyword("");
      setNewCatId("");
    }
    setSavingCatRule(false);
  }

  async function handleDeleteCatRule(id: string) {
    const result = await deleteCategoryRule(id);
    if (result.error) {
      toast.error("Errore nella cancellazione.");
    } else {
      setCategoryRules(prev => prev.filter(r => r.id !== id));
    }
  }

  function enterEditMode() {
    setEditMode(true);
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
              <h2 className="font-semibold text-lg">Aggiungi</h2>
              <button onClick={() => setShowAddModal(false)} className="text-muted-foreground hover:text-foreground transition-colors text-xl leading-none">✕</button>
            </div>
            <p className="text-sm text-muted-foreground">Cosa vuoi aggiungere?</p>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => { setShowAddModal(false); setShowForm(true); setRulesPanel(null); }}
                disabled={atLimit}
                title={atLimit ? `Limite ${FREE_LIMIT} transazioni/mese raggiunto.` : ""}
                className="flex flex-col items-center gap-3 border rounded-xl p-4 hover:border-primary hover:bg-primary/5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span className="text-3xl">✏️</span>
                <span className="text-sm font-medium">Manuale</span>
                <span className="text-xs text-muted-foreground text-center">Singolo movimento</span>
              </button>
              <button
                onClick={() => { setShowAddModal(false); setShowImport(true); setRulesPanel(null); }}
                className="flex flex-col items-center gap-3 border rounded-xl p-4 hover:border-primary hover:bg-primary/5 transition-colors"
              >
                <span className="text-3xl">📊</span>
                <span className="text-sm font-medium">Excel / CSV</span>
                <span className="text-xs text-muted-foreground text-center">Importa estratto conto</span>
              </button>
              <button
                onClick={() => { setShowAddModal(false); setShowScreenshot(true); setRulesPanel(null); }}
                className="flex flex-col items-center gap-3 border rounded-xl p-4 hover:border-primary hover:bg-primary/5 transition-colors"
              >
                <span className="text-3xl">📷</span>
                <span className="text-sm font-medium">Screenshot</span>
                <span className="text-xs text-muted-foreground text-center">Analisi AI dell'immagine</span>
              </button>
              <button
                onClick={() => { setShowAddModal(false); setShowCatForm(true); setRulesPanel(null); }}
                className="flex flex-col items-center gap-3 border rounded-xl p-4 hover:border-primary hover:bg-primary/5 transition-colors"
              >
                <span className="text-3xl">🏷️</span>
                <span className="text-sm font-medium">Categoria</span>
                <span className="text-xs text-muted-foreground text-center">Crea nuova categoria</span>
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

      {/* Screenshot import modal */}
      {showScreenshot && (
        <ScreenshotModal
          userId={userId}
          categories={categories}
          onClose={() => setShowScreenshot(false)}
          onImported={handleImported}
        />
      )}

      {/* Form nuova categoria */}
      {showCatForm && (
        <form onSubmit={handleAddCategory} className="rounded-xl border p-5 flex flex-col gap-4 bg-card">
          <h2 className="font-semibold">Nuova categoria</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="flex flex-col gap-1.5 sm:col-span-1">
              <label className="text-sm font-medium">Icona (emoji)</label>
              <input
                type="text"
                value={newCatIcon}
                onChange={e => setNewCatIcon(e.target.value)}
                placeholder="es. 🛒"
                className="border rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div className="flex flex-col gap-1.5 sm:col-span-1">
              <label className="text-sm font-medium">Nome</label>
              <input
                type="text"
                value={newCatName}
                onChange={e => setNewCatName(e.target.value)}
                placeholder="es. Supermercato"
                required
                className="border rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div className="flex flex-col gap-1.5 sm:col-span-1">
              <label className="text-sm font-medium">Colore</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={newCatColor}
                  onChange={e => setNewCatColor(e.target.value)}
                  className="h-9 w-14 rounded border cursor-pointer bg-background"
                />
                <span className="text-sm text-muted-foreground font-mono">{newCatColor}</span>
              </div>
            </div>
          </div>
          <div className="flex gap-3">
            <button type="submit" disabled={savingCat}
              className="bg-primary text-primary-foreground rounded-md px-5 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors">
              {savingCat ? "Salvataggio..." : "Salva"}
            </button>
            <button type="button" onClick={() => setShowCatForm(false)}
              className="border rounded-md px-5 py-2 text-sm hover:bg-muted/50 transition-colors">
              Annulla
            </button>
          </div>
        </form>
      )}

      {/* Navigazione mese / anno */}
      <div className="flex items-center justify-between gap-3 rounded-xl border px-4 py-3">
        <button
          onClick={goToPrev}
          className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded hover:bg-muted/50"
          aria-label="Periodo precedente"
        >
          ←
        </button>
        <span className="font-semibold text-sm tabular-nums flex-1 text-center">{navLabel}</span>
        <button
          onClick={goToNext}
          disabled={isAtPresent}
          className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded hover:bg-muted/50 disabled:opacity-30 disabled:cursor-default"
          aria-label="Periodo successivo"
        >
          →
        </button>
        <div className="flex rounded-md border overflow-hidden text-xs ml-2">
          <button
            onClick={() => setNavView("mese")}
            className={`px-3 py-1.5 transition-colors ${navView === "mese" ? "bg-primary text-primary-foreground" : "hover:bg-muted/50"}`}
          >
            Mese
          </button>
          <button
            onClick={() => setNavView("anno")}
            className={`px-3 py-1.5 transition-colors ${navView === "anno" ? "bg-primary text-primary-foreground" : "hover:bg-muted/50"}`}
          >
            Anno
          </button>
        </div>
      </div>

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
              <button
                onClick={() => setRulesPanel(v => v ? null : "display")}
                className={`text-sm border rounded-md px-4 py-2 transition-colors ${rulesPanel ? "bg-muted" : "hover:bg-muted/50"}`}
              >
                Regole
              </button>
              <button
                onClick={() => enterEditMode()}
                className="text-sm border rounded-md px-4 py-2 hover:bg-muted/50 transition-colors"
              >
                Modifica categorie
              </button>
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

      {/* Pannello regole unificato */}
      {rulesPanel && (
        <div className="rounded-xl border p-5 flex flex-col gap-4">
          {/* Header con selector tipo e chiudi */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex rounded-md border overflow-hidden text-xs">
              <button
                onClick={() => setRulesPanel("display")}
                className={`px-3 py-1.5 transition-colors ${rulesPanel === "display" ? "bg-primary text-primary-foreground" : "hover:bg-muted/50"}`}
              >
                Regole display
              </button>
              <button
                onClick={() => setRulesPanel("categorie")}
                className={`px-3 py-1.5 transition-colors ${rulesPanel === "categorie" ? "bg-primary text-primary-foreground" : "hover:bg-muted/50"}`}
              >
                Regole categorie
              </button>
            </div>
            <button onClick={() => setRulesPanel(null)} className="text-muted-foreground hover:text-foreground text-xs transition-colors">✕ Chiudi</button>
          </div>

          {/* Contenuto: Regole display */}
          {rulesPanel === "display" && (
            <>
              <p className="text-xs text-muted-foreground">
                Quando la descrizione contiene il testo cercato, viene sostituito con il testo breve — il resto della descrizione rimane visibile.
                <br />Es: <em>"Bonifico istantaneo da voi disposto a favore di"</em> → <em>"B.I. verso"</em> → mostra <em>"B.I. verso TIZIANO ROSSI"</em>
              </p>
              <form onSubmit={handleSaveRule} className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  value={newFind}
                  onChange={e => setNewFind(e.target.value)}
                  placeholder='Testo da cercare (es. "Bonifico istantaneo da voi disposto a favore di")'
                  className="border rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary flex-1"
                  required
                />
                <input
                  type="text"
                  value={newReplace}
                  onChange={e => setNewReplace(e.target.value)}
                  placeholder='Sostituisci con (es. "B.I. verso")'
                  className="border rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary flex-1"
                  required
                />
                <button
                  type="submit"
                  disabled={savingRule}
                  className="bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors whitespace-nowrap"
                >
                  {savingRule ? "..." : "+ Aggiungi"}
                </button>
              </form>
              {displayRules.length > 0 && (
                <div className="flex flex-col gap-2">
                  {displayRules.map(r => (
                    <div key={r.id} className="flex items-center gap-3 text-sm border rounded-lg px-3 py-2 bg-muted/20">
                      <span className="text-muted-foreground shrink-0">Contiene:</span>
                      <span className="font-mono text-xs truncate flex-1 min-w-0" title={r.find_text}>"{r.find_text}"</span>
                      <span className="text-muted-foreground shrink-0">→</span>
                      <span className="font-mono text-xs truncate flex-1 min-w-0" title={r.replace_with}>"{r.replace_with}"</span>
                      <button onClick={() => handleDeleteRule(r.id)} className="text-muted-foreground hover:text-destructive transition-colors shrink-0 text-xs">✕</button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* Contenuto: Regole categorie */}
          {rulesPanel === "categorie" && (
            <>
              <p className="text-xs text-muted-foreground">
                Se la descrizione contiene il testo indicato, la categoria viene assegnata automaticamente — sovrascrive anche le categorie importate da Excel.
              </p>
              <form onSubmit={handleSaveCatRule} className="flex flex-col sm:flex-row items-end gap-2">
                <div className="flex flex-col gap-1 flex-1">
                  <label className="text-xs text-muted-foreground font-medium">Se contiene</label>
                  <input
                    type="text"
                    value={newCatKeyword}
                    onChange={e => setNewCatKeyword(e.target.value)}
                    placeholder='es. "steam"'
                    className="border rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary w-full"
                    required
                  />
                </div>
                <span className="text-muted-foreground pb-2 hidden sm:block">→</span>
                <div className="flex flex-col gap-1 flex-1">
                  <label className="text-xs text-muted-foreground font-medium">Allora categoria</label>
                  <select
                    value={newCatId}
                    onChange={e => setNewCatId(e.target.value)}
                    className="border rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary w-full"
                    required
                  >
                    <option value="">— Seleziona —</option>
                    {categories.map(c => (
                      <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
                    ))}
                  </select>
                </div>
                <button
                  type="submit"
                  disabled={savingCatRule}
                  className="bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors whitespace-nowrap"
                >
                  {savingCatRule ? "..." : "+ Aggiungi"}
                </button>
              </form>
              {categoryRules.length > 0 && (
                <div className="flex flex-col gap-2">
                  {categoryRules.map(r => (
                    <div key={r.id} className="flex items-center gap-3 text-sm border rounded-lg px-3 py-2 bg-muted/20">
                      <span className="text-muted-foreground shrink-0">Contiene:</span>
                      <span className="font-mono text-xs truncate flex-1 min-w-0" title={r.value}>"{r.value}"</span>
                      <span className="text-muted-foreground shrink-0">→</span>
                      <span className="shrink-0 text-xs">
                        {r.categories?.icon} {r.categories?.name ?? r.category_id}
                      </span>
                      <button onClick={() => handleDeleteCatRule(r.id)} className="text-muted-foreground hover:text-destructive transition-colors shrink-0 text-xs">✕</button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Form aggiunta */}
      {showForm && (
        <form onSubmit={handleAddTransaction} className="rounded-xl border p-5 flex flex-col gap-4 bg-card">
          <h2 className="font-semibold">Nuova transazione</h2>
          {/* Toggle tipo */}
          <div className="flex rounded-md border overflow-hidden text-sm w-fit">
            {(["uscita", "entrata", "neutra"] as const).map(t => (
              <button
                key={t}
                type="button"
                onClick={() => setTxType(t)}
                className={`px-4 py-2 transition-colors capitalize ${
                  txType === t
                    ? t === "entrata"
                      ? "bg-green-600 text-white"
                      : t === "uscita"
                      ? "bg-red-500 text-white"
                      : "bg-muted text-foreground"
                    : "hover:bg-muted/50"
                }`}
              >
                {t === "entrata" ? "↑ Entrata" : t === "uscita" ? "↓ Uscita" : "↔ Neutra"}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">Data</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} required
                className="border rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">Importo (€)</label>
              <input type="text" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)}
                placeholder="es. 25.50" required
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
                    <p className="text-sm font-medium truncate">{applyDisplayRules(t.description, displayRules) || "—"}</p>
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
                    <td className="px-4 py-3 max-w-[200px] truncate">{applyDisplayRules(t.description, displayRules) || "—"}</td>
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
