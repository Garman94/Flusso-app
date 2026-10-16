// Proposte per il dizionario condiviso (Admin → "Dizionario condiviso"): le parole che almeno
// due utenti diversi hanno già insegnato a Flusso con le loro regole ("Ricorda" o pannello
// Regole) verso la stessa categoria predefinita di spesa. Si mostrano solo parola, categoria e
// quante persone: mai chi. Due persone come minimo, così un nome di persona o un negozio sotto
// casa di uno solo non diventa una proposta.

import { guessFromDescription, normalizeText, type DictionaryEntry } from "./categorize";
import { categoryKind } from "./money";

export const MIN_USERS = 2;

export type RuleRow = {
  user_id: string;
  value: string;
  categories: { name: string; user_id: string | null } | null;
};

export type Proposal = { keyword: string; category_name: string; users: number };

export function dictionaryProposals(rules: RuleRow[], dictionary: DictionaryEntry[]): Proposal[] {
  const known = new Set(dictionary.map(d => normalizeText(d.keyword)));
  const groups = new Map<string, { keyword: string; category_name: string; users: Set<string> }>();
  for (const r of rules) {
    const cat = r.categories;
    if (!cat || cat.user_id !== null || categoryKind(cat.name) !== "expense") continue; // solo categorie predefinite di spesa
    const keyword = normalizeText(r.value);
    if (keyword.length < 2 || known.has(keyword)) continue;
    const key = `${keyword}|${cat.name}`;
    const g = groups.get(key) ?? { keyword, category_name: cat.name, users: new Set<string>() };
    g.users.add(r.user_id);
    groups.set(key, g);
  }
  return [...groups.values()]
    .filter(g => g.users.size >= MIN_USERS)
    // già riconosciuta con la stessa categoria dalle parole del codice: niente da imparare
    .filter(g => guessFromDescription(g.keyword) !== g.category_name)
    .map(g => ({ keyword: g.keyword, category_name: g.category_name, users: g.users.size }))
    .sort((a, b) => b.users - a.users || a.keyword.localeCompare(b.keyword));
}
