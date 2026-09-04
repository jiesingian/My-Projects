"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Blueprint } from "@/components/ui";

type Turn = { role: "user" | "assistant"; content: string };

const SUGGESTIONS = ["What's on this week?", "Add milk and eggs to the list", "How much is left this month?", "Any bills due?"];

export function AssistantConsole({ memberName }: { memberName: string }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [turns, thinking]);

  async function send(text: string) {
    const message = text.trim();
    if (!message || thinking) return;

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

      setTurns((prev) => [...prev, { role: "assistant", content: data.reply ?? "Done." }]);
      // Anything it created needs the hub cards behind this panel to catch up.
      if ((data.actions ?? []).length > 0) router.refresh();
    } catch {
      setError("Couldn't reach the assistant. Check your connection.");
    } finally {
      setThinking(false);
    }
  }

  return (
    <Blueprint style={{ padding: 13, marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: turns.length > 0 ? 10 : 8 }}>
        <span style={{ font: "600 13px/1 var(--font-heading)", letterSpacing: ".02em", color: "var(--color-neutral-600)" }}>ASK KIN</span>
        {turns.length > 0 && (
          <button
            type="button"
            onClick={() => {
              setTurns([]);
              setError(null);
            }}
            style={{ marginLeft: "auto", background: "none", border: 0, cursor: "pointer", font: "600 12px/1 var(--font-heading)", letterSpacing: ".02em", color: "var(--color-neutral-600)" }}
          >
            CLEAR
          </button>
        )}
      </div>

      {turns.length > 0 && (
        <div ref={scrollRef} style={{ maxHeight: 260, overflowY: "auto", marginBottom: 10, display: "flex", flexDirection: "column", gap: 9 }}>
          {turns.map((turn, i) => (
            <div
              key={i}
              style={{
                fontSize: 15,
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
          {thinking && <div style={{ fontSize: 13.5, color: "var(--color-neutral-600)" }}>Working on it…</div>}
        </div>
      )}

      {error && <p style={{ color: "var(--color-accent-700)", fontSize: 13.5, margin: "0 0 9px" }}>{error}</p>}

      {turns.length === 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
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
        style={{ display: "flex", gap: 8 }}
      >
        <input
          className="input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={`Ask or add something, ${memberName}…`}
          disabled={thinking}
          style={{ minHeight: 42, flex: 1 }}
        />
        <button type="submit" className="btn btn-primary" disabled={thinking || !draft.trim()} style={{ minHeight: 42, paddingInline: 16, fontSize: 14 }}>
          {thinking ? "…" : "SEND"}
        </button>
      </form>
    </Blueprint>
  );
}
