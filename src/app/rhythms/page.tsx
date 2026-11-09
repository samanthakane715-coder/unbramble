import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { RhythmsApp } from "@/components/RhythmsApp";
import { TopBar } from "@/components/TopBar";
import type { Check, Routine, RoutineLog } from "@/lib/routines";

export const dynamic = "force-dynamic";

export default async function RhythmsPage() {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect("/");

  const since = new Date(Date.now() - 8 * 86400000).toISOString();
  const [{ data: profile }, { data: routines }, { data: logs }, { data: checks }] = await Promise.all([
    db.from("profiles").select("timezone, phone, tips_enabled").eq("id", user.id).single(),
    db.from("routines").select("*").order("created_at"),
    db.from("routine_logs").select("*").gte("logged_at", since).order("logged_at", { ascending: false }),
    db.from("checks").select("*").order("checked_at", { ascending: false }).limit(150),
  ]);

  return (
    <main className="shell">
      <TopBar current="rhythms" />
      <RhythmsApp
        tz={profile?.timezone ?? "America/Los_Angeles"}
        hasPhone={!!profile?.phone}
        initialRoutines={(routines ?? []) as Routine[]}
        initialLogs={(logs ?? []) as RoutineLog[]}
        initialChecks={(checks ?? []) as Check[]}
      />
    </main>
  );
}
