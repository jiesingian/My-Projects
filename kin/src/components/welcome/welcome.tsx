"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon, type IconName } from "@/components/icons";
import { House3D } from "@/components/welcome/house-3d";
import { PLANS, pesos } from "@/lib/billing/plans";
import { TRIAL_DAYS } from "@/lib/access";
import { FREE_FEATURES, PLUS_FEATURES } from "@/lib/plan-features";
import { writeFirstOpen } from "@/lib/first-open";
import { areaScores, readinessScore, topThree, type Answers } from "@/lib/check-up";
import { CheckUp } from "@/components/welcome/check-up";

/** What the home page used to ask before sign-up (family name, who's at home).
 * The check-up replaced those questions on 13 October and nothing writes this
 * any more; it stays exported only because onboarding still reads it
 * (family-fork-form.tsx) and copes with it missing. Delete both once nothing
 * imports them. */
export const WELCOME_KEY = "kin-welcome";
export type WelcomeAnswers = { familyName: string; grownUps: number; children: number; wants: string[] };

/** The "why Kin" step: what it replaces, the privacy promise, the price.
 * Each line has to stay true of the app as built -- the privacy one is the
 * same promise as /legal/privacy, and the price comes from plans.ts. */
const WHY: { icon: IconName; title: string; line: string }[] = [
  {
    icon: "house",
    title: "One app instead of five",
    line: "The group chat, the notes app, the calendar and that spreadsheet of bills, in one place everyone in the house shares.",
  },
  {
    icon: "shieldCheck",
    title: "Private to your family",
    line: "Each household is walled off from every other. Nothing is sold, and your records never train AI.",
  },
  {
    icon: "sparkle",
    title: "Free to start, fair to keep",
    line: `${TRIAL_DAYS} days of Kin Plus free, no card needed. Then Kin Free for good, or ${pesos(PLANS.monthly.amountCents)} a month for the whole family, lolo to bunso.`,
  },
];

type Step = "hello" | "quiz" | "why";

/** The signed-out home page. Since 13 October (docs/BACKLOG.md, "Agreed 13
 * October: first open") it opens on a family check-up rather than on setting
 * the family up: the 3D house and the check-up, or an invite code, or Sign in.
 * `/?start=quiz`, the link ads will use, opens straight at question 1 without
 * the house, so Facebook's in-app browser has nothing heavy to load.
 *
 * The answers and the score go into first-open (this browser only, never
 * sent), where sign-up, Start here and the tour read them. */
