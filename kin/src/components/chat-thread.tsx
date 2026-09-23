"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { familyDay, familyClock, familyDateLong } from "@/lib/time";
import { Avatar } from "@/components/avatar";
import { createClient } from "@/lib/supabase/client";
import { uploadFileDirect } from "@/lib/upload-client";
import {
  sendMessageAction,
  deleteMessageAction,
  editMessageAction,
  reactToMessageAction,
  markChatReadAction,
  pinMessageAction,
  unpinMessageAction,
  addMessageToBuyListAction,
  searchChatAction,
  getLinkPreviewAction,
  sendPollAction,
  votePollAction,
  type ChatSearchHit,
} from "@/lib/actions/chat";
import type { ChatAttachment, ChatMember, ChatMessage, ChatPin, ChatPoll } from "@/lib/queries/chat";
import { REACTIONS, amountIn, splitShoppingItems, firstUrl, type LinkPreview } from "@/lib/chat";
import { toast } from "@/components/toast";
import Link from "next/link";

// Rendered from the same list the action checks against, so a reaction the
// composer offers can never be one the server refuses.

/* Both of these read a stored instant, so both are answered in the household's
   own zone rather than the viewer's. A thread is a shared record of one house:
   a message sent at dinner should say dinner to everyone reading it, including
   whoever is abroad this week. It also keeps the server's render and the
   browser's first render identical, which is what stops React discarding the
   thread and rebuilding it on load. */
function dayLabel(iso: string) {
  const day = familyDay(new Date(iso));
  if (day === familyDay()) return "Today";
  if (day === familyDay(new Date(Date.now() - 24 * 60 * 60 * 1000))) return "Yesterday";
  return familyDateLong(new Date(iso));
}

function clockOf(iso: string) {
  return familyClock(new Date(iso));
}

/** How long a typing signal stands before it is assumed stale, and how often
 * one is sent. The gap between them is deliberate: at one signal every two
 * seconds and a four-second life, somebody typing steadily never flickers,
 * and somebody who stops disappears within about two. */
const TYPING_EVERY = 2000;
const TYPING_TTL = 4000;

/** The first line of a message, as a title for the thing it is turned into.
 * A message is often a sentence; a task title wants to be a line. */
function titleOf(body: string) {
  const first = body.split(/\r?\n/)[0].trim();
  return first.length > 120 ? `${first.slice(0, 117).trimEnd()}…` : first;
}

/** Where a message goes to become something else. Each is the hub's own
 * form, filled in and waiting -- nothing is created until Save is pressed,
 * because a date, an amount or an account is exactly what a chat message
 * does not reliably contain. */
function handoffs(m: ChatMessage, authorLabel: string) {
  const title = titleOf(m.body);
  const credit = `From ${authorLabel} in the family chat.`;
  const notes = m.body.trim() === title ? credit : `${m.body.trim()}\n\n${credit}`;
  const amount = amountIn(m.body);
  return {
    task: `/planner/add?${new URLSearchParams({ type: "task", title, notes: notes.slice(0, 1000) })}`,
    // An event's note is one short line on its form, so it carries the credit
    // and nothing else.
    event: `/planner/add?${new URLSearchParams({ type: "event", title, notes: credit })}`,
    expense: `/wealth/transact?${new URLSearchParams({ mode: "out", note: title.slice(0, 200), ...(amount ? { amount: String(amount) } : {}) })}`,
  };
}

