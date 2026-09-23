"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { track } from "@/lib/track";
import { useDemoGuard } from "@/components/demo-context";
import { prepareImage } from "@/lib/image-prepare";
import { classifyRows, type DedupStatus } from "@/lib/import-dedup";
import { guessFromDescription, matchUserRule, type UserRule } from "@/lib/categorize";
import { parseAmount } from "@/lib/import-parse";
import type { ExtractedTransaction } from "@/lib/screenshot-extract";
import { extractTransactionsFromScreenshot } from "./screenshot-action";

type Category = { id: string; name: string; color: string; icon: string };

type Props = {
  userId: string;
  categories: Category[];
  userRules?: UserRule[];
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

export function ScreenshotModal({ userId, categories, userRules = [], onClose, onImported }: Props) {
  const demoGuard = useDemoGuard();
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleFile(file: File) {
    if (!file.type.startsWith("image/")) {
      toast.error("Carica un'immagine (PNG, JPG, WebP).");
      return;
    }
    setRows(null);
    setExtracting(true);
    try {
      // Riduce e converte in JPEG: gli screenshot del telefono pesano più del limite di invio
      let prepared;
      try {
        prepared = await prepareImage(file);
      } catch {
        toast.error("Non riesco ad aprire questa immagine. Prova con un PNG o un JPG.");
        void track("screenshot_failed", { reason: "decode" });
        return;
      }
      setPreview(prepared.dataUrl);

      const result = await extractTransactionsFromScreenshot(prepared.base64, prepared.mediaType);
      if (result.error) {
        toast.error(result.error);
        void track("screenshot_failed", { reason: "server" });
        return;
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
          const byRule = matchUserRule(row.description, userRules);
          const name = byRule ? null : guessFromDescription(row.description);
          const cat = byRule ? categories.find((c) => c.id === byRule) : name ? categories.find((c) => c.name === name) : undefined;
          return {
            ...row,
            status,
            selected: status !== "exact",
            category_id: cat?.id ?? "",
            amountText: euroText(row.amount),
          };
        }),
      );
      void track("screenshot_extracted", { rows: found.length });
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
      void track("screenshot_import_completed", { rows: selected.length });
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
          <h2 className="font-semibold text-lg">Importa da screenshot</h2>
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
              <p className="font-medium text-sm">Trascina uno screenshot qui oppure clicca per scegliere</p>
              <p className="text-xs text-muted-foreground">
                Screenshot della lista movimenti (PNG, JPG, WebP). Se l&apos;elenco è lungo, fanne più di uno.
              </p>
              <input
                ref={inputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
              />
            </div>
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
              L&apos;immagine viene letta da un&apos;AI (Anthropic) e non viene conservata da Flusso. Prima di salvare controlli tu date e importi.
            </p>
          )}

          {/* Tabella anteprima */}
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
                    Cambia immagine
                  </button>
                  <input
                    ref={inputRef}
                    type="file"
                    accept="image/*"
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
