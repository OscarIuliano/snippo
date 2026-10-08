import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import type { FlowDefinitionInput, ProjectDetail } from "@snippo/shared";
import { BOOKING_DATE, SITE_ORIGIN, createProject, signUp, type Api } from "./helpers";

const project = async (api: Api, id: string) => (await api(`/projects/${id}`)).json<ProjectDetail>();
const saveFlow = (api: Api, id: string, flow: FlowDefinitionInput) => api(`/projects/${id}/flow`, { method: "PUT", body: JSON.stringify(flow) });

/** The restaurant template with: notes removed, a required choice added, the name moved first. */
function customize(flow: ProjectDetail["widget"]["flow"]): FlowDefinitionInput {
  const steps = flow!.steps.filter((s) => s.key !== "notes");
  const name = steps.find((s) => s.key === "name")!;
  return {
    successMessage: "Grazie! Ti richiamiamo entro un'ora.",
    steps: [
      { ...name, prompt: "Ciao! Con chi parlo?" },
      ...steps.filter((s) => s !== name),
      { key: "q_area", type: "choice", prompt: "Dentro o fuori?", options: ["Sala", "Dehors"], required: true },
    ],
  };
}

async function widgetConfig(api: Api, id: string) {
  const { widget } = await project(api, id);
  const res = await exports.default.fetch(`https://api.snippo.test/v1/widget/config?key=${widget.publicKey}`, { headers: { Origin: SITE_ORIGIN } });
  return { key: widget.publicKey, config: await res.json<{ flowVersionId: string; flow: FlowDefinitionInput }>() };
}

function submit(key: string, flowVersionId: string, answers: Record<string, string>) {
  return exports.default.fetch(`https://api.snippo.test/v1/widget/submissions?key=${key}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: SITE_ORIGIN },
    body: JSON.stringify({ flowVersionId, answers, consent: true }),
  });
}

describe("question editor", () => {
  it("publishes custom questions that the widget and the submissions follow", async () => {
    const api = await signUp("flow-custom@example.com");
    const id = await createProject(api);
    const before = await project(api, id);
    expect(before.widget.customized).toBe(false);
    const { config: oldConfig } = await widgetConfig(api, id);

    expect((await saveFlow(api, id, customize(before.widget.flow))).status).toBe(204);

    const after = await project(api, id);
    expect(after.widget).toMatchObject({ template: "restaurant", customized: true });
    expect(after.widget.flow!.steps.map((s) => s.key)).toEqual(["name", "welcome", "party_size", "date", "time", "phone", "q_area"]);

    const { key, config } = await widgetConfig(api, id);
    expect(config.flowVersionId).not.toBe(oldConfig.flowVersionId);
    expect(config.flow.successMessage).toBe("Grazie! Ti richiamiamo entro un'ora.");

    const answers = { name: "Lia", party_size: "2", date: BOOKING_DATE, time: "20:30", phone: "+39 333 1231231" };
    const missing = await submit(key, config.flowVersionId, answers);
    expect(missing.status).toBe(422);
    expect(Object.keys((await missing.json<{ errors: Record<string, string> }>()).errors)).toEqual(["q_area"]);
    expect((await submit(key, config.flowVersionId, { ...answers, q_area: "Dehors" })).status).toBe(201);
    expect((await submit(key, config.flowVersionId, { ...answers, q_area: "Terrazza" })).status).toBe(422);

    // A conversation started on the old questions can still be sent.
    const old = { party_size: "2", date: BOOKING_DATE, time: "21:30", name: "Ugo", phone: "+39 333 3213213" };
    expect((await submit(key, oldConfig.flowVersionId, old)).status).toBe(201);
    const versions = await env.DB.prepare("SELECT DISTINCT flow_version_id AS v FROM submissions WHERE contact_name IN ('Lia', 'Ugo')").all();
    expect(versions.results).toHaveLength(2);
  });

  it("refuses flows that break the rules", async () => {
    const api = await signUp("flow-rules@example.com");
    const id = await createProject(api);
    const { flow } = (await project(api, id)).widget;
    const base = { successMessage: "Ok", steps: flow!.steps };
    const problemOf = async (candidate: FlowDefinitionInput) => {
      const res = await saveFlow(api, id, candidate);
      expect(res.status).toBe(422);
      return (await res.json<{ title: string }>()).title;
    };

    expect(await problemOf({ ...base, steps: [...base.steps, { key: "date", type: "date", prompt: "Altro giorno?" }] })).toMatch(/duplicata|Giorno/);
    expect(await problemOf({ ...base, steps: base.steps.map((s) => (s.key === "phone" ? { ...s, type: "text", maxLength: 50 } : s)) })).toMatch(/tipo/);
    expect(await problemOf({ ...base, steps: [{ key: "welcome", type: "message", prompt: "Solo un saluto" }] })).toMatch(/almeno una domanda/);
    expect(await problemOf({ ...base, steps: [...base.steps, { key: "q_vuota", type: "choice", prompt: "Scegli", options: ["A", "A"] }] })).toMatch(/ripetute/);
    expect(await problemOf({ ...base, steps: [...base.steps, { key: "q_num", type: "number", prompt: "Quanti?", min: 5, max: 1 }] })).toMatch(/minimo/);
  });

  it("is for owners and admins, and the template can be restored", async () => {
    const owner = await signUp("flow-owner@example.com");
    const id = await createProject(owner);
    const custom = customize((await project(owner, id)).widget.flow);

    const operator = await signUp("flow-operator@example.com");
    const invite = await owner("/team/invitations", { method: "POST", body: JSON.stringify({ role: "operator" }) });
    const token = (await invite.json<{ url: string }>()).url.split("/invito/")[1];
    await operator(`/api/invitations/${token}/accept`, { method: "POST" });
    expect((await saveFlow(operator, id, custom)).status).toBe(403);

    await saveFlow(owner, id, custom);
    expect((await owner(`/projects/${id}/template`, { method: "PUT", body: JSON.stringify({ template: "restaurant" }) })).status).toBe(204);
    expect((await project(owner, id)).widget.customized).toBe(false);
  });
});
