// Nightly clean-up (Cron Trigger): personal data is kept only as long as each project chose,
// plus expired sessions and invitations. Plain SQL: one statement per kind of data.

/** Submissions past their project's retention period. */
const EXPIRED_SUBMISSIONS = `SELECT s.id FROM submissions s JOIN projects p ON p.id = s.project_id
  WHERE s.created_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-' || p.retention_months || ' months')`;

export interface RetentionReport {
  submissions: number;
  deliveries: number;
  sessions: number;
  invitations: number;
}

export async function runRetention(db: D1Database): Promise<RetentionReport> {
  const [deliveries, submissions, sessions, invitations] = await db.batch([
    db.prepare(`DELETE FROM notification_deliveries WHERE submission_id IN (${EXPIRED_SUBMISSIONS})`),
    db.prepare(`DELETE FROM submissions WHERE id IN (${EXPIRED_SUBMISSIONS})`),
    // Better Auth stores expires_at in milliseconds.
    db.prepare("DELETE FROM sessions WHERE expires_at < unixepoch('now') * 1000"),
    // Kept 30 days after expiry, so the owner still sees what happened to recent ones.
    db.prepare(`DELETE FROM invitations WHERE accepted_at IS NULL AND expires_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-30 days')`),
  ]);
  const report = {
    deliveries: deliveries!.meta.changes,
    submissions: submissions!.meta.changes,
    sessions: sessions!.meta.changes,
    invitations: invitations!.meta.changes,
  };
  console.log("[retention]", JSON.stringify(report));
  return report;
}
