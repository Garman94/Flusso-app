import { redirect } from "next/navigation";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { isPremium, isFounder } from "@/lib/plans";
import Link from "next/link";

// ─── helpers ───────────────────────────────────────────────
function formatEuro(n: number) {
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(n);
}

function currentMonthRange() {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split("T")[0];
  return { from, to };
}

function prevMonthRange() {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().split("T")[0];
  const to = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().split("T")[0];
  return { from, to };
}

// ─── main content ──────────────────────────────────────────
async function DashboardContent() {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getClaims();
  if (!authData?.claims) redirect("/auth/login");

  const userId = authData.claims.sub;

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, plan")
    .eq("id", userId)
    .single();

  const plan = profile?.plan ?? "free";
  const hasPremium = isPremium(plan) || isFounder(plan);

  const { from: mFrom, to: mTo } = currentMonthRange();
  const { from: pFrom, to: pTo } = prevMonthRange();

  // Fetch current month transactions
  const { data: currentTxs } = await supabase
    .from("transactions")
    .select("amount, category_id, date, description, categories(name, color, icon)")
    .eq("user_id", userId)
    .gte("date", mFrom)
    .lte("date", mTo)
    .order("date", { ascending: false });

  // Fetch previous month totals for trend
  const { data: prevTxs } = await supabase
    .from("transactions")
    .select("amount")
    .eq("user_id", userId)
    .gte("date", pFrom)
    .lte("date", pTo);

  // Fetch goals
  const { data: goals } = await supabase
    .from("goals")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(3);

  const txs = currentTxs ?? [];
  const prevTotal = (prevTxs ?? []).reduce((s, t) => s + Number(t.amount), 0);

  const entrate = txs.filter(t => Number(t.amount) > 0).reduce((s, t) => s + Number(t.amount), 0);
  const uscite = txs.filter(t => Number(t.amount) < 0).reduce((s, t) => s + Number(t.amount), 0);
  const saldo = entrate + uscite;
  const usciteAbs = Math.abs(uscite);
  const prevAbs = Math.abs(prevTotal < 0 ? prevTotal : -prevTotal);
  const trend = prevAbs > 0 ? ((usciteAbs - prevAbs) / prevAbs) * 100 : 0;

  // Spese per categoria (top 5)
  const catMap: Record<string, { name: string; color: string; icon: string; total: number }> = {};
  for (const t of txs) {
    if (Number(t.amount) >= 0) continue;
    const cat = (t as any).categories;
    const key = cat?.name ?? "Senza categoria";
    if (!catMap[key]) catMap[key] = { name: key, color: cat?.color ?? "#94a3b8", icon: cat?.icon ?? "📦", total: 0 };
    catMap[key].total += Math.abs(Number(t.amount));
  }
  const topCats = Object.values(catMap).sort((a, b) => b.total - a.total).slice(0, 5);
  const maxCat = topCats[0]?.total ?? 1;

  const recentTxs = txs.slice(0, 5);
  const hasTransactions = txs.length > 0;
  const monthName = new Date().toLocaleString("it-IT", { month: "long", year: "numeric" });

  return (
    <div className="flex flex-col gap-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">
            Ciao{profile?.full_name ? `, ${profile.full_name.split(" ")[0]}` : ""}!
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5 capitalize">{monthName}</p>
        </div>
        <Link
          href="/dashboard/transazioni"
          className="text-sm bg-primary text-primary-foreground rounded-md px-4 py-2 hover:bg-primary/90 transition-colors"
        >
          + Aggiungi
        </Link>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl border p-5 flex flex-col gap-1">
          <span className="text-xs text-muted-foreground uppercase tracking-wide">Saldo mese</span>
          <span className={`text-2xl font-bold ${saldo >= 0 ? "text-green-600 dark:text-green-400" : "text-red-500"}`}>
            {formatEuro(saldo)}
          </span>
        </div>
        <div className="rounded-xl border p-5 flex flex-col gap-1">
          <span className="text-xs text-muted-foreground uppercase tracking-wide">Entrate</span>
          <span className="text-2xl font-bold text-green-600 dark:text-green-400">{formatEuro(entrate)}</span>
        </div>
        <div className="rounded-xl border p-5 flex flex-col gap-1">
          <span className="text-xs text-muted-foreground uppercase tracking-wide">Uscite</span>
          <div className="flex items-end gap-2">
            <span className="text-2xl font-bold text-red-500">{formatEuro(usciteAbs)}</span>
            {prevAbs > 0 && (
              <span className={`text-xs mb-1 ${trend > 0 ? "text-red-500" : "text-green-600"}`}>
                {trend > 0 ? "▲" : "▼"} {Math.abs(trend).toFixed(0)}% vs mese scorso
              </span>
            )}
          </div>
        </div>
      </div>

      {!hasTransactions ? (
        /* Empty state */
        <div className="rounded-xl border border-dashed p-12 flex flex-col items-center gap-4 text-center">
          <span className="text-5xl">💸</span>
          <h2 className="font-semibold text-lg">Nessuna transazione ancora</h2>
          <p className="text-muted-foreground text-sm max-w-xs">
            Aggiungi la tua prima transazione manualmente o carica un file Excel della tua banca.
          </p>
          <Link
            href="/dashboard/transazioni"
            className="text-sm bg-primary text-primary-foreground rounded-md px-5 py-2.5 hover:bg-primary/90 transition-colors"
          >
            Aggiungi transazione
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Transazioni recenti */}
          <div className="rounded-xl border p-5 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Transazioni recenti</h2>
              <Link href="/dashboard/transazioni" className="text-xs text-primary hover:underline">
                Vedi tutte
              </Link>
            </div>
            <div className="flex flex-col gap-2">
              {recentTxs.map((t: any) => (
                <div key={t.id ?? t.date + t.description} className="flex items-center justify-between py-2 border-b last:border-b-0">
                  <div className="flex items-center gap-3">
                    <span className="text-lg">{t.categories?.icon ?? "📦"}</span>
                    <div>
                      <p className="text-sm font-medium truncate max-w-[160px]">{t.description || "Transazione"}</p>
                      <p className="text-xs text-muted-foreground">{new Date(t.date).toLocaleDateString("it-IT")}</p>
                    </div>
                  </div>
                  <span className={`text-sm font-semibold ${Number(t.amount) >= 0 ? "text-green-600 dark:text-green-400" : "text-red-500"}`}>
                    {Number(t.amount) >= 0 ? "+" : ""}{formatEuro(Number(t.amount))}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Spese per categoria */}
          <div className="rounded-xl border p-5 flex flex-col gap-4">
            <h2 className="font-semibold">Spese per categoria</h2>
            {topCats.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nessuna uscita questo mese.</p>
            ) : (
              <div className="flex flex-col gap-3">
                {topCats.map((cat) => (
                  <div key={cat.name} className="flex flex-col gap-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2">
                        <span>{cat.icon}</span>
                        <span>{cat.name}</span>
                      </span>
                      <span className="font-medium">{formatEuro(cat.total)}</span>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${(cat.total / maxCat) * 100}%`,
                          backgroundColor: cat.color,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Obiettivi */}
      {(goals ?? []).length > 0 && (
        <div className="rounded-xl border p-5 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Obiettivi finanziari</h2>
            <Link href="/dashboard/obiettivi" className="text-xs text-primary hover:underline">
              Gestisci
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {(goals ?? []).map((g: any) => {
              const pct = Math.min(100, (Number(g.current_amount) / Number(g.target_amount)) * 100);
              return (
                <div key={g.id} className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <span>{g.icon}</span>
                    <span className="text-sm font-medium truncate">{g.name}</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{formatEuro(Number(g.current_amount))}</span>
                    <span>{formatEuro(Number(g.target_amount))}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Upgrade banner per utenti free */}
      {!hasPremium && hasTransactions && (
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <p className="font-semibold text-sm">🔮 Sblocca le previsioni spese</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Passa a Premium per vedere quanto spenderai il prossimo mese e ricevere consigli di risparmio.
            </p>
          </div>
          <Link
            href="/pricing"
            className="text-sm bg-primary text-primary-foreground rounded-md px-4 py-2 hover:bg-primary/90 transition-colors whitespace-nowrap"
          >
            Passa a Premium — €7/mese
          </Link>
        </div>
      )}
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-8 animate-pulse">
      <div className="h-8 w-48 rounded bg-muted" />
      <div className="grid grid-cols-3 gap-4">
        {[1, 2, 3].map(i => <div key={i} className="rounded-xl border p-5 h-20 bg-muted/30" />)}
      </div>
      <div className="grid grid-cols-2 gap-6">
        <div className="rounded-xl border p-5 h-64 bg-muted/30" />
        <div className="rounded-xl border p-5 h-64 bg-muted/30" />
      </div>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <DashboardContent />
    </Suspense>
  );
}
