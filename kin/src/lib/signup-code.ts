/** The code in the "Confirm signup" email, as somebody actually types it.
 *
 * Sign-up confirms with a typed code rather than the emailed link (agreed 13
 * October): Kin will be found through Facebook, and a link tapped in the mail
 * app opens in the phone's own browser, not in Facebook's, so the person who
 * was signing up is left in a browser with no session while the one they
 * started in still asks them to check their email. A code is typed into the
 * screen they are already on.
 *
 * Supabase sends six digits by default and can be set to send up to ten, so
 * both ends are accepted. Spaces and dashes are dropped because phones and
 * people both add them ("123 456"); anything else means it is not the code. */
export function signupCode(raw: string): string | null {
  const code = raw.replace(/[\s-]/g, "");
  return /^\d{6,10}$/.test(code) ? code : null;
}
