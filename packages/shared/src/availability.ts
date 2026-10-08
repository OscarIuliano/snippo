import { z } from "zod";
import { isIsoDate } from "./format";

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Orario non valido");

export const openingRangeSchema = z
  .object({ weekday: z.number().int().min(0).max(6), opensAt: time, closesAt: time })
  .refine((r) => r.opensAt < r.closesAt, { message: "L'apertura deve precedere la chiusura" });

export const availabilitySettingsSchema = z.object({
  hours: z.array(openingRangeSchema).max(50),
  slotCapacity: z.number().int().min(1).max(10_000).nullable(),
});

const isoDate = z.string().refine(isIsoDate, "Data non valida");

export const addClosureSchema = z
  .object({ dateFrom: isoDate, dateTo: isoDate, reason: z.string().trim().max(100).optional() })
  .refine((c) => c.dateFrom <= c.dateTo, { message: "La fine deve seguire l'inizio" });

export type OpeningRange = z.infer<typeof openingRangeSchema>;
export type AvailabilitySettingsInput = z.infer<typeof availabilitySettingsSchema>;

export interface ClosureRow {
  id: string;
  dateFrom: string;
  dateTo: string;
  reason: string | null;
}

/** GET /api/v1/projects/:id/availability */
export interface AvailabilitySettings extends AvailabilitySettingsInput {
  closures: ClosureRow[];
  /** What slotCapacity counts: people when the flow asks the party size, otherwise bookings. */
  capacityUnit: "people" | "bookings";
  /** Time options of the active flow, the slots the hours apply to. */
  timeOptions: string[];
}

/** GET /v1/widget/availability: bookable times per day ("YYYY-MM-DD"), empty list = not bookable. */
export interface WidgetAvailability {
  days: Record<string, string[]>;
}
