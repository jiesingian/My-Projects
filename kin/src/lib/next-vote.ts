/** "What should Kin do next?" (20261029180000_feature_votes.sql): the
 * choices, in the order they are shown. */
export const NEXT_CHOICES = [
  { id: "live_alerts", label: "Typhoon and class-suspension alerts by themselves" },
  { id: "phone_app", label: "A real phone app: alarms, and location with the app closed" },
  { id: "group_calls", label: "Group video calls" },
  { id: "school_more", label: "More for school: grades, fees, teachers" },
  { id: "other", label: "Something else" },
] as const;
export type NextChoice = (typeof NEXT_CHOICES)[number]["id"];
export const isNextChoice = (v: string): v is NextChoice => NEXT_CHOICES.some((c) => c.id === v);
