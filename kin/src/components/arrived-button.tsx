"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { toast } from "@/components/toast";
import { arrivedAction } from "@/lib/actions/location";

/** "Nakarating na ako" (lib/arrived.ts): one tap tells the household where
 * you are now. The phone is asked for its position only at the tap -- never
 * in the background -- which is all a web app can do and all this needs.
 *
 * `auto` is the Action Button's "Nakarating na ako" (/go/arrived lands on
 * /today?arrived=1): pressing it is the tap, so the page sends once and then
 * drops the ?arrived=1, so a reload never sends it twice. */
export function ArrivedButton({ auto = false, big = false }: { auto?: boolean; big?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const started = useRef(false);

  const send = () => {
    if (busy) return;
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      toast.error("This phone can't say where it is.");
      return;
    }
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const result = await arrivedAction(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy ?? null);
        setBusy(false);
        if (result.error) toast.error(result.error);
        else toast.success(`Sent to the family: ${result.sent}`);
      },
      (err) => {
        setBusy(false);
        toast.error(
          err.code === err.PERMISSION_DENIED
            ? "Kin needs to know where you are for this. Allow location for Kin in your phone's settings, then try again."
            : "Your phone couldn't find where you are. Try again in a moment.",
        );
      },
      { enableHighAccuracy: true, maximumAge: 30_000, timeout: 20_000 },
    );
  };

  useEffect(() => {
    if (!auto || started.current) return;
    started.current = true;
    router.replace("/today", { scroll: false });
    send();
    // Once, on arriving from the Action Button.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto]);

  return (
    <button
      type="button"
      className={big ? "btn btn-primary" : "btn btn-secondary"}
      style={{ width: "100%", marginBottom: big ? "1rem" : "1.25rem", gap: "0.5rem" }}
      onClick={send}
      disabled={busy}
      aria-busy={busy}
    >
      <Icon name="mapPin" size={16} />
      {busy ? "Sending where you are…" : "Nakarating na ako"}
    </button>
  );
}
