"use client";

import { Icon } from "@/components/icons";
import { toast } from "@/components/toast";

/** A message Kin wrote for a person to send themselves -- through the
 * phone's share sheet, or copied to paste into Messenger or Viber. Kin never
 * sends it: the reader decides whether, when and to whom. */
export function ShareMessage({ text, title = "Reminder" }: { text: string; title?: string }) {
  const share = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ title, text });
        return;
      }
      await navigator.clipboard.writeText(text);
      toast.success("Copied. Paste it into a message.");
    } catch (e) {
      if ((e as Error).name !== "AbortError") toast.error("Couldn't share from this browser.");
    }
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied. Paste it into a message.");
    } catch {
      toast.error("Couldn't copy from this browser.");
    }
  };

  return (
    <div style={{ marginTop: "0.5rem" }}>
      <p style={{ fontSize: "0.8125rem", lineHeight: 1.45, margin: "0 0 0.375rem", padding: "0.5rem 0.625rem", borderRadius: 10, background: "color-mix(in srgb, var(--color-text) 6%, transparent)" }}>{text}</p>
      <div style={{ display: "flex", gap: "0.375rem" }}>
        <button type="button" className="btn btn-secondary" style={{ minHeight: "2rem", fontSize: "0.78125rem", padding: "0 0.625rem", gap: "0.25rem" }} onClick={() => void share()}>
          <Icon name="upload" size={13} /> Share
        </button>
        <button type="button" className="btn btn-ghost" style={{ minHeight: "2rem", fontSize: "0.78125rem", padding: "0 0.625rem", gap: "0.25rem" }} onClick={() => void copy()}>
          <Icon name="copy" size={13} /> Copy
        </button>
      </div>
    </div>
  );
}
