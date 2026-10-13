"use client";

import type { Ref } from "react";
import { AREAS } from "@/lib/first-open";
import {
  AREA_LABELS,
  PRIORITY_IN_KIN,
  PRIORITY_LABELS,
  PRIVACY_LINE,
  areaLine,
  areaScores,
  oneAppLine,
  readinessScore,
  scoreLabel,
  topThree,
  wantsPrivacyFirst,
  type Answers,
} from "@/lib/check-up";

/** The check-up's result (agreed 13 October): the Family Readiness score and
 * its label, the five bars each with its easy win, what Kin does for each of
 * the visitor's top 3, what it replaces, and -- for anyone who said "privacy
 * first" -- the privacy promise. Worked out here from the answers; nothing
 * is sent. */
export function Results({ answers, onNext, onBack, heading }: { answers: Answers; onNext: () => void; onBack: () => void; heading: Ref<HTMLHeadingElement> }) {
  const score = readinessScore(answers);
  const areas = areaScores(answers);
  const top = topThree(answers);

  return (
    <section className="kin-welcome-step kin-check-results">
      <h2 ref={heading} tabIndex={-1}>
        Your family check-up
      </h2>

      <div className="kin-check-score">
        <p>
          <strong>{score}</strong>
          <span>/100</span>
        </p>
        <p>
          Family Readiness: <strong>{scoreLabel(score)}</strong>
        </p>
      </div>

      <ul className="kin-check-bars">
        {AREAS.map((a) => {
          const v = areas[a];
          if (v === undefined) return null;
          return (
            <li key={a}>
              <div className="kin-check-bar-head">
                <span>{AREA_LABELS[a]}</span>
                <span>{v}</span>
              </div>
              <div className="kin-check-bar" role="meter" aria-label={AREA_LABELS[a]} aria-valuemin={0} aria-valuemax={100} aria-valuenow={v}>
                <span style={{ width: `${v}%` }} />
              </div>
              <p>{areaLine(a, v)}</p>
            </li>
          );
        })}
      </ul>

      {top.length > 0 && (
        <>
          <h3 className="kin-check-sub">What you said matters most</h3>
          <ol className="kin-check-top">
            {top.map((p) => (
              <li key={p}>
                <span>You said {PRIORITY_LABELS[p]}</span>
                <span>
                  In Kin, {PRIORITY_IN_KIN[p].line}
                  {PRIORITY_IN_KIN[p].plus && <span className="kin-plus-badge">PLUS</span>}
                </span>
              </li>
            ))}
          </ol>
        </>
      )}

      <p className="kin-check-callout">{oneAppLine(answers)}</p>
      {wantsPrivacyFirst(answers) && <p className="kin-check-callout">{PRIVACY_LINE}</p>}

      <button type="button" className="btn btn-primary btn-block kin-welcome-cta" onClick={onNext}>
        See how it works
      </button>
      <button type="button" className="btn btn-ghost kin-check-secondary" onClick={onBack}>
        Back
      </button>
    </section>
  );
}
