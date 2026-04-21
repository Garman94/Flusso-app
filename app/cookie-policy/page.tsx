import { Navbar } from "@/components/navbar";
import { siteConfig } from "@/lib/config";
import Link from "next/link";

export const metadata = {
  title: "Cookie Policy — Flusso",
  description: "Informativa sull&apos;uso dei cookie ai sensi del Provvedimento del Garante Privacy.",
};

export default function CookiePolicyPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1 w-full max-w-3xl mx-auto px-5 py-16 flex flex-col gap-10">
        <div className="flex flex-col gap-3">
          <h1 className="text-3xl font-bold">Cookie Policy</h1>
          <p className="text-sm text-muted-foreground">Ultimo aggiornamento: 21 aprile 2025</p>
        </div>

        <p className="text-muted-foreground leading-relaxed">
          La presente Cookie Policy descrive come {siteConfig.name} utilizza i cookie e tecnologie
          simili, in conformità al Provvedimento del Garante per la protezione dei dati personali
          dell&apos;8 gennaio 2015 e alle successive Linee guida del 10 giugno 2021, nonché alla
          Direttiva ePrivacy 2002/58/CE.
        </p>

        <Section title="1. Cosa sono i cookie">
          <p>
            I cookie sono piccoli file di testo che i siti web memorizzano sul dispositivo dell&apos;utente
            durante la navigazione. Permettono al sito di riconoscere il browser e memorizzare determinate
            informazioni (es. preferenze, stato di accesso).
          </p>
        </Section>

        <Section title="2. Cookie utilizzati da questo sito">
          <p>Utilizziamo esclusivamente <strong className="text-foreground">cookie tecnici</strong>, necessari al funzionamento del servizio. Non utilizziamo cookie di profilazione, tracciamento o marketing.</p>

          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 pr-4 font-semibold text-foreground">Nome</th>
                  <th className="text-left py-2 pr-4 font-semibold text-foreground">Tipo</th>
                  <th className="text-left py-2 pr-4 font-semibold text-foreground">Finalità</th>
                  <th className="text-left py-2 font-semibold text-foreground">Durata</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ["sb-*-auth-token", "Tecnico — sessione", "Autenticazione utente (Supabase)", "Sessione / 1 anno"],
                  ["cookie_consent", "Tecnico — funzionale", "Memorizza la scelta sui cookie (localStorage)", "Permanente"],
                  ["__Secure-next-auth.*", "Tecnico — sessione", "Gestione sessione Next.js (se presente)", "Sessione"],
                ].map(([nome, tipo, finalita, durata]) => (
                  <tr key={nome} className="border-b last:border-0">
                    <td className="py-2 pr-4 font-mono text-xs">{nome}</td>
                    <td className="py-2 pr-4">{tipo}</td>
                    <td className="py-2 pr-4">{finalita}</td>
                    <td className="py-2">{durata}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-sm">
            I cookie tecnici non richiedono il consenso dell&apos;utente ai sensi dell&apos;Art. 122 comma 1
            del D.Lgs. 196/2003 e del Provvedimento Garante 8 gennaio 2015.
          </p>
        </Section>

        <Section title="3. Cookie di terze parti">
          <p>
            Il Servizio si avvale di Supabase Inc. per l&apos;autenticazione. Supabase può impostare cookie
            tecnici legati alla sessione. Per i dettagli consulta la{" "}
            <a href="https://supabase.com/privacy" target="_blank" rel="noopener noreferrer" className="underline">
              privacy policy di Supabase
            </a>.
          </p>
          <p>Non sono presenti cookie di Google Analytics, Facebook Pixel, o altri sistemi di tracciamento pubblicitario.</p>
        </Section>

        <Section title="4. Come gestire i cookie">
          <p>
            Puoi controllare e cancellare i cookie tramite le impostazioni del tuo browser:
          </p>
          <ul className="list-disc list-inside space-y-1">
            <li><a href="https://support.google.com/chrome/answer/95647" target="_blank" rel="noopener noreferrer" className="underline">Google Chrome</a></li>
            <li><a href="https://support.mozilla.org/it/kb/Attivare%20e%20disattivare%20i%20cookie" target="_blank" rel="noopener noreferrer" className="underline">Mozilla Firefox</a></li>
            <li><a href="https://support.apple.com/it-it/guide/safari/sfri11471/mac" target="_blank" rel="noopener noreferrer" className="underline">Apple Safari</a></li>
            <li><a href="https://support.microsoft.com/it-it/microsoft-edge/eliminare-i-cookie-in-microsoft-edge-63947406-40ac-c3b8-57b9-2a946a29ae09" target="_blank" rel="noopener noreferrer" className="underline">Microsoft Edge</a></li>
          </ul>
          <p className="text-sm">
            Nota: disabilitare i cookie tecnici potrebbe impedire il corretto funzionamento del login e di altre
            funzionalità essenziali del Servizio.
          </p>
        </Section>

        <Section title="5. Consenso e preferenze">
          <p>
            Al primo accesso al sito viene mostrato un banner che ti permette di:
          </p>
          <ul className="list-disc list-inside space-y-1">
            <li><strong className="text-foreground">Accetta</strong> — confermi l&apos;uso dei cookie tecnici</li>
            <li><strong className="text-foreground">Solo necessari</strong> — acconsenti ai soli cookie strettamente necessari</li>
          </ul>
          <p>
            La tua scelta viene salvata in localStorage con la chiave <code className="text-xs bg-muted px-1 py-0.5 rounded">cookie_consent</code> e non viene trasmessa a nessun server.
            Puoi modificare la tua scelta cancellando i dati del browser o contattandoci a{" "}
            <a href="mailto:garofalo.marco94@gmail.com" className="underline">garofalo.marco94@gmail.com</a>.
          </p>
        </Section>

        <Section title="6. Aggiornamenti">
          <p>
            La presente Cookie Policy può essere aggiornata per riflettere modifiche tecniche o normative.
            La data di &quot;ultimo aggiornamento&quot; indica la versione vigente.
          </p>
        </Section>

        <Section title="7. Contatti">
          <p>
            Per qualsiasi domanda relativa ai cookie:{" "}
            <a href="mailto:garofalo.marco94@gmail.com" className="underline">garofalo.marco94@gmail.com</a>
          </p>
          <p>
            Per maggiori informazioni sul trattamento dei dati personali consulta la{" "}
            <Link href="/privacy" className="underline">Privacy Policy</Link>.
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
