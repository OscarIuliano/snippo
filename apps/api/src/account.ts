// Deleting an account, and the projects and organizations in it. Better Auth removes the user,
// sessions, credentials and memberships; this module decides what happens to the organizations
// the user owns, before that.

export interface OwnedOrganization {
  id: string;
  name: string;
  /** People in the organization, the owner included. */
  members: number;
  projects: number;
}

export async function ownedOrganizations(db: D1Database, userId: string): Promise<OwnedOrganization[]> {
  const { results } = await db
    .prepare(
      `SELECT o.id, o.name,
         (SELECT count(*) FROM memberships m2 WHERE m2.organization_id = o.id) AS members,
         (SELECT count(*) FROM projects p WHERE p.organization_id = o.id) AS projects
       FROM organizations o JOIN memberships m ON m.organization_id = o.id
       WHERE m.user_id = ?1 AND m.role = 'owner'
       ORDER BY o.name`,
    )
    .bind(userId)
    .all<OwnedOrganization>();
  return results;
}

/**
 * What deleting this account would do: organizations with other people block it (ownership goes
 * to someone else first, from the Team page); the others are deleted with all their data.
 */
export async function accountDeletionPlan(db: D1Database, userId: string) {
  const owned = await ownedOrganizations(db, userId);
  return { blocking: owned.filter((o) => o.members > 1), deleted: owned.filter((o) => o.members <= 1) };
}

/**
 * Deletes the projects selected by `projectIds` (SQL with ?1) with everything in them,
 * children before parents (D1 enforces foreign keys).
 */
function projectDeletionStatements(db: D1Database, projectIds: string, id: string): D1PreparedStatement[] {
  const widgetIds = `SELECT id FROM widgets WHERE project_id IN (${projectIds})`;
  return [
    `DELETE FROM notification_deliveries WHERE channel_id IN (SELECT id FROM notification_channels WHERE project_id IN (${projectIds}))
       OR submission_id IN (SELECT id FROM submissions WHERE project_id IN (${projectIds}))`,
    `DELETE FROM notification_channels WHERE project_id IN (${projectIds})`,
    `DELETE FROM submissions WHERE project_id IN (${projectIds})`,
    `DELETE FROM widget_daily_stats WHERE widget_id IN (${widgetIds})`,
    `DELETE FROM widget_step_stats WHERE widget_id IN (${widgetIds})`,
    `DELETE FROM flow_versions WHERE widget_id IN (${widgetIds})`,
    `DELETE FROM widgets WHERE project_id IN (${projectIds})`,
    `DELETE FROM project_domains WHERE project_id IN (${projectIds})`,
    `DELETE FROM business_hours WHERE project_id IN (${projectIds})`,
    `DELETE FROM closures WHERE project_id IN (${projectIds})`,
    `DELETE FROM projects WHERE id IN (${projectIds})`,
  ].map((sql) => db.prepare(sql).bind(id));
}

/** Deletes one project: requests, widget, questions, opening hours, domains, notifications, statistics. */
export function deleteProjectStatements(db: D1Database, projectId: string): D1PreparedStatement[] {
  return projectDeletionStatements(db, "?1", projectId);
}

/** Deletes an organization and everything in it. */
export function deleteOrganizationStatements(db: D1Database, organizationId: string): D1PreparedStatement[] {
  return [
    ...projectDeletionStatements(db, "SELECT id FROM projects WHERE organization_id = ?1", organizationId),
    ...[
      `DELETE FROM invitations WHERE organization_id = ?1`,
      `DELETE FROM memberships WHERE organization_id = ?1`,
      // Once payments are live, a paid subscription has to be cancelled at the provider first.
      `DELETE FROM subscriptions WHERE organization_id = ?1`,
      `DELETE FROM organizations WHERE id = ?1`,
    ].map((sql) => db.prepare(sql).bind(organizationId)),
  ];
}

export class AccountDeletionBlocked extends Error {
  constructor(readonly organizations: OwnedOrganization[]) {
    super(`Owner of organizations with other members: ${organizations.map((o) => o.name).join(", ")}`);
  }
}

/** Called just before Better Auth deletes the user: refuses, or deletes the organizations left without anyone. */
export async function prepareAccountDeletion(db: D1Database, userId: string): Promise<void> {
  const plan = await accountDeletionPlan(db, userId);
  if (plan.blocking.length > 0) throw new AccountDeletionBlocked(plan.blocking);
  const statements = plan.deleted.flatMap((o) => deleteOrganizationStatements(db, o.id));
  if (statements.length > 0) await db.batch(statements);
}
