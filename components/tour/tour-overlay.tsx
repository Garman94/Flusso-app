"use client";

import { useEffect, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { useTour } from "./tour-context";

const PAD = 10; // padding around the highlighted element

type Rect = { top: number; left: number; width: number; height: number };

function measureTarget(selector: string): Rect | null {
  const el = document.querySelector(selector);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

function TooltipCard({
  title, message, stepIndex, total, onNext, onSkip, spotRect,
}: {
  title: string;
  message: string;
  stepIndex: number;
  total: number;
  onNext: () => void;
  onSkip: () => void;
  spotRect: Rect | null;
}) {
  const isLast = stepIndex === total - 1;
  const isCentered = !spotRect;

  let style: React.CSSProperties = {};

  if (isCentered) {
    style = {
      position: "fixed",
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
      width: "min(360px, 90vw)",
    };
  } else {
    const s = spotRect!;
    const spBottom = s.top + s.height + PAD;
    const spTop    = s.top - PAD;
    const cardW    = Math.min(320, window.innerWidth - 32);
    const centerX  = s.left + s.width / 2;
    const left     = Math.max(16, Math.min(centerX - cardW / 2, window.innerWidth - cardW - 16));

    if (spBottom + 180 < window.innerHeight) {
      // tooltip below
      style = { position: "fixed", top: spBottom + 8, left, width: cardW };
    } else {
      // tooltip above
      style = { position: "fixed", bottom: window.innerHeight - spTop + 8, left, width: cardW };
    }
  }

  return (
    <div
      style={{ ...style, zIndex: 10000 }}
      className="bg-background border rounded-xl shadow-2xl p-5 flex flex-col gap-3"
    >
      <div className="flex items-start justify-between gap-3">
        <p className="font-semibold text-sm leading-snug">{title}</p>
        <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0 mt-0.5">
          {stepIndex + 1} / {total}
        </span>
      </div>
      <p className="text-sm text-muted-foreground leading-relaxed">{message}</p>
      <div className="flex items-center gap-2 pt-1">
        <button
          onClick={onNext}
          className="flex-1 bg-primary text-primary-foreground rounded-md py-2 text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          {isLast ? "Inizia 🚀" : "Avanti →"}
        </button>
        {!isLast && (
          <button
            onClick={onSkip}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-2"
          >
            Salta
          </button>
        )}
      </div>
    </div>
  );
}

export function TourOverlay() {
  const { active, stepIndex, steps, next, skip } = useTour();
  const [spotRect, setSpotRect] = useState<Rect | null>(null);
  const [mounted, setMounted]   = useState(false);

  useEffect(() => { setMounted(true); }, []);

  const measure = useCallback(() => {
    if (!active || !steps[stepIndex]) return;
    const target = steps[stepIndex].target;
    if (!target) { setSpotRect(null); return; }

    const el = document.querySelector(target);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      // attendi fine scroll poi misura
      const t = setTimeout(() => {
        setSpotRect(measureTarget(target));
      }, 350);
      return () => clearTimeout(t);
    } else {
      setSpotRect(null);
    }
  }, [active, stepIndex, steps]);

  useEffect(() => {
    measure();
  }, [measure]);

  // aggiorna rect al resize / scroll
  useEffect(() => {
    if (!active) return;
    const handler = () => measure();
    window.addEventListener("resize", handler);
    window.addEventListener("scroll", handler, true);
    return () => {
      window.removeEventListener("resize", handler);
      window.removeEventListener("scroll", handler, true);
    };
  }, [active, measure]);

  // ESC per chiudere
  useEffect(() => {
    if (!active) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") skip(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [active, skip]);

  if (!mounted || !active || !steps[stepIndex]) return null;

  const step = steps[stepIndex];
  const sr   = spotRect;

  return createPortal(
    <>
      {/* Click blocker + sfondo scuro (gestito via box-shadow sul spotlight) */}
      <div
        style={{ position: "fixed", inset: 0, zIndex: 9997 }}
        onClick={next}
        aria-hidden
      />

      {/* Spotlight: box-shadow crea l'oscuramento attorno all'elemento */}
      {sr && (
        <div
          style={{
            position: "fixed",
            top:    sr.top    - PAD,
            left:   sr.left   - PAD,
            width:  sr.width  + PAD * 2,
            height: sr.height + PAD * 2,
            borderRadius: 12,
            boxShadow: "0 0 0 9999px rgba(0,0,0,0.58)",
            zIndex: 9998,
            pointerEvents: "none",
          }}
        />
      )}

      {/* Overlay scuro per step senza target */}
      {!sr && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0,0,0,0.58)",
            zIndex: 9998,
            pointerEvents: "none",
          }}
        />
      )}

      {/* Tooltip */}
      <TooltipCard
        title={step.title}
        message={step.message}
        stepIndex={stepIndex}
        total={steps.length}
        onNext={next}
        onSkip={skip}
        spotRect={sr}
      />
    </>,
    document.body,
  );
}
