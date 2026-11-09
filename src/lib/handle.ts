import type { SupabaseClient } from "@supabase/supabase-js";
import { understand, saveSorted, type Sorted } from "./classify";
import { createRoutine, findCheck, logRoutine, matchRoutine, whenSaid, agoSaid, type Routine } from "./routines";
import { describeSchedule } from "./schedule";
import { seedPacket, type Tip } from "./tips";
import type { Capture } from "./types";

export interface Handled {
  captures: Capture[];
  lines: string[];          // human replies, one per thing handled
  grew: { species: string; stage: number; new_plant: boolean } | null;
  tip: Tip | null;
  changedRoutines: boolean;
  changedChecks: boolean;
}

const DONE = /^(done|did it|took (them|it|my \w+)|taken|yes|yep|yup|y|✅|👍)[\s.!]*$/i;
const SKIP = /^(skip|skipped|no|nope|n|not today)[\s.!]*$/i;

/**
 * The one place a message (typed on the web or texted in) gets understood and acted on.
 */
export async function handleMessage(
  db: SupabaseClient, userId: string, text: string, tz: string, source: "web" | "sms"
): Promise<Handled> {
  const out: Handled = { captures: [], lines: [], grew: null, tip: null, changedRoutines: false, changedChecks: false };
  const { data: rs } = await db.from("routines").select("*").eq("user_id", userId).eq("active", true);
  const routines = (rs ?? []) as Routine[];
  const trimmed = text.trim();

  // Bare "done" / "skip" answers the most recent nudge
  if (DONE.test(trimmed) || SKIP.test(trimmed)) {
    const status = DONE.test(trimmed) ? "done" : "skipped";
    const pending = routines.filter((r) => r.nudged_at).sort((a, b) => Date.parse(b.nudged_at!) - Date.parse(a.nudged_at!))[0]
      ?? matchRoutine(routines.filter((r) => Math.abs(Date.parse(r.next_due_at) - Date.now()) < 3 * 3600e3), "");
    if (pending) {
      const res = await logRoutine(db, userId, pending, status, source, tz);
      out.grew = res.grew; out.changedRoutines = true;
      out.lines.push(status === "done"
        ? `Logged ${pending.name} ✓${res.grew ? " An herb in your garden grew." : ""}`
        : `Skipped ${pending.name}. No worries, I'll check in next time.`);
      out.tip = status === "done" ? await seedPacket("grow", pending.name, "herb") : null;
      return out;
    }
  }

  const items = await understand(db, userId, trimmed, tz);
  const captures: Sorted[] = [];

  for (const item of items) {
    switch (item.intent) {
      case "capture":
        captures.push(item);
        break;

      case "log_routine": {
        const r = matchRoutine(routines, item.routine_name);
        if (!r) {
          out.lines.push(`I don't have a routine${item.routine_name ? ` called "${item.routine_name}"` : ""} yet. Try "remind me to take morning meds at 8am every day" to set one up.`);
          break;
        }
        const res = await logRoutine(db, userId, r, item.status, source, tz);
        out.grew = res.grew ?? out.grew; out.changedRoutines = true;
        out.lines.push(item.status === "done" ? `Logged ${r.name} ✓` : `Skipped ${r.name}.`);
        break;
      }

      case "check_done": {
        const { data } = await db.from("checks").insert({ user_id: userId, thing: item.thing, source }).select().single();
        out.changedChecks = true;
        out.lines.push(`Got it: ${item.thing}, ${whenSaid(data?.checked_at ?? new Date().toISOString(), tz)}. Ask me "did I…?" anytime.`);
        break;
      }

      case "check_question": {
        const c = await findCheck(db, userId, item.thing);
        if (!c) {
          out.lines.push(`I don't have a record of that. Next time, text "${item.thing}" when you check and I'll keep the receipt.`);
        } else {
          const fresh = Date.now() - Date.parse(c.checked_at) < 18 * 3600e3;
          out.lines.push(fresh
            ? `Yes. You logged "${c.thing}" ${whenSaid(c.checked_at, tz)} (${agoSaid(c.checked_at)}).`
            : `Not today. The last time you logged "${c.thing}" was ${whenSaid(c.checked_at, tz)}.`);
        }
        break;
      }

      case "new_routine": {
        const r = await createRoutine(db, userId, item.routine, tz);
        out.changedRoutines = true;
        const how = source === "sms" ? " I'll text you then. Reply DONE or SKIP." : "";
        out.lines.push(`Set up "${r.name}": ${describeSchedule(r).toLowerCase()}.${how}`);
        break;
      }
    }
  }

  if (captures.length) {
    out.captures = (await saveSorted(db, userId, trimmed, captures, source)) as Capture[];
    if (!out.tip) out.tip = await seedPacket("capture", trimmed);
  }
  return out;
}
