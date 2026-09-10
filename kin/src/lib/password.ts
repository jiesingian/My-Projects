/** How short a password Kin will accept, in one place.
 *
 * It was written as the literal 8 in six places across three files -- both
 * checks in the auth actions and four `minLength` attributes on the forms --
 * which is exactly how a number like this drifts: raise it in the action and
 * the form still promises the old one, and the person gets an error for
 * typing what the field asked for.
 *
 * It must not be lower than the "Minimum password length" set in Supabase's
 * dashboard (Authentication -> Attack Protection -> Configure in email
 * provider). If it were, a password this file accepts would be refused by the
 * database, and `signUp` passes Supabase's error text straight through -- so
 * the person would be told, in Supabase's wording rather than ours, that
 * something we had just invited them to type was wrong.
 *
 * Twelve rather than eight because the check that would have caught a
 * *reused* password -- "Prevent use of leaked passwords", the HaveIBeenPwned
 * lookup -- is a paid feature and this project is on the free plan. Length is
 * the part of that protection we can have for nothing.
 */
export const PASSWORD_MIN = 12;

/** Said the same way wherever it is said. */
export const PASSWORD_TOO_SHORT = `Use at least ${PASSWORD_MIN} characters.`;
