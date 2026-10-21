import { formatCurrency } from "@/lib/format";
import { accountPickerGroups, type PickableAccount } from "@/lib/account-picker";

/** The <option>s of an account picker: most used first, grouped once the
 * list is long (lib/account-picker). Drop it inside any <select>; the
 * select keeps its own empty option, value and handler.
 *
 * `detail` is what follows the name: the balance (money forms), the bank
 * (a task's usual cost, where the balance is beside the point) or "· joint"
 * (a remittance, where a Just-me entry may not land in a joint account, and
 * `disableJoint` greys those out). */
export function AccountOptions({
  accounts,
  currency,
  detail = "balance",
  disableJoint = false,
}: {
  accounts: PickableAccount[];
  currency?: string;
  detail?: "balance" | "institution" | "joint";
  disableJoint?: boolean;
}) {
  const label = (a: PickableAccount) =>
    detail === "balance" && currency
      ? `${a.name} · ${formatCurrency(a.balance, currency)}`
      : detail === "institution"
        ? `${a.name}${a.institution ? ` · ${a.institution}` : ""}`
        : detail === "joint"
          ? `${a.name}${a.is_joint ? " · joint" : ""}`
          : a.name;
  const option = (a: PickableAccount) => (
    <option key={a.id} value={a.id} disabled={disableJoint && a.is_joint}>
      {label(a)}
    </option>
  );
  return (
    <>
      {accountPickerGroups(accounts).map((g) =>
        g.label ? (
          <optgroup key={g.label} label={g.label}>
            {g.accounts.map(option)}
          </optgroup>
        ) : (
          g.accounts.map(option)
        ),
      )}
    </>
  );
}
