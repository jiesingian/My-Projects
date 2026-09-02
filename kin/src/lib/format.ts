export function formatAge(dob: string | null): string {
  if (!dob) return "age unknown";
  const birth = new Date(dob);
  const now = new Date();
  let months = (now.getFullYear() - birth.getFullYear()) * 12 + (now.getMonth() - birth.getMonth());
  if (now.getDate() < birth.getDate()) months -= 1;
  if (months < 24) return `${Math.max(months, 0)} month${months === 1 ? "" : "s"}`;
  return `${Math.floor(months / 12)}`;
}

export function formatCurrency(amount: number, currency = "PHP"): string {
  const symbol = currency === "PHP" ? "₱" : currency + " ";
  return symbol + amount.toLocaleString("en-PH", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

export function formatDate(date: string | Date, pattern = "DD/MM/YYYY"): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  if (pattern === "MM/DD/YYYY") return `${mm}/${dd}/${yyyy}`;
  return `${dd}/${mm}/${yyyy}`;
}

export function initials(name: string): string {
  return name.trim().charAt(0).toUpperCase();
}
