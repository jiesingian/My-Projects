/** What a person reads when Supabase Auth refuses a sign-up, a resend or a
 * password reset.
 *
 * On 29 September a friend signing up in production read "email rate limit
 * exceeded" in red above the form -- Supabase's own words, passed straight
 * through. The cause was the built-in mailer's hourly cap: two confirmation
 * emails went out within a minute and the third sign-up got a 429 with code
 * `over_email_send_rate_limit`. Nothing was wrong with the friend or their
 * address, and GoTrue had rolled the account back, so the only thing to do
 * was try again later. The message should say exactly that.
 *
 * The `code` field is checked before the message because the message is
 * prose and can change between GoTrue releases; the code is the contract.
 * The message is still matched as a fallback, for older responses and for
 * the resend endpoint, which has at times sent only the text. */

type AuthErrorLike = { code?: string | null; message?: string | null; status?: number | null } | null | undefined;

export const EMAIL_RATE_LIMITED =
  "We couldn't send the email just now — too many sign-ups at once. Try again in a few minutes.";
export const REQUEST_RATE_LIMITED = "Too many attempts in a row. Wait a minute and try again.";
export const AUTH_FALLBACK = "Something went wrong on our side. Try again in a few minutes.";

const RATE_LIMIT_CODES = new Set(["over_email_send_rate_limit", "over_sms_send_rate_limit"]);

/** The mailer's cap, as distinct from being asked for a code too often. */
export function isEmailRateLimit(error: AuthErrorLike): boolean {
  if (!error) return false;
  if (error.code && RATE_LIMIT_CODES.has(error.code)) return true;
  return /email rate limit/i.test(error.message ?? "");
}

export function isRateLimit(error: AuthErrorLike): boolean {
  if (!error) return false;
  if (isEmailRateLimit(error) || error.code === "over_request_rate_limit") return true;
  if (error.status === 429) return true;
  return /rate limit|too many requests/i.test(error.message ?? "");
}

/** The sign-up and resend wording. Returns null for no error, so it can wrap
 * `error` directly. Anything unrecognised falls back to a plain sentence
 * rather than Supabase's text: a person cannot act on the machinery's
 * phrasing, and some of it (whether an address exists) is not ours to say. */
export function humanAuthError(error: AuthErrorLike): string | null {
  if (!error) return null;
  if (isEmailRateLimit(error)) return EMAIL_RATE_LIMITED;
  if (isRateLimit(error)) return REQUEST_RATE_LIMITED;
  switch (error.code) {
    case "email_address_invalid":
    case "validation_failed":
      return "That email address doesn't look right. Check it and try again.";
    case "weak_password":
      return "Choose a stronger password — longer, or less common.";
    case "signup_disabled":
    case "email_provider_disabled":
      return "New accounts can't be created right now. Try again later.";
  }
  return AUTH_FALLBACK;
}
