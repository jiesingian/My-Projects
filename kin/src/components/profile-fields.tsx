import type { ProfileFields } from "@/lib/actions/profile";
import { Blueprint } from "@/components/ui";
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

function displayValue(fields: ProfileFields, spec: FieldSpec): string | null {
  const raw = fields[spec.key];
  if (!raw) return null;
  return spec.type === "date" ? formatDate(raw) : raw;
}

function GroupHeader({ title }: { title: string }) {
  return (
    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--color-neutral-600)", padding: "0 4px 7px" }}>{title}</div>
  );
}

/** A grouped inset list: one rounded card per section, a row per field with
 * the label left and the value right, and separators inset to start at the
 * text. Replaces a bordered two-column grid, which drew a cell outline around
 * every value and left a stray empty cell whenever a group had an odd number
 * of fields.
 *
 * "Personal Details" carries one extra row (Age) computed from DOB rather
 * than stored — it's never independently editable, so it isn't part of
 * ProfileFields. */
export function ProfileFieldsView({ fields }: { fields: ProfileFields }) {
  return (
    <>
      {PROFILE_FIELD_GROUPS.map((group) => {
        const rows: { label: string; value: string | null }[] = [
          ...(group.title === "PERSONAL DETAILS" ? [{ label: "Age", value: formatAge(fields.dob) }] : []),
          ...group.fields.map((spec) => ({ label: spec.label, value: displayValue(fields, spec) })),
        ];

        return (
          <div key={group.title} style={{ marginBottom: 20 }}>
            <GroupHeader title={group.title} />
            <Blueprint style={{ paddingLeft: 15 }}>
              {rows.map((row, i) => (
                <div
                  key={row.label}
                  style={{
                    display: "flex",
                    gap: 16,
                    alignItems: "baseline",
                    minHeight: 44,
                    padding: "11px 15px 11px 0",
                    borderTop: i === 0 ? undefined : "1px solid var(--color-divider)",
                  }}
                >
                  <span style={{ fontSize: 15, color: "var(--color-neutral-700)", flex: "none" }}>{row.label}</span>
                  <span
                    style={{
                      fontSize: 15,
                      marginLeft: "auto",
                      minWidth: 0,
                      textAlign: "right",
                      color: row.value ? "var(--color-text)" : "var(--color-neutral-500)",
                    }}
                  >
                    {row.value ?? "Not recorded"}
                  </span>
                </div>
              ))}
            </Blueprint>
          </div>
        );
      })}
    </>
  );
}

/** One field per row — two 17px inputs side by side don't fit a phone without
 * truncating their labels. */
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
        <div key={group.title} style={{ marginBottom: 20 }}>
          <GroupHeader title={group.title} />
          {group.fields.map((spec) => (
            <div className="field" key={spec.key} style={{ marginBottom: 10 }}>
              <label>{spec.label}</label>
              <input
                className="input"
                type={spec.type === "date" ? "date" : spec.type === "email" ? "email" : spec.type === "tel" ? "tel" : "text"}
                value={fields[spec.key] ?? ""}
                onChange={(e) => set(spec.key, (e.target.value || null) as ProfileFields[typeof spec.key])}
                disabled={busy}
              />
            </div>
          ))}
        </div>
      ))}
    </>
  );
}
