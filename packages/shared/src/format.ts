const dayFormat = new Intl.DateTimeFormat("it-IT", { weekday: "short", day: "numeric", month: "short" });

/** "2026-12-12T20:30" (business local time) -> "sab 12 dic, 20:30" */
export function formatBooking(bookingAt: string): string {
  const [date, time] = bookingAt.split("T");
  // Noon avoids the date shifting by a day in any timezone.
  const day = dayFormat.format(new Date(`${date}T12:00:00`));
  return time && time !== "00:00" ? `${day}, ${time}` : day;
}
