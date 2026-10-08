import { z } from "zod";

export const retentionSchema = z.object({ retentionMonths: z.number().int().min(1).max(60) });
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
