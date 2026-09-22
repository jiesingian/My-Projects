"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { Blueprint } from "@/components/ui";
import { SubmitButton, ErrorText } from "@/components/form";
import { confirm } from "@/components/confirm-sheet";
import {
  requestFamilyLinkAction,
  respondFamilyLinkAction,
  revokeFamilyLinkAction,
} from "@/lib/actions/family-links";
import type { ActionState } from "@/lib/actions/auth";
import type { FamilyLink, FeedEntry } from "@/lib/queries/family-links";

const initialState: ActionState = { error: null };

/** Two households' shared memories in one list. Ours are marked, theirs are
 * attributed, and everything is in date order -- which was the whole request:
 * "organise family memories together as one". */
export function FamilyFeed({
  entries,
  links,
  ourCode,
  canManage,
}: {
  entries: FeedEntry[];
  links: FamilyLink[];
  ourCode: string;
  canManage: boolean;
}) {
  const [showLinks, setShowLinks] = useState(links.length === 0);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 12, letterSpacing: ".05em", textTransform: "uppercase", color: "var(--color-neutral-600)" }}>
          {links.filter((l) => l.status === "accepted").length > 0 ? "Shared between households" : "Shared memories"}
        </span>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => setShowLinks((v) => !v)}
          style={{ marginLeft: "auto", minHeight: 28, fontSize: 12.5, padding: "0 8px", gap: 4 }}
        >
          <Icon name="users" size={13} />
          {showLinks ? "Hide" : "Households"}
        </button>
      </div>

      <div className="kin-reveal" data-open={showLinks ? "true" : undefined}>
        <div>
          <LinkManager links={links} ourCode={ourCode} canManage={canManage} />
        </div>
      </div>

      {entries.length === 0 ? (
        <Blueprint style={{ padding: "18px 15px" }}>
          <div style={{ font: "600 15px/1.2 var(--font-heading)", marginBottom: 3 }}>Nothing shared yet</div>
          <div style={{ fontSize: 13, color: "var(--color-neutral-600)", lineHeight: 1.45 }}>
            Entries stay private until someone shares them. Open a memory in the List view and choose Share to put it
            here — for your own household, and for any household you&rsquo;ve linked with.
          </div>
        </Blueprint>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {entries.map((e) => (
            <Blueprint key={e.id} style={{ padding: 13 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                <span style={{ font: "600 15.5px/1.2 var(--font-heading)", flex: 1, minWidth: 140 }}>{e.title}</span>
                <span style={{ fontSize: 12, color: "var(--color-neutral-600)", whiteSpace: "nowrap" }}>
                  {readableDate(e.entryDate)}
                </span>
              </div>
              <div style={{ fontSize: 12, color: e.isOurs ? "var(--color-accent-700)" : "var(--color-neutral-600)", marginTop: 3 }}>
                {e.isOurs ? "Ours" : e.householdName}
              </div>
              {e.note && (
                <p style={{ fontSize: 13.5, lineHeight: 1.45, color: "var(--color-neutral-800)", margin: "7px 0 0" }}>{e.note}</p>
              )}
            </Blueprint>
          ))}
        </div>
      )}
    </div>
  );
}

function LinkManager({ links, ourCode, canManage }: { links: FamilyLink[]; ourCode: string; canManage: boolean }) {
  const router = useRouter();
  const [state, formAction] = useActionState(requestFamilyLinkAction, initialState);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const run = (fn: () => Promise<ActionState>) =>
    startTransition(async () => {
      const result = await fn();
      if (result.error) setError(result.error);
      router.refresh();
    });

  return (
    <Blueprint style={{ padding: 14, marginBottom: 14 }}>
      <p style={{ fontSize: 12.5, lineHeight: 1.45, color: "var(--color-neutral-700)", margin: "0 0 10px" }}>
        A linked household sees the memories you mark shared, and you see theirs. Photos and everyone else&rsquo;s
        records stay where they are. Either side can unlink at any time, and sharing stops the moment they do.
      </p>

      <div style={{ fontSize: 11.5, letterSpacing: ".05em", color: "var(--color-neutral-500)", marginBottom: 4 }}>
        YOUR CODE — GIVE THIS TO THEM
      </div>
      <div style={{ font: "600 17px/1 var(--font-numeric)", letterSpacing: ".12em", marginBottom: 12 }}>{ourCode}</div>

      {error && <ErrorText message={error} />}

      {links.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 7, marginBottom: 12 }}>
          {links.map((l) => (
            <div key={l.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, flexWrap: "wrap" }}>
              <span style={{ flex: 1, minWidth: 120 }}>
                {l.otherFamilyName}
                <span style={{ color: "var(--color-neutral-600)" }}>
                  {l.status === "accepted" ? " · linked" : l.weAsked ? " · waiting for them" : " · wants to link"}
                </span>
              </span>
              {canManage && l.status === "pending" && !l.weAsked && (
                <>
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={pending}
                    onClick={() => run(() => respondFamilyLinkAction(l.id, true))}
                    style={{ minHeight: 28, fontSize: 12, padding: "0 10px" }}
                  >
                    Accept
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={pending}
                    onClick={() => run(() => respondFamilyLinkAction(l.id, false))}
                    style={{ minHeight: 28, fontSize: 12, padding: "0 10px" }}
                  >
                    Decline
                  </button>
                </>
              )}
              {canManage && (l.status === "accepted" || l.weAsked) && (
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={pending}
                  onClick={async () => {
                    if (
                      !(await confirm({
                        title: l.status === "accepted" ? `Unlink from ${l.otherFamilyName}?` : "Withdraw the request?",
                        description:
                          l.status === "accepted"
                            ? "They stop seeing your shared memories immediately, and you stop seeing theirs."
                            : "They won't see the request any more.",
                        confirmLabel: l.status === "accepted" ? "Unlink" : "Withdraw",
                      }))
                    )
                      return;
                    run(() => revokeFamilyLinkAction(l.id));
                  }}
                  style={{ minHeight: 28, fontSize: 12, padding: "0 8px", color: "var(--color-neutral-700)" }}
                >
                  {l.status === "accepted" ? "Unlink" : "Withdraw"}
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {canManage ? (
        <form
          action={async (fd) => {
            await formAction(fd);
            router.refresh();
          }}
        >
          <ErrorText message={state.error} />
          <div style={{ fontSize: 11.5, letterSpacing: ".05em", color: "var(--color-neutral-500)", marginBottom: 4 }}>
            LINK WITH ANOTHER HOUSEHOLD
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <input
              className="input"
              name="code"
              required
              maxLength={40}
              placeholder="Their code"
              style={{ flex: 1, minWidth: 130, letterSpacing: ".08em" }}
            />
            <SubmitButton style={{ minHeight: 40, fontSize: 13, padding: "0 12px" }}>ASK</SubmitButton>
          </div>
        </form>
      ) : (
        <p style={{ fontSize: 12.5, color: "var(--color-neutral-600)", margin: 0 }}>
          A parent or another adult can link your household with someone else&rsquo;s.
        </p>
      )}
    </Blueprint>
  );
}

function readableDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}
