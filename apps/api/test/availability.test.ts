import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import type { AvailabilitySettings, ProjectDetail, WidgetAvailability } from "@snippo/shared";
import { availableTimes, nowIn, type AvailabilityRules } from "../src/availability";
import { SITE_ORIGIN, createProject, inDays, signUp, submitBooking, type Api } from "./helpers";

const OPTIONS = ["12:30", "13:30", "19:30", "20:30", "21:30"];
const open: AvailabilityRules = { hours: [], closures: [], slotCapacity: null };
const now = { date: "2026-10-08", time: "15:00" }; // a Thursday

describe("availableTimes", () => {
  it("allows every time when nothing is configured", () => {
    expect(availableTimes(open, "2026-10-09", OPTIONS, new Map(), 2, now)).toEqual(OPTIONS);
  });

  it("closes past days and the times already gone today", () => {
    expect(availableTimes(open, "2026-10-07", OPTIONS, new Map(), 2, now)).toEqual([]);
    expect(availableTimes(open, "2026-10-08", OPTIONS, new Map(), 2, now)).toEqual(["19:30", "20:30", "21:30"]);
  });

  it("keeps only the times inside the opening ranges of that weekday", () => {
    // Friday 2026-10-09 is weekday 4: lunch until 14:00, dinner from 19:00 to 21:00 (21:30 excluded).
    const rules = { ...open, hours: [{ weekday: 4, opensAt: "12:00", closesAt: "14:00" }, { weekday: 4, opensAt: "19:00", closesAt: "21:00" }] };
    expect(availableTimes(rules, "2026-10-09", OPTIONS, new Map(), 2, now)).toEqual(["12:30", "13:30", "19:30", "20:30"]);
    // Saturday has no range: closed.
    expect(availableTimes(rules, "2026-10-10", OPTIONS, new Map(), 2, now)).toEqual([]);
  });

  it("closes the days in a closure, both ends included", () => {
    const rules = { ...open, closures: [{ dateFrom: "2026-10-10", dateTo: "2026-10-12" }] };
    expect(availableTimes(rules, "2026-10-10", OPTIONS, new Map(), 2, now)).toEqual([]);
    expect(availableTimes(rules, "2026-10-12", OPTIONS, new Map(), 2, now)).toEqual([]);
    expect(availableTimes(rules, "2026-10-13", OPTIONS, new Map(), 2, now)).toEqual(OPTIONS);
  });

  it("offers a time only if the party still fits", () => {
    const rules = { ...open, slotCapacity: 10 };
    const used = new Map([["20:30", 8], ["21:30", 10]]);
    expect(availableTimes(rules, "2026-10-09", OPTIONS, used, 2, now)).toEqual(["12:30", "13:30", "19:30", "20:30"]);
    expect(availableTimes(rules, "2026-10-09", OPTIONS, used, 3, now)).toEqual(["12:30", "13:30", "19:30"]);
  });
});

describe("nowIn", () => {
  it("reads date and time in the project's timezone", () => {
    // 23:30 UTC on 8 October is already 9 October in Rome (UTC+2 in summer time).
    expect(nowIn("Europe/Rome", new Date("2026-10-08T23:30:00Z"))).toEqual({ date: "2026-10-09", time: "01:30" });
  });
});

async function widgetAvailability(api: Api, projectId: string, query: string) {
  const { widget } = await (await api(`/projects/${projectId}`)).json<ProjectDetail>();
  const res = await exports.default.fetch(`https://api.snippo.test/v1/widget/availability?key=${widget.publicKey}&${query}`, {
    headers: { Origin: SITE_ORIGIN },
  });
  expect(res.status).toBe(200);
  return (await res.json<WidgetAvailability>()).days;
}

/** Opening hours every day: lunch 12:00-15:00, dinner 19:00-22:00. */
const everyDay = Array.from({ length: 7 }, (_, weekday) => [
  { weekday, opensAt: "12:00", closesAt: "15:00" },
  { weekday, opensAt: "19:00", closesAt: "22:00" },
]).flat();

