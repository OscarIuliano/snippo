import { createExecutionContext, createMessageBatch, getQueueResult } from "cloudflare:test";
import { env, exports } from "cloudflare:workers";
import { describe, expect, it, vi } from "vitest";
import type { ChannelRow, DeliveryRow, NotificationMessage, SubmissionsPage } from "@snippo/shared";
import worker from "../src/index";
import { createActionToken } from "../src/notifications/action-token";
import { createProject, signUp, submitBooking, type Api } from "./helpers";

/** Runs the queue consumer on one message, as Cloudflare Queues would. */
async function consume(body: NotificationMessage) {
  const batch = createMessageBatch<NotificationMessage>("snippo-notifications-dev", [{ id: crypto.randomUUID(), timestamp: new Date(), attempts: 1, body }]);
  const ctx = createExecutionContext();
  await worker.queue(batch, env);
  return getQueueResult(batch, ctx);
}

const deliveries = async (api: Api, projectId: string) => (await api(`/projects/${projectId}/deliveries`)).json<DeliveryRow[]>();
const submissionStatus = async (api: Api, projectId: string) =>
  (await (await api(`/projects/${projectId}/submissions`)).json<SubmissionsPage>()).items[0]?.status;

describe("notification channels", () => {
  it("starts every project with an email channel to its creator", async () => {
    const api = await signUp("owner-channels@example.com");
    const projectId = await createProject(api);

    const channels = await (await api(`/projects/${projectId}/channels`)).json<ChannelRow[]>();
    expect(channels).toEqual([expect.objectContaining({ type: "email", target: "owner-channels@example.com", isActive: true })]);
  });

  it("normalizes WhatsApp numbers and rejects invalid or duplicate ones", async () => {
    const api = await signUp("whatsapp@example.com");
    const projectId = await createProject(api);
    const add = (target: string) => api(`/projects/${projectId}/channels`, { method: "POST", body: JSON.stringify({ type: "whatsapp", target }) });

    const created = await add("333 123 4567");
    expect(created.status).toBe(201);
    expect((await created.json<ChannelRow>()).target).toBe("+393331234567");
    expect((await add("+39 333 1234567")).status).toBe(409);
    expect((await add("abc")).status).toBe(422);
  });

  it("does not let another organization touch a channel", async () => {
    const owner = await signUp("owner-iso@example.com");
    const projectId = await createProject(owner);
    const [channel] = await (await owner(`/projects/${projectId}/channels`)).json<ChannelRow[]>();
    const stranger = await signUp("stranger-iso@example.com");

    expect((await stranger(`/projects/${projectId}/channels/${channel!.id}`, { method: "DELETE" })).status).toBe(404);
    expect((await stranger(`/projects/${projectId}/channels/${channel!.id}/test`, { method: "POST" })).status).toBe(404);
  });
});

describe("notification delivery", () => {
  it("notifies every active channel once, even when the message is retried", async () => {
    const api = await signUp("delivery@example.com");
    const projectId = await createProject(api);
    await api(`/projects/${projectId}/channels`, { method: "POST", body: JSON.stringify({ type: "whatsapp", target: "+393330000000" }) });
    const submissionId = await submitBooking(api, projectId);
    const log = vi.spyOn(console, "log");

    const result = await consume({ kind: "submission", submissionId });
    await consume({ kind: "submission", submissionId }); // a redelivered message

    expect(result.explicitAcks).toHaveLength(1);
    const rows = (await deliveries(api, projectId)).filter((d) => d.submissionId === submissionId);
    expect(rows.map((d) => [d.channelType, d.status, d.attempts]).sort()).toEqual([
      ["email", "sent", 1],
      ["whatsapp", "sent", 1],
    ]);
    const output = log.mock.calls.flat().join("\n");
    expect(output).toContain("Nuova richiesta: Anna · sab 12 dic, 20:30 · 4 persone");
    expect(output).toContain("/v1/actions/");
    log.mockRestore();
  });

  it("skips inactive channels", async () => {
    const api = await signUp("inactive@example.com");
    const projectId = await createProject(api);
    const [email] = await (await api(`/projects/${projectId}/channels`)).json<ChannelRow[]>();
    await api(`/projects/${projectId}/channels/${email!.id}`, { method: "PATCH", body: JSON.stringify({ isActive: false }) });

    await consume({ kind: "submission", submissionId: await submitBooking(api, projectId) });
    expect(await deliveries(api, projectId)).toEqual([]);
  });

  it("sends a test notification from the dashboard", async () => {
    const api = await signUp("test-send@example.com");
    const projectId = await createProject(api);
    const [channel] = await (await api(`/projects/${projectId}/channels`)).json<ChannelRow[]>();

    const res = await api(`/projects/${projectId}/channels/${channel!.id}/test`, { method: "POST" });
    expect(res.status).toBe(202);
    const { deliveryId } = await res.json<{ deliveryId: string }>();
    expect((await deliveries(api, projectId))[0]).toMatchObject({ id: deliveryId, submissionId: null });

    await consume({ kind: "test", deliveryId });
    expect((await deliveries(api, projectId))[0]).toMatchObject({ id: deliveryId, status: "sent" });
  });
});

describe("Conferma / Rifiuta links", () => {
  const actionUrl = async (submissionId: string, action: "confirmed" | "rejected") =>
    `https://api.snippo.test/v1/actions/${await createActionToken(env.BETTER_AUTH_SECRET, submissionId, action)}`;

  it("shows a confirmation page on GET and changes the status only on POST, once", async () => {
    const api = await signUp("actions@example.com");
    const projectId = await createProject(api);
    const url = await actionUrl(await submitBooking(api, projectId), "confirmed");

    const page = await exports.default.fetch(url);
    expect(page.status).toBe(200);
    expect(await page.text()).toContain("Conferma la richiesta");
    expect(await submissionStatus(api, projectId)).toBe("new");

    expect(await (await exports.default.fetch(url, { method: "POST" })).text()).toContain("Richiesta confermata");
    expect(await submissionStatus(api, projectId)).toBe("confirmed");

    const reject = await exports.default.fetch(await actionUrl((await (await api(`/projects/${projectId}/submissions`)).json<SubmissionsPage>()).items[0]!.id, "rejected"), { method: "POST" });
    expect(await reject.text()).toContain("già confermata");
    expect(await submissionStatus(api, projectId)).toBe("confirmed");
  });

  it("rejects a tampered or expired link", async () => {
    const api = await signUp("tampered@example.com");
    const projectId = await createProject(api);
    const submissionId = await submitBooking(api, projectId);

    const valid = await createActionToken(env.BETTER_AUTH_SECRET, submissionId, "rejected");
    const forged = await createActionToken("another-secret-of-sufficient-length", submissionId, "confirmed");
    const expired = await createActionToken(env.BETTER_AUTH_SECRET, submissionId, "confirmed", Date.now() - 15 * 24 * 3600 * 1000);

    for (const token of [forged, expired, `${valid}x`, "garbage"]) {
      const res = await exports.default.fetch(`https://api.snippo.test/v1/actions/${token}`, { method: "POST" });
      expect(res.status).toBe(400);
    }
    expect(await submissionStatus(api, projectId)).toBe("new");
  });
});
