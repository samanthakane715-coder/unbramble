/** Time-zone-aware scheduling for routines. No libraries; uses Intl. */

export type Frequency = "daily" | "weekly" | "every_n_days" | "monthly" | "yearly";

export interface Schedule {
  frequency: Frequency;
  times: string[];          // "HH:MM" local
  days_of_week: number[];   // 0=Sun..6=Sat
  interval_days: number | null;
  start_date: string;       // "YYYY-MM-DD" local anchor
}

/** Local calendar parts of an instant in a time zone. */
export function localParts(d: Date, tz: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23", weekday: "short",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  const wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
  return { y: +get("year"), m: +get("month"), d: +get("day"), h: +get("hour"), min: +get("minute"), weekday: wd };
}

/** The instant when the wall clock in `tz` reads y-m-d hh:mm. Handles DST. */
export function zonedTime(y: number, m: number, d: number, hhmm: string, tz: string): Date {
  const [hh, mm] = hhmm.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  // offset = wall time shown in tz minus UTC, for the guessed instant
  const offsetAt = (t: number) => {
    const p = localParts(new Date(t), tz);
    return Date.UTC(p.y, p.m - 1, p.d, p.h, p.min) - t;
  };
  let t = guess - offsetAt(guess);
  t = guess - offsetAt(t); // second pass fixes DST edges
  return new Date(t);
}

/** Add days to a local calendar date. */
function addDays(y: number, m: number, d: number, n: number) {
  const x = new Date(Date.UTC(y, m - 1, d + n));
  return { y: x.getUTCFullYear(), m: x.getUTCMonth() + 1, d: x.getUTCDate(), weekday: x.getUTCDay() };
}

function daysInMonth(y: number, m: number) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/**
 * First due moment strictly after `after`.
 * every_n_days counts from `after` itself (e.g. 30 days from when you refilled).
 */
export function nextDue(s: Schedule, after: Date, tz: string): Date {
  const times = [...(s.times.length ? s.times : ["09:00"])].sort();
  const start = localParts(after, tz);

  if (s.frequency === "every_n_days") {
    const n = Math.max(1, s.interval_days ?? 1);
    const day = addDays(start.y, start.m, start.d, n);
    return zonedTime(day.y, day.m, day.d, times[0], tz);
  }

  if (s.frequency === "daily" || s.frequency === "weekly") {
    const days = s.frequency === "weekly" && s.days_of_week.length ? s.days_of_week : [0, 1, 2, 3, 4, 5, 6];
    for (let i = 0; i <= 8; i++) {
      const day = addDays(start.y, start.m, start.d, i);
      if (!days.includes(day.weekday)) continue;
      for (const t of times) {
        const at = zonedTime(day.y, day.m, day.d, t, tz);
        if (at > after) return at;
      }
    }
  }

  // monthly / yearly: same day as the anchor (clamped to month length)
  const [ay, am, ad] = s.start_date.split("-").map(Number);
  for (let i = 0; i < 40; i++) {
    let y: number, m: number;
    if (s.frequency === "yearly") { y = start.y + i - 1; m = am; }
    else { const k = start.m - 1 + i - 1; y = start.y + Math.floor(k / 12); m = (((k % 12) + 12) % 12) + 1; }
    if (y < ay || (y === ay && m < am && s.frequency === "monthly")) continue;
    const at = zonedTime(y, m, Math.min(ad, daysInMonth(y, m)), times[0], tz);
    if (at > after) return at;
  }
  return new Date(after.getTime() + 86400000);
}

/** First due moment for a brand-new routine. */
export function firstDue(s: Schedule, tz: string, now = new Date()): Date {
  if (s.frequency === "every_n_days") {
    // first nudge is at the chosen time on the start date (or next day if that's passed)
    const [y, m, d] = s.start_date.split("-").map(Number);
    const at = zonedTime(y, m, d, (s.times[0] ?? "09:00"), tz);
    if (at > now) return at;
    return nextDue({ ...s, frequency: "daily" }, now, tz);
  }
  const [y, m, d] = s.start_date.split("-").map(Number);
  const anchor = zonedTime(y, m, d, "00:00", tz);
  return nextDue(s, new Date(Math.max(now.getTime(), anchor.getTime() - 1)), tz);
}

export function describeSchedule(s: Schedule): string {
  const t = s.times.map(prettyTime).join(" and ");
  const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  switch (s.frequency) {
    case "daily": return `Every day at ${t}`;
    case "weekly": return `${s.days_of_week.map((d) => names[d]).join(", ") || "Weekly"} at ${t}`;
    case "every_n_days": return `Every ${s.interval_days} days, counted from when you mark it done`;
    case "monthly": return `Monthly on day ${+s.start_date.slice(8)} at ${t}`;
    case "yearly": return `Yearly on ${new Date(s.start_date + "T12:00:00Z").toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "UTC" })}`;
  }
}

export function prettyTime(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  const ap = h >= 12 ? "pm" : "am";
  const h12 = h % 12 || 12;
  return m ? `${h12}:${String(m).padStart(2, "0")}${ap}` : `${h12}${ap}`;
}
