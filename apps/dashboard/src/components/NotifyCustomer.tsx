import { useState } from "react";
import { customerReply, mailtoUrl, telUrl, whatsappUrl, type ReplyOutcome, type SubmissionRow } from "@snippo/shared";
import { useT } from "../i18n";
import { Icon } from "./Icon";
import { buttonClass, cx } from "./ui";

/**
 * "Avvisa il cliente": opens WhatsApp, the email app or a call with the outcome already written.
 * It leaves from the business's own phone or mailbox; Snippo sends nothing here.
 */
export function NotifyCustomer({
  submission: s,
  project,
  outcome,
  className,
}: {
  submission: SubmissionRow;
  project: { name: string; industry: string };
  outcome: ReplyOutcome;
  className?: string;
}) {
  const t = useT();
  const reply = customerReply({ outcome, industry: project.industry, projectName: project.name, ...s });
  const [text, setText] = useState(reply.text);
  const [editing, setEditing] = useState(false);

  const whatsapp = s.contactPhone ? whatsappUrl(s.contactPhone, text) : null;
  if (!s.contactPhone && !s.contactEmail) {
    return <p className={cx("text-sm text-slate-500", className)}>{t("Il cliente non ha lasciato né telefono né email.")}</p>;
  }

  const small = "px-2.5 py-1.5 text-xs";
  return (
    <div className={cx("text-sm", className)}>
      <p className="mb-2 text-slate-600">{s.contactName ? t("Avvisa {name}:", { name: s.contactName }) : t("Avvisa il cliente:")}</p>
      <div className="flex flex-wrap items-center gap-2">
        {whatsapp && (
          <a href={whatsapp} target="_blank" rel="noreferrer" className={buttonClass("primary", small)}>
            <Icon name="chat" className="size-4" />
            WhatsApp
          </a>
        )}
        {s.contactEmail && (
          <a href={mailtoUrl(s.contactEmail, reply.subject, text)} className={buttonClass("secondary", small)}>
            <Icon name="mail" className="size-4" />
            {t("Email")}
          </a>
        )}
        {s.contactPhone && (
          <a href={telUrl(s.contactPhone)} className={buttonClass("secondary", small)}>
            <Icon name="phone" className="size-4" />
            {t("Chiama")}
          </a>
        )}
        <button type="button" onClick={() => setEditing(!editing)} aria-expanded={editing} className="px-1 text-xs font-medium text-brand-700 hover:underline">
          {editing ? t("Chiudi il messaggio") : t("Modifica il messaggio")}
        </button>
      </div>
      {editing && (
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          aria-label={t("Messaggio per il cliente")}
          className="mt-2 block w-full rounded-lg border-0 bg-white px-3 py-2 text-sm ring-1 ring-slate-300 focus:ring-2 focus:ring-brand-600"
        />
      )}
    </div>
  );
}
