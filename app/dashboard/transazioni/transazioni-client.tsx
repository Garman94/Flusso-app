"use client";

import { todayISO } from "@/lib/dates";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { askConfirm } from "@/components/confirm-dialog";
import { createClient } from "@/lib/supabase/client";
import { ImportExcelModal } from "./import-excel-modal";
import { ScreenshotModal } from "./screenshot-modal";
import { createCategoryRule, deleteCategoryRule } from "./actions";
import { FamilyTransfersBanner } from "./family-transfers-banner";
import { AutoCategorizeBanner } from "./auto-categorize-banner";
import type { DictionaryEntry } from "@/lib/categorize";
import { computePeriodRange, getCurrentPeriodAnchor } from "@/lib/period";
import { PageTour } from "@/components/tour/page-tour";
import { useDemoGuard } from "@/components/demo-context";
import { normalizeText, ruleKeyword } from "@/lib/categorize";
import { categoryLabel } from "@/lib/transaction-edit";
import type { EditableField } from "@/lib/transaction-edit";
import { TransactionSheet } from "./transaction-sheet";

export type Category = { id: string; name: string; color: string; icon: string };
export type FamilyMember = { id: string; name: string; color: string; is_owner?: boolean | null };
export type Transaction = {
  id: string;
  date: string;
  amount: number;
  description: string;
  merchant: string | null;
  notes: string | null;
  category_id: string | null;
  member_id: string | null;
  /** conto (migration 048) */
  account_id?: string | null;
  source: string;
  categories: Category | null;
  family_members: FamilyMember | null;
};
export type DisplayRule    = { id: string; find_text: string; replace_with: string };
export type CategoryRule   = { id: string; value: string; category_id: string; categories: { name: string; icon: string; color: string } | null };

