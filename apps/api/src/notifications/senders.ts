import type { ChannelType } from "@snippo/shared";
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
      const body = type === "email" ? `Oggetto: ${content.subject}\n\n${content.text}` : `${content.whatsappText}\n\n${content.text}`;
      console.log(`\n──── notifica ${type} → ${target} ────\n${body}\n────────────────────────────`);
      return {};
    },
  };
}

/**
 * One sender per channel type. The real providers (Resend for email, WhatsApp Cloud API)
 * replace the log sender once their credentials are configured.
 */
export function createSenders(_env: AppEnv["Bindings"]): Record<ChannelType, Sender> {
  return { email: logSender("email"), whatsapp: logSender("whatsapp") };
}
