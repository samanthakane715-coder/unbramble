import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { seedPacket } from "@/lib/tips";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await createClient();
  const { data: capture } = await db.from("captures").select("title, raw_text").eq("id", id).single();
  const { data, error } = await db.rpc("tend_capture", { p_capture: id });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const { data: profile } = await db.from("profiles").select("tips_enabled").single();
  const tip = data?.ok && profile?.tips_enabled
    ? await seedPacket("grow", capture?.title ?? capture?.raw_text ?? "", data.species)
    : null;
  return NextResponse.json({ ...data, tip });
}
