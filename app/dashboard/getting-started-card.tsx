"use client";

import Link from "next/link";
import { track } from "@/lib/track";

type Step = {
  key: string;
  done: boolean;
  title: string;
  hint: string;
  cta: string;
  href?: string;
  onClick?: () => void;
};

/**
 * Mostrata finché l'utente non ha nessuna transazione: porta dritto al primo valore
 * (l'import dell'estratto conto) invece di lasciare una dashboard vuota e un tour di testo.
 */
export function GettingStartedCard({
  payDay, goalsCount, onSetPayDay,
}: { payDay: number; goalsCount: number; onSetPayDay: () => void }) {
  const steps: Step[] = [
    {
      key: "import",
      done: false,
      title: "Importa il tuo estratto conto",
      hint: "In home banking cerca Movimenti → Esporta in Excel o CSV. Bastano due minuti.",
      href: "/dashboard/transazioni?import=1&notour=1",
      cta: "Importa",
    },
    {
      key: "payday",
      done: payDay > 0,
      title: "Dì a Flusso quando ti pagano",
      hint: "Il mese parte dal giorno di paga, non dal 1: i conti tornano meglio.",
      onClick: onSetPayDay,
      cta: "Imposta",
    },
    {
      key: "goal",
      done: goalsCount > 0,
      title: "Crea un obiettivo di risparmio",
      hint: "Vacanza, fondo emergenza, un acquisto: Flusso stima quando ci arrivi.",
      href: "/dashboard/smart?v=add-goal",
      cta: "Crea",
    },
  ];
  const doneCount = steps.filter(s => s.done).length;

  return (
    <div className="rounded-xl border border-primary/30 bg-primary/5 p-5 flex flex-col gap-4" data-tour="getting-started">
      <div>
        <h2 className="font-semibold">Per iniziare</h2>
        <p className="text-xs text-muted-foreground">{doneCount} di {steps.length} fatti. Il primo passo è quello che conta.</p>
      </div>
      <ol className="flex flex-col gap-3">
        {steps.map((s, i) => {
          const cls = `shrink-0 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
            i === 0 ? "bg-primary text-primary-foreground hover:bg-primary/90" : "border hover:bg-muted/50"
          }`;
          const onTrack = () => void track("checklist_click", { step: s.key });
          return (
            <li key={s.key} className="flex items-start gap-3">
              <span
                className={`mt-0.5 w-6 h-6 shrink-0 rounded-full border flex items-center justify-center text-xs font-semibold ${
                  s.done ? "bg-primary text-primary-foreground border-primary" : "text-muted-foreground"
                }`}
                aria-hidden
              >
                {s.done ? "✓" : i + 1}
              </span>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium ${s.done ? "line-through text-muted-foreground" : ""}`}>{s.title}</p>
                {!s.done && <p className="text-xs text-muted-foreground mt-0.5">{s.hint}</p>}
              </div>
              {!s.done && (s.href ? (
                <Link href={s.href} onClick={onTrack} className={cls}>{s.cta}</Link>
              ) : (
                <button onClick={() => { onTrack(); s.onClick?.(); }} className={cls}>{s.cta}</button>
              ))}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
