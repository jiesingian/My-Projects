"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon, type IconName } from "@/components/icons";
import { House3D } from "@/components/welcome/house-3d";

/** What a visitor told the home page before signing up. Onboarding reads the
 * family name back to fill in "Household name" (family-fork-form.tsx). Kept in
 * this browser only; nothing is sent anywhere until they create an account. */
export const WELCOME_KEY = "kin-welcome";
export type WelcomeAnswers = { familyName: string; grownUps: number; children: number; wants: string[] };

type Feature = { id: string; icon: IconName; title: string; line: string; points: string[] };

const FEATURES: Feature[] = [
  { id: "money", icon: "wallet", title: "Money, together", line: "What’s left this month, who’s paying what, and when the bills fall due.", points: ["Accounts and budgets in one view", "Bills and due dates in one list", "A Whose picker for each person’s share"] },
  { id: "schedule", icon: "calendarDays", title: "One family calendar", line: "Everyone’s school, work and plans, with chores the kids earn stars for.", points: ["Syncs with Google Calendar", "Chores with stars and rewards", "Today shows what needs you"] },
  { id: "memories", icon: "images", title: "Memories that stay", line: "A family journal with photos you can open full screen, react to and share with relatives.", points: ["Photos, milestones and first days", "Reactions and comments", "Shared with linked relatives, photos included"] },
  { id: "health", icon: "shieldCheck", title: "Health and documents", line: "Check-ups, records and passports behind one vault that opens with Face ID.", points: ["Vaccinations and check-ups on time", "Documents and passwords in the vault", "A PIN or Face ID on each person’s phone"] },
  { id: "home", icon: "basket", title: "Groceries and meals", line: "A buy list with prices, what’s in the pantry, and what’s for dinner.", points: ["Shopping list with running cost", "Pantry and price book", "Meal plans for the week"] },
  { id: "chat", icon: "message", title: "Family chat", line: "The group chat that lives next to everything it’s about.", points: ["Photos, polls and @mentions", "Replies and pinned messages", "Kin AI when you want a hand"] },
];
const ALWAYS: Feature = {
  id: "tree",
  icon: "users",
  title: "Your family tree",
  line: "Parents, brothers, sisters and grandparents, in 2D or 3D, linked to each person’s profile.",
  points: ["Link with relatives' households", "Kid view for children, set by a grown-up", "Every profile a tap away"],
};

const STEPS = ["hello", "name", "who", "wants", "tour"] as const;
type Step = (typeof STEPS)[number];

/** The public home page (items 1 and 11 of the revision list): a 3D house,
 * setup one question at a time, then a tour of the features -- the ones the
 * visitor said they want first -- before sign-up. */
