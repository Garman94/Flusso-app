"use client";

import { Suspense, useState, type MouseEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { trackBeforeLeaving } from "@/lib/track";
import { TRIAL_DAYS } from "@/lib/config";
import { isDemoEmail } from "@/lib/demo";
import { todayISO } from "@/lib/dates";
import { currentPeriod } from "@/lib/period";
import { parseAmount } from "@/lib/import-parse";
import { formatEuro } from "@/lib/calculations";
import { balanceAtPeriodStart, firstSpendEstimate, ESTIMATE_RESERVE_SHARE } from "@/lib/first-estimate";
import { BankExportGuide } from "@/app/dashboard/transazioni/bank-export-guide";

// Benvenuto (rifatto il 2026-11-10): nome, banca, stipendio, saldo di oggi e una prima stima di
// quanto si può spendere, poi dritti al file della banca. Le tre domande si possono saltare tutte.

const TOTAL_STEPS = 5;

// Dove atterrare a fine benvenuto. L'import parte già aperto e senza tour sopra.
const DESTINATIONS = {
  import:    "/dashboard/transazioni?import=1&notour=1",
  dashboard: "/dashboard?tour=1",
  account:   "/dashboard/account",
} as const;

// I nomi delle banche come li scrive la guida (che non va toccata): servono solo per l'evento.
const BANK_KEYS: Record<string, string> = {
  "Intesa Sanpaolo": "intesa",
  "Poste": "poste",
  "Revolut": "revolut",
  "N26": "n26",
  "Altra banca": "altra",
};

const PAY_DAYS = Array.from({ length: 28 }, (_, i) => i + 1);

function dateFromISO(iso: string): Date {
  return new Date(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
}

/** "26 novembre" */
function dayMonth(iso: string): string {
  return dateFromISO(iso).toLocaleDateString("it-IT", { day: "numeric", month: "long" });
}

/** Euro senza centesimi: "1.250 €" */
function euro(n: number): string {
  return new Intl.NumberFormat("it-IT", {
    style: "currency", currency: "EUR", maximumFractionDigits: 0, useGrouping: "always",
  } as Intl.NumberFormatOptions).format(n);
}

const primaryBtn = "w-full min-h-11 bg-primary text-primary-foreground rounded-md py-2.5 text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors";
const linkBtn = "min-h-11 text-sm text-muted-foreground hover:text-foreground hover:underline text-center";

function OnboardingInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isPreview = searchParams.get("preview") === "1";

  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [fullName, setFullName] = useState("");
  const [bank, setBank] = useState<string | null>(null);
  /** null = non ha risposto; 0 = mese solare; 1-28 = giorno dello stipendio */
  const [payDay, setPayDay] = useState<number | null>(null);
  const [balanceText, setBalanceText] = useState("");
  const [balance, setBalance] = useState<number | null>(null);
  const [balanceError, setBalanceError] = useState(false);

  const today = todayISO();
  const effectivePayDay = payDay ?? 0;
  const estimate = firstSpendEstimate(balance, effectivePayDay, today);
  const period = currentPeriod(effectivePayDay, dateFromISO(today));
  const firstName = fullName.trim().split(" ")[0];

  function next() { setStep(s => Math.min(TOTAL_STEPS, s + 1)); }
  function back() { setStep(s => Math.max(1, s - 1)); }

  // La guida della banca è la stessa dell'import e non sa di essere qui: ascolto i clic da fuori.
  function onGuideClick(e: MouseEvent<HTMLDivElement>) {
    const target = e.target as HTMLElement;
    // "Scrivi a Marco" porta ad Account, ma finché il benvenuto non è finito la dashboard ci
    // rimanderebbe qui: chiudo il benvenuto (salvando quello che c'è) e poi ci vado.
    if (target.closest("a[href='/dashboard/account']")) {
      e.preventDefault();
      e.stopPropagation();
      void finish("account");
      return;
    }
    const chip = target.closest("button");
    const key = chip ? BANK_KEYS[chip.textContent?.trim() ?? ""] : undefined;
    if (key) setBank(key);
  }

  function confirmBalance() {
    const parsed = parseAmount(balanceText);
    if (parsed === null) { setBalanceError(true); return; }
    setBalance(Math.round(parsed * 100) / 100);
    setBalanceError(false);
    next();
  }

  function skipBalance() {
    setBalance(null);
    setBalanceText("");
    setBalanceError(false);
    next();
  }

  async function finish(dest: keyof typeof DESTINATIONS) {
    const href = DESTINATIONS[dest];
    if (isPreview) { router.push(href); return; }

    setLoading(true);
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push("/auth/login"); return; }
      // la demo è in sola lettura (e non passa mai di qui): nessuna scrittura
      if (isDemoEmail(session.user.email)) { router.push(href); return; }

      const uid = session.user.id;
      const notSaved: string[] = [];

      const name = fullName.trim();
      if (name) {
        const { error } = await supabase.from("profiles").update({ full_name: name }).eq("id", uid);
        if (error) notSaved.push("il nome");
      }

      if (payDay !== null) {
        const { error } = await supabase.from("profiles").update({ pay_day: payDay }).eq("id", uid);
        if (error) notSaved.push("il giorno dello stipendio");
      }

      // Saldo: come la card in dashboard, quello di oggi riportato a inizio periodo togliendo i
      // movimenti già registrati (di solito nessuno, ma il benvenuto si può fare anche dopo).
      if (balance !== null && estimate) {
        const { data: txs, error: txError } = await supabase
          .from("transactions")
          .select("date, amount")
          .eq("user_id", uid)
          .gte("date", estimate.from)
          .lte("date", today);
        const start = txError ? null : balanceAtPeriodStart(balance, today, estimate.from, txs ?? []);
        const { error } = start === null
          ? { error: txError }
          : await supabase
              .from("profiles")
              .update({ period_starting_balance: start, period_starting_balance_date: estimate.from })
              .eq("id", uid);
        if (error) notSaved.push("il saldo");
      }

      // Benvenuto fatto: la dashboard non ci rimanda più qui (migration 045)
      const { error: doneError } = await supabase
        .from("profiles")
        .update({ onboarded_at: new Date().toISOString() })
        .eq("id", uid);
      if (doneError) {
        toast.error("Non riesco a salvare. Controlla la connessione e riprova.");
        setLoading(false);
        return;
      }
      if (notSaved.length) toast.error(`Non sono riuscito a salvare ${notSaved.join(", ")}: puoi farlo dopo dalla dashboard.`);

      // mai importi negli eventi
      await trackBeforeLeaving("onboarding_completed", {
        bank,
        has_payday: payDay !== null,
        has_balance: balance !== null,
        dest,
      });
      router.push(href);
    } catch {
      toast.error("Qualcosa è andato storto. Riprova.");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-8">
      <div className="w-full max-w-md">

        {isPreview && (
          <div className="mb-6 rounded-lg border border-yellow-500/40 bg-yellow-500/10 px-4 py-2 text-xs text-yellow-700 dark:text-yellow-400 flex items-center gap-2">
            <span>👀</span> Anteprima admin — nessun dato verrà salvato.
          </div>
        )}

        {/* Progress */}
        <div className="mb-8">
          <div className="flex justify-between text-xs text-muted-foreground mb-2">
            <span>Primi passi</span>
            <span>{step} / {TOTAL_STEPS}</span>
          </div>
          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-300"
              style={{ width: `${(step / TOTAL_STEPS) * 100}%` }}
            />
          </div>
        </div>

        {/* 1 — Nome */}
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
              onKeyDown={e => e.key === "Enter" && fullName.trim() && next()}
              placeholder="Il tuo nome"
              aria-label="Il tuo nome"
              autoFocus
              className="border rounded-md px-3 py-2.5 min-h-11 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <button onClick={next} disabled={!fullName.trim()} className={primaryBtn}>
              Continua →
            </button>
            <button onClick={next} className={linkBtn}>Salta per ora</button>
          </div>
        )}

        {/* 2 — Banca: la guida subito, così il file è pronto quando serve */}
        {step === 2 && (
          <div className="flex flex-col gap-5">
            <div>
              <h1 className="text-2xl font-bold">In che banca sei?</h1>
              <p className="text-muted-foreground mt-1">
                Tocca la tua: ti dico dove trovare il file dei movimenti. Tra poco lo carichi e Flusso fa i conti da solo.
              </p>
            </div>
            <div onClickCapture={onGuideClick}>
              <BankExportGuide />
            </div>
            <p className="text-sm text-muted-foreground">
              📄 Hai solo il <strong className="text-foreground">PDF dell&apos;estratto conto</strong>? Va bene lo stesso:
              Flusso lo legge con l&apos;AI. È una funzione Premium, inclusa nei tuoi primi {TRIAL_DAYS} giorni.
            </p>
            <button onClick={next} className={primaryBtn}>Continua →</button>
            <div className="flex justify-between">
              <button onClick={back} className={linkBtn}>← Indietro</button>
              <button onClick={() => { setBank(null); next(); }} className={linkBtn}>Salta</button>
            </div>
          </div>
        )}

        {/* 3 — Stipendio: decide dove finisce il "mese" */}
        {step === 3 && (
          <div className="flex flex-col gap-5">
            <div>
              <h1 className="text-2xl font-bold">Quando arriva lo stipendio?</h1>
              <p className="text-muted-foreground mt-1">
                Così il tuo mese va da uno stipendio all&apos;altro, e i conti tornano con i soldi che hai davvero.
              </p>
            </div>
            <div className="grid grid-cols-7 gap-1.5" role="group" aria-label="Giorno dello stipendio">
              {PAY_DAYS.map(d => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setPayDay(d)}
                  aria-pressed={payDay === d}
                  aria-label={`Giorno ${d} del mese`}
                  className={`h-11 rounded-md border text-sm font-medium transition-colors ${
                    payDay === d ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground -mt-2">Arriva il 29, il 30 o il 31? Scegli il 28.</p>
            <button
              type="button"
              onClick={() => setPayDay(0)}
              aria-pressed={payDay === 0}
              className={`min-h-11 rounded-md border px-3 py-2 text-sm text-left transition-colors ${
                payDay === 0 ? "border-primary bg-primary/10 font-medium" : "hover:bg-muted"
              }`}
            >
              Non ho uno stipendio fisso: uso il mese dal 1° all&apos;ultimo giorno
            </button>
            {payDay !== null && (
              <p className="text-sm rounded-md bg-muted/40 px-3 py-2">
                Il tuo mese adesso va dal <strong>{dayMonth(period.from)}</strong> al <strong>{dayMonth(period.to)}</strong>.
                {payDay > 0 && " Se lo stipendio cade di sabato o domenica, conto il giorno lavorativo più vicino."}
              </p>
            )}
            <button onClick={next} disabled={payDay === null} className={primaryBtn}>Continua →</button>
            <div className="flex justify-between">
              <button onClick={back} className={linkBtn}>← Indietro</button>
              <button onClick={() => { setPayDay(null); next(); }} className={linkBtn}>Salta</button>
            </div>
          </div>
        )}

        {/* 4 — Saldo di oggi: basta questo per una prima stima */}
        {step === 4 && (
          <div className="flex flex-col gap-5">
            <div>
              <h1 className="text-2xl font-bold">Quanto hai sul conto oggi?</h1>
              <p className="text-muted-foreground mt-1">
                Guarda il saldo nell&apos;app della banca. Ti serve per sapere subito quanto puoi spendere; lo correggi quando vuoi.
              </p>
            </div>
            <div className="flex flex-col gap-1.5">
              <div className="relative">
                <input
                  type="text"
                  inputMode="decimal"
                  value={balanceText}
                  onChange={e => { setBalanceText(e.target.value); setBalanceError(false); }}
                  onKeyDown={e => e.key === "Enter" && balanceText.trim() && confirmBalance()}
                  placeholder="es. 1.250,00"
                  aria-label="Saldo di oggi in euro"
                  aria-invalid={balanceError}
                  autoFocus
                  className="w-full border rounded-md pl-3 pr-8 py-2.5 min-h-11 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">€</span>
              </div>
              {balanceError && (
                <p className="text-xs text-red-600 dark:text-red-400">Scrivi solo la cifra, per esempio 1.250,00 (o -80 se sei in rosso).</p>
              )}
              <p className="text-xs text-muted-foreground">Lo vedi solo tu.</p>
            </div>
            <button onClick={confirmBalance} disabled={!balanceText.trim()} className={primaryBtn}>Continua →</button>
            <div className="flex justify-between">
              <button onClick={back} className={linkBtn}>← Indietro</button>
              <button onClick={skipBalance} className={linkBtn}>Salta</button>
            </div>
          </div>
        )}

        {/* 5 — Prima stima e poi il file della banca */}
        {step === 5 && (
          <div className="flex flex-col gap-6">
            {estimate ? (
              <div className="rounded-xl border bg-card p-5 flex flex-col gap-3">
                {estimate.canSpend > 0 ? (
                  <>
                    <p className="text-sm text-muted-foreground">{firstName ? `${firstName}, f` : "F"}ino al {dayMonth(estimate.until)} puoi spendere circa</p>
                    <p className="text-4xl font-bold">{euro(estimate.canSpend)}</p>
                    <p className="text-sm text-muted-foreground">
                      {estimate.days > 1
                        ? <>cioè circa <strong className="text-foreground">{euro(estimate.perDay)} al giorno</strong> per {estimate.days} giorni.</>
                        : "Oggi è l'ultimo giorno del tuo mese."}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-lg font-semibold">Fino al {dayMonth(estimate.until)} conviene andarci piano</p>
                    <p className="text-sm text-muted-foreground">
                      Sul conto hai {formatEuro(estimate.balance)}: non resta un margine sicuro per spese in più.
                    </p>
                  </>
                )}
                <details className="text-sm group">
                  <summary className="min-h-11 flex items-center cursor-pointer text-primary">Come l&apos;ho calcolato</summary>
                  <ul className="list-disc pl-5 flex flex-col gap-1.5 text-muted-foreground">
                    <li>
                      Sul conto hai {formatEuro(estimate.balance)}.
                      {estimate.canSpend > 0 && <> Ne tengo da parte {formatEuro(estimate.reserve)} (almeno il {Math.round(ESTIMATE_RESERVE_SHARE * 100)}%) per gli imprevisti.</>}
                    </li>
                    <li>
                      {payDay === null
                        ? <>Non so quando arriva lo stipendio, quindi conto fino a fine mese.</>
                        : payDay === 0
                          ? <>Conto fino a fine mese.</>
                          : <>Conto fino al giorno prima del prossimo stipendio.</>}
                    </li>
                    <li>
                      Non conosco ancora le tue spese fisse: se prima del {dayMonth(estimate.until)} devi pagare affitto, bollette o rate,
                      toglile da questa cifra. Nemmeno le entrate in arrivo sono contate.
                    </li>
                    <li>Quando carichi i movimenti della banca Flusso impara le tue spese e la stima diventa precisa.</li>
                  </ul>
                </details>
              </div>
            ) : (
              <div className="text-center">
                <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center text-3xl mb-3">🎉</div>
                <h1 className="text-2xl font-bold">Pronto{firstName ? `, ${firstName}` : ""}!</h1>
                <p className="text-muted-foreground mt-1">
                  Carica il file della tua banca: in un minuto sai quanto puoi spendere fino al {dayMonth(period.to)}.
                </p>
              </div>
            )}

            <p className="text-sm text-muted-foreground text-center -mt-2">
              Per i primi {TRIAL_DAYS} giorni hai anche Premium.
            </p>

            <button
              onClick={() => finish("import")}
              disabled={loading}
              className="w-full min-h-11 bg-primary text-primary-foreground rounded-xl p-4 text-left flex items-start gap-3 hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              <span className="text-2xl">📁</span>
              <span className="flex flex-col gap-0.5">
                <span className="font-semibold text-sm">{loading ? "Avvio…" : "Carica il file della banca"}</span>
                <span className="text-xs opacity-90">
                  L&apos;Excel o il CSV dei movimenti degli ultimi mesi. Ci vuole un minuto.
                </span>
              </span>
            </button>

            <button onClick={() => finish("dashboard")} disabled={loading} className={linkBtn}>
              Prima do un&apos;occhiata alla dashboard →
            </button>

            <button onClick={back} className={linkBtn}>← Modifica</button>
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
