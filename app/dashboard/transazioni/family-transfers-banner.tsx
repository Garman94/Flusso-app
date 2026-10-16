"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { formatEuro } from "@/lib/calculations";
import { familyTransferCandidates } from "@/lib/money";
import { markFamilyTransfers } from "./actions";

// Soldi che i componenti della famiglia si passano tra loro ("BONIFICO DISPOSTO DA GANGEMI
// SAMIRA"): non sono entrate né spese, i soldi restano in famiglia. Qui si propone di segnarli
// come giroconti (categoria Spostamenti) con una regola per i prossimi import. Logica in lib/money.ts.

type Tx = {
  id: string; amount: number; description: string;
  category_id: string | null; categories: { name: string } | null;
};
type Member = { name: string; is_owner?: boolean | null };
type Category = { id: string; name: string };

const DISMISSED = (member: string) => `flusso_giroconti_famiglia_no:${member.toLowerCase()}`;

export function FamilyTransfersBanner({ transactions, members, categories, onApplied }: {
  transactions: Tx[];
  members: Member[];
  categories: Category[];
  onApplied: (ids: string[], categoryId: string) => void;
}) {
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [saving, setSaving] = useState<string | null>(null);
  useEffect(() => {
    try {
      setDismissed(members.map(m => m.name).filter(n => localStorage.getItem(DISMISSED(n)) === "1"));
    } catch { /* niente */ }
  }, [members]);

  const transfer = categories.find(c => c.name.toLowerCase() === "spostamenti");
  const groups = useMemo(
    () => familyTransferCandidates(transactions, members).filter(g => !dismissed.includes(g.member)),
    [transactions, members, dismissed],
  );
  if (!transfer || groups.length === 0) return null;

  function dismiss(member: string) {
    try { localStorage.setItem(DISMISSED(member), "1"); } catch { /* niente */ }
    setDismissed(prev => [...prev, member]);
  }

  async function apply(member: string, ids: string[]) {
    setSaving(member);
    const res = await markFamilyTransfers(member, ids, transfer!.id);
    setSaving(null);
    if (res.error) { toast.error(res.error.includes("DEMO_READONLY") ? "Nella demo non si può salvare." : `Errore: ${res.error}`); return; }
    onApplied(res.affectedIds ?? ids, transfer!.id);
    toast.success(`${ids.length} movimenti con ${member} ora sono giroconti. Anche i prossimi lo saranno.`);
  }

  return (
    <div className="flex flex-col gap-3">
      {groups.map(g => {
        const incoming = g.txs.filter(t => Number(t.amount) > 0).reduce((s, t) => s + Number(t.amount), 0);
        const outgoing = g.txs.filter(t => Number(t.amount) < 0).reduce((s, t) => s - Number(t.amount), 0);
        return (
          <div key={g.member} className="rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 flex flex-col gap-2 text-sm">
            <p className="font-medium">💞 Soldi tra te e {g.member}</p>
            <p className="text-muted-foreground">
              {g.txs.length} movimenti
              {incoming > 0 && <> ({formatEuro(incoming)} ricevuti</>}
              {incoming > 0 && outgoing > 0 && ", "}
              {outgoing > 0 && <>{incoming > 0 ? "" : " ("}{formatEuro(outgoing)} mandati</>}
              {(incoming > 0 || outgoing > 0) && ")"} contano come entrate o spese. Se sono soldi che vi passate tra voi,
              non cambiano quanto avete in famiglia: meglio segnarli come giroconti.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => apply(g.member, g.txs.map(t => t.id))}
                disabled={saving !== null}
                className="bg-primary text-primary-foreground rounded-lg px-3 py-1.5 text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
              >
                {saving === g.member ? "…" : "Sì, sono giroconti"}
              </button>
              <button onClick={() => dismiss(g.member)} className="text-sm text-muted-foreground px-2">No</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
