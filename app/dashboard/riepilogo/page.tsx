import { redirect } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { addDaysISO, todayISO } from "@/lib/dates";
import { currentPeriod, previousPeriods } from "@/lib/period";
import { formatEuro } from "@/lib/calculations";
import { isFixedExpense, type PlanItem } from "@/lib/fixed-expenses";
import { buildRecap, periodContaining, periodName, RECAP_HISTORY, type CategoryLine, type Recap, type RecapTx } from "@/lib/recap";
import { RecapSeen, RecapTransactions } from "./recap-client";

// Riepilogo di un periodo chiuso (prima: una finestra "Mesi passati" per mese solare, senza
// confronti). ?da=YYYY-MM-DD sceglie il periodo che contiene quella data; senza, l'ultimo
// chiuso. Calcoli in lib/recap.ts.

const PAGE = 1000;

type Supabase = Awaited<ReturnType<typeof createClient>>;

async function fetchTxs(supabase: Supabase, userId: string, from: string, to: string): Promise<RecapTx[]> {
  const out: RecapTx[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabase
      .from("transactions")
      .select("id, date, amount, description, merchant, category_id, categories(name, icon, color)")
      .eq("user_id", userId).gte("date", from).lte("date", to)
      .order("date", { ascending: false }).order("id", { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error || !data) break;
    out.push(...(data as unknown as RecapTx[]));
    if (data.length < PAGE) break;
  }
  return out;
}

const fmtDay = (iso: string, weekday = false) =>
  new Date(iso + "T00:00:00").toLocaleDateString("it-IT", { ...(weekday ? { weekday: "long" as const } : {}), day: "numeric", month: "short" });
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "↑ 80 € rispetto al mese prima", verde se va nella direzione buona. */
function Delta({ diff, goodWhenUp }: { diff: number; goodWhenUp: boolean }) {
  if (Math.abs(diff) < 1) return <span className="text-xs text-muted-foreground">uguale al mese prima</span>;
  const up = diff > 0;
  const good = up === goodWhenUp;
  return (
    <span className={`text-xs font-medium ${good ? "text-green-600 dark:text-green-400" : "text-red-500"}`}>
      {up ? "↑" : "↓"} {formatEuro(Math.abs(diff))} rispetto al mese prima
    </span>
  );
}

/** Rispetto al solito: conta solo se la differenza è di almeno 10 € e del 15%. */
function usualNote(c: CategoryLine) {
  if (c.usual === null) return null;
  const diff = c.total - c.usual;
  if (c.usual < 1) return <span className="text-muted-foreground">di solito niente</span>;
  if (Math.abs(diff) < Math.max(10, c.usual * 0.15)) return <span className="text-muted-foreground">come al solito</span>;
  return diff > 0
    ? <span className="text-red-500">{formatEuro(diff)} più del solito</span>
    : <span className="text-green-600 dark:text-green-400">{formatEuro(-diff)} meno del solito</span>;
}

function budgetNote(c: CategoryLine) {
  if (!c.budget) return null;
  const over = c.budgetSpent - c.budget;
  return over > 0.005
    ? <span className="text-red-500">budget {formatEuro(c.budget)}, superato di {formatEuro(over)}</span>
    : <span className="text-green-600 dark:text-green-400">nel budget di {formatEuro(c.budget)} ✓</span>;
}

function Highlights({ r, monthName }: { r: Recap; monthName: string }) {
  const items: { icon: string; text: React.ReactNode }[] = [];
  if (r.fixed) {
    items.push({
      icon: "📋",
      text: <>Spese fisse: <strong>{formatEuro(r.fixed.paid || r.fixed.expected)}</strong>
        {r.fixed.paidCount === r.fixed.count ? ", tutte pagate ✓" : `, ${r.fixed.paidCount} su ${r.fixed.count} trovate nei movimenti`}</>,
    });
  }
  if (r.budget) {
    items.push({
      icon: "🎯",
      text: r.budget.over.length === 0
        ? <>Budget rispettato in tutte le categorie ({r.budget.count}) 🎉</>
        : <>Budget rispettato in {r.budget.within} categorie su {r.budget.count}. Sforato:{" "}
            {r.budget.over.slice(0, 3).map(o => `${o.name} (+${formatEuro(o.by)})`).join(", ")}</>,
    });
  }
  if (r.biggest) {
    items.push({
      icon: "💸",
      text: <>La spesa più grande: <strong>{r.biggest.description || r.biggest.merchant || "senza descrizione"}</strong>,{" "}
        {formatEuro(Math.abs(Number(r.biggest.amount)))} il {fmtDay(r.biggest.date)}</>,
    });
  }
  if (r.topDay) {
    items.push({ icon: "📅", text: <>Il giorno in cui hai speso di più: {fmtDay(r.topDay.date, true)}, {formatEuro(r.topDay.total)}</> });
  }
  items.push({ icon: "🧾", text: <>{r.txCount} {r.txCount === 1 ? "movimento" : "movimenti"} in {monthName}</> });

  return (
    <div className="rounded-2xl border p-5 flex flex-col gap-3">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Da ricordare</h2>
      {items.map((it, i) => (
        <p key={i} className="text-sm flex gap-3"><span className="shrink-0">{it.icon}</span><span>{it.text}</span></p>
      ))}
      {(r.biggest || r.topDay) && r.fixed && (
        <p className="text-[11px] text-muted-foreground">Spesa più grande e giorno più caro non contano spese fisse e rate.</p>
      )}
    </div>
  );
}

async function RecapContent({ searchParams }: { searchParams: Promise<{ da?: string }> }) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims) redirect("/auth/login");
  const userId = auth.claims.sub;
  const { da } = await searchParams;

  const { data: profile } = await supabase.from("profiles").select("pay_day").eq("id", userId).single();
  const payDay: number = profile?.pay_day ?? 0;

  // Solo periodi chiusi: il più recente è quello prima del periodo in corso.
  const cur = currentPeriod(payDay);
  const latest = periodContaining(payDay, addDaysISO(cur.from, -1));
  const asked = da && /^\d{4}-\d{2}-\d{2}$/.test(da) ? periodContaining(payDay, da) : latest;
  const sel = asked.from >= cur.from ? latest : asked;
  const isLatest = sel.from === latest.from;
  const previous = previousPeriods(payDay, sel.year, sel.month, RECAP_HISTORY + 1);

  const [txs, budgetsRes, recurringRes, firstRes] = await Promise.all([
    fetchTxs(supabase, userId, previous[previous.length - 1]?.from ?? sel.from, sel.to),
    supabase.from("category_budgets").select("category_id, monthly_budget").eq("user_id", userId),
    supabase.from("recurring_expenses").select("*").eq("user_id", userId),
    supabase.from("transactions").select("date").eq("user_id", userId).order("date", { ascending: true }).limit(1).maybeSingle(),
  ]);
  const planItems = ((recurringRes.data ?? []) as PlanItem[]).filter(it => isFixedExpense(it) || it.debt_type);
  const r = buildRecap(txs, sel, previous, budgetsRes.data ?? [], planItems, todayISO());

  const name = periodName(payDay, sel);
  const monthName = name.month;
  const firstDate = firstRes.data?.date as string | undefined;
  const older = previous[0] && firstDate && firstDate <= previous[0].to ? previous[0] : null;
  const newer = isLatest ? null : periodContaining(payDay, addDaysISO(sel.to, 1));
  const rows = txs
    .filter(t => t.date >= sel.from && t.date <= sel.to)
    .map(t => ({ id: t.id, date: t.date, amount: Number(t.amount), description: t.description || t.merchant || "Movimento", icon: t.categories?.icon ?? "📦" }));

  const top = r.categories.slice(0, 6);
  const rest = r.categories.slice(6);
  const restTotal = rest.reduce((s, c) => s + c.total, 0);

  return (
    <div className="flex flex-col gap-5 max-w-lg mx-auto w-full">
      <RecapSeen from={sel.from} latest={isLatest} />

      <Link href="/dashboard" className="text-sm text-muted-foreground hover:text-foreground transition-colors self-start">← Dashboard</Link>

      {/* Titolo e periodo */}
      <div className="flex items-center justify-between gap-3">
        {older ? (
          <Link href={`/dashboard/riepilogo?da=${older.from}`} aria-label="Periodo prima"
            className="size-10 rounded-full border flex items-center justify-center text-lg hover:bg-muted/50 transition-colors">‹</Link>
        ) : <span className="size-10" />}
        <div className="text-center">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Riepilogo</p>
          <h1 className="text-2xl font-bold">{capital(monthName)} {name.year}</h1>
          {name.range && <p className="text-xs text-muted-foreground">{name.range}</p>}
        </div>
        {newer ? (
          <Link href={`/dashboard/riepilogo?da=${newer.from}`} aria-label="Periodo dopo"
            className="size-10 rounded-full border flex items-center justify-center text-lg hover:bg-muted/50 transition-colors">›</Link>
        ) : <span className="size-10" />}
      </div>

      {r.txCount === 0 ? (
        <div className="rounded-2xl border p-8 flex flex-col items-center gap-3 text-center">
          <span className="text-4xl">📭</span>
          <p className="text-sm text-muted-foreground">Nessun movimento in {monthName}. Se vuoi il riepilogo, carica l&apos;estratto conto di quel mese.</p>
          <Link href="/dashboard/transazioni" className="text-sm text-primary hover:underline">Vai a Transazioni →</Link>
        </div>
      ) : (
        <>
          {/* Com'è andata */}
          <div className={`rounded-2xl border-2 p-5 flex flex-col gap-4 ${r.saved >= 0 ? "border-green-500/40 bg-green-500/5" : "border-red-500/40 bg-red-500/5"}`}>
            <div className="flex flex-col gap-1">
              <span className="text-sm text-muted-foreground">
                {r.saved >= 0 ? "Hai risparmiato" : "Hai speso più di quanto è entrato"}
              </span>
              <span className={`text-4xl font-bold tabular-nums ${r.saved >= 0 ? "text-green-600 dark:text-green-400" : "text-red-500"}`}>
                {r.saved >= 0 ? "" : "−"}{formatEuro(Math.abs(r.saved))}
              </span>
              {r.savedRate !== null && r.saved > 0 && (
                <span className="text-sm text-muted-foreground">il {Math.round(r.savedRate * 100)}% di quello che è entrato</span>
              )}
              {r.prev && <Delta diff={r.saved - r.prev.saved} goodWhenUp />}
            </div>
            <div className="grid grid-cols-2 gap-3 pt-3 border-t">
              <div className="flex flex-col gap-0.5">
                <span className="text-xs text-muted-foreground">Entrate</span>
                <span className="text-lg font-semibold tabular-nums">{formatEuro(r.income)}</span>
                {r.prev && <Delta diff={r.income - r.prev.income} goodWhenUp />}
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-xs text-muted-foreground">Uscite</span>
                <span className="text-lg font-semibold tabular-nums">{formatEuro(r.expenses)}</span>
                {r.prev && <Delta diff={r.expenses - r.prev.expenses} goodWhenUp={false} />}
              </div>
            </div>
          </div>

          {(r.maybeIncomplete || r.startsLate) && r.firstTxDate && r.lastTxDate && (
            <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
              {r.startsLate && r.maybeIncomplete
                ? <>I movimenti caricati vanno dal <strong>{fmtDay(r.firstTxDate)}</strong> al <strong>{fmtDay(r.lastTxDate)}</strong>: il riepilogo è parziale.</>
                : r.startsLate
                  ? <>I movimenti caricati cominciano dal <strong>{fmtDay(r.firstTxDate)}</strong>: mancano i primi giorni, il riepilogo è parziale.</>
                  : <>L&apos;ultimo movimento caricato è del <strong>{fmtDay(r.lastTxDate)}</strong>: se mancano gli ultimi giorni,{" "}
                      <Link href="/dashboard/transazioni" className="underline">carica l&apos;estratto conto</Link> per completare il riepilogo.</>}
            </div>
          )}

          {/* Dove sono andati i soldi */}
          {top.length > 0 && (
            <div className="rounded-2xl border p-5 flex flex-col gap-4">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Dove sono andati i soldi</h2>
              {top.map(c => (
                <div key={c.id} className="flex flex-col gap-1.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-sm font-medium flex items-center gap-2 min-w-0">
                      <span>{c.icon}</span><span className="truncate">{c.name}</span>
                    </span>
                    <span className="text-sm font-semibold tabular-nums shrink-0">{formatEuro(c.total)}</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${Math.max(2, c.pct)}%`, backgroundColor: c.color }} />
                  </div>
                  <div className="text-xs flex flex-wrap gap-x-3 gap-y-0.5">
                    <span className="text-muted-foreground">{Math.round(c.pct)}% delle uscite</span>
                    {usualNote(c)}
                    {budgetNote(c)}
                  </div>
                </div>
              ))}
              {rest.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  {rest.length === 1 ? `Un'altra categoria (${rest[0].name})` : `Altre ${rest.length} categorie`}: {formatEuro(restTotal)}
                </p>
              )}
              {r.categories.some(c => c.budget) && (
                <p className="text-[11px] text-muted-foreground">Il confronto è col budget di oggi, senza spese fisse e rate.</p>
              )}
            </div>
          )}

          <Highlights r={r} monthName={monthName} />

          <RecapTransactions rows={rows} />

          {isLatest && (
            <Link href="/dashboard/smart" className="rounded-2xl border-2 border-primary/40 bg-primary/5 p-5 flex items-center gap-4 hover:bg-primary/10 transition-colors">
              <span className="text-2xl">🗓️</span>
              <span className="flex flex-col flex-1">
                <span className="font-medium">Il mese nuovo è iniziato</span>
                <span className="text-xs text-muted-foreground">Dai un&apos;occhiata a spese fisse e budget, così la previsione di fine mese è giusta.</span>
              </span>
              <span className="text-muted-foreground">›</span>
            </Link>
          )}
        </>
      )}
    </div>
  );
}

export default function RecapPage({ searchParams }: { searchParams: Promise<{ da?: string }> }) {
  return (
    <Suspense fallback={
      <div className="flex flex-col gap-5 max-w-lg mx-auto w-full animate-pulse">
        <div className="h-16 rounded bg-muted/40" />
        <div className="h-44 rounded-2xl bg-muted/40" />
        <div className="h-64 rounded-2xl bg-muted/40" />
      </div>
    }>
      <RecapContent searchParams={searchParams} />
    </Suspense>
  );
}
