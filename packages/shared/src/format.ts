const dayFormat = new Intl.DateTimeFormat("it-IT", { weekday: "short", day: "numeric", month: "short" });

/** "2026-12-12T20:30" (business local time) -> "sab 12 dic, 20:30" */
export function formatBooking(bookingAt: string): string {
  const [date, time] = bookingAt.split("T");
  // Noon avoids the date shifting by a day in any timezone.
  const day = dayFormat.format(new Date(`${date}T12:00:00`));
  return time && time !== "00:00" ? `${day}, ${time}` : day;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Calendar dates as "YYYY-MM-DD" strings, computed in UTC so no timezone can shift them. */
export function isIsoDate(value: string): boolean {
  return ISO_DATE.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}
