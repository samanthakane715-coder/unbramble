import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { handleMessage } from "@/lib/handle";

export async function POST(req: Request) {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in to capture." }, { status: 401 });

  const { text } = await req.json().catch(() => ({ text: "" }));
  const raw = String(text ?? "").trim().slice(0, 2000);
  if (!raw) return NextResponse.json({ error: "Write something to capture." }, { status: 400 });

  const { data: profile } = await db.from("profiles").select("timezone, tips_enabled").eq("id", user.id).single();
  const result = await handleMessage(db, user.id, raw, profile?.timezone ?? "America/Los_Angeles", "web");
  if (!profile?.tips_enabled) result.tip = null;
  return NextResponse.json(result);
}
