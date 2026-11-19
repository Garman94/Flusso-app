// Disiscrizione con un clic dal programma di posta (RFC 8058): Gmail e Apple Mail mandano qui
// una POST quando si tocca "Annulla iscrizione". Il clic sul link nell'email apre invece la
// pagina /disiscriviti, che chiede conferma (alcuni programmi aprono i link da soli per controllarli).
import { NextResponse, type NextRequest } from "next/server";
import { unsubscribe } from "@/lib/email-unsubscribe";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const q = request.nextUrl.searchParams;
  const ok = await unsubscribe(q.get("u") ?? "", q.get("k") ?? "", q.get("t") ?? "");
  return NextResponse.json({ ok }, { status: ok ? 200 : 400 });
}
