// Signed, expiring links for "Conferma" / "Rifiuta" in notifications: no login needed,
// and no table either. A token works once in practice, because an action only applies
// to a submission that is still "new".

export type SubmissionAction = "confirmed" | "rejected";

const TTL_MS = 14 * 24 * 60 * 60 * 1000;
const encoder = new TextEncoder();

const toBase64Url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromBase64Url = (value: string) => Uint8Array.from(atob(value.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

function hmacKey(secret: string) {
  return crypto.subtle.importKey("raw", encoder.encode(`snippo-action:${secret}`), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export async function createActionToken(secret: string, submissionId: string, action: SubmissionAction, now = Date.now()): Promise<string> {
  const payload = encoder.encode(`${submissionId}.${action}.${now + TTL_MS}`);
  const signature = await crypto.subtle.sign("HMAC", await hmacKey(secret), payload);
  return `${toBase64Url(payload)}.${toBase64Url(new Uint8Array(signature))}`;
}

/** Returns the token's content, or null when it is malformed, tampered with or expired. */
export async function verifyActionToken(secret: string, token: string, now = Date.now()) {
  try {
    const [payloadPart, signaturePart] = token.split(".");
    if (!payloadPart || !signaturePart) return null;
    const payload = fromBase64Url(payloadPart);
    const valid = await crypto.subtle.verify("HMAC", await hmacKey(secret), fromBase64Url(signaturePart), payload);
    if (!valid) return null;
    const [submissionId, action, expiresAt] = new TextDecoder().decode(payload).split(".");
    if (!submissionId || (action !== "confirmed" && action !== "rejected") || Number(expiresAt) < now) return null;
    return { submissionId, action: action as SubmissionAction };
  } catch {
    return null;
  }
}
