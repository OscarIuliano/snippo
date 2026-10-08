import { z } from "zod";
import type { FlowDefinition } from "./flow";
import type { Role } from "./team";
import type { TemplateId } from "./templates";

export const templateIds = ["restaurant", "appointments", "info"] as const satisfies readonly TemplateId[];
export const submissionStatuses = ["new", "confirmed", "rejected", "completed"] as const;
export type SubmissionStatus = (typeof submissionStatuses)[number];

/** "https://www.Trattoria.it/menu" -> "trattoria.it". Returns null when it is not a hostname. */
export function normalizeDomain(input: string): string | null {
  const host = input
    .trim()
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, "")
    .split(/[/?#:]/)[0]!
    .replace(/^www\./, "");
  return /^(localhost|[a-z0-9-]+(\.[a-z0-9-]+)+)$/.test(host) ? host : null;
}

const domainSchema = z
  .string()
  .transform((value, ctx) => normalizeDomain(value) ?? (ctx.addIssue({ code: "custom", message: "Dominio non valido" }), z.NEVER));

export const createProjectSchema = z.object({
  name: z.string().trim().min(2).max(80),
  template: z.enum(templateIds),
  domain: domainSchema,
});

export const updateWidgetSchema = z.object({
  title: z.string().trim().min(1).max(60),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  position: z.enum(["right", "left"]),
});

export const changeTemplateSchema = z.object({ template: z.enum(templateIds) });
export const addDomainSchema = z.object({ domain: domainSchema });
export const updateSubmissionSchema = z.object({ status: z.enum(submissionStatuses) });

export type CreateProjectInput = z.input<typeof createProjectSchema>;
export type UpdateWidgetInput = z.infer<typeof updateWidgetSchema>;

export interface MeResponse {
  user: { id: string; name: string; email: string };
  /** The organization the dashboard is working on, with the user's role in it. */
  organization: { id: string; name: string; role: Role };
  organizations: { id: string; name: string; role: Role }[];
  projects: { id: string; name: string; industry: string; newSubmissions: number }[];
}

export interface ProjectDetail {
  id: string;
  name: string;
  industry: string;
  widget: {
    id: string;
    publicKey: string;
    theme: UpdateWidgetInput;
    template: TemplateId | null;
    flow: FlowDefinition | null;
  };
  domains: { id: string; domain: string }[];
}

export interface SubmissionRow {
  id: string;
  status: SubmissionStatus;
  answers: Record<string, string>;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  bookingAt: string | null;
  partySize: number | null;
  createdAt: string;
}

export interface SubmissionsPage {
  items: SubmissionRow[];
  counts: Record<SubmissionStatus, number>;
  nextCursor: string | null;
}
