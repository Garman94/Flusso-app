import { Navbar } from "@/components/navbar";
import { siteConfig } from "@/lib/config";
import Link from "next/link";

export const metadata = {
  title: "Privacy Policy — Flusso",
  description: "Informativa sul trattamento dei dati personali ai sensi del GDPR.",
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1 w-full max-w-3xl mx-auto px-5 py-16 flex flex-col gap-10">
        <div className="flex flex-col gap-3">
          <h1 className="text-3xl font-bold">Privacy Policy</h1>
          <p className="text-sm text-muted-foreground">Ultimo aggiornamento: 21 aprile 2025</p>
        </div>

        <p className="text-muted-foreground leading-relaxed">
          La presente informativa descrive come {siteConfig.name} raccoglie, utilizza e protegge i dati
          personali degli utenti, in conformità al Regolamento (UE) 2016/679 (GDPR) e al D.Lgs. 196/2003
          come modificato dal D.Lgs. 101/2018.
        </p>

        <Section title="1. Titolare del trattamento">
          <p>Il titolare del trattamento dei dati è:</p>
          <div className="rounded-lg bg-muted/50 p-4 text-sm space-y-1">
            <p className="font-medium text-foreground">Marco Garofalo</p>
            <p className="text-amber-500 text-xs font-medium">Via Giuseppe Mazzini 2 , Valbrona CO, Italia</p>
            <p>Email: <a href="mailto:garofalo.marco94@gmail.com" className="underline">garofalo.marco94@gmail.com</a></p>
          </div>
        </Section>

        <Section title="2. Dati personali raccolti">
          <ul className="list-disc list-inside space-y-2">
            <li><strong className="text-foreground">Dati di account:</strong> indirizzo email, password (in forma hash — non leggibile), piano sottoscritto.</li>
            <li><strong className="text-foreground">Dati finanziari:</strong> transazioni (importo, data, descrizione, categoria) caricate manualmente o tramite file Excel. Non accediamo direttamente ai conti bancari.</li>
            <li><strong className="text-foreground">Dati di utilizzo:</strong> log di accesso, preferenze, obiettivi finanziari inseriti.</li>
            <li><strong className="text-foreground">Dati di pagamento:</strong> gestiti da Lemon Squeezy (merchant of record). Non conserviamo dati di carte di credito.</li>
          </ul>
        </Section>

        <Section title="3. Finalità e basi giuridiche">
          <ul className="list-disc list-inside space-y-2">
            <li>Erogazione del servizio &rarr; Esecuzione del contratto (Art. 6.1.b GDPR)</li>
            <li>Elaborazione pagamenti &rarr; Esecuzione del contratto (Art. 6.1.b GDPR)</li>
            <li>Comunicazioni di servizio &rarr; Esecuzione del contratto (Art. 6.1.b GDPR)</li>
            <li>Prevenzione frodi e sicurezza &rarr; Interesse legittimo (Art. 6.1.f GDPR)</li>
            <li>Adempimento obblighi fiscali &rarr; Obbligo legale (Art. 6.1.c GDPR)</li>
            <li>Comunicazioni promozionali &rarr; Consenso revocabile (Art. 6.1.a GDPR)</li>
          </ul>
        </Section>

        <Section title="4. Sub-processor (responsabili del trattamento)">
          <ul className="list-disc list-inside space-y-2">
            <li><strong className="text-foreground">Supabase Inc.</strong> — database e autenticazione. DPA: supabase.com/privacy.</li>
            <li><strong className="text-foreground">Vercel Inc.</strong> — hosting applicazione web. Privacy: vercel.com/legal/privacy-policy.</li>
            <li><strong className="text-foreground">Lemon Squeezy LLC</strong> — elaborazione pagamenti e merchant of record. Agisce come titolare autonomo per i dati di pagamento.</li>
          </ul>
        </Section>

        <Section title="5. Trasferimento di dati fuori dall&apos;UE">
          <p>
            Supabase e Vercel sono aziende con sede negli Stati Uniti. I trasferimenti avvengono sulla base delle{" "}
            <strong className="text-foreground">Clausole Contrattuali Standard (SCC)</strong> approvate dalla
            Commissione Europea (Decisione 2021/914/UE), che garantiscono un livello adeguato di protezione.
          </p>
        </Section>

        <Section title="6. Conservazione dei dati">
          <ul className="list-disc list-inside space-y-2">
            <li>Dati account e transazioni: conservati finché l&apos;account è attivo.</li>
            <li>Alla cancellazione: eliminati entro 30 giorni, salvo obblighi fiscali (10 anni — D.P.R. 600/1973).</li>
            <li>Log di accesso: massimo 12 mesi.</li>
          </ul>
        </Section>

        <Section title="7. I tuoi diritti (artt. 15–22 GDPR)">
          <ul className="list-disc list-inside space-y-2">
            <li><strong className="text-foreground">Accesso</strong> — ottenere copia dei tuoi dati</li>
            <li><strong className="text-foreground">Rettifica</strong> — correggere dati inesatti</li>
            <li><strong className="text-foreground">Cancellazione</strong> — eliminare account e dati</li>
            <li><strong className="text-foreground">Portabilità</strong> — ricevere i dati in formato strutturato (CSV/JSON)</li>
            <li><strong className="text-foreground">Limitazione</strong> — sospendere il trattamento in determinati casi</li>
            <li><strong className="text-foreground">Opposizione</strong> — opporsi al trattamento per interesse legittimo</li>
            <li><strong className="text-foreground">Revoca del consenso</strong> — in qualsiasi momento</li>
          </ul>
          <p>
            Esercita i tuoi diritti scrivendo a{" "}
            <a href="mailto:garofalo.marco94@gmail.com" className="underline">garofalo.marco94@gmail.com</a>.
            Risposta entro 30 giorni. Hai inoltre il diritto di proporre reclamo al{" "}
            <a href="https://www.garanteprivacy.it" target="_blank" rel="noopener noreferrer" className="underline">
              Garante per la protezione dei dati personali
            </a>.
          </p>
        </Section>

        <Section title="8. Cookie">
          <p>
            Utilizziamo esclusivamente cookie tecnici necessari al funzionamento del servizio.
            Non utilizziamo cookie di profilazione o pubblicitari. Per i dettagli consulta la{" "}
            <Link href="/cookie-policy" className="underline">Cookie Policy</Link>.
          </p>
        </Section>

        <Section title="9. Sicurezza">
          <p>
            I dati sono protetti mediante crittografia in transito (TLS 1.2+) e a riposo (AES-256).
            In caso di violazione dei dati, notificheremo il Garante entro 72 ore e gli utenti
            interessati senza ingiustificato ritardo (artt. 33–34 GDPR).
          </p>
        </Section>

        <Section title="10. Modifiche alla presente informativa">
          <p>
            Le modifiche sostanziali saranno comunicate via email con almeno 15 giorni di preavviso.
            La data di &quot;ultimo aggiornamento&quot; indica la versione vigente.
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
