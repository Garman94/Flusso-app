"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export function UpdateNameForm({
  currentName,
  userId,
}: {
  currentName: string;
  userId: string;
}) {
  const [name, setName] = useState(currentName);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    const supabase = createClient();
    const { error } = await supabase
      .from("profiles")
      .update({ full_name: name })
      .eq("id", userId);

    if (error) {
      toast.error("Aggiornamento fallito. Riprova.");
    } else {
      toast.success("Nome aggiornato!");
    }

    setLoading(false);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <label className="text-sm font-medium">Nome completo</label>
      <div className="flex gap-3">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Il tuo nome"
          className="max-w-sm"
        />
        <Button type="submit" size="sm" disabled={loading || name === currentName}>
          {loading ? "Salvataggio..." : "Salva"}
        </Button>
      </div>
    </form>
  );
}
