import { addDays, type FlowDefinition, type OpeningRange } from "@snippo/shared";
import {
  and,
  businessHours,
  closures,
  eq,
  gte,
  inArray,
  lt,
  projects,
  submissions,
  type Db,
} from "@snippo/db";

export interface AvailabilityRules {
  /** Empty = open every day, at every time of the flow. */
  hours: OpeningRange[];
  closures: { dateFrom: string; dateTo: string }[];
  /** Max people (or bookings) per time slot; null = no limit. */
  slotCapacity: number | null;
}

/** Date and time "now" in the project's timezone, as "YYYY-MM-DD" and "HH:MM". */
export function nowIn(timezone: string, now = new Date()): { date: string; time: string } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

/** 0 = Monday ... 6 = Sunday */
const weekdayOf = (date: string) => (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;

/**
 * Times of `timeOptions` still bookable on `date` for `partySize` people.
 * `used` = people (or bookings) already booked per time on that date.
 */
export function availableTimes(
  rules: AvailabilityRules,
  date: string,
  timeOptions: string[],
  used: ReadonlyMap<string, number>,
  partySize: number,
  now: { date: string; time: string },
): string[] {
  if (date < now.date) return [];
  if (rules.closures.some((c) => c.dateFrom <= date && date <= c.dateTo)) return [];

  const weekday = weekdayOf(date);
  const ranges = rules.hours.filter((r) => r.weekday === weekday);
  return timeOptions.filter(
    (time) =>
      (rules.hours.length === 0 || ranges.some((r) => r.opensAt <= time && time < r.closesAt)) &&
      (date > now.date || time > now.time) &&
      (rules.slotCapacity === null || (used.get(time) ?? 0) + partySize <= rules.slotCapacity),
  );
}

/** The date and time steps a flow needs for availability; null when it books no slot. */
export function slotSteps(flow: FlowDefinition) {
  const date = flow.steps.find((s) => s.type === "date");
  const time = flow.steps.find((s) => s.type === "time");
  return date && time?.type === "time" ? { dateKey: date.key, timeKey: time.key, timeOptions: time.options } : null;
}

export async function loadRules(db: Db, projectId: string): Promise<AvailabilityRules & { timezone: string }> {
  const [project, hours, closed] = await Promise.all([
    db.query.projects.findFirst({ where: eq(projects.id, projectId) }),
    db.query.businessHours.findMany({ where: eq(businessHours.projectId, projectId) }),
    db.query.closures.findMany({ where: eq(closures.projectId, projectId) }),
  ]);
  return {
    hours: hours.map(({ weekday, opensAt, closesAt }) => ({ weekday, opensAt, closesAt })),
    closures: closed.map(({ dateFrom, dateTo }) => ({ dateFrom, dateTo })),
    slotCapacity: project?.slotCapacity ?? null,
    timezone: project?.timezone ?? "Europe/Rome",
  };
}

/**
 * People (or bookings, when there is no party size) already booked per date and time,
 * counting requests that are new or confirmed.
 */
export async function loadUsage(db: Db, projectId: string, from: string, to: string): Promise<Map<string, Map<string, number>>> {
  const rows = await db
    .select({ bookingAt: submissions.bookingAt, partySize: submissions.partySize })
    .from(submissions)
    .where(
      and(
        eq(submissions.projectId, projectId),
        gte(submissions.bookingAt, from),
        lt(submissions.bookingAt, addDays(to, 1)),
        inArray(submissions.status, ["new", "confirmed"]),
      ),
    );
  const usage = new Map<string, Map<string, number>>();
  for (const { bookingAt, partySize } of rows) {
    if (!bookingAt) continue;
    const [date, time] = [bookingAt.slice(0, 10), bookingAt.slice(11, 16)];
    const day = usage.get(date) ?? new Map<string, number>();
    day.set(time, (day.get(time) ?? 0) + (partySize ?? 1));
    usage.set(date, day);
  }
  return usage;
}
