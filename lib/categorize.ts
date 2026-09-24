// Categorizzazione automatica dei movimenti importati — funzioni pure, testate in tests/categorize.test.ts.
// Restituisce sempre il NOME della categoria: il collegamento all'id (le categorie sono per utente)
// lo fa il chiamante.

/** Categorie che alcune banche (es. Isybank) scrivono già nel file → nostra categoria. */
export const BANK_CATEGORY_MAP: Record<string, string> = {
  "Generi alimentari e supermercato": "Alimentari",
  "Ristoranti e bar": "Ristoranti",
  "Carburanti": "Trasporti",
  "Manutenzione veicoli": "Trasporti",
  "Pedaggi e Telepass": "Trasporti",
  "Trasporti, noleggi, taxi e parcheggi": "Trasporti",
  "Treno, aereo, nave": "Viaggi",
  "Farmacia": "Salute",
  "Cura della persona": "Salute",
  "Abbigliamento e accessori": "Abbigliamento",
  "Lavanderia e sartoria": "Abbigliamento",
  "Spettacoli e musei": "Intrattenimento",
  "Libri, film e musica": "Intrattenimento",
  "Tempo libero varie": "Intrattenimento",
  "Giochi e giocattoli": "Hobby",
  "Corsi e sport": "Palestra",
  "Domiciliazioni e Utenze": "Bollette",
  "Gas & energia elettrica": "Bollette",
  "TV, Internet, telefono": "Bollette",
  "Cellulare": "Bollette",
  "Polizze": "Assicurazioni",
  "Stipendi e pensioni": "Stipendio",
  "Hi-tech e informatica": "Tecnologia",
  "Elettrodomestici, arredamento e giardino": "Casa",
  "Casa varie": "Casa",
  "Manutenzione casa": "Casa",
  "Affitti incassati": "Casa",
  "Rate Mutuo e Finanziamento": "Casa",
  "Istruzione": "Istruzione",
  "Trasferimenti": "Accantonamenti",
  "Giroconti": "Accantonamenti",
};

// Parole chiave per categoria. A parità di testo vince la parola chiave PIÙ LUNGA
// (così "eni gas" batte "eni"), non l'ordine delle categorie.
const KEYWORDS: Record<string, string[]> = {
  Alimentari: ["esselunga", "coop", "lidl", "aldi", "carrefour", "pam", "conad", "eurospin", "penny", "despar", "famila", "tigros", "bennet", "iper", "supermercato", "supermarket", "md spa", "md discount", "todis", "sigma", "il gigante", "naturasi", "eataly", "panificio", "macelleria", "ortofrutta", "alimentari", "crai", "simply", "auchan", "dok", "gs spa", "superstore"],
  Ristoranti: ["ristorante", "pizzeria", "osteria", "trattoria", "bar", "caffe", "mcdonald", "burger king", "kfc", "kebab", "sushi", "just eat", "deliveroo", "glovo", "uber eats", "autogrill", "old wild west", "roadhouse", "starbucks", "pasticceria", "gelateria", "tavola calda", "paninoteca", "birreria", "pub", "poke", "spizzico", "chef express"],
  Trasporti: ["eni", "enilive", "q8", "shell", "tamoil", "ip", "api", "esso", "repsol", "benzina", "gasolio", "carburante", "autostrada", "autostrade", "telepass", "taxi", "uber", "free now", "atm", "gtt", "trenord", "trenitalia", "italo", "flixbus", "parcheggio", "parking", "easypark", "bollo auto", "aci", "officina", "gommista", "revisione auto"],
  Viaggi: ["hotel", "airbnb", "booking", "expedia", "volo", "aeroporto", "hostel", "ryanair", "easyjet", "wizz air", "ita airways", "lufthansa", "vueling", "skyscanner", "hertz", "avis", "europcar", "sixt", "crociere", "trip com"],
  Salute: ["farmacia", "parafarmacia", "medico", "dentista", "ospedale", "clinica", "visita", "esame", "laboratorio analisi", "poliambulatorio", "studio medico", "ottica", "salmoiraghi", "fisioterap", "veterinar", "centro medico", "asl", "ticket sanitario"],
  Abbigliamento: ["zara", "h m", "primark", "mango", "nike", "adidas", "decathlon", "zalando", "asos", "ovs", "piazza italia", "calzedonia", "intimissimi", "tezenis", "terranova", "bershka", "pull bear", "stradivarius", "uniqlo", "shein", "yoox", "geox", "foot locker", "rinascente", "abbigliamento", "boutique"],
  Intrattenimento: ["netflix", "spotify", "disney", "amazon prime", "prime video", "dazn", "sky", "now tv", "cinema", "teatro", "ticketone", "youtube", "apple com bill", "google play", "twitch", "audible", "kindle", "uci cinemas", "the space", "concerto", "museo", "discoteca", "vivaticket", "eventbrite"],
  Hobby: ["steam", "nintendo", "playstation", "xbox", "gamestop", "modellismo", "hobby", "bricolage", "warhammer", "subsonica", "games workshop", "citta del sole"],
  Tecnologia: ["apple", "amazon", "mediaworld", "unieuro", "euronics", "microsoft", "google", "trony", "samsung", "huawei", "xiaomi", "aruba", "hostinger", "dropbox", "icloud", "adobe", "openai", "chatgpt"],
  Casa: ["ikea", "leroy merlin", "brico", "obi", "bricoman", "maisons du monde", "mondo convenienza", "conforama", "zara home", "affitto", "condominio", "mutuo", "rata mutuo", "imu", "idraulico", "elettricista", "tigota", "acqua e sapone", "flying tiger", "kasanova"],
  Bollette: ["enel", "edison", "plenitude", "eni gas", "eni plenitude", "sorgenia", "a2a", "iren", "hera", "acea", "snam", "tim", "vodafone", "wind tre", "windtre", "fastweb", "iliad", "ho mobile", "poste mobile", "very mobile", "kena", "bolletta", "utenza", "canone rai", "rai", "tari", "luce", "gas", "acqua", "ricarica telefonica"],
  Assicurazioni: ["generali", "allianz", "unipol", "unipolsai", "axa", "zurich", "reale mutua", "linear", "direct line", "verti", "genertel", "assicurazione", "assicurazioni", "polizza", "rcauto", "rc auto"],
  Palestra: ["palestra", "fitness", "virgin active", "mcfit", "gym", "crossfit", "piscina", "yoga", "pilates", "basefit", "anytime fitness", "padel", "tennis"],
  Istruzione: ["universita", "udemy", "coursera", "mondadori", "feltrinelli", "scuola", "retta", "asilo", "mensa scolastica", "libreria", "libri", "iscrizione"],
  Accantonamenti: ["giroconto", "accantonamento", "bonifico risparmio", "salvadanaio", "conto deposito", "fondo comune", "conto risparmio", "piano di accumulo"],
  Stipendio: ["stipendio", "accredito stipendio", "salary", "emolumenti", "cedolino", "retribuzione"],
};

