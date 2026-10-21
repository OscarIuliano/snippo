import type { FlowDefinitionInput, FlowStep, FlowStepInput } from "./flow";

/**
 * Questions with a meaning outside the conversation: inbox contact fields, calendar,
 * availability and notifications read them by key. Their type is fixed; the text is free.
 */
export const specialSteps = {
  name: { label: "Nome", step: { key: "name", type: "text", prompt: "Come ti chiami?", maxLength: 80 } },
  phone: { label: "Telefono", step: { key: "phone", type: "phone", prompt: "Un numero di telefono per ricontattarti?" } },
  email: { label: "Email", step: { key: "email", type: "email", prompt: "A che email possiamo risponderti?" } },
  party_size: { label: "Numero di persone", step: { key: "party_size", type: "number", prompt: "Quante persone?", min: 1, max: 12 } },
  date: { label: "Giorno", step: { key: "date", type: "date", prompt: "Per che giorno?" } },
  time: { label: "Orario", step: { key: "time", type: "time", prompt: "A che ora?", options: ["12:30", "13:30", "19:30", "20:30", "21:30"] } },
  notes: { label: "Note", step: { key: "notes", type: "text", prompt: "Qualcosa da aggiungere?", required: false, maxLength: 500 } },
} satisfies Record<string, { label: string; step: FlowStepInput }>;

export type SpecialKey = keyof typeof specialSteps;
export const isSpecialKey = (key: string): key is SpecialKey => key in specialSteps;

/** Generic questions the business can add as many times as it wants. */
export const genericSteps = {
  choice: { label: "Scelta tra opzioni", step: { type: "choice", prompt: "Nuova domanda", options: ["Opzione 1", "Opzione 2"] } },
  text: { label: "Testo libero", step: { type: "text", prompt: "Nuova domanda", maxLength: 500 } },
  number: { label: "Numero", step: { type: "number", prompt: "Nuova domanda", min: 1, max: 10 } },
  message: { label: "Messaggio (senza risposta)", step: { type: "message", prompt: "Un messaggio per chi scrive", required: false } },
} as const;

export type GenericType = keyof typeof genericSteps;

/** A key for a new generic question, e.g. "q_k3x9", unique in the flow and never reused. */
export function newStepKey(existing: string[]): string {
  for (;;) {
    const key = `q_${Math.random().toString(36).slice(2, 6)}`;
    if (!existing.includes(key)) return key;
  }
}

export interface FlowProblem {
  /** Index of the question, or null for the flow as a whole. */
  step: number | null;
  message: string;
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Rules for a flow edited by a business, on top of the schema. Empty list = it can be published. */
export function flowProblems(flow: FlowDefinitionInput): FlowProblem[] {
  const problems: FlowProblem[] = [];
  const add = (step: number | null, message: string) => problems.push({ step, message });
  const steps = flow.steps as FlowStep[];

  if (steps.length > 30) add(null, "Al massimo 30 domande");
  if (!steps.some((s) => s.type !== "message")) add(null, "Serve almeno una domanda a cui rispondere");
  if (steps.filter((s) => s.type === "date").length > 1) add(null, "Al massimo una domanda di tipo Giorno");
  if (steps.filter((s) => s.type === "time").length > 1) add(null, "Al massimo una domanda di tipo Orario");
  const message = flow.successMessage.trim();
  if (message.length < 1 || message.length > 300) add(null, "Il messaggio finale deve avere da 1 a 300 caratteri");

  const seen = new Set<string>();
  steps.forEach((s, i) => {
    if (seen.has(s.key)) add(i, "Domanda duplicata");
    seen.add(s.key);
    const prompt = s.prompt.trim();
    if (prompt.length < 1 || prompt.length > 300) add(i, "Il testo deve avere da 1 a 300 caratteri");
    if (isSpecialKey(s.key) && specialSteps[s.key].step.type !== s.type) add(i, "Il tipo di questa domanda non si può cambiare");

    if (s.type === "choice") {
      const options = s.options.map((o) => o.trim());
      if (options.length < 1 || options.length > 12) add(i, "Da 1 a 12 opzioni");
      if (options.some((o) => o.length < 1 || o.length > 60)) add(i, "Ogni opzione deve avere da 1 a 60 caratteri");
      if (new Set(options).size !== options.length) add(i, "Ci sono opzioni ripetute");
    }
    if (s.type === "time") {
      if (s.options.length < 1 || s.options.length > 48) add(i, "Da 1 a 48 orari");
      if (s.options.some((o) => !TIME.test(o))) add(i, "Orario non valido");
      if (new Set(s.options).size !== s.options.length) add(i, "Ci sono orari ripetuti");
    }
    if (s.type === "number") {
      if (!Number.isInteger(s.min) || !Number.isInteger(s.max) || s.min < 0 || s.max > 10_000) add(i, "Minimo e massimo devono essere numeri interi da 0 a 10.000");
      else if (s.min > s.max) add(i, "Il minimo supera il massimo");
    }
    if (s.type === "text" && (s.maxLength < 1 || s.maxLength > 2000)) add(i, "La lunghezza massima va da 1 a 2.000 caratteri");
  });
  return problems;
}
