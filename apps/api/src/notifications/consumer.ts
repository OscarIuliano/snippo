import {
  and,
  createDb,
  eq,
  flowVersions,
  notificationChannels,
  notificationDeliveries,
  projects,
  submissions,
  type Db,
} from "@snippo/db";
import { flowDefinitionSchema, type NotificationMessage } from "@snippo/shared";
import { v7 as uuidv7 } from "uuid";
import type { AppEnv } from "../env";
import { createActionToken } from "./action-token";
import { buildSubmissionNotification, buildTestNotification, type NotificationContent } from "./content";
import { createSenders, type Sender } from "./senders";

type Env = AppEnv["Bindings"];
type Channel = typeof notificationChannels.$inferSelect;
type Delivery = typeof notificationDeliveries.$inferSelect;

/** Exponential backoff for queue retries: 30s, 60s, 120s, ... capped at 1h. */
const retryDelay = (attempts: number) => Math.min(30 * 2 ** (attempts - 1), 3600);

export async function handleNotificationBatch(batch: MessageBatch<NotificationMessage>, env: Env): Promise<void> {
  const db = createDb(env.DB);
  const senders = createSenders(env);
  for (const message of batch.messages) {
    try {
      const done = await processMessage(db, env, senders, message.body);
      if (done) message.ack();
      else message.retry({ delaySeconds: retryDelay(message.attempts) });
    } catch (error) {
      console.error("[notifiche]", error);
      message.retry({ delaySeconds: retryDelay(message.attempts) });
    }
  }
}

/** Returns false when at least one channel failed and the message must be retried. */
async function processMessage(db: Db, env: Env, senders: Record<Channel["type"], Sender>, body: NotificationMessage): Promise<boolean> {
  if (body.kind === "test") {
    const delivery = await db.query.notificationDeliveries.findFirst({ where: eq(notificationDeliveries.id, body.deliveryId) });
    const channel = delivery && (await db.query.notificationChannels.findFirst({ where: eq(notificationChannels.id, delivery.channelId) }));
    if (!delivery || !channel || delivery.status === "sent") return true; // channel removed meanwhile, or already sent
    // A test request: the same notification as a real one, to this channel only.
    const submission = delivery.submissionId ? await db.query.submissions.findFirst({ where: eq(submissions.id, delivery.submissionId) }) : undefined;
    const content = submission
      ? await submissionContent(db, env, submission)
      : buildTestNotification(
          (await db.query.projects.findFirst({ where: eq(projects.id, channel.projectId) }))?.name ?? "il tuo progetto",
          `${env.DASHBOARD_ORIGIN}/progetti/${channel.projectId}/notifiche`,
        );
    return content ? deliver(db, senders, channel, delivery, content) : true;
  }

  const submission = await db.query.submissions.findFirst({ where: eq(submissions.id, body.submissionId) });
  if (!submission) return true;
  const channels = await db.query.notificationChannels.findMany({
    where: and(eq(notificationChannels.projectId, submission.projectId), eq(notificationChannels.isActive, true)),
  });
  const content = channels.length > 0 ? await submissionContent(db, env, submission) : null;
  if (!content) return true;

  let allSent = true;
  for (const channel of channels) {
    // The unique (channel, submission) index makes this idempotent across retries.
    await db.insert(notificationDeliveries).values({ id: uuidv7(), channelId: channel.id, submissionId: submission.id }).onConflictDoNothing();
    const delivery = await db.query.notificationDeliveries.findFirst({
      where: and(eq(notificationDeliveries.channelId, channel.id), eq(notificationDeliveries.submissionId, submission.id)),
    });
    if (!delivery || delivery.status === "sent") continue;
    if (!(await deliver(db, senders, channel, delivery, content))) allSent = false;
  }
  return allSent;
}

/** The notification of a request, with its Conferma / Rifiuta links. Null when its project is gone. */
async function submissionContent(db: Db, env: Env, submission: typeof submissions.$inferSelect): Promise<NotificationContent | null> {
  const [project, flowVersion] = await Promise.all([
    db.query.projects.findFirst({ where: eq(projects.id, submission.projectId) }),
    db.query.flowVersions.findFirst({ where: eq(flowVersions.id, submission.flowVersionId) }),
  ]);
  if (!project) return null;

  const actionUrl = async (action: "confirmed" | "rejected") =>
    `${env.PUBLIC_API_URL}/v1/actions/${await createActionToken(env.BETTER_AUTH_SECRET, submission.id, action)}`;
  return buildSubmissionNotification(
    project.name,
    { ...submission, answers: submission.answers as Record<string, string> },
    flowVersion ? flowDefinitionSchema.parse(flowVersion.definition) : null,
    {
      confirm: await actionUrl("confirmed"),
      reject: await actionUrl("rejected"),
      dashboard: `${env.DASHBOARD_ORIGIN}/progetti/${project.id}/richieste`,
    },
  );
}

async function deliver(db: Db, senders: Record<Channel["type"], Sender>, channel: Channel, delivery: Delivery, content: NotificationContent): Promise<boolean> {
  const now = new Date().toISOString();
  try {
    const result = await senders[channel.type].send(channel.target, content);
    await db
      .update(notificationDeliveries)
      .set({ status: "sent", attempts: delivery.attempts + 1, sentAt: now, providerMessageId: result.providerMessageId ?? null, lastError: null, updatedAt: now })
      .where(eq(notificationDeliveries.id, delivery.id));
    return true;
  } catch (error) {
    await db
      .update(notificationDeliveries)
      .set({ status: "failed", attempts: delivery.attempts + 1, lastError: String(error).slice(0, 500), updatedAt: now })
      .where(eq(notificationDeliveries.id, delivery.id));
    return false;
  }
}