function formatEuro(n: number) {
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", useGrouping: "always" }).format(n);
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

const EXCEL_FREE_LIMIT = 3;

type FilterType = "all" | "entrate" | "uscite" | "senza_cat";

type Props = {
  userId: string;
  plan: string;
  excelUploadsThisMonth: number;
  initialTransactions: Transaction[];
  initialUncategorized: Transaction[];
  initialDisplayRules: DisplayRule[];
  initialCategoryRules: CategoryRule[];
  categories: Category[];
  familyMembers?: FamilyMember[];
  /** dizionario condiviso dei negozi (migration 044) */
  dictionary?: DictionaryEntry[];
  /** conti (migration 048) */
  accounts?: { id: string; name: string; member_id: string | null; bank_ref?: string | null; anchor_date?: string | null }[];
  powerUser?: boolean;
  initialFilter?: FilterType;
  payDay?: number;
  periodYear?: number;
  periodMonth?: number;
};

export function TransazioniClient({ userId, plan, excelUploadsThisMonth, initialTransactions, initialUncategorized: _initialUncategorized, initialDisplayRules, initialCategoryRules, categories: initialCategories, familyMembers = [], dictionary = [], accounts = [], powerUser = false, initialFilter = "all", payDay = 0, periodYear, periodMonth }: Props) {
  const demoGuard = useDemoGuard();
  const [showActionsMenu, setShowActionsMenu] = useState(false);
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
  // Movimento aperto nel pannello di modifica (tocco su una riga)
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [filter, setFilter] = useState<FilterType>(initialFilter);
  const listRef = useRef<HTMLDivElement>(null);
  const [displayRules, setDisplayRules] = useState<DisplayRule[]>(initialDisplayRules);
  const [newFind, setNewFind] = useState("");
  const [newReplace, setNewReplace] = useState("");
  const [savingRule, setSavingRule] = useState(false);

  const [categoryRules, setCategoryRules] = useState<CategoryRule[]>(initialCategoryRules);
  // Dopo aver scelto una categoria a mano: proposta di ricordarla per i movimenti simili
  // (prima serviva la "modalità smanettone" e le regole non valevano per gli import futuri).
  const [rememberPrompt, setRememberPrompt] = useState<{ keyword: string; categoryId: string; similar: number } | null>(null);
  const [savingRemember, setSavingRemember] = useState(false);
  const [newCatKeyword, setNewCatKeyword] = useState("");
  const [newCatId, setNewCatId] = useState("");
  const [savingCatRule, setSavingCatRule] = useState(false);

  // Pannello regole unificato: null = chiuso, "display" | "categorie" = aperto sul tipo selezionato
  const [rulesPanel, setRulesPanel] = useState<null | "display" | "categorie">(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Navigazione mese/anno
  const _now = new Date();
  const _anchor = getCurrentPeriodAnchor(payDay);
  const [navYear, setNavYear]   = useState(periodYear ?? _anchor.year);
  const [navMonth, setNavMonth] = useState(periodMonth ?? _anchor.month);
  const [navView, setNavView]   = useState<"mese" | "anno">("mese");

  const isAtPresent = navView === "mese"
    ? navYear === _anchor.year && navMonth === _anchor.month
    : navYear === _now.getFullYear();

  // For payDay > 0, show "27 mar – 26 apr 2026" instead of month name
  const navLabel = (() => {
    if (navView !== "mese") return String(navYear);
    if (payDay > 0) {
      const { from, to } = computePeriodRange(payDay, navYear, navMonth);
      const fromDate = new Date(from + "T00:00:00");
      const toDate   = new Date(to   + "T00:00:00");
      const f = fromDate.toLocaleDateString("it-IT", { day: "numeric", month: "short" });
      const t = toDate.toLocaleDateString("it-IT",   { day: "numeric", month: "short", year: "numeric" });
      return `${f} – ${t}`;
    }
    return new Date(navYear, navMonth, 1)
      .toLocaleDateString("it-IT", { month: "long", year: "numeric" })
      .replace(/^\w/, c => c.toUpperCase());
  })();

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
  const [date, setDate] = useState(todayISO());
  const [amount, setAmount] = useState("");
  const [txType, setTxType] = useState<"uscita" | "entrata" | "neutra">("uscita");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [excelUploadsCount, setExcelUploadsCount] = useState(excelUploadsThisMonth);
  const isFree = plan === "free";
  const canUploadExcel = !isFree || excelUploadsCount < EXCEL_FREE_LIMIT;

  // Arrivo dall'onboarding o dalla checklist: /dashboard/transazioni?import=1 apre subito l'import
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("import") !== "1") return;
    params.delete("import");
    const qs = params.toString();
    window.history.replaceState(null, "", window.location.pathname + (qs ? `?${qs}` : ""));
    if (canUploadExcel) setShowImport(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const canUploadScreenshot = !isFree;

  async function handleAddTransaction(e: React.FormEvent) {
    e.preventDefault();
    if (!amount || !date) return;
    if (demoGuard()) return;
    setSubmitting(true);

    const supabase = createClient();
    const raw = Math.abs(parseFloat(amount.replace(",", ".")));
    const numAmount = txType === "entrata" ? raw : txType === "uscita" ? -raw : raw;
    // Uno spostamento tra conti senza categoria va in "Spostamenti": così non conta tra entrate e uscite.
    const transferCategoryId = categories.find(c => normalizeText(c.name) === "spostamenti")?.id;

    const { data, error } = await supabase
      .from("transactions")
      .insert({
        user_id: userId,
        date,
        amount: numAmount,
        description: description.trim(),
        category_id: categoryId || (txType === "neutra" ? transferCategoryId : null) || null,
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

  /** Elimina un movimento (dal pannello di modifica). true se è stato eliminato. */
  async function handleDelete(id: string): Promise<boolean> {
    if (demoGuard()) return false;
    const tx = transactions.find(t => t.id === id);
    if (!(await askConfirm({
      title: "Eliminare questo movimento?",
      message: tx?.description ? `"${tx.description}"` : undefined,
      confirmLabel: "Elimina",
    }))) return false;
    const supabase = createClient();
    const { error } = await supabase.from("transactions").delete().eq("id", id);
    if (error) {
      toast.error("Errore nella cancellazione.");
      return false;
    }
    setTransactions(prev => prev.filter(t => t.id !== id));
    toast.success("Movimento eliminato.");
    return true;
  }

  /** Il pannello ha salvato: aggiorna la riga e, se è cambiata la categoria, propone "Ricorda". */
  function handleSheetSaved(updated: Transaction, changed: EditableField[]) {
    setTransactions(prev => prev.map(t => (t.id === updated.id ? { ...t, ...updated } : t)));
    setEditing(null);
    if (changed.includes("category_id") && updated.category_id) {
      proposeRemember(updated.id, updated.description, updated.category_id);
    }
  }

  /** Filtro "Senza cat." e scroll alla lista (banner "Categorizza") */
  function showUncategorized() {
    setFilter("senza_cat");
    setTimeout(() => listRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }

  // Movimento senza categoria: si sceglie sulla riga, senza passare dalla matita.
  // Passa da handleCategoryChange, quindi propone anche "Ricorda" per i movimenti simili.
  function pickCategory(t: Transaction, className = "") {
    return (
      <select
        defaultValue=""
        onClick={e => e.stopPropagation()}
        onChange={e => { if (e.target.value) handleCategoryChange(t.id, e.target.value); }}
        aria-label={`Scegli la categoria di ${t.description}`}
        className={`min-h-11 border border-amber-500/60 bg-amber-500/10 rounded-lg px-2 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500 ${className}`}
      >
        <option value="">🏷️ Scegli categoria…</option>
        {categories.map(c => (
          <option key={c.id} value={c.id}>{c.icon} {categoryLabel(c.name)}</option>
        ))}
      </select>
    );
  }

  async function handleCategoryChange(txId: string, newCategoryId: string) {
    if (demoGuard()) return;
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

    if (newCategoryId) {
      const tx = transactions.find(t => t.id === txId);
      if (tx) proposeRemember(txId, tx.description, newCategoryId);
    }
  }

  /** Dopo una categoria scelta a mano: "Vuoi che Flusso se lo ricordi?" per i movimenti simili. */
  function proposeRemember(txId: string, description: string | null, categoryId: string) {
    const kw = ruleKeyword(description ?? "");
    if (!kw) return;
    if (categoryRules.some(r => normalizeText(r.value) === normalizeText(kw))) return;
    const nkw = normalizeText(kw);
    const similar = transactions.filter(t => t.id !== txId && !t.category_id && normalizeText(t.description ?? "").includes(nkw)).length;
    setRememberPrompt({ keyword: kw, categoryId, similar });
  }

  async function handleRemember() {
    if (!rememberPrompt) return;
    if (demoGuard()) { setRememberPrompt(null); return; }
    const kw = rememberPrompt.keyword.trim();
    if (kw.length < 2) { toast.error("Scrivi almeno due lettere."); return; }
    setSavingRemember(true);
    const res = await createCategoryRule(kw, rememberPrompt.categoryId, { onlyUncategorized: true });
    setSavingRemember(false);
    if (res.error) { toast.error(res.error); return; }
    const cat = categories.find(c => c.id === rememberPrompt.categoryId) ?? null;
    setCategoryRules(prev => [...prev, { id: crypto.randomUUID(), value: kw.toLowerCase(), category_id: rememberPrompt.categoryId, categories: cat }]);
    const ids = res.affectedIds ?? [];
    if (ids.length) {
      setTransactions(prev => prev.map(t => ids.includes(t.id) ? { ...t, category_id: rememberPrompt.categoryId, categories: cat } : t));
    }
    toast.success(ids.length
      ? `Fatto: ${ids.length} ${ids.length === 1 ? "movimento categorizzato" : "movimenti categorizzati"}, e varrà per i prossimi import.`
      : "Fatto: varrà per i prossimi import.");
    setRememberPrompt(null);

  }

  // Compute date range once for filtering (avoids recomputing per transaction)
  const _periodRange = navView === "mese" && payDay > 0
    ? computePeriodRange(payDay, navYear, navMonth)
    : null;

  const filtered = transactions.filter(t => {
    // Filtro data (navigazione mese/anno) — saltato in modalità "senza categoria"
    // perché il contatore della dashboard include tutta la storia
    if (filter !== "senza_cat") {
      const d = new Date(t.date + "T00:00:00");
      if (navView === "mese") {
        if (_periodRange) {
          if (t.date < _periodRange.from || t.date > _periodRange.to) return false;
        } else {
          if (d.getFullYear() !== navYear || d.getMonth() !== navMonth) return false;
        }
      } else {
        if (d.getFullYear() !== navYear) return false;
      }
    }
    // Filtri tipo
    if (filter === "entrate" && Number(t.amount) <= 0) return false;
    if (filter === "uscite" && Number(t.amount) >= 0) return false;
    if (filter === "senza_cat" && t.category_id !== null && t.categories?.name?.toLowerCase() !== "altro") return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchesDesc = t.description.toLowerCase().includes(q);
      const matchesCat  = categoryLabel(t.categories?.name).toLowerCase().includes(q)
        || (t.categories?.name?.toLowerCase().includes(q) ?? false);
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

  function handleImported(_result: number | unknown[]) {
    window.location.reload();
  }

  function handleExcelImported(count: number) {
    setExcelUploadsCount((n) => n + 1);
    handleImported(count);
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
    const rule = displayRules.find(r => r.id === id);
    if (!(await askConfirm({ title: rule ? `Eliminare la regola "${rule.find_text}"?` : "Eliminare questa regola?" }))) return;
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
    const rule = categoryRules.find(r => r.id === id);
    if (!(await askConfirm({ title: rule ? `Eliminare la regola "${rule.value}"?` : "Eliminare questa regola?" }))) return;
    const result = await deleteCategoryRule(id);
    if (result.error) {
      toast.error("Errore nella cancellazione.");
    } else {
      setCategoryRules(prev => prev.filter(r => r.id !== id));
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageTour path="/dashboard/transazioni" />
      <FamilyTransfersBanner
        transactions={transactions}
        members={familyMembers}
        categories={categories}
        onApplied={(ids, categoryId) => {
          const cat = categories.find(c => c.id === categoryId) ?? null;
          setTransactions(prev => prev.map(t => ids.includes(t.id) ? { ...t, category_id: categoryId, categories: cat } : t));
        }}
      />
      <AutoCategorizeBanner
        uncategorized={transactions.filter(t => !t.category_id).length}
        categories={categories}
        onShow={showUncategorized}
        onAssigned={assigned => {
          const byId = new Map(assigned.map(a => [a.id, a.category_id]));
          setTransactions(prev => prev.map(t => {
            const categoryId = byId.get(t.id);
            if (!categoryId) return t;
            return { ...t, category_id: categoryId, categories: categories.find(c => c.id === categoryId) ?? null };
          }));
        }}
      />
      {/* Choice modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-background border rounded-xl p-6 max-w-sm w-full mx-4 flex flex-col gap-4 shadow-xl">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-lg">Aggiungi</h2>
              <button onClick={() => setShowAddModal(false)} aria-label="Chiudi" className="min-h-11 min-w-11 -mr-2 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors text-xl leading-none">✕</button>
            </div>
            <p className="text-sm text-muted-foreground">Cosa vuoi aggiungere?</p>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => { setShowAddModal(false); setShowForm(true); setRulesPanel(null); }}
                className="flex flex-col items-center gap-3 border rounded-xl p-4 hover:border-primary hover:bg-primary/5 transition-colors"
              >
                <span className="text-3xl">✏️</span>
                <span className="text-sm font-medium">Manuale</span>
                <span className="text-xs text-muted-foreground text-center">Singolo movimento</span>
              </button>
              <button
                onClick={() => { if (!canUploadExcel) return; setShowAddModal(false); setShowImport(true); setRulesPanel(null); }}
                disabled={!canUploadExcel}
                title={!canUploadExcel ? `Limite ${EXCEL_FREE_LIMIT} upload/mese raggiunto. Passa a Premium.` : ""}
                className="flex flex-col items-center gap-3 border rounded-xl p-4 hover:border-primary hover:bg-primary/5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span className="text-3xl">📊</span>
                <span className="text-sm font-medium">Excel / CSV</span>
                <span className="text-xs text-muted-foreground text-center">
                  {isFree
                    ? canUploadExcel
                      ? `${EXCEL_FREE_LIMIT - excelUploadsCount}/${EXCEL_FREE_LIMIT} rimasti`
                      : "Limite raggiunto"
                    : "Importa estratto conto"}
                </span>
              </button>
              <button
                onClick={() => { if (!canUploadScreenshot) return; setShowAddModal(false); setShowScreenshot(true); setRulesPanel(null); }}
                disabled={!canUploadScreenshot}
                title={!canUploadScreenshot ? "Disponibile con Premium o Founder." : ""}
                className="flex flex-col items-center gap-3 border rounded-xl p-4 hover:border-primary hover:bg-primary/5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span className="text-3xl">{canUploadScreenshot ? "📷" : "🔒"}</span>
                <span className="text-sm font-medium">Foto o PDF</span>
                <span className="text-xs text-muted-foreground text-center">
                  {canUploadScreenshot ? "L'AI legge foto e PDF" : "Piano Premium"}
                </span>
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
          familyMembers={familyMembers}
          userRules={categoryRules}
          dictionary={dictionary}
          accounts={accounts}
          onClose={() => setShowImport(false)}
          onImported={handleExcelImported}
        />
      )}

      {/* Screenshot import modal */}
      {showScreenshot && (
        <ScreenshotModal
          userId={userId}
          categories={categories}
          userRules={categoryRules}
          dictionary={dictionary}
          onClose={() => setShowScreenshot(false)}
          onImported={handleImported}
        />
      )}

      {/* Pannello di modifica del movimento */}
      {editing && (
        <TransactionSheet
          tx={editing}
          categories={categories}
          transactions={transactions}
          familyMembers={familyMembers}
          accounts={accounts}
          onClose={() => setEditing(null)}
          onSaved={handleSheetSaved}
          onDelete={handleDelete}
        />
      )}

      {/* Ricorda la categoria per i movimenti simili */}
      {rememberPrompt && (() => {
        const cat = categories.find(c => c.id === rememberPrompt.categoryId);
        return (
          <div className="fixed bottom-20 md:bottom-6 left-4 right-4 md:left-auto md:right-6 md:w-96 z-40 rounded-xl border bg-background shadow-xl p-4 flex flex-col gap-3 animate-in slide-in-from-bottom-4 duration-200">
            <p className="text-sm font-semibold">Vuoi che Flusso se lo ricordi?</p>
            <p className="text-xs text-muted-foreground">
              I movimenti che contengono questa parola andranno in <strong className="text-foreground">{cat?.icon} {categoryLabel(cat?.name)}</strong>, anche nei prossimi import.
              {rememberPrompt.similar > 0 && <> Vale subito anche per <strong className="text-foreground">{rememberPrompt.similar}</strong> {rememberPrompt.similar === 1 ? "movimento" : "movimenti"} ancora senza categoria.</>}
            </p>
            <input
              value={rememberPrompt.keyword}
              onChange={e => setRememberPrompt(p => p && { ...p, keyword: e.target.value })}
              className="min-h-11 border rounded-md px-3 text-base sm:text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary"
              aria-label="Parola da riconoscere"
            />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setRememberPrompt(null)} className="min-h-11 text-sm text-muted-foreground px-3 hover:text-foreground">No, grazie</button>
              <button
                onClick={handleRemember}
                disabled={savingRemember}
                className="min-h-11 text-sm bg-primary text-primary-foreground rounded-md px-4 hover:bg-primary/90 disabled:opacity-50"
              >
                {savingRemember ? "..." : "Sì, ricorda"}
              </button>
            </div>
          </div>
        );
      })()}

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
                className="min-h-11 border rounded-md px-3 text-base sm:text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary"
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
                className="min-h-11 border rounded-md px-3 text-base sm:text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div className="flex flex-col gap-1.5 sm:col-span-1">
              <label className="text-sm font-medium">Colore</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={newCatColor}
                  onChange={e => setNewCatColor(e.target.value)}
                  aria-label="Colore della categoria"
                  className="h-11 w-14 rounded border cursor-pointer bg-background"
                />
                <span className="text-sm text-muted-foreground font-mono">{newCatColor}</span>
              </div>
            </div>
          </div>
          <div className="flex gap-3">
            <button type="submit" disabled={savingCat}
              className="min-h-11 bg-primary text-primary-foreground rounded-md px-5 text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors">
              {savingCat ? "Salvataggio..." : "Salva"}
            </button>
            <button type="button" onClick={() => setShowCatForm(false)}
              className="min-h-11 border rounded-md px-5 text-sm hover:bg-muted/50 transition-colors">
              Annulla
            </button>
          </div>
        </form>
      )}

      {/* Navigazione mese / anno */}
      <div data-tour="tx-nav" className="flex items-center justify-between gap-1 sm:gap-3 rounded-xl border px-2 sm:px-4 py-1.5">
        <button
          onClick={goToPrev}
          className="min-h-11 min-w-11 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors rounded-lg hover:bg-muted/50"
          aria-label="Periodo precedente"
        >
          ←
        </button>
        <span className="font-semibold text-sm tabular-nums flex-1 text-center">{navLabel}</span>
        <button
          onClick={goToNext}
          disabled={isAtPresent}
          className="min-h-11 min-w-11 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors rounded-lg hover:bg-muted/50 disabled:opacity-30 disabled:cursor-default"
          aria-label="Periodo successivo"
        >
          →
        </button>
        <div className="flex rounded-md border overflow-hidden text-xs ml-1 sm:ml-2">
          <button
            onClick={() => setNavView("mese")}
            aria-pressed={navView === "mese"}
            className={`min-h-11 px-3 transition-colors ${navView === "mese" ? "bg-primary text-primary-foreground" : "hover:bg-muted/50"}`}
          >
            Mese
          </button>
          <button
            onClick={() => setNavView("anno")}
            aria-pressed={navView === "anno"}
            className={`min-h-11 px-3 transition-colors ${navView === "anno" ? "bg-primary text-primary-foreground" : "hover:bg-muted/50"}`}
          >
            Anno
          </button>
        </div>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Transazioni</h1>
        <div className="flex items-center gap-2">
          {/* Desktop: tutti i tasti in fila */}
          <div className="hidden sm:flex items-center gap-2">
            {powerUser && (
              <button
                onClick={() => setRulesPanel(v => v ? null : "display")}
                className={`min-h-11 text-sm border rounded-md px-4 transition-colors ${rulesPanel ? "bg-muted" : "hover:bg-muted/50"}`}
              >
                Regole
              </button>
            )}
            <button
              data-tour="tx-add"
              onClick={() => setShowAddModal(true)}
              className="min-h-11 text-sm bg-primary text-primary-foreground rounded-md px-4 hover:bg-primary/90 transition-colors"
            >
              + Aggiungi
            </button>
          </div>

          {/* Mobile: Aggiungi + menu (il menu solo per power user) */}
          <div className="flex sm:hidden items-center gap-2">
            <button
              onClick={() => setShowAddModal(true)}
              className="min-h-11 text-sm bg-primary text-primary-foreground rounded-md px-4 hover:bg-primary/90 transition-colors"
            >
              + Aggiungi
            </button>
            {powerUser && (
            <div className="relative">
              <button
                onClick={() => setShowActionsMenu(v => !v)}
                className={`min-h-11 min-w-11 flex items-center justify-center border rounded-md transition-colors ${showActionsMenu ? "bg-muted" : "hover:bg-muted/50"}`}
                aria-label="Altre azioni"
                aria-expanded={showActionsMenu}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                  <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
                </svg>
              </button>
              {showActionsMenu && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowActionsMenu(false)} />
                  <div className="absolute right-0 top-full mt-1 z-20 bg-background border rounded-xl shadow-lg py-1 w-48 flex flex-col">
                    <button
                      onClick={() => { setRulesPanel(v => v ? null : "display"); setShowActionsMenu(false); }}
                      className={`min-h-11 flex items-center gap-3 px-4 text-sm hover:bg-muted/50 transition-colors text-left ${rulesPanel ? "text-primary font-medium" : ""}`}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                        <path d="M11 20H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5" />
                        <path d="m15 14 2 2 4-4" />
                      </svg>
                      Regole
                    </button>
                  </div>
                </>
              )}
            </div>
            )}
          </div>
        </div>
      </div>

      {/* Pannello regole unificato */}
      {rulesPanel && (
        <div className="rounded-xl border p-5 flex flex-col gap-4">
          {/* Header con selector tipo e chiudi */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex rounded-md border overflow-hidden text-xs">
              <button
                onClick={() => setRulesPanel("display")}
                aria-pressed={rulesPanel === "display"}
                className={`min-h-11 px-3 transition-colors ${rulesPanel === "display" ? "bg-primary text-primary-foreground" : "hover:bg-muted/50"}`}
              >
                Regole display
              </button>
              <button
                onClick={() => setRulesPanel("categorie")}
                aria-pressed={rulesPanel === "categorie"}
                className={`min-h-11 px-3 transition-colors ${rulesPanel === "categorie" ? "bg-primary text-primary-foreground" : "hover:bg-muted/50"}`}
              >
                Regole categorie
              </button>
            </div>
            <button onClick={() => setRulesPanel(null)} className="min-h-11 px-2 text-muted-foreground hover:text-foreground text-xs transition-colors">✕ Chiudi</button>
          </div>

          {/* Contenuto: Regole display */}
          {rulesPanel === "display" && (
            <>
              <p className="text-xs text-muted-foreground">
                Quando la descrizione contiene il testo cercato, viene sostituito con il testo breve — il resto della descrizione rimane visibile.
                <br />Es: <em>&quot;Bonifico istantaneo da voi disposto a favore di&quot;</em> → <em>&quot;B.I. verso&quot;</em> → mostra <em>&quot;B.I. verso TIZIANO ROSSI&quot;</em>
              </p>
              <form onSubmit={handleSaveRule} className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  value={newFind}
                  onChange={e => setNewFind(e.target.value)}
                  placeholder='Testo da cercare (es. "Bonifico istantaneo da voi disposto a favore di")'
                  className="border rounded-md px-3 min-h-11 text-base sm:text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary flex-1"
                  required
                />
                <input
                  type="text"
                  value={newReplace}
                  onChange={e => setNewReplace(e.target.value)}
                  placeholder='Sostituisci con (es. "B.I. verso")'
                  className="border rounded-md px-3 min-h-11 text-base sm:text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary flex-1"
                  required
                />
                <button
                  type="submit"
                  disabled={savingRule}
                  className="bg-primary text-primary-foreground rounded-md px-4 min-h-11 text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors whitespace-nowrap"
                >
                  {savingRule ? "..." : "+ Aggiungi"}
                </button>
              </form>
              {displayRules.length > 0 && (
                <div className="flex flex-col gap-2">
                  {displayRules.map(r => (
                    <div key={r.id} className="flex items-center gap-3 text-sm border rounded-lg px-3 py-2 bg-muted/20">
                      <span className="text-muted-foreground shrink-0">Contiene:</span>
                      <span className="font-mono text-xs truncate flex-1 min-w-0" title={r.find_text}>&quot;{r.find_text}&quot;</span>
                      <span className="text-muted-foreground shrink-0">→</span>
                      <span className="font-mono text-xs truncate flex-1 min-w-0" title={r.replace_with}>&quot;{r.replace_with}&quot;</span>
                      <button type="button" onClick={() => handleDeleteRule(r.id)} aria-label="Elimina regola" className="text-muted-foreground hover:text-destructive transition-colors shrink-0 text-xs min-h-11 min-w-11 -my-2 -mr-2 flex items-center justify-center rounded-lg">✕</button>
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
                    className="border rounded-md px-3 min-h-11 text-base sm:text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary w-full"
                    required
                  />
                </div>
                <span className="text-muted-foreground pb-3 hidden sm:block" aria-hidden="true">→</span>
                <div className="flex flex-col gap-1 flex-1">
                  <label className="text-xs text-muted-foreground font-medium">Allora categoria</label>
                  <select
                    value={newCatId}
                    onChange={e => setNewCatId(e.target.value)}
                    className="border rounded-md px-3 min-h-11 text-base sm:text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary w-full"
                    required
                  >
                    <option value="">— Seleziona —</option>
                    {categories.map(c => (
                      <option key={c.id} value={c.id}>{c.icon} {categoryLabel(c.name)}</option>
                    ))}
                  </select>
                </div>
                <button
                  type="submit"
                  disabled={savingCatRule}
                  className="bg-primary text-primary-foreground rounded-md px-4 min-h-11 text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors whitespace-nowrap"
                >
                  {savingCatRule ? "..." : "+ Aggiungi"}
                </button>
              </form>
              {categoryRules.length > 0 && (
                <div className="flex flex-col gap-2">
                  {categoryRules.map(r => (
                    <div key={r.id} className="flex items-center gap-3 text-sm border rounded-lg px-3 py-2 bg-muted/20">
                      <span className="text-muted-foreground shrink-0">Contiene:</span>
                      <span className="font-mono text-xs truncate flex-1 min-w-0" title={r.value}>&quot;{r.value}&quot;</span>
                      <span className="text-muted-foreground shrink-0">→</span>
                      <span className="shrink-0 text-xs">
                        {r.categories?.icon} {r.categories?.name ? categoryLabel(r.categories.name) : r.category_id}
                      </span>
                      <button type="button" onClick={() => handleDeleteCatRule(r.id)} aria-label="Elimina regola" className="text-muted-foreground hover:text-destructive transition-colors shrink-0 text-xs min-h-11 min-w-11 -my-2 -mr-2 flex items-center justify-center rounded-lg">✕</button>
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
          <div className="flex flex-wrap rounded-md border overflow-hidden text-sm w-fit">
            {(["uscita", "entrata", "neutra"] as const).map(t => (
              <button
                key={t}
                type="button"
                onClick={() => setTxType(t)}
                aria-pressed={txType === t}
                className={`min-h-11 px-4 transition-colors ${
                  txType === t
                    ? t === "entrata"
                      ? "bg-green-600 text-white"
                      : t === "uscita"
                      ? "bg-red-500 text-white"
                      : "bg-muted text-foreground"
                    : "hover:bg-muted/50"
                }`}
              >
                {t === "entrata" ? "↑ Entrata" : t === "uscita" ? "↓ Uscita" : "↔ Spostamento tra conti"}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">Data</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} required
                className="border rounded-md px-3 min-h-11 text-base sm:text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">Importo (€)</label>
              <input type="text" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)}
                placeholder="es. 25.50" required
                className="border rounded-md px-3 min-h-11 text-base sm:text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <label className="text-sm font-medium">Descrizione</label>
              <input type="text" value={description} onChange={e => setDescription(e.target.value)}
                placeholder="es. Esselunga, Stipendio, Bolletta luce..."
                className="border rounded-md px-3 min-h-11 text-base sm:text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">Categoria</label>
              <select value={categoryId} onChange={e => setCategoryId(e.target.value)}
                className="border rounded-md px-3 min-h-11 text-base sm:text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary">
                <option value="">{txType === "neutra" ? `— ${categoryLabel("Spostamenti")} —` : "— Nessuna categoria —"}</option>
                {categories.map(c => (
                  <option key={c.id} value={c.id}>{c.icon} {categoryLabel(c.name)}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">Note (opzionale)</label>
              <input type="text" value={notes} onChange={e => setNotes(e.target.value)}
                placeholder="Note aggiuntive..."
                className="border rounded-md px-3 min-h-11 text-base sm:text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
          </div>
          <div className="flex gap-3">
            <button type="submit" disabled={submitting}
              className="bg-primary text-primary-foreground rounded-md px-5 min-h-11 text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors">
              {submitting ? "Salvataggio..." : "Salva"}
            </button>
            <button type="button" onClick={() => setShowForm(false)}
              className="border rounded-md px-5 min-h-11 text-sm hover:bg-muted/50 transition-colors">
              Annulla
            </button>
          </div>
        </form>
      )}

      {/* Filtri */}
      <div data-tour="tx-filters" className="flex flex-col sm:flex-row gap-3">
        <input
          type="text"
          list="category-suggestions"
          placeholder="Cerca transazioni o categoria..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          aria-label="Cerca movimenti o categoria"
          className="border rounded-md px-3 min-h-11 text-base sm:text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary flex-1"
        />
        <datalist id="category-suggestions">
          {categories.map(c => (
            <option key={c.id} value={categoryLabel(c.name)}>{c.icon} {categoryLabel(c.name)}</option>
          ))}
        </datalist>
        <div className="flex rounded-md border overflow-hidden text-sm">
          {(["all", "entrate", "uscite", "senza_cat"] as const).map(f => (
            <button key={f} type="button" onClick={() => setFilter(f)} aria-pressed={filter === f}
              className={`min-h-11 px-3 sm:px-4 flex-1 sm:flex-none transition-colors ${filter === f ? "bg-primary text-primary-foreground" : "hover:bg-muted/50"}`}>
              {f === "all" ? "Tutte" : f === "entrate" ? "Entrate" : f === "uscite" ? "Uscite" : "🏷️ Senza cat."}
            </button>
          ))}
        </div>
      </div>

      {/* Riepilogo voci visualizzate */}
      {filtered.length > 0 && (() => {
        // data-tour="tx-summary" è sull'elemento wrapper sotto
        const fIncome   = filtered.filter(t => Number(t.amount) > 0).reduce((s, t) => s + Number(t.amount), 0);
        const fExpenses = filtered.filter(t => Number(t.amount) < 0).reduce((s, t) => s + Math.abs(Number(t.amount)), 0);
        return (
          <div data-tour="tx-summary" className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
            <span className="text-muted-foreground">{filtered.length} {filtered.length === 1 ? "voce" : "voci"}</span>
            {fIncome > 0 && (
              <span className="flex items-center gap-1">
                <span className="text-green-600 dark:text-green-400 font-semibold">↑ {formatEuro(fIncome)}</span>
                <span>entrate</span>
              </span>
            )}
            {fExpenses > 0 && (
              <span className="flex items-center gap-1">
                <span className="text-red-500 font-semibold">↓ {formatEuro(fExpenses)}</span>
                <span>uscite</span>
              </span>
            )}
            {fIncome > 0 && fExpenses > 0 && (
              <span className="flex items-center gap-1 border-l pl-3">
                Ti restano <span className={`font-semibold ${fIncome - fExpenses >= 0 ? "text-green-600 dark:text-green-400" : "text-red-500"}`}>{formatEuro(fIncome - fExpenses)}</span>
                <span>(entrate − uscite)</span>
              </span>
            )}
          </div>
        );
      })()}

      {/* Lista transazioni */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed p-10 flex flex-col items-center gap-3 text-center">
          <span className="text-4xl">🔍</span>
          <p className="text-muted-foreground text-sm">Nessuna transazione trovata.</p>
        </div>
      ) : (
        <div ref={listRef} className="rounded-xl border overflow-hidden scroll-mt-20">
          {/* Mobile: card list */}
          <div className="sm:hidden flex flex-col divide-y">
            {filtered.map(t => {
              const desc = applyDisplayRules(t.description, displayRules) || "—";
              return (
                <div key={t.id} className={`flex flex-col hover:bg-muted/30 transition-colors ${!t.category_id ? "bg-amber-500/5 border-l-4 border-l-amber-500" : ""}`}>
                  <button
                    type="button"
                    onClick={() => setEditing(t)}
                    aria-label={`Modifica il movimento ${desc}`}
                    className="flex items-start justify-between gap-3 px-4 py-3 min-h-11 w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-xl shrink-0" aria-hidden="true">{t.categories?.icon ?? "📦"}</span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{desc}</p>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className="text-xs text-muted-foreground">
                            {new Date(t.date).toLocaleDateString("it-IT")}
                            {t.categories && <span> · {categoryLabel(t.categories.name)}</span>}
                          </p>
                          {t.family_members && (
                            <span
                              className="text-[10px] font-medium px-1.5 py-0.5 rounded-full whitespace-nowrap"
                              style={{ backgroundColor: t.family_members.color + "33", color: t.family_members.color }}
                            >
                              {t.family_members.name}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <span className={`text-sm font-semibold tabular-nums shrink-0 pt-0.5 ${Number(t.amount) >= 0 ? "text-green-600 dark:text-green-400" : "text-red-500"}`}>
                      {Number(t.amount) >= 0 ? "+" : ""}{formatEuro(Number(t.amount))}
                    </span>
                  </button>
                  {!t.category_id && (
                    <div className="px-4 pb-3 pl-[3.25rem] -mt-1">
                      {pickCategory(t, "w-full max-w-[220px]")}
                    </div>
                  )}
                </div>
              );
            })}
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
                </tr>
              </thead>
              <tbody>
                {filtered.map(t => {
                  const desc = applyDisplayRules(t.description, displayRules) || "—";
                  return (
                  <tr key={t.id} onClick={() => setEditing(t)} className={`border-b last:border-b-0 hover:bg-muted/30 transition-colors cursor-pointer ${!t.category_id ? "bg-amber-500/5" : ""}`}>
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                      {new Date(t.date).toLocaleDateString("it-IT")}
                    </td>
                    <td className="px-4 py-3 max-w-[260px]">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <button
                          type="button"
                          onClick={e => { e.stopPropagation(); setEditing(t); }}
                          aria-label={`Modifica il movimento ${desc}`}
                          className="truncate text-left hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
                        >
                          {desc}
                        </button>
                        {t.family_members && (
                          <span
                            className="text-[10px] font-medium px-1.5 py-0.5 rounded-full whitespace-nowrap shrink-0"
                            style={{ backgroundColor: t.family_members.color + "33", color: t.family_members.color }}
                          >
                            {t.family_members.name}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {t.categories ? (
                        <span className="inline-flex items-center gap-1 text-xs border rounded-full px-2 py-0.5">
                          {t.categories.icon} {categoryLabel(t.categories.name)}
                        </span>
                      ) : pickCategory(t)}
                    </td>
                    <td className={`px-4 py-3 text-right font-semibold whitespace-nowrap ${Number(t.amount) >= 0 ? "text-green-600 dark:text-green-400" : "text-red-500"}`}>
                      {Number(t.amount) >= 0 ? "+" : ""}{formatEuro(Number(t.amount))}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
