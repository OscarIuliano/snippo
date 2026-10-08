import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import type { ChannelRow, PrivacyMatch } from "@snippo/shared";
import { runRetention } from "../src/retention";
import { createProject, signUp, submitBooking, type Api } from "./helpers";

const ageSubmission = (id: string, months: number) =>
  env.DB.prepare(`UPDATE submissions SET created_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-${months} months') WHERE id = ?`).bind(id).run();
const exists = async (id: string) => (await env.DB.prepare("SELECT 1 FROM submissions WHERE id = ?").bind(id).first()) !== null;

async function inviteOperator(owner: Api, email: string): Promise<Api> {
  const res = await owner("/team/invitations", { method: "POST", body: JSON.stringify({ role: "operator" }) });
  const token = (await res.json<{ url: string }>()).url.split("/invito/")[1];
  const operator = await signUp(email);
  await operator(`/api/invitations/${token}/accept`, { method: "POST" });
  return operator;
}

describe("nightly retention", () => {
  it("deletes requests older than each project's period, with their notification log", async () => {
    const api = await signUp("retention@example.com");
    const projectId = await createProject(api);
    const [channel] = await (await api(`/projects/${projectId}/channels`)).json<ChannelRow[]>();
    const old = await submitBooking(api, projectId, { name: "Vecchia" });
    const recent = await submitBooking(api, projectId, { name: "Recente" });
    await env.DB.prepare("INSERT INTO notification_deliveries (id, channel_id, submission_id, status) VALUES ('del_old', ?, ?, 'sent')").bind(channel!.id, old).run();
    await ageSubmission(old, 25);
    await ageSubmission(recent, 3);

    const report = await runRetention(env.DB);
    expect(report.submissions).toBeGreaterThanOrEqual(1);
    expect(await exists(old)).toBe(false);
    expect(await exists(recent)).toBe(true);
    expect(await env.DB.prepare("SELECT 1 FROM notification_deliveries WHERE id = 'del_old'").first()).toBeNull();

    // A shorter period, chosen in the dashboard, applies from the next night.
    expect((await api(`/projects/${projectId}/privacy`, { method: "PUT", body: JSON.stringify({ retentionMonths: 2 }) })).status).toBe(204);
    await runRetention(env.DB);
    expect(await exists(recent)).toBe(false);
  });

  it("removes invitations expired more than 30 days ago", async () => {
    const api = await signUp("retention-invites@example.com");
    await api("/team/invitations", { method: "POST", body: JSON.stringify({ role: "operator" }) });
    await env.DB.prepare("UPDATE invitations SET expires_at = '2020-01-01T00:00:00.000Z'").run();

    await runRetention(env.DB);
    expect(await env.DB.prepare("SELECT count(*) AS n FROM invitations").first("n")).toBe(0);
  });
});

describe("privacy requests", () => {
  it("finds a person's requests by phone, email or name, exports and erases them", async () => {
    const api = await signUp("privacy@example.com");
    const projectId = await createProject(api);
    const anna = await submitBooking(api, projectId, { name: "Anna Neri", phone: "+39 333 1112223" });
    const anna2 = await submitBooking(api, projectId, { name: "A. Neri", phone: "333 111 2223", time: "21:30" });
    const other = await submitBooking(api, projectId, { name: "Bruno", phone: "+39 347 9998887", time: "19:30" });

    const search = async (q: string) => (await (await api(`/projects/${projectId}/privacy/search?q=${encodeURIComponent(q)}`)).json<PrivacyMatch[]>()).map((m) => m.id).sort();
    expect(await search("111 2223")).toEqual([anna, anna2].sort());
    expect(await search("neri")).toEqual([anna, anna2].sort());
    expect(await search("bruno")).toEqual([other]);
    expect((await api(`/projects/${projectId}/privacy/search?q=ab`)).status).toBe(422);

    const exported = await api(`/projects/${projectId}/privacy/export?q=1112223`);
    expect(exported.headers.get("Content-Disposition")).toContain("attachment");
    const file = await exported.json<{ requests: { answers: Record<string, string> }[] }>();
    expect(file.requests.map((r) => r.answers.name).sort()).toEqual(["A. Neri", "Anna Neri"]);

    // Another organization's request in the list is ignored.
    const stranger = await signUp("privacy-stranger@example.com");
    const strangerProject = await createProject(stranger);
    const foreign = await submitBooking(stranger, strangerProject);
    const erased = await api(`/projects/${projectId}/privacy/erase`, { method: "POST", body: JSON.stringify({ ids: [anna, anna2, foreign] }) });
    expect(await erased.json()).toEqual({ deleted: 2 });
    expect([await exists(anna), await exists(anna2), await exists(other), await exists(foreign)]).toEqual([false, false, true, true]);
  });

  it("keeps bulk access and deletion away from operators", async () => {
    const owner = await signUp("privacy-owner@example.com");
    const projectId = await createProject(owner);
    const submissionId = await submitBooking(owner, projectId);
    const operator = await inviteOperator(owner, "privacy-operator@example.com");

    expect((await operator(`/projects/${projectId}/privacy/search?q=Anna`)).status).toBe(403);
    expect((await operator(`/projects/${projectId}/privacy/export?q=Anna`)).status).toBe(403);
    expect((await operator(`/projects/${projectId}/privacy`, { method: "PUT", body: JSON.stringify({ retentionMonths: 1 }) })).status).toBe(403);
    expect((await operator(`/submissions/${submissionId}`, { method: "DELETE" })).status).toBe(403);

    expect((await owner(`/projects/${projectId}/privacy`, { method: "PUT", body: JSON.stringify({ retentionMonths: 0 }) })).status).toBe(422);
    expect((await owner(`/submissions/${submissionId}`, { method: "DELETE" })).status).toBe(204);
    expect(await exists(submissionId)).toBe(false);
  });
});
