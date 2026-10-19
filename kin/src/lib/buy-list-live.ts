"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/** The To-Buy list, live (20261019212500_buy_list_live_and_helper_push): any
 * change to the household's list sends an empty nudge on the private topic
 * "buy-list:<household>", heard by its members and by its helpers who can
 * see the list. The nudge says nothing; the page reads the list again under
 * its own rights, so what is on screen is what is in the database.
 *
 * Shared by the family's list (/household) and the helper's (/helper). A
 * burst -- thirty ticked lines cleared, a recipe's ingredients added -- is
 * one refresh, a moment after it settles. A private channel checks the
 * login, so the token goes first. */
export function useBuyListLive(familyId: string | null | undefined) {
  const router = useRouter();
  useEffect(() => {
    if (!familyId) return;
    const supabase = createClient();
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    void (async () => {
      await supabase.realtime.setAuth().catch(() => {});
      if (cancelled) return;
      channel = supabase
        .channel(`buy-list:${familyId}`, { config: { private: true } })
        .on("broadcast", { event: "changed" }, () => {
          if (timer) clearTimeout(timer);
          timer = setTimeout(() => router.refresh(), 400);
        })
        .subscribe();
    })();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [router, familyId]);
}
