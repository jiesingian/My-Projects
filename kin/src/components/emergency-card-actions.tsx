"use client";

import { Icon } from "@/components/icons";
import { toast } from "@/components/toast";

/** Share the emergency card as text (to a babysitter, a grandparent, the
 * school) or print it as a wallet card. Text rather than a link: a link would
 * need the reader to have Kin, and would keep working after it was sent. */
export function EmergencyCardActions({ title, text }: { title: string; text: string }) {
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
  return (
    <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.875rem" }}>
      <button type="button" className="btn btn-primary" style={{ flex: 1 }} onClick={() => void share()}>
        <Icon name="upload" size="1rem" /> Share
      </button>
      <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => window.print()}>
        <Icon name="fileText" size="1rem" /> Print
      </button>
    </div>
  );
}
