import type { Tables } from "@/lib/database.types";

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
