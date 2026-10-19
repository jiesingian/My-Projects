"use client";

import type { Ref } from "react";
import { PRIVACY_LINE, SELF_CHECK_LINE, readinessScore, scoreCategory, wantsPrivacyFirst, type Answers } from "@/lib/check-up";
import { PROFILES, blueprintFeatures, blueprintProfile } from "@/lib/blueprint";

/** The check-up's result: Your Family’s Digital Blueprint (Janine, 14
 * October). The Family Digital Readiness Score and its category, and three
 * to five Kin features to start with (Janine, 15 October: no "N places to
 * keep track" line; 19 October: no Family Profile shown, the score and its
 * line say enough). The profile still picks the features and the button's
 * words. Then, for anyone who said "privacy first", the privacy promise.
 * Worked out here from the answers; nothing is sent. */
export function Results({ answers, onNext, onBack, heading }: { answers: Answers; onNext: () => void; onBack: () => void; heading: Ref<HTMLHeadingElement> }) {
  const score = readinessScore(answers);
  const category = scoreCategory(score);
  const profileId = blueprintProfile(answers);
  const profile = PROFILES[profileId];
  const features = blueprintFeatures(answers, profileId);

  return (
    <section className="kin-welcome-step kin-check-results">
      <div className="kin-check-intro">
        <p className="kin-check-eyebrow">Family life, decoded.</p>
        <h2 ref={heading} tabIndex={-1}>
          Your Family’s Digital Blueprint
        </h2>
      </div>

      <div className="kin-check-score">
        <p>
          <strong>{score}</strong>
          <span>/100</span>
        </p>
        <p className="kin-check-eyebrow">Family Digital Readiness Score</p>
        <div className="kin-check-bar" role="meter" aria-label="Family Digital Readiness Score" aria-valuemin={0} aria-valuemax={100} aria-valuenow={score}>
          <span style={{ width: `${score}%` }} />
        </div>
        <h3 className="kin-check-category">{category.name}</h3>
        <p className="kin-check-category-line">{category.line}</p>
        <p className="kin-check-note">{SELF_CHECK_LINE}</p>
      </div>

      <h3 className="kin-check-sub">Your recommended family hub</h3>
      <ul className="kin-check-hub">
        {features.map((f) => (
          <li key={f.id}>
            <span>
              {f.title}
              {f.plus && <span className="kin-plus-badge">PLUS</span>}
            </span>
            <span>{f.line}</span>
          </li>
        ))}
      </ul>

      {wantsPrivacyFirst(answers) && <p className="kin-check-callout">{PRIVACY_LINE}</p>}

      <button type="button" className="btn btn-primary btn-block kin-welcome-cta kin-check-profile-cta" onClick={onNext}>
        {profile.cta}
      </button>
      <button type="button" className="btn btn-ghost kin-check-secondary" onClick={onBack}>
        Back
      </button>
    </section>
  );
}
