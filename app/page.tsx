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

const painPoints = [
  {
    icon: "😩",
    text: "A fine mese non sai dove sono finiti i soldi",
  },
  {
    icon: "📊",
    text: "Hai provato Excel ma è troppo complicato da tenere aggiornato",
  },
  {
    icon: "🏦",
    text: "L'app della banca mostra i movimenti ma non ti aiuta a capirli",
  },
];

const mockCategories = [
  { icon: "🏠", label: "Casa", amount: "€450" },
  { icon: "🍕", label: "Cibo", amount: "€230" },
  { icon: "🚗", label: "Trasporti", amount: "€180" },
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
            Finalmente sai dove finiscono i tuoi soldi
          </h1>

          <p className="text-xl text-muted-foreground max-w-xl">
            Carica l&apos;estratto conto della tua banca, Flusso categorizza tutto automaticamente e ti dice dove puoi risparmiare. Gratis.
          </p>

          <div className="flex gap-3 flex-wrap justify-center">
            <Link
              href="/auth/sign-up"
              className="inline-flex items-center justify-center rounded-md bg-primary text-primary-foreground px-6 py-3 text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              Inizia gratis — nessuna carta
            </Link>
            <Link
              href="/#features"
              className="inline-flex items-center justify-center rounded-md border px-6 py-3 text-sm font-medium hover:bg-accent transition-colors"
            >
              Guarda come funziona
            </Link>
          </div>

          <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
            <span>✓ Piano gratuito senza scadenza</span>
            <span>✓ Setup in 2 minuti</span>
            <span>✓ Dati al sicuro in EU</span>
            <span>✓ Rimborso garantito 30 giorni (Premium)</span>
          </div>
        </section>

        {/* Social proof bar */}
        <section className="w-full max-w-5xl px-5 pb-16 flex flex-col items-center gap-2">
          <p className="text-sm text-muted-foreground text-center">
            Già usato da <span className="text-foreground font-semibold">100+ persone</span> al posto di Excel
          </p>
        </section>

        {/* App mockup */}
        <section className="w-full max-w-5xl px-5 pb-24 flex justify-center">
          <div className="relative mx-auto w-[260px]">
            {/* Phone frame */}
            <div className="rounded-[40px] border-4 border-foreground/15 bg-card shadow-2xl overflow-hidden">
              {/* Notch */}
              <div className="h-7 bg-muted/50 flex items-center justify-center">
                <div className="w-20 h-3.5 bg-foreground/10 rounded-full" />
              </div>
              {/* Screen content */}
              <div className="p-4 flex flex-col gap-3 bg-background min-h-[420px]">
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs text-muted-foreground">Saldo attuale</span>
                  <span className="text-2xl font-bold">€ 2.340,50</span>
                </div>

                {/* Mini line chart */}
                <div className="w-full h-14 rounded-lg bg-primary/5 px-2 py-1">
                  <svg viewBox="0 0 220 48" className="w-full h-full" preserveAspectRatio="none">
                    <defs>
                      <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="rgb(99,102,241)" stopOpacity="0.3" />
                        <stop offset="100%" stopColor="rgb(99,102,241)" stopOpacity="0" />
                      </linearGradient>
                    </defs>
                    <polyline
                      points="0,42 30,36 60,40 90,22 120,26 150,12 180,17 220,8"
                      fill="none"
                      stroke="rgb(99,102,241)"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <polygon
                      points="0,42 30,36 60,40 90,22 120,26 150,12 180,17 220,8 220,48 0,48"
                      fill="url(#chartGrad)"
                    />
                  </svg>
                </div>

                {/* Score badge */}
                <div className="rounded-lg bg-green-500/10 border border-green-500/20 px-3 py-2 text-xs font-medium text-green-600 dark:text-green-400 text-center">
                  🟢 Ottimo mese!
                </div>

                {/* Category pills */}
                <div className="flex flex-col gap-2">
                  {mockCategories.map((c) => (
                    <div
                      key={c.label}
                      className="flex items-center justify-between rounded-lg bg-muted/60 px-3 py-2 text-xs"
                    >
                      <span className="font-medium">{c.icon} {c.label}</span>
                      <span className="font-bold">{c.amount}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            {/* Glow effect */}
            <div className="absolute -inset-4 -z-10 rounded-[50px] bg-primary/10 blur-2xl" />
          </div>
        </section>

        {/* Pain points */}
        <section className="w-full bg-muted/30 py-24">
          <div className="max-w-5xl mx-auto px-5 flex flex-col gap-12">
            <div className="text-center flex flex-col gap-3">
              <h2 className="text-3xl font-bold">Ti riconosci in qualcuna di queste situazioni?</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {painPoints.map((p) => (
                <div
                  key={p.icon}
                  className="rounded-xl border bg-background p-6 flex flex-col items-center text-center gap-4"
                >
                  <span className="text-4xl">{p.icon}</span>
                  <p className="text-sm text-muted-foreground leading-relaxed">{p.text}</p>
                </div>
              ))}
            </div>

            <p className="text-center font-semibold text-lg">
              Flusso risolve tutto questo in 2 minuti.
            </p>
          </div>
        </section>

        <div className="w-full max-w-5xl px-5 py-4">
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

          <div className="flex justify-center">
            <Link
              href="/auth/sign-up"
              className="inline-flex items-center justify-center rounded-md bg-primary text-primary-foreground px-6 py-3 text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              Prova gratis per sempre
            </Link>
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

        {/* Security section */}
        <section className="w-full bg-muted/30 py-16">
          <div className="max-w-5xl mx-auto px-5 flex flex-col items-center gap-8">
            <h2 className="text-2xl font-bold text-center">I tuoi dati sono al sicuro</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full">
              {[
                { icon: "🔒", text: "Crittografia dei dati (in transito e a riposo)" },
                { icon: "☁️", text: "Dati conservati su infrastruttura cloud sicura (Supabase)" },
                { icon: "🚫", text: "Non vendiamo i tuoi dati a terzi" },
              ].map((item) => (
                <div key={item.text} className="flex flex-col items-center text-center gap-2">
                  <span className="text-3xl">{item.icon}</span>
                  <p className="text-sm font-medium">{item.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA finale */}
        <section className="w-full bg-primary py-24">
          <div className="max-w-5xl mx-auto px-5 flex flex-col items-center text-center gap-6">
            <h2 className="text-3xl font-bold text-primary-foreground">
              Pronto a controllare le tue finanze?
            </h2>
            <p className="text-primary-foreground/80 max-w-md">
              Unisciti a chi ha già il controllo delle proprie finanze.
            </p>
            <Link
              href="/auth/sign-up"
              className="inline-flex items-center justify-center rounded-md bg-background text-foreground px-8 py-3 text-sm font-medium hover:bg-background/90 transition-colors"
            >
              Unisciti a chi ha già il controllo delle proprie finanze →
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
