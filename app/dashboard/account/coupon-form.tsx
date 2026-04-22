"use client";

import { useState } from "react";
import { toast } from "sonner";

const PLAN_LABELS: Record<string, string> = {
  premium: "Premium",
  founder: "Founder",
};

export function CouponForm({ onUpgrade }: { onUpgrade: (plan: string) => void }) {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleRedeem() {
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) return;
    setLoading(true);
    try {
      const res = await fetch("/api/coupon/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: trimmed }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Errore");
      toast.success(`Coupon riscattato! Piano aggiornato a ${PLAN_LABELS[json.plan] ?? json.plan}.`);
      onUpgrade(json.plan);
      setCode("");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Coupon non valido");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        Hai ricevuto un codice coupon? Inseriscilo qui per attivare il tuo piano.
      </p>
      <div className="flex gap-2">
        <input
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          onKeyDown={(e) => e.key === "Enter" && handleRedeem()}
          placeholder="FLUSSO-XXXX-XXXX"
          className="flex-1 border rounded-md px-3 py-2 text-sm bg-background font-mono placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring"
          disabled={loading}
        />
        <button
          onClick={handleRedeem}
          disabled={!code.trim() || loading}
          className="bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
        >
          {loading ? "Verifica…" : "Riscatta"}
        </button>
      </div>
    </div>
  );
}
