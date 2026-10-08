import type { FlowStep } from "./flow";

// No zod import here: this module is bundled into the widget, which must stay small.

const PHONE = /^\+?[0-9 ]{6,20}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Validates one answer against its step. Returns an error message, or null when valid.
 * Shared by the widget (immediate feedback) and the API (source of truth).
 */
export function validateAnswer(step: FlowStep, value: string | undefined): string | null {
  if (step.type === "message") return null;
  const v = value?.trim() ?? "";
  if (v === "") return step.required ? "Campo obbligatorio" : null;

  switch (step.type) {
    case "choice":
    case "time":
      return step.options.includes(v) ? null : "Scegli una delle opzioni";
    case "text":
      return v.length <= step.maxLength ? null : `Massimo ${step.maxLength} caratteri`;
    case "number": {
      const n = Number(v);
      return Number.isInteger(n) && n >= step.min && n <= step.max ? null : `Inserisci un numero da ${step.min} a ${step.max}`;
    }
    case "date":
      return DATE.test(v) && !Number.isNaN(Date.parse(v)) ? null : "Data non valida";
    case "phone":
      return PHONE.test(v) ? null : "Numero di telefono non valido";
    case "email":
      return EMAIL.test(v) ? null : "Email non valida";
  }
}
