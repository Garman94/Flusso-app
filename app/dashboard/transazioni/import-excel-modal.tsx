"use client";

import { useState, useRef } from "react";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";

type Category = { id: string; name: string; color: string; icon: string };

type ParsedRow = {
  date: string;
  amount: number;
  description: string;
  category_id: string | null;
};

type Props = {
  userId: string;
  categories: Category[];
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
  Tecnologia:      ["apple","amazon","mediaworld","unieuro","euronics","microsoft","google"],
  Istruzione:      ["università","udemy","coursera","mondadori","feltrinelli"],
  Palestra:        ["palestra","fitness","virgin active","mcfit","gym","crossfit","piscina"],
  Bollette:        ["enel","a2a","iren","hera","snam","eni gas","luce","gas ","acqua","bolletta","utenza"],
  Assicurazioni:   ["generali","allianz","unipol","assicurazione","polizza","rcauto"],
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
  // 1. direct bank category mapping
  const mapped = BANK_CATEGORY_MAP[bankCat.trim()];
  if (mapped) {
    const found = categories.find(c => c.name === mapped);
    if (found) return found.id;
  }
  // 2. keyword fallback on description
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

export function ImportExcelModal({ userId, categories, onClose, onImported }: Props) {
  const [step, setStep] = useState<"upload" | "preview">("upload");
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [detectedBank, setDetectedBank] = useState<BankFormat | null>(null);
  const [importing, setImporting] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function processFile(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const json: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });

        if (json.length < 2) {
          toast.error("Il file sembra vuoto o non valido.");
          return;
        }

        const bank = detectBank(json);
        setDetectedBank(bank);

        // find the header row: first row that has both a date-like and amount-like header
        let headerIdx = -1;
        for (let i = 0; i < Math.min(30, json.length); i++) {
          const row = (json[i] as unknown[]).map(c => String(c).toLowerCase().trim());
          const hasDate   = DATE_HEADERS.some(h => row.some(c => c.startsWith(h)));
          const hasAmount = AMOUNT_HEADERS.some(h => row.some(c => c.startsWith(h)));
          if (hasDate && hasAmount) { headerIdx = i; break; }
        }

        if (headerIdx === -1) {
          toast.error("Impossibile trovare la riga di intestazione. Controlla che il file abbia colonne 'Data' e 'Importo'.");
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
          const category_id = guessCategory(bankCat, description, categories);

          parsed.push({ date, amount, description, category_id });
        }

        if (parsed.length === 0) {
          toast.error("Nessuna riga valida trovata nel file.");
          return;
        }

        setRows(parsed);
        setStep("preview");
      } catch {
        toast.error("Errore nel leggere il file. Assicurati che sia un .xlsx, .xls o .csv valido.");
      }
    };
    reader.readAsArrayBuffer(file);
  }

  function handleFile(file: File) {
    if (!file.name.match(/\.(xlsx|xls|csv)$/i)) {
      toast.error("Formato non supportato. Usa .xlsx, .xls o .csv");
      return;
    }
    processFile(file);
  }

  function updateCategory(idx: number, categoryId: string) {
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, category_id: categoryId || null } : r));
  }

  async function handleImport() {
    setImporting(true);
    const supabase = createClient();

    // Fetch existing transactions for the same date range to deduplicate
    const dates = rows.map(r => r.date).sort();
    const minDate = dates[0];
    const maxDate = dates[dates.length - 1];

    const { data: existing } = await supabase
      .from("transactions")
      .select("date, amount, description")
      .eq("user_id", userId)
      .gte("date", minDate)
      .lte("date", maxDate);

    const existingSet = new Set(
      (existing ?? []).map(t =>
        `${t.date}|${Number(t.amount).toFixed(2)}|${String(t.description ?? "").trim().toLowerCase()}`
      )
    );

    const toInsert = rows
      .filter(r => !existingSet.has(
        `${r.date}|${r.amount.toFixed(2)}|${r.description.toLowerCase()}`
      ))
      .map(r => ({
        user_id: userId,
        date: r.date,
        amount: r.amount,
        description: r.description,
        category_id: r.category_id || null,
        source: "excel" as const,
      }));

    const skipped = rows.length - toInsert.length;
    if (toInsert.length === 0) {
      toast.info(`Tutti i ${rows.length} movimenti sono già presenti. Nessun duplicato importato.`);
      setImporting(false);
      onClose();
      return;
    }

    // insert in batches of 200
    const BATCH = 200;
    for (let i = 0; i < toInsert.length; i += BATCH) {
      const { error } = await supabase.from("transactions").insert(toInsert.slice(i, i + BATCH));
      if (error) {
        toast.error("Errore durante l'importazione.");
        setImporting(false);
        return;
      }
    }

    toast.success(skipped > 0 ? `${toInsert.length} movimenti importati, ${skipped} duplicati saltati.` : `${toInsert.length} movimenti importati!`);
    onImported(toInsert.length);
    onClose();
  }

  // stats for preview
  const categorized = rows.filter(r => r.category_id !== null).length;
  const entrate     = rows.filter(r => r.amount > 0).reduce((s, r) => s + r.amount, 0);
  const uscite      = rows.filter(r => r.amount < 0).reduce((s, r) => s + r.amount, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-background border rounded-xl shadow-xl w-full max-w-3xl mx-4 flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="font-semibold text-lg">
            {step === "upload" ? "Carica file Excel" : `Anteprima — ${rows.length} movimenti`}
          </h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors text-xl leading-none">✕</button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {step === "upload" && (
            <div className="flex flex-col gap-6">
              <p className="text-sm text-muted-foreground">
                Carica un estratto conto in formato <strong>.xlsx</strong>, <strong>.xls</strong> o <strong>.csv</strong>.
                Le categorie vengono rilevate automaticamente dalla colonna categoria del file.
              </p>

              <div
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
                onClick={() => fileRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-12 flex flex-col items-center gap-3 cursor-pointer transition-colors ${dragOver ? "border-primary bg-primary/5" : "hover:border-primary/50 hover:bg-muted/30"}`}
              >
                <span className="text-4xl">📂</span>
                <p className="text-sm font-medium">Trascina il file qui oppure clicca per selezionarlo</p>
                <p className="text-xs text-muted-foreground">.xlsx · .xls · .csv</p>
              </div>
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />

              <div className="rounded-lg bg-muted/40 p-4 text-xs text-muted-foreground flex flex-col gap-1">
                <p className="font-medium text-foreground">Banche supportate</p>
                <p>Isybank e qualsiasi estratto conto con colonne <em>Data</em> e <em>Importo</em>. Il supporto per altri formati verrà aggiunto nel tempo.</p>
              </div>
            </div>
          )}

          {step === "preview" && (
            <div className="flex flex-col gap-4">
              {/* Stats bar */}
              <div className="grid grid-cols-3 gap-3 text-sm">
                <div className="rounded-lg border p-3 flex flex-col gap-0.5">
                  <span className="text-xs text-muted-foreground">Categorizzati</span>
                  <span className="font-semibold">{categorized} / {rows.length}</span>
                </div>
                <div className="rounded-lg border p-3 flex flex-col gap-0.5">
                  <span className="text-xs text-muted-foreground">Entrate</span>
                  <span className="font-semibold text-green-600 dark:text-green-400">+{formatEuro(entrate)}</span>
                </div>
                <div className="rounded-lg border p-3 flex flex-col gap-0.5">
                  <span className="text-xs text-muted-foreground">Uscite</span>
                  <span className="font-semibold text-red-500">{formatEuro(uscite)}</span>
                </div>
              </div>

              <p className="text-sm text-muted-foreground">
                {detectedBank === "isybank" && <span className="text-primary font-medium">Isybank rilevato · </span>}
                Puoi modificare le categorie prima di importare.
              </p>

              <div className="rounded-xl border overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="text-left px-3 py-2.5 font-medium whitespace-nowrap">Data</th>
                        <th className="text-left px-3 py-2.5 font-medium">Descrizione</th>
                        <th className="text-left px-3 py-2.5 font-medium">Categoria</th>
                        <th className="text-right px-3 py-2.5 font-medium whitespace-nowrap">Importo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r, i) => (
                        <tr key={i} className="border-b last:border-b-0 hover:bg-muted/20 transition-colors">
                          <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                            {new Date(r.date).toLocaleDateString("it-IT")}
                          </td>
                          <td className="px-3 py-2 max-w-[180px] truncate" title={r.description}>
                            {r.description || "—"}
                          </td>
                          <td className="px-3 py-2">
                            <select
                              value={r.category_id ?? ""}
                              onChange={e => updateCategory(i, e.target.value)}
                              className="border rounded px-2 py-1 text-xs bg-background focus:outline-none focus:ring-1 focus:ring-primary max-w-[150px]"
                            >
                              <option value="">— Nessuna —</option>
                              {categories.map(c => (
                                <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
                              ))}
                            </select>
                          </td>
                          <td className={`px-3 py-2 text-right font-semibold whitespace-nowrap ${r.amount >= 0 ? "text-green-600 dark:text-green-400" : "text-red-500"}`}>
                            {r.amount >= 0 ? "+" : ""}{formatEuro(r.amount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {step === "preview" && (
          <div className="flex items-center justify-between gap-4 px-6 py-4 border-t">
            <button onClick={() => setStep("upload")} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              ← Cambia file
            </button>
            <div className="flex gap-3">
              <button onClick={onClose} className="border rounded-md px-5 py-2 text-sm hover:bg-muted/50 transition-colors">
                Annulla
              </button>
              <button
                onClick={handleImport}
                disabled={importing}
                className="bg-primary text-primary-foreground rounded-md px-5 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                {importing ? "Importazione..." : `Importa ${rows.length} movimenti`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
