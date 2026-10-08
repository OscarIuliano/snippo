import { Hono } from "hono";
import { and, createDb, eq, projects, submissions } from "@snippo/db";
import type { AppEnv } from "./env";
import { verifyActionToken, type SubmissionAction } from "./notifications/action-token";
import { escapeHtml, submissionHeadline } from "./notifications/content";

// Conferma / Rifiuta from a notification. The link opens a page and the change happens only
// on the button's POST: email scanners that prefetch links must not confirm anything.

export const actionRoutes = new Hono<AppEnv>();

const verbs: Record<SubmissionAction, { button: string; done: string; color: string }> = {
  confirmed: { button: "Conferma la richiesta", done: "confermata", color: "#4f46e5" },
  rejected: { button: "Rifiuta la richiesta", done: "rifiutata", color: "#57534e" },
};

const statusWords: Record<string, string> = { new: "nuova", confirmed: "confermata", rejected: "rifiutata", completed: "completata" };

function page(title: string, body: string, status = 200) {
  const html = `<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${escapeHtml(title)} · Snippo</title></head>
<body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#f5f5f4;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:#1c1917">
<main style="width:min(420px,calc(100% - 32px));background:#fff;border:1px solid #e7e5e4;border-radius:12px;padding:28px">
<p style="margin:0 0 16px;font-weight:700;color:#4f46e5">snippo</p>${body}</main></body></html>`;
  return new Response(html, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

const invalidLink = () =>
  page("Link non valido", `<h1 style="margin:0;font-size:20px">Link non valido o scaduto</h1><p style="color:#57534e">Gestisci la richiesta dalla dashboard.</p>`, 400);

async function load(env: AppEnv["Bindings"], token: string) {
  const parsed = await verifyActionToken(env.BETTER_AUTH_SECRET, token);
  if (!parsed) return null;
  const db = createDb(env.DB);
  const row = await db
    .select({ submission: submissions, projectName: projects.name, projectId: projects.id })
    .from(submissions)
    .innerJoin(projects, eq(projects.id, submissions.projectId))
    .where(eq(submissions.id, parsed.submissionId))
    .get();
  return row ? { ...parsed, ...row, db } : null;
}

function alreadyHandled(env: AppEnv["Bindings"], projectId: string, status: string) {
  return page(
    "Richiesta già gestita",
    `<h1 style="margin:0;font-size:20px">Questa richiesta è già ${escapeHtml(statusWords[status] ?? status)}</h1>
<p style="color:#57534e">Nessuna modifica fatta.</p>
<p><a href="${escapeHtml(`${env.DASHBOARD_ORIGIN}/progetti/${projectId}/richieste`)}" style="color:#4f46e5">Apri nella dashboard</a></p>`,
  );
}

actionRoutes.get("/:token", async (c) => {
  const found = await load(c.env, c.req.param("token"));
  if (!found) return invalidLink();
  const { submission, projectName, projectId, action } = found;
  if (submission.status !== "new") return alreadyHandled(c.env, projectId, submission.status);

  const verb = verbs[action];
  return page(
    verb.button,
    `<p style="margin:0;color:#78716c;font-size:14px">${escapeHtml(projectName)}</p>
<h1 style="margin:6px 0 20px;font-size:20px">${escapeHtml(submissionHeadline(submission))}</h1>
<form method="post"><button type="submit" style="width:100%;padding:12px;border:0;border-radius:8px;background:${verb.color};color:#fff;font:inherit;font-weight:600;cursor:pointer">${verb.button}</button></form>`,
  );
});

actionRoutes.post("/:token", async (c) => {
  const found = await load(c.env, c.req.param("token"));
  if (!found) return invalidLink();
  const { db, submission, projectId, action } = found;

  // Applies only to a submission that is still "new": a second click changes nothing.
  const result = await db
    .update(submissions)
    .set({ status: action, updatedAt: new Date().toISOString() })
    .where(and(eq(submissions.id, submission.id), eq(submissions.status, "new")))
    .returning({ id: submissions.id });
  if (result.length === 0) {
    const current = await db.query.submissions.findFirst({ where: eq(submissions.id, submission.id), columns: { status: true } });
    return alreadyHandled(c.env, projectId, current?.status ?? submission.status);
  }

  return page(
    "Fatto",
    `<h1 style="margin:0;font-size:20px">Richiesta ${verbs[action].done} ✓</h1>
<p style="color:#57534e">${escapeHtml(submissionHeadline(submission))}</p>
<p><a href="${escapeHtml(`${c.env.DASHBOARD_ORIGIN}/progetti/${projectId}/richieste`)}" style="color:#4f46e5">Apri nella dashboard</a></p>`,
  );
});
