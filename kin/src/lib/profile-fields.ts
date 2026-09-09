import type { Tables } from "@/lib/database.types";
import { clamp } from "@/lib/text";

export type ProfileFields = {
  full_name: string;
  dob: string | null;
  // Personal details
  place_of_birth: string | null;
  height: string | null;
  weight: string | null;
  blood_type: string | null;
  shoe_size: string | null;
  tshirt_size: string | null;
  pants_size: string | null;
  // Contact information
  mobile: string | null;
  email: string | null;
  // Education background
  high_school: string | null;
  college: string | null;
  // Work
  employer_name: string | null;
  employment_start_date: string | null;
  employment_end_date: string | null;
  work_contact_info: string | null;
  work_email: string | null;
  // Government IDs
  sss_number: string | null;
  philhealth_number: string | null;
  pagibig_number: string | null;
  tin_number: string | null;
  // Medical
  allergies: string | null;
  insurance_info: string | null;
  physician_name: string | null;
};

const PROFILE_FIELD_KEYS = [
  "full_name",
  "dob",
  "place_of_birth",
  "height",
  "weight",
  "blood_type",
  "shoe_size",
  "tshirt_size",
  "pants_size",
  "mobile",
  "email",
  "high_school",
  "college",
  "employer_name",
  "employment_start_date",
  "employment_end_date",
  "work_contact_info",
  "work_email",
  "sss_number",
  "philhealth_number",
  "pagibig_number",
  "tin_number",
  "allergies",
  "insurance_info",
  "physician_name",
] as const satisfies readonly (keyof ProfileFields)[];

/** Picks just the editable profile fields off a member row, in one place,
 * so the member-detail page doesn't have to enumerate ~25 fields by hand
 * every time this list grows. */
export function memberToProfileFields(member: Tables<"members">): ProfileFields {
  // Same key set, same value types per key (both trace back to the members
  // table) — TS can't verify that correspondence through a generic keyed
  // loop, hence the narrow cast here rather than a 25-field object literal.
  const result: Record<string, unknown> = {};
  for (const key of PROFILE_FIELD_KEYS) {
    result[key] = member[key];
  }
  return result as ProfileFields;
}

/** Kept in step with the maxLength on each field's input in
 * components/profile-fields.tsx -- the client cap is cosmetic on its own,
 * since this is a Server Action reachable with a string of any length
 * regardless of what the form allows. dob/employment dates aren't here:
 * they're validated as dates, not clamped as text. */
const PROFILE_FIELD_MAX_LENGTHS: Partial<Record<keyof ProfileFields, number>> = {
  full_name: 100,
  place_of_birth: 100,
  height: 20,
  weight: 20,
  blood_type: 10,
  shoe_size: 20,
  tshirt_size: 20,
  pants_size: 20,
  mobile: 30,
  email: 150,
  high_school: 150,
  college: 150,
  employer_name: 150,
  work_contact_info: 200,
  work_email: 150,
  sss_number: 30,
  philhealth_number: 30,
  pagibig_number: 30,
  tin_number: 30,
  allergies: 500,
  insurance_info: 300,
  physician_name: 150,
};

export function clampProfileFields(fields: ProfileFields): ProfileFields {
  const result: Record<string, unknown> = { ...fields };
  for (const key of PROFILE_FIELD_KEYS) {
    const max = PROFILE_FIELD_MAX_LENGTHS[key];
    const value = result[key];
    if (max && typeof value === "string") result[key] = clamp(value, max) || null;
  }
  return result as ProfileFields;
}