describe("availability API", () => {
  it("saves hours, capacity and closures, and the widget follows them", async () => {
    const api = await signUp("availability@example.com");
    const projectId = await createProject(api);
    const day = inDays(20);

    const put = await api(`/projects/${projectId}/availability`, { method: "PUT", body: JSON.stringify({ hours: everyDay, slotCapacity: 6 }) });
    expect(put.status).toBe(204);
    expect((await api(`/projects/${projectId}/closures`, { method: "POST", body: JSON.stringify({ dateFrom: inDays(21), dateTo: inDays(22), reason: "Ferie" }) })).status).toBe(201);

    const settings = await (await api(`/projects/${projectId}/availability`)).json<AvailabilitySettings>();
    expect(settings).toMatchObject({ slotCapacity: 6, capacityUnit: "people", timeOptions: ["12:30", "13:30", "19:30", "20:30", "21:30"] });
    expect(settings.hours).toHaveLength(14);
    expect(settings.closures).toEqual([expect.objectContaining({ dateFrom: inDays(21), dateTo: inDays(22), reason: "Ferie" })]);

    await submitBooking(api, projectId, { date: day, time: "20:30", party_size: "4" });
    const days = await widgetAvailability(api, projectId, `from=${day}&to=${inDays(23)}&partySize=3`);
    expect(days[day]).toEqual(["12:30", "13:30", "19:30", "21:30"]); // 20:30 has 2 seats left
    expect(days[inDays(21)]).toEqual([]);
    expect(days[inDays(22)]).toEqual([]);
    expect(days[inDays(23)]).toHaveLength(5);
  });

  it("refuses a booking on a full or closed slot, but not a retry of an accepted one", async () => {
    const api = await signUp("full-slot@example.com");
    const projectId = await createProject(api);
    const day = inDays(20);
    await api(`/projects/${projectId}/availability`, { method: "PUT", body: JSON.stringify({ hours: everyDay, slotCapacity: 6 }) });

    await submitBooking(api, projectId, { date: day, time: "20:30", party_size: "4" });
    const { widget } = await (await api(`/projects/${projectId}`)).json<ProjectDetail>();
    const flowVersionId = (await (await exports.default.fetch(`https://api.snippo.test/v1/widget/config?key=${widget.publicKey}`, { headers: { Origin: SITE_ORIGIN } })).json<{ flowVersionId: string }>()).flowVersionId;
    const send = (answers: Record<string, string>, headers: Record<string, string> = {}) =>
      exports.default.fetch(`https://api.snippo.test/v1/widget/submissions?key=${widget.publicKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: SITE_ORIGIN, ...headers },
        body: JSON.stringify({
          flowVersionId,
          answers: { date: day, time: "20:30", party_size: "3", name: "Luca", phone: "+39 333 0000000", ...answers },
          consent: true,
        }),
      });
    const full = await send({});
    expect(full.status).toBe(422);
    expect((await full.json<{ errors: Record<string, string> }>()).errors.time).toMatch(/non è più disponibile/);
    expect((await send({ time: "21:30" })).status).toBe(201);

    // Fills 21:30 (3 + 3 = 6): the same request retried with its Idempotency-Key is still accepted.
    const first = await send({ time: "21:30" }, { "Idempotency-Key": "retry-slot" });
    expect(first.status).toBe(201);
    expect((await send({ time: "21:30" }, { "Idempotency-Key": "retry-slot" })).status).toBe(200);
  });

  it("validates hours and keeps other organizations out", async () => {
    const api = await signUp("hours-invalid@example.com");
    const projectId = await createProject(api);
    const bad = await api(`/projects/${projectId}/availability`, {
      method: "PUT",
      body: JSON.stringify({ hours: [{ weekday: 0, opensAt: "22:00", closesAt: "19:00" }], slotCapacity: null }),
    });
    expect(bad.status).toBe(422);

    const stranger = await signUp("hours-stranger@example.com");
    expect((await stranger(`/projects/${projectId}/availability`)).status).toBe(404);
    expect((await stranger(`/projects/${projectId}/availability`, { method: "PUT", body: JSON.stringify({ hours: [], slotCapacity: null }) })).status).toBe(404);
  });
});
