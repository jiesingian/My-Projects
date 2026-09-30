"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { toast } from "@/components/toast";
import { LOOKS, TRACKS, planVideo, type LookId, type TrackId } from "@/lib/video-maker/timeline";
import { FRAME, Stage, loadPhoto, pickRecordingType, posterOf, record, RecordingHidden, type LoadedPhoto, type Shape } from "@/lib/video-maker/render";
import { renderTrack } from "@/lib/video-maker/music";
import { saveToPhone } from "@/lib/video-maker/save";
import { uploadFileDirect } from "@/lib/upload-client";
import { createClient } from "@/lib/supabase/client";
import { saveEntryVideoAction } from "@/lib/actions/journal-video";

type Photo = { id: string | null; url: string };

type Step = "photos" | "style" | "making" | "done";

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

/** Make a video from an entry's photos -- the "same-day edit" a wedding
 * shows at the reception, for a family's ordinary days (Jonathan, 30
 * September). Three steps, full screen:
 *
 * 1. Photos: all of the entry's, in its order, to begin with. Tap one to
 *    leave it out; move the rest earlier or later.
 * 2. Look: Warm, Classic or Lively, a tune or none, wide or tall -- with the
 *    video playing as it will be made, so choosing is watching.
 * 3. Making: recorded in real time on the phone (lib/video-maker/render.ts),
 *    with the progress, and Cancel. Then it can be kept as the entry's cover,
 *    saved to the phone, or made again.
 *
 * Nothing leaves the phone except the finished video, to the same storage
 * the entry's photos are in and counted against the same allowance. */
