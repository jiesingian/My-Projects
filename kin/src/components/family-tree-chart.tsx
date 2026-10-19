"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/avatar";
import { Icon } from "@/components/icons";
import { initials } from "@/lib/format";
import { buildChart, boxAround, TILE_W, TILE_H, type ChartNode, type HouseholdGroup } from "@/lib/tree-chart";
import type { PlacedPerson } from "@/lib/tree-layout";
import { relationships } from "@/lib/kinship";
import { addRelativeAction, linkTreePersonToMemberAction, setTreeLinksAction, type Relation } from "@/lib/actions/family";
import type { TreePerson } from "@/lib/queries/family";
import type { TreeMatch, BranchPerson } from "@/lib/queries/tree-links";
import { branchConflicts, matchBranch, mergeBranch, type BranchConflict, type ChartPerson } from "@/lib/tree-merge";
import { getSharedBranchAction, offerTreePersonAction, withdrawTreeMatchAction } from "@/lib/actions/tree-links";
import { confirm } from "@/components/confirm-sheet";
import { InviteQr } from "@/components/invite-qr";
import { toast } from "@/components/toast";
import { storyCountLabel, storyMark } from "@/lib/tree-stories";
import { PersonRecipes } from "@/components/person-recipes";

/** Layout units are px at the default text size; the chart draws them in rem,
 * so the whole tree -- cards, text and lines -- grows with the reader's text
 * size the way everything else in Kin does, rather than the words outgrowing
 * boxes of a fixed size. */
const rem = (px: number) => `${px / 16}rem`;

const MIN_ZOOM = 0.2;
const MAX_ZOOM = 2.5;

type View = { x: number; y: number; k: number };
type Box = { x: number; y: number; w: number; h: number };
/** What the panel offers. Brother and sister are one relation to the tree
 * (whoever shares the parents); the word only changes what the form says. */
type AddAs = Exclude<Relation, "sibling"> | "brother" | "sister";
type HouseholdMember = { id: string; full_name: string };

type Ghost = { id: string; relation: "father" | "mother" | "sibling" | "spouse" | "child"; of: string; label: string };

/** Where somebody is on Kin. `household` is the region they are drawn in and
 * the colour they take: MINE for yours, a linked household's name for
 * theirs, null for a name nobody on Kin has confirmed. */
type Status = { kind: "mine" | "linked" | "branch" | "name"; household: string | null; account?: boolean };
const MINE = "mine";
function statusFor(p: ChartPerson, linkedTo: Map<string, string>): Status {
  if (p.fromHousehold) return { kind: "branch", household: p.fromHousehold, account: !!p.hasAccount };
  if (p.memberId) return { kind: "mine", household: MINE };
  if (linkedTo.has(p.id)) return { kind: "linked", household: linkedTo.get(p.id)! };
  return { kind: "name", household: null };
}
/** Linked households' colours, in the order of their names: the member
 * colours furthest from the accent blue, so none reads as yours. */
const LINKED_COLOURS = ["teal", "amber", "violet", "moss", "coral"] as const;
const clampK = (k: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, k));
const reducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** The household's family tree: one tile per person, parents above their
 * children, and the households that exist on Kin -- yours, and any linked
 * household that has confirmed a person on it -- as soft regions in their
 * own colour behind their people. A relative typed in by name has no colour
 * and a dashed ring until they are on Kin. See lib/tree-chart.ts for the
 * geometry and docs/FAMILY_TREE.md for the decisions behind it.
 *
 * Drag to move (it keeps going when flicked), pinch or scroll to zoom, tap a
 * household's name to bring it forward, tap anybody to pick them, and tap
 * them again for their profile.
 */
