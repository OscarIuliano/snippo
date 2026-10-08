import { z } from "zod";

export const channelTypes = ["email", "whatsapp"] as const;
export type ChannelType = (typeof channelTypes)[number];

/**
 * "333 123 4567" -> "+393331234567" (Italian default), "0044 20 ..." -> "+4420...".
 * Returns null when the result is not a plausible E.164 number.
 */
export function normalizePhone(input: string, defaultCountryCode = "39"): string | null {
  let digits = input.replace(/[\s\-().]/g, "");
  if (digits.startsWith("00")) digits = `+${digits.slice(2)}`;
  if (!digits.startsWith("+")) digits = `+${defaultCountryCode}${digits}`;
  return /^\+[1-9]\d{7,14}$/.test(digits) ? digits : null;
}

export const createChannelSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("email"), target: z.string().trim().toLowerCase().email() }),
  z.object({
    type: z.literal("whatsapp"),
    target: z
      .string()
      .transform((value, ctx) => normalizePhone(value) ?? (ctx.addIssue({ code: "custom", message: "Numero non valido" }), z.NEVER)),
  }),
]);

export type CreateChannelInput = z.input<typeof createChannelSchema>;

export interface ChannelRow {
  id: string;
  type: ChannelType;
  target: string;
  isActive: boolean;
}

export interface DeliveryRow {
  id: string;
  channelType: ChannelType;
  target: string;
  /** Null for a test notification. */
  submissionId: string | null;
  contactName: string | null;
  status: "pending" | "sent" | "failed";
  attempts: number;
  lastError: string | null;
  createdAt: string;
}

/** Message on the notifications queue. */
export type NotificationMessage =
  | { kind: "submission"; submissionId: string }
  /** The delivery row is created by the API, so the dashboard shows it as pending right away. */
  | { kind: "test"; deliveryId: string };
