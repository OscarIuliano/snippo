import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import type { MeResponse, ProjectDetail, SubmissionsPage } from "@snippo/shared";

const BASE = "http://localhost:5174";
const ORIGIN = { Origin: BASE };

async function signUp(email: string) {
  const res = await exports.default.fetch(`${BASE}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...ORIGIN },
    body: JSON.stringify({ name: "Mario Rossi", email, password: "una-password-sicura" }),
  });
  expect(res.status).toBe(200);
  const cookie = res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  return (path: string, init: RequestInit = {}) =>
    exports.default.fetch(`${BASE}/api/v1${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", Cookie: cookie, ...ORIGIN, ...init.headers },
    });
}

async function createProject(api: Awaited<ReturnType<typeof signUp>>) {
  const res = await api("/projects", {
    method: "POST",
    body: JSON.stringify({ name: "Trattoria da Mario", template: "restaurant", domain: "https://www.trattoria-mario.it/menu" }),
  });
  expect(res.status).toBe(201);
  return (await res.json<{ id: string }>()).id;
}

describe("dashboard API", () => {
  it("requires a session", async () => {
    const res = await exports.default.fetch(`${BASE}/api/v1/me`);
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
    const project = await (await api(`/projects/${projectId}`)).json<ProjectDetail>();

    const submitted = await exports.default.fetch(`https://api.snippo.test/v1/widget/submissions?key=${project.widget.publicKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "https://trattoria-mario.it" },
      body: JSON.stringify({
        flowVersionId: (await (await exports.default.fetch(`https://api.snippo.test/v1/widget/config?key=${project.widget.publicKey}`, { headers: { Origin: "https://trattoria-mario.it" } })).json<{ flowVersionId: string }>()).flowVersionId,
        answers: { date: "2026-12-12", time: "20:30", party_size: "2", name: "Anna", phone: "+39 333 1112223" },
        consent: true,
      }),
    });
    expect(submitted.status).toBe(201);
    const { id } = await submitted.json<{ id: string }>();

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
