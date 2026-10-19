"use client";

import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/icons";
import { PWNED_RANGE_URL, breachCandidates, breachCount, findings, rangePrefix, sha1Hex, type HealthItem } from "@/lib/password-health";

async function range(prefix: string, padded: boolean): Promise<string> {
  const r = await fetch(PWNED_RANGE_URL + prefix, {
    headers: padded ? { "Add-Padding": "true" } : undefined,
    referrerPolicy: "no-referrer",
    credentials: "omit",
    cache: "no-store",
  });
  if (!r.ok) throw new Error(String(r.status));
  return r.text();
}

/** Password health, at the top of the unlocked vault (lib/password-health.ts):
 * the passwords worth changing, each with why and a "Change it" that opens
 * its edit form. Worked out on this phone each time; nothing is saved. */
export function PasswordHealth({ items, onChange }: { items: HealthItem[]; onChange: (id: string) => void }) {
  // id -> breach count, filled in as the range answers come back. null until
  // the check has run (or if it couldn't), so the rest shows at once.
  const [breached, setBreached] = useState<Map<string, number> | null>(null);
  const [offline, setOffline] = useState(false);
  const key = items.map((i) => `${i.id}:${i.secret}`).join("\n");

  useEffect(() => {
    let live = true;
    (async () => {
      const candidates = breachCandidates(items);
      const hashes = await Promise.all(candidates.map(async (i) => ({ id: i.id, hash: await sha1Hex(i.secret) })));
      // One request per prefix: a password used twice is asked about once.
      const answers = new Map<string, Promise<string>>();
      for (const { hash } of hashes) {
        const prefix = rangePrefix(hash);
        if (!answers.has(prefix)) {
          answers.set(
            prefix,
            // Padded first (the answer's size then says nothing either); if
            // that request is refused, plain -- still only the prefix.
            range(prefix, true).catch(() => range(prefix, false)),
          );
        }
      }
      const bodies = new Map(await Promise.all([...answers].map(async ([prefix, body]) => [prefix, await body] as const)));
      const found = new Map<string, number>();
      for (const { id, hash } of hashes) found.set(id, breachCount(bodies.get(rangePrefix(hash)) ?? "", hash));
      if (live) setBreached(found);
    })().catch(() => live && setOffline(true));
    return () => {
      live = false;
    };
    // The secrets themselves are the dependency; `items` is a new array each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const list = useMemo(() => findings(items, breached ?? undefined), [items, breached]);
  if (items.length === 0) return null;

  return (
    <section className="kin-vault-health" aria-label="Password health">
      <h4>
        <Icon name="shieldCheck" size={15} /> Password health
      </h4>
      {list.length === 0 ? (
        <p className="kin-vault-sub" style={{ margin: 0 }}>
          {breached
            ? "All good: none are used twice, easy to guess, or in a known breach."
            : offline
              ? "None are used twice or easy to guess. The breach check needs a connection."
              : "Checking…"}
        </p>
      ) : (
        <>
          <p className="kin-vault-sub" style={{ margin: "0 0 0.5rem" }}>
            {list.length === 1 ? "One is worth changing" : `${list.length} are worth changing`} when you have a moment.
            {!breached && !offline && " Still checking the breach lists…"}
          </p>
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: "0.5rem" }}>
            {list.map((f) => (
              <li key={f.id} style={{ display: "flex", alignItems: "flex-start", gap: "0.5rem" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="kin-vault-label">{f.label}</div>
                  {f.reasons.map((r) => (
                    <div key={r} className="kin-vault-sub">
                      {r}
                    </div>
                  ))}
                </div>
                <button type="button" className="kin-vault-text" onClick={() => onChange(f.id)}>
                  Change it
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="kin-vault-sub" style={{ margin: "0.5rem 0 0", fontSize: "0.6875rem" }}>
        Checked on this phone. For the breach check only the first 5 characters of a scrambled copy (SHA-1) go to Have I Been Pwned; your passwords never leave the phone and nothing is saved.
      </p>
    </section>
  );
}
