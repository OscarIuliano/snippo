import { Hono } from "hono";
import { v7 as uuidv7 } from "uuid";
import { and, createDb, eq, flowVersions, projectDomains, projects, submissions, widgets } from "@snippo/db";
import {
  flowDefinitionSchema,
  submissionInputSchema,
  validateAnswer,
  type FlowDefinition,
  type WidgetConfig,
} from "@snippo/shared";
import type { AppEnv } from "./env";
import { problem } from "./problem";

export const widgetRoutes = new Hono<AppEnv>();

/** Loads an active widget by public key, only if the request Origin is one of its project's domains. */
async function loadWidgetForOrigin(c: { env: AppEnv["Bindings"]; req: { header(name: string): string | undefined } }, key: string) {
  const db = createDb(c.env.DB);
  const widget = await db.query.widgets.findFirst({
    where: and(eq(widgets.publicKey, key), eq(widgets.isActive, true)),
  });
  if (!widget) return { db, widget: null, allowed: false } as const;

  const origin = c.req.header("Origin");
  const hostname = origin ? safeHostname(origin) : null;
  if (!hostname) return { db, widget, allowed: false } as const;

  const domains = await db
    .select({ domain: projectDomains.domain })
    .from(projectDomains)
    .where(eq(projectDomains.projectId, widget.projectId));
  const allowed = domains.some(({ domain }) => hostname === domain || hostname.endsWith(`.${domain}`));
  return { db, widget, allowed } as const;
}

function safeHostname(origin: string): string | null {
  try {
    return new URL(origin).hostname;
  } catch {
    return null;
  }
}

widgetRoutes.get("/config", async (c) => {
  const key = c.req.query("key");
  if (!key) return problem(c, 400, "Parametro key mancante");

  const { db, widget, allowed } = await loadWidgetForOrigin(c, key);
  if (!widget || !widget.activeFlowVersionId) return problem(c, 404, "Widget non trovato");
  if (!allowed) return problem(c, 403, "Dominio non autorizzato per questo widget");

  const [flowVersion, project] = await Promise.all([
    db.query.flowVersions.findFirst({ where: eq(flowVersions.id, widget.activeFlowVersionId) }),
    db.query.projects.findFirst({ where: eq(projects.id, widget.projectId) }),
  ]);
  if (!flowVersion || !project) return problem(c, 404, "Widget non configurato");

  const config: WidgetConfig = {
    widgetId: widget.id,
    locale: project.defaultLocale,
    theme: widget.theme as WidgetConfig["theme"],
    flowVersionId: flowVersion.id,
    flow: flowDefinitionSchema.parse(flowVersion.definition),
  };
  c.header("Cache-Control", "public, max-age=60");
  c.header("Vary", "Origin");
  return c.json(config);
});

widgetRoutes.post("/submissions", async (c) => {
  const key = c.req.query("key");
  if (!key) return problem(c, 400, "Parametro key mancante");

  const { db, widget, allowed } = await loadWidgetForOrigin(c, key);
  if (!widget) return problem(c, 404, "Widget non trovato");
  if (!allowed) return problem(c, 403, "Dominio non autorizzato per questo widget");

  const parsed = submissionInputSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return problem(c, 422, "Richiesta non valida");
  const input = parsed.data;
  const flowVersion = await db.query.flowVersions.findFirst({
    where: and(eq(flowVersions.id, input.flowVersionId), eq(flowVersions.widgetId, widget.id)),
  });
  if (!flowVersion) return problem(c, 422, "Versione del flusso non valida");

  const flow = flowDefinitionSchema.parse(flowVersion.definition);
  const errors = Object.fromEntries(
    flow.steps
      .map((step) => [step.key, validateAnswer(step, input.answers[step.key])] as const)
      .filter(([, error]) => error !== null),
  );
  if (Object.keys(errors).length > 0) return problem(c, 422, "Risposte non valide", { errors });

  const idempotencyKey = c.req.header("Idempotency-Key")?.slice(0, 100) ?? null;
  if (idempotencyKey) {
    const existing = await db.query.submissions.findFirst({
      where: and(eq(submissions.widgetId, widget.id), eq(submissions.idempotencyKey, idempotencyKey)),
      columns: { id: true },
    });
    if (existing) return c.json(existing, 200);
  }

  const answers = pickFlowAnswers(flow, input.answers);
  const id = uuidv7();
  await db.insert(submissions).values({
    id,
    projectId: widget.projectId,
    widgetId: widget.id,
    flowVersionId: flowVersion.id,
    answers,
    ...extractContactFields(answers),
    locale: input.locale ?? null,
    sourceUrl: input.sourceUrl ?? null,
    ipHash: await hashIp(c.req.header("CF-Connecting-IP"), widget.id),
    consentAt: new Date().toISOString(),
    idempotencyKey,
  });

  return c.json({ id }, 201);
});

/** Keeps only the answers that belong to a step of the flow, trimmed. */
function pickFlowAnswers(flow: FlowDefinition, answers: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const step of flow.steps) {
    const value = answers[step.key]?.trim();
    if (step.type !== "message" && value) result[step.key] = value;
  }
  return result;
}

/** Copies well-known answers into indexed columns, for filters and the calendar view. */
export function extractContactFields(answers: Record<string, string>) {
  const partySize = answers.party_size ? Number(answers.party_size) : null;
  return {
    contactName: answers.name ?? null,
    contactPhone: answers.phone ?? null,
    contactEmail: answers.email ?? null,
    partySize: Number.isInteger(partySize) ? partySize : null,
    // Local time of the business (project timezone), not UTC.
    bookingAt: answers.date ? `${answers.date}T${answers.time ?? "00:00"}` : null,
  };
}

async function hashIp(ip: string | undefined, salt: string): Promise<string | null> {
  if (!ip) return null;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${salt}:${ip}`));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
