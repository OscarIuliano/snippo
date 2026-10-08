import { z } from "zod";

export const roles = ["owner", "admin", "operator"] as const;
export type Role = (typeof roles)[number];

/** Who can change a project's settings (widget, hours, notifications, domains). */
export const canManageProjects = (role: Role) => role === "owner" || role === "admin";
/** Who can invite, remove and change the role of team members. */
export const canManageTeam = (role: Role) => role === "owner";

const invitableRole = z.enum(["admin", "operator"]);
export const createInvitationSchema = z.object({ role: invitableRole });
export const updateMemberSchema = z.object({ role: invitableRole });

/** Header with the organization the dashboard is working on, for users in more than one. */
export const ORGANIZATION_HEADER = "X-Snippo-Organization";

export interface TeamResponse {
  members: { userId: string; name: string; email: string; role: Role; isYou: boolean; joinedAt: string }[];
  /** Pending invitations, visible only to who can manage the team. */
  invitations: { id: string; role: Role; createdAt: string; expiresAt: string }[];
}

/** GET /api/invitations/:token: what the invitation page shows before joining. */
export interface InvitationInfo {
  status: "valid" | "expired" | "used";
  organizationName: string;
  role: Role;
  invitedBy: string;
}
