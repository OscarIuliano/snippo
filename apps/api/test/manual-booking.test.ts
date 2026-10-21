import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import type { BillingOverview, ProjectDetail, ProjectStats, SubmissionRow, WidgetAvailability } from "@snippo/shared";
import { SITE_ORIGIN, createProject, inDays, inviteOperator, signUp, type Api } from "./helpers";

const everyEvening = Array.from({ length: 7 }, (_, weekday) => ({ weekday, opensAt: "19:00", closesAt: "22:00" }));

async function freeTimes(api: Api, projectId: string, day: string, partySize: number) {
  const { widget } = await (await api(`/projects/${projectId}`)).json<ProjectDetail>();
  const res = await exports.default.fetch(
    `https://api.snippo.test/v1/widget/availability?key=${widget.publicKey}&from=${day}&to=${day}&partySize=${partySize}`,
    { headers: { Origin: SITE_ORIGIN } },
  );
  return (await res.json<WidgetAvailability>()).days[day];
}

describe("manual bookings", () => {
  it("take their place in the availability, confirmed and labeled, without counting as widget requests", async () => {
    const api = await signUp("manual-booking@example.com");
    const projectId = await createProject(api);
    const day = inDays(15);
    await api(`/projects/${projectId}/availability`, { method: "PUT", body: JSON.stringify({ hours: everyEvening, slotCapacity: 6 }) });
    expect(await freeTimes(api, projectId, day, 2)).toEqual(["19:30", "20:30", "21:30"]);

    const res = await api(`/projects/${projectId}/bookings`, {
      method: "POST",
      body: JSON.stringify({ date: day, time: "20:30", name: "Rossi (telefono)", phone: "+39 333 1112223", partySize: 5, notes: "Tavolo fuori" }),
    });
    expect(res.status).toBe(201);
    const booking = await res.json<SubmissionRow>();
    expect(booking).toMatchObject({ status: "confirmed", source: "manual", bookingAt: `${day}T20:30`, partySize: 5, contactName: "Rossi (telefono)" });
    expect(booking.answers.notes).toBe("Tavolo fuori");

    // 5 of 6 seats taken at 20:30: a party of 2 no longer fits there.
    expect(await freeTimes(api, projectId, day, 2)).toEqual(["19:30", "21:30"]);
    const calendar = await (await api(`/projects/${projectId}/calendar?from=${day}&to=${day}`)).json<SubmissionRow[]>();
    expect(calendar.map((s) => s.id)).toEqual([booking.id]);

    // Not a widget request: no notification, not in the stats or the plan usage.
    expect(await env.DB.prepare("SELECT count(*) AS n FROM notification_deliveries WHERE submission_id = ?").bind(booking.id).first("n")).toBe(0);
    const stats = await (await api(`/projects/${projectId}/stats?days=30`)).json<ProjectStats>();
    expect(stats.totals.submissions).toBe(0);
    const billing = await (await api("/billing")).json<BillingOverview>();
    expect(billing.usage.submissionsThisMonth).toBe(0);

    // Deleting it frees the place again.
    expect((await api(`/submissions/${booking.id}`, { method: "DELETE" })).status).toBe(204);
    expect(await freeTimes(api, projectId, day, 2)).toEqual(["19:30", "20:30", "21:30"]);
  });

  it("can be added and removed by operators, who still cannot delete widget requests", async () => {
    const owner = await signUp("manual-owner@example.com");
    const projectId = await createProject(owner);
    const operator = await inviteOperator(owner, "manual-operator@example.com");

    const res = await operator(`/projects/${projectId}/bookings`, { method: "POST", body: JSON.stringify({ date: inDays(10), time: "13:30", name: "Bianchi" }) });
    expect(res.status).toBe(201);
    const { id } = await res.json<SubmissionRow>();
    expect((await operator(`/submissions/${id}`, { method: "DELETE" })).status).toBe(204);

    // The exception covers bookings only, not other project settings.
    expect((await operator(`/projects/${projectId}/closures`, { method: "POST", body: JSON.stringify({ dateFrom: inDays(3), dateTo: inDays(3) }) })).status).toBe(403);
  });

  it("validates the booking and keeps other organizations out", async () => {
    const api = await signUp("manual-invalid@example.com");
    const projectId = await createProject(api);
    const post = (body: unknown, client = api) => client(`/projects/${projectId}/bookings`, { method: "POST", body: JSON.stringify(body) });

    expect((await post({ date: inDays(5), time: "25:00", name: "X" })).status).toBe(422);
    expect((await post({ date: "domani", time: "20:00", name: "X" })).status).toBe(422);
    expect((await post({ date: inDays(5), time: "20:00", name: " " })).status).toBe(422);

    const stranger = await signUp("manual-stranger@example.com");
    expect((await post({ date: inDays(5), time: "20:00", name: "X" }, stranger)).status).toBe(404);
  });
});
