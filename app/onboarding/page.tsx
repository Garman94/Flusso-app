"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { track } from "@/lib/track";
import { TRIAL_DAYS } from "@/lib/config";
import { Suspense } from "react";

const TOTAL_STEPS = 3;

const USAGES = [
  { value: "solo",     label: "Da solo",                    icon: "🧍" },
  { value: "coppia",   label: "Con il partner",             icon: "👫" },
  { value: "famiglia", label: "In famiglia",                icon: "👨‍👩‍👧" },
  { value: "gruppo",   label: "Con coinquilini / amici",    icon: "🏠" },
];

// Dove atterrare a fine onboarding. L'import parte già aperto e senza tour sopra.
const DESTINATIONS = {
  import:    "/dashboard/transazioni?import=1&notour=1",
  dashboard: "/dashboard?tour=1",
} as const;

function OnboardingInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isPreview = searchParams.get("preview") === "1";

  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [fullName, setFullName] = useState("");
  const [usage, setUsage] = useState("");

  async function finish(dest: keyof typeof DESTINATIONS) {
    const href = DESTINATIONS[dest];
    if (isPreview) {
      router.push(href);
      return;
    }

    setLoading(true);
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push("/auth/login"); return; }

      await supabase
        .from("profiles")
        .update({ full_name: fullName.trim() || undefined })
        .eq("id", session.user.id);

      // usage_type esiste dalla migration 036: se manca, l'errore si ignora e si va avanti
      if (usage) {
        await supabase.from("profiles").update({ usage_type: usage }).eq("id", session.user.id);
      }

      void track("onboarding_completed", { usage: usage || null, dest });
      router.push(href);
    } catch {
      toast.error("Qualcosa è andato storto. Riprova.");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">

        {isPreview && (
          <div className="mb-6 rounded-lg border border-yellow-500/40 bg-yellow-500/10 px-4 py-2 text-xs text-yellow-700 dark:text-yellow-400 flex items-center gap-2">
            <span>👀</span> Anteprima admin — nessun dato verrà salvato.
          </div>
        )}

        {/* Progress */}
        <div className="mb-8">
          <div className="flex justify-between text-xs text-muted-foreground mb-2">
            <span>Configurazione account</span>
            <span>{step} / {TOTAL_STEPS}</span>
          </div>
          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-300"
              style={{ width: `${(step / TOTAL_STEPS) * 100}%` }}
            />
          </div>
        </div>

        {/* Step 1 — Nome */}
        {step === 1 && (
          <div className="flex flex-col gap-6">
            <div>
              <h1 className="text-2xl font-bold">Benvenuto in Flusso! 👋</h1>
              <p className="text-muted-foreground mt-1">Come ti chiami?</p>
            </div>
            <input
              type="text"
              value={fullName}
              onChange={e => setFullName(e.target.value)}
              onKeyDown={e => e.key === "Enter" && fullName.trim() && setStep(2)}
              placeholder="Il tuo nome"
              autoFocus
              className="border rounded-md px-3 py-2.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <button
              onClick={() => setStep(2)}
              disabled={!fullName.trim()}
              className="w-full bg-primary text-primary-foreground rounded-md py-2.5 text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Continua →
            </button>
            <button onClick={() => setStep(2)} className="text-xs text-muted-foreground hover:underline text-center">
              Salta per ora
            </button>
          </div>
        )}

        {/* Step 2 — Utilizzo */}
        {step === 2 && (
          <div className="flex flex-col gap-6">
            <div>
              <h1 className="text-2xl font-bold">Come userai Flusso?</h1>
              <p className="text-muted-foreground mt-1">Lo uso per capire a chi serve di più e cosa migliorare.</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {USAGES.map(u => (
                <button
                  key={u.value}
                  type="button"
                  onClick={() => setUsage(u.value)}
                  className={`flex flex-col items-center gap-2 px-4 py-4 rounded-xl border-2 text-sm font-medium transition-all ${
                    usage === u.value
                      ? "border-primary bg-primary/5 text-primary scale-[1.02]"
                      : "border-border hover:border-primary/40 hover:bg-muted/40"
                  }`}
                >
                  <span className="text-2xl">{u.icon}</span>
                  {u.label}
                </button>
              ))}
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setStep(1)}
                className="flex-1 border rounded-md py-2.5 text-sm font-medium hover:bg-muted/50 transition-colors"
              >
                ← Indietro
              </button>
              <button
                onClick={() => setStep(3)}
                disabled={!usage}
                className="flex-1 bg-primary text-primary-foreground rounded-md py-2.5 text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Continua →
              </button>
            </div>
          </div>
        )}

        {/* Step 3 — Da dove partire: dritti al primo valore */}
        {step === 3 && (
          <div className="flex flex-col gap-6">
            <div className="text-center">
              <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center text-3xl mb-3">
                🎉
              </div>
              <h1 className="text-2xl font-bold">
                Pronto{fullName ? `, ${fullName.split(" ")[0]}` : ""}!
              </h1>
              <p className="text-muted-foreground mt-1">
                Per i primi {TRIAL_DAYS} giorni hai anche Premium. Il modo più veloce per vedere dove vanno i tuoi soldi è caricare un estratto conto.
              </p>
            </div>

            <button
              onClick={() => finish("import")}
              disabled={loading}
              className="w-full bg-primary text-primary-foreground rounded-xl p-4 text-left flex items-start gap-3 hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              <span className="text-2xl">📁</span>
              <span className="flex flex-col gap-0.5">
                <span className="font-semibold text-sm">{loading ? "Avvio…" : "Importa il mio estratto conto"}</span>
                <span className="text-xs opacity-90">
                  In home banking cerca <em>Movimenti</em> e poi <em>Esporta</em> (Excel o CSV). Ci vogliono due minuti.
                </span>
              </span>
            </button>

            <button
              onClick={() => finish("dashboard")}
              disabled={loading}
              className="text-sm text-muted-foreground hover:text-foreground hover:underline text-center"
            >
              Prima do un&apos;occhiata alla dashboard →
            </button>

            <button onClick={() => setStep(2)} className="text-xs text-muted-foreground hover:underline text-center">
              ← Modifica
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function OnboardingPage() {
  return (
    <Suspense>
      <OnboardingInner />
    </Suspense>
  );
}
