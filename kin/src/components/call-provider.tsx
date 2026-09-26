"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { createClient } from "@/lib/supabase/client";
import { Avatar } from "@/components/avatar";
import { Icon, type IconName } from "@/components/icons";
import { toast } from "@/components/toast";
import { initials } from "@/lib/format";
import { callClock, endLine, ended, forThisDevice, onSignal, RING_SECONDS, type CallState, type EndReason, type Signal } from "@/lib/calls";
import { iceServersAction, missedCallAction, ringAction } from "@/lib/actions/calls";

/** Voice and video calls, anywhere in the app (26 September).
 *
 * Mounted once in the app layout, so a call rings whichever page someone is
 * on. The setting-up travels over the household's private call channel
 * (lib/calls.ts decides what each signal means for this device); the call
 * itself is WebRTC, phone to phone, and never passes through Kin. */

export type CallMember = { id: string; name: string; photoUrl: string | null; callable: boolean };

type Ctx = { start: (to: string, video: boolean) => void; members: CallMember[]; me: string; busy: boolean };
const CallContext = createContext<Ctx | null>(null);
export const useCalls = () => useContext(CallContext);

type Live = Extract<CallState, { phase: "connecting" | "active" }>;

export function CallProvider({ familyId, me, members, children }: { familyId: string; me: string; members: CallMember[]; children: React.ReactNode }) {
  const [device] = useState(() => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Math.random())));
  const [call, setCallState] = useState<CallState>({ phase: "idle" });
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [facing, setFacing] = useState<"user" | "environment">("user");
  const [now, setNow] = useState(0);

  const stateRef = useRef<CallState>(call);
  const channel = useRef<ReturnType<ReturnType<typeof createClient>["channel"]> | null>(null);
  const pc = useRef<RTCPeerConnection | null>(null);
  const local = useRef<MediaStream | null>(null);
  const remote = useRef<MediaStream | null>(null);
  const pendingIce = useRef<RTCIceCandidateInit[]>([]);
  const ice = useRef<RTCIceServer[] | null>(null);
  const timers = useRef<number[]>([]);
  const remoteVideo = useRef<HTMLVideoElement | null>(null);
  const remoteAudio = useRef<HTMLAudioElement | null>(null);
  const localVideo = useRef<HTMLVideoElement | null>(null);
  const ringtone = useRef<{ stop: () => void } | null>(null);

  const send = useCallback((sig: Signal) => {
    void channel.current?.send({ type: "broadcast", event: "signal", payload: sig });
  }, []);

  const clearTimers = () => {
    for (const t of timers.current) {
      window.clearTimeout(t);
      window.clearInterval(t);
    }
    timers.current = [];
  };

  const teardown = useCallback(() => {
    clearTimers();
    ringtone.current?.stop();
    ringtone.current = null;
    pc.current?.close();
    pc.current = null;
    for (const t of local.current?.getTracks() ?? []) t.stop();
    local.current = null;
    remote.current = null;
    pendingIce.current = [];
  }, []);

  const setCall = useCallback(
    (next: CallState) => {
      const prev = stateRef.current;
      stateRef.current = next;
      setCallState(next);
      if (prev.phase === "incoming" && next.phase !== "incoming") {
        ringtone.current?.stop();
        ringtone.current = null;
      }
      if (next.phase === "ended") {
        teardown();
        setMuted(false);
        setCameraOff(false);
        setFacing("user");
        // The line saying how it ended stays a moment, then goes.
        const t = window.setTimeout(() => {
          if (stateRef.current === next) {
            stateRef.current = { phase: "idle" };
            setCallState({ phase: "idle" });
          }
        }, next.reason === "failed" ? 7000 : 2600);
        timers.current.push(t);
      }
    },
    [teardown],
  );

  const end = useCallback((reason: EndReason) => {
    const s = stateRef.current;
    if (s.phase === "idle" || s.phase === "ended") return;
    setCall(ended(s, reason));
  }, [setCall]);

  // ── media ────────────────────────────────────────────────────────────────
  const getMedia = async (video: boolean) => {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error("This browser can't make calls.");
    try {
      return await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: video ? { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } } : false });
    } catch {
      throw new Error(video ? "Kin needs the camera and microphone for a video call. They can be allowed in the browser's site settings." : "Kin needs the microphone for a call. It can be allowed in the browser's site settings.");
    }
  };

  const attach = useCallback(() => {
    if (localVideo.current && local.current && localVideo.current.srcObject !== local.current) localVideo.current.srcObject = local.current;
    if (remote.current) {
      if (remoteVideo.current && remoteVideo.current.srcObject !== remote.current) remoteVideo.current.srcObject = remote.current;
      if (remoteAudio.current && remoteAudio.current.srcObject !== remote.current) remoteAudio.current.srcObject = remote.current;
    }
  }, []);

  // ── the peer connection ──────────────────────────────────────────────────
  const newPeer = useCallback(
    async (s: Live) => {
      ice.current ??= await iceServersAction().catch(() => [{ urls: "stun:stun.l.google.com:19302" }]);
      const conn = new RTCPeerConnection({ iceServers: ice.current });
      pc.current = conn;
      for (const track of local.current?.getTracks() ?? []) conn.addTrack(track, local.current!);
      conn.onicecandidate = (e) => send({ t: "ice", call: s.call, fromDevice: device, toDevice: s.peerDevice, candidate: e.candidate ? e.candidate.toJSON() : null });
      conn.ontrack = (e) => {
        remote.current = e.streams[0] ?? new MediaStream([e.track]);
        attach();
      };
      // Both, because Safari has been slow to report connectionState.
      const onState = () => {
        const now = stateRef.current;
        if (now.phase !== "connecting" && now.phase !== "active") return;
        const up = conn.connectionState === "connected" || conn.iceConnectionState === "connected" || conn.iceConnectionState === "completed";
        const failed = conn.connectionState === "failed" || conn.iceConnectionState === "failed";
        const st = failed ? "failed" : up ? "connected" : conn.connectionState === "disconnected" || conn.iceConnectionState === "disconnected" ? "disconnected" : "waiting";
        if (st === "connected" && now.phase === "connecting") setCall({ ...now, phase: "active", startedAt: Date.now() });
        if (st === "failed") {
          send({ t: "hangup", call: now.call, from: me });
          end("failed");
        }
        if (st === "disconnected") {
          // Often a moment's blip on a phone switching networks; give it a
          // few seconds before calling it over.
          const t = window.setTimeout(() => {
            if (pc.current === conn && (conn.connectionState === "disconnected" || conn.iceConnectionState === "disconnected")) {
              send({ t: "hangup", call: now.call, from: me });
              end("hung-up");
            }
          }, 8000);
          timers.current.push(t);
        }
      };
      conn.onconnectionstatechange = onState;
      conn.oniceconnectionstatechange = onState;
      // No way through at all within this long: say so rather than spin.
      timers.current.push(
        window.setTimeout(() => {
          if (pc.current === conn && stateRef.current.phase === "connecting") {
            send({ t: "hangup", call: s.call, from: me });
            end("failed");
          }
        }, 25_000),
      );
      return conn;
    },
    [attach, device, end, me, send, setCall],
  );

  const flushIce = async (conn: RTCPeerConnection) => {
    for (const c of pendingIce.current.splice(0)) await conn.addIceCandidate(c).catch(() => {});
  };

  const makeOffer = useCallback(
    async (s: Live) => {
      const conn = await newPeer(s);
      const offer = await conn.createOffer();
      await conn.setLocalDescription(offer);
      send({ t: "offer", call: s.call, fromDevice: device, toDevice: s.peerDevice, sdp: offer.sdp ?? "" });
    },
    [device, newPeer, send],
  );

  const onRtc = useCallback(
    async (sig: Extract<Signal, { t: "offer" | "answer" | "ice" }>) => {
      const s = stateRef.current;
      if (s.phase !== "connecting" && s.phase !== "active") return;
      try {
        if (sig.t === "offer") {
          const conn = pc.current ?? (await newPeer(s));
          await conn.setRemoteDescription({ type: "offer", sdp: sig.sdp });
          await flushIce(conn);
          const answer = await conn.createAnswer();
          await conn.setLocalDescription(answer);
          send({ t: "answer", call: s.call, fromDevice: device, toDevice: s.peerDevice, sdp: answer.sdp ?? "" });
        } else if (sig.t === "answer") {
          if (!pc.current || pc.current.signalingState !== "have-local-offer") return;
          await pc.current.setRemoteDescription({ type: "answer", sdp: sig.sdp });
          await flushIce(pc.current);
        } else if (sig.candidate) {
          if (pc.current?.remoteDescription) await pc.current.addIceCandidate(sig.candidate).catch(() => {});
          else pendingIce.current.push(sig.candidate);
        }
      } catch {
        send({ t: "hangup", call: s.call, from: me });
        end("failed");
      }
    },
    [device, end, me, newPeer, send],
  );

  // ── the household's call channel ─────────────────────────────────────────
  const handle = useCallback(
    (sig: Signal) => {
      const s = stateRef.current;
      const who = { id: me, device };
      if (forThisDevice(s, sig, who)) {
        void onRtc(sig as Extract<Signal, { t: "offer" | "answer" | "ice" }>);
        return;
      }
      const step = onSignal(s, sig, who);
      if (step.reply) send(step.reply);
      if (step.state !== s) {
        setCall(step.state);
        if (step.state.phase === "incoming") {
          ringtone.current = startRingtone();
          // Nobody answered and the caller never said: stop ringing anyway.
          timers.current.push(window.setTimeout(() => stateRef.current === step.state && end("missed"), (RING_SECONDS + 5) * 1000));
        }
      }
      if (step.makeOffer && step.state.phase === "connecting") void makeOffer(step.state).catch(() => end("failed"));
    },
    [device, end, makeOffer, me, onRtc, send, setCall],
  );
  const handleRef = useRef(handle);
  useEffect(() => {
    handleRef.current = handle;
  }, [handle]);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    let ch: ReturnType<typeof supabase.channel> | null = null;
    void (async () => {
      // A private channel checks the member's login against the household's
      // policy (20260926090000_call_signalling.sql), so it needs the token.
      await supabase.realtime.setAuth().catch(() => {});
      if (cancelled) return;
      ch = supabase
        .channel(`call:${familyId}`, { config: { private: true, broadcast: { self: false } } })
        .on("broadcast", { event: "signal" }, ({ payload }) => handleRef.current(payload as Signal))
        .subscribe();
      channel.current = ch;
    })();
    return () => {
      cancelled = true;
      channel.current = null;
      if (ch) void supabase.removeChannel(ch);
    };
  }, [familyId]);

  // Leaving the page mid-call tells the other side rather than leaving them
  // looking at a frozen picture.
  useEffect(() => {
    const bye = () => {
      const s = stateRef.current;
      if (s.phase === "outgoing") send({ t: "cancel", call: s.call, from: me });
      else if (s.phase === "connecting" || s.phase === "active") send({ t: "hangup", call: s.call, from: me });
    };
    window.addEventListener("pagehide", bye);
    return () => window.removeEventListener("pagehide", bye);
  }, [me, send]);

  // The clock on an active call.
  useEffect(() => {
    if (call.phase !== "active") return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [call.phase]);

  // Streams attach to whichever video and audio elements the current screen
  // has; the screen changes shape as the call moves on.
  useEffect(() => {
    attach();
  });

  // ── what the buttons do ──────────────────────────────────────────────────
  const start = useCallback(
    async (to: string, video: boolean) => {
      if (stateRef.current.phase !== "idle" && stateRef.current.phase !== "ended") return;
      if (!channel.current) {
        toast.error("Calls aren't ready yet. Try again in a moment.");
        return;
      }
      const id = crypto.randomUUID();
      const outgoing: CallState = { phase: "outgoing", call: id, peer: to, video };
      setCall(outgoing);
      try {
        local.current = await getMedia(video);
      } catch (e) {
        setCall({ phase: "idle" });
        toast.error((e as Error).message);
        return;
      }
      if ((stateRef.current as CallState) !== outgoing) return teardown();
      attach();
      const ring = () => send({ t: "ring", call: id, from: me, fromDevice: device, to, video });
      ring();
      timers.current.push(window.setInterval(() => (stateRef.current === outgoing ? ring() : undefined), 3000));
      timers.current.push(
        window.setTimeout(() => {
          if (stateRef.current === outgoing) {
            send({ t: "cancel", call: id, from: me });
            end("no-answer");
            void missedCallAction(to, video);
          }
        }, RING_SECONDS * 1000),
      );
      void ringAction(to, video);
    },
    [attach, device, end, me, send, setCall, teardown],
  );

  const accept = async () => {
    const s = stateRef.current;
    if (s.phase !== "incoming") return;
    ringtone.current?.stop();
    void clearRingNotice(s.peer);
    try {
      local.current = await getMedia(s.video);
    } catch (e) {
      toast.error((e as Error).message);
      send({ t: "decline", call: s.call, from: me, fromDevice: device });
      setCall({ phase: "idle" });
      return;
    }
    if (stateRef.current !== s) return teardown();
    setCall({ phase: "connecting", call: s.call, peer: s.peer, peerDevice: s.peerDevice, video: s.video, role: "callee" });
    send({ t: "accept", call: s.call, from: me, fromDevice: device, toDevice: s.peerDevice });
  };

  const decline = () => {
    const s = stateRef.current;
    if (s.phase !== "incoming") return;
    send({ t: "decline", call: s.call, from: me, fromDevice: device });
    void clearRingNotice(s.peer);
    teardown();
    stateRef.current = { phase: "idle" };
    setCallState({ phase: "idle" });
  };

  const hangUp = () => {
    const s = stateRef.current;
    if (s.phase === "outgoing") {
      send({ t: "cancel", call: s.call, from: me });
      end("cancelled");
      void missedCallAction(s.peer, s.video);
    } else if (s.phase === "connecting" || s.phase === "active") {
      send({ t: "hangup", call: s.call, from: me });
      end("hung-up");
    }
  };

  const toggleMute = () => {
    const next = !muted;
    for (const t of local.current?.getAudioTracks() ?? []) t.enabled = !next;
    setMuted(next);
  };
  const toggleCamera = () => {
    const next = !cameraOff;
    for (const t of local.current?.getVideoTracks() ?? []) t.enabled = !next;
    setCameraOff(next);
  };
  const flip = async () => {
    const want = facing === "user" ? "environment" : "user";
    try {
      const fresh = await navigator.mediaDevices.getUserMedia({ video: { facingMode: want } });
      const track = fresh.getVideoTracks()[0];
      const old = local.current?.getVideoTracks()[0];
      await pc.current?.getSenders().find((x) => x.track?.kind === "video")?.replaceTrack(track);
      if (old) {
        local.current?.removeTrack(old);
        old.stop();
      }
      local.current?.addTrack(track);
      track.enabled = !cameraOff;
      if (localVideo.current) localVideo.current.srcObject = local.current;
      setFacing(want);
    } catch {
      toast.error("This phone has only the one camera Kin can use.");
    }
  };

  const peer = call.phase === "idle" ? null : members.find((m) => m.id === call.peer) ?? { id: call.peer, name: "Someone", photoUrl: null, callable: false };
  const busy = call.phase !== "idle" && call.phase !== "ended";

  return (
    <CallContext.Provider value={{ start: (to, video) => void start(to, video), members, me, busy }}>
      {children}
      {peer &&
        call.phase !== "idle" &&
        createPortal(
          <div className="kin-call" data-video={(call.video && call.phase !== "incoming") || undefined} role="dialog" aria-modal="true" aria-label={`Call with ${peer.name}`}>
            {call.video && call.phase !== "incoming" && call.phase !== "ended" && (
              <>
                <video ref={remoteVideo} className="kin-call-remote" autoPlay playsInline data-waiting={call.phase !== "active" || undefined} />
                <video ref={localVideo} className="kin-call-self" autoPlay playsInline muted data-full={call.phase !== "active" || undefined} data-mirror={facing === "user" || undefined} data-off={cameraOff || undefined} />
              </>
            )}
            {!call.video && <audio ref={remoteAudio} autoPlay />}

            <div className="kin-call-who" data-over={(call.video && call.phase === "active") || undefined}>
              {!(call.video && call.phase === "active") && <Avatar url={peer.photoUrl} initials={initials(peer.name)} label={peer.name} size={104} clickable={false} />}
              <div className="kin-call-name">{peer.name}</div>
              <div className="kin-call-status" aria-live="polite">
                {call.phase === "incoming" && (call.video ? "Video call" : "Voice call")}
                {call.phase === "outgoing" && "Calling…"}
                {call.phase === "connecting" && "Connecting…"}
                {call.phase === "active" && callClock(now - (call.startedAt ?? now))}
                {call.phase === "ended" && endLine(call.reason, peer.name.split(" ")[0])}
              </div>
            </div>

            <div className="kin-call-controls">
              {call.phase === "incoming" && (
                <>
                  <CallButton icon="phoneOff" label="Decline" tone="end" onClick={decline} />
                  <CallButton icon={call.video ? "video" : "phone"} label="Answer" tone="answer" onClick={() => void accept()} />
                </>
              )}
              {(call.phase === "outgoing" || call.phase === "connecting" || call.phase === "active") && (
                <>
                  <CallButton icon={muted ? "micOff" : "mic"} label={muted ? "Unmute" : "Mute"} pressed={muted} onClick={toggleMute} />
                  {call.video && <CallButton icon={cameraOff ? "videoOff" : "video"} label={cameraOff ? "Camera on" : "Camera off"} pressed={cameraOff} onClick={toggleCamera} />}
                  {call.video && <CallButton icon="repeat" label="Flip" onClick={() => void flip()} />}
                  <CallButton icon="phoneOff" label="End" tone="end" onClick={hangUp} />
                </>
              )}
              {call.phase === "ended" && (
                <button type="button" className="btn btn-secondary" onClick={() => setCall({ phase: "idle" })}>
                  Close
                </button>
              )}
            </div>
          </div>,
          document.body,
        )}
    </CallContext.Provider>
  );
}

