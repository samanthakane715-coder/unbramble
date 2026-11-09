import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "./supabase/server";
import { firstDue, nextDue, type Schedule } from "./schedule";
import type { RoutineSpec } from "./classify";

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

/** Logging this early (or later) still counts toward the scheduled time. */
const EARLY_WINDOW_MS = 3 * 60 * 60 * 1000;

export async function createRoutine(db: SupabaseClient, userId: string, spec: RoutineSpec, tz: string) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date()); // YYYY-MM-DD
  const schedule: Schedule = {
    frequency: spec.frequency,
    times: spec.times.length ? spec.times : ["09:00"],
    days_of_week: spec.days_of_week,
    interval_days: spec.frequency === "every_n_days" ? spec.interval_days ?? 30 : null,
    start_date: spec.start_date ?? today,
  };
  const { data, error } = await db.from("routines").insert({
    user_id: userId,
    name: spec.name,
    kind: spec.kind,
    ...schedule,
    checklist_items: spec.kind === "checklist" ? spec.checklist_items : [],
    next_due_at: firstDue(schedule, tz).toISOString(),
  }).select().single();
  if (error) throw error;
  return data as Routine;
}

/** Record done/skipped and move the routine to its next due time. Done grows an herb. */
export async function logRoutine(
  db: SupabaseClient, userId: string, r: Routine,
  status: "done" | "skipped", source: "web" | "sms", tz: string
) {
  const now = new Date();
  const due = new Date(r.next_due_at);
  let next: Date | null = null;
  let countsFor: Date | null = null;

  if (r.frequency === "every_n_days") {
    next = nextDue(r, now, tz);
    countsFor = due;
  } else if (now.getTime() >= due.getTime() - EARLY_WINDOW_MS) {
    next = nextDue(r, new Date(Math.max(due.getTime(), now.getTime())), tz);
    countsFor = due;
  }

  await db.from("routine_logs").insert({
    user_id: userId, routine_id: r.id, status, source, due_at: countsFor?.toISOString() ?? null,
  });
  if (next) {
    await db.from("routines").update({ next_due_at: next.toISOString(), nudged_at: null, followed_up: false }).eq("id", r.id);
  }
  if (status === "done" && r.kind === "checklist" && r.checklist_items.length) {
    await db.from("checks").insert(r.checklist_items.map((thing) => ({ user_id: userId, thing: thing.toLowerCase(), source })));
  }
  const grew = status === "done" ? await growPlant(userId, "herb") : null;
  return { next, grew };
}

/** Grow a plant server-side. Quietly skipped if the server key isn't configured yet. */
export async function growPlant(userId: string, species: string) {
  try {
    const admin = createAdminClient();
    const { data } = await admin.rpc("grow_plant", { p_user: userId, p_species: species });
    return data as { species: string; stage: number; new_plant: boolean; plant_id: string } | null;
  } catch {
    return null;
  }
}

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

/** Find the latest logged check that matches a "did I…?" question. */
export async function findCheck(db: SupabaseClient, userId: string, question: string) {
  const { data } = await db.from("checks").select("*").eq("user_id", userId)
    .order("checked_at", { ascending: false }).limit(200);
  return bestOverlap((data ?? []) as Check[], question, (c) => c.thing);
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
