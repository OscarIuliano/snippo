// Where a new account came from: the UTM parameters of the link that brought the user to the
// landing page, carried to the sign-up page and stored with the account. Only short codes, so
// the field can never hold free text or personal data.

export const utmParams = ["utm_source", "utm_medium", "utm_campaign"] as const;

const PART = /^[A-Za-z0-9._-]{1,50}$/;
const SOURCE = /^[A-Za-z0-9._-]{1,50}( \/ [A-Za-z0-9._-]{1,50}){0,2}$/;

/** "instagram / paid / ristoranti-test" from the UTM parameters, or undefined when there is no valid source. */
export function signupSourceFromParams(params: { get(name: string): string | null | undefined }): string | undefined {
  const source = params.get("utm_source")?.trim();
  if (!source || !PART.test(source)) return undefined;
  const parts = [source];
  for (const name of ["utm_medium", "utm_campaign"] as const) {
    const value = params.get(name)?.trim();
    if (value && PART.test(value)) parts.push(value);
  }
  return parts.join(" / ");
}

export const isSignupSource = (value: unknown): value is string => typeof value === "string" && SOURCE.test(value);
