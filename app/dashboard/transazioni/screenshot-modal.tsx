"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { extractTransactionsFromScreenshot, ExtractedTransaction } from "./screenshot-action";

type Category = { id: string; name: string; color: string; icon: string };

type Props = {
  userId: string;
  categories: Category[];
  onClose: () => void;
  onImported: (transactions: any[]) => void;
};

type Row = ExtractedTransaction & { selected: boolean; category_id: string };

export function ScreenshotModal({ userId, categories, onClose, onImported }: Props) {
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
    const reader = new FileReader();
    reader.onload = async (e) => {
      const dataUrl = e.target?.result as string;
      setPreview(dataUrl);
      setRows(null);
      setExtracting(true);

      // Estrai base64 puro (senza il prefisso data:image/...;base64,)
      const base64 = dataUrl.split(",")[1];
      const mediaType = file.type as "image/jpeg" | "image/png" | "image/webp" | "image/gif";

      const result = await extractTransactionsFromScreenshot(base64, mediaType);
      setExtracting(false);

      if (result.error) {
        toast.error(result.error);
        return;
      }
      if (!result.transactions?.length) {
        toast.error("Nessuna transazione trovata nello screenshot.");
        return;
      }

      setRows(
        result.transactions.map((t) => ({ ...t, selected: true, category_id: "" })),
      );
    };
    reader.readAsDataURL(file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  async function handleSave() {
    if (!rows) return;
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
          source: "screenshot",
        })),
      )
      .select("*, categories(id, name, color, icon)");

    if (error) {
      toast.error("Errore nel salvataggio.");
    } else {
      toast.success(`${selected.length} transazioni importate!`);
      onImported(data ?? []);
      onClose();
    }
    setSaving(false);
  }

  const allSelected = rows?.every((r) => r.selected) ?? false;

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
          {!rows && (
            <div
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              onClick={() => inputRef.current?.click()}
              className="border-2 border-dashed rounded-xl p-10 flex flex-col items-center gap-3 cursor-pointer hover:border-primary hover:bg-primary/5 transition-colors text-center"
            >
              <span className="text-4xl">📷</span>
              <p className="font-medium text-sm">Trascina uno screenshot qui oppure clicca per scegliere</p>
              <p className="text-xs text-muted-foreground">PNG, JPG, WebP — screenshot del tuo estratto conto o lista movimenti</p>
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

              <div className="rounded-lg border overflow-hidden">
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
                            onChange={(e) =>
                              setRows((prev) =>
                                prev!.map((r, j) => (j === i ? { ...r, selected: e.target.checked } : r)),
                              )
                            }
                          />
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          <input
                            type="date"
                            value={row.date}
                            onChange={(e) =>
                              setRows((prev) => prev!.map((r, j) => (j === i ? { ...r, date: e.target.value } : r)))
                            }
                            className="border rounded px-2 py-1 text-xs bg-background w-32"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            value={row.description}
                            onChange={(e) =>
                              setRows((prev) => prev!.map((r, j) => (j === i ? { ...r, description: e.target.value } : r)))
                            }
                            className="border rounded px-2 py-1 text-xs bg-background w-full"
                          />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <input
                            type="text"
                            value={row.amount}
                            onChange={(e) =>
                              setRows((prev) =>
                                prev!.map((r, j) =>
                                  j === i ? { ...r, amount: parseFloat(e.target.value) || 0 } : r,
                                ),
                              )
                            }
                            className={`border rounded px-2 py-1 text-xs bg-background w-24 text-right ${row.amount >= 0 ? "text-green-600" : "text-red-500"}`}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <select
                            value={row.category_id}
                            onChange={(e) =>
                              setRows((prev) => prev!.map((r, j) => (j === i ? { ...r, category_id: e.target.value } : r)))
                            }
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
