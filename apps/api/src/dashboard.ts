import { Hono, type Context } from "hono";
import { v7 as uuidv7 } from "uuid";
import {
  and,
  businessHours,
  closures,
  count,
  createDb,
  desc,
  eq,
  flowVersions,
  gte,
  invitations,
  isNull,
  lt,
  memberships,
  ne,
  notificationChannels,
  notificationDeliveries,
  organizations,
  projectDomains,
  projects,
  sql,
  submissions,
  users,
  widgetDailyStats,
  widgetStepStats,
  widgets,
  type Db,
} from "@snippo/db";
import {
  addClosureSchema,
  addDays,
  addDomainSchema,
  availabilitySettingsSchema,
  changeTemplateSchema,
  createChannelSchema,
  createProjectSchema,
  daysBetween,
  flowDefinitionSchema,
  isIsoDate,
  submissionStatuses,
  templates,
  updateSubmissionSchema,
  updateWidgetSchema,
  ORGANIZATION_HEADER,
  canManageProjects,
  canManageTeam,
  createInvitationSchema,
  updateMemberSchema,
  type AvailabilitySettings,
  type Role,
  type TeamResponse,
  type ChannelRow,
  type DeliveryRow,
  type MeResponse,
  type ProjectStats,
  type ProjectDetail,
  type SubmissionRow,
  type SubmissionStatus,
  type SubmissionsPage,
  type TemplateId,
} from "@snippo/shared";
import type { z } from "zod";
import { nowIn, slotSteps } from "./availability";
import { createAuth } from "./auth";
import { createInvitationToken } from "./invitations";
import type { AppEnv } from "./env";
import { problem } from "./problem";

interface DashboardEnv extends AppEnv {
  Variables: {
    db: Db;
    user: { id: string; name: string; email: string };
    organizationId: string;
    role: Role;
    organizations: { id: string; name: string; role: Role }[];
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
  const user = { id: session.user.id, name: session.user.name, email: session.user.email };
  let mine = await userOrganizations(db, user.id);
  if (mine.length === 0) {
    // First use without an invitation: a personal organization, owned by the user.
    const organizationId = uuidv7();
    await db.batch([
      db.insert(organizations).values({ id: organizationId, name: user.name, slug: organizationId }),
      db.insert(memberships).values({ organizationId, userId: user.id, role: "owner" }),
    ]);
    mine = await userOrganizations(db, user.id);
  }
  // Users in several organizations pick one with a header; anything else falls back to the first.
  const current = mine.find((o) => o.id === c.req.header(ORGANIZATION_HEADER)) ?? mine[0]!;

  c.set("db", db);
  c.set("user", user);
  c.set("organizationId", current.id);
  c.set("role", current.role);
  c.set("organizations", mine);
  await next();
});

async function userOrganizations(db: Db, userId: string) {
  return db
    .select({ id: organizations.id, name: organizations.name, role: memberships.role })
    .from(memberships)
    .innerJoin(organizations, eq(organizations.id, memberships.organizationId))
    .where(eq(memberships.userId, userId))
    .orderBy(memberships.createdAt);
}

