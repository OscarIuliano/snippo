import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import type { ProjectDetail, ProjectStats, WidgetEvent } from "@snippo/shared";
import { SITE_ORIGIN, TODAY, createProject, signUp, submitBooking, type Api } from "./helpers";

async function sendEvents(api: Api, projectId: string, events: WidgetEvent[] | unknown, origin = SITE_ORIGIN) {
  const { widget } = await (await api(`/projects/${projectId}`)).json<ProjectDetail>();
  return exports.default.fetch(`https://api.snippo.test/v1/widget/events?key=${widget.publicKey}`, {
    method: "POST",
    // text/plain, like the widget: a simple CORS request with no preflight.
    headers: { "Content-Type": "text/plain", Origin: origin },
    body: JSON.stringify({ events }),
  });
}

describe("widget events and statistics", () => {
  it("counts opens, starts, questions reached and submissions for today", async () => {
    const api = await signUp("stats@example.com");
    const projectId = await createProject(api);

    // Three visitors open the chat, two start answering, one gets to the phone question and sends.
    for (let i = 0; i < 3; i++) expect((await sendEvents(api, projectId, [{ type: "opened" }])).status).toBe(204);
    for (let i = 0; i < 2; i++) await sendEvents(api, projectId, [{ type: "started" }, { type: "step", stepKey: "party_size" }, { type: "step", stepKey: "date" }]);
    await sendEvents(api, projectId, [{ type: "step", stepKey: "phone" }]);
    const submissionId = await submitBooking(api, projectId);
    await api(`/submissions/${submissionId}`, { method: "PATCH", body: JSON.stringify({ status: "confirmed" }) });

    const stats = await (await api(`/projects/${projectId}/stats`)).json<ProjectStats>();
    expect(stats.to).toBe(TODAY);
    expect(stats.daily).toHaveLength(30);
    expect(stats.totals).toEqual({ opens: 3, starts: 2, submissions: 1, confirmed: 1 });
    expect(stats.daily.at(-1)).toEqual({ date: TODAY, opens: 3, starts: 2, submissions: 1 });
    expect(stats.steps.map((s) => [s.key, s.reached])).toEqual([
      ["party_size", 2],
      ["date", 2],
      ["time", 0],
      ["name", 0],
      ["phone", 1],
      ["notes", 0],
    ]);
  });

  it("rejects malformed events and foreign sites", async () => {
    const api = await signUp("stats-invalid@example.com");
    const projectId = await createProject(api);

    expect((await sendEvents(api, projectId, [])).status).toBe(422);
    expect((await sendEvents(api, projectId, [{ type: "clicked" }])).status).toBe(422);
    expect((await sendEvents(api, projectId, [{ type: "step", stepKey: "DROP TABLE" }])).status).toBe(422);
    expect((await sendEvents(api, projectId, [{ type: "opened" }], "https://evil.example")).status).toBe(403);
  });

  it("keeps statistics private and the period within 7 to 90 days", async () => {
    const owner = await signUp("stats-owner@example.com");
    const projectId = await createProject(owner);
    const stranger = await signUp("stats-stranger@example.com");

    expect((await stranger(`/projects/${projectId}/stats`)).status).toBe(404);
    expect((await (await owner(`/projects/${projectId}/stats?days=1`)).json<ProjectStats>()).daily).toHaveLength(7);
    expect((await (await owner(`/projects/${projectId}/stats?days=365`)).json<ProjectStats>()).daily).toHaveLength(90);
  });
});
