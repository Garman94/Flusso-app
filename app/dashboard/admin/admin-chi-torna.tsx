// Card «Chi torna» (solo admin): quanti iscritti riaprono Flusso dopo una settimana e quanti
// lo usano ogni settimana. Componente server: niente JavaScript nel browser.
import type { RetentionData } from "@/lib/retention-server";
import { RETURN_DAYS, RETURN_TARGET, FEW_PEOPLE, weekLabel, romeShortDay, type ReturnStatus } from "@/lib/retention";

const STATUS: Record<ReturnStatus, string> = {
  returned: "✅ tornato",
  not_returned: "non è tornato",
  too_early: "⏳ è presto",
  before_tracking: "prima del conteggio",
};

const pct = (n: number) => `${Math.round(n * 100)}%`;

export function AdminChiTorna({ data }: { data: RetentionData }) {
  const { summary: s, weeks, rows, trackingSince, last7 } = data;
  const now = new Date(data.now);
  const reached = s.rate !== null && s.rate >= RETURN_TARGET;

  return (
    <div className="rounded-xl border p-5 flex flex-col gap-5">
      <div>
        <h2 className="text-lg font-semibold">📈 Chi torna</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Senza di te e senza la demo. Una visita è l&apos;app aperta (al massimo una ogni 6 ore per telefono o computer).
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {/* Tornati dopo una settimana */}
        <div className="rounded-lg bg-muted/40 p-4 flex flex-col gap-1">
          <span className="text-sm text-muted-foreground">Tornano dopo una settimana</span>
          {s.rate === null ? (
            <span className="text-sm">Ancora nessuno da contare.</span>
          ) : (
            <>
              <span className={`text-3xl font-bold ${reached ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`}>
                {pct(s.rate)}
              </span>
              <span className="text-sm">
                {s.returned} su {s.eligible} {s.eligible === 1 ? "iscritto" : "iscritti"} · obiettivo {pct(RETURN_TARGET)}
              </span>
            </>
          )}
        </div>

        {/* Attivi a settimana */}
        <div className="rounded-lg bg-muted/40 p-4 flex flex-col gap-1">
          <span className="text-sm text-muted-foreground">Attivi negli ultimi 7 giorni</span>
          <span className="text-3xl font-bold">{last7.current}</span>
          <span className="text-sm">
            {last7.current === 1 ? "persona" : "persone"} · nei 7 giorni prima {last7.previous}
          </span>
        </div>
      </div>

      <ul className="text-xs text-muted-foreground flex flex-col gap-1 list-disc pl-4">
        <li>
          {`«Tornato» vuol dire che ha aperto Flusso almeno ${RETURN_DAYS} giorni dopo l'iscrizione.`}
        </li>
        {s.tooEarly > 0 && (
          <li>
            {s.tooEarly === 1 ? "1 iscritto da meno" : `${s.tooEarly} iscritti da meno`} di {RETURN_DAYS} giorni: è presto per dirlo.
          </li>
        )}
        {s.beforeTracking > 0 && (
          <li>
            {s.beforeTracking === 1 ? "1 iscritto" : `${s.beforeTracking} iscritti`} prima che Flusso contasse le visite
            {trackingSince ? ` (dal ${romeShortDay(trackingSince)})` : ""}: {s.beforeTracking === 1 ? "non è" : "non sono"} nel conto.
          </li>
        )}
        {s.eligible > 0 && s.eligible < FEW_PEOPLE && (
          <li>Con così poche persone la percentuale cambia molto anche per una sola.</li>
        )}
      </ul>

      <div className="rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left px-3 py-2 font-medium">Settimana (da lunedì)</th>
              <th className="text-right px-3 py-2 font-medium">Attivi</th>
              <th className="text-right px-3 py-2 font-medium">Nuovi iscritti</th>
            </tr>
          </thead>
          <tbody>
            {[...weeks].reverse().map(w => (
              <tr key={w.start} className="border-t">
                <td className="px-3 py-2">{weekLabel(w.start, now)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{w.active}</td>
                <td className="px-3 py-2 text-right tabular-nums">{w.newUsers}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {rows.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer text-sm font-medium text-muted-foreground hover:text-foreground min-h-11 flex items-center">
            Iscritti uno per uno ({rows.length})
          </summary>
          <div className="rounded-lg border overflow-x-auto mt-2">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">Nome</th>
                  <th className="text-left px-3 py-2 font-medium">Iscritto</th>
                  <th className="text-left px-3 py-2 font-medium">Ultima visita</th>
                  <th className="text-left px-3 py-2 font-medium">Dopo una settimana</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id} className="border-t">
                    <td className="px-3 py-2">{r.name || <span className="text-muted-foreground">senza nome</span>}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{romeShortDay(r.createdAt)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{r.lastVisit ? romeShortDay(r.lastVisit) : "—"}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{STATUS[r.status]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  );
}
