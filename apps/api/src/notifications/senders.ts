import type { ChannelType } from "@snippo/shared";
import { sendEmail } from "../email";
import type { AppEnv } from "../env";
import type { NotificationContent } from "./content";

export interface SendResult {
  providerMessageId?: string;
}

export interface Sender {
  send(target: string, content: NotificationContent): Promise<SendResult>;
}

/** Development sender: prints the notification (with its action links) to the Worker log. */
function logSender(type: ChannelType): Sender {
  return {
    async send(target, content) {
      console.log(`\n──── notifica ${type} → ${target} ────\n${content.whatsappText}\n\n${content.text}\n────────────────────────────`);
      return {};
    },
  };
}

/** Email goes through sendEmail, like every other email of Snippo. */
function emailSender(env: AppEnv["Bindings"]): Sender {
  return {
    async send(target, content) {
      const { id } = await sendEmail(env, { to: target, subject: content.subject, text: content.text, html: content.html });
      return { providerMessageId: id };
    },
  };
}

/** One sender per channel type. WhatsApp replaces the log sender once the Cloud API is configured. */
export function createSenders(env: AppEnv["Bindings"]): Record<ChannelType, Sender> {
  return { email: emailSender(env), whatsapp: logSender("whatsapp") };
}
