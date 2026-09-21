export const LIQUID_INTAKE_TYPES = ["water", "juice", "milk"] as const;
export type LiquidIntakeType = (typeof LIQUID_INTAKE_TYPES)[number];
export const LIQUID_INTAKE_LABEL: Record<LiquidIntakeType, string> = { water: "Water", juice: "Juice", milk: "Milk" };

export type LiquidIntakeMember = {
  id: string;
  name: string;
  avatarUrl: string | null;
  glasses: Record<LiquidIntakeType, number>;
};
