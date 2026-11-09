"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { GardenApp } from "./GardenApp";
import { RhythmsApp } from "./RhythmsApp";
import { makeDemoClient, makeDemoFetch, seedState, type DemoState } from "@/lib/demo/backend";
import type { Action, Capture, Plant, Profile, Theme } from "@/lib/types";
import type { Check, Routine, RoutineLog } from "@/lib/match";

const THEMES: { id: Theme; name: string }[] = [
  { id: "earth", name: "Earth" },
  { id: "dusk", name: "Dusk" },
  { id: "dazzle", name: "Dazzle" },
];

const TRY = {
  garden: [
    "oat milk, eggs, coffee",
    "dentist tomorrow at 2pm",
    "did I turn off the stove?",
    "unplugged the curling iron",
    "take vitamins every day at 9pm",
    "done (answers the morning meds nudge)",
  ],
  rhythms: [
    "Tap “Took it” on morning meds and watch an herb grow",
    "Add a rhythm from a preset, like “Refill every 30 days”",
    "Log a check, then ask “did I…?” in the garden",
  ],
};

export function DemoApp() {
  const [ready, setReady] = useState<{ state: DemoState; tz: string } | null>(null);
  const [tab, setTab] = useState<"garden" | "rhythms">("garden");
  const [theme, setTheme] = useState<Theme>("earth");
  const [version, setVersion] = useState(0); // remount screens from fresh data when switching tabs

  // Seed on the client so times use the visitor's own time zone
  useEffect(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Los_Angeles";
    setReady({ state: seedState(tz), tz });
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    if (ready) ready.state.profiles[0].theme = theme;
  }, [theme, ready]);

  const backend = useMemo(() => ready && {
    client: makeDemoClient(ready.state),
    api: makeDemoFetch(ready.state, ready.tz),
  }, [ready]);

  function go(t: "garden" | "rhythms") {
    setTab(t);
    setVersion((v) => v + 1);
  }

  function reset() {
    if (!ready) return;
    setReady({ state: seedState(ready.tz), tz: ready.tz });
    setVersion((v) => v + 1);
  }

  if (!ready || !backend) return <main className="shell"><p className="hint">Planting the demo garden…</p></main>;
  const s = ready.state;
  const profile = { ...(s.profiles[0] as unknown as Profile), theme };

  return (
    <main className="shell">
      <header className="topbar">
        <Link href="/" className="wordmark">Unbramble</Link>
        <nav className="nav" aria-label="Demo">
          <button className={`linklike tab${tab === "garden" ? " on" : ""}`} aria-current={tab === "garden" ? "page" : undefined} onClick={() => go("garden")}>Garden</button>
          <button className={`linklike tab${tab === "rhythms" ? " on" : ""}`} aria-current={tab === "rhythms" ? "page" : undefined} onClick={() => go("rhythms")}>Rhythms</button>
        </nav>
      </header>

      <div className="demo-bar" role="note">
        <p><strong>You&apos;re in the demo.</strong> Everything works on sample data, and nothing is saved.</p>
        <div className="demo-tools">
          <span className="demo-themes" role="group" aria-label="Look">
            {THEMES.map((t) => (
              <button key={t.id} className="chip" aria-pressed={theme === t.id} onClick={() => setTheme(t.id)}>{t.name}</button>
            ))}
          </span>
          <button className="linklike" onClick={reset}>Start over</button>
          <Link href="/" className="linklike">Sign up</Link>
        </div>
        <details className="demo-try">
          <summary>Things to try</summary>
          <ul>{TRY[tab].map((x) => <li key={x}>{x}</li>)}</ul>
        </details>
      </div>

      {tab === "garden" ? (
        <GardenApp
          key={`g${version}`}
          demo
          client={backend.client}
          api={backend.api}
          profile={profile}
          initialCaptures={s.captures.filter((c) => c.status === "open").map((c) => ({ ...c })) as unknown as Capture[]}
          initialPlants={s.plants.map((p) => ({ ...p })) as unknown as Plant[]}
          initialActions={s.actions.filter((a) => a.status === "suggested").map((a) => ({ ...a })) as unknown as Action[]}
        />
      ) : (
        <RhythmsApp
          key={`r${version}`}
          demo
          client={backend.client}
          api={backend.api}
          tz={ready.tz}
          hasPhone
          initialRoutines={s.routines.map((r) => ({ ...r })) as unknown as Routine[]}
          initialLogs={s.routine_logs.map((l) => ({ ...l })) as unknown as RoutineLog[]}
          initialChecks={s.checks.map((c) => ({ ...c })) as unknown as Check[]}
        />
      )}
      <p className="hint demo-foot">By text it works the same way: reply DONE to a nudge, or text anything on your mind.</p>
    </main>
  );
}