export function FamilyTreeChart({
  people,
  meTreeId,
  householdName = null,
  matches = [],
  linkedFamilies = [],
  inviteCode = null,
  unaddedMembers = [],
  open = null,
  connections = [],
  candles = false,
}: {
  /** Undas, with the household's remembering on: a lit candle on the tile
   * of each of our own relatives who has passed (lib/remembrance). */
  candles?: boolean;
  /** Accepted connections, shown under the tree when it shows All. */
  connections?: { id: string; fullName: string; avatarUrl: string | null; householdName: string | null }[];
  /** Arrive with a linked relative picked (from their profile's "Show in
   * the tree"): the joined branch they are in, opened, and them selected. */
  open?: { matchId: string; personId: string } | null;
  people: TreePerson[];
  /** The viewer's household's own name, for its card. The others are named
   * from their surnames. */
  householdName?: string | null;
  /** Household members not on the tree yet: offered when adding a relative,
   * and to tie a typed-in name to its Kin profile. */
  unaddedMembers?: HouseholdMember[];
  meTreeId: string | null;
  matches?: TreeMatch[];
  linkedFamilies?: { id: string; name: string }[];
  /** The organiser's invite code, so a relative not yet on Kin can be sent
   * a join link from their card. Null for everyone else. */
  inviteCode?: string | null;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<string | null>(meTreeId);
  const focus = selected ?? meTreeId;

  // Linked households' branches that are open on the chart, fetched the first
  // time each is asked for and kept while the page is.
  const [branches, setBranches] = useState<Record<string, BranchPerson[]>>({});
  const [shown, setShown] = useState<string[]>([]);
  const accepted = useMemo(() => matches.filter((m) => m.status === "accepted"), [matches]);

  // Where a linked household's record of somebody we share names a different
  // father or mother than ours. The chart never overrules a parent we recorded,
  // so a disagreement would otherwise be invisible; it is said under the chart.
  const merged = useMemo(() => {
    const conflicts: BranchConflict[] = [];
    // Eldest first, so the children at home sit in birth order.
    let all: ChartPerson[] = [...people]
      .sort((a, b) => (a.dob ?? "9999").localeCompare(b.dob ?? "9999"))
      .map((p) => ({
        id: p.id,
        fullName: p.fullName,
        birthYear: p.dob ? p.dob.slice(0, 4) : null,
        avatarUrl: p.avatarUrl,
        memberId: p.memberId,
        fatherId: p.fatherId,
        motherId: p.motherId,
        spouseId: p.spouseId,
        color: p.color ?? null,
        sex: p.sex ?? null,
        fromHousehold: null,
        diedOn: p.diedOn ?? null,
      }));
    for (const id of shown) {
      const m = accepted.find((x) => x.matchId === id);
      const b = branches[id];
      if (!m || !b) continue;
      const known = matchBranch(all, b, m.ourPersonId);
      conflicts.push(...branchConflicts(all, b, m.ourPersonId, m.otherFamilyName, id, known));
      all = mergeBranch(all, b, id, m.ourPersonId, m.otherFamilyName, known);
    }
    return { all, conflicts };
  }, [people, shown, branches, accepted]);
  const chartPeople: ChartPerson[] = merged.all;
  const conflicts = merged.conflicts;
  const chartById = useMemo(() => new Map(chartPeople.map((p) => [p.id, p])), [chartPeople]);
  const relation = useMemo(() => relationships(chartPeople, meTreeId), [chartPeople, meTreeId]);

  const toggleBranch = async (matchId: string) => {
    if (shown.includes(matchId)) {
      setShown((s) => s.filter((x) => x !== matchId));
      return;
    }
    if (!branches[matchId]) {
      const result = await getSharedBranchAction(matchId);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      setBranches((b) => ({ ...b, [matchId]: result.people }));
    }
    setShown((s) => [...s, matchId]);
  };

  // Opened on a relative from their profile: fetch and show their branch
  // once, then pick them. Only a branch this household has joined -- the
  // same list the branch buttons offer.
  const opened = useRef(false);
  useEffect(() => {
    if (opened.current || !open || !accepted.some((m) => m.matchId === open.matchId)) return;
    opened.current = true;
    void (async () => {
      const result = await getSharedBranchAction(open.matchId);
      if (result.error) return;
      setBranches((b) => ({ ...b, [open.matchId]: result.people }));
      setShown((s) => (s.includes(open.matchId) ? s : [...s, open.matchId]));
      setSelected(open.personId);
    })();
  }, [open, accepted]);

  // ── who is on Kin, and in which household ───────────────────────────────
  // Colour means one thing on this chart: where somebody is on Kin. Your
  // household is the accent colour; each linked household has its own; and a
  // relative who is only a name on your tree has none -- a dashed ring,
  // until they join or a household on Kin confirms them as theirs. The first
  // redesign hashed a colour for every household it invented, and Jonathan
  // rightly called it random (30 September).
  const linkedColour = useMemo(() => {
    const names = [...new Set([...linkedFamilies.map((f) => f.name), ...accepted.map((m) => m.otherFamilyName)])].sort((a, b) => a.localeCompare(b));
    return new Map(names.map((n, i) => [n, LINKED_COLOURS[i % LINKED_COLOURS.length]]));
  }, [linkedFamilies, accepted]);
  const linkedTo = useMemo(() => new Map(accepted.map((m) => [m.ourPersonId, m.otherFamilyName])), [accepted]);
  const colourOf = (household: string | null) =>
    household === MINE ? "var(--color-accent)" : household ? `var(--member-${linkedColour.get(household) ?? "teal"})` : "var(--color-neutral-600)";
  const groupName = (id: string) => (id === MINE ? (householdName ?? "Your household") : id);

  // ── what the chart shows (Janine, 12 October) ───────────────────────────
  // Household: only the people in your household on Kin. Family tree: the
  // whole tree. All: the tree, and under it the people you have on Kin who
  // are not on it -- household members not placed yet, and your connections
  // -- each a tap from their page.
  const [scope, setScope] = useState<"household" | "tree" | "all">("tree");
  // ── adding a relative ─────────────────────────────────────────────────────
  const [adding, setAdding] = useState<{ to: string; relation: AddAs } | null>(null);
  const visible = useMemo(() => {
    if (scope !== "household") return chartPeople;
    const home = chartPeople.filter((p) => p.memberId && !p.fromHousehold);
    return home.length > 0 ? home : chartPeople;
  }, [scope, chartPeople]);

  // The dashed place for a new relative appears only while one is being
  // added (Janine, 12 October): the tree shows the family as it is, and
  // pressing Brother, Child or Father under it puts a dashed "New brother"
  // where they will go, until the form is saved or cancelled. It goes into the
  // layout as a person of its own, so it gets a real place on the chart.
  const ghost: Ghost | null = useMemo(() => {
    if (!adding) return null;
    const p = chartById.get(adding.to);
    if (!p || p.fromHousehold || !visible.includes(p)) return null;
    const relation = adding.relation === "brother" || adding.relation === "sister" ? "sibling" : adding.relation;
    return { id: `ghost-${relation}-${p.id}`, relation, of: p.id, label: `New ${adding.relation}` };
  }, [adding, chartById, visible]);

  const nodes: ChartNode[] = useMemo(() => {
    const g = ghost;
    const of = g ? chartById.get(g.of) : undefined;
    const base = visible.map((p) => ({
      id: p.id,
      fatherId: g && p.id === g.of && g.relation === "father" ? g.id : p.fatherId,
      motherId: g && p.id === g.of && g.relation === "mother" ? g.id : p.motherId,
      spouseId: g && p.id === g.of && g.relation === "spouse" ? g.id : p.spouseId,
    }));
    if (!g || !of) return base;
    const shown = (id: string | null) => (id && visible.some((v) => v.id === id) ? id : null);
    const extra: ChartNode =
      g.relation === "sibling"
        ? { id: g.id, fatherId: shown(of.fatherId), motherId: shown(of.motherId), spouseId: null, ghost: true }
        : g.relation === "child"
          ? { id: g.id, fatherId: of.id, motherId: shown(of.spouseId), spouseId: null, ghost: true }
          : g.relation === "spouse"
            ? { id: g.id, fatherId: null, motherId: null, spouseId: of.id, ghost: true }
            : { id: g.id, fatherId: null, motherId: null, spouseId: null, ghost: true };
    return [...base, extra];
  }, [visible, chartById, ghost]);

  // The households that exist on Kin, and who on the chart is in each.
  const groups: HouseholdGroup[] = useMemo(() => {
    const by = new Map<string, string[]>();
    for (const p of visible) {
      const h = statusFor(p, linkedTo).household;
      if (h) by.set(h, [...(by.get(h) ?? []), p.id]);
    }
    return [...by].map(([id, memberIds]) => ({ id, memberIds })).sort((a, b) => (a.id === MINE ? -1 : b.id === MINE ? 1 : a.id.localeCompare(b.id)));
  }, [visible, linkedTo]);
  const groupOf = useMemo(() => new Map(groups.flatMap((g) => g.memberIds.map((id) => [id, g.id] as const))), [groups]);
  const layout = useMemo(() => buildChart(nodes, meTreeId, groups), [nodes, meTreeId, groups]);
  const mineBox = useMemo(() => boxAround(layout, groups.find((g) => g.id === MINE)?.memberIds ?? []), [layout, groups]);

  // ── pan and zoom ──────────────────────────────────────────────────────────
  // The view lives in a ref and is written straight to the canvas's
  // transform: a drag, a flick or a glide moves one element sixty times a
  // second without re-rendering forty people. React only hears the zoom
  // level, when the motion ends, for the percentage under the chart.
  const viewport = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const view = useRef<View>({ x: 0, y: 0, k: 1 });
  const [zoom, setZoom] = useState(1);
  const anim = useRef<number | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ moved: number; samples: { t: number; x: number; y: number }[]; pinch?: { dist: number; mid: { x: number; y: number }; start: View } } | null>(null);

  const transformOf = (v: View) => `translate(${v.x}px, ${v.y}px) scale(${v.k})`;
  const transformRef = useRef(transformOf);
  useLayoutEffect(() => {
    transformRef.current = transformOf;
    if (canvas.current) canvas.current.style.transform = transformOf(view.current);
  });

  const paint = () => {
    if (canvas.current) canvas.current.style.transform = transformRef.current(view.current);
  };
  const stop = () => {
    if (anim.current !== null) cancelAnimationFrame(anim.current);
    anim.current = null;
  };
  const scale = () => (typeof window === "undefined" ? 1 : (parseFloat(getComputedStyle(document.documentElement).fontSize) || 16) / 16);

  /** Where a box of the chart sits in the middle of the window, at the
   * largest zoom that shows all of it (and no more than `maxK`). */
  const framing = (b: Box, maxK: number): View => {
    const el = viewport.current!;
    const s = scale();
    const k = clampK(Math.min(maxK, (el.clientWidth - 32) / (b.w * s), (el.clientHeight - 32) / (b.h * s)));
    return { k, x: el.clientWidth / 2 - (b.x + b.w / 2) * s * k, y: el.clientHeight / 2 - (b.y + b.h / 2) * s * k };
  };
  const whole = (): Box => ({ x: 0, y: 0, w: layout.width, h: layout.height });

  /** When motion ends: if the tree has been flung almost out of sight, bring
   * it back -- an empty window with no way to tell where the family went is
   * the one outcome a drag should never have. */
  const settle = () => {
    const el = viewport.current;
    setZoom(view.current.k);
    if (!el) return;
    const { x, y, k } = view.current;
    const s = scale() * k;
    const margin = 56;
    const nx = Math.min(el.clientWidth - margin, Math.max(margin - layout.width * s, x));
    const ny = Math.min(el.clientHeight - margin, Math.max(margin - layout.height * s, y));
    if (nx !== x || ny !== y) glideTo({ x: nx, y: ny, k });
  };

  /** Move the view with a critically damped spring -- no overshoot, and it
   * starts from wherever the view is now, so a glide interrupted by a finger
   * or another button simply carries on from there. Zoom springs in log
   * space, so zooming in and out feel alike. Reduced motion: it just goes. */
  const glideTo = (target: View) => {
    stop();
    target = { ...target, k: clampK(target.k) };
    if (reducedMotion()) {
      view.current = target;
      paint();
      setZoom(target.k);
      return;
    }
    const w = (2 * Math.PI) / 0.45; // response 0.45s
    const cur = { x: view.current.x, y: view.current.y, l: Math.log(view.current.k) };
    const to = { x: target.x, y: target.y, l: Math.log(target.k) };
    const vel = { x: 0, y: 0, l: 0 };
    let last: number | null = null;
    const step = (now: number) => {
      let dt = Math.min(0.064, (now - (last ?? now)) / 1000);
      last = now;
      while (dt > 0) {
        const h = Math.min(dt, 1 / 240);
        for (const a of ["x", "y", "l"] as const) {
          vel[a] += (w * w * (to[a] - cur[a]) - 2 * w * vel[a]) * h;
          cur[a] += vel[a] * h;
        }
        dt -= h;
      }
      const done = Math.abs(to.x - cur.x) < 0.5 && Math.abs(to.y - cur.y) < 0.5 && Math.abs(to.l - cur.l) < 0.002;
      view.current = done ? target : { x: cur.x, y: cur.y, k: Math.exp(cur.l) };
      paint();
      if (done) {
        anim.current = null;
        setZoom(target.k);
        return;
      }
      anim.current = requestAnimationFrame(step);
    };
    anim.current = requestAnimationFrame(step);
  };

  /** A flick keeps going and slows the way a scrolled page does. */
  const coast = (vx: number, vy: number) => {
    stop();
    if (reducedMotion() || Math.hypot(vx, vy) < 0.15) return settle();
    let last: number | null = null;
    const step = (now: number) => {
      const dt = Math.min(64, now - (last ?? now));
      last = now;
      view.current = { ...view.current, x: view.current.x + vx * dt, y: view.current.y + vy * dt };
      paint();
      const decay = Math.pow(0.995, dt);
      vx *= decay;
      vy *= decay;
      if (Math.hypot(vx, vy) < 0.02) {
        anim.current = null;
        return settle();
      }
      anim.current = requestAnimationFrame(step);
    };
    anim.current = requestAnimationFrame(step);
  };

  const zoomAbout = (factor: number, at?: { x: number; y: number }, smooth = false) => {
    const el = viewport.current;
    if (!el) return;
    const p = at ?? { x: el.clientWidth / 2, y: el.clientHeight / 2 };
    const v = view.current;
    const k = clampK(v.k * factor);
    // Zoom about the point under the finger, not the corner of the canvas.
    const next = { k, x: p.x - ((p.x - v.x) * k) / v.k, y: p.y - ((p.y - v.y) * k) / v.k };
    if (smooth) glideTo(next);
    else {
      view.current = next;
      paint();
    }
  };

  const centreOn = (id: string | null, k?: number) => {
    const spot = id ? layout.people.find((p) => p.id === id) : null;
    if (!viewport.current) return;
    if (!spot) return glideTo(framing(whole(), 1));
    glideTo(framing({ x: spot.x, y: spot.y, w: TILE_W, h: TILE_H }, k ?? Math.max(view.current.k, 0.9)));
  };
  const frameMine = (): View => {
    const all = framing(whole(), 1);
    // Small enough to read whole: show it all. Otherwise open on our own
    // household, which is the one a member comes here to see.
    if (!mineBox || all.k >= 0.8) return all;
    return framing(mineBox, 1);
  };
  const fit = () => glideTo(framing(whole(), 1));

  // Bring the dashed place for a new relative into view as it appears.
  const ghostId = ghost?.id ?? null;
  useEffect(() => {
    if (ghostId) centreOn(ghostId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ghostId]);

  // First view: no glide in from nowhere, just there.
  const placedOnce = useRef(false);
  useLayoutEffect(() => {
    if (placedOnce.current || !viewport.current) return;
    placedOnce.current = true;
    view.current = frameMine();
    paint();
    setZoom(view.current.k);
    // Once, when the chart first has a size: later layouts must not yank
    // the view back from wherever the reader has taken it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => stop, []);

  const local = (e: { clientX: number; clientY: number }) => {
    const r = viewport.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  // The pointer is captured only once it has actually moved. Capturing it on
  // the press retargets the release to the viewport, so a mouse click on a
  // card never reached the card: selecting someone worked by touch and
  // silently did nothing with a mouse.
  const capture = (id: number) => {
    const el = viewport.current;
    if (el && !el.hasPointerCapture(id)) el.setPointerCapture(id);
  };
  // ── moving someone by dragging (Janine, 12 October) ──────────────────────
  // Press on a person and drag (with a finger, hold a moment first, so a
  // plain swipe still moves the tree): a dashed line follows from them to
  // the pointer, and lights up whoever it is over. Let go on somebody and
  // the panel asks how the two are related, showing the change before it is
  // saved. Let go on empty space and nothing changes.
  const drag = useRef<{ id: string; armed: boolean; active: boolean; timer?: number; start: { x: number; y: number } } | null>(null);
  const dragLine = useRef<SVGLineElement>(null);
  const [dragging, setDragging] = useState<{ id: string; over: string | null } | null>(null);
  const [revision, setRevision] = useState<{ from: string; to: string } | null>(null);
  const toCanvas = (at: { x: number; y: number }) => {
    const k = view.current.k * scale();
    return { x: (at.x - view.current.x) / k, y: (at.y - view.current.y) / k };
  };
  const personAt = (c: { x: number; y: number }) =>
    layout.people.find((sp) => !sp.id.startsWith("ghost-") && c.x >= sp.x && c.x <= sp.x + TILE_W && c.y >= sp.y && c.y <= sp.y + TILE_H)?.id ?? null;
  const editable = (id: string) => people.some((p) => p.id === id);
  const dragTo = (at: { x: number; y: number }) => {
    const d = drag.current;
    if (!d) return;
    const c = toCanvas(at);
    const over = personAt(c);
    const target = over && over !== d.id && editable(over) ? over : null;
    const line = dragLine.current;
    if (line) {
      const from = layout.people.find((sp) => sp.id === d.id);
      if (from) {
        line.setAttribute("x1", String(from.x + TILE_W / 2));
        line.setAttribute("y1", String(from.y + TILE_H * 0.35));
      }
      line.setAttribute("x2", String(c.x));
      line.setAttribute("y2", String(c.y));
    }
    setDragging((cur) => (cur && cur.over === target ? cur : { id: d.id, over: target }));
  };
  const endDrag = () => {
    if (drag.current?.timer) window.clearTimeout(drag.current.timer);
    drag.current = null;
    setDragging(null);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    stop(); // a finger on a moving tree stops it where it is
    const at = local(e);
    pointers.current.set(e.pointerId, at);
    const pid = (e.target as HTMLElement).closest<HTMLElement>("[data-pid]")?.dataset.pid;
    if (pointers.current.size === 1 && pid && editable(pid)) {
      const mouse = e.pointerType === "mouse";
      drag.current = { id: pid, armed: mouse, active: false, start: at };
      if (!mouse) {
        drag.current.timer = window.setTimeout(() => {
          const d = drag.current;
          if (!d || (gesture.current && gesture.current.moved >= 8)) return;
          d.armed = true;
          d.active = true;
          capture(e.pointerId);
          navigator.vibrate?.(10);
          dragTo(d.start);
        }, 350);
      }
    } else if (drag.current) endDrag();
    if (pointers.current.size === 1) gesture.current = { moved: 0, samples: [{ t: e.timeStamp, ...at }] };
    if (pointers.current.size === 2) {
      for (const id of pointers.current.keys()) capture(id);
      const [a, b] = [...pointers.current.values()];
      gesture.current = { moved: 99, samples: [], pinch: { dist: Math.hypot(a.x - b.x, a.y - b.y), mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, start: view.current } };
    }
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev || !gesture.current) return;
    const now = local(e);
    pointers.current.set(e.pointerId, now);
    const g = gesture.current;
    if (g.pinch) {
      if (pointers.current.size < 2) return;
      const [a, b] = [...pointers.current.values()];
      const { start, mid, dist } = g.pinch;
      const k = clampK((start.k * Math.hypot(a.x - b.x, a.y - b.y)) / (dist || 1));
      const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      // Pinch zooms about where it started and follows the fingers' middle,
      // so two fingers can zoom and move at once.
      view.current = { k, x: m.x - ((mid.x - start.x) * k) / start.k, y: m.y - ((mid.y - start.y) * k) / start.k };
      paint();
      return;
    }
    g.moved += Math.abs(now.x - prev.x) + Math.abs(now.y - prev.y);
    const d = drag.current;
    if (d && d.armed) {
      if (!d.active && g.moved >= 8) {
        d.active = true;
        capture(e.pointerId);
      }
      if (d.active) {
        dragTo(now);
        return;
      }
      return;
    }
    if (d && g.moved >= 8) endDrag(); // a swipe before the hold: move the tree
    if (g.moved >= 8) capture(e.pointerId);
    g.samples = [...g.samples.filter((s) => e.timeStamp - s.t < 100), { t: e.timeStamp, ...now }];
    view.current = { ...view.current, x: view.current.x + now.x - prev.x, y: view.current.y + now.y - prev.y };
    paint();
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current;
    if (d?.active) {
      pointers.current.delete(e.pointerId);
      const over = personAt(toCanvas(local(e)));
      if (over && over !== d.id && editable(over)) {
        setRevision({ from: d.id, to: over });
        setSelected(over);
        setAdding(null);
      }
      endDrag();
      if (gesture.current) gesture.current.moved = 99;
      setTimeout(() => (gesture.current = null), 0);
      return;
    }
    if (d) endDrag();
    pointers.current.delete(e.pointerId);
    const g = gesture.current;
    if (pointers.current.size === 0) {
      if (g && !g.pinch && g.moved >= 8) {
        // Release velocity over the last few moves; a finger that stopped
        // before lifting has none.
        const s = g.samples;
        const first = s[0];
        const last = s[s.length - 1];
        const fresh = last && e.timeStamp - last.t < 60;
        const dt = last && first ? last.t - first.t : 0;
        if (fresh && dt > 0) coast((last.x - first.x) / dt, (last.y - first.y) / dt);
        else settle();
      } else if (g?.pinch) settle();
      setTimeout(() => (gesture.current = null), 0);
    } else if (g?.pinch) {
      // One finger of a pinch lifted: carry on as a drag from here, rather
      // than the tree jumping to the remaining finger.
      gesture.current = { moved: 99, samples: [] };
    }
  };
  // A card only counts as tapped if the finger did not travel: a drag that
  // happens to start and end on a card is a drag.
  const tapped = () => !gesture.current || gesture.current.moved < 8;

  // Pinch on a trackpad arrives as a wheel with ctrl held, and a mouse wheel
  // in whole notches: both zoom. A trackpad's two-finger scroll moves the
  // tree. Attached by hand because React's wheel listener is passive and
  // could not stop the page scrolling underneath.
  const wheelRef = useRef<(e: WheelEvent) => void>(() => {});
  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    stop();
    const at = local(e);
    const notch = e.deltaMode !== 0 || (e.deltaX === 0 && Math.abs(e.deltaY) >= 50 && Number.isInteger(e.deltaY));
    if (e.ctrlKey || e.metaKey) zoomAbout(Math.exp(-e.deltaY / 120), at);
    else if (notch) zoomAbout(Math.exp(-(e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY) / 500), at);
    else {
      view.current = { ...view.current, x: view.current.x - e.deltaX, y: view.current.y - e.deltaY };
      paint();
    }
    window.clearTimeout(wheelEnd.current);
    wheelEnd.current = window.setTimeout(settle, 140);
  };
  const wheelEnd = useRef<number | undefined>(undefined);
  useEffect(() => {
    wheelRef.current = onWheel;
  });
  useEffect(() => {
    const el = viewport.current;
    if (!el) return;
    const on = (e: WheelEvent) => wheelRef.current(e);
    el.addEventListener("wheel", on, { passive: false });
    return () => el.removeEventListener("wheel", on);
  }, []);

  // ── a household brought forward ───────────────────────────────────────────
  // Tapping a household's name frames it and dims everybody else, so one
  // family can be read without the rest of the tree around it. Tapping it
  // again, the empty space around the people, or Escape, lets go.
  const [focusHousehold, setFocusHousehold] = useState<string | null>(null);
  const boxOf = (group: string) => boxAround(layout, groups.find((g) => g.id === group)?.memberIds ?? []);
  const toggleHousehold = (group: string) => {
    if (focusHousehold === group) return setFocusHousehold(null);
    setFocusHousehold(group);
    const b = boxOf(group);
    if (b) glideTo(framing(b, 1.2));
  };
  const focusBox = focusHousehold ? boxOf(focusHousehold) : null;


  // ── full screen ───────────────────────────────────────────────────────────
  // The whole chart, its buttons and the selected person's panel, over the
  // page. A portal to <body> rather than position: fixed where it stands: an
  // ancestor with a backdrop-filter traps a fixed element inside itself, and
  // the Fullscreen API is not offered for anything but video on an iPhone.
  // It sits under the sheets (z-index 60), so adding a relative still opens
  // on top of it.
  const [max, setMax] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (focusHousehold) setFocusHousehold(null);
      else if (max) setMax(false);
    };
    window.addEventListener("keydown", onKey);
    if (!max) return () => window.removeEventListener("keydown", onKey);
    const root = document.documentElement;
    const before = root.style.overflow;
    root.style.overflow = "hidden";
    return () => {
      root.style.overflow = before;
      window.removeEventListener("keydown", onKey);
    };
  }, [max, focusHousehold]);
  const toggleMax = () => {
    setMax((m) => !m);
    // The window changes size, so frame the same thing again once it has.
    setTimeout(() => glideTo(focusBox ? framing(focusBox, 1.2) : frameMine()), 60);
  };

  const dimmed = (ids: string[]) => (focusHousehold && ids.some((id) => groupOf.get(id) !== focusHousehold) ? true : undefined);
  const hasName = visible.some((p) => statusFor(p, linkedTo).kind === "name");
  const hasUnmarried = layout.couples.some((c) => !c.married && !c.ghost);
  const notPlaced = linkedFamilies.filter((f) => !groups.some((g) => g.id === f.name));

  // How many stories the household keeps about each of its own people
  // (20261014204000): a small count on their tile.
  const storiesOf = new Map(people.map((p) => [p.id, p.storyCount ?? 0]));

  const tile = (spot: PlacedPerson) => {
    const style = { left: rem(spot.x), top: rem(spot.y), width: rem(TILE_W), height: rem(TILE_H) };
    if (ghost && spot.id === ghost.id) {
      return (
        <div key={spot.id} className="kin-tp kin-tp-ghost" style={style} aria-hidden="true">
          <span className="kin-tp-av">
            <Icon name="plus" size="1.125rem" />
          </span>
          <span className="kin-tp-name">{ghost.label}</span>
        </div>
      );
    }
    const p = chartById.get(spot.id)!;
    const status = statusFor(p, linkedTo);
    const isMe = p.id === meTreeId;
    const alsoLinked = status.kind === "mine" ? linkedTo.get(p.id) : undefined;
    const word = relation.get(p.id);
    const stories = p.fromHousehold ? 0 : (storiesOf.get(p.id) ?? 0);
    const candle = candles && !p.fromHousehold && !!p.diedOn;
    const where =
      status.kind === "mine"
        ? `in your household on Kin${alsoLinked ? ` and linked with ${alsoLinked}` : ""}`
        : status.kind === "linked"
          ? `linked with ${status.household} on Kin`
          : status.kind === "branch"
            ? `from the ${status.household} tree, ${status.account ? "on Kin" : "name only, not on Kin yet"}`
            : "not on Kin yet";
    return (
      <button
        key={spot.id}
        type="button"
        className="kin-tp"
        data-status={status.kind}
        data-account={status.kind === "branch" ? String(!!status.account) : undefined}
        data-me={isMe || undefined}
        data-selected={p.id === selected || undefined}
        data-dim={dimmed([p.id])}
        data-pid={p.id}
        data-drop={dragging?.over === p.id || (revision && (revision.from === p.id || revision.to === p.id)) || undefined}
        data-lifted={dragging?.id === p.id || undefined}
        style={{ ...style, ["--p" as string]: colourOf(status.household) }}
        onClick={() => {
          if (!tapped()) return;
          // A second tap on someone already picked opens their profile
          // (Jonathan, 28 September); the first picks them, for adding
          // relatives around them.
          if (p.id === selected && p.memberId && !p.fromHousehold) {
            router.push(`/family/members/${p.memberId}?from=tree`);
            return;
          }
          setSelected(p.id);
          setAdding(null);
        }}
        aria-label={`${p.fullName}${word && !isMe ? `, your ${word.toLowerCase()}` : ""}${isMe ? ", you" : ""}${p.birthYear ? `, born ${p.birthYear}` : ""}, ${where}${stories > 0 ? `, ${storyCountLabel(stories).toLowerCase()}` : ""}${candle ? ", remembered this Undas" : ""}`}
      >
        <span className="kin-tp-av" aria-hidden="true">
          {p.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.avatarUrl} alt="" draggable={false} />
          ) : (
            initials(p.fullName)
          )}
          {(status.kind === "linked" || alsoLinked) && (
            <span className="kin-tp-linked" style={{ ["--p" as string]: colourOf(status.kind === "linked" ? status.household : (alsoLinked ?? null)) }}>
              <Icon name="users" size="0.625rem" />
            </span>
          )}
          {/* Opposite the linked badge, so the two never sit on each other,
              and one or two characters at most, so the tile never widens. */}
          {stories > 0 && <span className="kin-tp-stories">{storyMark(stories)}</span>}
          {candle && (
            <span className="kin-tp-candle">
              <Icon name="candle" size="0.6875rem" />
            </span>
          )}
        </span>
        <span className="kin-tp-name">{p.fullName}</span>
        <span className="kin-tp-rel">{isMe ? "You" : (word ?? (p.birthYear ? `b. ${p.birthYear}` : ""))}</span>
      </button>
    );
  };

  const chart = (
    <div className="kin-treechart" data-max={max || undefined} role={max ? "dialog" : undefined} aria-modal={max || undefined} aria-label={max ? "Family tree, full screen" : undefined}>
      <div
        ref={viewport}
        className="kin-treechart-viewport"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClick={(e) => {
          // A tap on the space between households lets go of a focused one.
          const t = e.target as HTMLElement;
          if (tapped() && focusHousehold && !t.closest(".kin-tp, .kin-treechart-hh")) setFocusHousehold(null);
        }}
        role="application"
        aria-label="Family tree. Drag to move, pinch or scroll to zoom."
      >
        <div
          ref={canvas}
          className="kin-treechart-canvas"
          data-focus={focusHousehold ? true : undefined}
          style={{
            width: rem(layout.width),
            height: rem(layout.height),
          }}
        >
          {/* The households that exist on Kin, as soft regions behind their
              people; the lines on top of them; then the people. */}
          <svg className="kin-treechart-regions" viewBox={`0 0 ${layout.width} ${layout.height}`} width="100%" height="100%" aria-hidden="true">
            {layout.regions.map((r) => (
              <g key={r.group} data-mine={r.group === MINE || undefined} data-dim={focusHousehold && focusHousehold !== r.group ? true : undefined} style={{ ["--hh" as string]: colourOf(r.group) }}>
                {r.rects.map((rect, i) => (
                  <rect key={i} x={rect.x} y={rect.y} width={rect.w} height={rect.h} rx={18} />
                ))}
              </g>
            ))}
          </svg>
          <svg className="kin-treechart-lines" viewBox={`0 0 ${layout.width} ${layout.height}`} width="100%" height="100%" aria-hidden="true">
            {layout.families.map((f) => (
              <path key={`f-${f.parentIds.join("+")}>${f.childIds.join("+")}`} d={f.d} data-ghost={f.ghost || undefined} data-dim={dimmed([...f.parentIds, ...f.childIds])} />
            ))}
            {layout.couples.map((c) => (
              <path key={`c-${c.a}-${c.b}`} d={c.d} data-couple="" data-unmarried={!c.married || undefined} data-ghost={c.ghost || undefined} data-dim={dimmed([c.a, c.b])} />
            ))}
            <line ref={dragLine} className="kin-treechart-dragline" data-on={dragging || undefined} />
            {revision &&
              (() => {
                const a = layout.people.find((sp) => sp.id === revision.from);
                const b = layout.people.find((sp) => sp.id === revision.to);
                return a && b ? (
                  <line className="kin-treechart-dragline" data-on="" x1={a.x + TILE_W / 2} y1={a.y + TILE_H * 0.35} x2={b.x + TILE_W / 2} y2={b.y + TILE_H * 0.35} />
                ) : null;
              })()}
          </svg>
          {layout.regions.map((r) => (
            <button
              key={r.group}
              type="button"
              className="kin-treechart-hh"
              data-mine={r.group === MINE || undefined}
              aria-pressed={focusHousehold === r.group}
              aria-label={`Bring ${groupName(r.group)} forward`}
              style={{ left: rem(r.label.x), top: rem(r.label.y), ["--hh" as string]: colourOf(r.group) }}
              onClick={() => tapped() && toggleHousehold(r.group)}
            >
              <span className="kin-hh-dot" aria-hidden="true" />
              {groupName(r.group)}
            </button>
          ))}
          {layout.people.map(tile)}
        </div>
      </div>

      {/* The controls sit under the chart rather than floating over it: on a
          phone there is no corner of the canvas that is not somebody's card,
          and the first version covered the one person you were looking at. */}
      <div className="kin-treechart-bar">
        <span className="kin-treechart-count" aria-live="polite">
          {visible.length < chartPeople.length
            ? `Household: ${visible.length} of ${chartPeople.length} people`
            : `${chartPeople.length} ${chartPeople.length === 1 ? "person" : "people"}`}
          {chartPeople.length !== people.length ? ` · ${chartPeople.length - people.length} from linked households` : ""}
        </span>
        <div className="kin-treechart-tools">
          <div className="kin-treechart-group">
            <button type="button" aria-label="Zoom out" onClick={() => zoomAbout(0.8, undefined, true)}>
              <svg viewBox="0 0 16 16" width="1rem" height="1rem" aria-hidden="true">
                <path d="M3.5 8h9" />
              </svg>
            </button>
            <span className="kin-treechart-zoom" aria-hidden="true">
              {Math.round(zoom * 100)}%
            </span>
            <button type="button" aria-label="Zoom in" onClick={() => zoomAbout(1.25, undefined, true)}>
              <svg viewBox="0 0 16 16" width="1rem" height="1rem" aria-hidden="true">
                <path d="M3.5 8h9M8 3.5v9" />
              </svg>
            </button>
          </div>
          <div className="kin-treechart-group" role="group" aria-label="Who is on the chart">
            {(
              [
                ["household", "Household"],
                ["tree", "Family tree"],
                ["all", "All"],
              ] as const
            ).map(([k, label]) => (
              <button key={k} type="button" aria-pressed={scope === k} data-on={scope === k || undefined} onClick={() => setScope(k)}>
                {label}
              </button>
            ))}
          </div>
          <div className="kin-treechart-group">
            <button type="button" onClick={fit}>
              Fit
            </button>
            {meTreeId && (
              <button
                type="button"
                onClick={() => {
                  setSelected(meTreeId);
                  setFocusHousehold(null);
                  glideTo(mineBox ? framing(mineBox, 1) : view.current);
                }}
              >
                Me
              </button>
            )}
            <button type="button" aria-label={max ? "Leave full screen" : "Full screen"} aria-pressed={max} onClick={toggleMax}>
              <Icon name={max ? "minimize" : "maximize"} size="1rem" />
            </button>
          </div>
        </div>
      </div>

      {/* What the colours and lines mean. Only what is on the chart now. */}
      <ul className="kin-treelegend" aria-label="What the colours mean">
        {groups.map((g) => (
          <li key={g.id} style={{ ["--hh" as string]: colourOf(g.id) }}>
            <i aria-hidden="true" />
            <span>
              <strong>{groupName(g.id)}</strong> {g.id === MINE ? "· your household" : "· linked on Kin"}
            </span>
          </li>
        ))}
        {hasName && (
          <li data-hollow="">
            <i aria-hidden="true" />
            <span>Name only, not on Kin yet</span>
          </li>
        )}
        {hasUnmarried && (
          <li data-line="dashed">
            <i aria-hidden="true" />
            <span>Parents together, not recorded as married</span>
          </li>
        )}
      </ul>
      {conflicts.length > 0 && (
        <div className="kin-treelegend-note" role="status" data-conflict="">
          <strong>Their records differ from yours.</strong> Yours is the one drawn.
          <ul>
            {conflicts.map((c) => (
              <li key={`${c.matchId}-${c.personId}-${c.relation}`}>
                {c.personName}&rsquo;s {c.relation}: you have {c.ours}; {c.household} has {c.theirs}.
              </li>
            ))}
          </ul>
          <span>
            If yours is the one that is wrong, change it from Manage people. If theirs is, or you are not sure, ask them; either household can unlink
            a match from the person&rsquo;s panel.
          </span>
        </div>
      )}
      {notPlaced.length > 0 && (
        <p className="kin-treelegend-note">
          Linked on Kin but not on this tree yet: {notPlaced.map((f) => f.name).join(", ")}. To place them, pick the relative you share and choose
          &ldquo;Share with a linked household&rdquo;.
        </p>
      )}

      {scope === "all" && (unaddedMembers.length > 0 || connections.length > 0) && (
        <div className="kin-treeoff">
          {unaddedMembers.length > 0 && (
            <>
              <div className="kin-treepanel-label">In your household, not on the tree yet</div>
              <div className="kin-treeoff-row">
                {unaddedMembers.map((m) => (
                  <Link key={m.id} href={`/family/members/${m.id}?from=tree`} className="kin-treeoff-person">
                    <Avatar url={null} initials={initials(m.full_name)} label={m.full_name} size={32} clickable={false} />
                    <span>{m.full_name}</span>
                  </Link>
                ))}
              </div>
            </>
          )}
          {connections.length > 0 && (
            <>
              <div className="kin-treepanel-label">Connections</div>
              <div className="kin-treeoff-row">
                {connections.map((c) => (
                  <Link key={c.id} href="/family/connections" className="kin-treeoff-person">
                    <Avatar url={c.avatarUrl} initials={initials(c.fullName)} label={c.fullName} size={32} clickable={false} />
                    <span>
                      {c.fullName}
                      {c.householdName && <small>{c.householdName}</small>}
                    </span>
                  </Link>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* What you can do with whoever is selected. Outside the canvas, so it
          stays put and readable however the tree is zoomed. */}
      {focus && chartById.get(focus)?.fromHousehold && (
        <div className="kin-treepanel">
          <div className="kin-treepanel-head">
            <Avatar url={null} initials={initials(chartById.get(focus)!.fullName)} label={chartById.get(focus)!.fullName} size={36} />
            <div style={{ minWidth: 0 }}>
              <div className="kin-treepanel-name">{chartById.get(focus)!.fullName}</div>
              <div className="kin-treepanel-meta">
                {chartById.get(focus)!.birthYear ? `Born ${chartById.get(focus)!.birthYear} · ` : ""}from the {chartById.get(focus)!.fromHousehold} household&rsquo;s tree
              </div>
            </div>
          </div>
          <p className="kin-treepanel-note">
            A relative as the {chartById.get(focus)!.fromHousehold} household recorded them. Their details are theirs to keep, so they show here but
            can&rsquo;t be changed from your tree.
          </p>
        </div>
      )}

      {revision && people.some((p) => p.id === revision.from) && people.some((p) => p.id === revision.to) ? (
        <RevisionPanel
          from={people.find((p) => p.id === revision.from)!}
          to={people.find((p) => p.id === revision.to)!}
          people={people}
          onDone={(saved) => {
            setRevision(null);
            if (saved) router.refresh();
          }}
        />
      ) : focus && people.find((p) => p.id === focus) && (
        <SelectedPanel
          inviteCode={inviteCode}
          matches={matches.filter((m) => m.ourPersonId === focus)}
          linkedFamilies={linkedFamilies}
          shownBranches={shown}
          onToggleBranch={toggleBranch}
          person={people.find((p) => p.id === focus)!}
          relation={focus === meTreeId ? null : (relation.get(focus) ?? null)}
          where={linkedTo.has(focus) ? `Linked with ${linkedTo.get(focus)} on Kin` : "Name only, not on Kin yet"}
          people={people}
          unaddedMembers={unaddedMembers}
          isMe={focus === meTreeId}
          adding={adding?.to === focus ? adding.relation : null}
          onAdd={(r) => setAdding({ to: focus, relation: r })}
          onCancel={() => setAdding(null)}
          onAdded={(newId) => {
            setAdding(null);
            router.refresh();
            // Keep the one just added in view once the chart redraws with them.
            setTimeout(() => centreOn(newId ?? focus), 350);
          }}
        />
      )}
    </div>
  );
  return max ? createPortal(chart, document.body) : chart;
}

function SelectedPanel({
  person,
  people,
  unaddedMembers,
  isMe,
  adding,
  onAdd,
  onCancel,
  onAdded,
  matches,
  linkedFamilies,
  shownBranches,
  onToggleBranch,
  inviteCode,
  relation,
  where,
}: {
  inviteCode: string | null;
  /** For somebody without a profile in the household: whether a linked
   * household on Kin has confirmed them, or they are a name only. */
  where: string;
  /** What they are to the viewer ("Grandmother"), when the viewer is on the tree. */
  relation: string | null;
  matches: TreeMatch[];
  linkedFamilies: { id: string; name: string }[];
  shownBranches: string[];
  onToggleBranch: (matchId: string) => void;
  person: TreePerson;
  people: TreePerson[];
  unaddedMembers: HouseholdMember[];
  isMe: boolean;
  adding: AddAs | null;
  onAdd: (r: AddAs) => void;
  onCancel: () => void;
  onAdded: (newId: string | null) => void;
}) {
  const offers: { relation: AddAs; label: string; can: boolean }[] = [
    { relation: "father", label: "Father", can: !person.fatherId },
    { relation: "mother", label: "Mother", can: !person.motherId },
    { relation: "brother", label: "Brother", can: true },
    { relation: "sister", label: "Sister", can: true },
    { relation: "spouse", label: "Spouse", can: !person.spouseId },
    { relation: "child", label: "Child", can: true },
  ];
  // Whose invite QR is showing: by person, so picking someone else closes it.
  const [qrFor, setQrFor] = useState<string | null>(null);
  const showQr = qrFor === person.id && !person.memberId && !!inviteCode;
  return (
    <div className="kin-treepanel">
      <div className="kin-treepanel-head">
        {person.memberId ? (
          // Their face and name are the way to their profile, as on the
          // Family list.
          <Link href={`/family/members/${person.memberId}?from=tree`} className="kin-treepanel-who">
            <Avatar url={person.avatarUrl} initials={initials(person.fullName)} label={person.fullName} size={36} clickable={false} />
            <div style={{ minWidth: 0 }}>
              <div className="kin-treepanel-name">
                {person.fullName}
                {isMe && <span className="kin-treecard-you">You</span>}
              </div>
              <div className="kin-treepanel-meta">{relation ? `${relation} · ` : ""}
                {person.dob ? `Born ${person.dob}` : "No birthdate recorded"}</div>
            </div>
          </Link>
        ) : (
          <>
            <Avatar url={person.avatarUrl} initials={initials(person.fullName)} label={person.fullName} size={36} />
            <div style={{ minWidth: 0 }}>
              <div className="kin-treepanel-name">{person.fullName}</div>
              <div className="kin-treepanel-meta">{relation ? `${relation} · ` : ""}
                {person.dob ? `Born ${person.dob}` : "No birthdate recorded"}</div>
              <div className="kin-treepanel-meta">{where}</div>
            </div>
          </>
        )}
        {person.memberId && (
          <Link href={`/family/members/${person.memberId}?from=tree`} className="btn btn-secondary" style={{ minHeight: "2rem", padding: "0 0.75rem", fontSize: "var(--text-sm)" }}>
            Open profile
          </Link>
        )}
        {!person.memberId && inviteCode && (
          <>
            <InviteRelativeButton name={person.fullName} code={inviteCode} />
            <button
              type="button"
              className={showQr ? "btn btn-secondary" : "btn btn-ghost"}
              style={{ minHeight: "2rem", width: "2rem", padding: 0 }}
              aria-label={showQr ? "Hide the invite QR code" : `Show a QR code ${person.fullName.split(" ")[0]} can scan to join`}
              aria-expanded={showQr}
              onClick={() => setQrFor(showQr ? null : person.id)}
            >
              <Icon name="qr" size="1rem" />
            </button>
          </>
        )}
      </div>
      {/* The same invite QR as Settings → Household (#391): for a relative
          sitting next to you, who can scan it rather than be sent a link. */}
      {showQr && <InviteQr code={inviteCode!} />}

      {!person.memberId && unaddedMembers.length > 0 && <LinkProfile person={person} unaddedMembers={unaddedMembers} />}

      {/* Stories about them (14 October): the household's own, kept on a
          page of their own where there is room to listen and read. */}
      <Link href={`/family/stories/${person.id}`} className="kin-treepanel-stories">
        <Icon name="mic" size="1rem" />
        <span>
          <strong>Stories</strong>
          <small>{storyCountLabel(person.storyCount ?? 0)}</small>
        </span>
        <span className="kin-treepanel-stories-go">{(person.storyCount ?? 0) > 0 ? "Open" : "Add one"}</span>
      </Link>

      {/* Their recipes (19 October): Lola's adobo, kept in the Meals book. */}
      <PersonRecipes recipes={person.recipes ?? []} firstName={person.fullName.split(" ")[0]} />

      <LinkedSection person={person} matches={matches} linkedFamilies={linkedFamilies} shownBranches={shownBranches} onToggleBranch={onToggleBranch} />

      {adding ? (
        <AddRelativeForm person={person} people={people} unaddedMembers={unaddedMembers} relation={adding} onCancel={onCancel} onAdded={onAdded} />
      ) : (
        <div className="kin-treepanel-add">
          <span className="kin-treepanel-label">Add</span>
          {offers
            .filter((o) => o.can)
            .map((o) => (
              <button key={o.relation} type="button" className="chip" onClick={() => onAdd(o.relation)}>
                <Icon name="plus" size="0.8125rem" /> {o.label}
              </button>
            ))}
        </div>
      )}
    </div>
  );
}

function AddRelativeForm({
  person,
  people,
  unaddedMembers,
  relation,
  onCancel,
  onAdded,
}: {
  person: TreePerson;
  people: TreePerson[];
  unaddedMembers: HouseholdMember[];
  relation: AddAs;
  onCancel: () => void;
  onAdded: (newId: string | null) => void;
}) {
  const [name, setName] = useState("");
  const [dob, setDob] = useState("");
  const [memberId, setMemberId] = useState("");
  const [childOf, setChildOf] = useState<"father" | "mother">("father");
  const [other, setOther] = useState<string>(person.spouseId ?? "");
  const [parentName, setParentName] = useState("");
  const [parentIs, setParentIs] = useState<"father" | "mother">("father");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const first = person.fullName.split(" ")[0];
  const title = relation === "child" ? `${first}'s child` : `${first}'s ${relation}`;
  const sibling = relation === "brother" || relation === "sister";
  // Brothers and sisters are whoever shares the parents. With none recorded
  // there is nothing to share yet, so one parent is asked for here.
  const needsParent = sibling && !person.fatherId && !person.motherId;
  const ready = (memberId || name.trim()) && (!needsParent || parentName.trim());

  const save = () =>
    startTransition(async () => {
      const result = await addRelativeAction({
        toId: person.id,
        relation: sibling ? "sibling" : relation,
        fullName: name,
        dob,
        memberId: memberId || null,
        childOf,
        otherParentId: relation === "child" ? other || null : null,
        parentName: needsParent ? parentName : undefined,
        parentIs,
      });
      if (result.error) setError(result.error);
      else onAdded(result.id ?? null);
    });

  return (
    <div className="kin-treepanel-form">
      <div className="kin-treepanel-label">Add {title}</div>
      {unaddedMembers.length > 0 && (
        <select className="input" value={memberId} onChange={(e) => setMemberId(e.target.value)} aria-label="Someone already in the household">
          <option value="">Someone new</option>
          {unaddedMembers.map((m) => (
            <option key={m.id} value={m.id}>
              {m.full_name} (in Kin)
            </option>
          ))}
        </select>
      )}
      {!memberId && (
        <>
          <input className="input" placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} autoFocus aria-label="Full name" />
          <input className="input" type="date" value={dob} onChange={(e) => setDob(e.target.value)} aria-label="Date of birth (optional)" />
        </>
      )}
      {needsParent && (
        <>
          <p style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--color-neutral-600)" }}>
            Brothers and sisters share parents on the tree, so add one of {first}&rsquo;s parents too.
          </p>
          <input className="input" placeholder="Parent's full name" value={parentName} onChange={(e) => setParentName(e.target.value)} maxLength={100} aria-label="Parent's full name" />
          <div className="seg" style={{ margin: 0 }}>
            <button type="button" data-active={parentIs === "father"} onClick={() => setParentIs("father")}>
              Father
            </button>
            <button type="button" data-active={parentIs === "mother"} onClick={() => setParentIs("mother")}>
              Mother
            </button>
          </div>
        </>
      )}
      {relation === "child" && (
        <>
          <div className="seg" style={{ margin: 0 }}>
            <button type="button" data-active={childOf === "father"} onClick={() => setChildOf("father")}>
              {first} is their father
            </button>
            <button type="button" data-active={childOf === "mother"} onClick={() => setChildOf("mother")}>
              {first} is their mother
            </button>
          </div>
          <select className="input" value={other} onChange={(e) => setOther(e.target.value)} aria-label="Their other parent">
            <option value="">Other parent: not recorded</option>
            {people
              .filter((p) => p.id !== person.id)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  Other parent: {p.fullName}
                </option>
              ))}
          </select>
        </>
      )}
      {error && (
        <p role="alert" style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--cal-occasion)" }}>
          {error}
        </p>
      )}
      <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
        <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={pending}>
          Cancel
        </button>
        <button type="button" className="btn btn-primary" onClick={save} disabled={pending || !ready}>
          Add
        </button>
      </div>
    </div>
  );
}

