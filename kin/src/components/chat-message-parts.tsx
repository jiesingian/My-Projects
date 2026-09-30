"use client";

/* The pieces a household chat message is drawn from -- a poll, a link's
   preview, attachments, and the body with its tags picked out. Split out of
   chat-thread.tsx, which holds the thread itself: its state, its live
   subscription and its composer. */

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/icons";
import { getLinkPreviewAction } from "@/lib/actions/chat";
import type { ChatAttachment, ChatMember, ChatPoll } from "@/lib/queries/chat";
import type { LinkPreview } from "@/lib/chat";
import { PhotoViewer } from "@/components/photo-viewer";
import { SaveToJournalButton } from "@/components/save-to-journal";
import { VoiceTranscript } from "@/components/room-thread";

/** A poll in the thread. Each answer is a button with its share of the
 * household drawn behind it, and the names of who picked it -- a family poll
 * is not anonymous, and "who's free Saturday" is useless if it is. */
export function PollCard({
  poll,
  me,
  byId,
  householdSize,
  onVote,
}: {
  poll: ChatPoll;
  me: string;
  byId: Map<string, { label: string }>;
  householdSize: number;
  onVote: (optionId: string) => void;
}) {
  const voters = new Set(poll.options.flatMap((o) => o.memberIds));
  return (
    <div className="kin-poll" role="group" aria-label={`Poll: ${poll.question}`}>
      <div className="kin-poll-q">{poll.question}</div>
      <div className="kin-poll-options">
        {poll.options.map((o) => {
          const mine = o.memberIds.includes(me);
          const share = voters.size ? o.memberIds.length / voters.size : 0;
          const names = o.memberIds.map((id) => (id === me ? "you" : (byId.get(id)?.label ?? "someone")));
          return (
            <button
              key={o.id}
              type="button"
              className="kin-poll-option"
              data-mine={mine || undefined}
              aria-pressed={mine}
              onClick={() => onVote(o.id)}
              style={{ ["--share" as string]: `${Math.round(share * 100)}%` }}
            >
              <span className="kin-poll-label">
                {mine && <Icon name="check" size="0.8125rem" />}
                {o.label}
              </span>
              <span className="kin-poll-count">{o.memberIds.length}</span>
              {names.length > 0 && <span className="kin-poll-names">{names.join(", ")}</span>}
            </button>
          );
        })}
      </div>
      <div className="kin-poll-foot">
        {voters.size} of {householdSize} answered · {poll.allowMultiple ? "pick any" : "pick one"}
      </div>
    </div>
  );
}

/** Asking a question with answers to pick from. */
export function PollBuilder({ onSend, onCancel, busy }: { onSend: (q: string, options: string[], multi: boolean) => void; onCancel: () => void; busy: boolean }) {
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [multi, setMulti] = useState(false);
  const filled = options.map((o) => o.trim()).filter(Boolean);
  const distinct = new Set(filled.map((o) => o.toLowerCase())).size;
  const ready = question.trim().length > 0 && distinct >= 2;
  return (
    <div className="kin-pollbuilder">
      <input
        className="input"
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        placeholder="Ask the family…"
        maxLength={200}
        aria-label="Poll question"
        autoFocus
      />
      {options.map((o, i) => (
        <div key={i} className="kin-pollbuilder-row">
          <input
            className="input"
            value={o}
            maxLength={100}
            placeholder={`Answer ${i + 1}`}
            aria-label={`Answer ${i + 1}`}
            onChange={(e) => setOptions((prev) => prev.map((x, j) => (j === i ? e.target.value : x)))}
          />
          {options.length > 2 && (
            <button type="button" className="btn btn-ghost" aria-label={`Remove answer ${i + 1}`} onClick={() => setOptions((prev) => prev.filter((_, j) => j !== i))}>
              <Icon name="x" size="0.875rem" />
            </button>
          )}
        </div>
      ))}
      <div className="kin-pollbuilder-foot">
        {options.length < 10 && (
          <button type="button" className="btn btn-ghost" onClick={() => setOptions((prev) => [...prev, ""])}>
            <Icon name="plus" size="0.875rem" /> Answer
          </button>
        )}
        <label className="kin-pollbuilder-multi">
          <input type="checkbox" checked={multi} onChange={(e) => setMulti(e.target.checked)} /> More than one
        </label>
      </div>
      <div className="kin-pollbuilder-foot">
        <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button type="button" className="btn btn-primary" disabled={!ready || busy} onClick={() => onSend(question, options, multi)}>
          Ask
        </button>
      </div>
    </div>
  );
}

/** A search hit with the words that matched marked, so the eye lands on them. */
export function Highlighted({ text, query }: { text: string; query: string }) {
  if (!query) return <span>{text}</span>;
  const lower = text.toLowerCase();
  const needle = query.toLowerCase();
  const parts: React.ReactNode[] = [];
  let from = 0;
  let at = lower.indexOf(needle);
  while (at !== -1 && parts.length < 40) {
    if (at > from) parts.push(text.slice(from, at));
    parts.push(<mark key={at}>{text.slice(at, at + needle.length)}</mark>);
    from = at + needle.length;
    at = lower.indexOf(needle, from);
  }
  parts.push(text.slice(from));
  return <span className="kin-chatsearch-text">{parts}</span>;
}

