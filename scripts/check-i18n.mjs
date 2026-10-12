// Fails when an Italian text has no English: every t("…") and msg("…") of the dashboard, and every
// message the API sends with problem(…). Run with: node scripts/check-i18n.mjs
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const { sharedEn } = await import(join(root, "packages/shared/src/i18n-en.ts"));
const { en: dashboardEn } = await import(join(root, "apps/dashboard/src/i18n/en.ts"));
const { apiEn } = await import(join(root, "apps/api/src/messages-en.ts"));

function files(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : /\.tsx?$/.test(name) ? [path] : [];
  });
}

// A JS string literal in double quotes, escapes included.
const literal = String.raw`"((?:[^"\\]|\\.)*)"`;
const unescape = (s) => JSON.parse(`"${s}"`);

const missing = [];
function check(texts, dictionary, where) {
  for (const { text, file } of texts) if (!(text in dictionary)) missing.push(`${where}: ${file.replace(root, "")}: ${text}`);
}

const dashboardTexts = files(join(root, "apps/dashboard/src")).flatMap((file) =>
  [...readFileSync(file, "utf8").matchAll(new RegExp(String.raw`\b(?:t|msg|translate\([^,]+,)\s*\(?\s*${literal}`, "g"))].map((m) => ({ text: unescape(m[1]), file })),
);
check(dashboardTexts, { ...sharedEn, ...dashboardEn }, "dashboard");

// The widget's messages are for the visitors of a site: their language follows the project, not the dashboard.
const apiTexts = files(join(root, "apps/api/src")).filter((file) => !file.endsWith("/widget.ts")).flatMap((file) =>
  [...readFileSync(file, "utf8").matchAll(/problem\(c, \d+, ([^;]*?)\)(?:;|$)/gms)].flatMap((m) =>
    [...m[1].matchAll(new RegExp(literal, "g"))].map((l) => unescape(l[1])).filter((text) => /^[A-ZÀ-Ú]/.test(text)).map((text) => ({ text, file })),
  ),
);
check(apiTexts, { ...sharedEn, ...apiEn }, "api");

if (missing.length) {
  console.error(`English missing for ${missing.length} texts:\n${missing.join("\n")}`);
  process.exit(1);
}
console.log(`i18n ok: ${dashboardTexts.length} dashboard texts, ${apiTexts.length} API messages`);
