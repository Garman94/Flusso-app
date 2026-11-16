"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { useDemoGuard } from "@/components/demo-context";
import { track } from "@/lib/track";
import { toast } from "sonner";

/**
 * Account → Avvisi: l'email del lunedì (migration 052). Se la colonna manca (`available` false)
 * la sezione dice che arriva presto invece di mostrare un interruttore che non salva.
 */
export function EmailAlertsSection({
  userId, email, weekly, available,
}: { userId: string; email: string | null; weekly: boolean; available: boolean }) {
  const [on, setOn] = useState(weekly);
  const [isPending, startTransition] = useTransition();
  const demoGuard = useDemoGuard();
  const box = useRef<HTMLDivElement>(null);

  // Dal link "Avvisi in Account" dell'email: la pagina arriva a pezzi e il browser non scorre da solo
  useEffect(() => {
    if (window.location.hash === "#avvisi") box.current?.scrollIntoView({ block: "start" });
  }, []);

  function toggle() {
    if (demoGuard()) return;
    const next = !on;
    setOn(next);
    startTransition(async () => {
      const { error } = await createClient().from("profiles").update({ email_weekly: next }).eq("id", userId);
      if (error) {
        setOn(!next);
        toast.error("Errore nel salvataggio.");
        return;
      }
      void track("email_pref_changed", { kind: "weekly", on: next });
      toast.success(next ? "Email del lunedì attivata." : "Email del lunedì spenta.");
    });
  }

  return (
    <div id="avvisi" ref={box} className="rounded-xl border p-6 flex flex-col gap-4 scroll-mt-20">
      <div>
        <h2 className="font-semibold">🔔 Avvisi</h2>
        <p className="text-xs text-muted-foreground mt-1">
          {email ? <>Le email arrivano a <strong className="text-foreground">{email}</strong>.</> : "Le email arrivano all'indirizzo del tuo account."}
        </p>
      </div>

      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium">Email del lunedì</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {available
              ? "Ogni lunedì mattina: quanto puoi spendere fino al prossimo stipendio e cosa c'è da pagare in settimana."
              : "Arriva presto: ogni lunedì quanto puoi spendere fino al prossimo stipendio."}
          </p>
        </div>
        <button
          onClick={toggle}
          disabled={isPending || !available}
          className="min-h-11 min-w-11 flex items-center justify-center shrink-0 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"
          role="switch"
          aria-checked={on && available}
          aria-label="Email del lunedì"
        >
          <span className={`relative w-11 h-6 rounded-full transition-colors ${on && available ? "bg-primary" : "bg-muted-foreground/30"}`}>
            <span
              className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${on && available ? "translate-x-5" : "translate-x-0"}`}
            />
          </span>
        </button>
      </div>
    </div>
  );
}
