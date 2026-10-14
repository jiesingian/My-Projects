"use client";

import { listen, speechSupported } from "@/lib/speech";

/** A voice note's transcript, written on the phone while it records
 * (29 September). The browser's own speech recognition, the same as Ask
 * Kin's microphone -- best effort, and simply absent where the browser has
 * none. Start it when recording starts; `finish()` stops it and hands back
 * whatever it heard, up to `maxChars` (a chat voice note's 5,000 unless the
 * caller keeps more -- a story on the tree runs to twenty minutes). */
export function startTranscript(maxChars = 5000): { finish: () => string } {
  // A phone that has already lost a recording to this keeps its sound from
  // now on (rememberTranscriptConflict): no transcript, never a silent note.
  if (transcriptConflicts()) return { finish: () => "" };
  let heard = "";
  let listener: ReturnType<typeof listen> = null;
  let stopped = false;
  // Some browsers end a session after every long pause, and a story told by
  // Lola has many. Each new session carries on after what was already
  // heard. Bounded, so a browser that ends every session at once (a refused
  // microphone) does not start one after another for twenty minutes.
  let restarts = 0;
  let quickEnds = 0;
  const begin = () => {
    if (stopped || !speechSupported()) return;
    const kept = heard;
    const startedAt = Date.now();
    listener = listen(
      (text) => {
        // Continuous results arrive as the whole session so far.
        if (text) heard = kept ? `${kept} ${text}` : text;
      },
      () => {},
      () => {
        if (stopped) return;
        quickEnds = Date.now() - startedAt < 1000 ? quickEnds + 1 : 0;
        if (quickEnds >= 3 || ++restarts > 60) return;
        begin();
      },
      true,
    );
  };
  begin();
  return {
    finish: () => {
      stopped = true;
      listener?.stop();
      return heard.trim().slice(0, maxChars);
    },
  };
}

/** Did the recording come out silent? On some phones speech recognition and
 * recording cannot share the microphone, and the recording is what loses.
 * Checked by decoding the audio and looking for any real sound in it; if the
 * check itself cannot run, the note is assumed fine. */
export async function recordingIsSilent(blob: Blob): Promise<boolean> {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return false;
    const ctx = new Ctx();
    const audio = await ctx.decodeAudioData(await blob.arrayBuffer());
    let peak = 0;
    for (let c = 0; c < audio.numberOfChannels; c++) {
      const data = audio.getChannelData(c);
      for (let i = 0; i < data.length; i += 64) peak = Math.max(peak, Math.abs(data[i]));
    }
    void ctx.close();
    return peak < 0.01;
  } catch {
    return false;
  }
}

const CONFLICT_KEY = "kin-voice-no-transcript";

/** Has this device shown that it cannot transcribe and record at once?
 * (30 September: Janine's iPhone.) Remembered on the device, not the
 * account -- it is the phone's limit, not the person's choice. */
export function transcriptConflicts(): boolean {
  try {
    return window.localStorage.getItem(CONFLICT_KEY) === "1";
  } catch {
    return false;
  }
}

/** Remember it, so the next voice note on this phone skips the transcript
 * and keeps the sound. */
export function rememberTranscriptConflict(): void {
  try {
    window.localStorage.setItem(CONFLICT_KEY, "1");
  } catch {
    /* private mode: it will simply be found out again next time */
  }
}

/** What to tell the person the one time it happens. */
export const CONFLICT_MESSAGE =
  "This phone can't write down words and record at the same time, so your words are in the message box to send as text. From now on, voice notes on this phone keep the sound, without a transcript.";
