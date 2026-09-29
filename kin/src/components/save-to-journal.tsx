"use client";

import { useState } from "react";
import { uploadFileDirect } from "@/lib/upload-client";
import { attachJournalMediaAction, createJournalEntryAction } from "@/lib/actions/journal";

/** "Save to Journal" under a photo in chat (29 September, suggestion 9).
 *
 * It keeps a copy, as a new entry in the saver's own Mine tab -- only they
 * see it until they share it from the Journal. Mine and not the household's
 * because the photo may be somebody else's, from another household; putting
 * it in front of more people is a choice the saver makes in the Journal,
 * not a side effect of tapping here.
 *
 * The copy goes through the Journal's own actions, unchanged: the photo is
 * read with the saver's signed URL, uploaded to their personal journal
 * folder, and indexed like any photo they add there. */
export function SaveToJournalButton({ url, fileName, from }: { url: string; fileName: string; from: string }) {
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  const save = async () => {
    setState("saving");
    setMessage(null);
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error("The photo couldn't be read. Try again in a moment.");
      const blob = await res.blob();
      const type = blob.type || "image/jpeg";
      const file = new File([blob], fileName || "photo.jpg", { type });
      const uploaded = await uploadFileDirect(file, "journal_personal");
      const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
      const entry = await createJournalEntryAction({ title: `From ${from}`, date: today, note: null, people: [], visibility: "personal" });
      if (entry.error || !entry.entryId) throw new Error(entry.error ?? "The entry didn't save.");
      const media = await attachJournalMediaAction({
        entryId: entry.entryId,
        mediaType: type.startsWith("video/") ? "video" : "photo",
        takenAt: new Date().toISOString(),
        uploaded,
        visibility: "personal",
      });
      if (media.error) throw new Error(media.error);
      setState("saved");
    } catch (e) {
      setState("error");
      setMessage(e instanceof Error ? e.message : "That didn't save.");
    }
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.625rem", justifyContent: "center", color: "#fff" }}>
      <button type="button" className="btn btn-secondary" disabled={state === "saving" || state === "saved"} onClick={() => void save()}>
        {state === "saving" ? "Saving…" : state === "saved" ? "Saved to Journal · Mine" : "Save to Journal"}
      </button>
      {message && <span style={{ fontSize: "0.8125rem" }}>{message}</span>}
    </div>
  );
}