/** Ties a name typed onto the tree to that person's Kin profile, so their
 * card opens it. */
function LinkProfile({ person, unaddedMembers }: { person: TreePerson; unaddedMembers: HouseholdMember[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.375rem 0.5rem", margin: "0.5rem 0" }}>
      <label className="kin-treepanel-label" htmlFor={`link-${person.id}`}>
        Is this someone in Kin?
      </label>
      <select
        id={`link-${person.id}`}
        className="input"
        style={{ flex: "1 1 10rem", minWidth: 0 }}
        value=""
        disabled={pending}
        onChange={(e) => {
          const memberId = e.target.value;
          if (!memberId) return;
          startTransition(async () => {
            const result = await linkTreePersonToMemberAction(person.id, memberId);
            if (result.error) setError(result.error);
            else {
              toast.success("Linked to their profile.");
              router.refresh();
            }
          });
        }}
      >
        <option value="">Link to their profile…</option>
        {unaddedMembers.map((m) => (
          <option key={m.id} value={m.id}>
            {m.full_name}
          </option>
        ))}
      </select>
      {error && (
        <p role="alert" style={{ margin: 0, flexBasis: "100%", fontSize: "var(--text-sm)", color: "var(--cal-occasion)" }}>
          {error}
        </p>
      )}
    </div>
  );
}

/** Where this person is shared with a linked household, and the way to share
 * them with another. Sharing reveals their name and year of birth to that
 * household and nothing else; the other household decides who, in their own
 * tree, this person is. */
function LinkedSection({
  person,
  matches,
  linkedFamilies,
  shownBranches,
  onToggleBranch,
}: {
  person: TreePerson;
  matches: TreeMatch[];
  linkedFamilies: { id: string; name: string }[];
  shownBranches: string[];
  onToggleBranch: (matchId: string) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [sharing, setSharing] = useState(false);
  const taken = new Set(matches.map((m) => m.otherFamilyName));
  const offerable = linkedFamilies.filter((f) => !taken.has(f.name));
  if (!matches.length && !offerable.length) return null;
  const first = person.fullName.split(" ")[0];

  return (
    <div className="kin-treepanel-linked">
      {matches.map((m) => (
        <div key={m.matchId} className="kin-treepanel-linkrow">
          <span style={{ flex: 1, minWidth: 0 }}>
            {m.status === "accepted" ? (
              <>Also in the <strong>{m.otherFamilyName}</strong> tree</>
            ) : (
              <>Offered to <strong>{m.otherFamilyName}</strong> · waiting for them</>
            )}
          </span>
          {m.status === "accepted" && (
            <button type="button" className="chip" data-active={shownBranches.includes(m.matchId) || undefined} onClick={() => onToggleBranch(m.matchId)}>
              {shownBranches.includes(m.matchId) ? "Hide their side" : "Show their side"}
            </button>
          )}
          <button
            type="button"
            className="btn btn-ghost"
            style={{ minHeight: "1.875rem", padding: "0 0.375rem", fontSize: "var(--text-xs)" }}
            disabled={pending}
            onClick={async () => {
              if (!(await confirm({ title: m.status === "accepted" ? `Stop sharing ${first} with ${m.otherFamilyName}?` : "Take the offer back?", confirmLabel: "Stop sharing" }))) return;
              startTransition(async () => {
                const r = await withdrawTreeMatchAction(m.matchId);
                if (r.error) toast.error(r.error);
                router.refresh();
              });
            }}
          >
            {m.status === "accepted" ? "Unlink" : "Withdraw"}
          </button>
        </div>
      ))}

      {offerable.length > 0 &&
        (sharing ? (
          <div className="kin-treepanel-linkrow" style={{ flexWrap: "wrap" }}>
            <span style={{ flex: "1 1 100%" }}>
              Share {first} with a linked household. They&rsquo;ll see {first}&rsquo;s name and year of birth, and can say who that is in their own tree.
            </span>
            {offerable.map((f) => (
              <button
                key={f.id}
                type="button"
                className="chip"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    const r = await offerTreePersonAction(person.id, f.id);
                    if (r.error) toast.error(r.error);
                    else toast.success(`${first} offered to ${f.name}.`);
                    setSharing(false);
                    router.refresh();
                  })
                }
              >
                {f.name}
              </button>
            ))}
            <button type="button" className="btn btn-ghost" style={{ minHeight: "1.875rem", fontSize: "var(--text-xs)" }} onClick={() => setSharing(false)}>
              Cancel
            </button>
          </div>
        ) : (
          <button type="button" className="btn btn-ghost kin-treepanel-share" onClick={() => setSharing(true)}>
            <Icon name="users" size="0.9375rem" /> Share {first} with a linked household
          </button>
        ))}
    </div>
  );
}

