"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Suspense } from "react";

const TOTAL_STEPS = 3;

const USAGES = [
  { value: "solo",     label: "Da solo",                    icon: "🧍" },
  { value: "coppia",   label: "Con il partner",             icon: "👫" },
  { value: "famiglia", label: "In famiglia",                icon: "👨‍👩‍👧" },
  { value: "gruppo",   label: "Con coinquilini / amici",    icon: "🏠" },
];

function OnboardingInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isPreview = searchParams.get("preview") === "1";

  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [fullName, setFullName] = useState("");
  const [usage, setUsage] = useState("");

  async function handleComplete() {
    if (isPreview) {
      router.push("/dashboard?tour=1");
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

      router.push("/dashboard?tour=1");
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
              <p className="text-muted-foreground mt-1">Ci aiuta a mostrarti le funzioni più utili per te.</p>
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

        {/* Step 3 — Pronto */}
        {step === 3 && (
          <div className="flex flex-col gap-6 text-center">
            <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center text-3xl">
              🎉
            </div>
            <div>
              <h1 className="text-2xl font-bold">
                Pronto{fullName ? `, ${fullName.split(" ")[0]}` : ""}!
              </h1>
              <p className="text-muted-foreground mt-1">
                Il tuo account è configurato. Puoi iniziare ad aggiungere le tue transazioni.
              </p>
            </div>

            <div className="rounded-xl border p-4 text-left flex flex-col gap-3 text-sm bg-muted/20">
              <p className="font-semibold text-xs uppercase tracking-wide text-muted-foreground">Come iniziare</p>
              <div className="flex items-start gap-3">
                <span className="text-lg">➕</span>
                <div>
                  <p className="font-medium">Aggiungi le tue transazioni</p>
                  <p className="text-xs text-muted-foreground">Manualmente o importando l&apos;estratto conto Excel della tua banca.</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <span className="text-lg">📊</span>
                <div>
                  <p className="font-medium">Guarda dove vanno i soldi</p>
                  <p className="text-xs text-muted-foreground">La dashboard mostra entrate, uscite e breakdown per categoria.</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <span className="text-lg">🎯</span>
                <div>
                  <p className="font-medium">Imposta i tuoi obiettivi</p>
                  <p className="text-xs text-muted-foreground">Tieni traccia dei risparmi con obiettivi personalizzati.</p>
                </div>
              </div>
            </div>

            <button
              onClick={handleComplete}
              disabled={loading}
              className="w-full bg-primary text-primary-foreground rounded-md py-2.5 text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {loading ? "Avvio…" : "Vai alla dashboard →"}
            </button>
            <button onClick={() => setStep(2)} className="text-sm text-muted-foreground hover:underline">
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