export function Welcome() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("hello");
  const [familyName, setFamilyName] = useState("");
  const [grownUps, setGrownUps] = useState(2);
  const [children, setChildren] = useState(1);
  const [wants, setWants] = useState<string[]>([]);
  const [code, setCode] = useState("");
  const [slide, setSlide] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const tourRef = useRef<HTMLDivElement>(null);

  const index = STEPS.indexOf(step);
  const go = (s: Step) => setStep(s);
  // Each step moves focus to its question, so a screen reader hears it and a
  // keyboard starts in the right place.
  useEffect(() => {
    if (step !== "hello") heading.current?.focus();
  }, [step]);

  const tour = [...FEATURES.filter((f) => wants.includes(f.id)), ...FEATURES.filter((f) => !wants.includes(f.id)), ALWAYS];

  const save = () => {
    const answers: WelcomeAnswers = { familyName: familyName.trim(), grownUps, children, wants };
    try {
      localStorage.setItem(WELCOME_KEY, JSON.stringify(answers));
    } catch {
      // A private window: onboarding just asks for the name again.
    }
  };

  const title = familyName.trim() || "your family";

  return (
    <main className="kin-welcome">
      <header className="kin-welcome-top">
        <span className="kin-welcome-logo">Kin</span>
        <Link href="/login" className="btn btn-ghost" style={{ minHeight: "2.25rem" }}>
          Sign in
        </Link>
      </header>

      {step !== "hello" && (
        <div className="kin-welcome-progress" aria-label={`Step ${index} of ${STEPS.length - 1}`}>
          {STEPS.slice(1).map((s, i) => (
            <span key={s} data-done={i < index || undefined} />
          ))}
        </div>
      )}

      {step === "hello" && (
        <section className="kin-welcome-hero">
          <House3D />
          <h1>Your family, in one home.</h1>
          <p>Money, plans, memories, health and the people you love, in one place everyone in the house shares.</p>
          <button type="button" className="btn btn-primary btn-block kin-welcome-cta" onClick={() => go("name")}>
            Set up our Kin
          </button>
          <p className="kin-welcome-small">It takes a minute. Nothing is saved until you create an account.</p>
        </section>
      )}

      {step === "name" && (
        <section className="kin-welcome-step">
          <h2 ref={heading} tabIndex={-1}>What do you call your family?</h2>
          <p>It&rsquo;s what everyone sees at the top of Kin. You can change it later.</p>
          <input
            className="input kin-welcome-input"
            value={familyName}
            onChange={(e) => setFamilyName(e.target.value)}
            placeholder="The Reyes Family"
            maxLength={80}
            aria-label="Family name"
            onKeyDown={(e) => e.key === "Enter" && go("who")}
          />
          <StepNav onBack={() => go("hello")} onNext={() => go("who")} nextLabel={familyName.trim() ? "Next" : "Skip for now"} />
        </section>
      )}

      {step === "who" && (
        <section className="kin-welcome-step">
          <h2 ref={heading} tabIndex={-1}>Who lives with {title}?</h2>
          <p>So Kin can set up the right number of places. Children don&rsquo;t need an email.</p>
          <Stepper label="Grown-ups" value={grownUps} min={1} max={8} onChange={setGrownUps} />
          <Stepper label="Children" value={children} min={0} max={10} onChange={setChildren} />
          <StepNav onBack={() => go("name")} onNext={() => go("wants")} />
        </section>
      )}

      {step === "wants" && (
        <section className="kin-welcome-step">
          <h2 ref={heading} tabIndex={-1}>What would help most?</h2>
          <p>Pick as many as you like. We&rsquo;ll show you those first.</p>
          <div className="kin-welcome-chips">
            {FEATURES.map((f) => {
              const on = wants.includes(f.id);
              return (
                <button key={f.id} type="button" className="kin-welcome-chip" aria-pressed={on} data-on={on || undefined} onClick={() => setWants((w) => (on ? w.filter((x) => x !== f.id) : [...w, f.id]))}>
                  <Icon name={f.icon} size={18} />
                  {f.title}
                </button>
              );
            })}
          </div>
          <StepNav
            onBack={() => go("who")}
            onNext={() => {
              setSlide(0);
              go("tour");
            }}
            nextLabel="Show me"
          />
        </section>
      )}

      {step === "tour" && (
        <section className="kin-welcome-step kin-welcome-tourstep">
          <h2 ref={heading} tabIndex={-1}>Here&rsquo;s {familyName.trim() ? `${title}’s` : "your"} Kin</h2>
          <div
            className="kin-welcome-tour"
            ref={tourRef}
            onScroll={(e) => {
              const el = e.currentTarget;
              setSlide(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)));
            }}
          >
            {tour.map((f) => (
              <article key={f.id} className="kin-welcome-card" data-picked={wants.includes(f.id) || undefined}>
                <span className="kin-welcome-card-ico">
                  <Icon name={f.icon} size={24} />
                </span>
                <h3>{f.title}</h3>
                <p>{f.line}</p>
                <ul>
                  {f.points.map((pt) => (
                    <li key={pt}>{pt}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
          <div className="kin-welcome-dots" role="tablist" aria-label="Features">
            {tour.map((f, i) => (
              <button
                key={f.id}
                type="button"
                role="tab"
                aria-selected={i === slide}
                aria-label={f.title}
                data-on={i === slide || undefined}
                onClick={() => tourRef.current?.scrollTo({ left: i * tourRef.current.clientWidth, behavior: "smooth" })}
              />
            ))}
          </div>
          <button
            type="button"
            className="btn btn-primary btn-block kin-welcome-cta"
            onClick={() => {
              save();
              router.push("/signup");
            }}
          >
            Create {familyName.trim() ? `${title}’s` : "our family’s"} Kin
          </button>
          <form
            className="kin-welcome-join"
            onSubmit={(e) => {
              e.preventDefault();
              const c = code.trim().toUpperCase();
              if (!c) return;
              save();
              router.push(`/join/${encodeURIComponent(c)}`);
            }}
          >
            <label htmlFor="kin-welcome-code">Joining a family that&rsquo;s already on Kin?</label>
            <div>
              <input id="kin-welcome-code" className="input" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Invite code" maxLength={12} autoCapitalize="characters" />
              <button type="submit" className="btn btn-secondary" disabled={!code.trim()}>
                Join
              </button>
            </div>
          </form>
          <button type="button" className="btn btn-ghost" onClick={() => go("wants")} style={{ alignSelf: "center" }}>
            Back
          </button>
        </section>
      )}
    </main>
  );
}

function StepNav({ onBack, onNext, nextLabel = "Next" }: { onBack: () => void; onNext: () => void; nextLabel?: string }) {
  return (
    <div className="kin-welcome-nav">
      <button type="button" className="btn btn-ghost" onClick={onBack}>
        Back
      </button>
      <button type="button" className="btn btn-primary" onClick={onNext} style={{ flex: 1 }}>
        {nextLabel}
      </button>
    </div>
  );
}

function Stepper({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (n: number) => void }) {
  return (
    <div className="kin-welcome-stepper">
      <span>{label}</span>
      <div role="group" aria-label={label}>
        <button type="button" aria-label={`One fewer ${label.toLowerCase()}`} disabled={value <= min} onClick={() => onChange(Math.max(min, value - 1))}>
          −
        </button>
        <output aria-live="polite">{value}</output>
        <button type="button" aria-label={`One more ${label.toLowerCase()}`} disabled={value >= max} onClick={() => onChange(Math.min(max, value + 1))}>
          +
        </button>
      </div>
    </div>
  );
}
