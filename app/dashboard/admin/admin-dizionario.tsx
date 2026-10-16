"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { normalizeText } from "@/lib/categorize";
import type { Proposal } from "@/lib/dictionary-proposals";
import { removeDictionaryEntry, saveDictionaryEntry } from "./dizionario-actions";

// Admin → "Dizionario condiviso" (migration 044): le parole dei negozi che valgono per tutti,
// le proposte nate dalle regole degli utenti, aggiunta e rimozione. Le regole personali degli
// utenti vengono sempre prima del dizionario (lib/categorize.ts → categorize).

type Entry = { id: string; keyword: string; category_name: string; source: string };

const SOURCE_LABEL: Record<string, string> = { base: "di partenza", utenti: "dagli utenti", admin: "aggiunta da te" };
const SHOWN = 40;

export function AdminDizionario({ entries: initial, proposals: initialProposals, categories }: {
  entries: Entry[];
  proposals: Proposal[];
  categories: string[];
}) {
  const [entries, setEntries] = useState(initial);
  const [proposals, setProposals] = useState(initialProposals);
  const [query, setQuery] = useState("");
  const [keyword, setKeyword] = useState("");
  const [category, setCategory] = useState(categories[0] ?? "");
  const [isPending, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const q = normalizeText(query);
    const list = q ? entries.filter(e => e.keyword.includes(q) || normalizeText(e.category_name).includes(q)) : entries;
    return [...list].sort((a, b) => a.keyword.localeCompare(b.keyword));
  }, [entries, query]);

  function save(kw: string, cat: string, source: "admin" | "utenti") {
    startTransition(async () => {
      const res = await saveDictionaryEntry(kw, cat, source);
      if (res.error || !res.id) { toast.error(res.error ?? "Errore."); return; }
      const norm = normalizeText(kw);
      setEntries(prev => [...prev.filter(e => e.keyword !== norm), { id: res.id!, keyword: norm, category_name: cat, source }]);
      setProposals(prev => prev.filter(p => p.keyword !== norm));
      if (source === "admin") setKeyword("");
      toast.success(`"${norm}" → ${cat}, per tutti`);
    });
  }

  function remove(e: Entry) {
    startTransition(async () => {
      const res = await removeDictionaryEntry(e.id);
      if (res.error) { toast.error(res.error); return; }
      setEntries(prev => prev.filter(x => x.id !== e.id));
      toast.success(`"${e.keyword}" tolta`);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold">📚 Dizionario condiviso</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Parole dei negozi → categoria, uguali per tutti ({entries.length}). Vengono dopo le regole personali di ognuno
          e prima delle parole già scritte nel codice.
        </p>
      </div>

      {proposals.length > 0 && (
        <div className="rounded-xl border-2 border-primary/40 bg-primary/5 p-4 flex flex-col gap-2">
          <p className="text-sm font-medium">Proposte dagli utenti</p>
          <p className="text-xs text-muted-foreground">Parole che almeno due persone hanno già insegnato a Flusso con la stessa categoria.</p>
          {proposals.map(p => (
            <div key={`${p.keyword}|${p.category_name}`} className="flex items-center gap-3 text-sm">
              <span className="flex-1 min-w-0 truncate"><strong>{p.keyword}</strong> → {p.category_name}
                <span className="text-xs text-muted-foreground"> · {p.users} persone</span></span>
              <button onClick={() => save(p.keyword, p.category_name, "utenti")} disabled={isPending}
                className="text-xs bg-primary text-primary-foreground rounded-lg px-3 py-1.5 hover:bg-primary/90 disabled:opacity-50">Approva</button>
            </div>
          ))}
        </div>
      )}

      <div className="rounded-xl border p-4 flex flex-col gap-2">
        <p className="text-sm font-medium">Aggiungi o correggi</p>
        <div className="flex flex-wrap gap-2">
          <input value={keyword} onChange={e => setKeyword(e.target.value)} placeholder="es. nen, iperal, sushi ko"
            className="flex-1 min-w-40 border rounded-lg px-3 py-2 text-sm bg-background" />
          <select value={category} onChange={e => setCategory(e.target.value)} className="border rounded-lg px-3 py-2 text-sm bg-background">
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <button onClick={() => keyword.trim() && save(keyword, category, "admin")} disabled={isPending || !keyword.trim()}
            className="bg-primary text-primary-foreground rounded-lg px-4 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-50">Salva</button>
        </div>
        <p className="text-xs text-muted-foreground">
          Le parole corte (meno di 6 lettere) valgono solo intere; quelle lunghe anche dentro altre parole: evita parole comuni come &quot;market&quot; o &quot;action&quot;.
        </p>
      </div>

      <div className="rounded-xl border p-4 flex flex-col gap-2">
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Cerca una parola o una categoria…"
          className="border rounded-lg px-3 py-2 text-sm bg-background" />
        <div className="flex flex-col divide-y">
          {filtered.slice(0, SHOWN).map(e => (
            <div key={e.id} className="flex items-center gap-3 py-1.5 text-sm">
              <span className="flex-1 min-w-0 truncate">{e.keyword} <span className="text-muted-foreground">→ {e.category_name}</span></span>
              <span className="text-[10px] text-muted-foreground whitespace-nowrap">{SOURCE_LABEL[e.source] ?? e.source}</span>
              <button onClick={() => remove(e)} disabled={isPending} title="Togli" className="text-xs text-muted-foreground hover:text-destructive px-1">✕</button>
            </div>
          ))}
        </div>
        {filtered.length > SHOWN && <p className="text-xs text-muted-foreground">Altre {filtered.length - SHOWN}: cerca per vederle.</p>}
        {filtered.length === 0 && <p className="text-xs text-muted-foreground">Nessuna parola trovata.</p>}
      </div>
    </div>
  );
}
