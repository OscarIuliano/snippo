// Who runs Snippo, as the legal pages name it. Values in square brackets are still missing:
// the pages highlight them, and they must be filled in before the first real customer.
export const provider = {
  name: "[Nome e cognome del titolare]",
  address: "[Indirizzo]",
  vatNumber: "[Partita IVA, quando aperta]",
  email: "privacy@snippo.io",
  court: "[Città del foro competente]",
};

/** Where customers write for help. Like privacy@, it works once snippo.io forwards it (Email Routing). */
export const supportEmail = "supporto@snippo.io";

export const lastUpdated = "14 ottobre 2026";

export const legalPages = [
  { href: "/supporto", title: "Supporto" },
  { href: "/privacy", title: "Privacy" },
  { href: "/termini", title: "Termini di servizio" },
  { href: "/dpa", title: "Trattamento dei dati (DPA)" },
] as const;

export const isPlaceholder = (value: string) => value.startsWith("[");
