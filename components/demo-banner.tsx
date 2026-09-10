import Link from "next/link";

export function DemoBanner() {
  return (
    <div className="w-full bg-orange-500 text-white text-sm px-4 py-2 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-center">
      <span>🎮 <strong>Modalità Demo</strong> — Stai esplorando con dati di esempio.</span>
      <Link href="/auth/sign-up" className="underline font-semibold hover:opacity-90">
        Registrati gratis per usare i tuoi dati →
      </Link>
    </div>
  );
}
