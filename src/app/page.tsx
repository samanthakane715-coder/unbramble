import { Garden } from "@/components/Garden";
import { SignIn } from "@/components/SignIn";
import { TopBar } from "@/components/TopBar";
import type { Plant } from "@/lib/types";

// A sample garden mid-season, for the welcome page
const sample: Plant[] = [
  ["fern", 4, 1, 1], ["wildflower", 4, 3, 3], ["sunflower", 4, 6, 0], ["moonflower", 3, 5, 2],
  ["wildflower", 2, 0, 4], ["sunflower", 3, 2, 1], ["fern", 2, 7, 3], ["sprout", 1, 4, 4],
  ["moonflower", 4, 1, 3], ["wildflower", 4, 6, 4], ["fern", 0, 4, 1],
].map(([species, stage, x, y], i) => ({
  id: String(i), species: species as Plant["species"], stage: stage as number, growth: 0,
  plot_x: x as number, plot_y: y as number, season: 1, bloomed_at: null,
}));

export default async function Home({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <main className="shell">
      <TopBar />
      <Garden plants={sample} growingId={null} dazzle={false} />
      <section className="hero">
        <h1>Clear your head. Grow something.</h1>
        <p>
          Text or type whatever&apos;s rattling around. Unbramble sorts it into reminders, to-dos, lists and notes,
          and every one you finish grows your garden.
        </p>
        <SignIn linkError={error === "link"} />
      </section>
      <section className="how" aria-label="How it works">
        <div>
          <h3>Dump it all</h3>
          <p>“Oat milk, call the vet, dentist Thu 2pm” becomes three things in three places.</p>
        </div>
        <div>
          <h3>It learns your way</h3>
          <p>Move something once and Unbramble sorts it your way next time.</p>
        </div>
        <div>
          <h3>Tend, don&apos;t grind</h3>
          <p>Finishing things grows ferns, sunflowers and wildflowers. Nothing ever wilts.</p>
        </div>
      </section>
    </main>
  );
}
