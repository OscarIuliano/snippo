// Serves the dashboard (static assets, SPA fallback) and forwards /api/* to the API Worker
// through a service binding: same origin, first-party session cookie, no CORS.
interface Env {
  API: { fetch(request: Request): Promise<Response> };
}

export default {
  fetch: (request: Request, env: Env) => env.API.fetch(request),
};
