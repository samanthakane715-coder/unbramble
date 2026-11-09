import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createRoutine } from "@/lib/routines";
import type { RoutineSpec } from "@/lib/classify";

const FREQS = ["daily", "weekly", "every_n_days", "monthly", "yearly"];

/** Create a routine from the Rhythms form. */
export async function POST(req: Request) {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const b = await req.json().catch(() => ({}));

  const name = String(b.name ?? "").trim().slice(0, 60);
  if (!name) return NextResponse.json({ error: "Give it a name, like “morning meds”." }, { status: 400 });
  if (!FREQS.includes(b.frequency)) return NextResponse.json({ error: "Choose how often." }, { status: 400 });
  const times = (Array.isArray(b.times) ? b.times : []).filter((t: string) => /^\d{2}:\d{2}$/.test(t));
  if (b.frequency === "weekly" && !(b.days_of_week ?? []).length) {
    return NextResponse.json({ error: "Pick at least one day." }, { status: 400 });
  }

  const spec: RoutineSpec = {
    name,
    kind: ["meds", "chore", "checklist"].includes(b.kind) ? b.kind : "chore",
    frequency: b.frequency,
    times: times.length ? times : ["09:00"],
    days_of_week: (b.days_of_week ?? []).map(Number).filter((d: number) => d >= 0 && d <= 6),
    interval_days: b.frequency === "every_n_days" ? Math.max(1, Math.min(365, Number(b.interval_days) || 30)) : null,
    start_date: /^\d{4}-\d{2}-\d{2}$/.test(b.start_date ?? "") ? b.start_date : null,
    checklist_items: String(b.checklist ?? "").split(/[,\n]/).map((s) => s.trim()).filter(Boolean).slice(0, 12),
  };
  if (spec.kind === "checklist" && !spec.checklist_items.length) {
    return NextResponse.json({ error: "Add the things to check, separated by commas." }, { status: 400 });
  }

  const { data: profile } = await db.from("profiles").select("timezone").eq("id", user.id).single();
  const routine = await createRoutine(db, user.id, spec, profile?.timezone ?? "America/Los_Angeles");
  if (b.remind_by_text === false) await db.from("routines").update({ remind_by_text: false }).eq("id", routine.id);
  return NextResponse.json({ routine: { ...routine, remind_by_text: b.remind_by_text !== false } });
}
