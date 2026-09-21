import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { todayISO } from "@/lib/dates";

// Esporta tutti i movimenti dell'utente in CSV (portabilità dei dati, art. 20 GDPR).
// Separatore ";" e virgola decimale, come si aspetta Excel in italiano. Le colonne
// (Data, Descrizione, Importo, …) sono quelle che l'import di Flusso riconosce da solo,
// quindi il file si può reimportare così com'è.

const PAGE = 1000; // limite di default di Supabase per richiesta

function csvCell(v: string): string {
  return /[;"\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

const euro = (n: number) => n.toFixed(2).replace(".", ",");

export async function GET() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }
  const userId = claims.claims.sub as string;

  type Row = {
    date: string;
    description: string | null;
    amount: number;
    notes: string | null;
    source: string | null;
    categories: { name: string } | null;
    family_members: { name: string } | null;
  };

  const rows: Row[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("transactions")
      .select("date, description, amount, notes, source, categories(name), family_members(name)")
      .eq("user_id", userId)
      .order("date", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) {
      return NextResponse.json({ error: "Esportazione non riuscita" }, { status: 500 });
    }
    rows.push(...((data ?? []) as unknown as Row[]));
    if (!data || data.length < PAGE) break;
  }

  const header = ["Data", "Descrizione", "Importo", "Categoria", "Persona", "Origine", "Note"];
  const lines = [header.join(";")];
  for (const r of rows) {
    lines.push(
      [
        r.date,
        r.description ?? "",
        euro(Number(r.amount)),
        r.categories?.name ?? "",
        r.family_members?.name ?? "",
        r.source ?? "",
        r.notes ?? "",
      ].map(csvCell).join(";"),
    );
  }

  // BOM UTF-8: senza, Excel legge male le lettere accentate
  const body = "\uFEFF" + lines.join("\r\n") + "\r\n";
  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="flusso-movimenti-${todayISO()}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