// Operators handle requests and the calendar, but do not change project settings.
dashboardRoutes.on(["POST", "PUT", "PATCH", "DELETE"], ["/projects", "/projects/*"], async (c, next) => {
  if (!canManageProjects(c.var.role)) return problem(c, 403, "Il tuo ruolo non può modificare le impostazioni");
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
  const { db, user, organizationId, role, organizations: mine } = c.var;
  const [projectRows, newCounts] = await Promise.all([
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
    organization: { id: organizationId, name: mine.find((o) => o.id === organizationId)!.name, role },
    organizations: mine,
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

  const { db, organizationId, user } = c.var;
  const projectId = uuidv7();
  const widgetId = uuidv7();
  await db.batch([
    db.insert(projects).values({ id: projectId, organizationId, name: input.name, industry: input.template }),
    db.insert(projectDomains).values({ id: uuidv7(), projectId, domain: input.domain }),
    // New requests reach whoever created the project from day one.
    db.insert(notificationChannels).values({ id: uuidv7(), projectId, type: "email", target: user.email.toLowerCase() }),
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

const toSubmissionRow = (s: typeof submissions.$inferSelect): SubmissionRow => ({
  id: s.id,
  status: s.status,
  answers: s.answers as Record<string, string>,
  contactName: s.contactName,
  contactPhone: s.contactPhone,
  contactEmail: s.contactEmail,
  bookingAt: s.bookingAt,
  partySize: s.partySize,
  createdAt: s.createdAt,
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

  const items = rows.slice(0, limit).map(toSubmissionRow);
  const body: SubmissionsPage = {
    items,
    counts: Object.fromEntries(submissionStatuses.map((st) => [st, countRows.find((r) => r.status === st)?.n ?? 0])) as SubmissionsPage["counts"],
    nextCursor: rows.length > limit ? items.at(-1)!.id : null,
  };
  return c.json(body);
});

/** Requests with a booking date in [from, to], both "YYYY-MM-DD" inclusive. Rejected ones are left out. */
dashboardRoutes.get("/projects/:id/calendar", async (c) => {
  const from = c.req.query("from") ?? "";
  const to = c.req.query("to") ?? "";
  if (!isIsoDate(from) || !isIsoDate(to) || daysBetween(from, to) < 0 || daysBetween(from, to) > 62) {
    return problem(c, 422, "Intervallo di date non valido (massimo 62 giorni)");
  }
  const project = await ownedProject(c, c.req.param("id"));
  if (!project) return problem(c, 404, "Progetto non trovato");

  // booking_at is "YYYY-MM-DDTHH:MM" local time: string comparison orders it correctly.
  const rows = await c.var.db.query.submissions.findMany({
    where: and(
      eq(submissions.projectId, project.id),
      gte(submissions.bookingAt, from),
      lt(submissions.bookingAt, addDays(to, 1)),
      ne(submissions.status, "rejected"),
    ),
    orderBy: submissions.bookingAt,
    limit: 2000,
  });
  return c.json(rows.map(toSubmissionRow));
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

const toChannelRow = (ch: typeof notificationChannels.$inferSelect): ChannelRow => ({
  id: ch.id,
  type: ch.type,
  target: ch.target,
  isActive: ch.isActive,
});

/** Loads a channel only if it belongs to a project of the caller's organization. */
async function ownedChannel(c: DashboardContext, projectId: string, channelId: string) {
  const project = await ownedProject(c, projectId);
  if (!project) return null;
  const channel = await c.var.db.query.notificationChannels.findFirst({
    where: and(eq(notificationChannels.id, channelId), eq(notificationChannels.projectId, project.id)),
  });
  return channel ? { project, channel } : null;
}

dashboardRoutes.get("/projects/:id/channels", async (c) => {
  const project = await ownedProject(c, c.req.param("id"));
  if (!project) return problem(c, 404, "Progetto non trovato");

  const channels = await c.var.db.query.notificationChannels.findMany({
    where: eq(notificationChannels.projectId, project.id),
    orderBy: notificationChannels.createdAt,
  });
  return c.json(channels.map(toChannelRow));
});

dashboardRoutes.post("/projects/:id/channels", async (c) => {
  const input = await parseBody(c, createChannelSchema);
  if (!input) return problem(c, 422, "Indirizzo o numero non valido");
  const project = await ownedProject(c, c.req.param("id"));
  if (!project) return problem(c, 404, "Progetto non trovato");

  const channel = { id: uuidv7(), projectId: project.id, type: input.type, target: input.target };
  const inserted = await c.var.db.insert(notificationChannels).values(channel).onConflictDoNothing().returning();
  if (inserted.length === 0) return problem(c, 409, "Questo destinatario c'è già");
  return c.json(toChannelRow(inserted[0]!), 201);
});

dashboardRoutes.patch("/projects/:id/channels/:channelId", async (c) => {
  const input = (await c.req.json().catch(() => null)) as { isActive?: unknown } | null;
  if (typeof input?.isActive !== "boolean") return problem(c, 422, "Valore non valido");
  const owned = await ownedChannel(c, c.req.param("id"), c.req.param("channelId"));
  if (!owned) return problem(c, 404, "Canale non trovato");

  await c.var.db
    .update(notificationChannels)
    .set({ isActive: input.isActive, updatedAt: new Date().toISOString() })
    .where(eq(notificationChannels.id, owned.channel.id));
  return c.body(null, 204);
});

dashboardRoutes.delete("/projects/:id/channels/:channelId", async (c) => {
  const owned = await ownedChannel(c, c.req.param("id"), c.req.param("channelId"));
  if (!owned) return problem(c, 404, "Canale non trovato");

  await c.var.db.delete(notificationChannels).where(eq(notificationChannels.id, owned.channel.id));
  return c.body(null, 204);
});

dashboardRoutes.post("/projects/:id/channels/:channelId/test", async (c) => {
  const owned = await ownedChannel(c, c.req.param("id"), c.req.param("channelId"));
  if (!owned) return problem(c, 404, "Canale non trovato");

  const deliveryId = uuidv7();
  await c.var.db.insert(notificationDeliveries).values({ id: deliveryId, channelId: owned.channel.id });
  await c.env.NOTIFICATIONS.send({ kind: "test", deliveryId });
  return c.json({ deliveryId }, 202);
});

dashboardRoutes.get("/projects/:id/deliveries", async (c) => {
  const project = await ownedProject(c, c.req.param("id"));
  if (!project) return problem(c, 404, "Progetto non trovato");

  const rows = await c.var.db
    .select({ delivery: notificationDeliveries, channel: notificationChannels, contactName: submissions.contactName })
    .from(notificationDeliveries)
    .innerJoin(notificationChannels, eq(notificationChannels.id, notificationDeliveries.channelId))
    .leftJoin(submissions, eq(submissions.id, notificationDeliveries.submissionId))
    .where(eq(notificationChannels.projectId, project.id))
    .orderBy(desc(notificationDeliveries.id))
    .limit(20);

  const body: DeliveryRow[] = rows.map(({ delivery, channel, contactName }) => ({
    id: delivery.id,
    channelType: channel.type,
    target: channel.target,
    submissionId: delivery.submissionId,
    contactName,
    status: delivery.status,
    attempts: delivery.attempts,
    lastError: delivery.lastError,
    createdAt: delivery.createdAt,
  }));
  return c.json(body);
});

dashboardRoutes.get("/projects/:id/availability", async (c) => {
  const project = await ownedProject(c, c.req.param("id"));
  if (!project) return problem(c, 404, "Progetto non trovato");

  const { db } = c.var;
  const widget = await projectWidget(db, project.id);
  const flowVersion = widget?.activeFlowVersionId
    ? await db.query.flowVersions.findFirst({ where: eq(flowVersions.id, widget.activeFlowVersionId) })
    : undefined;
  const flow = flowVersion ? flowDefinitionSchema.parse(flowVersion.definition) : null;
  const [hours, closed] = await Promise.all([
    db.query.businessHours.findMany({ where: eq(businessHours.projectId, project.id), orderBy: [businessHours.weekday, businessHours.opensAt] }),
    db.query.closures.findMany({ where: eq(closures.projectId, project.id), orderBy: closures.dateFrom }),
  ]);

  const body: AvailabilitySettings = {
    hours: hours.map(({ weekday, opensAt, closesAt }) => ({ weekday, opensAt, closesAt })),
    slotCapacity: project.slotCapacity,
    closures: closed.map(({ id, dateFrom, dateTo, reason }) => ({ id, dateFrom, dateTo, reason })),
    capacityUnit: flow?.steps.some((s) => s.key === "party_size") ? "people" : "bookings",
    timeOptions: (flow && slotSteps(flow)?.timeOptions) ?? [],
  };
  return c.json(body);
});

/** Replaces the weekly opening hours and the slot capacity. */
dashboardRoutes.put("/projects/:id/availability", async (c) => {
  const input = await parseBody(c, availabilitySettingsSchema);
  if (!input) return problem(c, 422, "Orari non validi: controlla che ogni apertura preceda la chiusura");
  const project = await ownedProject(c, c.req.param("id"));
  if (!project) return problem(c, 404, "Progetto non trovato");

  const { db } = c.var;
  await db.batch([
    db.delete(businessHours).where(eq(businessHours.projectId, project.id)),
    ...input.hours.map((h) => db.insert(businessHours).values({ id: uuidv7(), projectId: project.id, ...h })),
    db.update(projects).set({ slotCapacity: input.slotCapacity, updatedAt: new Date().toISOString() }).where(eq(projects.id, project.id)),
  ]);
  return c.body(null, 204);
});

dashboardRoutes.post("/projects/:id/closures", async (c) => {
  const input = await parseBody(c, addClosureSchema);
  if (!input) return problem(c, 422, "Date di chiusura non valide");
  const project = await ownedProject(c, c.req.param("id"));
  if (!project) return problem(c, 404, "Progetto non trovato");

  const id = uuidv7();
  await c.var.db.insert(closures).values({ id, projectId: project.id, dateFrom: input.dateFrom, dateTo: input.dateTo, reason: input.reason || null });
  return c.json({ id }, 201);
});

dashboardRoutes.delete("/projects/:id/closures/:closureId", async (c) => {
  const project = await ownedProject(c, c.req.param("id"));
  if (!project) return problem(c, 404, "Progetto non trovato");

  await c.var.db.delete(closures).where(and(eq(closures.id, c.req.param("closureId")), eq(closures.projectId, project.id)));
  return c.body(null, 204);
});

/** Usage over the last `days` days (7 to 90, default 30), in the project's timezone. */
dashboardRoutes.get("/projects/:id/stats", async (c) => {
  const project = await ownedProject(c, c.req.param("id"));
  if (!project) return problem(c, 404, "Progetto non trovato");
  const days = Math.min(Math.max(Number(c.req.query("days")) || 30, 7), 90);

  const { db } = c.var;
  const to = nowIn(project.timezone).date;
  const from = addDays(to, -(days - 1));
  const widget = await projectWidget(db, project.id);
  if (!widget) return problem(c, 404, "Widget non trovato");

  const [dailyRows, stepRows, submissionRows, flowVersion] = await Promise.all([
    db.query.widgetDailyStats.findMany({
      where: and(eq(widgetDailyStats.widgetId, widget.id), gte(widgetDailyStats.date, from)),
    }),
    db
      .select({ stepKey: widgetStepStats.stepKey, reached: sql<number>`sum(${widgetStepStats.reached})` })
      .from(widgetStepStats)
      .where(and(eq(widgetStepStats.widgetId, widget.id), gte(widgetStepStats.date, from)))
      .groupBy(widgetStepStats.stepKey),
    // created_at is UTC: one extra day covers the timezone offset, the bucketing below is exact.
    db
      .select({ createdAt: submissions.createdAt, status: submissions.status })
      .from(submissions)
      .where(and(eq(submissions.projectId, project.id), gte(submissions.createdAt, addDays(from, -1)))),
    widget.activeFlowVersionId
      ? db.query.flowVersions.findFirst({ where: eq(flowVersions.id, widget.activeFlowVersionId) })
      : undefined,
  ]);

  const daily = new Map<string, { opens: number; starts: number; submissions: number }>();
  for (let d = from; d <= to; d = addDays(d, 1)) daily.set(d, { opens: 0, starts: 0, submissions: 0 });
  for (const row of dailyRows) {
    const day = daily.get(row.date);
    if (day) Object.assign(day, { opens: row.opens, starts: row.starts });
  }
  let confirmed = 0;
  for (const row of submissionRows) {
    const day = daily.get(nowIn(project.timezone, new Date(row.createdAt)).date);
    if (!day) continue;
    day.submissions++;
    if (row.status === "confirmed" || row.status === "completed") confirmed++;
  }

  const series = [...daily.entries()].map(([date, values]) => ({ date, ...values }));
  const sum = (key: "opens" | "starts" | "submissions") => series.reduce((total, d) => total + d[key], 0);
  const flow = flowVersion ? flowDefinitionSchema.parse(flowVersion.definition) : null;

  const body: ProjectStats = {
    from,
    to,
    totals: { opens: sum("opens"), starts: sum("starts"), submissions: sum("submissions"), confirmed },
    daily: series,
    steps: (flow?.steps ?? [])
      .filter((step) => step.type !== "message")
      .map((step) => ({ key: step.key, prompt: step.prompt, reached: Number(stepRows.find((r) => r.stepKey === step.key)?.reached ?? 0) })),
  };
  return c.json(body);
});

// --- Team ---

dashboardRoutes.get("/team", async (c) => {
  const { db, organizationId, role, user } = c.var;
  const [members, pending] = await Promise.all([
    db
      .select({ userId: users.id, name: users.name, email: users.email, role: memberships.role, joinedAt: memberships.createdAt })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(eq(memberships.organizationId, organizationId))
      .orderBy(memberships.createdAt),
    canManageTeam(role)
      ? db.query.invitations.findMany({
          where: and(eq(invitations.organizationId, organizationId), isNull(invitations.acceptedAt), gte(invitations.expiresAt, new Date().toISOString())),
          orderBy: desc(invitations.createdAt),
        })
      : [],
  ]);
  const body: TeamResponse = {
    members: members.map((m) => ({ ...m, isYou: m.userId === user.id })),
    invitations: pending.map((i) => ({ id: i.id, role: i.role, createdAt: i.createdAt, expiresAt: i.expiresAt })),
  };
  return c.json(body);
});

const ownerOnly = (c: DashboardContext) =>
  canManageTeam(c.var.role) ? null : problem(c, 403, "Solo il titolare può gestire il team");

/** Creates a shareable invitation link. The token is shown only now: only its hash is stored. */
dashboardRoutes.post("/team/invitations", async (c) => {
  const denied = ownerOnly(c);
  if (denied) return denied;
  const input = await parseBody(c, createInvitationSchema);
  if (!input) return problem(c, 422, "Ruolo non valido");

  const { token, tokenHash } = await createInvitationToken();
  const expiresAt = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
  await c.var.db.insert(invitations).values({
    id: uuidv7(),
    organizationId: c.var.organizationId,
    role: input.role,
    tokenHash,
    createdBy: c.var.user.id,
    expiresAt,
  });
  return c.json({ url: `${c.env.DASHBOARD_ORIGIN}/invito/${token}`, expiresAt }, 201);
});

dashboardRoutes.delete("/team/invitations/:id", async (c) => {
  const denied = ownerOnly(c);
  if (denied) return denied;
  await c.var.db
    .delete(invitations)
    .where(and(eq(invitations.id, c.req.param("id")), eq(invitations.organizationId, c.var.organizationId)));
  return c.body(null, 204);
});

/** The owner's membership cannot be changed or removed (no transfer of ownership yet). */
async function memberToManage(c: DashboardContext, userId: string) {
  const member = await c.var.db.query.memberships.findFirst({
    where: and(eq(memberships.organizationId, c.var.organizationId), eq(memberships.userId, userId)),
  });
  if (!member) return { error: problem(c, 404, "Persona non trovata nel team") };
  if (member.role === "owner") return { error: problem(c, 403, "Il ruolo del titolare non si può cambiare") };
  return { member };
}

dashboardRoutes.patch("/team/members/:userId", async (c) => {
  const denied = ownerOnly(c);
  if (denied) return denied;
  const input = await parseBody(c, updateMemberSchema);
  if (!input) return problem(c, 422, "Ruolo non valido");
  const { error } = await memberToManage(c, c.req.param("userId"));
  if (error) return error;

  await c.var.db
    .update(memberships)
    .set({ role: input.role, updatedAt: new Date().toISOString() })
    .where(and(eq(memberships.organizationId, c.var.organizationId), eq(memberships.userId, c.req.param("userId"))));
  return c.body(null, 204);
});

dashboardRoutes.delete("/team/members/:userId", async (c) => {
  const denied = ownerOnly(c);
  if (denied) return denied;
  const { error } = await memberToManage(c, c.req.param("userId"));
  if (error) return error;

  await c.var.db
    .delete(memberships)
    .where(and(eq(memberships.organizationId, c.var.organizationId), eq(memberships.userId, c.req.param("userId"))));
  return c.body(null, 204);
});
