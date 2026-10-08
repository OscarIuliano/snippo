import { Hono, type Context } from "hono";
import { v7 as uuidv7 } from "uuid";
import {
  and,
  count,
  createDb,
  desc,
  eq,
  flowVersions,
  lt,
  memberships,
  organizations,
  projectDomains,
  projects,
  submissions,
  widgets,
  type Db,
} from "@snippo/db";
import {
  addDomainSchema,
  changeTemplateSchema,
  createProjectSchema,
  flowDefinitionSchema,
  submissionStatuses,
  templates,
  updateSubmissionSchema,
  updateWidgetSchema,
  type MeResponse,
  type ProjectDetail,
  type SubmissionRow,
  type SubmissionStatus,
  type SubmissionsPage,
  type TemplateId,
} from "@snippo/shared";
import type { z } from "zod";
import { createAuth } from "./auth";
import type { AppEnv } from "./env";
import { problem } from "./problem";

interface DashboardEnv extends AppEnv {
  Variables: {
    db: Db;
    user: { id: string; name: string; email: string };
    organizationId: string;
  };
}

type DashboardContext = Context<DashboardEnv>;

export const dashboardRoutes = new Hono<DashboardEnv>();

// Every route below needs a session. Tenant isolation: all queries are scoped to
// c.var.organizationId, never to an id coming from the client alone.
dashboardRoutes.use("*", async (c, next) => {
  const session = await createAuth(c.env).api.getSession({ headers: c.req.raw.headers });
  if (!session) return problem(c, 401, "Accesso richiesto");

  const db = createDb(c.env.DB);
  const membership = await db.query.memberships.findFirst({ where: eq(memberships.userId, session.user.id) });
  if (!membership) return problem(c, 403, "Nessuna organizzazione associata");

  c.set("db", db);
  c.set("user", { id: session.user.id, name: session.user.name, email: session.user.email });
  c.set("organizationId", membership.organizationId);
  await next();
});

async function parseBody<T extends z.ZodTypeAny>(c: DashboardContext, schema: T): Promise<z.infer<T> | null> {
  const parsed = schema.safeParse(await c.req.json().catch(() => null));
  return parsed.success ? parsed.data : null;
}

/** Loads a project only if it belongs to the caller's organization. */
async function ownedProject(c: DashboardContext, projectId: string) {
  return c.var.db.query.projects.findFirst({
    where: and(eq(projects.id, projectId), eq(projects.organizationId, c.var.organizationId)),
  });
}

async function projectWidget(db: Db, projectId: string) {
  return db.query.widgets.findFirst({ where: eq(widgets.projectId, projectId) });
}

