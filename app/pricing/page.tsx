import { Navbar } from "@/components/navbar";
import { PricingCard } from "@/components/pricing-card";
import { siteConfig } from "@/lib/config";
import Link from "next/link";

const faqs = [
  {
    q: "Posso iniziare gratis?",
    a: "Sì. Il piano gratuito non scade mai e non richiede carta di credito. Hai accesso alle funzionalità base da subito.",
  },
  {
    q: "Cosa succede quando supero il limite del piano gratuito?",
    a: "Raggiunti i 50 movimenti mensili o i 3 upload Excel, ti verrà chiesto di fare l'upgrade. Non perdi nessun dato.",
  },
  {
    q: "Che formato Excel supportate?",
    a: "Supportiamo i formati .xlsx e .csv esportati dalle principali banche italiane. Il sistema rileva automaticamente le colonne.",
  },
  {
    q: "Cos'è una regola di categorizzazione?",
    a: "Una regola ti permette di dire: \"se la descrizione contiene 'Esselunga', categorizza come Alimentari\". Le crei una volta, funzionano per sempre.",
  },
  {
    q: "Cos'è il piano Founder?",
    a: "Paghi una volta e hai accesso a vita a tutte le funzionalità Premium, inclusi tutti gli aggiornamenti futuri.",
  },
  {
    q: "Offrite rimborsi?",
    a: "Sì, garanzia di rimborso di 30 giorni, senza fare domande.",
  },
  {
    q: "I miei dati bancari sono al sicuro?",
    a: "Sì. Non ci colleghiamo alla tua banca. Tu carichi solo il file Excel che esporti dalla tua banca. I dati sono crittografati e conservati su server europei.",
  },
  {
    q: "Funziona con la mia banca?",
    a: "Funziona con qualsiasi banca italiana che permette di esportare i movimenti in Excel o CSV (praticamente tutte).",
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
            Inizia gratis. Fai l&apos;upgrade solo quando hai bisogno di più. Nessun costo nascosto.
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

        {/* Feature comparison */}
        <section className="w-full bg-muted/30 py-24">
          <div className="max-w-4xl mx-auto px-5 flex flex-col gap-8">
            <h2 className="text-2xl font-bold text-center">Confronto funzionalità</h2>

            <div className="rounded-xl border overflow-hidden bg-background">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left px-4 py-3 font-semibold">Funzionalità</th>
                    <th className="text-center px-4 py-3 font-semibold">Gratuito</th>
                    <th className="text-center px-4 py-3 font-semibold text-primary">Premium</th>
                    <th className="text-center px-4 py-3 font-semibold">Founder</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ["Transazioni/mese", "50", "Illimitate", "Illimitate"],
                    ["Upload Excel", "3/mese", "Illimitati", "Illimitati"],
                    ["Categorie base", "✅", "✅", "✅"],
                    ["Regole categorizzazione", "5", "Illimitate", "Illimitate"],
                    ["Obiettivi finanziari", "1", "Illimitati", "Illimitati"],
                    ["Previsioni spese", "❌", "✅", "✅"],
                    ["Consigli di risparmio", "❌", "✅", "✅"],
                    ["Export dati", "❌", "✅", "✅"],
                    ["Supporto prioritario", "❌", "❌", "✅"],
                    ["Accesso a vita", "❌", "❌", "✅"],
                    ["Prezzo mensile", "Gratis", "€4,99/mese", "€49 una tantum"],
                    ["Opzione annuale", "—", "€39/anno", "—"],
                  ].map(([feature, free, premium, founder]) => (
                    <tr key={feature} className="border-b last:border-b-0 hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 text-muted-foreground">{feature}</td>
                      <td className="px-4 py-3 text-center">{free}</td>
                      <td className="px-4 py-3 text-center font-medium text-primary">{premium}</td>
                      <td className="px-4 py-3 text-center">{founder}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="w-full py-24">
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
        <section className="w-full max-w-5xl px-5 py-16 flex flex-col items-center text-center gap-6">
          <h2 className="text-2xl font-bold">Hai altre domande?</h2>
          <p className="text-muted-foreground">
            Scrivici, ti rispondiamo entro 24 ore.
          </p>
          <Link
            href="/auth/sign-up"
            className="inline-flex items-center justify-center rounded-md bg-primary text-primary-foreground px-8 py-3 text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            Comincia ora — è gratis
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
