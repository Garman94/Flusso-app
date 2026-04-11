import { Navbar } from "@/components/navbar";
import { PricingCard } from "@/components/pricing-card";
import { siteConfig } from "@/lib/config";
import Link from "next/link";

const faqs = [
  {
    q: "Posso iniziare gratis?",
    a: "Sì. Il piano gratuito non scade mai e non richiede carta di credito.",
  },
  {
    q: "Quali metodi di pagamento accettate?",
    a: "Tutte le principali carte di credito e PayPal tramite Lemon Squeezy.",
  },
  {
    q: "Posso annullare in qualsiasi momento?",
    a: "Sì, puoi annullare il tuo abbonamento in qualsiasi momento. Manterrai l'accesso fino alla fine del periodo di fatturazione.",
  },
  {
    q: "Cos'è il piano Founder?",
    a: "Il piano Founder è un pagamento unico che ti dà accesso a vita a tutte le funzionalità, inclusi gli aggiornamenti futuri.",
  },
  {
    q: "Offrite rimborsi?",
    a: "Sì, offriamo una garanzia di rimborso di 30 giorni, senza fare domande.",
  },
];

export default function PricingPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />

      <main className="flex-1 flex flex-col items-center">
        {/* Header */}
        <section className="w-full max-w-5xl px-5 py-20 flex flex-col items-center text-center gap-5">
          <h1 className="text-4xl md:text-5xl font-bold">Prezzi semplici e trasparenti</h1>
          <p className="text-muted-foreground text-lg max-w-xl">
            Inizia gratis. Fai l&apos;upgrade quando ne hai bisogno. Nessun costo nascosto.
          </p>
        </section>

        {/* Plans */}
        <section className="w-full max-w-5xl px-5 pb-24">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {Object.values(siteConfig.plans).map((plan) => (
              <PricingCard key={plan.label} plan={plan} />
            ))}
          </div>
        </section>

        {/* FAQ */}
        <section className="w-full bg-muted/30 py-24">
          <div className="max-w-2xl mx-auto px-5 flex flex-col gap-10">
            <h2 className="text-2xl font-bold text-center">Domande frequenti</h2>
            <div className="flex flex-col gap-6">
              {faqs.map((faq) => (
                <div key={faq.q} className="flex flex-col gap-2">
                  <h3 className="font-semibold">{faq.q}</h3>
                  <p className="text-muted-foreground text-sm leading-relaxed">{faq.a}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="w-full max-w-5xl px-5 py-24 flex flex-col items-center text-center gap-6">
          <h2 className="text-3xl font-bold">Hai ancora domande?</h2>
          <p className="text-muted-foreground">
            Siamo felici di aiutarti. Scrivici e ti risponderemo al più presto.
          </p>
          <Link
            href="/auth/sign-up"
            className="inline-flex items-center justify-center rounded-md bg-primary text-primary-foreground px-8 py-3 text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            Inizia gratis
          </Link>
        </section>
      </main>

      {/* Footer */}
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
