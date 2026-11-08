import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Garden } from "@/components/Garden";
import { TopBar } from "@/components/TopBar";
import type { Plant } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function AlbumPage() {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect("/");

  const { data: profile } = await db.from("profiles").select("season").eq("id", user.id).single();
  const current = profile?.season ?? 1;
  const { data: plants } = await db.from("plants").select("*").lt("season", current).order("season");
  const bySeason = new Map<number, Plant[]>();
  (plants ?? []).forEach((p) => bySeason.set(p.season, [...(bySeason.get(p.season) ?? []), p as Plant]));
  const { count } = await db.from("captures").select("id", { count: "exact", head: true }).eq("status", "done");

  return (
    <main className="shell">
      <TopBar current="album" />
      <h1>Album</h1>
      <p className="hint">You&apos;ve tended {count ?? 0} things so far.</p>
      {bySeason.size === 0 ? (
        <p className="empty">When 12 plants bloom, you can press that season here and start a fresh bed.</p>
      ) : (
        <div className="album">
          {[...bySeason.entries()].reverse().map(([season, ps]) => {
            const last = ps.map((p) => p.bloomed_at).filter(Boolean).sort().pop();
            return (
              <figure key={season} className="pressed" style={{ margin: 0 }}>
                <Garden plants={ps} growingId={null} dazzle={false} />
                <figcaption>
                  <h2>Season {season}</h2>
                  <p>{ps.filter((p) => p.stage === 4).length} blooms
                    {last ? `, finished ${new Date(last).toLocaleDateString("en-US", { month: "long", day: "numeric" })}` : ""}</p>
                </figcaption>
              </figure>
            );
          })}
        </div>
      )}
    </main>
  );
}
