import { env, exports } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { ALLOWED_ORIGIN, FLOW_VERSION_ID, PUBLIC_KEY, seed } from "./seed";

const API = "https://api.snippo.test/v1/widget";

const validAnswers = {
  date: "2026-12-12",
  time: "20:30",
  party_size: "4",
  name: "Mario Rossi",
  phone: "+39 333 1234567",
  notes: "Un seggiolone",
};

function submit(body: unknown, headers: Record<string, string> = {}) {
  return exports.default.fetch(`${API}/submissions?key=${PUBLIC_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: ALLOWED_ORIGIN, ...headers },
    body: JSON.stringify(body),
  });
}

beforeEach(seed);

describe("GET /v1/widget/config", () => {
  it("returns theme and flow for an authorized origin", async () => {
    const res = await exports.default.fetch(`${API}/config?key=${PUBLIC_KEY}`, { headers: { Origin: ALLOWED_ORIGIN } });

    expect(res.status).toBe(200);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(ALLOWED_ORIGIN);
    const config = await res.json<{ flowVersionId: string; flow: { steps: { key: string }[] } }>();
    expect(config.flowVersionId).toBe(FLOW_VERSION_ID);
    expect(config.flow.steps.map((s) => s.key)).toContain("party_size");
  });

  it("rejects an origin that is not a project domain", async () => {
    const res = await exports.default.fetch(`${API}/config?key=${PUBLIC_KEY}`, { headers: { Origin: "https://evil.example" } });

    expect(res.status).toBe(403);
    expect(res.headers.get("Content-Type")).toContain("application/problem+json");
  });

  it("rejects a lookalike domain that only ends with the project domain", async () => {
    const res = await exports.default.fetch(`${API}/config?key=${PUBLIC_KEY}`, { headers: { Origin: "https://nottrattoria.example" } });

    expect(res.status).toBe(403);
  });
});

describe("POST /v1/widget/submissions", () => {
  it("stores a valid submission and extracts the contact fields", async () => {
    const res = await submit({ flowVersionId: FLOW_VERSION_ID, answers: validAnswers, consent: true });

    expect(res.status).toBe(201);
    const { id } = await res.json<{ id: string }>();
    const row = await env.DB.prepare("SELECT * FROM submissions WHERE id = ?").bind(id).first();
    expect(row).toMatchObject({
      status: "new",
      contact_name: "Mario Rossi",
      contact_phone: "+39 333 1234567",
      party_size: 4,
      booking_at: "2026-12-12T20:30",
    });
  });

  it("returns field errors when answers break the flow rules", async () => {
    const res = await submit({ flowVersionId: FLOW_VERSION_ID, answers: { ...validAnswers, party_size: "40" }, consent: true });

    expect(res.status).toBe(422);
    const body = await res.json<{ errors: Record<string, string> }>();
    expect(Object.keys(body.errors)).toEqual(["party_size"]);
  });

  it("requires privacy consent", async () => {
    const res = await submit({ flowVersionId: FLOW_VERSION_ID, answers: validAnswers, consent: false });

    expect(res.status).toBe(422);
  });

  it("does not create duplicates when the same Idempotency-Key is retried", async () => {
    const body = { flowVersionId: FLOW_VERSION_ID, answers: validAnswers, consent: true };
    const first = await submit(body, { "Idempotency-Key": "retry-1" });
    const second = await submit(body, { "Idempotency-Key": "retry-1" });

    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect((await second.json<{ id: string }>()).id).toBe((await first.json<{ id: string }>()).id);
    const count = await env.DB.prepare("SELECT COUNT(*) AS n FROM submissions WHERE idempotency_key = 'retry-1'").first<number>("n");
    expect(count).toBe(1);
  });
});
