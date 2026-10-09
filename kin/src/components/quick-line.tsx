"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { Icon, type IconName } from "@/components/icons";
import { parseQuickLine, readableClock, type QuickMember, type QuickParse } from "@/lib/quick-line";
import { quickAddAction } from "@/lib/actions/quick-add";
import { readableDay } from "@/lib/time";
import { formatQuantity } from "@/lib/grocery";

const KIND: Record<QuickParse["kind"], { label: string; icon: IconName; tint: string }> = {
  task: { label: "Task", icon: "calendarDays", tint: "schedule" },
  event: { label: "Event", icon: "gift", tint: "occasion" },
  shopping: { label: "To buy", icon: "basket", tint: "home" },
};

const EVENT_LABEL: Record<string, string> = { birthday: "Birthday", anniversary: "Anniversary", travel: "Travel" };

/** One-line add: type a sentence, see what Kin read, then save it. The
 * reading is lib/quick-line.ts -- rules, not AI -- and nothing is saved until
 * the person has seen it. */
export function QuickLine({ members, meId, today, defaultDate }: { members: QuickMember[]; meId: string; today: string; defaultDate?: string }) {
  const [text, setText] = useState("");
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const parsed = useMemo(() => parseQuickLine(text, { today, defaultDate, members, meId }), [text, today, defaultDate, members, meId]);

  const nameOf = (id: string) => (id === meId ? "you" : (members.find((m) => m.id === id)?.name.split(" ")[0] ?? ""));
  const parts: string[] = [];
  if (parsed?.kind === "shopping") {
    parts.push(parsed.name);
    const q = formatQuantity(parsed.quantity, parsed.unit);
    if (q) parts.push(q);
    parts.push(parsed.section);
  } else if (parsed) {
    parts.push(parsed.title);
    if (parsed.kind === "event") parts.push(EVENT_LABEL[parsed.eventKind] ?? "Event");
    parts.push(parsed.date === today ? "Today" : readableDay(parsed.date));
    if (parsed.kind === "task" && parsed.from) parts.push(readableClock(parsed.from) + (parsed.to ? `–${readableClock(parsed.to)}` : ""));
    if (parsed.kind === "event" && parsed.note) parts.push(parsed.note);
    parts.push(parsed.wholeFamily ? "for everyone" : `for ${parsed.who.map(nameOf).filter(Boolean).join(", ") || "you"}`);
  }

  const fullForm =
    parsed?.kind === "shopping"
      ? "/household?seg=buy&add=1"
      : parsed
        ? `/planner/add?${new URLSearchParams({ type: parsed.kind, date: parsed.date, title: parsed.title })}`
        : null;

  const save = () => {
    if (!parsed || pending) return;
    setMessage(null);
    start(async () => {
      const res = await quickAddAction(parsed);
      // Tasks and events go on to the Planner; only a shopping item returns.
      if (res?.error) setMessage({ error: true, text: res.error });
      else if (parsed.kind === "shopping") {
        setMessage({ error: false, text: `Added ${parsed.name} to the list.` });
        setText("");
      }
    });
  };

  const kind = parsed ? KIND[parsed.kind] : null;

  return (
    <div className="kin-quickline">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
        className="kin-quickline-row"
      >
        <Icon name="sparkle" size={16} style={{ color: "var(--color-neutral-600)", flex: "none" }} />
        <input
          className="kin-quickline-input"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setMessage(null);
          }}
          placeholder='Type it: "Ben dentist Tue 3pm"'
          aria-label="Add in one line"
          enterKeyHint="done"
          autoComplete="off"
          maxLength={200}
        />
      </form>
      {parsed && kind && (
        <div className="kin-quickline-preview" aria-live="polite">
          <span className="kin-quick-ico" data-tint={kind.tint} aria-hidden="true">
            <Icon name={kind.icon} size={15} />
          </span>
          <span className="kin-quickline-read">
            <b>{kind.label}</b> · {parts.join(" · ")}
          </span>
          <span className="kin-quickline-actions">
            {fullForm && (
              <Link href={fullForm} className="btn btn-secondary">
                Edit
              </Link>
            )}
            <button type="button" className="btn btn-primary" onClick={save} disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </button>
          </span>
        </div>
      )}
      {message && (
        <p role={message.error ? "alert" : "status"} className="kin-quickline-msg" data-error={message.error || undefined}>
          {message.text}
        </p>
      )}
    </div>
  );
}
