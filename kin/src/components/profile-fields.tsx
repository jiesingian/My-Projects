import type { ProfileFields } from "@/lib/actions/profile";
import { formatDate, formatAge } from "@/lib/format";

type FieldSpec = { key: keyof ProfileFields; label: string; type?: "text" | "date" | "email" | "tel" };
type FieldGroup = { title: string; fields: FieldSpec[] };

/** Grouped and sequenced per the member-record layout: education and work
 * history first, then the personal/contact/ID details, medical last since
 * it duplicates what's already visible on the Health tab. */
export const PROFILE_FIELD_GROUPS: FieldGroup[] = [
  {
    title: "EDUCATION BACKGROUND",
    fields: [
      { key: "high_school", label: "High School" },
      { key: "college", label: "College" },
    ],
  },
  {
    title: "WORK",
    fields: [
      { key: "employer_name", label: "Company Name" },
      { key: "employment_start_date", label: "Hired From", type: "date" },
      { key: "employment_end_date", label: "Hired To", type: "date" },
      { key: "work_contact_info", label: "Work Contact Info" },
      { key: "work_email", label: "Work Email", type: "email" },
    ],
  },
  {
    title: "PERSONAL DETAILS",
    fields: [
      { key: "dob", label: "Date of Birth", type: "date" },
      { key: "place_of_birth", label: "Place of Birth" },
      { key: "height", label: "Height" },
      { key: "weight", label: "Weight" },
      { key: "blood_type", label: "Blood Type" },
      { key: "shoe_size", label: "Shoe Size" },
      { key: "tshirt_size", label: "T-Shirt Size" },
      { key: "pants_size", label: "Shorts/Pants Size" },
    ],
  },
  {
    title: "CONTACT INFORMATION",
    fields: [
      { key: "mobile", label: "Cellphone Number", type: "tel" },
      { key: "email", label: "Email Address", type: "email" },
    ],
  },
  {
    title: "GOVERNMENT IDS",
    fields: [
      { key: "sss_number", label: "SSS Number" },
      { key: "philhealth_number", label: "PhilHealth Number" },
      { key: "pagibig_number", label: "Pag-IBIG Number" },
      { key: "tin_number", label: "TIN" },
    ],
  },
  {
    title: "MEDICAL",
    fields: [
      { key: "allergies", label: "Allergies" },
      { key: "insurance_info", label: "Insurance" },
      { key: "physician_name", label: "Physician" },
    ],
  },
];

function displayValue(fields: ProfileFields, spec: FieldSpec): string {
  const raw = fields[spec.key];
  if (!raw) return "Not recorded";
  return spec.type === "date" ? formatDate(raw) : raw;
}

/** Read-only grouped grid, matching the two-column tile style already used
 * across the app. "Personal Details" gets one extra computed-only tile
 * (Age) derived from DOB rather than stored — it's never independently
 * editable, so it isn't part of ProfileFields. */
export function ProfileFieldsView({ fields }: { fields: ProfileFields }) {
  return (
    <>
      {PROFILE_FIELD_GROUPS.map((group) => (
        <div key={group.title} style={{ marginBottom: 16 }}>
          <div style={{ font: "600 10px/1 var(--font-heading)", letterSpacing: ".14em", color: "var(--color-neutral-600)", marginBottom: 8 }}>
            {group.title}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1, background: "var(--color-divider)", border: "1px solid var(--color-divider)" }}>
            {group.title === "PERSONAL DETAILS" && (
              <div style={{ background: "var(--color-bg)", padding: "10px 12px" }}>
                <div style={{ fontSize: 9, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--color-neutral-600)" }}>Age</div>
                <div style={{ fontSize: 13.5 }}>{formatAge(fields.dob)}</div>
              </div>
            )}
            {group.fields.map((spec) => (
              <div key={spec.key} style={{ background: "var(--color-bg)", padding: "10px 12px" }}>
                <div style={{ fontSize: 9, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--color-neutral-600)" }}>{spec.label}</div>
                <div style={{ fontSize: 13.5 }}>{displayValue(fields, spec)}</div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </>
  );
}

/** Grouped input form, two fields per row. */
export function ProfileFieldsEditor({
  fields,
  set,
  busy,
}: {
  fields: ProfileFields;
  set: <K extends keyof ProfileFields>(key: K, value: ProfileFields[K]) => void;
  busy: boolean;
}) {
  return (
    <>
      {PROFILE_FIELD_GROUPS.map((group) => (
        <div key={group.title} style={{ marginBottom: 16 }}>
          <div style={{ font: "600 10px/1 var(--font-heading)", letterSpacing: ".14em", color: "var(--color-neutral-600)", marginBottom: 8 }}>
            {group.title}
          </div>
          {chunk(group.fields, 2).map((row, i) => (
            <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              {row.map((spec) => (
                <div className="field" key={spec.key} style={{ flex: 1 }}>
                  <label>{spec.label.toUpperCase()}</label>
                  <input
                    className="input"
                    type={spec.type === "date" ? "date" : spec.type === "email" ? "email" : spec.type === "tel" ? "tel" : "text"}
                    value={fields[spec.key] ?? ""}
                    onChange={(e) => set(spec.key, (e.target.value || null) as ProfileFields[typeof spec.key])}
                    style={{ minHeight: 44 }}
                    disabled={busy}
                  />
                </div>
              ))}
            </div>
          ))}
        </div>
      ))}
    </>
  );
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
