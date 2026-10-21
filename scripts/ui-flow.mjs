// Runs a scripted browser flow in headless Chrome (fresh profile, no cookies) and takes screenshots along the way.
// Usage: node scripts/ui-flow.mjs <out-dir> <steps.json> [--width 390] [--height 844] [--base http://localhost:5174]
// Steps, run in order:
//   {"nav": "/path" | "https://..."}   relative paths use --base
//   {"fill": {"<selector>": "value"}}   sets inputs and textareas, firing React's input event
//   {"click": "<button or link text>" | "<selector>"}
//   {"eval": "<js>"}  {"wait": ms}  {"url": true}  {"shot": "name"}  saves <out-dir>/<name>.png
// Mobile (default 390px) emulates a phone; pass --width 1280 for desktop.
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: { width: { type: "string", default: "390" }, height: { type: "string", default: "844" }, base: { type: "string", default: "http://localhost:5174" } },
});
const [outDir, stepsFile] = positionals;
if (!outDir || !stepsFile) throw new Error("Usage: node scripts/ui-flow.mjs <out-dir> <steps.json>");
const width = Number(values.width);
mkdirSync(outDir, { recursive: true });
const steps = JSON.parse(readFileSync(stepsFile, "utf8"));
const profile = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "flow-"));
const chrome = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", ["--headless=new", "--disable-gpu", "--remote-debugging-port=9336", `--user-data-dir=${profile}`, "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let t; for (let i = 0; i < 50 && !t; i++) { await sleep(200); try { t = (await (await fetch("http://127.0.0.1:9336/json")).json()).find((x) => x.type === "page"); } catch {} }
const ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise((r) => ws.addEventListener("open", r));
let id = 0; const p = new Map(); ws.addEventListener("message", (e) => { const m = JSON.parse(e.data); if (p.has(m.id)) { p.get(m.id)(m.result); p.delete(m.id); } });
const send = (method, params = {}) => new Promise((r) => { const n = ++id; p.set(n, r); ws.send(JSON.stringify({ id: n, method, params })); });
const ev = async (expression) => (await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true })).result.value;
await send("Emulation.setDeviceMetricsOverride", { width, height: Number(values.height), deviceScaleFactor: 2, mobile: width < 768 });
for (const step of steps) {
  if (step.nav) { await send("Page.navigate", { url: step.nav.startsWith("http") ? step.nav : `${values.base}${step.nav}` }); await sleep(2500); }
  if (step.fill) for (const [sel, val] of Object.entries(step.fill)) {
    await ev(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, "value").set.call(el, ${JSON.stringify(val)}); el.dispatchEvent(new Event("input", { bubbles: true })); })()`);
  }
  if (step.click) { const ok = await ev(`(() => { const el = [...document.querySelectorAll("button, a")].find((b) => b.textContent.trim() === ${JSON.stringify(step.click)}) ?? document.querySelector(${JSON.stringify(step.click)}); if (!el) return false; el.click(); return true; })()`); if (!ok) console.log("non trovato:", step.click); await sleep(2000); }
  if (step.wait) await sleep(step.wait);
  if (step.eval) { await ev(step.eval); await sleep(500); }
  if (step.url) console.log("url:", await ev("location.href"));
  if (step.shot) {
    const overflow = await ev("document.documentElement.scrollWidth - window.innerWidth");
    if (overflow > 0) console.log(`overflow orizzontale: ${overflow}px in ${step.shot}`);
    const { data } = await send("Page.captureScreenshot", { format: "png" }); writeFileSync(`${outDir}/${step.shot}.png`, Buffer.from(data, "base64")); console.log("shot:", step.shot);
  }
}
ws.close(); chrome.kill();
