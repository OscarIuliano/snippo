// Deleting an account. Better Auth removes the user, sessions, credentials and memberships;
// this module decides what happens to the organizations the user owns, before that.

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

const PROJECTS = "SELECT id FROM projects WHERE organization_id = ?1";
const WIDGETS = `SELECT id FROM widgets WHERE project_id IN (${PROJECTS})`;

/** Deletes an organization and everything in it, children before parents (D1 enforces foreign keys). */
export function deleteOrganizationStatements(db: D1Database, organizationId: string): D1PreparedStatement[] {
  return [
    `DELETE FROM notification_deliveries WHERE channel_id IN (SELECT id FROM notification_channels WHERE project_id IN (${PROJECTS}))
       OR submission_id IN (SELECT id FROM submissions WHERE project_id IN (${PROJECTS}))`,
    `DELETE FROM notification_channels WHERE project_id IN (${PROJECTS})`,
    `DELETE FROM submissions WHERE project_id IN (${PROJECTS})`,
    `DELETE FROM widget_daily_stats WHERE widget_id IN (${WIDGETS})`,
    `DELETE FROM widget_step_stats WHERE widget_id IN (${WIDGETS})`,
    `DELETE FROM flow_versions WHERE widget_id IN (${WIDGETS})`,
    `DELETE FROM widgets WHERE project_id IN (${PROJECTS})`,
    `DELETE FROM project_domains WHERE project_id IN (${PROJECTS})`,
    `DELETE FROM business_hours WHERE project_id IN (${PROJECTS})`,
    `DELETE FROM closures WHERE project_id IN (${PROJECTS})`,
    `DELETE FROM projects WHERE organization_id = ?1`,
    `DELETE FROM invitations WHERE organization_id = ?1`,
    `DELETE FROM memberships WHERE organization_id = ?1`,
    // Once payments are live, a paid subscription has to be cancelled at the provider first.
    `DELETE FROM subscriptions WHERE organization_id = ?1`,
    `DELETE FROM organizations WHERE id = ?1`,
  ].map((sql) => db.prepare(sql).bind(organizationId));
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
