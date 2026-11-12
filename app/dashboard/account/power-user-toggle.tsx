"use client";

import { useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";

export function PowerUserToggle({ userId, enabled }: { userId: string; enabled: boolean }) {
  const [on, setOn] = useState(enabled);
  const [isPending, startTransition] = useTransition();

  function toggle() {
    const next = !on;
    setOn(next);
    startTransition(async () => {
      const supabase = createClient();
      const { error } = await supabase
        .from("profiles")
        .update({ power_user: next })
        .eq("id", userId);
      if (error) {
        setOn(!next);
        toast.error("Errore nel salvataggio.");
      } else {
        toast.success(next ? "Funzioni avanzate attivate." : "Funzioni avanzate disattivate.");
      }
    });
  }

  return (
    <div className="rounded-xl border p-6 flex items-center justify-between gap-4">
      <div>
        <h2 className="font-semibold flex items-center gap-2">
          🛠️ Funzioni avanzate
        </h2>
        <p className="text-xs text-muted-foreground mt-1">
          Mostra funzioni avanzate come le regole di rinomina e categorizzazione automatica delle transazioni.
        </p>
      </div>
      <button
        onClick={toggle}
        disabled={isPending}
        className="min-h-11 min-w-11 flex items-center justify-center shrink-0 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"
        role="switch"
        aria-checked={on}
        aria-label="Funzioni avanzate"
      >
        <span className={`relative w-11 h-6 rounded-full transition-colors ${on ? "bg-primary" : "bg-muted-foreground/30"}`}>
          <span
            className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${on ? "translate-x-5" : "translate-x-0"}`}
          />
        </span>
      </button>
    </div>
  );
}
