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
  const url = (path: string) => `${baseUrl.replace(/\/$/, "")}/v1/widget${path}?key=${encodeURIComponent(publicKey)}`;

  return {
    async getConfig(): Promise<WidgetConfig> {
      const res = await fetch(url("/config"));
      if (!res.ok) throw new ApiError(`Configurazione non disponibile (${res.status})`);
      return res.json();
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
