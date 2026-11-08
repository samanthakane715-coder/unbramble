import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { GardenApp } from "@/components/GardenApp";
import { TopBar } from "@/components/TopBar";
import type { Action, Capture, Plant, Profile } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function GardenPage() {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect("/");

  const { data: profile } = await db.from("profiles").select("*").eq("id", user.id).single();
  if (!profile) redirect("/");

  const [{ data: captures }, { data: plants }, { data: actions }] = await Promise.all([
    db.from("captures").select("*").eq("status", "open").order("created_at", { ascending: false }).limit(300),
    db.from("plants").select("*").eq("season", profile.season),
    db.from("actions").select("*").eq("status", "suggested"),
  ]);

  return (
    <main className="shell">
      <TopBar current="garden" />
      <GardenApp
        profile={profile as Profile}
        initialCaptures={(captures ?? []) as Capture[]}
        initialPlants={(plants ?? []) as Plant[]}
        initialActions={(actions ?? []) as Action[]}
      />
    </main>
  );
}
