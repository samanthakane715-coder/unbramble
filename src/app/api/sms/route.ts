import twilio from "twilio";
import { createAdminClient } from "@/lib/supabase/server";
import { sortCapture, saveSorted } from "@/lib/classify";
import { KIND_LABEL, type Kind } from "@/lib/types";

export const runtime = "nodejs";

function reply(message: string) {
  const twiml = new twilio.twiml.MessagingResponse();
  twiml.message(message);
  return new Response(twiml.toString(), { headers: { "Content-Type": "text/xml" } });
}

/** Twilio calls this when someone texts your Unbramble number. */
export async function POST(req: Request) {
  const form = await req.formData();
  const params: Record<string, string> = {};
  form.forEach((v, k) => (params[k] = String(v)));

  // Only accept requests genuinely signed by Twilio
  const token = process.env.TWILIO_AUTH_TOKEN;
  const site = process.env.NEXT_PUBLIC_SITE_URL;
  if (!token || !site) return new Response("Texting isn't set up yet.", { status: 503 });
  const signature = req.headers.get("x-twilio-signature") ?? "";
  if (!twilio.validateRequest(token, signature, `${site.replace(/\/$/, "")}/api/sms`, params)) {
    return new Response("Invalid signature", { status: 403 });
  }

  const from = params.From;
  const body = (params.Body ?? "").trim();
  const db = createAdminClient();

  // Connecting a phone: "JOIN ABC123" using the code shown in Settings
  const join = body.match(/^join\s+([a-z0-9]{6})$/i);
  if (join) {
    const { data: prof } = await db.from("profiles").select("id").eq("link_code", join[1].toUpperCase()).single();
    if (!prof) return reply("That code didn't match. Check Settings in Unbramble for your code.");
    await db.from("profiles").update({ phone: null }).eq("phone", from); // move number off any old account
    await db.from("profiles").update({ phone: from }).eq("id", prof.id);
    return reply("Connected 🌱 Text me anything on your mind and I'll sort it into your garden.");
  }

  const { data: profile } = await db.from("profiles").select("id, timezone").eq("phone", from).single();
  if (!profile) {
    return reply("I don't know this number yet. Sign in to Unbramble, open Settings, and text the JOIN code shown there.");
  }
  if (!body) return reply("Send some words and I'll file them.");

  const items = await sortCapture(db, profile.id, body, profile.timezone);
  const saved = await saveSorted(db, profile.id, body, items, "sms");

  const summary = saved
    .map((c) => {
      const where = c.kind === "list" ? `your ${c.list_name} list` : KIND_LABEL[c.kind as Kind].toLowerCase();
      const when = c.kind === "reminder" && c.remind_at
        ? ` for ${new Date(c.remind_at).toLocaleString("en-US", { timeZone: profile.timezone, weekday: "short", hour: "numeric", minute: "2-digit" })}`
        : "";
      return `• ${c.title} → ${where}${when}`;
    })
    .join("\n");
  return reply(`Filed:\n${summary}`);
}
