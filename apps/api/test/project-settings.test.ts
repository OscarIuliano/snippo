import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import type { ChannelRow, MeResponse, ProjectDetail } from "@snippo/shared";
import { PUBLIC_API, SITE_ORIGIN, createProject, inDays, signUp, submitBooking, type Api } from "./helpers";

const rows = async (table: string, column: string, id: string) =>
  (await env.DB.prepare(`SELECT count(*) n FROM ${table} WHERE ${column} = ?`).bind(id).first<{ n: number }>())!.n;

async function invite(owner: Api, role: "admin" | "operator", email: string) {
  const res = await owner("/team/invitations", { method: "POST", body: JSON.stringify({ role }) });
  const token = (await res.json<{ url: string }>()).url.split("/invito/")[1]!;
  const member = await signUp(email);
  await member(`/api/invitations/${token}/accept`, { method: "POST" });
  return member;
}

describe("project settings", () => {
  it("renames a project", async () => {
    const api = await signUp("rename@example.com");
    const projectId = await createProject(api);
    const rename = (name: string) => api(`/projects/${projectId}`, { method: "PATCH", body: JSON.stringify({ name }) });

    expect((await rename("  Osteria del Porto ")).status).toBe(204);
    expect((await (await api(`/projects/${projectId}`)).json<ProjectDetail>()).name).toBe("Osteria del Porto");
    expect((await rename("x")).status).toBe(422);
  });

  it("deletes a project with all its data, and leaves the others alone", async () => {
    const api = await signUp("delete-project@example.com");
    const projectId = await createProject(api);
    const kept = await createProject(api);
    const { widget } = await (await api(`/projects/${projectId}`)).json<ProjectDetail>();
    await submitBooking(api, projectId);
    await submitBooking(api, kept);
    await api(`/projects/${projectId}/closures`, { method: "POST", body: JSON.stringify({ dateFrom: inDays(5), dateTo: inDays(6) }) });
    const [channel] = await (await api(`/projects/${projectId}/channels`)).json<ChannelRow[]>();
    await api(`/projects/${projectId}/channels/${channel!.id}/test`, { method: "POST" });

    expect((await api(`/projects/${projectId}`, { method: "DELETE" })).status).toBe(204);

    for (const [table, column] of [["projects", "id"], ["submissions", "project_id"], ["widgets", "project_id"], ["closures", "project_id"], ["notification_channels", "project_id"], ["project_domains", "project_id"]]) {
      expect(await rows(table!, column!, projectId), table).toBe(0);
    }
    expect(await rows("notification_deliveries", "channel_id", channel!.id)).toBe(0);
    expect(await rows("flow_versions", "widget_id", widget.id)).toBe(0);
    expect(await rows("submissions", "project_id", kept)).toBe(1);
    expect((await (await api("/me")).json<MeResponse>()).projects.map((p) => p.id)).toEqual([kept]);

    const config = await exports.default.fetch(`${PUBLIC_API}/v1/widget/config?key=${widget.publicKey}`, { headers: { Origin: SITE_ORIGIN } });
    expect(config.status).toBe(404);
    expect((await api(`/projects/${projectId}`, { method: "DELETE" })).status).toBe(404);
  });

  it("is for owners and admins of the same organization", async () => {
    const owner = await signUp("settings-owner@example.com");
    const projectId = await createProject(owner);
    const operator = await invite(owner, "operator", "settings-operator@example.com");
    const admin = await invite(owner, "admin", "settings-admin@example.com");
    const stranger = await signUp("settings-stranger@example.com");

    expect((await operator(`/projects/${projectId}`, { method: "DELETE" })).status).toBe(403);
    expect((await operator(`/projects/${projectId}`, { method: "PATCH", body: JSON.stringify({ name: "Altro nome" }) })).status).toBe(403);
    expect((await stranger(`/projects/${projectId}`, { method: "DELETE" })).status).toBe(404);
    expect(await rows("projects", "id", projectId)).toBe(1);
    expect((await admin(`/projects/${projectId}`, { method: "DELETE" })).status).toBe(204);
  });
});
