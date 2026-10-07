import { getCurrentMember } from "@/lib/session";
import { FAMILY_TZ } from "@/lib/time";

/** The signed-in household's own time zone (families.time_zone), for the
 * server: "today", times of day and month boundaries all follow it. The
 * member row is cached per request (lib/session), so this costs nothing
 * after the first call. Manila when there is no household -- the default
 * every existing household has. */
export async function householdZone(): Promise<string> {
  const me = await getCurrentMember();
  return me?.families.time_zone || FAMILY_TZ;
}
