import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { ORGANIZATION_HEADER, type InvitationInfo, type MeResponse, type TeamResponse } from "@snippo/shared";
import { DASHBOARD, createProject, signUp, submitBooking, type Api } from "./helpers";

const tokenOf = (url: string) => url.split("/invito/")[1]!;

async function invite(owner: Api, role: "admin" | "operator") {
  const res = await owner("/team/invitations", { method: "POST", body: JSON.stringify({ role }) });
  expect(res.status).toBe(201);
  const { url } = await res.json<{ url: string }>();
  expect(url.startsWith(`${env.DASHBOARD_ORIGIN}/invito/`)).toBe(true);
  return tokenOf(url);
}

const invitationInfo = (token: string) => exports.default.fetch(`${DASHBOARD}/api/invitations/${token}`);

const accept = (api: Api, token: string) => api(`/api/invitations/${token}/accept`, { method: "POST" });

describe("team", () => {
  it("lets an invited person join the owner's organization, and only once", async () => {
    const owner = await signUp("team-owner@example.com");
    await createProject(owner);
    const token = await invite(owner, "operator");

    const info = await (await invitationInfo(token)).json<InvitationInfo>();
    expect(info).toEqual({ status: "valid", organizationName: "Mario Rossi", role: "operator", invitedBy: "Mario Rossi" });

    const operator = await signUp("team-operator@example.com");
    expect((await accept(operator, token)).status).toBe(200);
    expect((await accept(operator, token)).status).toBe(200); // same person again: fine

    // Joined through the invitation: no personal organization was created.
    const me = await (await operator("/me")).json<MeResponse>();
    expect(me.organizations).toHaveLength(1);
    expect(me.organization.role).toBe("operator");
    expect(me.projects).toHaveLength(1);

    const latecomer = await signUp("team-latecomer@example.com");
    expect((await accept(latecomer, token)).status).toBe(410);
    expect((await (await invitationInfo(token)).json<InvitationInfo>()).status).toBe("used");
  });

  it("refuses expired and unknown invitations", async () => {
    const owner = await signUp("team-expired@example.com");
    const token = await invite(owner, "admin");
    await env.DB.prepare("UPDATE invitations SET expires_at = '2000-01-01T00:00:00.000Z'").run();

    const someone = await signUp("team-too-late@example.com");
    expect((await accept(someone, token)).status).toBe(410);
    expect((await invitationInfo("not-a-real-token")).status).toBe(404);
  });

  it("lets operators handle requests but not change settings", async () => {
    const owner = await signUp("roles-owner@example.com");
    const projectId = await createProject(owner);
    const operator = await signUp("roles-operator@example.com");
    await accept(operator, await invite(owner, "operator"));
    const submissionId = await submitBooking(owner, projectId);

    expect((await operator(`/projects/${projectId}/submissions`)).status).toBe(200);
    expect((await operator(`/submissions/${submissionId}`, { method: "PATCH", body: JSON.stringify({ status: "confirmed" }) })).status).toBe(204);
    const patchWidget = await operator(`/projects/${projectId}/widget`, {
      method: "PATCH",
      body: JSON.stringify({ title: "Cambiato", primaryColor: "#000000", position: "left" }),
    });
    expect(patchWidget.status).toBe(403);
    expect((await operator("/projects", { method: "POST", body: JSON.stringify({ name: "Nuovo", template: "info", domain: "x.it" }) })).status).toBe(403);
    expect((await operator("/team/invitations", { method: "POST", body: JSON.stringify({ role: "operator" }) })).status).toBe(403);
  });

  it("lets only the owner change roles and remove people, never the owner", async () => {
    const owner = await signUp("manage-owner@example.com");
    const admin = await signUp("manage-admin@example.com");
    await accept(admin, await invite(owner, "admin"));
    const operator = await signUp("manage-operator@example.com");
    await accept(operator, await invite(owner, "operator"));

    const team = await (await owner("/team")).json<TeamResponse>();
    expect(team.members.map((m) => [m.email, m.role, m.isYou])).toEqual([
      ["manage-owner@example.com", "owner", true],
      ["manage-admin@example.com", "admin", false],
      ["manage-operator@example.com", "operator", false],
    ]);
    const id = (email: string) => team.members.find((m) => m.email === email)!.userId;

    // An admin manages projects, not the team.
    expect((await admin(`/team/members/${id("manage-operator@example.com")}`, { method: "DELETE" })).status).toBe(403);
    // The owner's own membership is not editable.
    expect((await owner(`/team/members/${id("manage-owner@example.com")}`, { method: "DELETE" })).status).toBe(403);

    expect((await owner(`/team/members/${id("manage-operator@example.com")}`, { method: "PATCH", body: JSON.stringify({ role: "admin" }) })).status).toBe(204);
    expect((await owner(`/team/members/${id("manage-admin@example.com")}`, { method: "DELETE" })).status).toBe(204);

    const after = await (await owner("/team")).json<TeamResponse>();
    expect(after.members.map((m) => [m.email, m.role])).toEqual([
      ["manage-owner@example.com", "owner"],
      ["manage-operator@example.com", "admin"],
    ]);
    // Removed from the team: back to an organization of their own.
    const removed = await (await admin("/me")).json<MeResponse>();
    expect(removed.organization.role).toBe("owner");
    expect(removed.projects).toEqual([]);
  });

  it("works on the organization chosen by header, only among the user's own", async () => {
    const owner = await signUp("switch-owner@example.com");
    const projectId = await createProject(owner);
    const ownerOrg = (await (await owner("/me")).json<MeResponse>()).organization.id;

    const agency = await signUp("switch-agency@example.com");
    await agency("/me"); // creates the agency's own organization first
    await accept(agency, await invite(owner, "admin"));

    const mine = await (await agency("/me")).json<MeResponse>();
    expect(mine.organizations).toHaveLength(2);
    const asOwnerOrg = await (await agency("/me", { headers: { [ORGANIZATION_HEADER]: ownerOrg } })).json<MeResponse>();
    expect(asOwnerOrg.organization).toMatchObject({ id: ownerOrg, role: "admin" });
    expect(asOwnerOrg.projects.map((p) => p.id)).toEqual([projectId]);

    // A header naming someone else's organization is ignored.
    const stranger = await signUp("switch-stranger@example.com");
    expect((await stranger(`/projects/${projectId}`, { headers: { [ORGANIZATION_HEADER]: ownerOrg } })).status).toBe(404);
  });
});
