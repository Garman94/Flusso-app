"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";

const USE_CASES = [
  { value: "saas", label: "SaaS / App web" },
  { value: "ecommerce", label: "E-commerce" },
  { value: "personal", label: "Progetto personale" },
  { value: "agency", label: "Agenzia / client work" },
  { value: "other", label: "Altro" },
];

const TOTAL_STEPS = 3;

export default function OnboardingPage() {
  const router = useRouter();
  const supabase = createClient();

  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [fullName, setFullName] = useState("");
  const [useCase, setUseCase] = useState("");

  async function handleComplete() {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push("/auth/login");
        return;
      }

      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: fullName.trim() || undefined,
          use_case: useCase || undefined,
          onboarding_completed: true,
        })
        .eq("id", session.user.id);

      if (error) throw error;

      router.push("/dashboard");
    } catch (err) {
      console.error(err);
      toast.error("Qualcosa è andato storto. Riprova.");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">

        {/* Progress bar */}
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

        {/* Step 1 — Name */}
        {step === 1 && (
          <div className="flex flex-col gap-6">
            <div>
              <h1 className="text-2xl font-bold">Benvenuto! Come ti chiami?</h1>
              <p className="text-muted-foreground mt-1">
                Puoi cambiarlo in qualsiasi momento dalle impostazioni.
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <label htmlFor="fullName" className="text-sm font-medium">
                Nome e cognome
              </label>
              <input
                id="fullName"
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && fullName.trim() && setStep(2)}
                placeholder="Mario Rossi"
                autoFocus
                className="border rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            <button
              onClick={() => setStep(2)}
              disabled={!fullName.trim()}
              className="w-full bg-primary text-primary-foreground rounded-md py-2.5 text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Continua →
            </button>
          </div>
        )}

        {/* Step 2 — Use case */}
        {step === 2 && (
          <div className="flex flex-col gap-6">
            <div>
              <h1 className="text-2xl font-bold">Come userai l&apos;app?</h1>
              <p className="text-muted-foreground mt-1">
                Ci aiuta a capire come migliorare il prodotto.
              </p>
            </div>

            <div className="flex flex-col gap-2">
              {USE_CASES.map((uc) => (
                <button
                  key={uc.value}
                  type="button"
                  onClick={() => setUseCase(uc.value)}
                  className={`w-full text-left px-4 py-3 rounded-lg border text-sm font-medium transition-colors ${
                    useCase === uc.value
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-border hover:border-primary/50 hover:bg-muted/50"
                  }`}
                >
                  {uc.label}
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
                disabled={!useCase}
                className="flex-1 bg-primary text-primary-foreground rounded-md py-2.5 text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Continua →
              </button>
            </div>
          </div>
        )}

        {/* Step 3 — Ready */}
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
                Il tuo account è configurato. Puoi iniziare subito.
              </p>
            </div>

            <div className="rounded-lg border p-4 text-left flex flex-col gap-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Nome</span>
                <span className="font-medium">{fullName || "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Utilizzo</span>
                <span className="font-medium">
                  {USE_CASES.find((u) => u.value === useCase)?.label ?? "—"}
                </span>
              </div>
            </div>

            <button
              onClick={handleComplete}
              disabled={loading}
              className="w-full bg-primary text-primary-foreground rounded-md py-2.5 text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? "Salvataggio..." : "Vai alla dashboard →"}
            </button>

            <button
              onClick={() => setStep(2)}
              className="text-sm text-muted-foreground hover:underline"
            >
              ← Modifica
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
