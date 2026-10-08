import type { WidgetAvailability } from "@snippo/shared/availability";
import type { WidgetEvent } from "@snippo/shared/stats";
import type { SubmissionInput, WidgetConfig } from "@snippo/shared/widget-api";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly fieldErrors: Record<string, string> = {},
  ) {
    super(message);
  }
}

export function createApi(baseUrl: string, publicKey: string) {
  const url = (path: string, params = "") => `${baseUrl.replace(/\/$/, "")}/v1/widget${path}?key=${encodeURIComponent(publicKey)}${params}`;

  return {
    async getConfig(): Promise<WidgetConfig> {
      const res = await fetch(url("/config"));
      if (!res.ok) throw new ApiError(`Configurazione non disponibile (${res.status})`);
      return res.json();
    },

    /** Bookable times per day for the next 31 days. */
    async getAvailability(partySize: number): Promise<WidgetAvailability> {
      const res = await fetch(url("/availability", `&partySize=${partySize}`));
      if (!res.ok) throw new ApiError(`Disponibilità non disponibile (${res.status})`);
      return res.json();
    },

    /** Fire and forget: statistics must never get in the way of the conversation. */
    sendEvents(events: WidgetEvent[]): void {
      // text/plain keeps it a simple CORS request (no preflight); keepalive survives page unload.
      fetch(url("/events"), { method: "POST", headers: { "Content-Type": "text/plain" }, body: JSON.stringify({ events }), keepalive: true }).catch(
        () => {},
      );
    },

    async submit(input: SubmissionInput, idempotencyKey: string): Promise<{ id: string }> {
      const res = await fetch(url("/submissions"), {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
        body: JSON.stringify(input),
      });
      if (res.ok) return res.json();
      const body = (await res.json().catch(() => ({}))) as { title?: string; errors?: Record<string, string> };
      throw new ApiError(body.title ?? "Invio non riuscito, riprova", body.errors);
    },
  };
}

export type Api = ReturnType<typeof createApi>;
