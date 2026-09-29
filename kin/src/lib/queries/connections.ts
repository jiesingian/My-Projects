import { createClient } from "@/lib/supabase/server";

/** A connection between two people, or a request on its way to being one
 * (20260929060000_connections.sql). The name and photo are null exactly when
 * the database will not say who it is yet: a request you made by code, until
 * they accept. */
export type Connection = {
  id: string;
  personId: string;
  memberId: string | null;
  fullName: string | null;
  avatarUrl: string | null;
  householdName: string | null;
  status: "pending" | "accepted";
  /** They asked you -- only you can answer it. */
  incoming: boolean;
  via: "tree" | "code";
  requestedAt: string;
};

export type ConnectionCandidate = {
  personId: string;
  memberId: string;
  fullName: string;
  avatarUrl: string | null;
  householdName: string;
  sameHousehold: boolean;
};

export async function getConnections(): Promise<Connection[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("my_connections");
  return (data ?? []).map((r) => ({
    id: r.id,
    personId: r.person_id,
    memberId: r.member_id,
    fullName: r.full_name,
    avatarUrl: r.avatar_url,
    householdName: r.household_name,
    status: r.status === "accepted" ? "accepted" : "pending",
    incoming: r.incoming,
    via: r.via === "code" ? "code" : "tree",
    requestedAt: r.requested_at,
  }));
}

/** People in the family tree you could ask: your household, and linked
 * households that share with relatives. */
export async function getConnectionCandidates(): Promise<ConnectionCandidate[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("connection_candidates");
  return (data ?? []).map((r) => ({
    personId: r.person_id,
    memberId: r.member_id,
    fullName: r.full_name,
    avatarUrl: r.avatar_url,
    householdName: r.household_name,
    sameHousehold: r.same_household,
  }));
}

/** How many requests are waiting on this person's answer -- the badge. */
export async function getIncomingConnectionCount(): Promise<number> {
  return (await getConnections()).filter((c) => c.status === "pending" && c.incoming).length;
}
