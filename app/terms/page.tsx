import { Navbar } from "@/components/navbar";
import { siteConfig } from "@/lib/config";
import Link from "next/link";

export const metadata = {
  title: "Termini di servizio — Flusso",
  description: "Termini e condizioni di utilizzo del servizio Flusso.",
};

export default function TermsPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1 w-full max-w-3xl mx-auto px-5 py-16 flex flex-col gap-10">
        <div className="flex flex-col gap-3">
          <h1 className="text-3xl font-bold">Termini di servizio</h1>
          <p className="text-sm text-muted-foreground">Ultimo aggiornamento: 21 aprile 2025</p>
        </div>

        <p className="text-muted-foreground leading-relaxed">
          I presenti Termini di Servizio (&quot;Termini&quot;) regolano l&apos;utilizzo di {siteConfig.name}
          (&quot;il Servizio&quot;), gestito da Marco Garofalo (&quot;il Fornitore&quot;). Utilizzando il
          Servizio accetti integralmente questi Termini. Se non li accetti, non puoi utilizzare il Servizio.
        </p>

        <Section title="1. Descrizione del servizio">
          <p>
            {siteConfig.name} è un&apos;applicazione web di gestione finanziaria personale che consente di:
            tracciare entrate e uscite, importare movimenti bancari tramite file Excel/CSV, categorizzare
            automaticamente le spese, visualizzare previsioni e impostare obiettivi di risparmio.
          </p>
          <p className="text-sm border-l-2 border-amber-500 pl-3 text-amber-600 dark:text-amber-400">
            <strong>Avviso importante:</strong> Il Servizio ha finalità esclusivamente informativa e di
            organizzazione personale. Non costituisce consulenza finanziaria, fiscale o di investimento ai
            sensi del D.Lgs. 58/1998 (TUF) o della Direttiva MiFID II. Le previsioni e i suggerimenti
            mostrati sono elaborazioni statistiche dei tuoi dati e non devono essere interpretati come
            raccomandazioni finanziarie professionali.
          </p>
        </Section>

        <Section title="2. Registrazione e account">
          <ul className="list-disc list-inside space-y-2">
            <li>Devi avere almeno 18 anni per registrarti.</li>
            <li>Sei responsabile della riservatezza delle credenziali di accesso.</li>
            <li>Devi fornire informazioni accurate e aggiornarle in caso di variazione.</li>
            <li>Un account è personale e non trasferibile a terzi.</li>
            <li>Puoi cancellare il tuo account in qualsiasi momento dalla sezione Account. I dati verranno eliminati entro 30 giorni.</li>
          </ul>
        </Section>

        <Section title="3. Piani e pagamenti">
          <p><strong className="text-foreground">Piano Gratuito:</strong> accesso senza scadenza alle funzionalità base, con i limiti indicati nella pagina Prezzi. Non richiede carta di credito.</p>
          <p><strong className="text-foreground">Piano Premium:</strong> abbonamento mensile (€4,99/mese IVA inclusa) o annuale (€39/anno IVA inclusa). Rinnovo automatico salvo disdetta.</p>
          <p><strong className="text-foreground">Piano Founder:</strong> pagamento unico (€49 IVA inclusa) con accesso a vita alle funzionalità Premium.</p>
          <p>
            I pagamenti sono elaborati da Lemon Squeezy LLC, merchant of record. In caso di problemi
            con il pagamento contatta{" "}
            <a href="mailto:garofalo.marco94@gmail.com" className="underline">garofalo.marco94@gmail.com</a>.
          </p>
        </Section>

        <Section title="4. Politica di rimborso">
          <p>
            <strong className="text-foreground">Garanzia 30 giorni soddisfatti o rimborsati</strong> per i piani Premium e Founder:
            se non sei soddisfatto del Servizio entro 30 giorni dall&apos;acquisto, puoi richiedere il rimborso
            completo scrivendo a{" "}
            <a href="mailto:garofalo.marco94@gmail.com" className="underline">garofalo.marco94@gmail.com</a>{" "}
            senza dover fornire motivazioni. Il rimborso viene processato entro 5–10 giorni lavorativi.
          </p>
          <p>
            Ai sensi dell&apos;Art. 59 lett. a) del D.Lgs. 206/2006, il diritto di recesso di 14 giorni previsto per
            i contratti a distanza può essere esercitato prima che il servizio digitale venga attivato.
            Una volta attivato l&apos;accesso Premium, si applica la garanzia commerciale di 30 giorni sopra descritta.
          </p>
        </Section>

        <Section title="5. Disdetta abbonamento Premium">
          <p>
            Puoi disdire l&apos;abbonamento Premium in qualsiasi momento dal portale di Lemon Squeezy (link nella
            email di conferma acquisto) o scrivendo a{" "}
            <a href="mailto:garofalo.marco94@gmail.com" className="underline">garofalo.marco94@gmail.com</a>.
            Dopo la disdetta, l&apos;accesso Premium rimane attivo fino alla fine del periodo già pagato, poi
            l&apos;account torna al piano Gratuito. Non sono previsti rimborsi parziali per periodi non utilizzati
            oltre i 30 giorni dalla data di acquisto.
          </p>
        </Section>

        <Section title="6. Uso accettabile">
          <p>Ti impegni a non utilizzare il Servizio per:</p>
          <ul className="list-disc list-inside space-y-2">
            <li>Attività illegali o fraudolente</li>
            <li>Caricare dati di terzi senza il loro consenso</li>
            <li>Tentare di accedere a dati di altri utenti</li>
            <li>Aggirare i limiti del piano Gratuito con mezzi tecnici</li>
            <li>Reverse engineering o copia del codice sorgente del Servizio</li>
          </ul>
        </Section>

        <Section title="7. Proprietà intellettuale">
          <p>
            Il Servizio, il marchio &quot;Flusso&quot;, il design e il codice sorgente sono di proprietà esclusiva
            del Fornitore. I tuoi dati finanziari rimangono di tua proprietà. Ci concedi una licenza
            limitata per elaborarli ai soli fini dell&apos;erogazione del Servizio.
          </p>
        </Section>

        <Section title="8. Limitazione di responsabilità">
          <p>
            Il Servizio è fornito &quot;così com&apos;è&quot; (&quot;as is&quot;). Il Fornitore non garantisce la disponibilità
            continua del Servizio né l&apos;assenza di errori. Nella misura massima consentita dalla legge italiana,
            la responsabilità del Fornitore per danni diretti è limitata all&apos;importo pagato dall&apos;utente negli
            ultimi 12 mesi. Il Fornitore non è responsabile per decisioni finanziarie prese sulla base
            delle informazioni mostrate dal Servizio.
          </p>
        </Section>

        <Section title="9. Modifiche al servizio e ai termini">
          <p>
            Il Fornitore si riserva il diritto di modificare o interrompere il Servizio con un preavviso
            di almeno 30 giorni comunicato via email. Le modifiche ai Termini saranno comunicate via email
            con almeno 15 giorni di preavviso. L&apos;uso continuato del Servizio dopo tale periodo costituisce
            accettazione delle modifiche.
          </p>
        </Section>

        <Section title="10. Legge applicabile e foro competente">
          <p>
            I presenti Termini sono regolati dalla legge italiana. Per qualsiasi controversia relativa
            al Servizio, le parti si impegnano a tentare una risoluzione amichevole. In mancanza, la
            controversia sarà devoluta al Tribunale competente per legge in base al domicilio del
            consumatore (D.Lgs. 206/2006 art. 66-bis).
          </p>
        </Section>

        <Section title="11. Contatti">
          <p>
            Per qualsiasi questione relativa ai presenti Termini:{" "}
            <a href="mailto:garofalo.marco94@gmail.com" className="underline">garofalo.marco94@gmail.com</a>
          </p>
        </Section>
      </main>

      <footer className="w-full border-t py-8">
        <div className="max-w-5xl mx-auto px-5 flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">{siteConfig.name}</span>
          <div className="flex gap-6">
            {siteConfig.footer.links.map((link) => (
              <Link key={link.href} href={link.href} className="hover:text-foreground transition-colors">
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-xl font-semibold">{title}</h2>
      <div className="flex flex-col gap-3 text-muted-foreground leading-relaxed">{children}</div>
    </section>
  );
}
