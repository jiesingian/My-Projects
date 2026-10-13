"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { House3D } from "@/components/welcome/house-3d";
import { writeFirstOpen, type ChosenPlan } from "@/lib/first-open";
import { areaScores, questionsFor, readinessScore, topThree, type Answers } from "@/lib/check-up";
import { CheckUp } from "@/components/welcome/check-up";
import { Results } from "@/components/welcome/results";
import { Showcase } from "@/components/welcome/showcase";
import { PlanStep } from "@/components/welcome/plan-step";

type Step = "hello" | "quiz" | "results" | "show" | "plan";

/** The signed-out home page. Since 13 October (docs/BACKLOG.md, "Agreed 13
 * October: first open") it opens on a family check-up rather than on setting
 * the family up: the 3D house and the check-up, or an invite code, or Sign in.
 * `/?start=quiz`, the link ads will use, opens straight at question 1 without
 * the house, so Facebook's in-app browser has nothing heavy to load.
 *
 * Then the result, a few slides from the visitor's top 3, and the plan step,
 * ending at /signup. The answers, the score and the plan go into first-open
 * (this browser only, never sent), where sign-up, Start here and the tour
 * read them.
 *
 * Where the visitor is (step, question, answers) is also kept for this tab
 * in sessionStorage, so following a link out -- the privacy notice, the
 * terms -- and coming back, by Back or by the Kin logo, lands where they
 * were rather than at question 1 with nothing answered. */
const PROGRESS_KEY = "kin-check-up-progress";
type Progress = { step: Step; answers: Answers; at: number };

function readProgress(): Progress | null {
  try {
    const p = JSON.parse(sessionStorage.getItem(PROGRESS_KEY) ?? "null") as Progress | null;
    return p && typeof p.step === "string" && p.answers && typeof p.at === "number" ? p : null;
  } catch {
    return null;
  }
}

export function Welcome({ startQuiz = false }: { startQuiz?: boolean }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(startQuiz ? "quiz" : "hello");
  const [answers, setAnswers] = useState<Answers>({});
  const [at, setAt] = useState(0);
  const restored = useRef(false);
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

  // Back from a link out: pick up where this tab left off. After the first
  // render, so the server's page and the browser's first one agree.
  useEffect(() => {
    const p = readProgress();
    if (p && !startQuiz) {
      opened.current = false;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- browser-only storage, read once after hydration
      setAnswers(p.answers);
      setAt(p.at);
      setStep(p.step);
    }
    restored.current = true;
  }, [startQuiz]);
  useEffect(() => {
    if (!restored.current) return;
    try {
      sessionStorage.setItem(PROGRESS_KEY, JSON.stringify({ step, answers, at } satisfies Progress));
    } catch {
      // Storage refused: the flow still works, it just won't resume.
    }
  }, [step, answers, at]);

  const finish = (a: Answers) => {
    writeFirstOpen({ answers: a, top3: topThree(a), score: readinessScore(a), areas: areaScores(a) });
    setStep("results");
  };
  const choose = (plan: ChosenPlan) => {
    writeFirstOpen({ plan });
    router.push("/signup");
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
              setAt(0);
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

      {step === "quiz" && <CheckUp answers={answers} onChange={setAnswers} onDone={finish} onExit={() => setStep("hello")} focusFirst={!startQuiz} at={at} onMove={setAt} />}
      {step === "results" && (
        <Results
          answers={answers}
          heading={heading}
          onNext={() => setStep("show")}
          onBack={() => {
            // Back from the result lands on the last question.
            setAt(questionsFor(answers).length - 1);
            setStep("quiz");
          }}
        />
      )}

      {step === "show" && <Showcase top3={topThree(answers)} heading={heading} onDone={() => setStep("plan")} onBack={() => setStep("results")} />}

      {step === "plan" && <PlanStep heading={heading} onChoose={choose} onBack={() => setStep("show")} />}
    </main>
  );
}