/** Sends a relative who is in the tree but not on Kin a link that opens
 * straight into joining. Every relative who joins makes the tree, the feed
 * and the calendar more useful to everyone already here. */
function InviteRelativeButton({ name, code }: { name: string; code: string }) {
  const [done, setDone] = useState(false);
  const share = async () => {
    const url = `${window.location.origin}/join/${code.replace(/[^A-Za-z0-9]/g, "")}`;
    const text = `Hi ${name.split(" ")[0]}! Join our family on Kin:`;
    if (navigator.share) {
      try {
        await navigator.share({ title: "Join our family on Kin", text, url });
        return;
      } catch {
        // Cancelled: fall through to copying.
      }
    }
    try {
      await navigator.clipboard.writeText(`${text} ${url}`);
      setDone(true);
      setTimeout(() => setDone(false), 1600);
    } catch {
      window.prompt("Copy this invite", `${text} ${url}`);
    }
  };
  return (
    <button type="button" className="btn btn-secondary" style={{ minHeight: "2rem", padding: "0 0.625rem", fontSize: "var(--text-sm)" }} onClick={share}>
      {done ? "Link copied" : "Invite to Kin"}
    </button>
  );
}

/** What a drag from one person onto another can mean, and the change each
 * makes to the tree before it is saved. `from` is the one dragged. */
