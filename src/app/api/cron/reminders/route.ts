import twilio from "twilio";
import { createAdminClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * Texts reminders that are due. Called every few minutes by a Supabase scheduled job
 * with header "Authorization: Bearer <CRON_SECRET>".
 */
export async function GET(req: Request) {
  if (!process.env.CRON_SECRET || req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const { TWILIO_ACCOUNT_SID: sid, TWILIO_AUTH_TOKEN: token, TWILIO_PHONE_NUMBER: number } = process.env;
  if (!sid || !token || !number) return Response.json({ sent: 0, note: "Twilio not configured" });

  const db = createAdminClient();
  const { data: due } = await db
    .from("captures")
    .select("id, title, user_id")
    .eq("kind", "reminder").eq("status", "open").is("reminded_at", null)
    .lte("remind_at", new Date().toISOString())
    .limit(50);
  if (!due?.length) return Response.json({ sent: 0 });

  const { data: profiles } = await db
    .from("profiles").select("id, phone")
    .in("id", [...new Set(due.map((c) => c.user_id))])
    .not("phone", "is", null);
  const phoneFor = new Map((profiles ?? []).map((p) => [p.id, p.phone as string]));

  const client = twilio(sid, token);
  let sent = 0;
  for (const c of due) {
    const phone = phoneFor.get(c.user_id);
    if (!phone) continue;
    try {
      await client.messages.create({ to: phone, from: number, body: `🌻 Reminder: ${c.title}` });
      await db.from("captures").update({ reminded_at: new Date().toISOString() }).eq("id", c.id);
      sent++;
    } catch (err) {
      console.error("reminder send failed", c.id, err);
    }
  }
  return Response.json({ sent });
}
