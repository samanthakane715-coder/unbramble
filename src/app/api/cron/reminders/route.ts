import twilio from "twilio";
import { createAdminClient } from "@/lib/supabase/server";
import { nextDue } from "@/lib/schedule";
import type { Routine } from "@/lib/routines";

export const runtime = "nodejs";

const FOLLOW_UP_AFTER = 60 * 60 * 1000;      // one gentle follow-up after an hour
const MISSED_AFTER = 12 * 60 * 60 * 1000;    // daily/weekly: counts as missed after 12h
const RENUDGE_AFTER = 24 * 60 * 60 * 1000;   // refills/chores: nudge again daily until done

function nudgeText(r: Routine) {
  if (r.kind === "meds") return `💊 Time for ${r.name}. Reply DONE or SKIP.`;
  if (r.kind === "checklist") return `🔑 ${r.name}: ${r.checklist_items.join(", ")}. Reply DONE when it's all set.`;
  return `🌿 Nudge: ${r.name}. Reply DONE when it's handled, or SKIP.`;
}

/**
 * Runs every few minutes (Supabase scheduled job, header "Authorization: Bearer <CRON_SECRET>").
 * Sends one-off reminder texts and routine nudges, follows up once, and records missed doses.
 */
export async function GET(req: Request) {
  if (!process.env.CRON_SECRET || req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const { TWILIO_ACCOUNT_SID: sid, TWILIO_AUTH_TOKEN: token, TWILIO_PHONE_NUMBER: number } = process.env;
  const sms = sid && token && number ? twilio(sid, token) : null;
  const db = createAdminClient();
  const now = Date.now();
  const stats = { reminders: 0, nudges: 0, followups: 0, missed: 0 };

  const send = async (to: string | undefined, body: string) => {
    if (!sms || !to) return false;
    try { await sms.messages.create({ to, from: number!, body }); return true; }
    catch (err) { console.error("sms failed", err); return false; }
  };

  // ---- One-off reminders from captures ----
  const { data: due } = await db.from("captures").select("id, title, user_id")
    .eq("kind", "reminder").eq("status", "open").is("reminded_at", null)
    .lte("remind_at", new Date(now).toISOString()).limit(100);

  // ---- Routines that are due, nudged, or overdue ----
  const { data: rs } = await db.from("routines").select("*")
    .eq("active", true).lte("next_due_at", new Date(now).toISOString()).limit(300);
  const routines = (rs ?? []) as Routine[];

  const userIds = [...new Set([...(due ?? []).map((c) => c.user_id), ...routines.map((r) => r.user_id)])];
  if (!userIds.length) return Response.json(stats);
  const { data: profiles } = await db.from("profiles").select("id, phone, timezone").in("id", userIds);
  const prof = new Map((profiles ?? []).map((p) => [p.id, p as { id: string; phone: string | null; timezone: string }]));

  for (const c of due ?? []) {
    if (await send(prof.get(c.user_id)?.phone ?? undefined, `🌻 Reminder: ${c.title}`)) {
      await db.from("captures").update({ reminded_at: new Date().toISOString() }).eq("id", c.id);
      stats.reminders++;
    }
  }

  for (const r of routines) {
    const p = prof.get(r.user_id);
    if (!p) continue;
    const dueAt = Date.parse(r.next_due_at);
    const phone = r.remind_by_text ? p.phone ?? undefined : undefined;
    const repeating = r.frequency === "daily" || r.frequency === "weekly";

    // Overdue past the window: record it gently and move on
    if (repeating) {
      const upcoming = nextDue(r, new Date(dueAt), p.timezone).getTime();
      const window = Math.min(MISSED_AFTER, upcoming - dueAt - 60_000);
      if (now - dueAt > window) {
        await db.from("routine_logs").insert({
          user_id: r.user_id, routine_id: r.id, status: "missed", due_at: r.next_due_at, source: "auto",
        });
        await db.from("routines").update({
          next_due_at: nextDue(r, new Date(now), p.timezone).toISOString(), nudged_at: null, followed_up: false,
        }).eq("id", r.id);
        stats.missed++;
        continue;
      }
    } else if (r.nudged_at && now - Date.parse(r.nudged_at) > RENUDGE_AFTER) {
      // refills/appointments/chores stay due until done: start a fresh nudge cycle tomorrow
      await db.from("routines").update({ nudged_at: null, followed_up: false }).eq("id", r.id);
      r.nudged_at = null;
    }

    if (!r.nudged_at) {
      if (await send(phone, nudgeText(r))) stats.nudges++;
      // mark nudged even without a phone, so the web shows it as waiting
      await db.from("routines").update({ nudged_at: new Date().toISOString() }).eq("id", r.id);
    } else if (!r.followed_up && now - Date.parse(r.nudged_at) > FOLLOW_UP_AFTER) {
      if (await send(phone, `Just checking in: did you get to ${r.name}? Reply DONE or SKIP.`)) stats.followups++;
      await db.from("routines").update({ followed_up: true }).eq("id", r.id);
    }
  }

  return Response.json(stats);
}
