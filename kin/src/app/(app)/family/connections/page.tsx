import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/session";
import { DetailHeader } from "@/components/hub-header";
import { ConnectionsManager } from "@/components/connections-manager";
import { getConnectionCandidates, getConnections } from "@/lib/queries/connections";
import { isGrownUp } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** The people you are connected with, one to one (Janine, 29 September):
 * anyone in your household or a linked one, and people outside the family who
 * gave you their code. A connection is what lets you message someone on their
 * own, and what the Journal's "Connections only" will mean. A link someone
 * shares lands here with ?code= filled in. */
export default async function ConnectionsPage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const me = await getCurrentMember();
  if (!me) redirect("/onboarding/profile");
  const { code } = await searchParams;

  const grownUp = isGrownUp(me.role);
  const supabase = await createClient();
  const [connections, candidates, ownCode] = await Promise.all([
    getConnections(),
    getConnectionCandidates(),
    grownUp ? supabase.rpc("my_connection_code").then((r) => r.data ?? null) : Promise.resolve(null),
  ]);

  return (
    <div>
      <DetailHeader backHref="/family" eyebrow="Family" trail={[{ label: "Family", href: "/family" }, { label: "Connections" }]} />
      <div style={{ padding: "0 var(--gutter) 1.375rem" }}>
        <h2 style={{ fontSize: "1.5rem", margin: "0 0 0.25rem" }}>Connections</h2>
        <p style={{ fontSize: "0.8125rem", lineHeight: 1.45, color: "var(--color-neutral-600)", margin: "0 0 1rem" }}>
          People you can message one to one, inside your family or outside it. Nobody is connected until they say yes,
          and either of you can remove it at any time.
        </p>
        <ConnectionsManager
          connections={connections}
          candidates={candidates}
          ownCode={ownCode}
          canUseCodes={grownUp}
          prefillCode={code && /^[A-Za-z2-9]{8}$/.test(code) ? code.toUpperCase() : ""}
        />
      </div>
    </div>
  );
}
