"use client";

import { createContext, useContext } from "react";
import { FAMILY_TZ } from "@/lib/time";

/** The household's time zone for client components: set once by the (app)
 * layout from families.time_zone, read with useHouseholdZone(). The server
 * side is lib/household-zone.ts. */
const Zone = createContext<string>(FAMILY_TZ);

export function HouseholdZoneProvider({ zone, children }: { zone: string; children: React.ReactNode }) {
  return <Zone.Provider value={zone}>{children}</Zone.Provider>;
}

export function useHouseholdZone(): string {
  return useContext(Zone);
}
