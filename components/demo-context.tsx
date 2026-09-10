"use client";

import { createContext, useContext } from "react";
import { toast } from "sonner";
import { DEMO_BLOCKED_MESSAGE } from "@/lib/demo";

const DemoContext = createContext(false);

export function DemoProvider({ isDemo, children }: { isDemo: boolean; children: React.ReactNode }) {
  return <DemoContext.Provider value={isDemo}>{children}</DemoContext.Provider>;
}

export function useIsDemo(): boolean {
  return useContext(DemoContext);
}

/**
 * Hook helper: restituisce una funzione che, se in demo, mostra il toast
 * "Registrati per salvare" e ritorna true (= blocca l'azione).
 */
export function useDemoGuard(): () => boolean {
  const isDemo = useIsDemo();
  return () => {
    if (isDemo) {
      toast.error(DEMO_BLOCKED_MESSAGE);
      return true;
    }
    return false;
  };
}
