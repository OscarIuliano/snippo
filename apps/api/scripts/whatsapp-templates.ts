// Creates Snippo's WhatsApp templates on a WhatsApp Business Account and shows their review status.
//
//   node scripts/whatsapp-templates.ts <waba-id> <public-api-url>           create the missing ones
//   node scripts/whatsapp-templates.ts <waba-id> <public-api-url> --status  only show the status
//
// The access token is asked for without echo (or read from WHATSAPP_TOKEN), so it ends up
// neither in the shell history nor on screen.

import { createInterface } from "node:readline";
import { GRAPH_API, TEMPLATE_LANGUAGE, templateDefinition, whatsappTemplates, type WhatsAppTemplateKey } from "../src/notifications/whatsapp.ts";

const [wabaId, apiUrl] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const statusOnly = process.argv.includes("--status");
if (!wabaId || !apiUrl) {
  console.error("Uso: node scripts/whatsapp-templates.ts <waba-id> <public-api-url> [--status]");
  process.exit(1);
}

function askHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const write = (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput;
    (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput = (s) => (s.startsWith(question) ? write.call(rl, question) : undefined);
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolve(answer.trim());
    });
  });
}

const token = process.env.WHATSAPP_TOKEN || (await askHidden("Token di accesso WhatsApp (non viene mostrato): "));

async function graph(path: string, init: RequestInit = {}) {
  const res = await fetch(`${GRAPH_API}/${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } });
  const data = (await res.json()) as { error?: { code: number; message: string; error_user_msg?: string } } & Record<string, unknown>;
  if (data.error) throw new Error(`${data.error.code}: ${data.error.error_user_msg ?? data.error.message}`);
  return data;
}

const existing = (await graph(`${wabaId}/message_templates?fields=name,language,status,category,rejected_reason&limit=100`)) as {
  data: { name: string; language: string; status: string; category: string; rejected_reason?: string }[];
};

for (const key of Object.keys(whatsappTemplates) as WhatsAppTemplateKey[]) {
  const name = whatsappTemplates[key].name;
  const found = existing.data.find((t) => t.name === name && t.language === TEMPLATE_LANGUAGE);
  if (found) {
    const reason = found.rejected_reason && found.rejected_reason !== "NONE" ? ` (${found.rejected_reason})` : "";
    console.log(`${name}: ${found.status}, categoria ${found.category}${reason}`);
    continue;
  }
  if (statusOnly) {
    console.log(`${name}: non ancora creato`);
    continue;
  }
  const created = await graph(`${wabaId}/message_templates`, {
    method: "POST",
    body: JSON.stringify(templateDefinition(key, `${apiUrl.replace(/\/$/, "")}/v1/actions`)),
  });
  console.log(`${name}: creato, stato ${String(created.status)}, categoria ${String(created.category)}`);
}
