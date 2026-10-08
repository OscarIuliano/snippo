import type { FlowDefinitionInput } from "./flow";

export type TemplateId = "restaurant" | "appointments" | "info";

const contactSteps = [
  { key: "name", type: "text", prompt: "Come ti chiami?", maxLength: 80 },
  { key: "phone", type: "phone", prompt: "Un numero di telefono per confermarti?" },
] as const;

export const templates: Record<TemplateId, FlowDefinitionInput> = {
  restaurant: {
    steps: [
      { key: "welcome", type: "message", prompt: "Ciao! Vuoi prenotare un tavolo?" },
      { key: "date", type: "date", prompt: "Per che giorno?" },
      { key: "time", type: "time", prompt: "A che ora?", options: ["12:30", "13:30", "19:30", "20:30", "21:30"] },
      { key: "party_size", type: "number", prompt: "Quante persone?", min: 1, max: 12 },
      ...contactSteps,
      { key: "notes", type: "text", prompt: "Allergie o richieste particolari?", required: false, maxLength: 500 },
    ],
    successMessage: "Richiesta inviata! Ti confermeremo la prenotazione al più presto.",
  },
  appointments: {
    steps: [
      { key: "welcome", type: "message", prompt: "Ciao! Prenota un appuntamento in pochi passi." },
      { key: "service", type: "choice", prompt: "Che servizio ti interessa?", options: ["Taglio", "Colore", "Piega", "Altro"] },
      { key: "date", type: "date", prompt: "Che giorno preferisci?" },
      { key: "time", type: "time", prompt: "In che fascia oraria?", options: ["09:00", "11:00", "14:00", "16:00", "18:00"] },
      ...contactSteps,
    ],
    successMessage: "Richiesta inviata! Ti contatteremo per confermare l'appuntamento.",
  },
  info: {
    steps: [
      { key: "welcome", type: "message", prompt: "Ciao! Come possiamo aiutarti?" },
      { key: "topic", type: "choice", prompt: "Di cosa hai bisogno?", options: ["Informazioni", "Preventivo", "Assistenza"] },
      { key: "message", type: "text", prompt: "Scrivi la tua domanda", maxLength: 1000 },
      { key: "name", type: "text", prompt: "Come ti chiami?", maxLength: 80 },
      { key: "email", type: "email", prompt: "A che email possiamo risponderti?" },
    ],
    successMessage: "Messaggio inviato! Ti risponderemo presto.",
  },
};
