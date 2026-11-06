"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { track, trackBeforeLeaving } from "@/lib/track";
import { useDemoGuard } from "@/components/demo-context";
import { prepareImage } from "@/lib/image-prepare";
import { classifyRows, type DedupStatus } from "@/lib/import-dedup";
import { categorize, type DictionaryEntry, type UserRule } from "@/lib/categorize";
import { parseAmount } from "@/lib/import-parse";
import Link from "next/link";
import { formatEuro } from "@/lib/calculations";
import type { ExtractedTransaction, StatementBalances, StatementCheck } from "@/lib/screenshot-extract";
import { extractTransactionsFromPdf, extractTransactionsFromScreenshot } from "./screenshot-action";

// Import da foto o PDF (Premium): screenshot della lista movimenti, oppure estratto conto PDF di
// qualsiasi banca. Dal PDF si leggono anche i saldi: se saldo iniziale + movimenti = saldo finale,
// la lettura è completa (lib/screenshot-extract.ts → checkStatement).

/** Il limite delle server action è 4 MB: in base64 un PDF cresce di un terzo. */
const MAX_PDF_BYTES = 2_900_000;

const isPdf = (file: File) => file.type === "application/pdf" || /\.pdf$/i.test(file.name);

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

const fmtDate = (iso: string) => new Date(iso + "T00:00:00").toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" });

type Category = { id: string; name: string; color: string; icon: string };

type Props = {
  userId: string;
  categories: Category[];
  userRules?: UserRule[];
  /** dizionario condiviso dei negozi: dopo le regole personali */
  dictionary?: DictionaryEntry[];
  onClose: () => void;
  onImported: (transactions: ExtractedTransaction[]) => void;
};

type Row = ExtractedTransaction & {
  selected: boolean;
  category_id: string;
  status: DedupStatus;
  /** testo digitato nel campo importo: senza, "12," tornerebbe "12" a ogni tasto */
  amountText: string;
};

const euroText = (n: number) => String(n).replace(".", ",");

