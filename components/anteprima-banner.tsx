import { isPreviewDeployment, PRODUCTION_URL } from "@/lib/anteprima";

/** Striscia in cima alle pagine dell'anteprima, per non confonderla col sito pubblicato. */
export function AnteprimaBanner() {
  if (!isPreviewDeployment()) return null;
  return (
    <div className="w-full bg-violet-600 text-white text-sm px-4 py-2 text-center">
      🔍 <strong>Anteprima</strong>: questa versione non è ancora pubblicata. I dati sono quelli veri.{" "}
      <a href={`${PRODUCTION_URL}/dashboard/admin`} className="underline font-medium whitespace-nowrap">
        Torna al sito
      </a>
    </div>
  );
}
