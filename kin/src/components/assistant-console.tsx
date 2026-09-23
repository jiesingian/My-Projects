"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { Blueprint } from "@/components/ui";
import { Icon } from "@/components/icons";
import { listen, speak, speechOutSupported, speechSupported, stopSpeaking, type Listener } from "@/lib/speech";

type Turn = { role: "user" | "assistant"; content: string };

/** Nothing to subscribe to -- the answer is fixed for the life of the page. */
function neverChanges() {
  return () => {};
}

const SUGGESTIONS = ["What's on this week?", "Add milk and eggs to the list", "How much is left this month?", "Any bills due?"];

export function AssistantConsole({ memberName }: { memberName: string }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Voice is an input method, not a mode: what it produces goes through the
  // same send() as typing, so the assistant's tools, permissions and
  // wording are identical however the words arrived.
  // Read rather than stored in state: whether this browser has a speech
  // engine is a fact about the browser, not something that changes, and
  // useSyncExternalStore is how you ask without the server and the client
  // rendering different buttons.
  const canHear = useSyncExternalStore(neverChanges, speechSupported, () => false);
  const canSpeak = useSyncExternalStore(neverChanges, speechOutSupported, () => false);
  const [listening, setListening] = useState(false);
  const [readAloud, setReadAloud] = useState(false);
  const [heardNotice, setHeardNotice] = useState(false);
  const listenerRef = useRef<Listener | null>(null);
  // The last transcript, kept in a ref because onend fires after the final
  // result and needs to know what to send without re-rendering first.
  const transcriptRef = useRef("");

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [turns, thinking]);

  async function send(text: string) {
    const message = text.trim();
    if (!message || thinking) return;
    // A new question stops the old answer mid-sentence, which is what
    // interrupting somebody is supposed to do.
    stopSpeaking();

    const next: Turn[] = [...turns, { role: "user", content: message }];
    setTurns(next);
    setDraft("");
    setError(null);
    setThinking(true);

    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: next,
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      });
      const data = (await res.json()) as { reply?: string; actions?: string[]; error?: string };

      if (!res.ok || data.error) {
        setError(data.error ?? "The assistant couldn't answer that.");
        return;
      }

      const reply = data.reply ?? "Done.";
      setTurns((prev) => [...prev, { role: "assistant", content: reply }]);
      // Only read back what was asked by voice. A typed question answered
      // out loud in a quiet room is a fright, not a feature.
      if (readAloud && canSpeak) speak(reply);
      // Anything it created needs the hub cards behind this panel to catch up.
      if ((data.actions ?? []).length > 0) router.refresh();
    } catch {
      setError("Couldn't reach the assistant. Check your connection.");
    } finally {
      setThinking(false);
    }
  }

  const toggleListening = useCallback(() => {
    if (listening) {
      listenerRef.current?.stop();
      return;
    }
    setError(null);
    setHeardNotice(true);
    transcriptRef.current = "";
    const listener = listen(
      (text, final) => {
        transcriptRef.current = text;
        // Show the words arriving, so a long sentence does not look like
        // nothing is happening.
        setDraft(text);
        if (final) {
          listenerRef.current?.stop();
        }
      },
      (message) => {
        setError(message);
        setListening(false);
      },
      () => {
        setListening(false);
        listenerRef.current = null;
        const heard = transcriptRef.current.trim();
        transcriptRef.current = "";
        if (heard) {
          // Asked out loud, so answer out loud.
          setReadAloud(true);
          send(heard);
        }
      },
    );
    if (!listener) {
      setError("This browser won't let Kin listen. You can still type.");
      return;
    }
    listenerRef.current = listener;
    setListening(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listening]);

  // Leaving the screen mid-sentence should not leave the microphone open or
  // the browser talking to an empty room.
  useEffect(() => {
    return () => {
      listenerRef.current?.stop();
      stopSpeaking();
    };
  }, []);

  return (
    <Blueprint style={{ padding: "0.8125rem", marginBottom: "0.875rem" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: "0.5rem", marginBottom: turns.length > 0 ? 10 : 8 }}>
        <span style={{ font: "600 0.8125rem/1 var(--font-heading)", letterSpacing: ".02em", color: "var(--color-neutral-600)" }}>ASK KIN</span>
        {turns.length > 0 && (
          <button
            type="button"
            onClick={() => {
              setTurns([]);
              setError(null);
            }}
            style={{ marginLeft: "auto", background: "none", border: 0, cursor: "pointer", font: "600 0.75rem/1 var(--font-heading)", letterSpacing: ".02em", color: "var(--color-neutral-600)" }}
          >
            CLEAR
          </button>
        )}
      </div>

      {turns.length > 0 && (
        <div ref={scrollRef} aria-live="polite" style={{ maxHeight: "16.25rem", overflowY: "auto", marginBottom: "0.625rem", display: "flex", flexDirection: "column", gap: "0.5625rem" }}>
          {turns.map((turn, i) => (
            <div
              key={i}
              style={{
                fontSize: "0.9375rem",
                lineHeight: 1.35,
                alignSelf: turn.role === "user" ? "flex-end" : "flex-start",
                maxWidth: "84%",
                padding: turn.role === "user" ? "8px 13px" : "2px 0",
                borderRadius: turn.role === "user" ? 18 : 0,
                background: turn.role === "user" ? "var(--color-accent)" : "transparent",
                color: turn.role === "user" ? "#fff" : "var(--color-text)",
                whiteSpace: "pre-wrap",
              }}
            >
              {turn.content}
            </div>
          ))}
          {thinking && <div style={{ fontSize: "0.84375rem", color: "var(--color-neutral-600)" }}>Working on it…</div>}
        </div>
      )}

      {error && <p style={{ color: "var(--color-accent-700)", fontSize: "0.84375rem", margin: "0 0 9px" }}>{error}</p>}

      {turns.length === 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.375rem", marginBottom: "0.625rem" }}>
          {SUGGESTIONS.map((s) => (
            <button key={s} type="button" className="chip" onClick={() => send(s)} disabled={thinking}>
              {s}
            </button>
          ))}
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(draft);
        }}
        style={{ display: "flex", gap: "0.5rem" }}
      >
        <input
          className="input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
            aria-label="Ask Kin"
          placeholder={`Ask or add something, ${memberName}…`}
          disabled={thinking}
          style={{ minHeight: "2.625rem", flex: 1 }}
        />
        {canHear && (
          <button
            type="button"
            className={listening ? "btn btn-primary" : "btn btn-secondary"}
            onClick={toggleListening}
            disabled={thinking}
            aria-pressed={listening}
            aria-label={listening ? "Stop listening" : "Ask by voice"}
            title={listening ? "Stop listening" : "Ask by voice"}
            style={{ minHeight: "2.625rem", width: 42, padding: 0, flex: "none" }}
          >
            <Icon name={listening ? "pause" : "message"} size={17} />
          </button>
        )}
        <button type="submit" className="btn btn-primary" disabled={thinking || !draft.trim()} style={{ minHeight: "2.625rem", paddingInline: "1rem", fontSize: "0.875rem" }}>
          {thinking ? "…" : "SEND"}
        </button>
      </form>

      {listening && (
        <p style={{ fontSize: "0.78125rem", color: "var(--color-accent-700)", margin: "8px 0 0" }}>
          Listening — say what you need, then pause.
        </p>
      )}

      {/* Said once, the first time somebody presses it, because "the browser
          did the transcribing" is not the same as "nothing left the room"
          and a household should hear that before rather than after. */}
      {heardNotice && !listening && (
        <p style={{ fontSize: "0.75rem", color: "var(--color-neutral-600)", margin: "8px 0 0", lineHeight: 1.45 }}>
          Your browser does the listening, not Kin — on Chrome that means the audio goes to Google to be turned into
          text. Kin only ever receives the words.
        </p>
      )}
    </Blueprint>
  );
}
