"use client";

import { listen, speechSupported } from "@/lib/speech";

/** A voice note's transcript, written on the phone while it records
 * (29 September). The browser's own speech recognition, the same as Ask
 * Kin's microphone -- best effort, and simply absent where the browser has
 * none. Start it when recording starts; `finish()` stops it and hands back
 * whatever it heard. */
export function startTranscript(): { finish: () => string } {
  let heard = "";
  let listener: ReturnType<typeof listen> = null;
  let stopped = false;
  const begin = () => {
    if (stopped || !speechSupported()) return;
    listener = listen(
      (text) => {
        // Continuous results arrive as the whole session so far.
        if (text) heard = text;
      },
      () => {},
      () => {
        // Some browsers end a session after a long pause; carry on, keeping
        // what was already heard in front of what comes next.
        if (!stopped) {
          const kept = heard;
          listener = listen(
            (text) => {
              if (text) heard = kept ? `${kept} ${text}` : text;
            },
            () => {},
            () => {},
            true,
          );
        }
      },
      true,
    );
  };
  begin();
  return {
    finish: () => {
      stopped = true;
      listener?.stop();
      return heard.trim().slice(0, 5000);
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
