"use client";

import { useState } from "react";
import Link from "next/link";
import { track } from "@/lib/track";

// "Come scaricare il file dalla tua banca", dentro l'import: i nuovi iscritti si fermavano proprio qui
// (numeri del 17/10). Solo passi presi da guide ufficiali o affidabili (ottobre 2026): per le altre
// banche i consigli generali e la chat con Marco. L'evento bank_guide_opened dice quali banche usano.

const BANKS = [
  {
    key: "intesa", name: "Intesa Sanpaolo",
    steps: ["Apri la lista dei movimenti del conto (dal sito o dall'app).", "Tocca «Scarica PDF / Excel» e scegli Excel."],
  },
  {
    key: "poste", name: "Poste",
    steps: [
      "BancoPosta e Postepay: dal sito poste.it, perché dall'app non si può.",
      "Apri «Movimenti», scorri fino a «Scarica elenco su file», scegli Excel e scarica.",
      "Dal telefono, con Premium, puoi usare l'import da screenshot.",
    ],
  },
  {
    key: "revolut", name: "Revolut",
    steps: ["Nell'app, dalla Home apri il conto in euro.", "Tocca «…» → «Estratto conto», scegli Excel e il periodo, poi «Genera»."],
  },
  {
    key: "n26", name: "N26",
    steps: ["Dalla versione web di N26 apri il conto e scegli «Scarica».", "Metti le date, scegli CSV e scarica."],
  },
] as const;

const OTHER = {
  key: "altra", name: "Altra banca",
  steps: [
    "Meglio dal computer: spesso il tasto per scaricare c'è solo sul sito.",
    "Apri «Movimenti» o «Lista movimenti» e cerca «Esporta», «Scarica» o l'icona di Excel.",
    "Scegli Excel o CSV. Per iniziare bastano gli ultimi 2-3 mesi.",
    "Se la banca ti dà solo il PDF dell'estratto conto, caricalo da «Foto o PDF» (Premium): Flusso legge anche i saldi.",
  ],
} as const;

export function BankExportGuide() {
  const [selected, setSelected] = useState<string>(OTHER.key);
  const bank = [...BANKS, OTHER].find(b => b.key === selected) ?? OTHER;

  function choose(key: string) {
    setSelected(key);
    void track("bank_guide_opened", { bank: key });
  }

  return (
    <div className="rounded-lg bg-muted/40 p-4 text-xs text-muted-foreground flex flex-col gap-3">
      <p className="font-medium text-foreground">Come scaricare il file dalla tua banca</p>
      <div className="flex flex-wrap gap-1.5">
        {[...BANKS, OTHER].map(b => (
          <button
            key={b.key}
            type="button"
            onClick={() => choose(b.key)}
            className={`rounded-full border px-2.5 py-1 transition-colors ${selected === b.key ? "border-primary bg-primary/10 text-foreground" : "hover:bg-muted"}`}
          >
            {b.name}
          </button>
        ))}
      </div>
      <ol className="list-decimal pl-4 flex flex-col gap-1">
        {bank.steps.map(step => <li key={step}>{step}</li>)}
      </ol>
      <p>
        Va bene qualsiasi file con una colonna data e un importo, anche con <em>Entrate</em> e <em>Uscite</em> separate.
        Non trovi il tasto?{" "}
        <Link href="/dashboard/account" className="text-primary underline">Scrivi a Marco</Link>{" "}
        e ti dice dove cercarlo.
      </p>
    </div>
  );
}
