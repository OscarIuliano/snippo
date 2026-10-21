import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import type { BillingOverview, MeResponse } from "@snippo/shared";
import { createProject, signUp, submitBooking } from "./helpers";

describe("billing overview", () => {
  it("starts on Free and counts the use of the month", async () => {
    const api = await signUp("billing-free@example.com");
    const projectId = await createProject(api);
    await submitBooking(api, projectId);
    await submitBooking(api, projectId, { phone: "+39 333 9998887" });

    const billing = await (await api("/billing")).json<BillingOverview>();
    expect(billing).toMatchObject({
      plan: "free",
      status: null,
      usage: { projects: 1, submissionsThisMonth: 2, members: 1 },
      checkoutAvailable: false,
    });
  });

  it("shows the plan of the subscription, and Free again once it is cancelled", async () => {
    const api = await signUp("billing-pro@example.com");
    const { organization } = await (await api("/me")).json<MeResponse>();
    await env.DB.prepare(
      "INSERT INTO subscriptions (organization_id, plan, interval, status, provider, current_period_end) VALUES (?, 'pro', 'year', 'active', 'paddle', '2027-10-12T00:00:00.000Z')",
    )
      .bind(organization.id)
      .run();
    expect(await (await api("/billing")).json<BillingOverview>()).toMatchObject({ plan: "pro", interval: "year", status: "active" });

    await env.DB.prepare("UPDATE subscriptions SET status = 'canceled' WHERE organization_id = ?").bind(organization.id).run();
    expect((await (await api("/billing")).json<BillingOverview>()).plan).toBe("free");
  });

  it("is for the owner only", async () => {
    const owner = await signUp("billing-owner@example.com");
    const res = await owner("/team/invitations", { method: "POST", body: JSON.stringify({ role: "admin" }) });
    const token = (await res.json<{ url: string }>()).url.split("/invito/")[1]!;
    const admin = await signUp("billing-admin@example.com");
    await admin(`/api/invitations/${token}/accept`, { method: "POST" });
    expect((await admin("/billing")).status).toBe(403);
  });
});
