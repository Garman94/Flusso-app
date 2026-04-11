import { Navbar } from "@/components/navbar";
import { siteConfig } from "@/lib/config";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: `Privacy Policy — ${siteConfig.name}`,
  description: `Informativa sulla privacy di ${siteConfig.name}.`,
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1 w-full max-w-3xl mx-auto px-5 py-16 flex flex-col gap-8">
        <div>
          <h1 className="text-3xl font-bold">Privacy Policy</h1>
          <p className="text-muted-foreground mt-2">Ultimo aggiornamento: {new Date().toLocaleDateString("it-IT")}</p>
        </div>

        <section className="flex flex-col gap-4 text-sm leading-relaxed text-muted-foreground">
          <p>
            La tua privacy è importante per noi. Questa informativa spiega quali dati raccogliamo, come li utilizziamo e come li proteggiamo.
          </p>

          <h2 className="text-base font-semibold text-foreground mt-4">1. Dati che raccogliamo</h2>
          <p>Raccogliamo i seguenti tipi di informazioni:</p>
          <ul className="list-disc list-inside flex flex-col gap-1 ml-2">
            <li>Informazioni dell&apos;account (email, nome)</li>
            <li>Dati di utilizzo del servizio</li>
            <li>Informazioni di pagamento (gestite da Lemon Squeezy, non archiviamo dati della carta)</li>
          </ul>

          <h2 className="text-base font-semibold text-foreground mt-4">2. Come utilizziamo i dati</h2>
          <p>Utilizziamo i tuoi dati per:</p>
          <ul className="list-disc list-inside flex flex-col gap-1 ml-2">
            <li>Fornire e migliorare il servizio</li>
            <li>Inviarti comunicazioni relative all&apos;account</li>
            <li>Elaborare i pagamenti</li>
            <li>Garantire la sicurezza del servizio</li>
          </ul>

          <h2 className="text-base font-semibold text-foreground mt-4">3. Condivisione dei dati</h2>
          <p>
            Non vendiamo né condividiamo i tuoi dati personali con terze parti, eccetto per i fornitori di servizi necessari al funzionamento della piattaforma (Supabase, Lemon Squeezy, Resend).
          </p>

          <h2 className="text-base font-semibold text-foreground mt-4">4. Cookie</h2>
          <p>
            Utilizziamo cookie tecnici necessari per il funzionamento del servizio (autenticazione). Non utilizziamo cookie di profilazione o tracciamento di terze parti.
          </p>

          <h2 className="text-base font-semibold text-foreground mt-4">5. I tuoi diritti (GDPR)</h2>
          <p>Hai il diritto di:</p>
          <ul className="list-disc list-inside flex flex-col gap-1 ml-2">
            <li>Accedere ai tuoi dati personali</li>
            <li>Rettificare dati inesatti</li>
            <li>Richiedere la cancellazione dei tuoi dati</li>
            <li>Opporti al trattamento dei dati</li>
          </ul>

          <h2 className="text-base font-semibold text-foreground mt-4">6. Contatti</h2>
          <p>
            Per esercitare i tuoi diritti o per qualsiasi domanda sulla privacy, contattaci: <span className="text-foreground">[email di contatto]</span>
          </p>
        </section>
      </main>
    </div>
  );
}
