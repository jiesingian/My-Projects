/** Speech in and speech out, from the browser's own engine.
 *
 * WHAT THIS IS NOT
 *
 * It is not a wake word and it is not always listening. The microphone opens
 * when somebody presses the button and closes when the sentence ends or they
 * press it again. A family operating system that listened continuously would
 * be a different product, and not one anybody asked for.
 *
 * WHERE THE AUDIO GOES, WHICH IS WORTH KNOWING
 *
 * SpeechRecognition is the browser's, not Kin's -- and in Chrome the audio is
 * sent to Google's servers to be transcribed. Safari does it on the device.
 * Either way Kin never receives audio, only the text the browser hands back,
 * but "the browser did it" is not the same as "nothing left the room", and
 * the interface says so before the first use rather than after.
 *
 * Firefox has no SpeechRecognition at all. That is a missing feature, not an
 * error, so the button is simply absent there.
 */

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
};

type RecognitionCtor = new () => SpeechRecognitionLike;

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  // Safari and Chrome still only expose the prefixed name on some versions.
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function speechSupported(): boolean {
  return recognitionCtor() !== null;
}

export type Listener = {
  stop(): void;
};

/** Starts listening. `onText` fires with the interim transcript as it is
 * revised and once more with `final: true`, so the caller can show the words
 * appearing and only act when the sentence has settled. */
export function listen(
  onText: (text: string, final: boolean) => void,
  onError: (message: string) => void,
  onEnd: () => void,
): Listener | null {
  const Ctor = recognitionCtor();
  if (!Ctor) return null;

  const recognition = new Ctor();
  // Undefined language lets the browser follow the device, which is right for
  // a household that may not speak the page's language at home.
  recognition.lang = typeof navigator !== "undefined" ? navigator.language : "en-US";
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;

  recognition.onresult = (event) => {
    const results = Array.from({ length: event.results.length }, (_, i) => event.results[i]);
    const text = results.map((r) => r[0]?.transcript ?? "").join("");
    const final = results.some((r) => r.isFinal);
    onText(text.trim(), final);
  };

  recognition.onerror = (event) => {
    // "aborted" and "no-speech" are somebody changing their mind or a quiet
    // room, not failures worth a red message.
    if (event.error === "aborted" || event.error === "no-speech") return;
    onError(
      event.error === "not-allowed"
        ? "Kin needs permission to use the microphone. Allow it in your browser settings."
        : "That didn't come through. Try again, or type it.",
    );
  };

  recognition.onend = onEnd;

  try {
    recognition.start();
  } catch {
    return null;
  }

  return {
    stop() {
      try {
        recognition.stop();
      } catch {
        /* already stopped */
      }
    },
  };
}

export function speechOutSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

/** Reads a reply aloud. Anything already speaking is cancelled first, so a
 * quick second question does not queue behind the answer to the first. */
export function speak(text: string): void {
  if (!speechOutSupported()) return;
  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = navigator.language;
    utterance.rate = 1.02;
    window.speechSynthesis.speak(utterance);
  } catch {
    /* A browser that refuses to speak is not an error the household needs. */
  }
}

export function stopSpeaking(): void {
  if (!speechOutSupported()) return;
  try {
    window.speechSynthesis.cancel();
  } catch {
    /* nothing to cancel */
  }
}
