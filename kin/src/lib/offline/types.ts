/** What Kin keeps on the phone for offline use, and the changes it may queue.
 *
 * Shared by the server (which builds the snapshot and replays the queue) and
 * the browser (which stores both in IndexedDB). Plain JSON only: dates are ISO
 * strings, because the snapshot goes through JSON and then IndexedDB.
 *
 * WHAT IS IN IT, AND WHAT NEVER IS
 *
 * Today, the shopping list, this week's Planner, the last fifty messages of
 * the recent conversations, and the emergency cards. Nothing else. The vault,
 * Documents, Wealth and money figures, sessions and tokens are never part of
 * it -- the snapshot is built from an explicit list below, not by copying
 * whatever a page happened to render, so a new field has to be added here on
 * purpose before it can reach a phone's disk.
 */

export const SNAPSHOT_VERSION = 1;

export type OfflineTodayItem = {
  /** A BriefItem id ("activity-<uuid>", "health-<uuid>", "buy", ...) or
   * "chore-<routine uuid>". */
  key: string;
  title: string;
  meta: string;
  urgent: boolean;
  /** Whether offline Done can be queued for it. Bills pay through Wealth and
   * the shopping row is the list itself, so neither is markable here. */
  markable: boolean;
  mark: "done" | "skipped" | null;
  /** A chore's occurrence date, which its log is keyed on. */
  date?: string;
};

export type OfflineBuyItem = { id: string; name: string; quantity: number | null; unit: string | null; checked: boolean };
export type OfflineBuyGroup = { name: string; items: OfflineBuyItem[] };

export type OfflinePlannerDay = {
  date: string;
  isToday: boolean;
  items: { id: string; title: string; time: string | null; who: string; location: string | null }[];
};

export type OfflineMessage = {
  id: string;
  author: string;
  mine: boolean;
  body: string;
  at: string;
  /** How many files it carried. The files themselves are not stored. */
  files: number;
};

export type OfflineConversation = {
  key: string;
  title: string;
  /** Only the household chat queues messages offline; the others are read-only. */
  canSend: boolean;
  messages: OfflineMessage[];
};

export type OfflineEmergencyCard = {
  memberId: string;
  name: string;
  born: string | null;
  facts: [string, string | null][];
  calls: { name: string; relationship: string | null; phone: string }[];
};

export type OfflineSnapshot = {
  version: typeof SNAPSHOT_VERSION;
  /** Whose it is. The browser refuses to show a snapshot for anyone else. */
  userId: string;
  memberId: string;
  firstName: string;
  familyName: string;
  savedAt: string;
  /** The household's day (Asia/Manila), which Today's marks are keyed on. */
  day: string;
  kidView: boolean;
  today: OfflineTodayItem[];
  /** Null in kid view, which does not show the household's running. */
  shopping: OfflineBuyGroup[] | null;
  planner: OfflinePlannerDay[];
  conversations: OfflineConversation[];
  /** Null in kid view, which does not show family health. */
  emergency: OfflineEmergencyCard[] | null;
};

/** A change made offline, waiting to be sent. `id` is made on the phone and
 * is what stops a change being applied twice: a replay that times out and is
 * sent again carries the same id, and the server treats a repeat as done. */
export type QueuedOp =
  | { id: string; at: string; kind: "buy.toggle"; itemId: string; checked: boolean; label: string }
  | {
      id: string;
      at: string;
      kind: "buy.add";
      name: string;
      label: string;
      /** From the live list's add form; the saved copy sends the name only. */
      quantity?: string;
      unit?: string;
      section?: string;
    }
  | { id: string; at: string; kind: "today.mark"; key: string; day: string; date?: string; label: string }
  | {
      id: string;
      at: string;
      kind: "chat.send";
      body: string;
      label: string;
      /** From the live household chat: who it tags and what it answers,
       * sent with it on reconnect. The saved copy sends words only. */
      mentions?: string[];
      replyTo?: string | null;
      /** The quote as it looked when written, so the waiting bubble can show
       * it even after the message it answers has scrolled out of the thread. */
      quote?: { who: string; text: string };
    };

export type ReplayResult = {
  id: string;
  /** applied: saved. skipped: deliberately not applied, and `note` says why
   * (someone changed it later, it was for another day, it no longer exists).
   * retry: the server could not be reached or failed; try again later. */
  outcome: "applied" | "skipped" | "retry";
  note?: string;
};

export const MAX_QUEUE = 200;
