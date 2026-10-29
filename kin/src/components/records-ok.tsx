"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { setRecordsOkAction } from "@/lib/actions/records-ok";

/** One line before a person keeps health or money records in Kin (Jonathan,
 * 29 October; Data Privacy Act section 13; 20261030130000_records_ok.sql).
 * Shown at the top of Family → Health and Wealth until they tap OK. It
 * informs and records; it locks nothing. */
const WORDS: Record<"health" | "money", string> = {
  health:
    "Health records are sensitive. Kin keeps what you add here for your household only, shows it to the people you choose, and you can change or delete it at any time.",
  money:
    "Money records are sensitive. Kin keeps what you add here for your household only, private accounts stay yours, and you can change or delete it at any time.",
};

export function RecordsOk({ area }: { area: "health" | "money" }) {
  const [pending, start] = useTransition();
  const [gone, setGone] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  if (gone) return null;
  return (
    <aside className="kin-records-ok" aria-label={area === "health" ? "About health records" : "About money records"}>
      <p>
        {WORDS[area]} <Link href="/legal/privacy">Privacy notice</Link>
      </p>
      {failed && <p role="alert">{failed}</p>}
      <div className="kin-records-ok-buttons">
        <button
          type="button"
          className="btn btn-primary"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const { error } = await setRecordsOkAction(area);
              if (error) setFailed(error);
              else setGone(true);
            })
          }
        >
          OK
        </button>
      </div>
    </aside>
  );
}
