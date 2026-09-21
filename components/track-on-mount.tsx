"use client";

import { useEffect } from "react";
import { track, type EventProps } from "@/lib/track";

/** Registra un evento quando il componente compare (per pagine server). */
export function TrackOnMount({ name, props }: { name: string; props?: EventProps }) {
  useEffect(() => {
    void track(name, props ?? {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name]);
  return null;
}
