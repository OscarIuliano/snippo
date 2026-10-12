import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AccountDeletionPlan, MeResponse, TeamResponse } from "@snippo/shared";
import { PASSWORD, authPost, createProject, signUp, submitBooking, type Api } from "./helpers";

let subjects: string[] = [];
beforeEach(() => {
  subjects = [];
  vi.spyOn(console, "log").mockImplementation((line: unknown) => {
    const match = /Oggetto: (.+)\n/.exec(String(line));
    if (match) subjects.push(match[1]!);
  });
});
afterEach(() => vi.restoreAllMocks());

async function invite(owner: Api, role: "admin" | "operator") {
  const res = await owner("/team/invitations", { method: "POST", body: JSON.stringify({ role }) });
  return (await res.json<{ url: string }>()).url.split("/invito/")[1]!;
}
const accept = (api: Api, token: string) => api(`/api/invitations/${token}/accept`, { method: "POST" });
const deleteAccount = (api: Api, body: Record<string, unknown>) => api("/api/auth/delete-user", { method: "POST", body: JSON.stringify(body) });
const plan = async (api: Api) => (await api("/account/deletion")).json<AccountDeletionPlan>();
const count = async (sql: string, ...params: string[]) => (await env.DB.prepare(sql).bind(...params).first<{ n: number }>())!.n;

describe("Deleting the account", () => {
  it("deletes the owner alone together with the organization, its projects and requests", async () => {
    const email = "solo@example.com";
    const api = await signUp(email);
    const projectId = await createProject(api);
    await submitBooking(api, projectId);
    const { organization } = await (await api("/me")).json<MeResponse>();

    expect(await plan(api)).toEqual({ blocking: [], deleted: [{ id: organization.id, name: "Mario Rossi", projects: 1 }] });

    expect((await deleteAccount(api, {})).status).toBe(400);
    expect((await deleteAccount(api, { password: "non-e-questa" })).status).toBe(400);
    expect(await count("SELECT count(*) n FROM projects WHERE id = ?", projectId)).toBe(1);

    expect((await deleteAccount(api, { password: PASSWORD })).status).toBe(200);
    expect(subjects).toContain("Il tuo account Snippo è stato eliminato");
    expect((await authPost("/sign-in/email", { email, password: PASSWORD })).status).toBe(401);
    expect(await count("SELECT count(*) n FROM users WHERE email = ?", email)).toBe(0);
    expect(await count("SELECT count(*) n FROM organizations WHERE id = ?", organization.id)).toBe(0);
    expect(await count("SELECT count(*) n FROM projects WHERE id = ?", projectId)).toBe(0);
    expect(await count("SELECT count(*) n FROM submissions WHERE project_id = ?", projectId)).toBe(0);
  });

  it("asks an owner with a team to hand over the organization first", async () => {
    const owner = await signUp("owner-with-team@example.com");
    const projectId = await createProject(owner);
    const admin = await signUp("future-owner@example.com");
    await accept(admin, await invite(owner, "admin"));

    const before = await plan(owner);
    expect(before.blocking).toEqual([{ id: expect.any(String), name: "Mario Rossi", members: 2 }]);
    const refused = await deleteAccount(owner, { password: PASSWORD });
    expect(refused.status).toBe(400);
    expect((await refused.json<{ code: string }>()).code).toBe("OWNER_OF_TEAM");

    const team = await (await owner("/team")).json<TeamResponse>();
    const next = team.members.find((m) => !m.isYou)!;
    expect((await owner("/team/owner", { method: "POST", body: JSON.stringify({ userId: next.userId }) })).status).toBe(204);
    const after = await (await admin("/team")).json<TeamResponse>();
    expect(after.members.map((m) => [m.email, m.role]).sort()).toEqual([
      ["future-owner@example.com", "owner"],
      ["owner-with-team@example.com", "admin"],
    ]);

    // Now an admin there: the account goes, the organization and its project stay with the new owner.
    expect((await deleteAccount(owner, { password: PASSWORD })).status).toBe(200);
    expect(await count("SELECT count(*) n FROM projects WHERE id = ?", projectId)).toBe(1);
    const team2 = await (await admin("/team")).json<TeamResponse>();
    expect(team2.members.map((m) => m.email)).toEqual(["future-owner@example.com"]);
  });

  it("lets only the owner hand over the organization, and only to a member", async () => {
    const owner = await signUp("transfer-owner@example.com");
    const operator = await signUp("transfer-operator@example.com");
    await accept(operator, await invite(owner, "operator"));
    const team = await (await owner("/team")).json<TeamResponse>();
    const me = team.members.find((m) => m.isYou)!;
    const other = team.members.find((m) => !m.isYou)!;

    expect((await operator("/team/owner", { method: "POST", body: JSON.stringify({ userId: other.userId }) })).status).toBe(403);
    expect((await owner("/team/owner", { method: "POST", body: JSON.stringify({ userId: me.userId }) })).status).toBe(422);
    expect((await owner("/team/owner", { method: "POST", body: JSON.stringify({ userId: "someone-else" }) })).status).toBe(404);
  });

  it("removes a member of someone else's team and leaves the organization alone", async () => {
    const owner = await signUp("keeps-team@example.com");
    const projectId = await createProject(owner);
    const operator = await signUp("leaves-team@example.com");
    await accept(operator, await invite(owner, "operator"));

    expect(await plan(operator)).toEqual({ blocking: [], deleted: [] });
    expect((await deleteAccount(operator, { password: PASSWORD })).status).toBe(200);
    expect(await count("SELECT count(*) n FROM projects WHERE id = ?", projectId)).toBe(1);
    const team = await (await owner("/team")).json<TeamResponse>();
    expect(team.members.map((m) => m.email)).toEqual(["keeps-team@example.com"]);
  });
});
