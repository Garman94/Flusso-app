"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { useDemoGuard } from "@/components/demo-context";
import { track } from "@/lib/track";
import { toast } from "sonner";
import type { EmailKind } from "@/lib/email-token";

const COLUMN: Record<EmailKind, "email_weekly" | "email_monthly"> = { weekly: "email_weekly", monthly: "email_monthly" };
const LABEL: Record<EmailKind, string> = { weekly: "Email del lunedì", monthly: "Riepilogo del mese" };

/**
 * Account → Avvisi: l'email del lunedì e il riepilogo del mese (migration 052). Se le colonne
 * mancano (`available` false) la sezione dice che arrivano presto invece di mostrare interruttori
 * che non salvano. Finché il giro non è partito: `startsOn` = "lunedì 7 dicembre"
 * (WEEKLY_FIRST_MONDAY), `monthlyStartsOn` = "7 dicembre" (MONTHLY_FIRST_DAY); poi null.
 */
export function EmailAlertsSection({
  userId, email, weekly, monthly = true, available, startsOn = null, monthlyStartsOn = null,
}: {
  userId: string; email: string | null; weekly: boolean; monthly?: boolean; available: boolean;
  startsOn?: string | null; monthlyStartsOn?: string | null;
}) {
  const box = useRef<HTMLDivElement>(null);

  // Dal link "Avvisi in Account" dell'email: la pagina arriva a pezzi e il browser non scorre da solo
  useEffect(() => {
    if (window.location.hash === "#avvisi") box.current?.scrollIntoView({ block: "start" });
  }, []);

  return (
    <div id="avvisi" ref={box} className="rounded-xl border p-6 flex flex-col gap-4 scroll-mt-20">
      <div>
        <h2 className="font-semibold">🔔 Avvisi</h2>
        <p className="text-xs text-muted-foreground mt-1">
          {email ? <>Le email arrivano a <strong className="text-foreground">{email}</strong>.</> : "Le email arrivano all'indirizzo del tuo account."}
        </p>
      </div>

      <EmailSwitch
        userId={userId} kind="weekly" initial={weekly} available={available}
        note={startsOn ? `La prima arriva ${startsOn}.` : null}
        text={available
          ? "Ogni lunedì mattina: quanto puoi spendere fino al prossimo stipendio e cosa c'è da pagare in settimana."
          : "Arriva presto: ogni lunedì quanto puoi spendere fino al prossimo stipendio."}
      />
      <EmailSwitch
        userId={userId} kind="monthly" initial={monthly} available={available}
        note={monthlyStartsOn ? `Parte dal ${monthlyStartsOn}.` : null}
        text={available
          ? "Quando si chiude il mese, se hai caricato i movimenti fino alla fine: quanto hai risparmiato, le spese cambiate di più e i budget."
          : "Arriva presto: com'è andato il mese appena chiuso."}
      />
    </div>
  );
}

function EmailSwitch({ userId, kind, initial, available, note, text }: {
  userId: string; kind: EmailKind; initial: boolean; available: boolean; note: string | null; text: string;
}) {
  const [on, setOn] = useState(initial);
  const [isPending, startTransition] = useTransition();
  const demoGuard = useDemoGuard();
  const label = LABEL[kind];

  function toggle() {
    if (demoGuard()) return;
    const next = !on;
    setOn(next);
    startTransition(async () => {
      const { error } = await createClient().from("profiles").update({ [COLUMN[kind]]: next }).eq("id", userId);
      if (error) {
        setOn(!next);
        toast.error("Errore nel salvataggio.");
        return;
      }
      void track("email_pref_changed", { kind, on: next });
      toast.success(next ? `${label}: attivato.` : `${label}: spento.`);
    });
  }

  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {text}
          {available && note && on ? ` ${note}` : ""}
        </p>
      </div>
      <button
        onClick={toggle}
        disabled={isPending || !available}
        className="min-h-11 min-w-11 flex items-center justify-center shrink-0 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"
        role="switch"
        aria-checked={on && available}
        aria-label={label}
      >
        <span className={`relative w-11 h-6 rounded-full transition-colors ${on && available ? "bg-primary" : "bg-muted-foreground/30"}`}>
          <span
            className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${on && available ? "translate-x-5" : "translate-x-0"}`}
          />
        </span>
      </button>
    </div>
  );
}
