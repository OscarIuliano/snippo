import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import type { MeResponse, ProjectDetail, SubmissionsPage } from "@snippo/shared";
import { DASHBOARD, createProject, signUp, submitBooking } from "./helpers";

describe("dashboard API", () => {
  it("requires a session", async () => {
    const res = await exports.default.fetch(`${DASHBOARD}/api/v1/me`);
    expect(res.status).toBe(401);
  });

  it("creates an organization at sign-up and a ready widget with each project", async () => {
    const api = await signUp("mario@example.com");
    const me = await (await api("/me")).json<MeResponse>();
    expect(me.user.email).toBe("mario@example.com");
    expect(me.projects).toEqual([]);

    const projectId = await createProject(api);
    const project = await (await api(`/projects/${projectId}`)).json<ProjectDetail>();
    expect(project.domains.map((d) => d.domain)).toEqual(["trattoria-mario.it"]);
    expect(project.widget.publicKey).toMatch(/^pk_live_[0-9a-f]{24}$/);
    expect(project.widget.template).toBe("restaurant");

    // The new widget answers the public endpoint from the configured domain.
    const config = await exports.default.fetch(`https://api.snippo.test/v1/widget/config?key=${project.widget.publicKey}`, {
      headers: { Origin: "https://www.trattoria-mario.it" },
    });
    expect(config.status).toBe(200);
  });

  it("keeps organizations isolated from each other", async () => {
    const owner = await signUp("owner@example.com");
    const projectId = await createProject(owner);
    const stranger = await signUp("stranger@example.com");

    expect((await stranger(`/projects/${projectId}`)).status).toBe(404);
    expect((await stranger(`/projects/${projectId}/submissions`)).status).toBe(404);
    const patch = await stranger(`/projects/${projectId}/widget`, {
      method: "PATCH",
      body: JSON.stringify({ title: "Hack", primaryColor: "#000000", position: "left" }),
    });
    expect(patch.status).toBe(404);
  });

  it("lists submissions with counts and updates their status", async () => {
    const api = await signUp("inbox@example.com");
    const projectId = await createProject(api);
    const id = await submitBooking(api, projectId);

    let page = await (await api(`/projects/${projectId}/submissions`)).json<SubmissionsPage>();
    expect(page.items.map((s) => s.contactName)).toEqual(["Anna"]);
    expect(page.counts.new).toBe(1);

    expect((await api(`/submissions/${id}`, { method: "PATCH", body: JSON.stringify({ status: "confirmed" }) })).status).toBe(204);
    page = await (await api(`/projects/${projectId}/submissions?status=confirmed`)).json<SubmissionsPage>();
    expect(page.items.map((s) => s.id)).toEqual([id]);
    expect(page.counts).toMatchObject({ new: 0, confirmed: 1 });
  });

  it("publishes a new flow version when the template changes", async () => {
    const api = await signUp("template@example.com");
    const projectId = await createProject(api);

    expect((await api(`/projects/${projectId}/template`, { method: "PUT", body: JSON.stringify({ template: "info" }) })).status).toBe(204);
    const project = await (await api(`/projects/${projectId}`)).json<ProjectDetail>();
    expect(project.widget.template).toBe("info");
    expect(project.widget.flow?.steps.map((s) => s.key)).toContain("email");
  });
});