/** The card under a message with a link in it. Asks for its preview only once
 * it has scrolled into view: a thread of two hundred messages should not
 * fetch two hundred web pages to show the last six. */
export function LinkPreviewCard({ messageId }: { messageId: string }) {
  const [preview, setPreview] = useState<LinkPreview | null>(null);
  const holder = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = holder.current;
    if (!el) return;
    let cancelled = false;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        observer.disconnect();
        void getLinkPreviewAction(messageId).then((p) => {
          if (!cancelled) setPreview(p);
        });
      },
      { rootMargin: "200px" },
    );
    observer.observe(el);
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [messageId]);

  return (
    <div ref={holder}>
      {preview && (
        <a className="kin-linkcard" href={preview.url} target="_blank" rel="noopener noreferrer nofollow">
          <span className="kin-linkcard-site">{preview.site}</span>
          <span className="kin-linkcard-title">{preview.title}</span>
          {preview.description && <span className="kin-linkcard-desc">{preview.description}</span>}
        </a>
      )}
    </div>
  );
}

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/** A message's files. Its photos open in the full-screen viewer, with the
 * message's other photos a swipe away -- they used to open in a new browser
 * tab, which on a phone left Kin behind altogether. */
export function MessageAttachments({ attachments }: { attachments: ChatAttachment[] }) {
  const [open, setOpen] = useState<number | null>(null);
  const photos = attachments.filter((a) => a.url && a.mimeType.startsWith("image/"));
  return (
    <>
      {attachments.map((a) => (
        <AttachmentView key={a.id} a={a} onOpenPhoto={() => setOpen(photos.findIndex((p) => p.id === a.id))} />
      ))}
      {open !== null && open >= 0 && (
        <PhotoViewer
          items={photos.map((p) => ({ url: p.url!, alt: p.fileName }))}
          startIndex={open}
          onClose={() => setOpen(null)}
          label="Photo from chat"
          footer={(i) => (photos[i]?.url ? <SaveToJournalButton url={photos[i].url!} fileName={photos[i].fileName} from="the household chat" /> : null)}
        />
      )}
    </>
  );
}

/** One file in a message. A photo is shown, a video plays in place, anything
 * else is a named chip that opens it. */
function AttachmentView({ a, onOpenPhoto }: { a: ChatAttachment; onOpenPhoto: () => void }) {
  if (!a.url) {
    return (
      <span className="kin-filechip" data-broken="true">
        <Icon name="fileText" size="1rem" />
        <span className="kin-filechip-name">{a.fileName}</span>
        <span className="kin-filechip-size">couldn&rsquo;t load</span>
      </span>
    );
  }
  if (a.mimeType.startsWith("image/")) {
    return (
      <button type="button" className="kin-attachment-photo" onClick={onOpenPhoto} aria-label={`Open photo ${a.fileName}`}>
        {/* eslint-disable-next-line @next/next/no-img-element -- a signed URL
            that expires in half an hour gains nothing from the image
            optimiser, which would cache it past its own expiry. */}
        <img src={a.url} alt={a.fileName} loading="lazy" decoding="async" />
      </button>
    );
  }
  if (a.mimeType.startsWith("audio/")) {
    return (
      <span className="kin-attachment-voice">
        <span className="kin-attachment-audio">
          <Icon name="mic" size="1rem" />
          <audio src={a.url} controls preload="metadata" aria-label={a.fileName} />
        </span>
        {a.transcript && <VoiceTranscript text={a.transcript} />}
      </span>
    );
  }
  if (a.mimeType.startsWith("video/")) {
    return <video className="kin-attachment-video" src={a.url} controls preload="metadata" playsInline aria-label={a.fileName} />;
  }
  return (
    <a className="kin-filechip" href={a.url} target="_blank" rel="noopener noreferrer">
      <Icon name="fileText" size="1rem" />
      <span className="kin-filechip-name">{a.fileName}</span>
      <span className="kin-filechip-size">{formatBytes(a.sizeBytes)}</span>
    </a>
  );
}

/** The message, with anyone tagged in it picked out. Matching is by the
 * label the composer inserted, so a tag reads as a tag rather than as an
 * email address someone happened to type. */
export function MessageBody({
  body,
  members,
  me,
  mine,
}: {
  body: string;
  members: (ChatMember & { label: string })[];
  me: string;
  mine: boolean;
}) {
  const labels = members.map((m) => ({ ...m, token: `@${m.label}` })).sort((a, b) => b.token.length - a.token.length);

  const parts: React.ReactNode[] = [];
  let rest = body;
  let key = 0;

  while (rest.length > 0) {
    const at = rest.indexOf("@");
    if (at === -1) {
      parts.push(rest);
      break;
    }
    const hit = labels.find((l) => rest.startsWith(l.token, at));
    if (!hit) {
      parts.push(rest.slice(0, at + 1));
      rest = rest.slice(at + 1);
      continue;
    }
    if (at > 0) parts.push(rest.slice(0, at));
    parts.push(
      <strong
        key={key++}
        style={{
          fontWeight: 600,
          color: mine ? "#fff" : hit.id === me ? "var(--color-accent-700)" : "var(--color-accent)",
        }}
      >
        {hit.token}
      </strong>,
    );
    rest = rest.slice(at + hit.token.length);
  }

  return <>{parts}</>;
}