export function Welcome({ startQuiz = false }: { startQuiz?: boolean }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(startQuiz ? "quiz" : "hello");
  const [answers, setAnswers] = useState<Answers>({});
  // Coming back from the step after the check-up lands on its last question.
  const [back, setBack] = useState(false);
  const [joining, setJoining] = useState(false);
  const [code, setCode] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  const codeInput = useRef<HTMLInputElement>(null);
  const opened = useRef(false);

  // Each step moves focus to its heading, so a screen reader hears it and a
  // keyboard starts in the right place. Not on first load: nothing has moved.
  useEffect(() => {
    if (opened.current && step !== "quiz") heading.current?.focus();
    opened.current = true;
  }, [step]);
  useEffect(() => {
    if (joining) codeInput.current?.focus();
  }, [joining]);

  const finish = (a: Answers) => {
    writeFirstOpen({
      answers: a,
      top3: topThree(a),
      score: readinessScore(a),
      areas: areaScores(a),
    });
    setStep("why");
  };

  return (
    <main className="kin-welcome">
      <header className="kin-welcome-top">
        <span className="kin-welcome-logo">Kin</span>
        <Link href="/login" className="btn btn-ghost kin-check-signin">
          Sign in
        </Link>
      </header>

      {step === "hello" && (
        <section className="kin-welcome-hero">
          <House3D />
          <h1 ref={heading} tabIndex={-1}>
            Your family, in one home.
          </h1>
          <p>How ready is your family for the 2 a.m. emergency, the lost passport, the busy week? Find out in a minute, then see where Kin helps.</p>
          <button
            type="button"
            className="btn btn-primary btn-block kin-welcome-cta"
            onClick={() => {
              setBack(false);
              setStep("quiz");
            }}
          >
            Take the 1-minute family check-up
          </button>
          {joining ? (
            <form
              className="kin-welcome-join kin-check-join"
              onSubmit={(e) => {
                e.preventDefault();
                const c = code.trim().toUpperCase();
                if (c) router.push(`/join/${encodeURIComponent(c)}`);
              }}
            >
              <label htmlFor="kin-welcome-code">Your invite code</label>
              <div>
                <input
                  ref={codeInput}
                  id="kin-welcome-code"
                  className="input"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="Invite code"
                  maxLength={12}
                  autoCapitalize="characters"
                  autoComplete="off"
                />
                <button type="submit" className="btn btn-secondary" disabled={!code.trim()}>
                  Join
                </button>
              </div>
            </form>
          ) : (
            <button type="button" className="btn btn-ghost kin-check-secondary" onClick={() => setJoining(true)}>
              I have an invite code
            </button>
          )}
          <p className="kin-welcome-small">Your answers stay on this phone. Nothing is sent anywhere.</p>
          <nav className="kin-welcome-legal" aria-label="Legal">
            <Link href="/legal/privacy">Privacy</Link>
            <Link href="/legal/terms">Terms</Link>
            <Link href="/legal/refunds">Refunds</Link>
          </nav>
        </section>
      )}

      {step === "quiz" && <CheckUp answers={answers} onChange={setAnswers} onDone={finish} onExit={() => setStep("hello")} focusFirst={!startQuiz} fromEnd={back} />}
      {step === "why" && (
        <section className="kin-welcome-step">
          <h2 ref={heading} tabIndex={-1}>
            Why Kin
          </h2>
          <ul className="kin-why">
            {WHY.map((w) => (
              <li key={w.title}>
                <span className="kin-welcome-card-ico">
                  <Icon name={w.icon} size={22} />
                </span>
                <span>
                  <strong>{w.title}</strong>
                  <span>{w.line}</span>
                </span>
              </li>
            ))}
          </ul>
          {/* Free beside Plus before anyone signs up (approved 6 October),
              from the same lists as the plan screen. */}
          <div className="kin-plans kin-welcome-plans">
            <section className="kin-plan" aria-labelledby="kin-welcome-free">
              <h3 id="kin-welcome-free">Kin Free</h3>
              <p className="kin-plan-price">₱0, for good</p>
              <ul>
                {FREE_FEATURES.map((f) => (
                  <li key={f}>
                    <Icon name="check" size="0.875rem" />
                    {f}
                  </li>
                ))}
              </ul>
            </section>
            <section className="kin-plan" aria-labelledby="kin-welcome-plus">
              <h3 id="kin-welcome-plus">
                Kin Plus <span className="kin-plus-badge">{TRIAL_DAYS} DAYS FREE</span>
              </h3>
              <p className="kin-plan-price">Then {pesos(PLANS.monthly.amountCents)} a month for the whole family</p>
              <ul>
                {PLUS_FEATURES.map((f) => (
                  <li key={f}>
                    <Icon name="check" size="0.875rem" />
                    {f}
                  </li>
                ))}
              </ul>
            </section>
          </div>
          <Link href="/signup" className="btn btn-primary btn-block kin-welcome-cta">
            Create your account
          </Link>
          <p className="kin-welcome-small" style={{ textAlign: "center" }}>
            <Link href="/legal/privacy">How Kin handles your family&rsquo;s information</Link>
          </p>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              setBack(true);
              setStep("quiz");
            }}
            style={{ alignSelf: "center" }}
          >
            Back
          </button>
        </section>
      )}
    </main>
  );
}
