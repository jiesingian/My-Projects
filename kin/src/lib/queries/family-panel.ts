import { getMemberLocations } from "@/lib/queries/family";
import { getLiquidIntake, getMealsForDay } from "@/lib/queries/household";
import { getWeather, type Weather } from "@/lib/weather";
import { LIQUID_INTAKE_TYPES, type LiquidIntakeType } from "@/lib/liquid-intake";

export type FamilyPanelPerson = {
  id: string;
  name: string;
  /** Null when they are not sharing, which is most people most of the time
   * and is shown as nothing rather than as an absence. */
  sharingLocation: boolean;
  lat: number | null;
  lng: number | null;
  locationUpdatedAt: string | null;
  glasses: number;
};

export type FamilyPanel = {
  people: FamilyPanelPerson[];
  meals: { slot: string; dish: string }[];
  weather: Weather | null;
  /** Where the weather came from, so the panel can say "near Mia" rather
   * than presenting a temperature from nowhere. */
  weatherNear: string | null;
};

function todayISO(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

/** The Family panel on Today: who is in the household, where they are if
 * they chose to say, what everyone has drunk, and what is being cooked.
 *
 * The weather is taken from whoever shared a position most recently. There
 * is no household address with coordinates on it, and inventing a settings
 * field for one would be a second thing to keep up to date -- if somebody is
 * already sharing where they are, that is where the family is. If nobody is,
 * there is no weather line, which is honest rather than a guess at a
 * capital city.
 */
export async function getFamilyPanel(familyId: string): Promise<FamilyPanel> {
  const date = todayISO();
  const [locations, intake, mealsResult] = await Promise.all([
    getMemberLocations(familyId),
    getLiquidIntake(familyId, date),
    getMealsForDay(familyId),
  ]);

  const glassesById = new Map(
    intake.map((m) => [
      m.id,
      LIQUID_INTAKE_TYPES.reduce((total, t: LiquidIntakeType) => total + (m.glasses[t] ?? 0), 0),
    ]),
  );

  const people: FamilyPanelPerson[] = locations.map((l) => ({
    id: l.memberId,
    name: l.name,
    sharingLocation: l.sharing,
    lat: l.lat,
    lng: l.lng,
    locationUpdatedAt: l.updatedAt,
    glasses: glassesById.get(l.memberId) ?? 0,
  }));

  const freshest = people
    .filter((p) => p.lat !== null && p.lng !== null)
    .sort((a, b) => (b.locationUpdatedAt ?? "").localeCompare(a.locationUpdatedAt ?? ""))[0];

  const weather = freshest ? await getWeather(freshest.lat!, freshest.lng!) : null;

  return {
    people,
    meals: mealsResult.meals.map((m) => ({ slot: m.slot, dish: m.dish })),
    weather,
    weatherNear: weather && freshest ? freshest.name.split(" ")[0] : null,
  };
}