/** minuscolo, senza accenti né punteggiatura: "H&M" → "h m", "Caffè" → "caffe". */
export function normalizeText(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const INDEX = Object.entries(KEYWORDS).flatMap(([category, list]) =>
  list.map((kw) => ({ category, kw: normalizeText(kw) })).filter((e) => e.kw.length > 0),
);

/** Parole chiave corte (< 6 lettere) valgono solo come parola intera: "bar" sì in "BAR SPORT", no in "BARILLA". */
const SHORT = 6;

export function guessFromDescription(description: string): string | null {
  const text = ` ${normalizeText(description)} `;
  if (text.trim() === "") return null;
  let best: { category: string; len: number } | null = null;
  for (const { category, kw } of INDEX) {
    const hit = kw.length >= SHORT ? text.includes(kw) : text.includes(` ${kw} `);
    if (hit && (!best || kw.length > best.len)) best = { category, len: kw.length };
  }
  return best?.category ?? null;
}

/** Categoria data dalla banca se riconosciuta, altrimenti dedotta dalla descrizione. */
export function guessCategoryName(bankCategory: string, description: string): string | null {
  const mapped = BANK_CATEGORY_MAP[bankCategory.trim()];
  if (mapped) return mapped;
  return guessFromDescription(description);
}

// ── Regole dell'utente ──────────────────────────────────────────────────────

export type UserRule = { value: string; category_id: string };

/**
 * Categoria (id) data da una regola dell'utente, o null. Le regole vincono sulle parole
 * chiave predefinite: rappresentano una scelta esplicita. A parità vince la più lunga.
 */
export function matchUserRule(description: string, rules: UserRule[]): string | null {
  const text = ` ${normalizeText(description)} `;
  let best: { id: string; len: number } | null = null;
  for (const r of rules) {
    const v = normalizeText(r.value);
    if (!v) continue;
    if (text.includes(` ${v} `) || (v.length >= SHORT && text.includes(v))) {
      if (!best || v.length > best.len) best = { id: r.category_id, len: v.length };
    }
  }
  return best?.id ?? null;
}

// Parole che dicono COME è stato pagato, non A CHI: non servono a riconoscere un negozio.
const NOT_A_MERCHANT = new Set([
  "pagamento", "pagam", "pag", "pos", "carta", "card", "debit", "debito", "credito", "credit",
  "addebito", "addebiti", "accredito", "sdd", "sepa", "rid", "core", "bonifico", "bonif",
  "disposizione", "operazione", "op", "acquisto", "acquisti", "presso", "contactless", "nfc",
  "mastercard", "visa", "maestro", "vpay", "bancomat", "circuito", "online", "internet",
  "del", "della", "dello", "dei", "di", "da", "a", "al", "alla", "in", "il", "la", "lo", "le",
  "e", "per", "favore", "ordinante", "beneficiario", "eur", "euro", "data", "ora", "ore",
  "www", "n", "nr", "num", "rif", "tran", "trx", "cod", "id",
]);

/**
 * Parola chiave da proporre per ricordare una categoria:
 * "PAGAMENTO POS ESSELUNGA MILANO 12/09 CARTA 1234" → "esselunga".
 * Se la prima parola utile è corta (≤ 3 lettere, es. "bar") si aggiunge la successiva.
 */
export function ruleKeyword(description: string): string | null {
  const text = normalizeText(description.replace(/\b(google|apple|samsung)\s+pay\b/gi, " "));
  const words = text.split(" ").filter(w => w.length > 1 && !/^\d+$/.test(w) && !NOT_A_MERCHANT.has(w));
  if (words.length === 0) return null;
  if (words[0].length >= 4 || words.length === 1) return words[0];
  return `${words[0]} ${words[1]}`;
}
