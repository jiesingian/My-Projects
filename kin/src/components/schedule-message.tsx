"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { cancelScheduledAction, listScheduledAction, scheduleMessageAction, type ScheduledMessage } from "@/lib/actions/chat-rooms";
import { familyClock, familyDateLong } from "@/lib/time";
import { Icon } from "@/components/icons";

/** "Send later" (20260930210000), for any conversation's composer: the clock
 * button opens a day-and-time picker for what is in the message box, and the
 * messages already waiting are listed with Cancel. Times are the phone's own;
 * the reminders pipeline sends within five minutes of them. */
export function ScheduleMessage({ thread, draft, onScheduled }: { thread: string; draft: string; onScheduled: () => void }) {
  const [open, setOpen] = useState(false);
  const [when, setWhen] = useState("");
  const [waiting, setWaiting] = useState<ScheduledMessage[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const load = useCallback(() => {
    void listScheduledAction(thread).then(setWaiting);
  }, [thread]);
  useEffect(load, [load]);

  const schedule = () =>
    startTransition(async () => {
      setNote(null);
      const r = await scheduleMessageAction(thread, draft, when ? new Date(when).toISOString() : "");
      if (r.error) return setNote(r.error);
      setOpen(false);
      setWhen("");
      onScheduled();
      load();
    });

  const cancel = (id: string) =>
    startTransition(async () => {
      const r = await cancelScheduledAction(id);
      if (r.error) setNote(r.error);
      load();
    });

  return (
    <>
      {waiting.length > 0 && (
        <div className="kin-scheduled" aria-label="Scheduled messages">
          {waiting.map((m) => (
            <div key={m.id} className="kin-scheduled-row">
              <Icon name="clock" size="0.875rem" />
              <span className="kin-scheduled-when">
                {familyDateLong(new Date(m.sendAt))}, {familyClock(new Date(m.sendAt))}
              </span>
              <span className="kin-scheduled-body">{m.body}</span>
              <button type="button" className="btn btn-ghost" disabled={pending} onClick={() => cancel(m.id)}>
                Cancel
              </button>
            </div>
          ))}
        </div>
      )}
      {open && (
        <div className="kin-scheduled-pick">
          <label>
            Send at
            <input className="input" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} aria-label="Send at" />
          </label>
          <button type="button" className="btn btn-secondary" onClick={() => setOpen(false)}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" disabled={pending || !when || !draft.trim()} onClick={schedule}>
            Schedule
          </button>
        </div>
      )}
      {note && (
        <p role="alert" style={{ fontSize: "0.78125rem", color: "var(--cal-occasion)", margin: "0 0 0.375rem" }}>
          {note}
        </p>
      )}
      {!open && draft.trim() && (
        <button type="button" className="kin-scheduled-open" onClick={() => setOpen(true)}>
          <Icon name="clock" size="0.8125rem" /> Send later
        </button>
      )}
    </>
  );
}
