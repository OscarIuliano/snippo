import { env } from "cloudflare:workers";
import { createDb, flowVersions, organizations, projectDomains, projects, widgets } from "@snippo/db";
import { templates } from "@snippo/shared";

export const PUBLIC_KEY = "pk_test_snippo";
export const FLOW_VERSION_ID = "fv_test_1";
export const ALLOWED_ORIGIN = "https://www.trattoria.example";

export async function seed() {
  const db = createDb(env.DB);
  await db.insert(organizations).values({ id: "org_test", name: "Test", slug: "test" }).onConflictDoNothing();
  await db.insert(projects).values({ id: "prj_test", organizationId: "org_test", name: "Trattoria", industry: "restaurant" }).onConflictDoNothing();
  await db.insert(projectDomains).values({ id: "dom_test", projectId: "prj_test", domain: "trattoria.example" }).onConflictDoNothing();
  await db
    .insert(widgets)
    .values({
      id: "wgt_test",
      projectId: "prj_test",
      type: "chat",
      name: "Prenotazioni",
      publicKey: PUBLIC_KEY,
      theme: { primaryColor: "#c2410c", position: "right", title: "Trattoria" },
      activeFlowVersionId: FLOW_VERSION_ID,
    })
    .onConflictDoNothing();
  await db
    .insert(flowVersions)
    .values({ id: FLOW_VERSION_ID, widgetId: "wgt_test", version: 1, template: "restaurant", definition: templates.restaurant })
    .onConflictDoNothing();
}