export function ScreenshotModal({ userId, categories, userRules = [], dictionary = [], onClose, onImported }: Props) {
  const demoGuard = useDemoGuard();
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  /** nome del PDF caricato (al posto dell'anteprima dell'immagine) */
  const [pdfName, setPdfName] = useState<string | null>(null);
  /** saldi letti dal PDF e controllo della lettura */
  const [statement, setStatement] = useState<{ balances: StatementBalances; check: StatementCheck | null } | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleFile(file: File) {
    const pdf = isPdf(file);
    if (!pdf && !file.type.startsWith("image/")) {
      toast.error("Carica un'immagine (PNG, JPG, WebP) o il PDF dell'estratto conto.");
      return;
    }
    if (pdf && file.size > MAX_PDF_BYTES) {
      toast.error("Il PDF è troppo grande (massimo circa 3 MB). Scarica un periodo più corto, per esempio un mese.");
      return;
    }
    setRows(null);
    setStatement(null);
    setExtracting(true);
    try {
      let result: Awaited<ReturnType<typeof extractTransactionsFromPdf>>;
      if (pdf) {
        setPreview(null);
        setPdfName(file.name);
        result = await extractTransactionsFromPdf(await fileToBase64(file));
      } else {
        // Riduce e converte in JPEG: gli screenshot del telefono pesano più del limite di invio
        let prepared;
        try {
          prepared = await prepareImage(file);
        } catch {
          toast.error("Non riesco ad aprire questa immagine. Prova con un PNG o un JPG.");
          void track("screenshot_failed", { reason: "decode" });
          return;
        }
        setPdfName(null);
        setPreview(prepared.dataUrl);
        result = await extractTransactionsFromScreenshot(prepared.base64, prepared.mediaType);
      }
      if (result.error) {
        toast.error(result.error);
        void track("screenshot_failed", { reason: "server", kind: pdf ? "pdf" : "image" });
        return;
      }
      if (pdf && result.balances) {
        setStatement({ balances: result.balances, check: result.check ?? null });
        void track("pdf_statement_read", { has_balances: !!result.check, complete: result.check?.complete ?? null });
      }
      const found = result.transactions ?? [];
      if (found.length === 0) {
        toast.error("Nessuna transazione trovata nello screenshot.");
        return;
      }
      if (result.warning) toast.info(result.warning, { duration: 9000 });

      // Segna i movimenti già presenti (stesso giorno, importo e inizio descrizione)
      const supabase = createClient();
      const dates = found.map((t) => t.date).sort();
      const { data: existing } = await supabase
        .from("transactions")
        .select("date, amount, description")
        .eq("user_id", userId)
        .gte("date", dates[0])
        .lte("date", dates[dates.length - 1]);
      const { classified } = classifyRows(found, existing ?? []);

      setRows(
        classified.map(({ row, status }) => {
          const categoryId = categorize({ description: row.description }, { userRules, dictionary, categories });
          const cat = categoryId ? categories.find((c) => c.id === categoryId) : undefined;
          return {
            ...row,
            status,
            selected: status !== "exact",
            category_id: cat?.id ?? "",
            amountText: euroText(row.amount),
          };
        }),
      );
      void track("screenshot_extracted", { rows: found.length, kind: pdf ? "pdf" : "image" });
    } catch {
      toast.error("Qualcosa è andato storto. Riprova.");
      void track("screenshot_failed", { reason: "exception" });
    } finally {
      setExtracting(false);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  async function handleSave() {
    if (!rows) return;
    if (demoGuard()) return;
    const selected = rows.filter((r) => r.selected);
    if (!selected.length) { toast.error("Seleziona almeno una transazione."); return; }

    setSaving(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("transactions")
      .insert(
        selected.map((r) => ({
          user_id: userId,
          date: r.date,
          amount: r.amount,
          description: r.description,
          category_id: r.category_id || null,
          // "screenshot" non è ammesso dal vincolo transactions_source_check (manual, excel, import)
          source: "import",
        })),
      )
      .select("*, categories(id, name, color, icon)");

    if (error) {
      console.error("[screenshot] salvataggio non riuscito:", error.message);
      toast.error("Errore nel salvataggio.");
      void track("screenshot_failed", { reason: "save" });
    } else {
      toast.success(`${selected.length} transazioni importate!`);
      // onImported ricarica la pagina: prima va salvato l'evento
      await trackBeforeLeaving("screenshot_import_completed", { rows: selected.length });
      onImported(data ?? []);
      onClose();
    }
    setSaving(false);
  }

  const allSelected = rows?.every((r) => r.selected) ?? false;
  const patch = (i: number, p: Partial<Row>) =>
    setRows((prev) => prev!.map((r, j) => (j === i ? { ...r, ...p } : r)));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-background border rounded-xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b shrink-0">
          <h2 className="font-semibold text-lg">Importa da foto o PDF</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-xl leading-none">✕</button>
        </div>

        <div className="flex flex-col gap-4 overflow-y-auto p-6">
          {/* Drop zone */}
          {!rows && !extracting && (
            <div
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              onClick={() => inputRef.current?.click()}
              className="border-2 border-dashed rounded-xl p-10 flex flex-col items-center gap-3 cursor-pointer hover:border-primary hover:bg-primary/5 transition-colors text-center"
            >
              <span className="text-4xl">📷</span>
              <p className="font-medium text-sm">Trascina qui uno screenshot o il PDF dell&apos;estratto conto, oppure clicca per scegliere</p>
              <p className="text-xs text-muted-foreground">
                Screenshot della lista movimenti (PNG, JPG, WebP) oppure l&apos;estratto conto in PDF di qualsiasi banca.
                Dal PDF Flusso legge anche i saldi e controlla che non manchi nessun movimento.
              </p>
              <input
                ref={inputRef}
                type="file"
                accept="image/*,application/pdf,.pdf"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
              />
            </div>
          )}

          {pdfName && !rows && (
            <p className="text-sm rounded-lg border px-3 py-2">📄 {pdfName}</p>
          )}

          {/* Preview immagine */}
          {preview && !rows && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="preview" className="rounded-lg max-h-48 object-contain border w-full" />
          )}

          {/* Stato estrazione */}
          {extracting && (
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <span className="animate-spin">⏳</span>
              Analisi in corso con AI...
            </div>
          )}

          {!rows && (
            <p className="text-xs text-muted-foreground">
              Immagini e PDF vengono letti da un&apos;AI (Anthropic) e non vengono conservati da Flusso. Prima di salvare controlli tu date e importi.
            </p>
          )}

          {/* Tabella anteprima */}
          {rows && statement && (statement.balances.closing !== null || statement.check) && (
            <div className={`rounded-xl border p-3 text-sm flex flex-col gap-1 ${statement.check && !statement.check.complete ? "border-amber-500/50 bg-amber-500/10" : "bg-muted/30"}`}>
              {statement.balances.closing !== null && (
                <p>
                  Saldo finale nell&apos;estratto conto: <strong>{formatEuro(statement.balances.closing)}</strong>
                  {statement.balances.closingDate ? <> al {fmtDate(statement.balances.closingDate)}</> : null}.
                </p>
              )}
              {statement.check?.complete && <p>✅ I movimenti letti tornano con i saldi del PDF: non manca niente.</p>}
              {statement.check && !statement.check.complete && (
                <p>
                  ⚠️ Saldo iniziale più movimenti letti non fa il saldo finale: mancano <strong>{formatEuro(Math.abs(statement.check.missing))}</strong> di
                  {statement.check.missing < 0 ? " uscite" : " entrate"}. Controlla nel PDF se è sfuggita qualche riga e aggiungila a mano.
                </p>
              )}
              {statement.balances.closing !== null && (
                <p className="text-xs text-muted-foreground">
                  Dopo il salvataggio puoi usare questo saldo in <Link href="/dashboard/conti" className="underline">Conti → Quadra con la banca</Link>.
                </p>
              )}
            </div>
          )}

          {rows && (
            <>
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">{rows.filter(r => r.selected).length} di {rows.length} transazioni selezionate</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => inputRef.current?.click()}
                    className="text-xs text-muted-foreground hover:text-foreground underline"
                  >
                    Cambia file
                  </button>
                  <input
                    ref={inputRef}
                    type="file"
                    accept="image/*,application/pdf,.pdf"
                    className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
                  />
                </div>
              </div>

              <div className="rounded-lg border overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-xs text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left w-8">
                        <input
                          type="checkbox"
                          checked={allSelected}
                          onChange={(e) =>
                            setRows((prev) => prev!.map((r) => ({ ...r, selected: e.target.checked })))
                          }
                        />
                      </th>
                      <th className="px-3 py-2 text-left">Data</th>
                      <th className="px-3 py-2 text-left">Descrizione</th>
                      <th className="px-3 py-2 text-right">Importo</th>
                      <th className="px-3 py-2 text-left">Categoria</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, i) => (
                      <tr key={i} className={`border-t ${!row.selected ? "opacity-40" : ""}`}>
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            checked={row.selected}
                            onChange={(e) => patch(i, { selected: e.target.checked })}
                          />
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          <input
                            type="date"
                            value={row.date}
                            onChange={(e) => patch(i, { date: e.target.value })}
                            className="border rounded px-2 py-1 text-xs bg-background w-32"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            value={row.description}
                            onChange={(e) => patch(i, { description: e.target.value })}
                            className="border rounded px-2 py-1 text-xs bg-background w-full"
                          />
                          {row.status === "exact" && (
                            <span className="text-[10px] text-red-500">già presente</span>
                          )}
                          {row.status === "possible" && (
                            <span className="text-[10px] text-yellow-600">forse già presente (stessa data e importo)</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <input
                            type="text"
                            inputMode="decimal"
                            value={row.amountText}
                            onChange={(e) => {
                              const n = parseAmount(e.target.value);
                              patch(i, { amountText: e.target.value, ...(n !== null ? { amount: n } : {}) });
                            }}
                            className={`border rounded px-2 py-1 text-xs bg-background w-24 text-right ${row.amount >= 0 ? "text-green-600" : "text-red-500"}`}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <select
                            value={row.category_id}
                            onChange={(e) => patch(i, { category_id: e.target.value })}
                            className="border rounded px-2 py-1 text-xs bg-background"
                          >
                            <option value="">—</option>
                            {categories.map((c) => (
                              <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        {rows && (
          <div className="px-6 py-4 border-t shrink-0 flex justify-end gap-3">
            <button onClick={onClose} className="border rounded-md px-5 py-2 text-sm hover:bg-muted/50 transition-colors">
              Annulla
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !rows.some((r) => r.selected)}
              className="bg-primary text-primary-foreground rounded-md px-5 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {saving ? "Salvataggio..." : `Importa ${rows.filter((r) => r.selected).length} transazioni`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
