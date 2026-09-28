"use client";

import Link from "next/link";
import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { Blueprint } from "@/components/ui";
import { FeedPhotos, FeedTalk } from "@/components/feed-talk";
import { SubmitButton, ErrorText } from "@/components/form";
import { confirm } from "@/components/confirm-sheet";
import {
  requestFamilyLinkAction,
  respondFamilyLinkAction,
  revokeFamilyLinkAction,
} from "@/lib/actions/family-links";
import type { ActionState } from "@/lib/actions/auth";
import type { FamilyLink, FeedEntry } from "@/lib/queries/family-links";
import type { FeedOccasion } from "@/lib/occasions";
import { OccasionCard } from "@/components/occasion-card";

const initialState: ActionState = { error: null };

/** Two households' shared memories in one list. Ours are marked, theirs are
 * attributed, and everything is in date order -- which was the whole request:
 * "organise family memories together as one". */
export function FamilyFeed({
  entries,
  links,
  ourCode,
  canManage,
  occasions = [],
}: {
  entries: FeedEntry[];
  links: FamilyLink[];
  ourCode: string;
  canManage: boolean;
  /** Today's birthdays and anniversaries, ours and linked households'. */
  occasions?: FeedOccasion[];
}) {
  const [showLinks, setShowLinks] = useState(false);
  const linked = links.filter((l) => l.status === "accepted");
  const asking = links.filter((l) => l.status === "pending" && !l.weAsked).length;

  // Who the feed reaches, in one line; the codes and requests open under it.
  const reach =
    linked.length === 0
      ? "Just your household so far"
      : `With ${linked.map((l) => l.otherFamilyName).slice(0, 2).join(" and ")}${linked.length > 2 ? ` and ${linked.length - 2} more` : ""}`;

  return (
    <div>
      <button
        type="button"
        className="kin-feed-reach"
        aria-expanded={showLinks}
        onClick={() => setShowLinks((v) => !v)}
      >
        <Icon name="users" size={14} />
        <span className="kin-feed-reach-text">{reach}</span>
        {asking > 0 && <span className="kin-feed-reach-badge">{asking} asking</span>}
        <span className="kin-feed-reach-action">{showLinks ? "Done" : linked.length === 0 ? "Link a household" : "Manage"}</span>
      </button>

      <div className="kin-reveal" data-open={showLinks ? "true" : undefined}>
        <div>
          <LinkManager links={links} ourCode={ourCode} canManage={canManage} />
        </div>
      </div>

      {occasions.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginBottom: "0.5rem" }}>
          {occasions.map((o) => (
            <OccasionCard key={o.eventId} occasion={o} />
          ))}
        </div>
      )}

      {entries.length === 0 ? (
        <Blueprint style={{ padding: "1.125rem 0.9375rem" }}>
          <div style={{ font: "600 0.9375rem/1.2 var(--font-heading)", marginBottom: "0.1875rem" }}>Nothing shared yet</div>
          <div style={{ fontSize: "0.8125rem", color: "var(--color-neutral-600)", lineHeight: 1.45 }}>
            New memories land here on their own, for your household and any household you&rsquo;ve linked with,
            photos included. Older ones can be shared from Household with Share.
          </div>
        </Blueprint>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.875rem" }}>
          {entries.map((e) => (
            <Blueprint key={e.id} className="kin-feed-card" style={{ padding: 0 }}>
              <FeedPhotos photos={e.photos} title={e.title} />
              <div style={{ padding: "0.75rem 0.8125rem 0.8125rem" }}>
                <div style={{ fontSize: "0.75rem", color: e.isOurs ? "var(--color-accent-700)" : "var(--color-neutral-600)", display: "flex", gap: "0.375rem", alignItems: "baseline", flexWrap: "wrap" }}>
                  {e.kind === "milestone" && (
                    <span className="kin-entry-star">
                      <span aria-hidden="true">★</span> Milestone
                    </span>
                  )}
                  <span>{e.isOurs ? "Ours" : e.householdName}</span>
                  <span style={{ color: "var(--color-neutral-500)" }}>· {readableDate(e.entryDate)}</span>
                </div>
                <div style={{ font: "600 1.0625rem/1.2 var(--font-heading)", marginTop: "0.25rem" }}>{e.title}</div>
                {e.note && (
                  <p style={{ fontSize: "0.84375rem", lineHeight: 1.45, color: "var(--color-neutral-800)", margin: "0.3125rem 0 0" }}>{e.note}</p>
                )}
                <FeedTalk entry={e} />
              </div>
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
    <Blueprint style={{ padding: "0.875rem", marginBottom: "0.875rem" }}>
      <p style={{ fontSize: "0.78125rem", lineHeight: 1.45, color: "var(--color-neutral-700)", margin: "0 0 10px" }}>
        A linked household sees your new memories, photos included, and you see theirs. Tap Shared on an entry to
        keep that one private. Money, health, documents and everything else stay where they are. Either side can
        unlink at any time, and sharing stops the moment they do.
      </p>

      <div style={{ fontSize: "0.71875rem", letterSpacing: ".05em", color: "var(--color-neutral-500)", marginBottom: "0.25rem" }}>
        YOUR CODE — GIVE THIS TO THEM
      </div>
      <div style={{ font: "600 1.0625rem/1 var(--font-numeric)", letterSpacing: ".12em", marginBottom: "0.75rem" }}>{ourCode}</div>

      {error && <ErrorText message={error} />}

      {links.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.4375rem", marginBottom: "0.75rem" }}>
          {links.map((l) => (
            <div key={l.id} style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.8125rem", flexWrap: "wrap" }}>
              <span style={{ flex: 1, minWidth: 120 }}>
                {l.otherFamilyName}
                <span style={{ color: "var(--color-neutral-600)" }}>
                  {l.status === "accepted" ? " · linked" : l.weAsked ? " · waiting for them" : " · wants to link"}
                </span>
              </span>
              {/* Talking to them is open to everybody in the house, not only
                  whoever manages the link -- a cousin writing to an aunt is
                  the point of linking at all. */}
              {l.status === "accepted" && (
                <Link href={`/journal/links/${l.id}`} className="btn btn-secondary" style={{ minHeight: "1.875rem", padding: "0 0.625rem", fontSize: "0.78125rem" }}>
                  Message
                </Link>
              )}
              {canManage && l.status === "pending" && !l.weAsked && (
                <>
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={pending}
                    onClick={() => run(() => respondFamilyLinkAction(l.id, true))}
                    style={{ minHeight: "1.75rem", fontSize: "0.75rem", padding: "0 0.625rem" }}
                  >
                    Accept
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={pending}
                    onClick={() => run(() => respondFamilyLinkAction(l.id, false))}
                    style={{ minHeight: "1.75rem", fontSize: "0.75rem", padding: "0 0.625rem" }}
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
                  style={{ minHeight: "1.75rem", fontSize: "0.75rem", padding: "0 0.5rem", color: "var(--color-neutral-700)" }}
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
          <div style={{ fontSize: "0.71875rem", letterSpacing: ".05em", color: "var(--color-neutral-500)", marginBottom: "0.25rem" }}>
            LINK WITH ANOTHER HOUSEHOLD
          </div>
          <div style={{ display: "flex", gap: "0.375rem", flexWrap: "wrap" }}>
            <input
              className="input"
              name="code"
              required
              maxLength={40}
              placeholder="Their code"
              style={{ flex: 1, minWidth: 130, letterSpacing: ".08em" }}
            />
            <SubmitButton style={{ minHeight: "2.5rem", fontSize: "0.8125rem", padding: "0 0.75rem" }}>ASK</SubmitButton>
          </div>
        </form>
      ) : (
        <p style={{ fontSize: "0.78125rem", color: "var(--color-neutral-600)", margin: 0 }}>
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
