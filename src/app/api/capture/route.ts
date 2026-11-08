import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sortCapture, saveSorted } from "@/lib/classify";

export async function POST(req: Request) {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in to capture." }, { status: 401 });

  const { text } = await req.json().catch(() => ({ text: "" }));
  const raw = String(text ?? "").trim().slice(0, 2000);
  if (!raw) return NextResponse.json({ error: "Write something to capture." }, { status: 400 });

  const { data: profile } = await db.from("profiles").select("timezone").eq("id", user.id).single();
  const items = await sortCapture(db, user.id, raw, profile?.timezone ?? "America/Los_Angeles");
  const captures = await saveSorted(db, user.id, raw, items, "web");
  return NextResponse.json({ captures });
}
