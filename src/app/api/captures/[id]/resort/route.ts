import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const KINDS = ["note", "list", "reminder", "task"];

/** The person moved a capture somewhere else. Save it, and remember the correction so sorting learns. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const kind = KINDS.includes(body.kind) ? body.kind : null;
  if (!kind) return NextResponse.json({ error: "Pick note, list, reminder or to-do." }, { status: 400 });
  const listName = kind === "list" ? String(body.list_name || "misc").toLowerCase().slice(0, 40) : null;

  const { data: before } = await db.from("captures").select("*").eq("id", id).single();
  if (!before) return NextResponse.json({ error: "That capture no longer exists." }, { status: 404 });

  const { data: after, error } = await db.from("captures")
    .update({ kind, list_name: listName, remind_at: kind === "reminder" ? before.remind_at : null })
    .eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  if (before.kind !== kind || before.list_name !== listName) {
    await db.from("corrections").insert({
      user_id: user.id, capture_id: id, raw_text: before.title ?? before.raw_text,
      from_kind: before.kind, to_kind: kind, from_list: before.list_name, to_list: listName,
    });
  }
  return NextResponse.json({ capture: after });
}
