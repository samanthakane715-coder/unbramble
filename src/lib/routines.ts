import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "./supabase/server";
import { firstDue, nextDue, type Schedule } from "./schedule";
import { bestOverlap, type Check, type Routine } from "./match";

export * from "./match";
import type { RoutineSpec } from "./classify";

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

/** Find the latest logged check that matches a "did I…?" question. */
export async function findCheck(db: SupabaseClient, userId: string, question: string) {
  const { data } = await db.from("checks").select("*").eq("user_id", userId)
    .order("checked_at", { ascending: false }).limit(200);
  return bestOverlap((data ?? []) as Check[], question, (c) => c.thing);
}

