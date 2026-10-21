// Who runs Snippo, as the legal pages name it. A value in square brackets is still missing:
// the pages highlight it.
export const provider = {
  name: "Snippo (snippo.io)",
  email: "privacy@snippo.io",
};

/** Where customers write for help. Like privacy@, Email Routing forwards it to the owner's mailbox. */
export const supportEmail = "supporto@snippo.io";

export const lastUpdated = "14 ottobre 2026";

export const legalPages = [
  { href: "/supporto", title: "Supporto" },
  { href: "/privacy", title: "Privacy" },
  { href: "/termini", title: "Termini di servizio" },
  { href: "/dpa", title: "Trattamento dei dati (DPA)" },
] as const;

export const isPlaceholder = (value: string) => value.startsWith("[");
