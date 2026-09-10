"use client";

import { useState } from "react";
import { toast } from "sonner";
import { IncomeWizard } from "@/components/income-wizard";
import { useDemoGuard } from "@/components/demo-context";
import { formatEuro, hasIncomeInfo, type IncomeInfo } from "@/lib/calculations";
import { updateOwnerIncome } from "./income-action";

const TYPE_LABEL: Record<string, string> = {
  employee: "Dipendente", freelance: "Autonomo", seasonal: "Stagionale", none: "Nessun reddito",
};

export function IncomeSection({ ownerName, initial }: { ownerName: string; initial: IncomeInfo }) {
  const [info, setInfo] = useState<IncomeInfo>(initial);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const demoGuard = useDemoGuard();

  async function save(v: IncomeInfo) {
    if (demoGuard()) { setEditing(false); return; }
    setSaving(true);
    const res = await updateOwnerIncome(v);
    if (res?.error) toast.error(res.error);
    else {
      setInfo(v);
      setEditing(false);
      toast.success("Info reddito salvate!");
    }
    setSaving(false);
  }

  return (
    <div className="rounded-xl border p-6 flex flex-col gap-4">
      <div>
        <h2 className="font-semibold">Il tuo reddito</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Serve per rendere più precise le previsioni di budget e i suggerimenti di risparmio.
        </p>
      </div>

      {editing ? (
        <IncomeWizard
          name={ownerName || "te"}
          initial={info}
          onSave={save}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="text-sm text-muted-foreground">
            {hasIncomeInfo(info) ? (
              <>
                <strong className="text-foreground">{formatEuro(Number(info.monthly_income))}/mese</strong>
                {" · "}{TYPE_LABEL[info.income_type ?? ""] ?? "—"}
                {info.income_type === "employee" && info.income_payday ? ` · giorno ${info.income_payday}` : ""}
              </>
            ) : info.income_type === "none" ? (
              "Nessun reddito impostato"
            ) : (
              "Non hai ancora inserito le info sul reddito"
            )}
          </div>
          <button
            onClick={() => setEditing(true)}
            disabled={saving}
            className="text-sm border rounded-md px-3 py-1.5 hover:bg-muted/50 disabled:opacity-50"
          >
            {hasIncomeInfo(info) || info.income_type === "none" ? "Modifica" : "Aggiungi"}
          </button>
        </div>
      )}
    </div>
  );
}
