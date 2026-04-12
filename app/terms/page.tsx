import { Navbar } from "@/components/navbar";
import { siteConfig } from "@/lib/config";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: `Termini di servizio — ${siteConfig.name}`,
  description: `Termini e condizioni di utilizzo di ${siteConfig.name}.`,
};

export default function TermsPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1 w-full max-w-3xl mx-auto px-5 py-16 flex flex-col gap-8">
        <div>
          <h1 className="text-3xl font-bold">Termini di servizio</h1>
          <p className="text-muted-foreground mt-2">Ultimo aggiornamento: 12 aprile 2026</p>
        </div>

        <section className="flex flex-col gap-4 text-sm leading-relaxed text-muted-foreground">
          <p>
            Utilizzando {siteConfig.name} accetti i seguenti termini e condizioni. Ti invitiamo a leggerli attentamente prima di utilizzare il servizio.
          </p>

          <h2 className="text-base font-semibold text-foreground mt-4">1. Accettazione dei termini</h2>
          <p>
            Accedendo e utilizzando {siteConfig.name}, accetti di essere vincolato da questi Termini di Servizio. Se non accetti questi termini, ti preghiamo di non utilizzare il servizio.
          </p>

          <h2 className="text-base font-semibold text-foreground mt-4">2. Descrizione del servizio</h2>
          <p>
            {siteConfig.name} fornisce [descrizione del tuo servizio]. Ci riserviamo il diritto di modificare, sospendere o interrompere il servizio in qualsiasi momento.
          </p>

          <h2 className="text-base font-semibold text-foreground mt-4">3. Account utente</h2>
          <p>
            Per utilizzare alcune funzionalità del servizio, è necessario creare un account. Sei responsabile della sicurezza del tuo account e di tutte le attività che avvengono al suo interno.
          </p>

          <h2 className="text-base font-semibold text-foreground mt-4">4. Pagamenti e abbonamenti</h2>
          <p>
            I piani a pagamento vengono fatturati anticipatamente su base mensile o annuale. I rimborsi vengono concessi entro 30 giorni dall&apos;acquisto, senza fare domande.
          </p>

          <h2 className="text-base font-semibold text-foreground mt-4">5. Limitazione di responsabilità</h2>
          <p>
            Il servizio viene fornito &quot;così com&apos;è&quot;, senza garanzie di alcun tipo. Non siamo responsabili per danni diretti o indiretti derivanti dall&apos;utilizzo del servizio.
          </p>

          <h2 className="text-base font-semibold text-foreground mt-4">6. Contatti</h2>
          <p>
            Per qualsiasi domanda relativa a questi termini, contattaci all&apos;indirizzo: <span className="text-foreground">[email di contatto]</span>
          </p>
        </section>
      </main>
    </div>
  );
}
