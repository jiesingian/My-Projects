import { OPERATOR } from "@/lib/legal";

/** The operator block the three pages end with. */
export function OperatorDetails() {
  const rows: [string, string | null][] = [
    ["Business name", OPERATOR.name],
    ["Address", OPERATOR.address],
    ["Email", OPERATOR.email],
    ["Data Protection Officer", OPERATOR.dpo],
    ["DTI / SEC registration", OPERATOR.registration],
    ["BIR TIN", OPERATOR.tin],
  ];
  return (
    <dl className="kin-legal-operator">
      {rows.map(([k, v]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd>{v ?? "Being registered"}</dd>
        </div>
      ))}
    </dl>
  );
}
