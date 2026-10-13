"use client";

import { useEffect, useRef } from "react";
import { answerTip, answered, questionsFor, toggle, type Answers } from "@/lib/check-up";

/** The family check-up's questions, one per screen (agreed 13 October).
 * Nothing here can be answered wrong, but every question needs an answer:
 * Next waits for one. Once answered, the screen shows what Kin does about
 * it, so the answer and the feature that helps with it are seen together.
 *
 * Question 1 says only "Question 1": whether there are kids at home decides
 * whether there are eight questions or nine, and a count that changed while
 * you tapped read as a bug.
 *
 * Focus moves to each question's heading as it arrives, so a screen reader
 * reads it and a keyboard starts in the right place -- except on the very
 * first screen when it is where the page opened (an ad's `/?start=quiz`),
 * where taking focus would only scroll and announce things nobody asked for. */
export function CheckUp({
  answers,
  onChange,
  onDone,
  onExit,
  focusFirst,
  at,
  onMove,
}: {
  answers: Answers;
  onChange: (a: Answers) => void;
  onDone: (a: Answers) => void;
  onExit: () => void;
  focusFirst: boolean;
  /** Which question, kept by the page so a visit to the privacy notice and
   * back comes back to it. */
  at: number;
  onMove: (at: number) => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  const moved = useRef(focusFirst);

  const list = questionsFor(answers);
  const q = list[Math.min(at, list.length - 1)];
  const picked = answers[q.id] ?? [];
  const tip = answerTip(q.id, answers);

  useEffect(() => {
    if (moved.current) heading.current?.focus();
    moved.current = true;
  }, [q.id]);

  const next = (a: Answers) => {
    const now = questionsFor(a);
    const i = now.findIndex((x) => x.id === q.id);
    if (i + 1 >= now.length) onDone(a);
    else onMove(i + 1);
  };
  const back = () => (at === 0 ? onExit() : onMove(at - 1));

  const pick = (option: string) => onChange({ ...answers, [q.id]: toggle(q, picked, option) });

  const full = q.max !== undefined && picked.length >= q.max;

  return (
    <section className="kin-welcome-step kin-check" key={q.id} aria-labelledby="kin-check-q">
      <div className="kin-check-progress">
        <span>
          Question {at + 1}
          {at > 0 && ` of ${list.length}`}
        </span>
        <div role="progressbar" aria-label="Check-up progress" aria-valuemin={0} aria-valuemax={list.length} aria-valuenow={at + 1}>
          <span style={{ width: `${((at + 1) / list.length) * 100}%` }} />
        </div>
      </div>

      <h2 id="kin-check-q" ref={heading} tabIndex={-1}>
        {q.title}
      </h2>
      {q.hint && <p>{q.hint}</p>}

      <div className="kin-check-options" role="group" aria-labelledby="kin-check-q">
        {q.options.map((o) => {
          const rank = picked.indexOf(o.id);
          const on = rank >= 0;
          return (
            <button key={o.id} type="button" className="kin-check-option" aria-pressed={on} data-on={on || undefined} disabled={!on && full} onClick={() => pick(o.id)}>
              {q.kind === "ranked" && (
                <span className="kin-check-rank" aria-hidden="true">
                  {on ? rank + 1 : ""}
                </span>
              )}
              <span>{o.label}</span>
              {q.kind === "ranked" && on && <span className="sr-only">, choice {rank + 1}</span>}
            </button>
          );
        })}
      </div>

      <div className="kin-check-tip" aria-live="polite">
        {tip && (
          <p>
            <strong>How Kin helps</strong>
            {tip.line}
            {tip.plus && <span className="kin-plus-badge">PLUS</span>}
          </p>
        )}
      </div>

      <div className="kin-welcome-nav">
        <button type="button" className="btn btn-ghost" onClick={back}>
          Back
        </button>
        <button type="button" className="btn btn-primary" style={{ flex: 1 }} disabled={!answered(q, answers)} onClick={() => next(answers)}>
          {at === list.length - 1 ? "See my results" : "Next"}
        </button>
      </div>
    </section>
  );
}
