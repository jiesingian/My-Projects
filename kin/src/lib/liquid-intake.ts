/** Matches the check constraint on liquid_intake_log.glasses. Generous for a
 * day's drinking, and low enough that the long-press picker stays one screen. */
export const MAX_GLASSES = 24;

export const LIQUID_INTAKE_TYPES = ["water", "juice", "milk"] as const;
export type LiquidIntakeType = (typeof LIQUID_INTAKE_TYPES)[number];
export const LIQUID_INTAKE_LABEL: Record<LiquidIntakeType, string> = { water: "Water", juice: "Juice", milk: "Milk" };

export type LiquidIntakeMember = {
  id: string;
  name: string;
  avatarUrl: string | null;
  glasses: Record<LiquidIntakeType, number>;
};
