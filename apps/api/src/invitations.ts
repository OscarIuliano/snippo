import { Hono } from "hono";
import { and, createDb, eq, invitations, isNull, memberships, organizations, users } from "@snippo/db";
import type { InvitationInfo } from "@snippo/shared";
import { createAuth } from "./auth";
import type { AppEnv } from "./env";
import { problem } from "./problem";

// Joining a team through an invitation link. Outside /api/v1 on purpose: the page must work
// before login, and accepting must not create a personal organization first.

export const invitationRoutes = new Hono<AppEnv>();

const toBase64Url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function createInvitationToken() {
  const token = toBase64Url(crypto.getRandomValues(new Uint8Array(32)));
  return { token, tokenHash: await sha256(token) };
}

async function findInvitation(env: AppEnv["Bindings"], token: string) {
  const db = createDb(env.DB);
  const row = await db
    .select({ invitation: invitations, organizationName: organizations.name, invitedBy: users.name })
    .from(invitations)
    .innerJoin(organizations, eq(organizations.id, invitations.organizationId))
    .innerJoin(users, eq(users.id, invitations.createdBy))
    .where(eq(invitations.tokenHash, await sha256(token)))
    .get();
  return { db, row };
}

const statusOf = (invitation: typeof invitations.$inferSelect): InvitationInfo["status"] =>
  invitation.acceptedAt ? "used" : invitation.expiresAt < new Date().toISOString() ? "expired" : "valid";

invitationRoutes.get("/:token", async (c) => {
  const { row } = await findInvitation(c.env, c.req.param("token"));
  if (!row) return problem(c, 404, "Invito non trovato");
  const body: InvitationInfo = {
    status: statusOf(row.invitation),
    organizationName: row.organizationName,
    role: row.invitation.role,
    invitedBy: row.invitedBy,
  };
  return c.json(body);
});

invitationRoutes.post("/:token/accept", async (c) => {
  const session = await createAuth(c.env).api.getSession({ headers: c.req.raw.headers });
  if (!session) return problem(c, 401, "Accedi o registrati per accettare l'invito");

  const { db, row } = await findInvitation(c.env, c.req.param("token"));
  if (!row) return problem(c, 404, "Invito non trovato");
  const { invitation } = row;
  if (invitation.acceptedBy === session.user.id) return c.json({ organizationId: invitation.organizationId });
  const status = statusOf(invitation);
  if (status !== "valid") return problem(c, 410, status === "used" ? "Questo invito è già stato usato" : "Questo invito è scaduto");
  if (invitation.email && invitation.email !== session.user.email.toLowerCase()) {
    return problem(c, 403, "Questo invito è per un altro indirizzo email");
  }

  // Marks the invitation used only if nobody did meanwhile: one link, one person.
  const claimed = await db
    .update(invitations)
    .set({ acceptedAt: new Date().toISOString(), acceptedBy: session.user.id, updatedAt: new Date().toISOString() })
    .where(and(eq(invitations.id, invitation.id), isNull(invitations.acceptedAt)))
    .returning({ id: invitations.id });
  if (claimed.length === 0) return problem(c, 410, "Questo invito è già stato usato");

  // Already in the team (e.g. invited twice): the current role stays.
  await db
    .insert(memberships)
    .values({ organizationId: invitation.organizationId, userId: session.user.id, role: invitation.role })
    .onConflictDoNothing();
  return c.json({ organizationId: invitation.organizationId });
});
