import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

// MVP subset of the data model (docs, section 13). Auth, billing and notification
// tables are added with the features that need them.

const timestamps = {
  createdAt: text("created_at").notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  updatedAt: text("updated_at").notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
};

export const organizations = sqliteTable("organizations", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  ...timestamps,
});

export const projects = sqliteTable(
  "projects",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull().references(() => organizations.id),
    name: text("name").notNull(),
    industry: text("industry", { enum: ["restaurant", "appointments", "info", "b2b", "other"] }).notNull(),
    timezone: text("timezone").notNull().default("Europe/Rome"),
    defaultLocale: text("default_locale").notNull().default("it"),
    ...timestamps,
  },
  (t) => [index("projects_org_idx").on(t.organizationId)],
);

export const projectDomains = sqliteTable(
  "project_domains",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").notNull().references(() => projects.id),
    /** Hostname allowed to embed the project's widgets, e.g. "trattoria.it" or "localhost". */
    domain: text("domain").notNull(),
    ...timestamps,
  },
  (t) => [uniqueIndex("project_domains_project_domain_uq").on(t.projectId, t.domain)],
);

export const widgets = sqliteTable(
  "widgets",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").notNull().references(() => projects.id),
    type: text("type", { enum: ["chat"] }).notNull(),
    name: text("name").notNull(),
    publicKey: text("public_key").notNull().unique(),
    /** JSON: { primaryColor, position, title } */
    theme: text("theme", { mode: "json" }).notNull(),
    activeFlowVersionId: text("active_flow_version_id"),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    ...timestamps,
  },
  (t) => [index("widgets_project_idx").on(t.projectId)],
);

export const flowVersions = sqliteTable(
  "flow_versions",
  {
    id: text("id").primaryKey(),
    widgetId: text("widget_id").notNull().references(() => widgets.id),
    version: integer("version").notNull(),
    template: text("template"),
    /** JSON: FlowDefinition from @snippo/shared */
    definition: text("definition", { mode: "json" }).notNull(),
    publishedAt: text("published_at"),
    ...timestamps,
  },
  (t) => [uniqueIndex("flow_versions_widget_version_uq").on(t.widgetId, t.version)],
);

export const submissions = sqliteTable(
  "submissions",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").notNull().references(() => projects.id),
    widgetId: text("widget_id").notNull().references(() => widgets.id),
    flowVersionId: text("flow_version_id").notNull().references(() => flowVersions.id),
    status: text("status", { enum: ["new", "confirmed", "rejected", "completed"] }).notNull().default("new"),
    /** JSON: Record<stepKey, string> */
    answers: text("answers", { mode: "json" }).notNull(),
    contactName: text("contact_name"),
    contactPhone: text("contact_phone"),
    contactEmail: text("contact_email"),
    bookingAt: text("booking_at"),
    partySize: integer("party_size"),
    locale: text("locale"),
    sourceUrl: text("source_url"),
    ipHash: text("ip_hash"),
    consentAt: text("consent_at").notNull(),
    idempotencyKey: text("idempotency_key"),
    ...timestamps,
  },
  (t) => [
    index("submissions_project_status_created_idx").on(t.projectId, t.status, t.createdAt),
    index("submissions_project_booking_idx").on(t.projectId, t.bookingAt),
    uniqueIndex("submissions_widget_idempotency_uq").on(t.widgetId, t.idempotencyKey),
  ],
);
