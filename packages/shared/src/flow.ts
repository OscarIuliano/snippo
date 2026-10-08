import { z } from "zod";

const baseStep = {
  key: z.string().regex(/^[a-z][a-z0-9_]*$/),
  prompt: z.string().min(1),
  required: z.boolean().default(true),
};

export const flowStepSchema = z.discriminatedUnion("type", [
  z.object({ ...baseStep, type: z.literal("message"), required: z.literal(false).default(false) }),
  z.object({ ...baseStep, type: z.literal("choice"), options: z.array(z.string().min(1)).min(1) }),
  z.object({ ...baseStep, type: z.literal("text"), maxLength: z.number().int().positive().default(500) }),
  z.object({ ...baseStep, type: z.literal("number"), min: z.number().int(), max: z.number().int() }),
  z.object({ ...baseStep, type: z.literal("date") }),
  z.object({ ...baseStep, type: z.literal("time"), options: z.array(z.string().regex(/^\d{2}:\d{2}$/)).min(1) }),
  z.object({ ...baseStep, type: z.literal("phone") }),
  z.object({ ...baseStep, type: z.literal("email") }),
]);

export const flowDefinitionSchema = z.object({
  steps: z.array(flowStepSchema).min(1),
  successMessage: z.string().min(1),
});

export type FlowStep = z.infer<typeof flowStepSchema>;
export type FlowDefinition = z.infer<typeof flowDefinitionSchema>;
export type FlowStepInput = z.input<typeof flowStepSchema>;
export type FlowDefinitionInput = z.input<typeof flowDefinitionSchema>;
