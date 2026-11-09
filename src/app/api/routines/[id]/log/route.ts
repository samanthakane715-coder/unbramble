import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logRoutine, type Routine } from "@/lib/routines";
import { seedPacket } from "@/lib/tips";

/** Mark a routine done or skipped from the web. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const { status } = await req.json().catch(() => ({ status: "" }));
  if (!["done", "skipped"].includes(status)) {
    return NextResponse.json({ error: "Status must be done or skipped." }, { status: 400 });
  }
  const { data: r } = await db.from("routines").select("*").eq("id", id).single();
  if (!r) return NextResponse.json({ error: "That routine no longer exists." }, { status: 404 });

  const { data: profile } = await db.from("profiles").select("timezone, tips_enabled").eq("id", user.id).single();
  const res = await logRoutine(db, user.id, r as Routine, status, "web", profile?.timezone ?? "America/Los_Angeles");
  const { data: routine } = await db.from("routines").select("*").eq("id", id).single();
  const tip = status === "done" && profile?.tips_enabled ? await seedPacket("grow", r.name, "herb") : null;
  return NextResponse.json({ routine, grew: res.grew, tip });
}
