import { z } from "zod";
import type { FlowDefinition } from "./flow";

/** Response of GET /v1/widget/config. */
export interface WidgetConfig {
  widgetId: string;
  locale: string;
  theme: { primaryColor: string; position: "right" | "left"; title: string };
  flowVersionId: string;
  flow: FlowDefinition;
}

/** Body of POST /v1/widget/submissions. */
export const submissionInputSchema = z.object({
  flowVersionId: z.string().min(1),
  answers: z.record(z.string().max(2000)),
  consent: z.literal(true),
  sourceUrl: z.string().url().max(2000).optional(),
  locale: z.string().max(10).optional(),
});

export type SubmissionInput = z.infer<typeof submissionInputSchema>;
