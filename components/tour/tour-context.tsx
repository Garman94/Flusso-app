"use client";

import { createContext, useContext, useState, useCallback } from "react";

export type TourStep = {
  target?: string; // CSS selector — undefined = schermata centrata senza spotlight
  title: string;
  message: string;
};

type TourCtx = {
  active: boolean;
  stepIndex: number;
  steps: TourStep[];
  start: (steps: TourStep[]) => void;
  next: () => void;
  skip: () => void;
};

const TourContext = createContext<TourCtx | null>(null);

export function TourProvider({ children }: { children: React.ReactNode }) {
  const [active, setActive]       = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [steps, setSteps]         = useState<TourStep[]>([]);

  const start = useCallback((s: TourStep[]) => {
    if (s.length === 0) return;
    setSteps(s);
    setStepIndex(0);
    setActive(true);
  }, []);

  const next = useCallback(() => {
    setStepIndex(i => {
      const n = i + 1;
      if (n >= steps.length) {
        setActive(false);
        try { localStorage.setItem("flusso_tour_seen", "1"); } catch {}
        return 0;
      }
      return n;
    });
  }, [steps.length]);

  const skip = useCallback(() => {
    setActive(false);
    try { localStorage.setItem("flusso_tour_seen", "1"); } catch {}
    setStepIndex(0);
  }, []);

  return (
    <TourContext.Provider value={{ active, stepIndex, steps, start, next, skip }}>
      {children}
    </TourContext.Provider>
  );
}

export function useTour() {
  const ctx = useContext(TourContext);
  if (!ctx) throw new Error("useTour must be used inside TourProvider");
  return ctx;
}
