"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/avatar";
import { Icon } from "@/components/icons";
import { initials } from "@/lib/format";
import { layoutTree, CARD_W, CARD_H } from "@/lib/tree-layout";
import { addRelativeAction, linkTreePersonToMemberAction, type Relation } from "@/lib/actions/family";
import type { TreePerson } from "@/lib/queries/family";
import type { TreeMatch, BranchPerson } from "@/lib/queries/tree-links";
import { mergeBranch, type ChartPerson } from "@/lib/tree-merge";
import { getSharedBranchAction, offerTreePersonAction, withdrawTreeMatchAction } from "@/lib/actions/tree-links";
import { confirm } from "@/components/confirm-sheet";
import { toast } from "@/components/toast";

/** Layout units are px at the default text size; the chart draws them in rem,
 * so the whole tree -- cards, text and lines -- grows with the reader's text
 * size the way everything else in Kin does, rather than the words outgrowing
 * boxes of a fixed size. */
const rem = (px: number) => `${px / 16}rem`;

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 2.5;

type View = { x: number; y: number; k: number };
type Ghost = { id: string; relation: "father" | "mother" | "sibling"; of: string };
/** What the panel offers. Brother and sister are one relation to the tree
 * (whoever shares the parents); the word only changes what the form says. */
type AddAs = Exclude<Relation, "sibling"> | "brother" | "sister";
type HouseholdMember = { id: string; full_name: string };

/** The household's family tree as a chart: every person, their parents above,
 * their children below, drawn once for everybody in the house. The only thing
 * that differs between members is that each sees themselves highlighted.
 *
 * Drag to move, pinch or the buttons to zoom, "Me" to come back. Tap anybody
 * to add their father, mother, spouse or child on the spot.
 */
