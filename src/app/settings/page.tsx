import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SettingsForm } from "@/components/SettingsForm";
import { TopBar } from "@/components/TopBar";
import type { Profile } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect("/");
  const { data: profile } = await db.from("profiles").select("*").eq("id", user.id).single();
  if (!profile) redirect("/");

  return (
    <main className="shell">
      <TopBar current="settings" />
      <h1>Settings</h1>
      <SettingsForm profile={profile as Profile} email={user.email ?? ""}
        smsNumber={process.env.TWILIO_PHONE_NUMBER ?? null} />
    </main>
  );
}