function RevisionPanel({ from, to, people, onDone }: { from: TreePerson; to: TreePerson; people: TreePerson[]; onDone: (saved: boolean) => void }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const first = (p: TreePerson) => p.fullName.split(" ")[0];
  const nameOf = (id: string | null) => people.find((p) => p.id === id)?.fullName ?? null;
  const links = (p: TreePerson) => ({ fatherId: p.fatherId, motherId: p.motherId, spouseId: p.spouseId });
  const asParentOf = (p: TreePerson, parent: TreePerson) => (parent.sex === "female" || (p.fatherId && !p.motherId) ? "motherId" : "fatherId");
  const childSlot = asParentOf(from, to);
  // Nobody can become their own ancestor: that would loop the tree.
  const byId = new Map(people.map((p) => [p.id, p]));
  const isAncestor = (anc: string, of: string): boolean => {
    const seen = new Set<string>();
    const walk = (id: string | null): boolean => {
      if (!id || seen.has(id)) return false;
      seen.add(id);
      if (id === anc) return true;
      const p = byId.get(id);
      return !!p && (walk(p.fatherId) || walk(p.motherId));
    };
    const p = byId.get(of);
    return !!p && (walk(p.fatherId) || walk(p.motherId));
  };

  const options: { key: string; label: string; change: string; replaces: string | null; edits: [string, ReturnType<typeof links>][] }[] = [
    {
      key: "father",
      label: "Father",
      change: `${from.fullName} becomes ${first(to)}'s father`,
      replaces: to.fatherId && to.fatherId !== from.id ? nameOf(to.fatherId) : null,
      edits: [[to.id, { ...links(to), fatherId: from.id, motherId: to.motherId === from.id ? null : to.motherId }]],
    },
    {
      key: "mother",
      label: "Mother",
      change: `${from.fullName} becomes ${first(to)}'s mother`,
      replaces: to.motherId && to.motherId !== from.id ? nameOf(to.motherId) : null,
      edits: [[to.id, { ...links(to), motherId: from.id, fatherId: to.fatherId === from.id ? null : to.fatherId }]],
    },
    {
      key: "spouse",
      label: "Spouse",
      change: `${from.fullName} and ${to.fullName} become a couple`,
      replaces: to.spouseId && to.spouseId !== from.id ? nameOf(to.spouseId) : from.spouseId && from.spouseId !== to.id ? nameOf(from.spouseId) : null,
      edits: [
        [from.id, { ...links(from), spouseId: to.id }],
        [to.id, { ...links(to), spouseId: from.id }],
      ],
    },
    {
      key: "child",
      label: "Child",
      change: `${from.fullName} becomes ${first(to)}'s child`,
      replaces: from[childSlot] && from[childSlot] !== to.id ? nameOf(from[childSlot]) : null,
      edits: [[from.id, { ...links(from), [childSlot]: to.id }]],
    },
    ...(to.fatherId || to.motherId
      ? [
          {
            key: "sibling",
            label: "Brother or sister",
            change: `${from.fullName} gets ${first(to)}'s parents`,
            replaces: from.fatherId || from.motherId ? [nameOf(from.fatherId), nameOf(from.motherId)].filter(Boolean).join(" and ") || null : null,
            edits: [[from.id, { ...links(from), fatherId: to.fatherId, motherId: to.motherId }]] as [string, ReturnType<typeof links>][],
          },
        ]
      : []),
  ];
  const allowed = options.filter((o) =>
    o.key === "father" || o.key === "mother" ? !isAncestor(to.id, from.id) : o.key === "child" ? !isAncestor(from.id, to.id) : true,
  );
  const [pick, setPick] = useState<string | null>(null);
  const chosen = allowed.find((o) => o.key === pick) ?? null;

  const save = () =>
    chosen &&
    start(async () => {
      setError(null);
      for (const [id, fields] of chosen.edits) {
        const result = await setTreeLinksAction(id, fields);
        if (result.error) {
          setError(result.error);
          return;
        }
      }
      toast.success("Tree updated");
      onDone(true);
    });

  return (
    <div className="kin-treepanel" role="region" aria-label="Change how they are related">
      <div className="kin-treepanel-name">
        {first(from)} is {first(to)}&rsquo;s…
      </div>
      <div className="kin-treepanel-add" style={{ marginTop: "0.5rem" }}>
        {allowed.map((o) => (
          <button key={o.key} type="button" className="chip" aria-pressed={pick === o.key} data-on={pick === o.key || undefined} onClick={() => setPick(o.key)} disabled={pending}>
            {o.label}
          </button>
        ))}
      </div>
      {chosen && (
        <p className="kin-treepanel-note">
          {chosen.change}
          {chosen.replaces ? `, in place of ${chosen.replaces}` : ""}.
        </p>
      )}
      {error && <p style={{ color: "var(--color-accent-700)", fontSize: "0.8125rem", margin: "0.25rem 0" }}>{error}</p>}
      <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem" }}>
        <button type="button" className="btn btn-ghost" onClick={() => onDone(false)} disabled={pending}>
          Cancel
        </button>
        <button type="button" className="btn btn-primary" onClick={save} disabled={!chosen || pending}>
          {pending ? "Saving…" : "Save change"}
        </button>
      </div>
    </div>
  );
}
