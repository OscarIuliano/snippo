import { z } from "zod";

export const retentionSchema = z.object({ retentionMonths: z.number().int().min(1).max(60) });
/** The business's privacy notice; null removes the link. Only web pages: no javascript: or mailto:. */
export const privacyPolicySchema = z.object({
  privacyUrl: z.string().trim().max(500).url().refine((url) => /^https?:\/\//i.test(url)).nullable(),
});

/** "trattoria.it/privacy" -> "https://trattoria.it/privacy": people paste addresses without the scheme. */
export function normalizeUrl(input: string): string {
  const url = input.trim();
  return url && !/^[a-z][a-z0-9+.-]*:/i.test(url) ? `https://${url}` : url;
}

export const eraseSchema = z.object({ ids: z.array(z.string().min(1)).min(1).max(500) });

/** A request matching a person's name, phone or email, for access and erasure requests. */
export interface PrivacyMatch {
  id: string;
  createdAt: string;
  status: string;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
}
