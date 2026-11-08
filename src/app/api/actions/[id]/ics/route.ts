import { createClient } from "@/lib/supabase/server";

/** Download a reminder as a calendar event (.ics) that opens in Google, Apple or Outlook Calendar. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await createClient();
  const { data: action } = await db.from("actions").select("*").eq("id", id).single();
  if (!action || action.action_type !== "calendar_event") {
    return new Response("That calendar event isn't available.", { status: 404 });
  }

  const start = new Date(action.payload.start);
  const end = new Date(start.getTime() + 30 * 60 * 1000);
  const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const esc = (s: string) => s.replace(/[\\,;]/g, (m) => "\\" + m).replace(/\n/g, "\\n");

  const ics = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Unbramble//EN",
    "BEGIN:VEVENT",
    `UID:${action.id}@unbramble`,
    `DTSTAMP:${fmt(new Date())}`,
    `DTSTART:${fmt(start)}`,
    `DTEND:${fmt(end)}`,
    `SUMMARY:${esc(action.payload.title ?? "Reminder")}`,
    "BEGIN:VALARM", "TRIGGER:-PT10M", "ACTION:DISPLAY", "DESCRIPTION:Reminder", "END:VALARM",
    "END:VEVENT", "END:VCALENDAR",
  ].join("\r\n");

  await db.from("actions").update({ status: "done" }).eq("id", id);
  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="unbramble-reminder.ics"`,
    },
  });
}
