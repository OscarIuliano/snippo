import { sql } from "drizzle-orm";
import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

// MVP subset of the data model (docs, section 13). Billing and notification
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

// --- Authentication (Better Auth core schema, plural table names) ---

const authTimestamps = {
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
};

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" }).notNull().default(false),
  image: text("image"),
  ...authTimestamps,
});

export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    token: text("token").notNull().unique(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    ...authTimestamps,
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const accounts = sqliteTable(
  "accounts",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: integer("access_token_expires_at", { mode: "timestamp_ms" }),
    refreshTokenExpiresAt: integer("refresh_token_expires_at", { mode: "timestamp_ms" }),
    scope: text("scope"),
    password: text("password"),
    ...authTimestamps,
  },
  (t) => [index("accounts_user_idx").on(t.userId)],
);

export const verifications = sqliteTable("verifications", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  ...authTimestamps,
});

export const memberships = sqliteTable(
  "memberships",
  {
    organizationId: text("organization_id").notNull().references(() => organizations.id),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["owner", "admin", "operator"] }).notNull(),
    ...timestamps,
  },
  (t) => [primaryKey({ columns: [t.organizationId, t.userId] }), index("memberships_user_idx").on(t.userId)],
);
