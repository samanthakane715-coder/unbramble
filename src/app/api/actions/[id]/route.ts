import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** Mark a suggested action done or dismissed. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await createClient();
  const { status } = await req.json().catch(() => ({ status: "" }));
  if (!["done", "dismissed"].includes(status)) {
    return NextResponse.json({ error: "Status must be done or dismissed." }, { status: 400 });
  }
  const { error } = await db.from("actions").update({ status }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
