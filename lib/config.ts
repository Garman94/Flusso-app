/**
 * Configurazione del sito — modifica questi valori per personalizzare l'app.
 */
export const siteConfig = {
  name: "Flusso",
  tagline: "Controlla le tue finanze, raggiungi i tuoi obiettivi",
  description:
    "Tieni traccia delle spese, carica i tuoi estratti conto, ottieni previsioni intelligenti e consigli di risparmio personalizzati.",
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",

  plans: {
    free: {
      label: "Gratuito",
      price: 0,
      description: "Inizia subito. Nessuna carta di credito richiesta.",
      features: [
        "Transazioni manuali illimitate",
        "Upload Excel (3 al mese)",
        "Dashboard con saldo e trend",
        "Categorie e regole personalizzate",
      ],
      cta: "Comincia ora — è gratis",
      href: "/auth/sign-up",
    },
    premium: {
      label: "Premium",
      price: 4.99,
      annualPrice: 39,
      description: "Tutto il controllo di cui hai bisogno sulle tue finanze.",
      features: [
        "Tutto del piano Gratuito",
        "Upload Excel illimitati",
        "Importa da screenshot (AI)",
        "Sezione Smart: Previsioni, Ricorrenti, Obiettivi",
        "30 giorni soddisfatti o rimborsati",
      ],
      cta: "Prova Premium — 30 giorni rimborso",
      href: process.env.NEXT_PUBLIC_LEMON_SQUEEZY_PRODUCT_URL ?? "/auth/sign-up",
      highlighted: true,
    },
    founder: {
      label: "Founder",
      price: 49,
      description: "Accesso a vita. Paghi una volta, usi per sempre.",
      features: [
        "Tutto di Premium",
        "Accesso a vita — paghi una volta",
        "Accesso anticipato alle nuove funzionalità",
        "Supporto prioritario diretto",
        "Voto sulle nuove funzionalità",
      ],
      cta: "Ottieni accesso Founder",
      href: process.env.NEXT_PUBLIC_LEMON_SQUEEZY_PRODUCT_URL ?? "/auth/sign-up",
    },
  },

  nav: {
    links: [
      { label: "Funzionalità", href: "/#features" },
      { label: "Prezzi", href: "/pricing" },
    ],
  },

  footer: {
    links: [
      { label: "Privacy Policy", href: "/privacy" },
      { label: "Termini di servizio", href: "/terms" },
      { label: "Cookie Policy", href: "/cookie-policy" },
    ],
  },
} as const;
