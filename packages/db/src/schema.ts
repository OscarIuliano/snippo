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
    /** Max people per time slot (bookings, when the flow has no party size). Null = no limit. */
    slotCapacity: integer("slot_capacity"),
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

// --- Notifications ---

export const notificationChannels = sqliteTable(
  "notification_channels",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").notNull().references(() => projects.id),
    type: text("type", { enum: ["email", "whatsapp"] }).notNull(),
    /** Email address, or phone number in E.164 format (+393331234567). */
    target: text("target").notNull(),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    ...timestamps,
  },
  (t) => [uniqueIndex("notification_channels_project_target_uq").on(t.projectId, t.type, t.target)],
);

export const notificationDeliveries = sqliteTable(
  "notification_deliveries",
  {
    id: text("id").primaryKey(),
    channelId: text("channel_id").notNull().references(() => notificationChannels.id, { onDelete: "cascade" }),
    /** Null for test notifications sent from the dashboard. */
    submissionId: text("submission_id").references(() => submissions.id),
    status: text("status", { enum: ["pending", "sent", "failed"] }).notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    providerMessageId: text("provider_message_id"),
    sentAt: text("sent_at"),
    ...timestamps,
  },
  (t) => [
    // One delivery per channel and submission: a retried queue message never notifies twice.
    uniqueIndex("notification_deliveries_channel_submission_uq").on(t.channelId, t.submissionId),
    index("notification_deliveries_submission_idx").on(t.submissionId),
  ],
);

// --- Availability ---
// No opening hours configured = every day and every time of the flow is bookable.

export const businessHours = sqliteTable(
  "business_hours",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    /** 0 = Monday ... 6 = Sunday. A day can have several ranges (lunch and dinner). */
    weekday: integer("weekday").notNull(),
    /** "HH:MM", local time of the project. A time slot is open when opensAt <= time < closesAt. */
    opensAt: text("opens_at").notNull(),
    closesAt: text("closes_at").notNull(),
    ...timestamps,
  },
  (t) => [index("business_hours_project_idx").on(t.projectId, t.weekday)],
);

export const closures = sqliteTable(
  "closures",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    /** "YYYY-MM-DD", both included. */
    dateFrom: text("date_from").notNull(),
    dateTo: text("date_to").notNull(),
    reason: text("reason"),
    ...timestamps,
  },
  (t) => [index("closures_project_idx").on(t.projectId, t.dateTo)],
);

// --- Widget statistics ---
// Daily counters, one row per widget and day (project timezone): a few rows, cheap to read.
// Each visitor session counts once per counter (the widget dedupes with sessionStorage).

export const widgetDailyStats = sqliteTable(
  "widget_daily_stats",
  {
    widgetId: text("widget_id").notNull().references(() => widgets.id, { onDelete: "cascade" }),
    /** "YYYY-MM-DD" */
    date: text("date").notNull(),
    /** Sessions that opened the chat. */
    opens: integer("opens").notNull().default(0),
    /** Sessions that answered at least one question. */
    starts: integer("starts").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.widgetId, t.date] })],
);

export const widgetStepStats = sqliteTable(
  "widget_step_stats",
  {
    widgetId: text("widget_id").notNull().references(() => widgets.id, { onDelete: "cascade" }),
    date: text("date").notNull(),
    stepKey: text("step_key").notNull(),
    /** Sessions that reached this question. */
    reached: integer("reached").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.widgetId, t.date, t.stepKey] })],
);
