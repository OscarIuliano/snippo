import { z } from "zod";

/** Body of POST /v1/widget/events. The widget sends each event once per visitor session. */
export const widgetEventsSchema = z.object({
  events: z
    .array(
      z.discriminatedUnion("type", [
        z.object({ type: z.literal("opened") }),
        z.object({ type: z.literal("started") }),
        z.object({ type: z.literal("step"), stepKey: z.string().regex(/^[a-z][a-z0-9_]*$/).max(64) }),
      ]),
    )
    .min(1)
    .max(20),
});

export type WidgetEvent = z.infer<typeof widgetEventsSchema>["events"][number];

/** GET /api/v1/projects/:id/stats */
export interface ProjectStats {
  from: string;
  to: string;
  totals: { opens: number; starts: number; submissions: number; confirmed: number };
  daily: { date: string; opens: number; starts: number; submissions: number }[];
  /** Questions of the active flow, in order, with the sessions that reached each one. */
  steps: { key: string; prompt: string; reached: number }[];
}
