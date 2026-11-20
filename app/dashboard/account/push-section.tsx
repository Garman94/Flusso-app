"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useDemoGuard } from "@/components/demo-context";
import { track } from "@/lib/track";
import { base64UrlToBytes, deviceLabel, pushSupport, sameKey, type PushSupport } from "@/lib/push";
import { removePushDevice, savePushDevice, sendTestPush } from "@/app/actions/push";

/** Cosa può fare questo dispositivo: lo si sa solo nel browser, dopo il caricamento. */
function detect(): { support: PushSupport; device: ReturnType<typeof deviceLabel> } {
  const nav = navigator as Navigator & { standalone?: boolean };
  const touchPoints = nav.maxTouchPoints ?? 0;
  return {
    device: deviceLabel(nav.userAgent, touchPoints),
    support: pushSupport({
      ua: nav.userAgent,
      touchPoints,
      standalone: window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true,
      hasPush: "serviceWorker" in nav && "PushManager" in window && "Notification" in window,
      nativeApp: "Capacitor" in window,
    }),
  };
}

async function currentSubscription(): Promise<PushSubscription | null> {
  const reg = await navigator.serviceWorker.getRegistration();
  return (await reg?.pushManager.getSubscription()) ?? null;
}

const HELP: Record<Exclude<PushSupport, "ok">, string> = {
  "android-app": "Nell'app Android non ci sono ancora. Per ora puoi accenderle aprendo flussoapp.it da Chrome.",
  "ios-browser": "Su iPhone e iPad arrivano solo se Flusso è sulla schermata Home: in Safari tocca Condividi (il quadrato con la freccia) → «Aggiungi alla schermata Home», poi apri Flusso da lì e torna qui.",
  "ios-old": "Su questo iPhone serve iOS 16.4 o più recente: aggiornalo da Impostazioni → Generali → Aggiornamento software.",
  unsupported: "Questo browser non ha le notifiche. Prova con Chrome, Edge, Firefox o Safari aggiornati.",
};

const BTN = "min-h-11 rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50 transition-colors";

/**
 * Account → Avvisi → Notifiche su questo dispositivo (migration 053). `configured` è false se
 * mancano le chiavi VAPID o la tabella: allora dice che arrivano presto.
 */
export function PushSection({ configured, publicKey }: { configured: boolean; publicKey: string | null }) {
  const [env, setEnv] = useState<ReturnType<typeof detect> | null>(null);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [endpoint, setEndpoint] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const demoGuard = useDemoGuard();

  useEffect(() => {
    const found = detect();
    setEnv(found);
    if (found.support !== "ok") return;
    setPermission(Notification.permission);
    currentSubscription().then(sub => {
      if (!sub || Notification.permission !== "granted") return;
      // iscritto con chiavi VAPID vecchie: le notifiche non arriverebbero, va riacceso
      if (publicKey && !sameKey(sub.options.applicationServerKey, base64UrlToBytes(publicKey))) return;
      setEndpoint(sub.endpoint);
      // a ogni visita si riprende l'indirizzo: il browser può averlo cambiato, o l'ha acceso un altro account
      if (configured) void savePushDevice(sub.toJSON(), found.device);
    }).catch(() => {});
  }, [configured, publicKey]);

  async function enable() {
    if (demoGuard() || !publicKey || !env) return;
    setBusy(true);
    try {
      // il permesso va chiesto subito dentro il tocco, o Safari non mostra la richiesta
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== "granted") {
        void track("push_permission", { result: perm });
        if (perm === "denied") toast.error("Hai detto di no alle notifiche: qui sotto come riaccenderle.");
        return;
      }
      await navigator.serviceWorker.register("/sw.js");
      const reg = await navigator.serviceWorker.ready;
      const key = base64UrlToBytes(publicKey);
      let sub = await reg.pushManager.getSubscription();
      if (sub && !sameKey(sub.options.applicationServerKey, key)) {
        await sub.unsubscribe();
        sub = null;
      }
      sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
      const res = await savePushDevice(sub.toJSON(), env.device);
      if ("error" in res) {
        await sub.unsubscribe().catch(() => {});
        toast.error(res.error);
        return;
      }
      setEndpoint(sub.endpoint);
      void track("push_enabled", { device: env.device });
      toast.success("Notifiche accese su questo dispositivo.");
    } catch {
      void track("push_failed", { device: env.device });
      toast.error("Non sono riuscito ad accenderle su questo browser.");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const sub = await currentSubscription();
      const ep = sub?.endpoint ?? endpoint;
      if (sub) await sub.unsubscribe();
      if (ep) await removePushDevice(ep);
      setEndpoint(null);
      void track("push_disabled", {});
      toast.success("Notifiche spente su questo dispositivo.");
    } catch {
      toast.error("Errore: riprova.");
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    if (!endpoint) return;
    setBusy(true);
    try {
      const res = await sendTestPush(endpoint);
      void track("push_test", { ok: !("error" in res) });
      if ("error" in res) toast.error(res.error);
      else toast.success("Mandata: arriva tra pochi secondi.");
    } finally {
      setBusy(false);
    }
  }

  let body: React.ReactNode = null;
  if (!env) {
    body = null;
  } else if (!configured) {
    body = <p className="text-xs text-muted-foreground">Arrivano presto.</p>;
  } else if (env.support !== "ok") {
    body = <p className="text-xs text-muted-foreground">{HELP[env.support]}</p>;
  } else if (permission === "denied") {
    body = (
      <p className="text-xs text-muted-foreground">
        Hai bloccato le notifiche di Flusso. Per riaccenderle: nel browser tocca il lucchetto accanto all&apos;indirizzo →
        Notifiche → Consenti; nell&apos;app installata vai nelle impostazioni del telefono → Notifiche → Flusso. Poi torna qui.
      </p>
    );
  } else if (endpoint && permission === "granted") {
    body = (
      <div className="flex flex-col gap-2">
        <p className="text-sm">✅ Accese su questo dispositivo.</p>
        <div className="flex flex-wrap gap-2">
          <button onClick={test} disabled={busy} className={`${BTN} border hover:bg-muted/50`}>Mandami una prova</button>
          <button onClick={disable} disabled={busy} className={`${BTN} text-muted-foreground hover:bg-muted/50`}>Spegni</button>
        </div>
      </div>
    );
  } else {
    body = (
      <div className="flex flex-col gap-1.5 items-start">
        <button onClick={enable} disabled={busy} className={`${BTN} bg-primary text-primary-foreground hover:bg-primary/90`}>
          {busy ? "Un attimo…" : "Accendi le notifiche"}
        </button>
        <p className="text-xs text-muted-foreground">Il browser ti chiede il permesso. Si accendono su ogni telefono o computer a parte, e si spengono quando esci dall&apos;account.</p>
      </div>
    );
  }

  return (
    <div className="border-t pt-4 flex flex-col gap-3">
      <div>
        <p className="text-sm font-medium">Notifiche su questo dispositivo</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          Il lunedì mattina un promemoria: «Nuova settimana: guarda quanto puoi spendere fino al prossimo stipendio».
          Senza importi, perché si vede anche a telefono bloccato.
        </p>
      </div>
      {body}
    </div>
  );
}
