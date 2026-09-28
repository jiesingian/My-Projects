/**
 * The Filipino way of naming a household: the wife's maiden surname, then
 * the husband's -- "Santos-Reyes Household". Only ever a suggestion on
 * "Create a family" (agreed 28 September): single parents, grandparents
 * raising grandchildren and blended families name theirs however they like.
 */
export function suggestHouseholdName(maidenSurname: string, husbandSurname: string): string {
  const tidy = (s: string) => s.trim().replace(/\s+/g, " ");
  const surnames = [tidy(maidenSurname), tidy(husbandSurname)].filter(Boolean);
  // The same surname twice (cousins marry, or it was typed in both) reads once.
  if (surnames.length === 2 && surnames[0].toLowerCase() === surnames[1].toLowerCase()) surnames.pop();
  return surnames.length ? `${surnames.join("-")} Household` : "";
}
