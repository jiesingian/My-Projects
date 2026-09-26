import { test, expect } from "@playwright/test";
import { onSignal, forThisDevice, callClock, callWatchers, type CallState, type Me } from "@/lib/calls";

/** Calls: every device in a household hears every call signal, so each one
 * has to know which signals are about it. These are the rules it uses. */

const QUINN: Me = { id: "quinn", device: "q-phone" };
const ROBIN: Me = { id: "robin", device: "r-phone" };
const ROBIN_LAPTOP: Me = { id: "robin", device: "r-laptop" };
const ALEX: Me = { id: "alex", device: "a-phone" };
const idle: CallState = { phase: "idle" };
const ring = { t: "ring", call: "c1", from: "quinn", fromDevice: "q-phone", to: "robin", video: true } as const;

test("a ring reaches the person called, and nobody else", () => {
  expect(onSignal(idle, ring, ROBIN).state).toEqual({ phase: "incoming", call: "c1", peer: "quinn", peerDevice: "q-phone", video: true });
  expect(onSignal(idle, ring, ALEX).state).toBe(idle);
  expect(onSignal(idle, ring, QUINN).state).toBe(idle);
});

test("the repeated ring does not restart a call already ringing", () => {
  const ringing = onSignal(idle, ring, ROBIN).state;
  const again = onSignal(ringing, ring, ROBIN);
  expect(again.state).toBe(ringing);
  expect(again.reply).toBeUndefined();
});

test("someone already on a call answers busy", () => {
  const onCall: CallState = { phase: "active", call: "c0", peer: "alex", peerDevice: "a-phone", video: false, role: "callee" };
  const step = onSignal(onCall, ring, ROBIN);
  expect(step.state).toBe(onCall);
  expect(step.reply).toEqual({ t: "busy", call: "c1", from: "robin" });
  const calling: CallState = { phase: "outgoing", call: "c1", peer: "robin", video: true };
  expect(onSignal(calling, step.reply!, QUINN).state).toMatchObject({ phase: "ended", reason: "busy" });
});

test("answering makes the caller send the offer, to the device that answered", () => {
  const calling: CallState = { phase: "outgoing", call: "c1", peer: "robin", video: true };
  const step = onSignal(calling, { t: "accept", call: "c1", from: "robin", fromDevice: "r-laptop", toDevice: "q-phone" }, QUINN);
  expect(step.makeOffer).toBe(true);
  expect(step.state).toMatchObject({ phase: "connecting", peerDevice: "r-laptop", role: "caller" });
});

test("answering on the laptop stops the phone ringing", () => {
  const phoneRinging = onSignal(idle, ring, ROBIN).state;
  const accept = { t: "accept", call: "c1", from: "robin", fromDevice: "r-laptop", toDevice: "q-phone" } as const;
  expect(onSignal(phoneRinging, accept, ROBIN).state).toMatchObject({ phase: "ended", reason: "answered-elsewhere" });
  // ...and the laptop's own accept, heard back, changes nothing on the laptop.
  const laptopRinging = onSignal(idle, ring, ROBIN_LAPTOP).state;
  expect(onSignal(laptopRinging, accept, ROBIN_LAPTOP).state).toBe(laptopRinging);
});

test("declining tells the caller; the caller hanging up first is a missed call", () => {
  const calling: CallState = { phase: "outgoing", call: "c1", peer: "robin", video: true };
  expect(onSignal(calling, { t: "decline", call: "c1", from: "robin", fromDevice: "r-phone" }, QUINN).state).toMatchObject({ phase: "ended", reason: "declined" });
  const ringing = onSignal(idle, ring, ROBIN).state;
  expect(onSignal(ringing, { t: "cancel", call: "c1", from: "quinn" }, ROBIN).state).toMatchObject({ phase: "ended", reason: "missed" });
});

test("only the other person can hang up a call, and only that call", () => {
  const active: CallState = { phase: "active", call: "c1", peer: "quinn", peerDevice: "q-phone", video: false, role: "callee", startedAt: 0 };
  expect(onSignal(active, { t: "hangup", call: "c1", from: "alex" }, ROBIN).state).toBe(active);
  expect(onSignal(active, { t: "hangup", call: "c9", from: "quinn" }, ROBIN).state).toBe(active);
  expect(onSignal(active, { t: "hangup", call: "c1", from: "quinn" }, ROBIN).state).toMatchObject({ phase: "ended", reason: "hung-up" });
});

test("an offer is taken only by the device it was meant for, from the right device", () => {
  const connecting: CallState = { phase: "connecting", call: "c1", peer: "quinn", peerDevice: "q-phone", video: true, role: "callee" };
  const offer = { t: "offer", call: "c1", fromDevice: "q-phone", toDevice: "r-laptop", sdp: "v=0" } as const;
  expect(forThisDevice(connecting, offer, ROBIN_LAPTOP)).toBe(true);
  expect(forThisDevice(connecting, offer, ROBIN)).toBe(false);
  expect(forThisDevice(connecting, { ...offer, fromDevice: "a-phone" }, ROBIN_LAPTOP)).toBe(false);
  expect(forThisDevice(connecting, { ...offer, call: "c2" }, ROBIN_LAPTOP)).toBe(false);
  expect(forThisDevice(idle, offer, ROBIN_LAPTOP)).toBe(false);
});

test("the call clock", () => {
  expect(callClock(0)).toBe("0:00");
  expect(callClock(65_000)).toBe("1:05");
  expect(callClock(3_725_000)).toBe("1:02:05");
});

test("grown-ups hear about a call, never the two on it and never a child", () => {
  const household = [
    { id: "quinn", role: "parent", status: "active" },
    { id: "jo", role: "adult", status: "active" },
    { id: "robin", role: "child", status: "active" },
    { id: "alex", role: "child", status: "managed" },
    { id: "gran", role: "parent", status: "invited" },
  ];
  expect(callWatchers(household, "robin", "jo")).toEqual(["quinn"]);
  expect(callWatchers(household, "quinn", "jo")).toEqual([]);
  expect(callWatchers(household, "robin", "alex").sort()).toEqual(["jo", "quinn"]);
});
