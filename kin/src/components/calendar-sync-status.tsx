"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { syncGoogleCalendarAction } from "@/lib/actions/calendar-sync";
import { Icon } from "@/components/icons";

function ago(from: Date): string {
  const mins = Math.round((Date.now() - from.getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

/** The calendar reconciles with Google quietly whenever this tab is opened
 * and the last run is old. Saying when that last happened is the difference
 * between trusting what is on screen and wondering about it. */
export function CalendarSyncStatus({ lastSyncedISO }: { lastSyncedISO: string | null }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const sync = () => {
    setError(null);
    startTransition(async () => {
      const result = await syncGoogleCalendarAction();
      if (result.error) setError(result.error);
      else router.refresh();
    });
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, fontSize: 12.5, color: "var(--color-neutral-600)" }}>
      <span style={{ flex: 1, minWidth: 0 }}>
        {error
          ? error
          : pending
            ? "Syncing with Google Calendar…"
            : lastSyncedISO
              ? `Google Calendar synced ${ago(new Date(lastSyncedISO))}`
              : "Google Calendar connected, not synced yet"}
      </span>
      <button
        type="button"
        onClick={sync}
        disabled={pending}
        className="btn btn-ghost"
        style={{ minHeight: 28, fontSize: 12.5, padding: "0 8px", gap: 4 }}
      >
        <Icon name="upload" size={13} style={{ transform: "rotate(90deg)" }} />
        Sync now
      </button>
    </div>
  );
}

/** Remembers the category filter between visits. The toggles live in the URL
 * so they can be linked and shared; this mirrors the current choice into a
 * cookie, which the server falls back to when the Planner is opened fresh
 * from the tab bar with no params at all. */
export function RememberFilter({ hide }: { hide: string }) {
  useEffect(() => {
    // One year, lax: it is a display preference, never sent cross-site.
    document.cookie = `kin_cal_hide=${encodeURIComponent(hide)}; path=/; max-age=31536000; samesite=lax`;
  }, [hide]);
  return null;
}
