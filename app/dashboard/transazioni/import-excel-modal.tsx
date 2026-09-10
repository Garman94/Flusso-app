"use client";

import { useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { useDemoGuard } from "@/components/demo-context";
import {
  hashFile,
  classifyRows,
  type ClassifiedRow,
  type DedupSummary,
} from "@/lib/import-dedup";

type Category = { id: string; name: string; color: string; icon: string };
type FamilyMember = { id: string; name: string; color: string };

type ParsedRow = {
  date: string;
  amount: number;
  description: string;
  category_id: string | null;
};

type Props = {
  userId: string;
  categories: Category[];
  familyMembers?: FamilyMember[];
  ownerName?: string;
  onClose: () => void;
  onImported: (count: number) => void;
};

// ─── Bank category → our app category name ───────────────────────────────────
const BANK_CATEGORY_MAP: Record<string, string> = {
  "Generi alimentari e supermercato": "Alimentari",
  "Ristoranti e bar":                 "Ristoranti",
  "Carburanti":                       "Trasporti",
  "Manutenzione veicoli":             "Trasporti",
  "Pedaggi e Telepass":               "Trasporti",
  "Trasporti, noleggi, taxi e parcheggi": "Trasporti",
  "Treno, aereo, nave":               "Viaggi",
  "Farmacia":                         "Salute",
  "Cura della persona":               "Salute",
  "Abbigliamento e accessori":        "Abbigliamento",
  "Lavanderia e sartoria":            "Abbigliamento",
  "Spettacoli e musei":               "Intrattenimento",
  "Libri, film e musica":             "Intrattenimento",
  "Tempo libero varie":               "Intrattenimento",
  "Giochi e giocattoli":              "Hobby",
  "Corsi e sport":                    "Palestra",
  "Domiciliazioni e Utenze":          "Bollette",
  "Gas & energia elettrica":          "Bollette",
  "TV, Internet, telefono":           "Bollette",
  "Cellulare":                        "Bollette",
  "Polizze":                          "Assicurazioni",
  "Stipendi e pensioni":              "Stipendio",
  "Hi-tech e informatica":            "Tecnologia",
  "Elettrodomestici, arredamento e giardino": "Casa",
  "Casa varie":                       "Casa",
  "Manutenzione casa":                "Casa",
  "Affitti incassati":                "Casa",
  "Rate Mutuo e Finanziamento":       "Casa",
  "Istruzione":                       "Istruzione",
  "Trasferimenti":                    "Accantonamenti",
  "Giroconti":                        "Accantonamenti",
};

// ─── keyword fallback ─────────────────────────────────────────────────────────
const KEYWORD_MAP: Record<string, string[]> = {
  Alimentari:      ["esselunga","coop","lidl","aldi","carrefour","pam","conad","eurospin","penny","supermercato","despar","famila","tigros","bennet","iper"],
  Ristoranti:      ["ristorante","pizzeria","osteria","trattoria","bar ","caffè","caffe","mcdonald","burger","kebab","sushi","just eat","deliveroo","glovo"],
  Trasporti:       ["eni","q8","shell","tamoil","benzina","gasolio","autostrada","telepass","taxi","uber","atm ","trenitalia","italo","flixbus","parking","parcheggio"],
  Viaggi:          ["hotel","airbnb","booking","expedia","volo","aeroporto","hostel"],
  Salute:          ["farmacia","medico","dentista","ospedale","clinica","visita","esame"],
  Abbigliamento:   ["zara","h&m","primark","mango","nike","adidas","decathlon","zalando","asos"],
  Intrattenimento: ["netflix","spotify","disney","amazon prime","dazn","sky ","cinema","teatro"],
  Hobby:           ["steam","nintendo","playstation","xbox","gamestop","modellismo","hobby","bricolage","warhammer","subsonica","games workshop","citta del sole"],
  Tecnologia:      ["apple","amazon","mediaworld","unieuro","euronics","microsoft","google"],
  Istruzione:      ["università","udemy","coursera","mondadori","feltrinelli"],
  Palestra:        ["palestra","fitness","virgin active","mcfit","gym","crossfit","piscina"],
  Bollette:        ["enel","a2a","iren","hera","snam","eni gas","luce","gas ","acqua","bolletta","utenza"],
  Assicurazioni:   ["generali","allianz","unipol","assicurazione","polizza","rcauto"],
  Accantonamenti:  ["giroconto","accantonamento","bonifico risparmio","salvadanaio","conto deposito","fondo comune"],
  Stipendio:       ["stipendio","accredito stipendio","salary"],
};

function guessFromKeyword(description: string, categories: Category[]): string | null {
  const lower = description.toLowerCase();
  for (const [catName, keywords] of Object.entries(KEYWORD_MAP)) {
    if (keywords.some(k => lower.includes(k))) {
      const found = categories.find(c => c.name === catName);
      if (found) return found.id;
    }
  }
  return null;
}

function guessCategory(bankCat: string, description: string, categories: Category[]): string | null {
  const mapped = BANK_CATEGORY_MAP[bankCat.trim()];
  if (mapped) {
    const found = categories.find(c => c.name === mapped);
    if (found) return found.id;
  }
  return guessFromKeyword(description, categories);
}

// ─── bank detection ───────────────────────────────────────────────────────────
type BankFormat = "isybank" | "generic";

function detectBank(rows: unknown[][]): BankFormat {
  const flat = rows.slice(0, 15).map(r => (r as unknown[]).map(c => String(c)).join(" ").toLowerCase());
  if (flat.some(r => r.includes("movimenti selezionati") || r.includes("conti e carte"))) return "isybank";
  return "generic";
}

// ─── header detection ─────────────────────────────────────────────────────────
const DATE_HEADERS   = ["data","date","data operazione","data val","dt","giorno"];
const AMOUNT_HEADERS = ["importo","amount","importo eur","importo in euro","valore","dare/avere"];
const DESC_HEADERS   = ["operazione","descrizione","description","causale","dettaglio","movimento","wording","note"];
const CAT_HEADERS    = ["categoria","category","categoria "];

function detectCol(headers: string[], candidates: string[]): number {
  for (const h of candidates) {
    const idx = headers.findIndex(header => header.toLowerCase().trim().startsWith(h));
    if (idx !== -1) return idx;
  }
  return -1;
}

function parseDate(raw: unknown): string | null {
  if (!raw && raw !== 0) return null;
  if (typeof raw === "number") {
    const d = XLSX.SSF.parse_date_code(raw);
    if (d) return `${d.y}-${String(d.m).padStart(2,"0")}-${String(d.d).padStart(2,"0")}`;
  }
  const s = String(raw).trim();
  const it = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (it) return `${it[3]}-${it[2].padStart(2,"0")}-${it[1].padStart(2,"0")}`;
  const iso = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2,"0")}-${iso[3].padStart(2,"0")}`;
  return null;
}

function parseAmount(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const s = String(raw).replace(/\s/g, "").replace(/\.(?=\d{3})/g, "").replace(",", ".");
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

function formatEuro(n: number) {
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(n);
}

// ─── Component ────────────────────────────────────────────────────────────────
export function ImportExcelModal({ userId, categories, familyMembers = [], ownerName, onClose, onImported }: Props) {
  const hasMembers = familyMembers.length > 0;
  const demoGuard = useDemoGuard();

  const [step, setStep] = useState<"person" | "upload" | "preview">(hasMembers ? "person" : "upload");

  // Feature 1 — selezione persona
  const [personId, setPersonId] = useState<string | null>(null); // null = titolare
  const [personConfirmed, setPersonConfirmed] = useState(!hasMembers);

  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [classified, setClassified] = useState<ClassifiedRow<ParsedRow>[]>([]);
  const [summary, setSummary] = useState<DedupSummary>({ neu: 0, possible: 0, exact: 0 });
  const [manualReview, setManualReview] = useState(false);
  const [yellowKeep, setYellowKeep] = useState<Set<number>>(new Set());

  const [detectedBank, setDetectedBank] = useState<BankFormat | null>(null);
  const [importing, setImporting] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  // Feature 2 livello 1 — stesso file
  const [dupFile, setDupFile] = useState<{ date: string } | null>(null);
  const [parsing, setParsing] = useState(false);
  const pendingRef = useRef<{ rows: ParsedRow[]; hash: string; filename: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const personLabel = personId
    ? familyMembers.find(m => m.id === personId)?.name ?? "—"
    : (ownerName?.trim() || "Io");

  // ── Parsing ────────────────────────────────────────────────────────────────
  async function processFile(file: File) {
    setParsing(true);
    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(new Uint8Array(buffer), { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const json: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });

      if (json.length < 2) {
        toast.error("Il file sembra vuoto o non valido.");
        return;
      }

      const bank = detectBank(json);
      setDetectedBank(bank);

      let headerIdx = -1;
      for (let i = 0; i < Math.min(30, json.length); i++) {
        const row = (json[i] as unknown[]).map(c => String(c).toLowerCase().trim());
        const hasDate   = DATE_HEADERS.some(h => row.some(c => c.startsWith(h)));
        const hasAmount = AMOUNT_HEADERS.some(h => row.some(c => c.startsWith(h)));
        if (hasDate && hasAmount) { headerIdx = i; break; }
      }
      if (headerIdx === -1) {
        toast.error("Impossibile trovare la riga di intestazione. Servono le colonne 'Data' e 'Importo'.");
        return;
      }

      const headers = (json[headerIdx] as unknown[]).map(h => String(h));
      const dateCol   = detectCol(headers, DATE_HEADERS);
      const amountCol = detectCol(headers, AMOUNT_HEADERS);
      const descCol   = detectCol(headers, DESC_HEADERS);
      const catCol    = detectCol(headers, CAT_HEADERS);

      const parsed: ParsedRow[] = [];
      for (let i = headerIdx + 1; i < json.length; i++) {
        const row = json[i] as unknown[];
        const date   = parseDate(row[dateCol]);
        const amount = parseAmount(row[amountCol]);
        if (!date || amount === null) continue;
        const description = descCol !== -1 ? String(row[descCol] ?? "").trim() : "";
        const bankCat     = catCol  !== -1 ? String(row[catCol]  ?? "").trim() : "";
        parsed.push({ date, amount, description, category_id: guessCategory(bankCat, description, categories) });
      }

      if (parsed.length === 0) {
        toast.error("Nessuna riga valida trovata nel file.");
        return;
      }

      const hash = await hashFile(buffer);
      pendingRef.current = { rows: parsed, hash, filename: file.name };

      // Livello 1 — stesso file gia' caricato?
      const supabase = createClient();
      const { data: prev } = await supabase
        .from("import_logs")
        .select("imported_at")
        .eq("user_id", userId)
        .eq("file_hash", hash)
        .order("imported_at", { ascending: false })
        .limit(1);

      if (prev && prev.length > 0) {
        setDupFile({ date: prev[0].imported_at });
        return; // resta su "upload", mostra il warning
      }

      await goToPreview(parsed);
    } catch {
      toast.error("Errore nel leggere il file. Usa un .xlsx, .xls o .csv valido.");
    } finally {
      setParsing(false);
    }
  }

  // ── Livello 2 — classificazione contro le transazioni esistenti ─────────────
  async function goToPreview(parsed: ParsedRow[]) {
    const supabase = createClient();
    const dates = parsed.map(r => r.date).sort();
    const minDate = dates[0];
    const maxDate = dates[dates.length - 1];

    let query = supabase
      .from("transactions")
      .select("date, amount, description")
      .eq("user_id", userId)
      .gte("date", minDate)
      .lte("date", maxDate);
    query = personId ? query.eq("member_id", personId) : query.is("member_id", null);

    const { data: existing } = await query;
    const { classified: cls, summary: sum } = classifyRows(parsed, existing ?? []);

    setRows(parsed);
    setClassified(cls);
    setSummary(sum);
    setYellowKeep(new Set(cls.map((c, i) => (c.status === "possible" ? i : -1)).filter(i => i >= 0)));
    setManualReview(false);
    setDupFile(null);
    setStep("preview");
  }

  function handleFile(file: File) {
    if (!file.name.match(/\.(xlsx|xls|csv)$/i)) {
      toast.error("Formato non supportato. Usa .xlsx, .xls o .csv");
      return;
    }
    setDupFile(null);
    processFile(file);
  }

  function updateCategory(idx: number, categoryId: string) {
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, category_id: categoryId || null } : r));
    setClassified(prev => prev.map((c, i) => i === idx ? { ...c, row: { ...c.row, category_id: categoryId || null } } : c));
  }

  // ── Import ─────────────────────────────────────────────────────────────────
  async function handleImport(mode: "all" | "new") {
    if (demoGuard()) return;
    setImporting(true);

    try {
      const res = await fetch("/api/excel/log-upload", { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        toast.error(body?.error ?? "Impossibile importare in questo momento.");
        setImporting(false);
        return;
      }
    } catch {
      toast.error("Errore di rete. Riprova.");
      setImporting(false);
      return;
    }

    const supabase = createClient();

    const toInsert = classified
      .filter((c, i) => {
        if (c.status === "exact") return false;
        if (c.status === "new") return true;
        // possible
        if (mode === "new") return false;
        return yellowKeep.has(i);
      })
      .map(c => ({
        user_id: userId,
        date: c.row.date,
        amount: c.row.amount,
        description: c.row.description,
        category_id: c.row.category_id || null,
        member_id: personId || null,
        source: "excel" as const,
      }));

    const skipped = rows.length - toInsert.length;
    if (toInsert.length === 0) {
      toast.info("Nessun nuovo movimento da importare.");
      setImporting(false);
      onClose();
      return;
    }

    const BATCH = 200;
    for (let i = 0; i < toInsert.length; i += BATCH) {
      const { error } = await supabase.from("transactions").insert(toInsert.slice(i, i + BATCH));
      if (error) {
        toast.error("Errore durante l'importazione.");
        setImporting(false);
        return;
      }
    }

    if (pendingRef.current) {
      await supabase.from("import_logs").insert({
        user_id: userId,
        file_hash: pendingRef.current.hash,
        filename: pendingRef.current.filename,
        transaction_count: toInsert.length,
        member_id: personId || null,
      });
    }

    toast.success(skipped > 0
      ? `${toInsert.length} movimenti importati, ${skipped} saltati.`
      : `${toInsert.length} movimenti importati!`);
    onImported(toInsert.length);
    onClose();
  }

  // ── Stats preview ──────────────────────────────────────────────────────────
  const entrate = useMemo(() => rows.filter(r => r.amount > 0).reduce((s, r) => s + r.amount, 0), [rows]);
  const uscite  = useMemo(() => rows.filter(r => r.amount < 0).reduce((s, r) => s + r.amount, 0), [rows]);

  const rowTint: Record<string, string> = {
    new: "border-l-4 border-l-green-500",
    possible: "border-l-4 border-l-yellow-500 bg-yellow-500/5",
    exact: "border-l-4 border-l-red-500 bg-muted/40 opacity-60",
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-background border rounded-xl shadow-xl w-full max-w-3xl mx-4 flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div className="flex flex-col">
            <h2 className="font-semibold text-lg">
              {step === "person" ? "Chi ha fatto questi movimenti?"
                : step === "upload" ? "Carica file Excel"
                : `Anteprima — ${rows.length} movimenti`}
            </h2>
            {step !== "person" && hasMembers && (
              <span className="text-xs text-muted-foreground">
                Stai importando movimenti per: <strong>{personLabel}</strong>
              </span>
            )}
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors text-xl leading-none">✕</button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">

          {/* STEP PERSON */}
          {step === "person" && (
            <div className="flex flex-col gap-5">
              <p className="text-sm text-muted-foreground">
                <strong>A chi appartengono questi movimenti?</strong> Seleziona la persona: tutte le
                transazioni importate verranno associate a lei.
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {/* Titolare */}
                <button
                  type="button"
                  onClick={() => { setPersonId(null); setPersonConfirmed(true); }}
                  className={`flex flex-col items-center gap-2 rounded-xl border-2 p-4 transition-all ${
                    personConfirmed && personId === null ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
                  }`}
                >
                  <span className="w-10 h-10 rounded-full bg-primary/15 text-primary font-semibold flex items-center justify-center">
                    {(ownerName?.trim()?.[0] ?? "I").toUpperCase()}
                  </span>
                  <span className="text-sm font-medium truncate max-w-full">{ownerName?.trim() || "Io"}</span>
                </button>

                {familyMembers.map(m => {
                  const active = personConfirmed && personId === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => { setPersonId(m.id); setPersonConfirmed(true); }}
                      className={`flex flex-col items-center gap-2 rounded-xl border-2 p-4 transition-all ${active ? "" : "border-border hover:border-primary/40"}`}
                      style={active ? { borderColor: m.color, backgroundColor: m.color + "12" } : undefined}
                    >
                      <span
                        className="w-10 h-10 rounded-full font-semibold flex items-center justify-center text-white"
                        style={{ backgroundColor: m.color }}
                      >
                        {m.name[0]?.toUpperCase()}
                      </span>
                      <span className="text-sm font-medium truncate max-w-full">{m.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* STEP UPLOAD */}
          {step === "upload" && (
            <div className="flex flex-col gap-6">
              <p className="text-sm text-muted-foreground">
                Carica un estratto conto in formato <strong>.xlsx</strong>, <strong>.xls</strong> o <strong>.csv</strong>.
                Le categorie vengono rilevate automaticamente.
              </p>

              {dupFile ? (
                <div className="rounded-xl border border-yellow-500/40 bg-yellow-500/10 p-4 flex flex-col gap-3">
                  <p className="text-sm">
                    ⚠️ Questo file sembra già essere stato caricato il{" "}
                    <strong>{new Date(dupFile.date).toLocaleDateString("it-IT")}</strong>. Vuoi importarlo comunque?
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => { setDupFile(null); pendingRef.current = null; }}
                      className="border rounded-md px-4 py-2 text-sm hover:bg-muted/50"
                    >
                      Annulla
                    </button>
                    <button
                      onClick={() => pendingRef.current && goToPreview(pendingRef.current.rows)}
                      className="bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-medium hover:bg-primary/90"
                    >
                      Importa comunque (evita duplicati)
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div
                    onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
                    onClick={() => fileRef.current?.click()}
                    className={`border-2 border-dashed rounded-xl p-12 flex flex-col items-center gap-3 cursor-pointer transition-colors ${dragOver ? "border-primary bg-primary/5" : "hover:border-primary/50 hover:bg-muted/30"}`}
                  >
                    <span className="text-4xl">{parsing ? "⏳" : "📂"}</span>
                    <p className="text-sm font-medium">
                      {parsing ? "Lettura del file…" : "Trascina il file qui oppure clicca per selezionarlo"}
                    </p>
                    <p className="text-xs text-muted-foreground">.xlsx · .xls · .csv</p>
                  </div>
                  <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
                </>
              )}

              <div className="rounded-lg bg-muted/40 p-4 text-xs text-muted-foreground flex flex-col gap-1">
                <p className="font-medium text-foreground">Banche supportate</p>
                <p>Isybank e qualsiasi estratto conto con colonne <em>Data</em> e <em>Importo</em>.</p>
              </div>
            </div>
          )}

          {/* STEP PREVIEW */}
          {step === "preview" && (
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-3 gap-3 text-sm">
                <div className="rounded-lg border p-3 flex flex-col gap-0.5">
                  <span className="text-xs text-muted-foreground">Entrate</span>
                  <span className="font-semibold text-green-600 dark:text-green-400">+{formatEuro(entrate)}</span>
                </div>
                <div className="rounded-lg border p-3 flex flex-col gap-0.5">
                  <span className="text-xs text-muted-foreground">Uscite</span>
                  <span className="font-semibold text-red-500">{formatEuro(uscite)}</span>
                </div>
                <div className="rounded-lg border p-3 flex flex-col gap-0.5">
                  <span className="text-xs text-muted-foreground">Righe</span>
                  <span className="font-semibold">{rows.length}</span>
                </div>
              </div>

              {/* Riepilogo dedup */}
              <div className="rounded-lg border p-3 text-sm flex flex-wrap gap-x-4 gap-y-1">
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-green-500" /> <strong>{summary.neu}</strong> nuove</span>
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-yellow-500" /> <strong>{summary.possible}</strong> possibili duplicati</span>
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-500" /> <strong>{summary.exact}</strong> duplicati esatti (saltati)</span>
              </div>

              {summary.possible > 0 && (
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={manualReview} onChange={e => setManualReview(e.target.checked)} />
                  Revisiona manualmente i possibili duplicati
                </label>
              )}

              <div className="rounded-xl border overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        {manualReview && <th className="px-2 py-2.5" />}
                        <th className="text-left px-3 py-2.5 font-medium whitespace-nowrap">Data</th>
                        <th className="text-left px-3 py-2.5 font-medium">Descrizione</th>
                        <th className="text-left px-3 py-2.5 font-medium">Categoria</th>
                        <th className="text-right px-3 py-2.5 font-medium whitespace-nowrap">Importo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {classified.map((c, i) => (
                        <tr key={i} className={`border-b last:border-b-0 ${rowTint[c.status]}`}>
                          {manualReview && (
                            <td className="px-2 py-2 text-center">
                              {c.status === "possible" && (
                                <input
                                  type="checkbox"
                                  checked={yellowKeep.has(i)}
                                  onChange={e => setYellowKeep(prev => {
                                    const next = new Set(prev);
                                    if (e.target.checked) next.add(i); else next.delete(i);
                                    return next;
                                  })}
                                />
                              )}
                            </td>
                          )}
                          <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                            {new Date(c.row.date).toLocaleDateString("it-IT")}
                          </td>
                          <td className="px-3 py-2 max-w-[180px] truncate" title={c.row.description}>
                            {c.row.description || "—"}
                          </td>
                          <td className="px-3 py-2">
                            <select
                              value={c.row.category_id ?? ""}
                              onChange={e => updateCategory(i, e.target.value)}
                              disabled={c.status === "exact"}
                              className="border rounded px-2 py-1 text-xs bg-background focus:outline-none focus:ring-1 focus:ring-primary max-w-[150px] disabled:opacity-50"
                            >
                              <option value="">— Nessuna —</option>
                              {categories.map(cat => (
                                <option key={cat.id} value={cat.id}>{cat.icon} {cat.name}</option>
                              ))}
                            </select>
                          </td>
                          <td className={`px-3 py-2 text-right font-semibold whitespace-nowrap ${c.row.amount >= 0 ? "text-green-600 dark:text-green-400" : "text-red-500"}`}>
                            {c.row.amount >= 0 ? "+" : ""}{formatEuro(c.row.amount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {detectedBank === "isybank" && (
                <p className="text-xs text-primary font-medium">Isybank rilevato</p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t flex-wrap">
          {step === "person" && (
            <>
              <span className="text-xs text-muted-foreground">
                {personConfirmed ? `Selezionato: ${personLabel}` : "Tocca una persona per continuare"}
              </span>
              <button
                onClick={() => setStep("upload")}
                disabled={!personConfirmed}
                className="bg-primary text-primary-foreground rounded-md px-5 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-40 transition-colors"
              >
                Continua
              </button>
            </>
          )}

          {step === "upload" && hasMembers && (
            <button onClick={() => setStep("person")} className="text-sm text-muted-foreground hover:text-foreground">
              ← Cambia persona
            </button>
          )}

          {step === "preview" && (
            <>
              <button onClick={() => setStep("upload")} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                ← Cambia file
              </button>
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={() => handleImport("new")}
                  disabled={importing}
                  className="border rounded-md px-4 py-2 text-sm hover:bg-muted/50 disabled:opacity-50 transition-colors"
                >
                  Importa solo nuove
                </button>
                <button
                  onClick={() => handleImport("all")}
                  disabled={importing}
                  className="bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
                >
                  {importing ? "Importazione…" : summary.possible > 0 ? "Importa tutto (nuove + possibili)" : "Importa tutto"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