export function VideoMaker({
  entryId,
  title,
  dateLabel,
  signature,
  personal,
  photos,
  hasVideo,
  onClose,
}: {
  entryId: string;
  title: string;
  dateLabel: string;
  signature: string;
  personal: boolean;
  photos: Photo[];
  hasVideo: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const headingId = useId();
  const [step, setStep] = useState<Step>("photos");
  const [order, setOrder] = useState<string[]>(() => photos.map((p) => p.url));
  const [look, setLook] = useState<LookId>("warm");
  const [track, setTrack] = useState<TrackId>(LOOKS.warm.track);
  const [shape, setShape] = useState<Shape>("wide");
  const [muted, setMuted] = useState(false);
  const [loading, setLoading] = useState<{ done: number; of: number } | null>(null);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<{ blob: Blob; url: string; poster: Blob; mimeType: string; duration: number; shape: Shape; look: LookId } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const loaded = useRef(new Map<string, LoadedPhoto>());
  const audioRef = useRef<AudioContext | null>(null);
  const musicRef = useRef<{ key: string; buffer: AudioBuffer | null } | null>(null);
  const previewRef = useRef<{ raf: number; source: AudioBufferSourceNode | null; gain: GainNode | null } | null>(null);
  const mutedRef = useRef(muted);
  const abortRef = useRef<AbortController | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  const recordingType = useMemo(() => (typeof window === "undefined" ? null : pickRecordingType()), []);
  const plan = useMemo(() => planVideo(order.length, look, track), [order.length, look, track]);
  const frame = FRAME[shape];

  // The page behind stays put, focus comes in, and goes back out on close.
  useLayoutEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => {
      document.body.style.overflow = overflow;
      before?.focus?.();
    };
  }, []);

  const stopPreview = useCallback(() => {
    const p = previewRef.current;
    if (!p) return;
    cancelAnimationFrame(p.raf);
    try {
      p.source?.stop();
    } catch {}
    previewRef.current = null;
  }, []);

  // Everything is let go on close: the preview, a recording in progress,
  // the audio, and the finished video's object URL.
  useEffect(
    () => () => {
      stopPreview();
      abortRef.current?.abort();
      audioRef.current?.close().catch(() => {});
      const nav = navigator as Navigator & { audioSession?: { type: string } };
      if (nav.audioSession) nav.audioSession.type = "auto";
    },
    [stopPreview],
  );
  useEffect(() => () => void (result && URL.revokeObjectURL(result.url)), [result]);

  const close = useCallback(() => {
    if (step === "making") abortRef.current?.abort();
    onClose();
  }, [step, onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);

  /** The audio has to be started from a tap on an iPhone, so it is made here,
   * inside the tap that moves on from choosing photos. "playback" lets the
   * preview be heard with the ring switch on silent, as a video app would. */
  function ensureAudio(): AudioContext | null {
    if (!audioRef.current) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      audioRef.current = new Ctor();
      const nav = navigator as Navigator & { audioSession?: { type: string } };
      if (nav.audioSession) nav.audioSession.type = "playback";
    }
    audioRef.current.resume().catch(() => {});
    return audioRef.current;
  }

  async function musicFor(trackId: TrackId, seconds: number) {
    const key = `${trackId}:${seconds}`;
    if (musicRef.current?.key === key) return musicRef.current.buffer;
    const buffer = await renderTrack(trackId, seconds).catch(() => null);
    musicRef.current = { key, buffer };
    return buffer;
  }

  async function loadChosen(signal: AbortSignal): Promise<LoadedPhoto[]> {
    const urls = order.slice(0, plan.used);
    const missing = urls.filter((u) => !loaded.current.has(u));
    let done = urls.length - missing.length;
    if (missing.length) setLoading({ done, of: urls.length });
    const maxSide = Math.round(Math.max(frame.w, frame.h) * 1.25);
    // Three at a time: quicker than one by one, and gentle on a phone's memory.
    const queue = [...missing];
    const failed: string[] = [];
    await Promise.all(
      Array.from({ length: Math.min(3, queue.length) }, async () => {
        while (queue.length) {
          const url = queue.shift()!;
          try {
            loaded.current.set(url, await loadPhoto(url, maxSide, signal));
          } catch (e) {
            if (signal.aborted) throw e;
            failed.push(url);
          }
          done += 1;
          setLoading({ done, of: urls.length });
        }
      }),
    );
    setLoading(null);
    if (failed.length) {
      setOrder((o) => o.filter((u) => !failed.includes(u)));
      // Said in the maker, not as a toast: the maker covers the screen.
      setError(failed.length === 1 ? "One photo couldn't be loaded, so it's left out." : `${failed.length} photos couldn't be loaded, so they're left out.`);
    }
    return urls.filter((u) => !failed.includes(u)).map((u) => loaded.current.get(u)!);
  }

  // The preview: the plan drawn on a loop, with its music. Restarted whenever
  // a choice changes it.
  const startPreview = useCallback(
    async (signal: AbortSignal) => {
      stopPreview();
      const photosNow = await loadChosen(signal);
      const canvas = canvasRef.current;
      if (signal.aborted || !canvas || photosNow.length === 0) return;
      const planNow = planVideo(photosNow.length, look, track);
      canvas.width = frame.w;
      canvas.height = frame.h;
      const stage = new Stage(canvas, planNow, photosNow, { title, date: dateLabel, signature });
      const audio = audioRef.current;
      const buffer = await musicFor(track, planNow.duration);
      if (signal.aborted) return;
      let source: AudioBufferSourceNode | null = null;
      let gain: GainNode | null = null;
      if (audio && buffer) {
        source = audio.createBufferSource();
        source.buffer = buffer;
        source.loop = true;
        gain = audio.createGain();
        gain.gain.value = mutedRef.current ? 0 : 1;
        source.connect(gain).connect(audio.destination);
      }
      const t0 = (audio ? audio.currentTime : performance.now() / 1000) + 0.05;
      source?.start(t0);
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const tick = () => {
        const now = (audio ? audio.currentTime : performance.now() / 1000) - t0;
        stage.draw(Math.max(0, now) % planNow.duration);
        if (previewRef.current) previewRef.current.raf = requestAnimationFrame(tick);
      };
      previewRef.current = { raf: 0, source, gain };
      // With reduced motion the preview holds on the first photo instead of
      // playing; the music still plays, and the video itself is unchanged.
      if (reduce) stage.draw(planNow.segments[1]?.start + planNow.look.fade + 0.2 || 1.6);
      else previewRef.current.raf = requestAnimationFrame(tick);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [look, track, shape, order, title, dateLabel, signature],
  );

  // Muting turns the preview's music down where it is, without starting over.
  useEffect(() => {
    mutedRef.current = muted;
    const g = previewRef.current?.gain;
    if (g && audioRef.current) g.gain.setTargetAtTime(muted ? 0 : 1, audioRef.current.currentTime, 0.05);
  }, [muted]);

  useEffect(() => {
    if (step !== "style") return;
    const ac = new AbortController();
    startPreview(ac.signal).catch((e) => {
      if (!ac.signal.aborted) setError(e instanceof Error ? e.message : "The preview couldn't start.");
    });
    return () => {
      ac.abort();
      stopPreview();
    };
  }, [step, startPreview, stopPreview]);

  async function make() {
    if (!recordingType) return;
    stopPreview();
    setError(null);
    setProgress(0);
    setStep("making");
    const audio = ensureAudio();
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      const photosNow = await loadChosen(ac.signal);
      const canvas = canvasRef.current!;
      const planNow = planVideo(photosNow.length, look, track);
      canvas.width = frame.w;
      canvas.height = frame.h;
      const stage = new Stage(canvas, planNow, photosNow, { title, date: dateLabel, signature });
      const music = await musicFor(track, planNow.duration);
      const blob = await record({ target: canvas, stage, plan: planNow, music, audio, mimeType: recordingType, signal: ac.signal, onProgress: setProgress });
      const poster = await posterOf(stage, canvas, planNow);
      setResult({ blob, url: URL.createObjectURL(blob), poster, mimeType: blob.type || recordingType.split(";")[0], duration: planNow.duration, shape, look });
      setStep("done");
    } catch (e) {
      if (ac.signal.aborted && !(e instanceof RecordingHidden)) {
        setStep("style");
        return;
      }
      setError(e instanceof Error ? e.message : "The video couldn't be made.");
      setStep("style");
    } finally {
      abortRef.current = null;
    }
  }

  async function keep() {
    if (!result) return;
    setSaving(true);
    setError(null);
    const ext = result.mimeType.includes("mp4") ? "mp4" : "webm";
    const stem = `kin-video-${Date.now()}`;
    const uploaded: string[] = [];
    try {
      const video = await uploadFileDirect(new File([result.blob], `${stem}.${ext}`, { type: result.mimeType }), "journal_video", undefined, { personal });
      if (video.provider !== "supabase") throw new Error("The video couldn't be stored.");
      uploaded.push(video.storagePath);
      const poster = await uploadFileDirect(new File([result.poster], `${stem}-poster.jpg`, { type: "image/jpeg" }), "journal_video", undefined, { personal });
      if (poster.provider !== "supabase") throw new Error("The video couldn't be stored.");
      uploaded.push(poster.storagePath);
      const saved = await saveEntryVideoAction({
        entryId,
        videoPath: video.storagePath,
        posterPath: poster.storagePath,
        mimeType: result.mimeType,
        width: FRAME[result.shape].w,
        height: FRAME[result.shape].h,
        durationSeconds: result.duration,
        look: result.look,
      });
      if (saved.error) throw new Error(saved.error);
      toast.success(hasVideo ? "New video saved. It's the entry's cover now." : "Video saved. It's the entry's cover now.");
      router.refresh();
      onClose();
    } catch (e) {
      // Files that got up but were never recorded would sit in storage,
      // counted and unreachable; take them back down.
      if (uploaded.length) await createClient().storage.from("journal").remove(uploaded).catch(() => {});
      setError(e instanceof Error ? e.message : "The video couldn't be saved.");
      setSaving(false);
    }
  }

  const chosen = order.map((url) => photos.find((p) => p.url === url)!).filter(Boolean);
  const move = (i: number, by: number) =>
    setOrder((o) => {
      const j = i + by;
      if (j < 0 || j >= o.length) return o;
      const next = [...o];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  const toggle = (url: string) => setOrder((o) => (o.includes(url) ? o.filter((u) => u !== url) : [...o, url]));

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="kin-vm" role="dialog" aria-modal="true" aria-labelledby={headingId}>
      <header className="kin-vm-head">
        <button ref={closeRef} type="button" className="btn btn-ghost btn-icon" onClick={close} aria-label="Close">
          <Icon name="x" size={20} />
        </button>
        <div id={headingId} className="kin-vm-title">
          {step === "photos" ? "Choose photos" : step === "style" ? "Pick a look" : step === "making" ? "Making your video" : "Your video"}
        </div>
        <div className="kin-vm-steps" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <span key={i} data-on={{ photos: 0, style: 1, making: 2, done: 2 }[step] >= i} />
          ))}
        </div>
      </header>

      {!recordingType && (
        <div className="kin-vm-body">
          <p className="kin-vm-note">
            This browser can&apos;t make videos. On an iPhone, update iOS; on a computer, open Kin in Chrome, Safari or Edge.
          </p>
        </div>
      )}

      {recordingType && step === "photos" && (
        <>
          <div className="kin-vm-body">
            <p className="kin-vm-note">
              Tap a photo to leave it out or put it back. The numbers are the order; move them in the row below.
            </p>
            <div className="kin-vm-grid">
              {photos.map((p, i) => {
                const n = order.indexOf(p.url);
                return (
                  <button
                    key={p.id ?? p.url}
                    type="button"
                    className="kin-vm-pick"
                    data-on={n >= 0}
                    aria-pressed={n >= 0}
                    aria-label={n >= 0 ? `Photo ${i + 1}, number ${n + 1} in the video` : `Photo ${i + 1}, left out`}
                    onClick={() => toggle(p.url)}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.url} alt="" />
                    <span className="kin-vm-badge">{n >= 0 ? n + 1 : ""}</span>
                  </button>
                );
              })}
            </div>
            {chosen.length > 1 && (
              <>
                <div className="kin-eyebrow" style={{ margin: "1.125rem 0 0.5rem" }}>
                  Order
                </div>
                <ol className="kin-vm-order">
                  {chosen.map((p, i) => (
                    <li key={p.url}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p.url} alt="" />
                      <span className="kin-vm-order-n">{i + 1}</span>
                      <span className="kin-vm-order-moves">
                        <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move photo ${i + 1} earlier`}>
                          ‹
                        </button>
                        <button type="button" onClick={() => move(i, 1)} disabled={i === chosen.length - 1} aria-label={`Move photo ${i + 1} later`}>
                          ›
                        </button>
                      </span>
                    </li>
                  ))}
                </ol>
              </>
            )}
          </div>
          <footer className="kin-vm-foot">
            <span className="kin-vm-meta">
              {order.length === 0 ? "Choose at least one photo" : `${order.length} photo${order.length === 1 ? "" : "s"} · about ${clock(plan.duration)}`}
            </span>
            <button
              type="button"
              className="btn btn-primary"
              disabled={order.length === 0}
              onClick={() => {
                ensureAudio();
                setStep("style");
              }}
            >
              Next
            </button>
          </footer>
        </>
      )}

      {recordingType && (step === "style" || step === "making") && (
        <>
          <div className="kin-vm-body">
            <div className="kin-vm-stage" data-shape={shape}>
              <canvas ref={canvasRef} width={frame.w} height={frame.h} aria-label={step === "making" ? "The video being made" : "Preview of the video"} />
              {loading && (
                <div className="kin-vm-loading" role="status">
                  Getting photos ready · {loading.done} of {loading.of}
                </div>
              )}
              {step === "style" && (
                <button type="button" className="kin-vm-mute" onClick={() => setMuted((m) => !m)} aria-label={muted ? "Play the music" : "Mute the preview"} aria-pressed={muted}>
                  {muted ? "Sound off" : "Sound on"}
                </button>
              )}
            </div>

            {step === "making" ? (
              <div className="kin-vm-making" role="status" aria-live="polite">
                <div className="kin-vm-bar">
                  <span style={{ transform: `scaleX(${progress})` }} />
                </div>
                <div className="kin-vm-meta">
                  {clock(progress * plan.duration)} of {clock(plan.duration)} · Keep Kin open until it&apos;s done
                </div>
              </div>
            ) : (
              <>
                {error && (
                  <p className="kin-vm-error" role="alert">
                    {error}
                  </p>
                )}
                <div className="kin-eyebrow" style={{ margin: "1rem 0 0.5rem" }}>
                  Look
                </div>
                <div className="kin-vm-looks">
                  {Object.values(LOOKS).map((l) => (
                    <button
                      key={l.id}
                      type="button"
                      className="kin-vm-look"
                      data-look={l.id}
                      aria-pressed={look === l.id}
                      onClick={() => {
                        setLook(l.id);
                        if (track !== "none") setTrack(l.track);
                      }}
                    >
                      <strong>{l.name}</strong>
                      <span>{l.line}</span>
                    </button>
                  ))}
                </div>
                <div className="kin-eyebrow" style={{ margin: "1rem 0 0.5rem" }}>
                  Music
                </div>
                <div className="kin-vm-chips">
                  {Object.values(TRACKS).map((t) => (
                    <button key={t.id} type="button" className="chip" data-active={track === t.id} aria-pressed={track === t.id} onClick={() => setTrack(t.id)}>
                      {t.name}
                    </button>
                  ))}
                </div>
                <div className="kin-eyebrow" style={{ margin: "1rem 0 0.5rem" }}>
                  Shape
                </div>
                <div className="kin-vm-chips">
                  {(["wide", "tall"] as const).map((s) => (
                    <button key={s} type="button" className="chip" data-active={shape === s} aria-pressed={shape === s} onClick={() => setShape(s)}>
                      {s === "wide" ? "Wide · for the journal and TV" : "Tall · for phones and stories"}
                    </button>
                  ))}
                </div>
                {plan.dropped > 0 && (
                  <p className="kin-vm-note" style={{ marginTop: "0.875rem" }}>
                    The first {plan.used} photos fit in a minute; the other {plan.dropped} are left out.
                  </p>
                )}
              </>
            )}
          </div>
          <footer className="kin-vm-foot">
            {step === "making" ? (
              <>
                <span className="kin-vm-meta">{Math.round(progress * 100)}%</span>
                <button type="button" className="btn btn-secondary" onClick={() => abortRef.current?.abort()}>
                  Cancel
                </button>
              </>
            ) : (
              <>
                <button type="button" className="btn btn-ghost" onClick={() => setStep("photos")}>
                  Back
                </button>
                <span className="kin-vm-meta">
                  {plan.used} photo{plan.used === 1 ? "" : "s"} · {clock(plan.duration)}
                </span>
                <button type="button" className="btn btn-primary" onClick={make} disabled={!!loading}>
                  Make video
                </button>
              </>
            )}
          </footer>
        </>
      )}

      {step === "done" && result && (
        <>
          <div className="kin-vm-body">
            <div className="kin-vm-stage" data-shape={result.shape}>
              <video src={result.url} controls playsInline autoPlay aria-label={`Video of ${title}`} />
            </div>
            <p className="kin-vm-note" style={{ marginTop: "0.75rem" }}>
              {clock(result.duration)} · {(result.blob.size / 1024 / 1024).toFixed(1)} MB. Keep it and it becomes the entry&apos;s cover, for everyone who can see the entry.
            </p>
            {error && (
              <p className="kin-vm-error" role="alert">
                {error}
              </p>
            )}
            <button type="button" className="btn btn-ghost" style={{ paddingLeft: 0 }} onClick={() => setStep("style")} disabled={saving}>
              Change the look and make it again
            </button>
          </div>
          <footer className="kin-vm-foot">
            <button
              type="button"
              className="btn btn-secondary"
              disabled={saving}
              onClick={() => saveToPhone(result.blob, `${title || "Kin video"}.${result.mimeType.includes("mp4") ? "mp4" : "webm"}`, title).catch(() => {})}
            >
              <Icon name="download" size={16} /> Save
            </button>
            <button type="button" className="btn btn-primary" onClick={keep} disabled={saving}>
              {saving ? "Saving…" : hasVideo ? "Replace cover" : "Keep as cover"}
            </button>
          </footer>
        </>
      )}
    </div>,
    document.body,
  );
}
