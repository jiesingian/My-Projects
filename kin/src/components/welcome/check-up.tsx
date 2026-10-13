"use client";

import { useEffect, useRef, useState } from "react";
import { questionsFor, toggle, type Answers } from "@/lib/check-up";

/** The family check-up's questions, one per screen (agreed 13 October). A
 * single answer moves straight on; the others have Next. Nothing here can be
 * answered wrong, and every question can be skipped.
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
  fromEnd = false,
}: {
  answers: Answers;
  onChange: (a: Answers) => void;
  onDone: (a: Answers) => void;
  onExit: () => void;
  focusFirst: boolean;
  fromEnd?: boolean;
}) {
  const [at, setAt] = useState(() => (fromEnd ? questionsFor(answers).length - 1 : 0));
  const heading = useRef<HTMLHeadingElement>(null);
  const moved = useRef(focusFirst);

  const list = questionsFor(answers);
  const q = list[Math.min(at, list.length - 1)];
  const picked = answers[q.id] ?? [];

  useEffect(() => {
    if (moved.current) heading.current?.focus();
    moved.current = true;
  }, [q.id]);

  const next = (a: Answers) => {
    const now = questionsFor(a);
    const i = now.findIndex((x) => x.id === q.id);
    if (i + 1 >= now.length) onDone(a);
    else setAt(i + 1);
  };
  const back = () => (at === 0 ? onExit() : setAt(at - 1));

  const pick = (option: string) => {
    const a = { ...answers, [q.id]: toggle(q, picked, option) };
    onChange(a);
    if (q.kind === "one") next(a);
  };

  const full = q.max !== undefined && picked.length >= q.max;

  return (
    <section className="kin-welcome-step kin-check" key={q.id} aria-labelledby="kin-check-q">
      <div className="kin-check-progress">
        <span>
          Question {at + 1} of {list.length}
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

      <div className="kin-welcome-nav">
        <button type="button" className="btn btn-ghost" onClick={back}>
          Back
        </button>
        <button type="button" className="btn btn-primary" style={{ flex: 1 }} onClick={() => next(answers)}>
          {picked.length ? "Next" : "Skip"}
        </button>
      </div>
    </section>
  );
}
