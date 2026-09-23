"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { useDemoGuard } from "@/components/demo-context";
import { guessCategoryName, matchUserRule, type UserRule } from "@/lib/categorize";
import {
  detectColumns,
  loadRememberedMap,
  parseWithMap,
  parseWithMapDetailed,
  rememberMap,
  sniffColumns,
  type ColumnMap,
  type Grid,
  type RawRow,
} from "@/lib/import-parse";
import { readGrid } from "@/lib/import-read";
import { track } from "@/lib/track";
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
  /** regole "contiene X → categoria" dell'utente: si applicano prima di quelle predefinite */
  userRules?: UserRule[];
  onClose: () => void;
  onImported: (count: number) => void;
};

// ─── bank detection ───────────────────────────────────────────────────────────
type BankFormat = "isybank" | "generic";

function detectBank(rows: unknown[][]): BankFormat {
  const flat = rows.slice(0, 15).map(r => (r as unknown[]).map(c => String(c)).join(" ").toLowerCase());
  if (flat.some(r => r.includes("movimenti selezionati") || r.includes("conti e carte"))) return "isybank";
  return "generic";
}

function formatEuro(n: number) {
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(n);
}

// ─── Component ────────────────────────────────────────────────────────────────
export function ImportExcelModal({ userId, categories, familyMembers = [], userRules = [], onClose, onImported }: Props) {
  const hasMembers = familyMembers.length > 0;
  const demoGuard = useDemoGuard();

  const [step, setStep] = useState<"person" | "upload" | "map" | "preview">(hasMembers ? "person" : "upload");

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

  const personLabel = familyMembers.find(m => m.id === personId)?.name ?? "—";

  // ── Parsing ────────────────────────────────────────────────────────────────
  // Griglia grezza del file e mappatura proposta all'utente quando le colonne non si riconoscono da sole
  const [grid, setGrid] = useState<Grid>([]);
  const [mapDraft, setMapDraft] = useState<ColumnMap | null>(null);
  /** movimenti non ancora contabilizzati saltati nell'ultimo file letto */
  const [pendingIgnored, setPendingIgnored] = useState(0);
  const fileMetaRef = useRef<{ hash: string; filename: string } | null>(null);
  const mappingHowRef = useRef<"auto" | "remembered" | "manual">("auto");

  useEffect(() => { void track("import_opened"); }, []);

  function toParsedRows(raw: RawRow[]): ParsedRow[] {
    return raw.map(r => {
      const byRule = matchUserRule(r.description, userRules);
      if (byRule && categories.some(c => c.id === byRule)) {
        return { date: r.date, amount: r.amount, description: r.description, category_id: byRule };
      }
      const name = guessCategoryName(r.bankCategory, r.description);
      const cat = name ? categories.find(c => c.name === name) : undefined;
      return { date: r.date, amount: r.amount, description: r.description, category_id: cat?.id ?? null };
    });
  }

  async function processFile(file: File) {
    setParsing(true);
    try {
      const buffer = await file.arrayBuffer();
      const json: Grid = readGrid(buffer, file.name);

      if (json.length < 2) {
        toast.error("Il file sembra vuoto o non valido.");
        void track("import_failed", { reason: "empty" });
        return;
      }

      setDetectedBank(detectBank(json));
      fileMetaRef.current = { hash: await hashFile(buffer), filename: file.name };

      // Una mappatura già confermata per questo tipo di file ha la precedenza
      const remembered = loadRememberedMap(json);
      const map = remembered ?? detectColumns(json);
      if (!map) {
        void track("import_failed", { reason: "columns_not_found" });
        openMapping(json);
        return;
      }
      await continueWithMap(json, map, remembered ? "remembered" : "auto");
    } catch {
      toast.error("Errore nel leggere il file. Usa un .xlsx, .xls o .csv valido.");
      void track("import_failed", { reason: "read_error" });
    } finally {
      setParsing(false);
    }
  }

  function openMapping(g: Grid) {
    setGrid(g);
    setMapDraft(sniffColumns(g) ?? { headerRow: -1, date: -1, desc: null, category: null, amount: null, income: null, expense: null });
    setStep("map");
  }

  async function continueWithMap(g: Grid, map: ColumnMap, how: "auto" | "remembered" | "manual") {
    const meta = fileMetaRef.current;
    const result = parseWithMapDetailed(g, map);
    setPendingIgnored(result.pending);
    const parsed = toParsedRows(result.rows);
    if (parsed.length === 0 || !meta) {
      toast.error("Nessuna riga valida trovata con queste colonne.");
      void track("import_failed", { reason: "no_valid_rows", how });
      if (how !== "manual") openMapping(g);
      return;
    }
    pendingRef.current = { rows: parsed, hash: meta.hash, filename: meta.filename };
    mappingHowRef.current = how;

    // Livello 1 — stesso file gia' caricato?
    const supabase = createClient();
    const { data: prev } = await supabase
      .from("import_logs")
      .select("imported_at")
      .eq("user_id", userId)
      .eq("file_hash", meta.hash)
      .order("imported_at", { ascending: false })
      .limit(1);

    if (prev && prev.length > 0) {
      setDupFile({ date: prev[0].imported_at });
      setStep("upload"); // mostra il warning
      return;
    }

    await goToPreview(parsed);
  }

  const draftValid = !!mapDraft && mapDraft.date >= 0 &&
    (mapDraft.amount !== null ||
      (mapDraft.income !== null && mapDraft.income >= 0 && mapDraft.expense !== null && mapDraft.expense >= 0));

  const draftPreview = useMemo(() => {
    if (!mapDraft || !draftValid) return [];
    return parseWithMap(grid, mapDraft);
  }, [grid, mapDraft, draftValid]);

  async function confirmMapping() {
    if (!mapDraft || !draftValid) return;
    setParsing(true);
    try {
      rememberMap(grid, mapDraft);
      void track("import_map_saved", { split: mapDraft.amount === null });
      await continueWithMap(grid, mapDraft, "manual");
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
        void track("import_failed", { reason: "insert_error" });
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
    void track("import_completed", { rows: toInsert.length, skipped, how: mappingHowRef.current, bank: detectedBank ?? "generic" });
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
                : step === "upload" ? "Carica l'estratto conto"
                : step === "map" ? "Indica le colonne"
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
                Carica l&apos;estratto conto in formato <strong>.xlsx</strong>, <strong>.xls</strong> o <strong>.csv</strong>.
                Le categorie vengono assegnate in automatico. Se non riconosco le colonne, mi dici tu dove sono (una volta sola).
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
                <p className="font-medium text-foreground">Come esportare il file dalla banca</p>
                <p>Nell&apos;home banking cerca <em>Movimenti</em> (o <em>Estratto conto</em>) e poi <em>Esporta</em> in Excel o CSV.</p>
                <p>Va bene qualsiasi file con una colonna data e un importo, anche con <em>Entrate</em> e <em>Uscite</em> separate.</p>
                <p>
                  <strong className="text-foreground">Postepay:</strong>
                  {" dall'app non si può scaricare il file. Usa il sito ("}
                  <em>Movimenti</em>
                  {" → "}
                  <em>Scarica elenco su file</em>
                  {" → Excel) oppure, dall'app, l'import da screenshot."}
                </p>
              </div>
            </div>
          )}

          {/* STEP MAP — l'utente indica le colonne quando il riconoscimento automatico non basta */}
          {step === "map" && mapDraft && (() => {
            const scan = grid.slice(0, 30);
            const width = Math.min(20, Math.max(1, ...scan.map(r => (r ?? []).length)));
            const cols = Array.from({ length: width }, (_, c) => c);
            const letter = (c: number) => (c < 26 ? String.fromCharCode(65 + c) : String(c + 1));
            const headerCells = mapDraft.headerRow >= 0 ? (grid[mapDraft.headerRow] ?? []) : [];
            const firstData = grid[mapDraft.headerRow + 1] ?? [];
            const label = (c: number) => {
              const h = String(headerCells[c] ?? "").trim();
              const sample = String(firstData[c] ?? "").trim();
              return `${letter(c)} — ${(h || sample || "(vuota)").slice(0, 28)}`;
            };
            const colSelect = (value: number | null, onChange: (v: number | null) => void, optional: boolean) => (
              <select
                value={value ?? -1}
                onChange={e => onChange(Number(e.target.value) < 0 ? null : Number(e.target.value))}
                className="border rounded-md px-2 py-1.5 text-sm bg-background w-full"
              >
                <option value={-1}>{optional ? "— nessuna —" : "— scegli —"}</option>
                {cols.map(c => <option key={c} value={c}>{label(c)}</option>)}
              </select>
            );
            const split = mapDraft.amount === null && (mapDraft.income !== null || mapDraft.expense !== null);
            const setDraft = (patch: Partial<ColumnMap>) => setMapDraft({ ...mapDraft, ...patch });
            return (
              <div className="flex flex-col gap-5">
                <p className="text-sm text-muted-foreground">
                  Non ho riconosciuto le colonne di questo file. Indicami dove sono <strong>data</strong>, <strong>importo</strong>{" "}
                  e (se c&apos;è) <strong>descrizione</strong>: la prossima volta che caricherai un file fatto così me le ricorderò.
                </p>

                <div className="rounded-xl border overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="px-2 py-1.5 text-left font-medium text-muted-foreground">Riga</th>
                        {cols.slice(0, 10).map(c => <th key={c} className="px-2 py-1.5 text-left font-medium text-muted-foreground">{letter(c)}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {grid.slice(0, 12).map((row, i) => (
                        <tr key={i} className={`border-b last:border-b-0 ${i === mapDraft.headerRow ? "bg-primary/10 font-medium" : ""}`}>
                          <td className="px-2 py-1 text-muted-foreground">{i + 1}</td>
                          {cols.slice(0, 10).map(c => (
                            <td key={c} className="px-2 py-1 max-w-[160px] truncate">{String((row ?? [])[c] ?? "")}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                  <label className="flex flex-col gap-1">
                    <span className="font-medium">Riga delle intestazioni</span>
                    <select
                      value={mapDraft.headerRow}
                      onChange={e => setDraft({ headerRow: Number(e.target.value) })}
                      className="border rounded-md px-2 py-1.5 text-sm bg-background"
                    >
                      <option value={-1}>Nessuna: i dati iniziano dalla prima riga</option>
                      {grid.slice(0, 15).map((_, i) => <option key={i} value={i}>Riga {i + 1}</option>)}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="font-medium">Data</span>
                    {colSelect(mapDraft.date >= 0 ? mapDraft.date : null, v => setDraft({ date: v ?? -1 }), false)}
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="font-medium">Descrizione</span>
                    {colSelect(mapDraft.desc, v => setDraft({ desc: v }), true)}
                  </label>
                  <div className="flex flex-col gap-1">
                    <span className="font-medium">Importo</span>
                    <div className="flex gap-3 text-xs">
                      <label className="flex items-center gap-1.5">
                        <input type="radio" checked={!split} onChange={() => setDraft({ amount: mapDraft.amount, income: null, expense: null })} />
                        Una colonna (con il segno)
                      </label>
                      <label className="flex items-center gap-1.5">
                        <input type="radio" checked={split} onChange={() => setDraft({ amount: null, income: mapDraft.income ?? -1, expense: mapDraft.expense ?? -1 })} />
                        Entrate e uscite separate
                      </label>
                    </div>
                  </div>
                  {!split ? (
                    <label className="flex flex-col gap-1 sm:col-span-2">
                      <span className="font-medium">Colonna importo</span>
                      {colSelect(mapDraft.amount, v => setDraft({ amount: v }), false)}
                    </label>
                  ) : (
                    <>
                      <label className="flex flex-col gap-1">
                        <span className="font-medium">Colonna entrate</span>
                        {colSelect(mapDraft.income !== null && mapDraft.income >= 0 ? mapDraft.income : null, v => setDraft({ income: v }), false)}
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className="font-medium">Colonna uscite</span>
                        {colSelect(mapDraft.expense !== null && mapDraft.expense >= 0 ? mapDraft.expense : null, v => setDraft({ expense: v }), false)}
                      </label>
                    </>
                  )}
                </div>

                <div className="rounded-lg border p-3 text-sm flex flex-col gap-2">
                  {draftPreview.length === 0 ? (
                    <p className="text-muted-foreground">Scegli data e importo: qui vedrai le prime righe lette.</p>
                  ) : (
                    <>
                      <p className="font-medium">Ho letto {draftPreview.length} movimenti. Le prime righe:</p>
                      <ul className="flex flex-col gap-1 text-xs">
                        {draftPreview.slice(0, 5).map((r, i) => (
                          <li key={i} className="flex justify-between gap-3">
                            <span className="text-muted-foreground whitespace-nowrap">{new Date(r.date + "T00:00:00").toLocaleDateString("it-IT")}</span>
                            <span className="truncate flex-1">{r.description || "—"}</span>
                            <span className={`font-medium whitespace-nowrap ${r.amount < 0 ? "text-red-500" : "text-green-600 dark:text-green-400"}`}>{formatEuro(r.amount)}</span>
                          </li>
                        ))}
                      </ul>
                      <p className="text-xs text-muted-foreground">Controlla che date e importi siano giusti prima di continuare.</p>
                    </>
                  )}
                </div>

                <div className="flex gap-2 justify-end">
                  <button onClick={() => setStep("upload")} className="border rounded-md px-4 py-2 text-sm hover:bg-muted/50">Indietro</button>
                  <button
                    onClick={confirmMapping}
                    disabled={!draftValid || draftPreview.length === 0 || parsing}
                    className="bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {parsing ? "Un attimo…" : "Usa queste colonne"}
                  </button>
                </div>
              </div>
            );
          })()}

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

              {pendingIgnored > 0 && (
                <p className="rounded-lg border border-yellow-500/40 bg-yellow-500/10 px-3 py-2 text-xs">
                  {pendingIgnored === 1
                    ? "Ho saltato 1 movimento non ancora contabilizzato: quando la banca lo conferma potrebbe cambiare data o descrizione. Lo importerai col prossimo file."
                    : `Ho saltato ${pendingIgnored} movimenti non ancora contabilizzati: quando la banca li conferma potrebbero cambiare data o descrizione. Li importerai col prossimo file.`}
                </p>
              )}

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
