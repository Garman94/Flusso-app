"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useTour } from "./tour-context";
import { PAGE_TOURS, hasUnseenTour, isFirstVisit, markTourSeen } from "@/lib/tour-steps";

type Props = { path: string };

export function PageTour({ path }: Props) {
  const { start } = useTour();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [showPrompt, setShowPrompt] = useState(false);

  const def = PAGE_TOURS[path];

  useEffect(() => {
    if (!def) return;

    const forceTour = searchParams.get("tour") === "1";

    if (forceTour) {
      // rimuovi ?tour=1 dall'URL senza reload
      const url = new URL(window.location.href);
      url.searchParams.delete("tour");
      router.replace(url.pathname + (url.search || ""));
      const t = setTimeout(() => {
        start(def.steps);
        markTourSeen(path);
      }, 500);
      return () => clearTimeout(t);
    }

    if (isFirstVisit(path)) {
      // primo accesso: parte subito senza chiedere
      const t = setTimeout(() => {
        start(def.steps);
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

  function handleYes() {
    setShowPrompt(false);
    markTourSeen(path);
    start(def!.steps);
  }

  function handleNo() {
    setShowPrompt(false);
    markTourSeen(path);
  }

  if (!showPrompt || !def) return null;

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
          className="flex-1 bg-primary text-primary-foreground rounded-md py-1.5 text-xs font-medium hover:bg-primary/90 transition-colors"
        >
          Sì, mostrami
        </button>
        <button
          onClick={handleNo}
          className="flex-1 border rounded-md py-1.5 text-xs hover:bg-muted/50 transition-colors"
        >
          No grazie
        </button>
      </div>
    </div>
  );
}
