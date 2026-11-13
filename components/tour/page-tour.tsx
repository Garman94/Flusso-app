"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useTour } from "./tour-context";
import { PAGE_TOURS, hasUnseenTour, isFirstVisit, markTourSeen } from "@/lib/tour-steps";

type Props = { path: string; plan?: string };

// Solo la dashboard fa partire la guida da sola (al primo accesso; dopo un aggiornamento
// chiede). Nelle altre pagine c'è un tasto "?" in basso a destra, con al massimo una riga di
// suggerimento la prima volta o dopo un aggiornamento: la guida parte solo se la chiedi.
// ?tour=1 (onboarding, pallino nella barra) la fa partire in qualsiasi pagina.
const AUTO_START = new Set(["/dashboard"]);

/** La guida non parte sopra la finestra delle notifiche aperta. */
function bellIsOpen(): boolean {
  return document.querySelector("[data-tour='notifications-bell']")?.getAttribute("aria-expanded") === "true";
}

export function PageTour({ path, plan }: Props) {
  const { start, active } = useTour();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [showPrompt, setShowPrompt] = useState(false);
  const [hint, setHint] = useState<"first" | "update" | null>(null);

  const def = PAGE_TOURS[path];
  const auto = AUTO_START.has(path);
  const stepsFor = () => (plan === "free" && def?.freePreview ? def.freePreview : def!.steps);

  useEffect(() => {
    if (!def) return;

    const forceTour = searchParams.get("tour") === "1";

    // ?notour=1: si arriva con un'azione già in corso (es. import aperto): niente tour sopra
    if (searchParams.get("notour") === "1") {
      markTourSeen(path);
      const url = new URL(window.location.href);
      url.searchParams.delete("notour");
      router.replace(url.pathname + (url.search || ""));
      return;
    }

    if (forceTour) {
      // rimuovi ?tour=1 dall'URL senza reload
      const url = new URL(window.location.href);
      url.searchParams.delete("tour");
      router.replace(url.pathname + (url.search || ""));
      const t = setTimeout(() => {
        start(stepsFor());
        markTourSeen(path);
      }, 500);
      return () => clearTimeout(t);
    }

    if (!auto) {
      if (isFirstVisit(path)) setHint("first");
      else if (hasUnseenTour(path)) setHint("update");
      return;
    }

    if (isFirstVisit(path)) {
      // primo accesso: parte subito senza chiedere (se la campanella è aperta, alla prossima visita)
      const t = setTimeout(() => {
        if (bellIsOpen()) return;
        start(stepsFor());
        markTourSeen(path);
      }, 800);
      return () => clearTimeout(t);
    }

    if (hasUnseenTour(path)) {
      // aggiornamento: chiede prima
      const t = setTimeout(() => setShowPrompt(true), 800);
      return () => clearTimeout(t);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!def) return null;

  function handleYes() {
    setShowPrompt(false);
    markTourSeen(path);
    start(def!.steps);
  }

  function handleNo() {
    setShowPrompt(false);
    markTourSeen(path);
  }

  function openGuide() {
    setHint(null);
    markTourSeen(path);
    start(stepsFor());
  }

  function closeHint() {
    setHint(null);
    markTourSeen(path);
  }

  if (!auto) {
    if (active) return null;
    return (
      <div className="fixed bottom-20 md:bottom-6 right-4 md:right-6 z-30 flex items-center gap-2 max-w-[calc(100vw-2rem)]">
        {hint && (
          <div className="flex items-center gap-1 min-w-0 rounded-full border bg-background shadow-md pl-3 text-xs animate-in fade-in duration-300">
            <button onClick={openGuide} className="min-h-11 truncate text-left hover:underline">
              {hint === "first" ? "Prima volta qui? Tocca per la guida" : "🆕 Novità in questa pagina: guardale"}
            </button>
            <button
              onClick={closeHint}
              aria-label="Chiudi il suggerimento"
              className="min-h-11 min-w-11 shrink-0 inline-flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
            >
              ✕
            </button>
          </div>
        )}
        <button
          onClick={openGuide}
          aria-label="Guida di questa pagina"
          title="Guida di questa pagina"
          className="min-h-11 min-w-11 shrink-0 rounded-full border bg-background shadow-md text-base font-semibold text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          ?
        </button>
      </div>
    );
  }

  if (!showPrompt) return null;

  return (
    <div
      className="fixed bottom-20 md:bottom-6 right-4 z-[9990] w-72 bg-background border rounded-xl shadow-xl p-4 flex flex-col gap-3 animate-in slide-in-from-bottom-4 duration-300"
      role="dialog"
    >
      <div className="flex items-start gap-2">
        <span className="text-lg shrink-0">🆕</span>
        <div>
          <p className="text-sm font-semibold leading-snug">C&apos;è un aggiornamento!</p>
          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
            Si tratta di: <strong>{def.whatIsNew}</strong>.
            <br />Vuoi vedere il tutorial?
          </p>
        </div>
      </div>
      <div className="flex gap-2">
        <button
          onClick={handleYes}
          className="min-h-11 flex-1 bg-primary text-primary-foreground rounded-md py-1.5 text-xs font-medium hover:bg-primary/90 transition-colors"
        >
          Sì, mostrami
        </button>
        <button
          onClick={handleNo}
          className="min-h-11 flex-1 border rounded-md py-1.5 text-xs hover:bg-muted/50 transition-colors"
        >
          No grazie
        </button>
      </div>
    </div>
  );
}
