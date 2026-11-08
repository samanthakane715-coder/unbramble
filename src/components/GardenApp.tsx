"use client";
import { useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { Garden } from "./Garden";
import {
  BLOOMS_PER_SEASON, KIND_LABEL,
  type Action, type Capture, type Kind, type Plant, type Profile,
} from "@/lib/types";

interface Props {
  profile: Profile;
  initialCaptures: Capture[];
  initialPlants: Plant[];
  initialActions: Action[];
}

export function GardenApp({ profile: initialProfile, initialCaptures, initialPlants, initialActions }: Props) {
  const [profile, setProfile] = useState(initialProfile);
  const [captures, setCaptures] = useState(initialCaptures);
  const [plants, setPlants] = useState(initialPlants);
  const [actions, setActions] = useState(initialActions);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [growingId, setGrowingId] = useState<string | null>(null);
  const [leaving, setLeaving] = useState<Set<string>>(new Set());
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const db = useMemo(() => createClient(), []);

  const seasonPlants = plants.filter((p) => p.season === profile.season);
  const bloomed = seasonPlants.filter((p) => p.stage === 4).length;
  const tz = profile.timezone;

  async function refreshGarden() {
    const [{ data: ps }, { data: prof }] = await Promise.all([
      db.from("plants").select("*").eq("season", profile.season),
      db.from("profiles").select("*").single(),
    ]);
    if (ps) setPlants(ps as Plant[]);
    if (prof) setProfile(prof as Profile);
    return (ps ?? []) as Plant[];
  }

  async function capture(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || busy) return;
    setBusy(true); setError(null); setNotice(null);
    try {
      const res = await fetch("/api/capture", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Couldn't save that. Try again.");
      setCaptures((c) => [...json.captures, ...c]);
      const { data: acts } = await db.from("actions").select("*").eq("status", "suggested");
      if (acts) setActions(acts as Action[]);
      setText("");
      const n = json.captures.length;
      setNotice(n === 1 ? `Filed as ${describe(json.captures[0])}.` : `Split into ${n} things and filed them.`);
      inputRef.current?.focus();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function tend(c: Capture) {
    setLeaving((s) => new Set(s).add(c.id));
    const res = await fetch(`/api/captures/${c.id}/tend`, { method: "POST" });
    const json = await res.json();
    if (!res.ok || !json.ok) {
      setLeaving((s) => { const n = new Set(s); n.delete(c.id); return n; });
      setError("Couldn't tend that one. Refresh and try again.");
      return;
    }
    const before = new Set(plants.map((p) => p.id));
    const after = await refreshGarden();
    const grown = after.find((p) => !before.has(p.id))
      ?? after.find((p) => p.species === json.species && p.stage === json.stage);
    setGrowingId(grown?.id ?? null);
    setTimeout(() => setGrowingId(null), 1200);
    setTimeout(() => setCaptures((cs) => cs.filter((x) => x.id !== c.id)), 400);
    setNotice(json.new_plant ? `A new ${json.species} went in the ground.`
      : json.stage === 4 ? `Your ${json.species} bloomed.` : `Your ${json.species} grew a little.`);
  }

  async function resort(c: Capture, value: string) {
    const [kind, list] = value.split(":") as [Kind, string | undefined];
    let listName = list ?? null;
    if (kind === "list" && list === "__new") {
      listName = window.prompt("Name the new list")?.trim() || null;
      if (!listName) return;
    }
    const res = await fetch(`/api/captures/${c.id}/resort`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, list_name: listName }),
    });
    const json = await res.json();
    if (!res.ok) { setError(json.error); return; }
    setCaptures((cs) => cs.map((x) => (x.id === c.id ? json.capture : x)));
    setNotice("Moved. Unbramble will sort things like that this way from now on.");
  }

  async function settleAction(a: Action, status: "done" | "dismissed") {
    setActions((as) => as.filter((x) => x.id !== a.id));
    await fetch(`/api/actions/${a.id}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }),
    });
  }

  async function startSeason() {
    const { data } = await db.rpc("start_new_season");
    if (data?.ok) {
      setProfile((p) => ({ ...p, season: data.season }));
      const { data: ps } = await db.from("plants").select("*").eq("season", data.season);
      setPlants((ps ?? []) as Plant[]);
      setNotice(`Season ${data.season - 1} is pressed in your album. A fresh bed for season ${data.season}.`);
    }
  }

  const open = captures.filter((c) => c.status === "open");
  const reminders = open.filter((c) => c.kind === "reminder")
    .sort((a, b) => (a.remind_at ?? "").localeCompare(b.remind_at ?? ""));
  const tasks = open.filter((c) => c.kind === "task");
  const notes = open.filter((c) => c.kind === "note");
  const listItems = open.filter((c) => c.kind === "list");
  const lists = groupBy(listItems, (c) => c.list_name ?? "misc");
  const listNames = Object.keys(lists).sort();
  const actionsFor = (id: string) => actions.filter((a) => a.capture_id === id && a.status === "suggested");

  function describe(c: Capture) {
    if (c.kind === "list") return `an item on your ${c.list_name} list`;
    if (c.kind === "reminder" && c.remind_at) return `a reminder for ${when(c.remind_at, tz)}`;
    return `a ${KIND_LABEL[c.kind].toLowerCase()}`;
  }

  function Item({ c }: { c: Capture }) {
    return (
      <li className={`item${leaving.has(c.id) ? " leaving" : ""}`}>
        <button className="tend" onClick={() => tend(c)} aria-label={`Mark done: ${c.title}`}>
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8.5l3 3 7-7" stroke="currentColor" strokeWidth="2.2" fill="none" strokeLinecap="round" /></svg>
        </button>
        <span className="item-title">{c.title}</span>
        <span className="item-meta">
          {c.kind === "reminder" && c.remind_at && <span>{when(c.remind_at, tz)}</span>}
          {c.source === "sms" && <span>Texted in</span>}
          <label className="resort-wrap">
            <span className="visually-hidden">Move “{c.title}” to</span>
            <select className="resort" value={c.kind === "list" ? `list:${c.list_name}` : c.kind}
              onChange={(e) => resort(c, e.target.value)}>
              <option value="note">Note</option>
              <option value="task">To-do</option>
              <option value="reminder" disabled={!c.remind_at}>Reminder</option>
              {listNames.map((l) => <option key={l} value={`list:${l}`}>List: {l}</option>)}
              <option value="list:__new">New list…</option>
            </select>
          </label>
        </span>
        {actionsFor(c.id).length > 0 && (
          <span className="actions">
            {actionsFor(c.id).map((a) => (
              a.action_type === "calendar_event" ? (
                <a key={a.id} className="chip" href={`/api/actions/${a.id}/ics`}
                  onClick={() => setTimeout(() => setActions((as) => as.filter((x) => x.id !== a.id)), 300)}>
                  Add to calendar
                </a>
              ) : (
                <a key={a.id} className="chip" href={`mailto:?subject=${encodeURIComponent(a.payload.subject ?? c.title ?? "")}`}
                  onClick={() => settleAction(a, "done")}>
                  Draft the email
                </a>
              )
            ))}
            <button className="chip dismiss" onClick={() => actionsFor(c.id).forEach((a) => settleAction(a, "dismissed"))}>
              No thanks
            </button>
          </span>
        )}
      </li>
    );
  }

  return (
    <>
      <div className="garden-wrap">
        <Garden plants={seasonPlants} growingId={growingId} dazzle={profile.theme === "dazzle"} />
        <div className="garden-status">
          <span>Season {profile.season}: <strong>{bloomed} of {BLOOMS_PER_SEASON}</strong> plants in bloom</span>
          {profile.streak_days > 1 && <span>Tended <strong>{profile.streak_days} days</strong> running</span>}
          {bloomed >= BLOOMS_PER_SEASON && (
            <button className="btn quiet" onClick={startSeason}>Press this season into your album</button>
          )}
        </div>
      </div>

      <form className="capture" onSubmit={capture}>
        <label htmlFor="capture" className="visually-hidden">What&apos;s on your mind?</label>
        <textarea id="capture" ref={inputRef} rows={1} value={text} placeholder="What's on your mind?"
          onChange={(e) => { setText(e.target.value); e.target.style.height = "auto"; e.target.style.height = e.target.scrollHeight + "px"; }}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); capture(e); } }} />
        <button className="btn" disabled={busy || !text.trim()}>{busy ? "Sorting…" : "Capture"}</button>
      </form>
      {error && <p className="error" role="alert">{error}</p>}
      {!error && <p className="hint" aria-live="polite">{notice ?? "Dump it all in one go. Unbramble splits and sorts it for you."}</p>}

      <div className="brambles">
        <section className="patch" aria-labelledby="h-rem">
          <h2 id="h-rem">Reminders <span className="count">{reminders.length || ""}</span></h2>
          {reminders.length ? <ul className="items">{reminders.map((c) => <Item key={c.id} c={c} />)}</ul>
            : <p className="empty">Try “dentist Thursday at 2” and it lands here.</p>}
        </section>

        <section className="patch" aria-labelledby="h-todo">
          <h2 id="h-todo">To-dos <span className="count">{tasks.length || ""}</span></h2>
          {tasks.length ? <ul className="items">{tasks.map((c) => <Item key={c.id} c={c} />)}</ul>
            : <p className="empty">Nothing to do. Enjoy that.</p>}
        </section>

        <section className="patch" aria-labelledby="h-lists">
          <h2 id="h-lists">Lists <span className="count">{listItems.length || ""}</span></h2>
          {listNames.length ? listNames.map((l) => (
            <div key={l}>
              <h3 className="patch-sub">{l}</h3>
              <ul className="items">{lists[l].map((c) => <Item key={c.id} c={c} />)}</ul>
            </div>
          )) : <p className="empty">Try “oat milk, lemons, coffee” to start a grocery list.</p>}
        </section>

        <section className="patch" aria-labelledby="h-notes">
          <h2 id="h-notes">Notes <span className="count">{notes.length || ""}</span></h2>
          {notes.length ? <ul className="items">{notes.map((c) => <Item key={c.id} c={c} />)}</ul>
            : <p className="empty">Ideas and stray thoughts settle here.</p>}
        </section>
      </div>
    </>
  );
}

function groupBy<T>(arr: T[], key: (t: T) => string) {
  return arr.reduce<Record<string, T[]>>((acc, x) => ((acc[key(x)] ??= []).push(x), acc), {});
}

function when(iso: string, tz: string) {
  return new Date(iso).toLocaleString("en-US", {
    timeZone: tz, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });
}
