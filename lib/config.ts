/**
 * Configurazione del sito — modifica questi valori per personalizzare il boilerplate.
 */
export const siteConfig = {
  name: "ShipFast",
  tagline: "Lancia il tuo SaaS in un weekend",
  description:
    "Un boilerplate production-ready con Next.js + Supabase: auth, piani e pagamenti già integrati — così puoi concentrarti sul tuo prodotto.",
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",

  plans: {
    free: {
      label: "Gratuito",
      price: 0,
      description: "Inizia gratis. Nessuna carta di credito richiesta.",
      features: [
        "Fino a 3 progetti",
        "Analytics di base",
        "Supporto community",
      ],
      cta: "Inizia gratis",
      href: "/auth/sign-up",
    },
    premium: {
      label: "Premium",
      price: 29,
      description: "Tutto quello che ti serve per lanciare un prodotto professionale.",
      features: [
        "Progetti illimitati",
        "Analytics avanzate",
        "Supporto prioritario",
        "Rimuovi il branding",
        "Dominio personalizzato",
      ],
      cta: "Passa a Premium",
      href: process.env.NEXT_PUBLIC_LEMON_SQUEEZY_PRODUCT_URL ?? "/auth/sign-up",
      highlighted: true,
    },
    founder: {
      label: "Founder",
      price: 99,
      description: "Accesso a vita. Paghi una volta, usi per sempre.",
      features: [
        "Tutto di Premium",
        "Accesso a vita",
        "Accesso al codice sorgente",
        "Call di onboarding 1-on-1",
        "Accesso anticipato alle nuove funzionalità",
      ],
      cta: "Ottieni accesso Founder",
      href: process.env.NEXT_PUBLIC_LEMON_SQUEEZY_PRODUCT_URL ?? "/auth/sign-up",
    },
  },

  nav: {
    links: [
      { label: "Funzionalità", href: "/#features" },
      { label: "Prezzi", href: "/pricing" },
      { label: "Blog", href: "/blog" },
    ],
  },

  footer: {
    links: [
      { label: "Privacy Policy", href: "/privacy" },
      { label: "Termini di servizio", href: "/terms" },
    ],
  },
} as const;