export function FamilyTreeChart({
  people,
  meTreeId,
  matches = [],
  linkedFamilies = [],
  inviteCode = null,
  unaddedMembers = [],
}: {
  people: TreePerson[];
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

  const chartPeople: ChartPerson[] = useMemo(() => {
    let all: ChartPerson[] = people.map((p) => ({
      id: p.id,
      fullName: p.fullName,
      birthYear: p.dob ? p.dob.slice(0, 4) : null,
      avatarUrl: p.avatarUrl,
      memberId: p.memberId,
      fatherId: p.fatherId,
      motherId: p.motherId,
      spouseId: p.spouseId,
      fromHousehold: null,
    }));
    for (const id of shown) {
      const m = accepted.find((x) => x.matchId === id);
      const b = branches[id];
      if (m && b) all = mergeBranch(all, b, id, m.ourPersonId, m.otherFamilyName);
    }
    return all;
  }, [people, shown, branches, accepted]);
  const chartById = useMemo(() => new Map(chartPeople.map((p) => [p.id, p])), [chartPeople]);

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

  // Dashed "Add father" / "Add mother" places, and an "Add brother or
  // sister" one beside them, for whoever is selected. They go into the layout
  // as people of their own so they get a real place on the chart instead of
  // being drawn over somebody who is already there; the sibling place shares
  // the person's parents (real or dashed), so it lands right beside them.
  const ghosts: Ghost[] = useMemo(() => {
    const p = chartById.get(focus ?? "");
    if (!p || p.fromHousehold) return [];
    return [
      ...(p.fatherId ? [] : [{ id: `ghost-father-${p.id}`, relation: "father" as const, of: p.id }]),
      ...(p.motherId ? [] : [{ id: `ghost-mother-${p.id}`, relation: "mother" as const, of: p.id }]),
      { id: `ghost-sibling-${p.id}`, relation: "sibling" as const, of: p.id },
    ];
  }, [chartById, focus]);

  const layout = useMemo(() => {
    const ghostOf = new Map(ghosts.map((g) => [g.of + g.relation, g.id]));
    const fatherGhost = ghosts.find((g) => g.relation === "father");
    const motherGhost = ghosts.find((g) => g.relation === "mother");
    const siblingGhost = ghosts.find((g) => g.relation === "sibling");
    const siblingOf = siblingGhost ? chartById.get(siblingGhost.of) : undefined;
    return layoutTree(
      [
        ...chartPeople.map((p) => ({
          id: p.id,
          fatherId: p.fatherId ?? ghostOf.get(p.id + "father") ?? null,
          motherId: p.motherId ?? ghostOf.get(p.id + "mother") ?? null,
          spouseId: p.spouseId,
        })),
        ...(fatherGhost ? [{ id: fatherGhost.id, fatherId: null, motherId: null, spouseId: motherGhost?.id ?? null }] : []),
        ...(motherGhost ? [{ id: motherGhost.id, fatherId: null, motherId: null, spouseId: fatherGhost?.id ?? null }] : []),
        ...(siblingGhost && siblingOf
          ? [{ id: siblingGhost.id, fatherId: siblingOf.fatherId ?? fatherGhost?.id ?? null, motherId: siblingOf.motherId ?? motherGhost?.id ?? null, spouseId: null }]
          : []),
      ],
      meTreeId,
    );
  }, [chartPeople, chartById, ghosts, meTreeId]);

  const byId = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);
  const ghostById = useMemo(() => new Map(ghosts.map((g) => [g.id, g])), [ghosts]);

  // ── pan and zoom ──────────────────────────────────────────────────────────
  const viewport = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>({ x: 0, y: 0, k: 1 });
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ moved: number; pinch?: { dist: number; k: number; mid: { x: number; y: number }; start: View } } | null>(null);

  const remPx = () => (typeof window === "undefined" ? 16 : parseFloat(getComputedStyle(document.documentElement).fontSize) || 16);

  /** Put one person in the middle of the viewport at a given zoom. */
  const centreOn = useCallback(
    (id: string | null, k?: number) => {
      const el = viewport.current;
      const spot = id ? layout.people.find((p) => p.id === id) : null;
      if (!el) return;
      const scale = remPx() / 16;
      const zoom = k ?? view.k;
      const cx = spot ? (spot.x + CARD_W / 2) * scale : (layout.width * scale) / 2;
      const cy = spot ? (spot.y + CARD_H / 2) * scale : (layout.height * scale) / 2;
      setView({ k: zoom, x: el.clientWidth / 2 - cx * zoom, y: el.clientHeight / 2 - cy * zoom });
    },
    [layout, view.k],
  );

  /** The whole tree in view, or as much of it as can be read. */
  const fit = useCallback(() => {
    const el = viewport.current;
    if (!el) return;
    const scale = remPx() / 16;
    const k = Math.min(1, Math.max(MIN_ZOOM, Math.min(el.clientWidth / (layout.width * scale + 48), el.clientHeight / (layout.height * scale + 48))));
    centreOn(null, k);
  }, [layout, centreOn]);

  // First view: yourself, in the middle, at a size you can read.
  const placedOnce = useRef(false);
  useEffect(() => {
    if (placedOnce.current || !viewport.current) return;
    placedOnce.current = true;
    const id = requestAnimationFrame(() => (meTreeId ? centreOn(meTreeId, 1) : fit()));
    return () => cancelAnimationFrame(id);
  }, [meTreeId, centreOn, fit]);

  const zoomAt = (factor: number, at?: { x: number; y: number }) => {
    const el = viewport.current;
    if (!el) return;
    const p = at ?? { x: el.clientWidth / 2, y: el.clientHeight / 2 };
    setView((v) => {
      const k = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.k * factor));
      // Zoom about the point under the finger, not the corner of the canvas.
      return { k, x: p.x - ((p.x - v.x) * k) / v.k, y: p.y - ((p.y - v.y) * k) / v.k };
    });
  };

  const local = (e: { clientX: number; clientY: number }) => {
    const r = viewport.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  // The pointer is captured only once it has actually moved. Capturing it on
  // the press, as this first did, retargets the release to the viewport, so
  // a mouse click on a card never reached the card: selecting someone worked
  // by touch and silently did nothing with a mouse.
  const capture = (id: number) => {
    const el = viewport.current;
    if (el && !el.hasPointerCapture(id)) el.setPointerCapture(id);
  };
  const onPointerDown = (e: React.PointerEvent) => {
    pointers.current.set(e.pointerId, local(e));
    if (pointers.current.size === 1) gesture.current = { moved: 0 };
    if (pointers.current.size === 2) {
      for (const id of pointers.current.keys()) capture(id);
      const [a, b] = [...pointers.current.values()];
      gesture.current = { moved: 99, pinch: { dist: Math.hypot(a.x - b.x, a.y - b.y), k: view.k, mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, start: view } };
    }
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev || !gesture.current) return;
    const now = local(e);
    pointers.current.set(e.pointerId, now);
    const g = gesture.current;
    if (g.pinch && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const k = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, (g.pinch.k * Math.hypot(a.x - b.x, a.y - b.y)) / (g.pinch.dist || 1)));
      const { start, mid } = g.pinch;
      setView({ k, x: mid.x - ((mid.x - start.x) * k) / start.k, y: mid.y - ((mid.y - start.y) * k) / start.k });
      return;
    }
    g.moved += Math.abs(now.x - prev.x) + Math.abs(now.y - prev.y);
    if (g.moved >= 8) capture(e.pointerId);
    setView((v) => ({ ...v, x: v.x + now.x - prev.x, y: v.y + now.y - prev.y }));
  };
  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size === 0) setTimeout(() => (gesture.current = null), 0);
  };
  // A card only counts as tapped if the finger did not travel: a drag that
  // happens to start and end on a card is a drag.
  const tapped = () => !gesture.current || gesture.current.moved < 8;

  const onWheel = (e: React.WheelEvent) => {
    // Pinch on a trackpad arrives as a wheel with ctrl held; that zooms. A
    // plain wheel or two-finger scroll moves the chart.
    if (e.ctrlKey) zoomAt(Math.exp(-e.deltaY / 200), local(e));
    else setView((v) => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }));
  };

  // ── adding a relative ─────────────────────────────────────────────────────
  const [adding, setAdding] = useState<{ to: string; relation: AddAs } | null>(null);

  // ── the 3D view (item 10, 25 September) ───────────────────────────────────
  // An option, not the default: the flat chart is the one to read and edit
  // on. In 3D the chart becomes a floor tilted away from you, the lines drawn
  // on it, and every card stands up from its place like a pop-up book, turned
  // to face you however the floor is turned. CSS 3D rather than a WebGL
  // library: no new dependency, the cards stay real buttons (so tapping,
  // selecting and screen readers all work unchanged), and it runs on any
  // phone. Every visit opens flat, the default the design asked for; 3D is
  // one tap away.
  const TILT = 56;
  const [threeD, setThreeD] = useState(false);
  const [spin, setSpin] = useState(0);
  const [animating, setAnimating] = useState(false);
  const eased = (fn: () => void) => {
    setAnimating(true);
    fn();
    window.setTimeout(() => setAnimating(false), 650);
  };
  const toggle3D = () =>
    eased(() => {
      const next = !threeD;
      setThreeD(next);
      if (!next) setSpin(0);
    });
  // ── full screen ───────────────────────────────────────────────────────────
  // The whole chart, its buttons and the selected person's panel, over the
  // page. A portal to <body> rather than position: fixed where it stands: an
  // ancestor with a backdrop-filter traps a fixed element inside itself, and
  // the Fullscreen API is not offered for anything but video on an iPhone.
  // It sits under the sheets (z-index 60), so adding a relative still opens
  // on top of it.
  const [max, setMax] = useState(false);
  useEffect(() => {
    if (!max) return;
    const root = document.documentElement;
    const before = root.style.overflow;
    root.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMax(false);
    window.addEventListener("keydown", onKey);
    return () => {
      root.style.overflow = before;
      window.removeEventListener("keydown", onKey);
    };
  }, [max]);
  const toggleMax = () => {
    const keep = focus ?? meTreeId;
    setMax((m) => !m);
    // The window changes size, so re-centre on whoever was in view once it has.
    setTimeout(() => (keep ? centreOn(keep, view.k) : fit()), 60);
  };

  const half = { x: rem(layout.width / 2), y: rem(layout.height / 2) };
  const canvasTransform = threeD
    ? `translate(${view.x}px, ${view.y}px) scale(${view.k}) translate(${half.x}, ${half.y}) rotateX(${TILT}deg) rotateZ(${spin}deg) translate(-${half.x}, -${half.y})`
    : `translate(${view.x}px, ${view.y}px) scale(${view.k})`;

  const chart = (
    <div className="kin-treechart" data-max={max || undefined} role={max ? "dialog" : undefined} aria-modal={max || undefined} aria-label={max ? "Family tree, full screen" : undefined}>
      <div
        ref={viewport}
        className="kin-treechart-viewport"
        data-3d={threeD || undefined}
        data-anim={animating || undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
        role="application"
        aria-label="Family tree. Drag to move, pinch or use the buttons to zoom."
      >
        <div
          className="kin-treechart-canvas"
          style={{
            width: rem(layout.width),
            height: rem(layout.height),
            transform: canvasTransform,
            ["--tree-spin" as string]: `${spin}deg`,
            ["--tree-tilt" as string]: `${TILT}deg`,
          }}
        >
          {threeD && <div className="kin-treechart-floor" aria-hidden="true" />}
          <svg className="kin-treechart-lines" viewBox={`0 0 ${layout.width} ${layout.height}`} width="100%" height="100%" aria-hidden="true">
            {layout.couples.map((c) => (
              <line key={`c-${c.a}-${c.b}`} x1={c.x1} y1={c.y} x2={c.x2} y2={c.y} />
            ))}
            {layout.families.map((f) => {
              const ghost = f.parentIds.some((id) => ghostById.has(id));
              return (
                <path
                  key={`f-${f.parentIds.join("+")}`}
                  data-ghost={ghost || undefined}
                  d={[`M${f.fromX},${f.fromY}V${f.barY}`, `M${f.barX1},${f.barY}H${f.barX2}`, ...f.childXs.map((x) => `M${x},${f.barY}V${f.childY}`)].join("")}
                />
              );
            })}
          </svg>

          {layout.people.map((spot) => {
            const ghost = ghostById.get(spot.id);
            const style = { left: rem(spot.x), top: rem(spot.y), width: rem(CARD_W), height: rem(CARD_H) };
            if (ghost?.relation === "sibling") {
              // Two choices in one place, so it is a group of buttons rather
              // than one: brother or sister is only a word to the tree (both
              // share the parents), but it is the word the form then uses.
              return (
                <div key={spot.id} className="kin-treecard kin-treecard-ghost kin-treecard-sibling" style={style} role="group" aria-label="Add a brother or sister">
                  {(["brother", "sister"] as const).map((r) => (
                    <button key={r} type="button" onClick={() => tapped() && setAdding({ to: ghost.of, relation: r })}>
                      <Icon name="plus" size="0.875rem" />
                      Add {r}
                    </button>
                  ))}
                </div>
              );
            }
            if (ghost) {
              return (
                <button
                  key={spot.id}
                  type="button"
                  className="kin-treecard kin-treecard-ghost"
                  style={style}
                  onClick={() => tapped() && setAdding({ to: ghost.of, relation: ghost.relation === "mother" ? "mother" : "father" })}
                >
                  <Icon name="plus" size="1rem" />
                  Add {ghost.relation}
                </button>
              );
            }
            const p = chartById.get(spot.id)!;
            const isMe = p.id === meTreeId;
            const linked = accepted.some((m) => m.ourPersonId === p.id);
            return (
              <button
                key={spot.id}
                type="button"
                className="kin-treecard"
                data-me={isMe || undefined}
                data-selected={p.id === selected || undefined}
                data-branch={p.fromHousehold ? true : undefined}
                style={style}
                onClick={() => {
                  if (!tapped()) return;
                  setSelected(p.id);
                  setAdding(null);
                }}
                aria-label={`${p.fullName}${isMe ? ", you" : ""}${p.birthYear ? `, born ${p.birthYear}` : ""}${p.fromHousehold ? `, from the ${p.fromHousehold} tree` : ""}`}
              >
                <Avatar url={p.avatarUrl} initials={initials(p.fullName)} label={p.fullName} size={34} />
                <span className="kin-treecard-text">
                  <span className="kin-treecard-name">{p.fullName}</span>
                  <span className="kin-treecard-meta">
                    {p.birthYear ? `b. ${p.birthYear}` : "\u00a0"}
                    {linked && <span className="kin-treecard-link"> · linked</span>}
                  </span>
                </span>
                {isMe && <span className="kin-treecard-you">You</span>}
              </button>
            );
          })}
        </div>

      </div>

      {/* The controls sit under the chart rather than floating over it: on a
          phone there is no corner of the canvas that is not somebody's card,
          and the first version covered the one person you were looking at. */}
      <div className="kin-treechart-bar">
        <div className="kin-treechart-tools">
            <button type="button" className="btn btn-secondary btn-icon" aria-label={max ? "Leave full screen" : "Full screen"} aria-pressed={max} onClick={toggleMax}>
              <Icon name={max ? "minimize" : "maximize"} size="1rem" />
            </button>
            <button type="button" className="btn btn-secondary btn-icon" aria-label="Zoom in" onClick={() => zoomAt(1.25)}>
              <Icon name="plus" size="1rem" />
            </button>
            <button type="button" className="btn btn-secondary btn-icon" aria-label="Zoom out" onClick={() => zoomAt(0.8)}>
              <span aria-hidden="true" style={{ font: "600 1.125rem/1 var(--font-heading)" }}>−</span>
            </button>
            <button type="button" className="btn btn-secondary kin-treechart-tool" onClick={fit}>
              Whole tree
            </button>
            <button type="button" className="btn btn-secondary kin-treechart-tool" aria-pressed={threeD} data-on={threeD || undefined} onClick={toggle3D}>
              3D
            </button>
            {threeD && (
              <>
                <button type="button" className="btn btn-secondary btn-icon" aria-label="Turn the tree left" onClick={() => eased(() => setSpin((s) => s - 30))}>
                  <span aria-hidden="true">⟲</span>
                </button>
                <button type="button" className="btn btn-secondary btn-icon" aria-label="Turn the tree right" onClick={() => eased(() => setSpin((s) => s + 30))}>
                  <span aria-hidden="true">⟳</span>
                </button>
              </>
            )}
            {meTreeId && (
              <button
                type="button"
                className="btn btn-secondary kin-treechart-tool"
                onClick={() => {
                  setSelected(meTreeId);
                  centreOn(meTreeId, Math.max(view.k, 0.9));
                }}
              >
                Me
              </button>
            )}
          </div>
          <span className="kin-treechart-count" aria-live="polite">
            {chartPeople.length} {chartPeople.length === 1 ? "person" : "people"}
          {chartPeople.length !== people.length ? ` (${chartPeople.length - people.length} from linked households)` : ""} · {Math.round(view.k * 100)}%
          </span>
      </div>

      {/* What you can do with whoever is selected. Outside the canvas, so it
          stays put and readable however the tree is zoomed. */}
      {focus && chartById.get(focus)?.fromHousehold && (
        <div className="kin-treepanel">
          <div className="kin-treepanel-head">
            <Avatar url={null} initials={initials(chartById.get(focus)!.fullName)} label={chartById.get(focus)!.fullName} size={36} />
            <div style={{ flex: 1, minWidth: 0 }}>
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

      {focus && byId.get(focus) && (
        <SelectedPanel
          inviteCode={inviteCode}
          matches={matches.filter((m) => m.ourPersonId === focus)}
          linkedFamilies={linkedFamilies}
          shownBranches={shown}
          onToggleBranch={toggleBranch}
          person={byId.get(focus)!}
          people={people}
          unaddedMembers={unaddedMembers}
          isMe={focus === meTreeId}
          adding={adding?.to === focus ? adding.relation : null}
          onAdd={(relation) => setAdding({ to: focus, relation })}
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
}: {
  inviteCode: string | null;
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
  return (
    <div className="kin-treepanel">
      <div className="kin-treepanel-head">
        <Avatar url={person.avatarUrl} initials={initials(person.fullName)} label={person.fullName} size={36} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="kin-treepanel-name">
            {person.fullName}
            {isMe && <span className="kin-treecard-you">You</span>}
          </div>
          <div className="kin-treepanel-meta">{person.dob ? `Born ${person.dob}` : "No birthdate recorded"}</div>
        </div>
        {person.memberId && (
          <Link href={`/family/members/${person.memberId}`} className="btn btn-secondary" style={{ minHeight: "2rem", padding: "0 0.75rem", fontSize: "var(--text-sm)" }}>
            View profile
          </Link>
        )}
        {!person.memberId && inviteCode && <InviteRelativeButton name={person.fullName} code={inviteCode} />}
      </div>

      {!person.memberId && unaddedMembers.length > 0 && <LinkProfile person={person} unaddedMembers={unaddedMembers} />}

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
