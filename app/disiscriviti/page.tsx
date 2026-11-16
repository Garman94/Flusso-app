import { Suspense } from "react";
import Link from "next/link";
import { Navbar } from "@/components/navbar";
import { verifyUnsubscribe } from "@/lib/email-token";
import { UnsubscribeButton } from "./unsubscribe-button";

export const metadata = {
  title: "Email — Flusso",
  robots: { index: false },
};

const WHAT: Record<string, string> = {
  weekly: "l'email del lunedì",
  monthly: "il riepilogo del mese per email",
};

async function Content({ searchParams }: { searchParams: Promise<{ u?: string; k?: string; t?: string }> }) {
  const { u = "", k = "", t = "" } = await searchParams;
  // Il link si controlla qui, ma l'email si spegne solo col tasto: alcuni programmi di posta
  // aprono i link da soli per controllarli, e non devono disiscrivere nessuno.
  const valid = verifyUnsubscribe(u, k, t);

  return (
    <div className="rounded-xl border p-6 flex flex-col gap-4">
      {valid ? (
        <>
          <h1 className="text-xl font-semibold">Vuoi smettere di ricevere {WHAT[k]}?</h1>
          <p className="text-sm text-muted-foreground">
            Puoi riattivarla quando vuoi da Account → Avvisi.
          </p>
          <UnsubscribeButton u={u} k={k} t={t} />
        </>
      ) : (
        <>
          <h1 className="text-xl font-semibold">Questo link non funziona</h1>
          <p className="text-sm text-muted-foreground">
            Forse è incompleto. Puoi spegnere le email da Account → Avvisi.
          </p>
          <Link href="/dashboard/account#avvisi" className="min-h-11 inline-flex items-center self-start text-sm text-primary hover:underline">
            Vai ad Account →
          </Link>
        </>
      )}
    </div>
  );
}

export default function UnsubscribePage({ searchParams }: { searchParams: Promise<{ u?: string; k?: string; t?: string }> }) {
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1 w-full max-w-md mx-auto px-5 py-16">
        <Suspense fallback={<div className="rounded-xl border h-40 bg-muted/30 animate-pulse" />}>
          <Content searchParams={searchParams} />
        </Suspense>
      </main>
    </div>
  );
}
