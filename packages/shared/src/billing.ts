// Plans and their limits (docs, section 7). Prices are a first guess, to validate with customers.

export const planIds = ["free", "starter", "pro", "agency"] as const;
export type PlanId = (typeof planIds)[number];

export const billingIntervals = ["month", "year"] as const;
export type BillingInterval = (typeof billingIntervals)[number];

export interface Plan {
  id: PlanId;
  name: string;
  /** Euro per month, billed monthly. */
  monthly: number;
  /** Euro per year: two months free. */
  yearly: number;
  limits: {
    projects: number;
    submissionsPerMonth: number;
    /** People in the organization, the owner included. */
    members: number;
    whatsapp: boolean;
  };
  /** What the plan adds, for the comparison on the billing page. */
  features: string[];
}

export const plans: Record<PlanId, Plan> = {
  free: {
    id: "free",
    name: "Free",
    monthly: 0,
    yearly: 0,
    limits: { projects: 1, submissionsPerMonth: 50, members: 1, whatsapp: false },
    features: ["1 progetto", "50 richieste al mese", "Notifiche via email", "Logo \"Powered by Snippo\" nel widget"],
  },
  starter: {
    id: "starter",
    name: "Starter",
    monthly: 9,
    yearly: 90,
    limits: { projects: 1, submissionsPerMonth: 500, members: 2, whatsapp: false },
    features: ["1 progetto", "500 richieste al mese", "Email a più destinatari", "Senza logo Snippo", "Statistiche ed export CSV"],
  },
  pro: {
    id: "pro",
    name: "Pro",
    monthly: 29,
    yearly: 290,
    limits: { projects: 5, submissionsPerMonth: 3000, members: 5, whatsapp: true },
    features: ["5 progetti", "3.000 richieste al mese", "Notifiche WhatsApp", "Team fino a 5 persone"],
  },
  agency: {
    id: "agency",
    name: "Agency",
    monthly: 79,
    yearly: 790,
    limits: { projects: 25, submissionsPerMonth: 15000, members: 25, whatsapp: true },
    features: ["25 progetti", "15.000 richieste al mese", "White label", "Più clienti in un solo account"],
  },
};

export const subscriptionStatuses = ["active", "trialing", "past_due", "paused", "canceled"] as const;
export type SubscriptionStatus = (typeof subscriptionStatuses)[number];

/** GET /billing: the organization's plan, its use this month and what is still to pay. */
export interface BillingOverview {
  plan: PlanId;
  interval: BillingInterval | null;
  status: SubscriptionStatus | null;
  /** End of the paid period (renewal date, or the last day when cancelled). */
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  usage: { projects: number; submissionsThisMonth: number; members: number };
  /** Payments are not connected yet: upgrade buttons explain instead of opening the checkout. */
  checkoutAvailable: boolean;
}

/** Share of a limit used, for the usage bars: 0–1, more than 1 when over. */
export const usageShare = (used: number, limit: number) => (limit > 0 ? used / limit : 0);
