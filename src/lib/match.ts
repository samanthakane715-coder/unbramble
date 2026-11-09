/** Pure, browser-safe matching and formatting helpers for routines and checks. */
import type { Schedule } from "./schedule";

export interface Routine extends Schedule {
  id: string;
  user_id: string;
  name: string;
  kind: "meds" | "chore" | "checklist";
  checklist_items: string[];
  remind_by_text: boolean;
  next_due_at: string;
  nudged_at: string | null;
  followed_up: boolean;
  active: boolean;
}

export interface RoutineLog { id: string; routine_id: string; status: "done" | "skipped" | "missed"; due_at: string | null; logged_at: string }
export interface Check { id: string; thing: string; checked_at: string; source: string }

export function matchRoutine(routines: Routine[], name: string): Routine | null {
  const n = name.trim().toLowerCase();
  if (!routines.length) return null;
  if (!n) {
    const meds = routines.filter((r) => r.kind === "meds");
    return meds.length === 1 ? meds[0] : soonest(meds.length ? meds : routines);
  }
  return routines.find((r) => r.name.toLowerCase() === n)
    ?? routines.find((r) => r.name.toLowerCase().includes(n) || n.includes(r.name.toLowerCase()))
    ?? bestOverlap(routines, n, (r) => r.name);
}

/** The routine closest to its due time right now (for unnamed "took them"). */
function soonest(rs: Routine[]) {
  const now = Date.now();
  return [...rs].sort((a, b) => Math.abs(Date.parse(a.next_due_at) - now) - Math.abs(Date.parse(b.next_due_at) - now))[0] ?? null;
}

const STOP = new Set(["the", "a", "an", "my", "i", "did", "it", "off", "turn", "turned", "is", "was", "to", "of", "and", "out", "in", "on"]);
const stem = (w: string) => w.replace(/(ing|ed|es|s)$/, "");
export const words = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w && !STOP.has(w)).map(stem);

export function bestOverlap<T>(items: T[], query: string, label: (t: T) => string): T | null {
  const q = new Set(words(query));
  let best: T | null = null, score = 0;
  for (const it of items) {
    const s = words(label(it)).filter((w) => q.has(w)).length;
    if (s > score) { best = it; score = s; }
  }
  return best;
}

export function whenSaid(iso: string, tz: string) {
  const d = new Date(iso);
  const day = (x: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(x);
  const time = d.toLocaleTimeString("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" });
  const today = day(new Date());
  const yesterday = day(new Date(Date.now() - 86400000));
  if (day(d) === today) return `today at ${time}`;
  if (day(d) === yesterday) return `yesterday at ${time}`;
  return `${d.toLocaleDateString("en-US", { timeZone: tz, weekday: "long", month: "short", day: "numeric" })} at ${time}`;
}

export function agoSaid(iso: string) {
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const h = Math.round(mins / 60);
  return h < 24 ? `${h} hr${h === 1 ? "" : "s"} ago` : `${Math.round(h / 24)} days ago`;
}

/** Reuse an existing check phrase when it's the same words in another order ("unplugged the curling iron" = "curling iron unplugged"). */
export function canonicalThing(existing: string[], thing: string): string {
  const key = (x: string) => [...new Set(words(x))].sort().join(" ");
  const k = key(thing);
  return existing.find((e) => key(e) === k) ?? thing;
}