function newPublicKey() {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return `pk_live_${[...bytes].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}

/** Publishes the template as a new flow version and makes it the widget's active flow. */
async function publishTemplate(db: Db, widgetId: string, template: TemplateId) {
  const last = await db.query.flowVersions.findFirst({
    where: eq(flowVersions.widgetId, widgetId),
    orderBy: desc(flowVersions.version),
  });
  const id = uuidv7();
  await db.batch([
    db.insert(flowVersions).values({
      id,
      widgetId,
      version: (last?.version ?? 0) + 1,
      template,
      definition: flowDefinitionSchema.parse(templates[template]),
      publishedAt: new Date().toISOString(),
    }),
    db.update(widgets).set({ activeFlowVersionId: id, updatedAt: new Date().toISOString() }).where(eq(widgets.id, widgetId)),
  ]);
}

dashboardRoutes.get("/me", async (c) => {
  const { db, user, organizationId } = c.var;
  const [organization, projectRows, newCounts] = await Promise.all([
    db.query.organizations.findFirst({ where: eq(organizations.id, organizationId) }),
    db.query.projects.findMany({ where: eq(projects.organizationId, organizationId), orderBy: projects.createdAt }),
    db
      .select({ projectId: submissions.projectId, n: count() })
      .from(submissions)
      .innerJoin(projects, eq(projects.id, submissions.projectId))
      .where(and(eq(projects.organizationId, organizationId), eq(submissions.status, "new")))
      .groupBy(submissions.projectId),
  ]);
  const body: MeResponse = {
    user,
    organization: { id: organizationId, name: organization?.name ?? "" },
    projects: projectRows.map((p) => ({
      id: p.id,
      name: p.name,
      industry: p.industry,
      newSubmissions: newCounts.find((n) => n.projectId === p.id)?.n ?? 0,
    })),
  };
  return c.json(body);
});

dashboardRoutes.post("/projects", async (c) => {
  const input = await parseBody(c, createProjectSchema);
  if (!input) return problem(c, 422, "Dati del progetto non validi");

  const { db, organizationId } = c.var;
  const projectId = uuidv7();
  const widgetId = uuidv7();
  await db.batch([
    db.insert(projects).values({ id: projectId, organizationId, name: input.name, industry: input.template }),
    db.insert(projectDomains).values({ id: uuidv7(), projectId, domain: input.domain }),
    db.insert(widgets).values({
      id: widgetId,
      projectId,
      type: "chat",
      name: "Chat",
      publicKey: newPublicKey(),
      theme: { title: input.name, primaryColor: "#c2410c", position: "right" },
    }),
  ]);
  await publishTemplate(db, widgetId, input.template);
  return c.json({ id: projectId }, 201);
});

dashboardRoutes.get("/projects/:id", async (c) => {
  const project = await ownedProject(c, c.req.param("id"));
  if (!project) return problem(c, 404, "Progetto non trovato");

  const { db } = c.var;
  const widget = await projectWidget(db, project.id);
  if (!widget) return problem(c, 404, "Widget non trovato");
  const [flow, domains] = await Promise.all([
    widget.activeFlowVersionId
      ? db.query.flowVersions.findFirst({ where: eq(flowVersions.id, widget.activeFlowVersionId) })
      : undefined,
    db.query.projectDomains.findMany({ where: eq(projectDomains.projectId, project.id), orderBy: projectDomains.createdAt }),
  ]);

  const body: ProjectDetail = {
    id: project.id,
    name: project.name,
    industry: project.industry,
    widget: {
      id: widget.id,
      publicKey: widget.publicKey,
      theme: updateWidgetSchema.parse(widget.theme),
      template: (flow?.template as TemplateId | null) ?? null,
      flow: flow ? flowDefinitionSchema.parse(flow.definition) : null,
    },
    domains: domains.map((d) => ({ id: d.id, domain: d.domain })),
  };
  return c.json(body);
});

dashboardRoutes.patch("/projects/:id/widget", async (c) => {
  const input = await parseBody(c, updateWidgetSchema);
  if (!input) return problem(c, 422, "Impostazioni non valide");
  const project = await ownedProject(c, c.req.param("id"));
  if (!project) return problem(c, 404, "Progetto non trovato");

  await c.var.db
    .update(widgets)
    .set({ theme: input, updatedAt: new Date().toISOString() })
    .where(eq(widgets.projectId, project.id));
  return c.body(null, 204);
});

dashboardRoutes.put("/projects/:id/template", async (c) => {
  const input = await parseBody(c, changeTemplateSchema);
  if (!input) return problem(c, 422, "Template non valido");
  const project = await ownedProject(c, c.req.param("id"));
  if (!project) return problem(c, 404, "Progetto non trovato");
  const widget = await projectWidget(c.var.db, project.id);
  if (!widget) return problem(c, 404, "Widget non trovato");

  await publishTemplate(c.var.db, widget.id, input.template);
  return c.body(null, 204);
});

dashboardRoutes.post("/projects/:id/domains", async (c) => {
  const input = await parseBody(c, addDomainSchema);
  if (!input) return problem(c, 422, "Dominio non valido");
  const project = await ownedProject(c, c.req.param("id"));
  if (!project) return problem(c, 404, "Progetto non trovato");

  const id = uuidv7();
  await c.var.db.insert(projectDomains).values({ id, projectId: project.id, domain: input.domain }).onConflictDoNothing();
  return c.json({ id, domain: input.domain }, 201);
});

dashboardRoutes.delete("/projects/:id/domains/:domainId", async (c) => {
  const project = await ownedProject(c, c.req.param("id"));
  if (!project) return problem(c, 404, "Progetto non trovato");

  await c.var.db
    .delete(projectDomains)
    .where(and(eq(projectDomains.id, c.req.param("domainId")), eq(projectDomains.projectId, project.id)));
  return c.body(null, 204);
});

dashboardRoutes.get("/projects/:id/submissions", async (c) => {
  const project = await ownedProject(c, c.req.param("id"));
  if (!project) return problem(c, 404, "Progetto non trovato");

  const { db } = c.var;
  const status = c.req.query("status") as SubmissionStatus | undefined;
  if (status && !submissionStatuses.includes(status)) return problem(c, 422, "Stato non valido");
  const cursor = c.req.query("cursor");
  const limit = 50;

  const [rows, countRows] = await Promise.all([
    db.query.submissions.findMany({
      where: and(
        eq(submissions.projectId, project.id),
        status ? eq(submissions.status, status) : undefined,
        // UUID v7 ids are time-ordered: the id doubles as the pagination cursor.
        cursor ? lt(submissions.id, cursor) : undefined,
      ),
      orderBy: desc(submissions.id),
      limit: limit + 1,
    }),
    db
      .select({ status: submissions.status, n: count() })
      .from(submissions)
      .where(eq(submissions.projectId, project.id))
      .groupBy(submissions.status),
  ]);

  const items: SubmissionRow[] = rows.slice(0, limit).map((s) => ({
    id: s.id,
    status: s.status,
    answers: s.answers as Record<string, string>,
    contactName: s.contactName,
    contactPhone: s.contactPhone,
    contactEmail: s.contactEmail,
    bookingAt: s.bookingAt,
    partySize: s.partySize,
    createdAt: s.createdAt,
  }));
  const body: SubmissionsPage = {
    items,
    counts: Object.fromEntries(submissionStatuses.map((st) => [st, countRows.find((r) => r.status === st)?.n ?? 0])) as SubmissionsPage["counts"],
    nextCursor: rows.length > limit ? items.at(-1)!.id : null,
  };
  return c.json(body);
});

dashboardRoutes.patch("/submissions/:id", async (c) => {
  const input = await parseBody(c, updateSubmissionSchema);
  if (!input) return problem(c, 422, "Stato non valido");

  const { db, organizationId } = c.var;
  const submission = await db
    .select({ id: submissions.id })
    .from(submissions)
    .innerJoin(projects, eq(projects.id, submissions.projectId))
    .where(and(eq(submissions.id, c.req.param("id")), eq(projects.organizationId, organizationId)))
    .get();
  if (!submission) return problem(c, 404, "Richiesta non trovata");

  await db
    .update(submissions)
    .set({ status: input.status, updatedAt: new Date().toISOString() })
    .where(eq(submissions.id, submission.id));
  return c.body(null, 204);
});
