import { and, eq, notificationChannels, submissions, widgets, type Db } from "@snippo/db";
import { addDays } from "@snippo/shared";
import { v7 as uuidv7 } from "uuid";
import { nowIn } from "../availability";
import { extractContactFields } from "../widget";

type Project = { id: string; industry: string; timezone: string };
type Channel = typeof notificationChannels.$inferSelect;

/**
 * "Invia prova" in Notifiche: a request marked as a test, so the business sees the whole loop
 * (notification, Conferma / Rifiuta, Avvisa il cliente) on something that looks real.
 * The customer is the business itself: its WhatsApp number and email, never a stranger's.
 * Returns null when the project has no published questions to attach it to.
 */
export async function createTestRequest(db: Db, project: Project, channel: Channel, userEmail: string): Promise<string | null> {
  const widget = await db.query.widgets.findFirst({ where: eq(widgets.projectId, project.id) });
  if (!widget?.activeFlowVersionId) return null;

  const whatsapp =
    channel.type === "whatsapp"
      ? channel
      : await db.query.notificationChannels.findFirst({ where: and(eq(notificationChannels.projectId, project.id), eq(notificationChannels.type, "whatsapp")) });
  const contact: Record<string, string> = { name: "Anna Rossi", email: channel.type === "email" ? channel.target : userEmail };
  // Written as a visitor would: "+39 333 123 4567".
  if (whatsapp) contact.phone = whatsapp.target.replace(/^\+39(\d{3})(\d{3})(\d{3,4})$/, "+39 $1 $2 $3");

  const tomorrow = addDays(nowIn(project.timezone).date, 1);
  const answers: Record<string, string> =
    project.industry === "restaurant"
      ? { party_size: "2", date: tomorrow, time: "20:30", ...contact, notes: "Richiesta di prova creata da Snippo" }
      : project.industry === "appointments"
        ? { service: "Taglio", date: tomorrow, time: "11:00", ...contact }
        : { topic: "Informazioni", message: "Richiesta di prova creata da Snippo: siete aperti la domenica?", ...contact };

  const id = uuidv7();
  await db.insert(submissions).values({
    id,
    projectId: project.id,
    widgetId: widget.id,
    flowVersionId: widget.activeFlowVersionId,
    answers,
    ...extractContactFields(answers),
    locale: "it",
    consentAt: new Date().toISOString(),
    isTest: true,
  });
  return id;
}