function CallButton({ icon, label, onClick, tone, pressed }: { icon: IconName; label: string; onClick: () => void; tone?: "end" | "answer"; pressed?: boolean }) {
  return (
    <button type="button" className="kin-call-btn" data-tone={tone} aria-pressed={pressed} onClick={onClick}>
      <span className="kin-call-btn-round">
        <Icon name={icon} size="1.625rem" />
      </span>
      <span className="kin-call-btn-label">{label}</span>
    </button>
  );
}

/** A soft two-note ring while a call is coming in, and a buzz where the
 * phone can. Browsers may refuse sound before the page has been touched;
 * then it is silent and the screen still shows the call. */
function startRingtone(): { stop: () => void } {
  let ctx: AudioContext | null = null;
  let timer = 0;
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (Ctor) {
      ctx = new Ctor();
      const ring = () => {
        if (!ctx) return;
        const t0 = ctx.currentTime;
        for (const [i, f] of [660, 880].entries()) {
          const o = ctx.createOscillator();
          const g = ctx.createGain();
          o.frequency.value = f;
          g.gain.setValueAtTime(0, t0 + i * 0.35);
          g.gain.linearRampToValueAtTime(0.12, t0 + i * 0.35 + 0.04);
          g.gain.linearRampToValueAtTime(0, t0 + i * 0.35 + 0.3);
          o.connect(g).connect(ctx.destination);
          o.start(t0 + i * 0.35);
          o.stop(t0 + i * 0.35 + 0.32);
        }
        navigator.vibrate?.([300, 200, 300]);
      };
      ring();
      timer = window.setInterval(ring, 2500);
    }
  } catch {
    // Silent ring: the screen is enough.
  }
  return {
    stop: () => {
      window.clearInterval(timer);
      navigator.vibrate?.(0);
      void ctx?.close().catch(() => {});
      ctx = null;
    },
  };
}

/** The lock-screen "Janine is calling" stays up until dealt with (sw.js), so
 * once the call is answered or declined in the app it is taken down here. */
async function clearRingNotice(caller: string) {
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    for (const n of (await reg?.getNotifications({ tag: `call-${caller}` })) ?? []) n.close();
  } catch {
    // Nothing to clear, or no service worker on this browser.
  }
}
