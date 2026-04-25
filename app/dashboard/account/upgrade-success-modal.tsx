"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";

const FEATURES = [
  { icon: "🎯", label: "Obiettivi di risparmio illimitati" },
  { icon: "🔁", label: "Spese ricorrenti con riconoscimento automatico" },
  { icon: "📊", label: "Previsioni budget avanzate" },
  { icon: "📈", label: "Trend storici e grafici completi" },
];

export function UpgradeSuccessModal() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (searchParams.get("upgraded") === "1") {
      setOpen(true);
    }
  }, [searchParams]);

  function handleClose() {
    setOpen(false);
    // rimuove il query param senza reload
    router.replace(pathname, { scroll: false });
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="relative bg-background rounded-2xl shadow-2xl max-w-sm w-full p-8 flex flex-col items-center gap-6 text-center animate-in fade-in zoom-in-95 duration-200">
        {/* Icon */}
        <div className="text-6xl">🎉</div>

        {/* Heading */}
        <div className="flex flex-col gap-2">
          <h2 className="text-2xl font-bold">Benvenuto in Premium!</h2>
          <p className="text-muted-foreground text-sm">
            Il tuo piano è stato attivato. Hai ora accesso a tutte le funzionalità di Flusso.
          </p>
        </div>

        {/* Feature list */}
        <ul className="w-full flex flex-col gap-3">
          {FEATURES.map((f) => (
            <li key={f.label} className="flex items-center gap-3 text-sm text-left">
              <span className="text-xl w-7 shrink-0 text-center">{f.icon}</span>
              <span>{f.label}</span>
            </li>
          ))}
        </ul>

        {/* CTA */}
        <button
          onClick={handleClose}
          className="w-full bg-primary text-primary-foreground rounded-xl px-6 py-3 font-semibold hover:bg-primary/90 transition-colors"
        >
          Inizia a usare Premium
        </button>
      </div>
    </div>
  );
}
