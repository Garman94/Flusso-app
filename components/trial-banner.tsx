import Link from "next/link";

export function TrialBanner({ daysLeft }: { daysLeft: number }) {
  return (
    <div className="w-full bg-primary/10 border-b border-primary/20 text-sm px-4 py-2 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-center">
      <span>
        🎁 Premium incluso: ancora <strong>{daysLeft} {daysLeft === 1 ? "giorno" : "giorni"}</strong>.
      </span>
      <Link href="/dashboard/smart" className="underline font-semibold hover:opacity-90">
        Prova Budget e Accantonamenti →
      </Link>
    </div>
  );
}
