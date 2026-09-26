/** Voice and video calls: what each signal means for the call on this device.
 *
 * A call is set up over the household's private `call:<family id>` channel
 * (20260926090000_call_signalling.sql) and then runs phone to phone. Every
 * device in the household hears every signal, so each one decides here, and
 * only here, whether a signal is about a call it is part of. Kept free of
 * the browser so the rules can be tested on their own
 * (e2e/calls.logic.spec.ts); components/call-provider.tsx does the WebRTC.
 *
 * `device` is per open copy of Kin, not per person: someone with Kin open on
 * a phone and a laptop rings on both, answers on one, and the other stops. */

export type Signal =
  | { t: "ring"; call: string; from: string; fromDevice: string; to: string; video: boolean }
  | { t: "cancel"; call: string; from: string }
  | { t: "accept"; call: string; from: string; fromDevice: string; toDevice: string }
  | { t: "decline"; call: string; from: string; fromDevice: string }
  | { t: "busy"; call: string; from: string }
  | { t: "offer"; call: string; fromDevice: string; toDevice: string; sdp: string }
  | { t: "answer"; call: string; fromDevice: string; toDevice: string; sdp: string }
  | { t: "ice"; call: string; fromDevice: string; toDevice: string; candidate: RTCIceCandidateInit | null }
  | { t: "hangup"; call: string; from: string };

export type EndReason = "declined" | "busy" | "no-answer" | "missed" | "hung-up" | "failed" | "answered-elsewhere" | "cancelled";

export type CallState =
  | { phase: "idle" }
  | { phase: "outgoing"; call: string; peer: string; video: boolean }
  | { phase: "incoming"; call: string; peer: string; peerDevice: string; video: boolean }
  | { phase: "connecting" | "active"; call: string; peer: string; peerDevice: string; video: boolean; role: "caller" | "callee"; startedAt?: number }
  | { phase: "ended"; call: string; peer: string; video: boolean; reason: EndReason };

export type Me = { id: string; device: string };

/** What to do after a signal: the next state, a signal to send back, and
 * whether this device should now make the WebRTC offer (the caller does,
 * once somebody answers). */
export type Step = { state: CallState; reply?: Signal; makeOffer?: boolean };

export const RING_SECONDS = 45;

const inCall = (s: CallState): s is Exclude<CallState, { phase: "idle" } | { phase: "ended" }> => s.phase !== "idle" && s.phase !== "ended";

export function onSignal(state: CallState, sig: Signal, me: Me): Step {
  const same = inCall(state) && state.call === sig.call;
  switch (sig.t) {
    case "ring": {
      if (sig.to !== me.id || sig.from === me.id) return { state };
      // The caller repeats the ring every few seconds so a device that opens
      // Kin mid-ring still hears it; a repeat of the call already ringing
      // here changes nothing.
      if (same) return { state };
      if (inCall(state)) return { state, reply: { t: "busy", call: sig.call, from: me.id } };
      return { state: { phase: "incoming", call: sig.call, peer: sig.from, peerDevice: sig.fromDevice, video: sig.video } };
    }
    case "cancel":
      if (same && state.phase === "incoming") return { state: ended(state, "missed") };
      return { state };
    case "accept":
      if (!same) return { state };
      if (state.phase === "outgoing" && sig.from === state.peer) {
        return { state: { phase: "connecting", call: state.call, peer: state.peer, peerDevice: sig.fromDevice, video: state.video, role: "caller" }, makeOffer: true };
      }
      // My own other device picked it up.
      if (state.phase === "incoming" && sig.from === me.id && sig.fromDevice !== me.device) return { state: ended(state, "answered-elsewhere") };
      return { state };
    case "decline":
      if (!same) return { state };
      if (state.phase === "outgoing" && sig.from === state.peer) return { state: ended(state, "declined") };
      if (state.phase === "incoming" && sig.from === me.id && sig.fromDevice !== me.device) return { state: ended(state, "answered-elsewhere") };
      return { state };
    case "busy":
      if (same && state.phase === "outgoing" && sig.from === state.peer) return { state: ended(state, "busy") };
      return { state };
    case "hangup":
      if (!same || sig.from !== state.peer) return { state };
      return { state: ended(state, state.phase === "incoming" ? "missed" : "hung-up") };
    case "offer":
    case "answer":
    case "ice":
      // Handled by the caller of this function, and only when it is for this
      // device and this call: see forThisDevice.
      return { state };
  }
}

/** Offers, answers and network candidates go to one device, not a person. */
export function forThisDevice(state: CallState, sig: Signal, me: Me): boolean {
  if (sig.t !== "offer" && sig.t !== "answer" && sig.t !== "ice") return false;
  return inCall(state) && state.call === sig.call && sig.toDevice === me.device && "peerDevice" in state && state.peerDevice === sig.fromDevice;
}

export function ended(state: Exclude<CallState, { phase: "idle" } | { phase: "ended" }>, reason: EndReason): CallState {
  return { phase: "ended", call: state.call, peer: state.peer, video: state.video, reason };
}

export function endLine(reason: EndReason, name: string): string {
  switch (reason) {
    case "declined":
      return `${name} can't talk right now`;
    case "busy":
      return `${name} is on another call`;
    case "no-answer":
      return `${name} didn't answer`;
    case "missed":
      return `Missed call from ${name}`;
    case "hung-up":
      return "Call ended";
    case "cancelled":
      return "Call cancelled";
    case "answered-elsewhere":
      return "Answered on another device";
    case "failed":
      return "The call couldn't connect. On mobile data this can need a relay Kin doesn't have yet; Wi-Fi usually works.";
  }
}

export function callClock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const mm = String(Math.floor((s % 3600) / 60)).padStart(h ? 2 : 1, "0");
  const ss = String(s % 60).padStart(2, "0");
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** Who hears that a call is happening, besides the person rung (26 September):
 * the household's grown-ups, never the two on the call, and never a child.
 * Each grown-up's own "Family calls" switch is applied after this, by
 * push_targets(). */
export function callWatchers(members: { id: string; role: string | null; status: string | null }[], caller: string, callee: string): string[] {
  return members.filter((m) => m.status === "active" && (m.role === "parent" || m.role === "adult") && m.id !== caller && m.id !== callee).map((m) => m.id);
}
