import Link from "next/link";
import { Navbar } from "@/components/navbar";
import { PricingCard } from "@/components/pricing-card";
import { siteConfig } from "@/lib/config";

const features = [
  {
    icon: "📊",
    title: "Dashboard essenziale",
    description:
      "I numeri che contano subito in evidenza: saldo, entrate, uscite del mese. Scorri per approfondire.",
  },
  {
    icon: "📁",
    title: "Carica il tuo Excel",
    description:
      "Importa l'estratto conto direttamente dal file della tua banca. Le categorie vengono rilevate automaticamente.",
  },
  {
    icon: "🏷️",
    title: "Categorie smart",
    description:
      "Regole intelligenti che categorizzano automaticamente le spese. Se un movimento contiene \"Esselunga\" diventa Alimentari.",
  },
  {
    icon: "🔮",
    title: "Previsioni spese",
    description:
      "Analizza le spese passate e prevede quanto spenderai il prossimo mese per ogni categoria.",
  },
  {
    icon: "💡",
    title: "Consigli di risparmio",
    description:
      "Suggerimenti personalizzati basati sulle tue abitudini di spesa per aiutarti a risparmiare di più.",
  },
  {
    icon: "🎯",
    title: "Obiettivi finanziari",
    description:
      "Imposta obiettivi di risparmio e tieni traccia dei progressi. Vacanza, fondo emergenza, acquisto importante.",
  },
];

const steps = [
  {
    step: "1",
    title: "Registrati gratis",
    description: "Crea il tuo account in 30 secondi. Nessuna carta di credito.",
  },
  {
    step: "2",
    title: "Carica le tue spese",
    description: "Importa il file Excel della banca o inserisci le transazioni manualmente.",
  },
  {
    step: "3",
    title: "Prendi il controllo",
    description: "Visualizza dove vanno i tuoi soldi e inizia a risparmiare.",
  },
];

export default function HomePage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />

      <main className="flex-1 flex flex-col items-center">
        {/* Hero */}
        <section className="w-full max-w-5xl px-5 py-24 flex flex-col items-center text-center gap-8">
          <div className="inline-flex items-center rounded-full border px-4 py-1.5 text-sm text-muted-foreground">
            💸 Finanze personali semplici e intelligenti
          </div>

          <h1 className="text-5xl md:text-6xl font-bold tracking-tight max-w-3xl leading-tight">
            {siteConfig.tagline}
          </h1>

          <p className="text-xl text-muted-foreground max-w-xl">
            {siteConfig.description}
          </p>

          <div className="flex gap-3 flex-wrap justify-center">
            <Link
              href="/auth/sign-up"
              className="inline-flex items-center justify-center rounded-md bg-primary text-primary-foreground px-6 py-3 text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              Inizia gratis
            </Link>
            <Link
              href="/pricing"
              className="inline-flex items-center justify-center rounded-md border px-6 py-3 text-sm font-medium hover:bg-accent transition-colors"
            >
              Vedi i prezzi
            </Link>
          </div>

          {/* Social proof */}
          <p className="text-sm text-muted-foreground">
            Gratis per sempre · Nessuna carta di credito · Setup in 2 minuti
          </p>
        </section>

        <div className="w-full max-w-5xl px-5">
          <div className="w-full h-px bg-gradient-to-r from-transparent via-foreground/10 to-transparent" />
        </div>

        {/* Features */}
        <section id="features" className="w-full max-w-5xl px-5 py-24 flex flex-col gap-12">
          <div className="text-center flex flex-col gap-3">
            <h2 className="text-3xl font-bold">Tutto quello che ti serve</h2>
            <p className="text-muted-foreground max-w-xl mx-auto">
              Smetti di usare fogli Excel complicati. Flusso fa il lavoro sporco per te.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="rounded-xl border p-6 flex flex-col gap-3 bg-card hover:shadow-md transition-shadow"
              >
                <span className="text-3xl">{feature.icon}</span>
                <h3 className="font-semibold">{feature.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section className="w-full bg-muted/30 py-24">
          <div className="max-w-5xl mx-auto px-5 flex flex-col gap-12">
            <div className="text-center flex flex-col gap-3">
              <h2 className="text-3xl font-bold">Come funziona</h2>
              <p className="text-muted-foreground">Tre passi per avere il controllo totale.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {steps.map((s) => (
                <div key={s.step} className="flex flex-col items-center text-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xl font-bold">
                    {s.step}
                  </div>
                  <h3 className="font-semibold text-lg">{s.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{s.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Pricing preview */}
        <section className="w-full max-w-5xl px-5 py-24 flex flex-col gap-12">
          <div className="text-center flex flex-col gap-3">
            <h2 className="text-3xl font-bold">Prezzi onesti</h2>
            <p className="text-muted-foreground">
              Inizia gratis. Passa a Premium quando vuoi di più.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {Object.values(siteConfig.plans).map((plan) => (
              <PricingCard key={plan.label} plan={plan} />
            ))}
          </div>
        </section>

        {/* CTA finale */}
        <section className="w-full bg-primary py-24">
          <div className="max-w-5xl mx-auto px-5 flex flex-col items-center text-center gap-6">
            <h2 className="text-3xl font-bold text-primary-foreground">
              Pronto a controllare le tue finanze?
            </h2>
            <p className="text-primary-foreground/80 max-w-md">
              Unisciti a chi ha già smesso di chiedersi dove finiscono i soldi ogni mese.
            </p>
            <Link
              href="/auth/sign-up"
              className="inline-flex items-center justify-center rounded-md bg-background text-foreground px-8 py-3 text-sm font-medium hover:bg-background/90 transition-colors"
            >
              Inizia gratis ora
            </Link>
          </div>
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
