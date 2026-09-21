/**
 * Configurazione del sito — modifica questi valori per personalizzare l'app.
 */

/** Giorni di Premium inclusi alla registrazione (vedi migration 036 e lib/plans.ts). */
export const TRIAL_DAYS = 14;

export const siteConfig = {
  name: "Flusso",
  tagline: "Controlla le tue finanze, raggiungi i tuoi obiettivi",
  description:
    "Carica l'estratto conto della tua banca, vedi dove vanno i soldi e metti da parte ogni mese quanto serve per le spese future.",
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",

  // I pulsanti dei piani puntano tutti alla registrazione: l'acquisto Premium parte
  // da Account → Piano, dove il checkout riceve lo user_id che il webhook richiede.
  // Un link diretto a Lemon Squeezy da qui farebbe pagare senza attivare il piano.
  plans: {
    free: {
      label: "Gratuito",
      price: 0,
      description: `Inizia subito. Nessuna carta di credito richiesta. Per i primi ${TRIAL_DAYS} giorni hai anche Premium.`,
      features: [
        "Transazioni manuali illimitate",
        "Import dell'estratto conto (3 file al mese)",
        "Dashboard con saldo, entrate e uscite",
        "Categorie e regole personalizzate",
        "1 obiettivo di risparmio",
        "Esporta i tuoi movimenti in CSV",
      ],
      cta: "Comincia ora — è gratis",
      href: "/auth/sign-up",
    },
    premium: {
      label: "Premium",
      price: 4.99,
      annualPrice: 39,
      description: "Per tenere sotto controllo anche le spese future.",
      features: [
        "Tutto del piano Gratuito",
        "Import illimitati dell'estratto conto",
        "Import da screenshot (AI)",
        "Smart: Budget per categoria, Accantonamenti, Rate",
        "Obiettivi e salvadanai illimitati",
        "30 giorni soddisfatti o rimborsati",
      ],
      cta: `Prova ${TRIAL_DAYS} giorni gratis`,
      href: "/auth/sign-up",
      highlighted: true,
    },
    founder: {
      label: "Founder",
      price: 49,
      description: "Accesso a vita. Su richiesta, attivato a mano da me.",
      features: [
        "Tutto di Premium",
        "Accesso a vita — paghi una volta",
        "Accesso anticipato alle nuove funzionalità",
        "Supporto diretto con me",
        "Voto sulle nuove funzionalità",
        "Registrati e scrivimi dalla chat in Account",
      ],
      cta: "Richiedi accesso Founder",
      href: "/auth/sign-up",
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
