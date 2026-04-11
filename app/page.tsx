import Link from "next/link";
import { Navbar } from "@/components/navbar";
import { PricingCard } from "@/components/pricing-card";
import { siteConfig } from "@/lib/config";

const features = [
  {
    icon: "🔐",
    title: "Auth pronta",
    description:
      "Registrazione, accesso, recupero password e conferma email — tutto integrato con Supabase.",
  },
  {
    icon: "👤",
    title: "Profili utente",
    description:
      "Tabella profiles creata automaticamente alla registrazione con nome e piano. Policy RLS incluse.",
  },
  {
    icon: "💳",
    title: "Pagamenti con Lemon Squeezy",
    description:
      "Webhook che aggiorna il piano utente automaticamente sugli eventi di pagamento.",
  },
  {
    icon: "🛡️",
    title: "Protezione delle route",
    description:
      "Il middleware protegge le route /dashboard e reindirizza gli utenti autenticati dalla pagina di login.",
  },
  {
    icon: "🎨",
    title: "Componenti UI",
    description:
      "Componenti shadcn/ui con Tailwind CSS e supporto dark mode già pronti all'uso.",
  },
  {
    icon: "⚡",
    title: "Next.js 16 + App Router",
    description:
      "Costruito sull'ultima versione di Next.js con server components, streaming e Turbopack.",
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
            Boilerplate SaaS production-ready
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
        </section>

        {/* Divider */}
        <div className="w-full max-w-5xl px-5">
          <div className="w-full h-px bg-gradient-to-r from-transparent via-foreground/10 to-transparent" />
        </div>

        {/* Features */}
        <section id="features" className="w-full max-w-5xl px-5 py-24 flex flex-col gap-12">
          <div className="text-center flex flex-col gap-3">
            <h2 className="text-3xl font-bold">Tutto incluso</h2>
            <p className="text-muted-foreground">
              Smettila di costruire sempre lo stesso boilerplate. Inizia da ciò che conta davvero.
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

        {/* Pricing preview */}
        <section className="w-full bg-muted/30 py-24">
          <div className="max-w-5xl mx-auto px-5 flex flex-col gap-12">
            <div className="text-center flex flex-col gap-3">
              <h2 className="text-3xl font-bold">Prezzi semplici</h2>
              <p className="text-muted-foreground">
                Inizia gratis, fai l&apos;upgrade quando sei pronto.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {Object.values(siteConfig.plans).map((plan) => (
                <PricingCard key={plan.label} plan={plan} />
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="w-full max-w-5xl px-5 py-24 flex flex-col items-center text-center gap-6">
          <h2 className="text-3xl font-bold">Pronto a lanciare?</h2>
          <p className="text-muted-foreground max-w-md">
            Unisciti agli sviluppatori che saltano il setup noioso e si concentrano sul prodotto.
          </p>
          <Link
            href="/auth/sign-up"
            className="inline-flex items-center justify-center rounded-md bg-primary text-primary-foreground px-8 py-3 text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            Inizia a costruire gratis
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
