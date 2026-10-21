import type { ChannelType } from "@snippo/shared";
import { sendEmail } from "../email";
import type { AppEnv } from "../env";
import type { NotificationContent } from "./content";
import { sendWhatsApp } from "./whatsapp";

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

/** WhatsApp Cloud API, from Snippo's shared number. */
function whatsappSender(token: string, phoneNumberId: string): Sender {
  return {
    async send(target, content) {
      return { providerMessageId: await sendWhatsApp({ token, phoneNumberId }, target, content.whatsapp) };
    },
  };
}

/** One sender per channel type. WhatsApp stays on the log until its token and number are configured. */
export function createSenders(env: AppEnv["Bindings"]): Record<ChannelType, Sender> {
  const whatsapp = env.WHATSAPP_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID ? whatsappSender(env.WHATSAPP_TOKEN, env.WHATSAPP_PHONE_NUMBER_ID) : logSender("whatsapp");
  return { email: emailSender(env), whatsapp };
}
