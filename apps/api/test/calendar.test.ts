import { describe, expect, it } from "vitest";
import type { SubmissionRow } from "@snippo/shared";
import { createProject, inDays, signUp, submitBooking } from "./helpers";

const start = inDays(10);
const end = inDays(40);

describe("GET /api/v1/projects/:id/calendar", () => {
  it("returns the bookings in the range, ordered by time, without rejected ones", async () => {
    const api = await signUp("calendar@example.com");
    const projectId = await createProject(api);
    await submitBooking(api, projectId, { date: start, time: "20:30", name: "Bruno" });
    await submitBooking(api, projectId, { date: start, time: "12:30", name: "Anna" });
    await submitBooking(api, projectId, { date: end, time: "21:30", name: "Carla" });
    await submitBooking(api, projectId, { date: inDays(41), time: "12:30", name: "Fuori intervallo" });
    const rejected = await submitBooking(api, projectId, { date: inDays(24), time: "19:30", name: "Rifiutata" });
    await api(`/submissions/${rejected}`, { method: "PATCH", body: JSON.stringify({ status: "rejected" }) });

    const res = await api(`/projects/${projectId}/calendar?from=${start}&to=${end}`);
    expect(res.status).toBe(200);
    const items = await res.json<SubmissionRow[]>();
    expect(items.map((s) => [s.contactName, s.bookingAt])).toEqual([
      ["Anna", `${start}T12:30`],
      ["Bruno", `${start}T20:30`],
      ["Carla", `${end}T21:30`],
    ]);
  });

  it("validates the range", async () => {
    const api = await signUp("calendar-range@example.com");
    const projectId = await createProject(api);

    for (const query of ["", "from=2026-12-01", "from=2026-12-31&to=2026-12-01", "from=2026-01-01&to=2026-06-01", "from=ieri&to=oggi"]) {
      expect((await api(`/projects/${projectId}/calendar?${query}`)).status).toBe(422);
    }
  });

  it("does not show another organization's bookings", async () => {
    const owner = await signUp("calendar-owner@example.com");
    const projectId = await createProject(owner);
    const stranger = await signUp("calendar-stranger@example.com");

    expect((await stranger(`/projects/${projectId}/calendar?from=${start}&to=${end}`)).status).toBe(404);
  });
});
