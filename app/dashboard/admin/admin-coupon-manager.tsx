"use client";

import { useState } from "react";
import { toast } from "sonner";
import type { Plan } from "@/lib/plans";

interface Coupon {
  id: string;
  code: string;
  plan: Plan;
  used: boolean;
  used_by: string | null;
  used_at: string | null;
  notes: string | null;
  created_at: string;
}

const PLAN_LABELS: Record<string, string> = {
  premium: "Premium",
  founder: "Founder",
};

export function AdminCouponManager({ initialCoupons }: { initialCoupons: Coupon[] }) {
  const [coupons, setCoupons] = useState<Coupon[]>(initialCoupons);
  const [plan, setPlan] = useState<"premium" | "founder">("premium");
  const [notes, setNotes] = useState("");
  const [customCode, setCustomCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  async function handleCreate() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/create-coupon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, notes: notes || null, code: customCode || null }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Errore");
      setCoupons((prev) => [json.coupon, ...prev]);
      setNotes("");
      setCustomCode("");
      toast.success(`Coupon ${json.coupon.code} creato`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Errore nella creazione");
    } finally {
      setLoading(false);
    }
  }

  function copyToClipboard(code: string) {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(code);
      setTimeout(() => setCopied(null), 2000);
    });
  }

  const unused = coupons.filter((c) => !c.used);
  const used = coupons.filter((c) => c.used);

  return (
    <div className="flex flex-col gap-6">
      {/* Create form */}
      <div className="rounded-xl border p-5 flex flex-col gap-4">
        <h3 className="font-medium text-sm">Genera nuovo coupon</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">Piano</label>
            <select
              value={plan}
              onChange={(e) => setPlan(e.target.value as "premium" | "founder")}
              className="text-sm border rounded-md px-3 py-2 bg-background"
            >
              <option value="premium">Premium</option>
              <option value="founder">Founder</option>
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Codice personalizzato <span className="font-normal">(opzionale)</span>
            </label>
            <input
              type="text"
              value={customCode}
              onChange={(e) => setCustomCode(e.target.value.toUpperCase())}
              placeholder="Lascia vuoto per generare automaticamente"
              className="text-sm border rounded-md px-3 py-2 bg-background placeholder:text-muted-foreground/60"
            />
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-muted-foreground">
            Note interne <span className="font-normal">(opzionale)</span>
          </label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="es. per Marco, promo maggio 2026"
            className="text-sm border rounded-md px-3 py-2 bg-background placeholder:text-muted-foreground/60"
          />
        </div>
        <button
          onClick={handleCreate}
          disabled={loading}
          className="bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-50 w-fit"
        >
          {loading ? "Creazione…" : "Genera coupon"}
        </button>
      </div>

      {/* Coupon list */}
      {coupons.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">Nessun coupon creato.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {unused.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">
                Disponibili ({unused.length})
              </p>
              <div className="rounded-xl border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left px-4 py-2 font-medium text-xs">Codice</th>
                      <th className="text-left px-4 py-2 font-medium text-xs">Piano</th>
                      <th className="text-left px-4 py-2 font-medium text-xs hidden md:table-cell">Note</th>
                      <th className="text-left px-4 py-2 font-medium text-xs hidden md:table-cell">Creato</th>
                      <th className="px-4 py-2 text-xs" />
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {unused.map((c) => (
                      <tr key={c.id} className="hover:bg-muted/20">
                        <td className="px-4 py-2 font-mono text-xs">{c.code}</td>
                        <td className="px-4 py-2">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${c.plan === "founder" ? "bg-yellow-100 text-yellow-800 border-yellow-300" : "bg-purple-100 text-purple-800 border-purple-300"}`}>
                            {PLAN_LABELS[c.plan]}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-xs text-muted-foreground hidden md:table-cell">
                          {c.notes ?? "—"}
                        </td>
                        <td className="px-4 py-2 text-xs text-muted-foreground hidden md:table-cell">
                          {new Date(c.created_at).toLocaleDateString("it-IT")}
                        </td>
                        <td className="px-4 py-2 text-right">
                          <button
                            onClick={() => copyToClipboard(c.code)}
                            className="text-xs border rounded px-2 py-1 hover:bg-muted/50 transition-colors"
                          >
                            {copied === c.code ? "✓ Copiato" : "Copia"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {used.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">
                Utilizzati ({used.length})
              </p>
              <div className="rounded-xl border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left px-4 py-2 font-medium text-xs">Codice</th>
                      <th className="text-left px-4 py-2 font-medium text-xs">Piano</th>
                      <th className="text-left px-4 py-2 font-medium text-xs hidden md:table-cell">Note</th>
                      <th className="text-left px-4 py-2 font-medium text-xs hidden md:table-cell">Usato il</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {used.map((c) => (
                      <tr key={c.id} className="opacity-60">
                        <td className="px-4 py-2 font-mono text-xs line-through">{c.code}</td>
                        <td className="px-4 py-2">
                          <span className="text-xs font-medium px-2 py-0.5 rounded-full border bg-gray-100 text-gray-500 border-gray-200">
                            {PLAN_LABELS[c.plan]}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-xs text-muted-foreground hidden md:table-cell">
                          {c.notes ?? "—"}
                        </td>
                        <td className="px-4 py-2 text-xs text-muted-foreground hidden md:table-cell">
                          {c.used_at ? new Date(c.used_at).toLocaleDateString("it-IT") : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