function mmss(seconds: number) {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** A poll in the thread. Each answer is a button with its share of the
 * household drawn behind it, and the names of who picked it -- a family poll
 * is not anonymous, and "who's free Saturday" is useless if it is. */
function PollCard({
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
function PollBuilder({ onSend, onCancel, busy }: { onSend: (q: string, options: string[], multi: boolean) => void; onCancel: () => void; busy: boolean }) {
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
function Highlighted({ text, query }: { text: string; query: string }) {
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
function LinkPreviewCard({ messageId }: { messageId: string }) {
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

/** One file in a message. A photo is shown, a video plays in place, anything
 * else is a named chip that opens it. */
function AttachmentView({ a }: { a: ChatAttachment }) {
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
      <a className="kin-attachment-photo" href={a.url} target="_blank" rel="noopener noreferrer">
        {/* eslint-disable-next-line @next/next/no-img-element -- a signed URL
            that expires in half an hour gains nothing from the image
            optimiser, which would cache it past its own expiry. */}
        <img src={a.url} alt={a.fileName} loading="lazy" decoding="async" />
      </a>
    );
  }
  if (a.mimeType.startsWith("audio/")) {
    return (
      <span className="kin-attachment-audio">
        <Icon name="mic" size="1rem" />
        <audio src={a.url} controls preload="metadata" aria-label={a.fileName} />
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

/** "seen by Janine", "seen by Janine and Amelia", "seen by everyone". Naming
 * three or more people is a list nobody reads; "everyone" is the fact they
 * wanted. */
function seenLabel(ids: string[], byId: Map<string, { label: string }>, householdSize: number) {
  const names = ids.map((id) => byId.get(id)?.label).filter((n): n is string => !!n);
  if (names.length === 0) return "";
  // Everyone but the author, who never appears in seenBy.
  if (names.length >= householdSize - 1) return "everyone";
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names[0]} and ${names.length - 1} others`;
}

/** The household's thread. Messages arrive as they are sent — the page holds
 * a live subscription rather than waiting for a refresh — and anyone can be
 * tagged by name, which is what makes a message reach the right person in a
 * room where everyone is listening. */
export function ChatThread({
  me,
  familyId,
  members,
  initial,
  pin,
}: {
  me: string;
  familyId: string;
  members: (ChatMember & { label: string })[];
  initial: ChatMessage[];
  pin: ChatPin;
}) {
  const router = useRouter();
  // The thread itself is the server's; this component keeps only what the
  // server does not know yet — a message on its way out.
  const messages = initial;
  const [draft, setDraft] = useState("");
  const [mentioned, setMentioned] = useState<string[]>([]);
  const [pendingBody, setPendingBody] = useState<string | null>(null);
  const [openFor, setOpenFor] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; body: string } | null>(null);
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);
  /** Files picked and not yet sent, with a local preview for the images. */
  const [picked, setPicked] = useState<{ file: File; preview: string | null }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [asking, setAsking] = useState(false);
  const [trayOpen, setTrayOpen] = useState(false);
  const [recordingSince, setRecordingSince] = useState<number | null>(null);
  const [recordedFor, setRecordedFor] = useState(0);
  const recorder = useRef<MediaRecorder | null>(null);
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<ChatSearchHit[] | null>(null);
  const [highlight, setHighlight] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  /** Member ids currently typing, against the instant their signal goes
   * stale. Nothing here is persisted: a typing indicator that outlives the
   * typing is worse than none. */
  const [typing, setTyping] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const bottom = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const byId = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [messages.length, pendingBody]);

  // Read on arrival, and again whenever something new lands while looking.
  // The first one also refreshes, so the count on the tab clears with it.
  const cleared = useRef(false);
  useEffect(() => {
    void markChatReadAction().then(() => {
      if (cleared.current) return;
      cleared.current = true;
      router.refresh();
    });
  }, [messages.length, router]);

  // Live: any change to the thread pulls the page's own data again, so what
  // is on screen is what is in the database rather than a guess at it.
  //
  // The channel is named per household. It used to be the bare string
  // "family-chat", which every household in the app joined -- row-level
  // security meant nobody saw anybody else's data, because each refresh
  // re-fetched under their own policies, but every family still woke up for
  // every other family's messages. A broadcast channel has no such backstop,
  // so the typing signal below could not have been added to a shared one at
  // all.
  //
  // The payload is a member id and nothing else. Whoever could join this
  // channel already knows the household's id, and an id on its own resolves
  // to a name only against the member list, which is fetched under RLS.
  const channelRef = useRef<ReturnType<ReturnType<typeof createClient>["channel"]> | null>(null);
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`family-chat:${familyId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "family_messages" }, () => router.refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "family_message_reactions" }, () => router.refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "family_chat_pins" }, () => router.refresh())
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        const who = (payload as { id?: string })?.id;
        if (!who || who === me) return;
        setTyping((prev) => ({ ...prev, [who]: Date.now() + TYPING_TTL }));
      })
      .subscribe();
    channelRef.current = channel;
    return () => {
      channelRef.current = null;
      void supabase.removeChannel(channel);
    };
  }, [router, familyId, me]);

  // A preview is an object URL, which holds the whole file in memory until it
  // is released. Released when the set changes and when the thread goes.
  useEffect(() => {
    return () => {
      for (const p of picked) if (p.preview) URL.revokeObjectURL(p.preview);
    };
  }, [picked]);

  // A voice note is recorded in the browser and then treated exactly like a
  // picked file: it joins the preview strip, and goes up with the message on
  // Send through the same path a photo does. Nothing about it is special once
  // it exists, which is the point -- there is one way a file reaches the
  // thread.
  const MAX_VOICE_SECONDS = 120;
  const startRecording = async () => {
    if (typeof window === "undefined" || !("MediaRecorder" in window) || !navigator.mediaDevices?.getUserMedia) {
      toast.error("This browser can't record audio.");
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      toast.error("Kin needs the microphone to record a voice note. It can be allowed in the browser's site settings.");
      return;
    }
    // iOS Safari records mp4, most others webm. Ask for whichever this one
    // can actually make rather than one it will silently refuse.
    const mimeType = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm", "audio/ogg;codecs=opus"].find((t) => MediaRecorder.isTypeSupported(t));
    const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    const chunks: Blob[] = [];
    const started = Date.now();
    rec.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    rec.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      recorder.current = null;
      setRecordingSince(null);
      const seconds = (Date.now() - started) / 1000;
      // A tap that started and stopped at once is a mistake, not a message.
      if (seconds < 0.8 || chunks.length === 0) return;
      const type = rec.mimeType || mimeType || "audio/webm";
      const ext = type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : "webm";
      const file = new File(chunks, `Voice note ${mmss(seconds).replace(":", "m")}s.${ext}`, { type: type.split(";")[0] });
      setPicked((prev) => [...prev, { file, preview: null }].slice(0, 10));
    };
    recorder.current = rec;
    rec.start();
    setRecordedFor(0);
    setRecordingSince(started);
  };
  const stopRecording = () => recorder.current?.state === "recording" && recorder.current.stop();

  // The clock on the record button, and the hard stop at two minutes. A voice
  // note left running in a pocket should not become a forty-minute upload.
  useEffect(() => {
    if (recordingSince === null) return;
    const timer = setInterval(() => {
      const seconds = (Date.now() - recordingSince) / 1000;
      setRecordedFor(seconds);
      if (seconds >= MAX_VOICE_SECONDS && recorder.current?.state === "recording") recorder.current.stop();
    }, 250);
    return () => clearInterval(timer);
  }, [recordingSince]);

  // Leaving the page mid-recording releases the microphone.
  useEffect(() => () => {
    if (recorder.current?.state === "recording") recorder.current.stop();
  }, []);

  const askPoll = (question: string, options: string[], multi: boolean) => {
    startTransition(async () => {
      const result = await sendPollAction({ question, options, allowMultiple: multi });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      setAsking(false);
      router.refresh();
    });
  };

  const pickFiles = (list: FileList | null) => {
    if (!list?.length) return;
    const next = Array.from(list).map((file) => ({
      file,
      preview: file.type.startsWith("image/") ? URL.createObjectURL(file) : null,
    }));
    setPicked((prev) => [...prev, ...next].slice(0, 10));
    if (fileInput.current) fileInput.current.value = "";
  };

  // Search as they type, a beat after they stop. The server searches the
  // whole history, not just what is loaded.
  useEffect(() => {
    if (!searching) return;
    const q = query.trim();
    let cancelled = false;
    const timer = setTimeout(() => {
      if (q.length < 2) {
        if (!cancelled) setHits(null);
        return;
      }
      void searchChatAction(q).then((r) => {
        if (cancelled) return;
        if (r.error) setError(r.error);
        setHits(r.hits);
      });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, searching]);

  const jumpTo = (id: string) => {
    const el = document.getElementById(`msg-${id}`);
    if (!el) return false;
    setSearching(false);
    setQuery("");
    setHits(null);
    setHighlight(id);
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    setTimeout(() => setHighlight((h) => (h === id ? null : h)), 2000);
    return true;
  };

  // Sweeps expired signals. A sender that closes the tab mid-word sends no
  // retraction, so the only thing that can end an indicator is time.
  useEffect(() => {
    if (Object.keys(typing).length === 0) return;
    const timer = setInterval(() => {
      setTyping((prev) => {
        const now = Date.now();
        const next = Object.fromEntries(Object.entries(prev).filter(([, until]) => until > now));
        return Object.keys(next).length === Object.keys(prev).length ? prev : next;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [typing]);

  // One signal per TYPING_EVERY at most, however fast somebody types.
  const lastTypingSent = useRef(0);
  const signalTyping = useCallback(() => {
    const now = Date.now();
    if (now - lastTypingSent.current < TYPING_EVERY) return;
    lastTypingSent.current = now;
    void channelRef.current?.send({ type: "broadcast", event: "typing", payload: { id: me } });
  }, [me]);

  // No expiry check here on purpose: reading the clock during render is
  // impure, and the sweep above already drops stale ids once a second. The
  // cost is that an indicator can outlive its signal by up to that second,
  // against a four-second life.
  const typingNames = Object.keys(typing)
    .map((id) => byId.get(id)?.label)
    .filter((n): n is string => !!n);

  /** What is being typed after an "@", if the cursor is still inside it. */
  const mentionQuery = (() => {
    const at = draft.lastIndexOf("@");
    if (at === -1) return null;
    const after = draft.slice(at + 1);
    if (/\s{2,}|\n/.test(after)) return null;
    return after.length <= 20 ? after.toLowerCase() : null;
  })();

  const suggestions = mentionQuery === null ? [] : members.filter((m) => m.id !== me && m.label.toLowerCase().startsWith(mentionQuery));

  const pickMention = (m: (typeof members)[number]) => {
    const at = draft.lastIndexOf("@");
    setDraft(`${draft.slice(0, at)}@${m.label} `);
    setMentioned((prev) => (prev.includes(m.id) ? prev : [...prev, m.id]));
    input.current?.focus();
  };

  const send = useCallback(() => {
    const body = draft.trim();
    const files = picked;
    if (!body && files.length === 0) return;
    // Only tags still standing in the text count.
    const stillThere = mentioned.filter((id) => body.includes(`@${byId.get(id)?.label ?? ""}`));
    const answering = replyingTo?.id ?? null;
    setDraft("");
    setMentioned([]);
    setReplyingTo(null);
    setPendingBody(body || (files.length === 1 ? "Sending a file…" : `Sending ${files.length} files…`));
    setError(null);
    startTransition(async () => {
      // Files first, straight to Storage. The message is only written once
      // every one of them has landed, so a thread never shows "here's the
      // photo" with the photo still on its way -- or never arriving.
      let attachments: { storagePath: string; fileName: string; mimeType: string; sizeBytes: number }[] = [];
      if (files.length > 0) {
        setUploading(true);
        try {
          const uploaded = await Promise.all(files.map((p) => uploadFileDirect(p.file, "chat")));
          attachments = uploaded.map((u, i) => ({
            storagePath: u.provider === "supabase" ? u.storagePath : "",
            fileName: files[i].file.name,
            mimeType: files[i].file.type,
            sizeBytes: files[i].file.size,
          }));
        } catch (e) {
          setUploading(false);
          setError(e instanceof Error ? e.message : "A file didn't upload.");
          setPendingBody(null);
          setDraft(body);
          return;
        }
        setUploading(false);
      }

      const result = await sendMessageAction({ body, mentions: stillThere, replyTo: answering, attachments });
      if (result.error) {
        setError(result.error);
        setPendingBody(null);
        setDraft(body);
        return;
      }
      setPicked([]);
      // Both inside the transition, so the optimistic bubble is only taken
      // away in the same commit that brings the real one in.
      router.refresh();
      setPendingBody(null);
    });
  }, [draft, mentioned, byId, router, replyingTo, picked]);

  const act = (fn: () => Promise<{ error: string | null }>) => {
    setOpenFor(null);
    startTransition(async () => {
      const result = await fn();
      if (result.error) setError(result.error);
      router.refresh();
    });
  };

  // Resolved from the thread rather than fetched on its own: a pin pointing
  // at something outside the loaded window would be a banner you cannot scroll
  // to, which is worse than no banner.
  const pinned = pin ? (messages.find((m) => m.id === pin.messageId) ?? null) : null;

  /** The newest message of your own, which is the only one that carries a
   * "seen by". */
  const lastMine = [...messages].reverse().find((m) => m.memberId === me && !m.deleted)?.id ?? null;

  // Day breaks and speaker runs are worked out up front: a conversation is
  // read as turns, and the previous message is what decides where one ends.
  const rows = messages.map((m, i) => {
    const prev = messages[i - 1];
    const day = dayLabel(m.createdAt);
    const showDay = !prev || dayLabel(prev.createdAt) !== day;
    return { m, day, showDay, runStart: showDay || prev?.memberId !== m.memberId };
  });

  return (
    /* Tall enough that the composer sits just above the tab bar even when
       only one thing has been said. */
    <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
      <div className="kin-chatsearch">
        {searching ? (
          <>
            <input
              className="input kin-chatsearch-field"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search the family chat"
              aria-label="Search the family chat"
              autoFocus
            />
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                setSearching(false);
                setQuery("");
                setHits(null);
              }}
            >
              Cancel
            </button>
          </>
        ) : (
          <button type="button" className="btn btn-ghost kin-chatsearch-open" onClick={() => setSearching(true)}>
            <Icon name="search" size="0.9375rem" /> Search
          </button>
        )}
      </div>

      {searching && hits !== null && (
        <div className="kin-chatsearch-results" role="list" aria-label="Search results">
          {hits.length === 0 ? (
            <p className="kin-chatsearch-empty">Nothing in the chat says &ldquo;{query.trim()}&rdquo;.</p>
          ) : (
            hits.map((h) => {
              const who = h.memberId ? (byId.get(h.memberId)?.label ?? "Someone") : "Someone";
              const loaded = messages.some((m) => m.id === h.id);
              return (
                <button
                  key={h.id}
                  type="button"
                  role="listitem"
                  className="kin-chatsearch-hit"
                  // Older than the loaded window, it cannot be scrolled to, so
                  // the hit shows the whole message instead of a snippet.
                  data-full={!loaded || undefined}
                  onClick={() => {
                    if (loaded) jumpTo(h.id);
                  }}
                >
                  <span className="kin-chatsearch-meta">
                    {who} · {dayLabel(h.createdAt)}, {clockOf(h.createdAt)}
                  </span>
                  <Highlighted text={h.body} query={query.trim()} />
                </button>
              );
            })
          )}
        </div>
      )}

      {/* The thing on the fridge door. It sits above the thread rather than
          inside it, because the whole point is that it does not scroll away. */}
      {pinned && (
        <div className="kin-chatpin">
          <Icon name="mapPin" size="0.875rem" style={{ flex: "none", color: "var(--color-accent-700)" }} />
          <button
            type="button"
            className="kin-chatpin-body"
            onClick={() => document.getElementById(`msg-${pinned.id}`)?.scrollIntoView({ block: "center", behavior: "smooth" })}
          >
            <span className="kin-chatpin-who">{pinned.memberId ? (byId.get(pinned.memberId)?.label ?? "Someone") : "Someone"}</span>
            <span className="kin-chatpin-text">{pinned.deleted ? "Message withdrawn" : pinned.body}</span>
          </button>
          <button type="button" className="btn btn-ghost kin-chatpin-off" onClick={() => act(() => unpinMessageAction())}>
            Unpin
          </button>
        </div>
      )}

      <div style={{ flex: 1 }}>
        {messages.length === 0 && !pendingBody && (
          <p style={{ fontSize: "0.875rem", color: "var(--color-neutral-600)", textAlign: "center", padding: "2.5rem 1.25rem", lineHeight: 1.5 }}>
            Nothing said yet. This is the whole household&rsquo;s thread — type <strong>@</strong> to tag someone in particular.
          </p>
        )}

        {rows.map(({ m, day, showDay, runStart }) => {
          const mine = m.memberId === me;
          const author = m.memberId ? byId.get(m.memberId) : undefined;
          const tagsMe = m.mentions.includes(me);

          return (
            <div key={m.id} id={`msg-${m.id}`} className={highlight === m.id ? "kin-msg-found" : undefined}>
              {showDay && (
                <div style={{ display: "flex", alignItems: "center", gap: "0.625rem", margin: "16px 0 10px" }}>
                  <span style={{ flex: 1, height: 1, background: "var(--color-divider)" }} />
                  <span style={{ fontSize: "0.71875rem", color: "var(--color-neutral-600)" }}>{day}</span>
                  <span style={{ flex: 1, height: 1, background: "var(--color-divider)" }} />
                </div>
              )}

              <div style={{ display: "flex", gap: "0.5rem", justifyContent: mine ? "flex-end" : "flex-start", marginTop: runStart ? 8 : 2 }}>
                {!mine && (
                  <span style={{ width: 28, flex: "none" }}>
                    {runStart && <Avatar url={author?.photoUrl ?? null} initials={author?.initials ?? "?"} label={author?.label ?? "Someone"} size={28} />}
                  </span>
                )}

                <div style={{ maxWidth: "76%", display: "flex", flexDirection: "column", alignItems: mine ? "flex-end" : "flex-start" }}>
                  {runStart && !mine && (
                    <span style={{ fontSize: "0.71875rem", color: "var(--color-neutral-600)", margin: "0 0 2px 10px" }}>
                      {author?.label ?? "Someone"}
                    </span>
                  )}

                  {/* What this answers. Tapping it goes there, which is the
                      whole reason a quote is worth the room it takes. */}
                  {m.replyTo && !m.deleted && (
                    <button
                      type="button"
                      className="kin-quote"
                      data-mine={mine || undefined}
                      onClick={() => document.getElementById(`msg-${m.replyTo!.id}`)?.scrollIntoView({ block: "center", behavior: "smooth" })}
                    >
                      <span className="kin-quote-who">
                        {m.replyTo.memberId ? (byId.get(m.replyTo.memberId)?.label ?? "Someone") : "Someone"}
                      </span>
                      <span className="kin-quote-text">{m.replyTo.deleted ? "Message withdrawn" : m.replyTo.excerpt}</span>
                    </button>
                  )}

                  {editing?.id === m.id ? (
                    <div style={{ display: "flex", gap: "0.375rem", alignItems: "flex-end" }}>
                      <textarea
                        className="input"
                        value={editing.body}
                        onChange={(e) => setEditing({ id: m.id, body: e.target.value })}
                        rows={2}
                        style={{ minHeight: "2.75rem", fontSize: "0.9375rem", width: "13.75rem", resize: "none" }}
                        aria-label="Edit this message"
                      />
                      <button
                        type="button"
                        className="btn btn-primary"
                        style={{ minHeight: "2.125rem", fontSize: "0.8125rem", padding: "0 0.625rem" }}
                        onClick={() => {
                          const body = editing.body;
                          setEditing(null);
                          act(() => editMessageAction(m.id, body));
                        }}
                      >
                        Save
                      </button>
                      <button type="button" className="btn btn-ghost" style={{ minHeight: "2.125rem", fontSize: "0.78125rem", padding: "0 0.5rem" }} onClick={() => setEditing(null)}>
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <>
                      {/* Files sit above the words, as a caption sits under a
                          photo. Outside the bubble on purpose: the bubble is a
                          button, and a link or a video's own controls inside
                          a button is not valid and does not work on a phone. */}
                      {m.attachments.length > 0 && !m.deleted && (
                        <div className="kin-attachments" data-mine={mine || undefined} data-count={Math.min(m.attachments.length, 4)}>
                          {m.attachments.map((a) => (
                            <AttachmentView key={a.id} a={a} />
                          ))}
                        </div>
                      )}

                      {m.poll && !m.deleted ? (
                        <>
                          <PollCard
                            poll={m.poll}
                            me={me}
                            byId={byId}
                            householdSize={members.length}
                            onVote={(optionId) => act(() => votePollAction(m.poll!.id, optionId))}
                          />
                          <button
                            type="button"
                            className="btn btn-ghost kin-attachments-more"
                            onClick={() => setOpenFor(openFor === m.id ? null : m.id)}
                            aria-label={`Options for ${mine ? "your" : `${author?.label ?? "someone"}'s`} poll`}
                          >
                            ···
                          </button>
                        </>
                      ) : m.deleted || m.body ? (
                        <button
                          type="button"
                          onClick={() => setOpenFor(openFor === m.id ? null : m.id)}
                          className="kin-bubble"
                          data-mine={mine}
                          data-tagged={tagsMe && !mine}
                          aria-label={`Message from ${mine ? "you" : (author?.label ?? "someone")} at ${clockOf(m.createdAt)}`}
                        >
                          {m.deleted ? (
                            <span style={{ opacity: 0.65, fontStyle: "italic" }}>Message withdrawn</span>
                          ) : (
                            <MessageBody body={m.body} members={members} me={me} mine={mine} />
                          )}
                        </button>
                      ) : (
                        /* A photo with no words has no bubble to tap, so it
                           gets the same menu from a button of its own. */
                        <button
                          type="button"
                          className="btn btn-ghost kin-attachments-more"
                          onClick={() => setOpenFor(openFor === m.id ? null : m.id)}
                          aria-label={`Options for ${mine ? "your" : `${author?.label ?? "someone"}'s`} ${m.attachments.length === 1 ? "file" : "files"}`}
                        >
                          ···
                        </button>
                      )}
                    </>
                  )}

                  {!m.deleted && firstUrl(m.body) && <LinkPreviewCard messageId={m.id} />}

                  {m.reactions.length > 0 && (
                    <div style={{ display: "flex", gap: "0.25rem", marginTop: -6, marginLeft: mine ? 0 : 8, marginRight: mine ? 8 : 0, zIndex: 1 }}>
                      {m.reactions.map((r) => (
                        <button
                          key={r.emoji}
                          type="button"
                          onClick={() => act(() => reactToMessageAction(m.id, r.memberIds.includes(me) ? null : r.emoji))}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "0.1875rem",
                            fontSize: "0.71875rem",
                            padding: "0.0625rem 0.375rem",
                            borderRadius: 999,
                            border: "1px solid var(--color-divider)",
                            background: "var(--color-surface)",
                            cursor: "pointer",
                            fontFamily: "var(--font-body)",
                          }}
                        >
                          {r.emoji}
                          {r.memberIds.length > 1 && <span style={{ color: "var(--color-neutral-600)" }}>{r.memberIds.length}</span>}
                        </button>
                      ))}
                    </div>
                  )}

                  {openFor === m.id && !m.deleted && (
                    <div className="kin-msgmenu" data-mine={mine || undefined}>
                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        alignItems: "center",
                        gap: "0.125rem",
                        marginTop: "0.3125rem",
                        padding: "0.25rem",
                        borderRadius: 999,
                        background: "var(--color-surface)",
                        border: "1px solid var(--color-divider)",
                        boxShadow: "var(--shadow-sm)",
                      }}
                    >
                      {REACTIONS.map((e) => (
                        <button
                          key={e}
                          type="button"
                          onClick={() => act(() => reactToMessageAction(m.id, e))}
                          aria-label={`React ${e}`}
                          style={{ border: 0, background: "none", cursor: "pointer", fontSize: "1.0625rem", padding: "0.125rem 0.25rem", lineHeight: 1 }}
                        >
                          {e}
                        </button>
                      ))}
                      <span style={{ width: 1, height: 18, background: "var(--color-divider)", margin: "0 3px" }} />
                      <button
                        type="button"
                        onClick={() => {
                          setReplyingTo(m);
                          setOpenFor(null);
                          input.current?.focus();
                        }}
                        className="btn btn-ghost"
                        style={{ minHeight: "1.625rem", fontSize: "0.75rem", padding: "0 0.375rem" }}
                      >
                        Reply
                      </button>
                      <button
                        type="button"
                        onClick={() => act(() => (pin?.messageId === m.id ? unpinMessageAction() : pinMessageAction(m.id)))}
                        className="btn btn-ghost"
                        style={{ minHeight: "1.625rem", fontSize: "0.75rem", padding: "0 0.375rem" }}
                      >
                        {pin?.messageId === m.id ? "Unpin" : "Pin"}
                      </button>
                      {mine && (
                        <>
                          <span style={{ width: 1, height: 18, background: "var(--color-divider)", margin: "0 3px" }} />
                          <button
                            type="button"
                            onClick={() => {
                              setEditing({ id: m.id, body: m.body });
                              setOpenFor(null);
                            }}
                            className="btn btn-ghost"
                            style={{ minHeight: "1.625rem", fontSize: "0.75rem", padding: "0 0.375rem" }}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => act(() => deleteMessageAction(m.id))}
                            className="btn btn-ghost"
                            style={{ minHeight: "1.625rem", fontSize: "0.75rem", padding: "0 0.375rem", color: "var(--cal-occasion)" }}
                          >
                            Delete
                          </button>
                        </>
                      )}
                    </div>

                    {/* The part a generic messenger cannot have: a message is
                        usually about something, and here that something has a
                        home. Shopping goes straight onto the list; the rest
                        open their own form filled in, since a date, an amount
                        or an account is exactly what a message does not
                        reliably contain. */}
                    {m.body && !m.poll && (
                      <div className="kin-msgmenu-make">
                        <span className="kin-msgmenu-label">Make it</span>
                        <Link className="chip" href={handoffs(m, author?.label ?? (mine ? "you" : "someone")).task}>
                          <Icon name="check" size="0.875rem" /> Task
                        </Link>
                        <Link className="chip" href={handoffs(m, author?.label ?? (mine ? "you" : "someone")).event}>
                          <Icon name="calendarDays" size="0.875rem" /> Event
                        </Link>
                        {splitShoppingItems(m.body).length > 0 && (
                          <button
                            type="button"
                            className="chip"
                            onClick={() => {
                              setOpenFor(null);
                              startTransition(async () => {
                                const result = await addMessageToBuyListAction(m.id);
                                if (result.error) toast.error(result.error);
                                else if (result.added?.length) {
                                  toast.success(
                                    result.added.length === 1
                                      ? `Added ${result.added[0]} to the Buy list.`
                                      : `Added ${result.added.length} things to the Buy list: ${result.added.join(", ")}.`,
                                  );
                                }
                              });
                            }}
                          >
                            <Icon name="basket" size="0.875rem" /> Buy list
                          </button>
                        )}
                        <Link className="chip" href={handoffs(m, author?.label ?? (mine ? "you" : "someone")).expense}>
                          <Icon name="receipt" size="0.875rem" /> Expense
                        </Link>
                      </div>
                    )}
                    </div>
                  )}

                  <span style={{ fontSize: "0.65625rem", color: "var(--color-neutral-600)", margin: "3px 4px 0" }}>
                    {clockOf(m.createdAt)}
                    {m.editedAt && !m.deleted ? " · edited" : ""}
                    {/* Only on your own, and only the latest one. Every message
                        carrying its own list turns a thread into a register of
                        who is ignoring whom; the last one answers the question
                        anybody actually has, which is whether it landed. */}
                    {mine && !m.deleted && m.id === lastMine && m.seenBy.length > 0 && (
                      <> · seen by {seenLabel(m.seenBy, byId, members.length)}</>
                    )}
                  </span>
                </div>
              </div>
            </div>
          );
        })}

        {/* Your own message, on screen before the server has it. */}
        {pendingBody && (
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "0.5rem" }}>
            <div style={{ maxWidth: "76%", opacity: 0.6 }}>
              <span className="kin-bubble" data-mine="true">
                {pendingBody}
              </span>
            </div>
          </div>
        )}

        <div ref={bottom} />
      </div>

      {error && (
        <div style={{ fontSize: "0.78125rem", color: "var(--cal-occasion)", padding: "0.375rem 0.125rem" }} role="alert">
          {error}
        </div>
      )}

      {/* The composer stays in reach at the bottom, above the tab bar. Its
          placement lives in globals.css rather than here: it has to change
          shape at 1024px, where the tab bar becomes a sidebar and there is
          nothing left below the composer to clear, and an inline style
          cannot answer a media query. The class is also what tells
          .kin-content this page ends in a composer. */}
      <div className="kin-glass-bar kin-composer">
        {/* Who is typing. Above the composer rather than in the thread, so it
            never pushes the conversation around as it comes and goes. */}
        {typingNames.length > 0 && (
          <p className="kin-typing" aria-live="polite">
            {typingNames.length === 1 ? `${typingNames[0]} is typing` : `${typingNames.slice(0, 2).join(" and ")} are typing`}
            <span className="kin-typing-dots" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
          </p>
        )}

        {asking && <PollBuilder onSend={askPoll} onCancel={() => setAsking(false)} busy={uploading} />}

        {recordingSince !== null && (
          <div className="kin-recording" role="status" aria-live="polite">
            <span className="kin-recording-dot" aria-hidden="true" />
            Recording {mmss(recordedFor)}
            <span className="kin-recording-cap">of {mmss(MAX_VOICE_SECONDS)}</span>
            <button type="button" className="btn btn-primary kin-recording-stop" onClick={stopRecording}>
              <Icon name="stop" size="0.875rem" /> Done
            </button>
          </div>
        )}

        {/* What is about to go with the message. */}
        {picked.length > 0 && (
          <div className="kin-picked">
            {picked.map((p, i) => (
              <span key={`${p.file.name}-${i}`} className="kin-picked-item">
                {p.file.type.startsWith("audio/") ? (
                  <span className="kin-picked-file">
                    <Icon name="mic" size="1rem" />
                    <span>{p.file.name.replace(/^Voice note /, "").replace(/\.\w+$/, "").replace("m", ":").replace(/s$/, "")}</span>
                  </span>
                ) : p.preview ? (
                  // eslint-disable-next-line @next/next/no-img-element -- a local object URL, not something to optimise.
                  <img src={p.preview} alt={p.file.name} />
                ) : (
                  <span className="kin-picked-file">
                    <Icon name="fileText" size="1rem" />
                    <span>{p.file.name}</span>
                  </span>
                )}
                <button
                  type="button"
                  className="kin-picked-off"
                  aria-label={`Remove ${p.file.name}`}
                  onClick={() => setPicked((prev) => prev.filter((_, j) => j !== i))}
                  disabled={uploading}
                >
                  <Icon name="x" size="0.75rem" />
                </button>
              </span>
            ))}
          </div>
        )}

        {/* What you are answering, with a way out of it. */}
        {replyingTo && (
          <div className="kin-replystrip">
            <span className="kin-quote-who">
              Replying to {replyingTo.memberId === me ? "yourself" : (byId.get(replyingTo.memberId ?? "")?.label ?? "someone")}
            </span>
            <span className="kin-quote-text">{replyingTo.deleted ? "Message withdrawn" : replyingTo.body}</span>
            <button type="button" className="btn btn-ghost kin-replystrip-off" onClick={() => setReplyingTo(null)} aria-label="Stop replying">
              <Icon name="x" size="0.875rem" />
            </button>
          </div>
        )}
        {suggestions.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.375rem", paddingBottom: "0.5rem" }}>
            {suggestions.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => pickMention(m)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.375rem",
                  padding: "0.25rem 0.625rem 0.25rem 0.25rem",
                  borderRadius: 999,
                  border: "1px solid var(--color-divider)",
                  background: "var(--color-surface)",
                  cursor: "pointer",
                  fontFamily: "var(--font-body)",
                  fontSize: "0.84375rem",
                }}
              >
                <Avatar url={m.photoUrl} initials={m.initials} label={m.label} size={22} />
                {m.label}
              </button>
            ))}
          </div>
        )}

        {/* What the + opens: everything that is not typing. Behind one button
            rather than four, because four fixed buttons beside the field left
            it too narrow to type into on a small phone even at the default
            text size -- the same trade Messenger and Telegram make. */}
        {trayOpen && (
          <div className="kin-composer-tray">
            <button type="button" className="chip" onClick={() => { setTrayOpen(false); fileInput.current?.click(); }} disabled={uploading || picked.length >= 10}>
              <Icon name="paperclip" size="0.9375rem" /> Photo or file
            </button>
            <button type="button" className="chip" onClick={() => { setTrayOpen(false); setAsking(true); }} disabled={uploading}>
              <Icon name="poll" size="0.9375rem" /> Poll
            </button>
            <button
              type="button"
              className="chip"
              onClick={() => {
                setTrayOpen(false);
                setDraft((d) => `${d}${d.endsWith(" ") || d === "" ? "" : " "}@`);
                input.current?.focus();
              }}
            >
              <span style={{ font: "600 0.9375rem/1 var(--font-heading)" }}>@</span> Tag someone
            </button>
          </div>
        )}

        <div className="kin-composer-row">
          <button
            type="button"
            className="btn btn-secondary btn-icon kin-composer-more"
            style={{ width: "2.375rem", height: "2.375rem", flex: "none" }}
            aria-label={trayOpen ? "Close" : "Attach, ask a poll or tag someone"}
            aria-expanded={trayOpen}
            data-open={trayOpen || undefined}
            disabled={recordingSince !== null}
            onClick={() => setTrayOpen((o) => !o)}
          >
            <Icon name="plus" size="1.125rem" />
          </button>
          <input
            ref={fileInput}
            type="file"
            multiple
            hidden
            accept="image/*,video/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
            onChange={(e) => pickFiles(e.target.files)}
          />
          <textarea
            ref={input}
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              if (e.target.value) signalTyping();
            }}
            onKeyDown={(e) => {
              // Enter sends; Shift+Enter is a new line, as everywhere else.
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="Message the family…"
            rows={1}
            aria-label="Your message"
            className="input kin-composer-field"
            style={{ minHeight: "2.375rem", maxHeight: "7.5rem", fontSize: "0.9375rem", resize: "none", paddingTop: "0.5625rem" }}
          />
          {/* One button that is whatever comes next: Send once there is
              something to send, the microphone when there is not, and Stop
              while it is listening. */}
          {recordingSince !== null ? (
            <button
              type="button"
              className="btn btn-primary btn-icon"
              style={{ width: "2.375rem", height: "2.375rem", flex: "none" }}
              aria-label="Stop recording"
              data-recording
              onClick={stopRecording}
            >
              <Icon name="stop" size="1rem" />
            </button>
          ) : draft.trim() || picked.length > 0 ? (
            <button
              type="button"
              className="btn btn-primary btn-icon"
              style={{ width: "2.375rem", height: "2.375rem", flex: "none" }}
              disabled={uploading}
              onClick={send}
              aria-label={uploading ? "Sending" : "Send"}
            >
              <Icon name="upload" size="1rem" />
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-secondary btn-icon"
              style={{ width: "2.375rem", height: "2.375rem", flex: "none" }}
              aria-label="Record a voice note"
              disabled={uploading}
              onClick={() => void startRecording()}
            >
              <Icon name="mic" size="1.0625rem" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** The message, with anyone tagged in it picked out. Matching is by the
 * label the composer inserted, so a tag reads as a tag rather than as an
 * email address someone happened to type. */
function MessageBody({
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
