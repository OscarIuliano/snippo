const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/** Checks a Turnstile token with Cloudflare. Any network or parsing problem counts as a failure. */
export async function verifyTurnstile(secret: string, token: string, ip?: string): Promise<boolean> {
  const form = new FormData();
  form.append("secret", secret);
  form.append("response", token);
  if (ip) form.append("remoteip", ip);
  try {
    const res = await fetch(SITEVERIFY, { method: "POST", body: form });
    const outcome = (await res.json()) as { success?: boolean };
    return outcome.success === true;
  } catch (error) {
    console.error("[turnstile]", error);
    return false;
  }
}
