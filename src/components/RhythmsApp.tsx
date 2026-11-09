"use client";
import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { describeSchedule, type Frequency } from "@/lib/schedule";
import type { Check, Routine, RoutineLog } from "@/lib/routines";
import type { Tip } from "@/lib/tips";
import { SeedPacket } from "./SeedPacket";

interface Props {
  tz: string;
  hasPhone: boolean;
  initialRoutines: Routine[];
  initialLogs: RoutineLog[];
  initialChecks: Check[];
}

type Kind = Routine["kind"];
interface Draft {
  name: string; kind: Kind; frequency: Frequency; times: string[]; days: number[];
  interval: number; start_date: string; checklist: string; text: boolean;
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DEFAULT_CHECKS = ["stove off", "curling iron unplugged", "front door locked", "garage closed"];

export function RhythmsApp({ tz, hasPhone, initialRoutines, initialLogs, initialChecks }: Props) {
  const db = useMemo(() => createClient(), []);
  const today = useMemo(() => new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date()), [tz]);
  const [routines, setRoutines] = useState(initialRoutines);
  const [logs, setLogs] = useState(initialLogs);
  const [checks, setChecks] = useState(initialChecks);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tip, setTip] = useState<Tip | null>(null);
  const [adding, setAdding] = useState(initialRoutines.length === 0);
  const [checkText, setCheckText] = useState("");
  const blank: Draft = { name: "", kind: "meds", frequency: "daily", times: ["08:00"], days: [], interval: 30, start_date: today, checklist: "", text: true };
  const [draft, setDraft] = useState<Draft>(blank);

  const presets: { label: string; d: Partial<Draft> }[] = [
    { label: "Daily meds", d: { name: "morning meds", kind: "meds", frequency: "daily", times: ["08:00"] } },
    { label: "Refill every 30 days", d: { name: "refill prescription", kind: "chore", frequency: "every_n_days", interval: 30, times: ["10:00"] } },
    { label: "Yearly physical", d: { name: "book annual physical", kind: "chore", frequency: "yearly", times: ["10:00"] } },
    { label: "Before I leave", d: { name: "before I leave", kind: "checklist", frequency: "daily", times: ["08:30"], checklist: "stove off, curling iron unplugged, door locked" } },
  ];

  // ---------- routines ----------
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch("/api/routines", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: draft.name, kind: draft.kind, frequency: draft.frequency, times: draft.times,
        days_of_week: draft.days, interval_days: draft.interval, start_date: draft.start_date,
        checklist: draft.checklist, remind_by_text: draft.text,
      }),
    });
    const json = await res.json();
    if (!res.ok) { setError(json.error); return; }
    setRoutines((rs) => [...rs, json.routine]);
    setNotice(`Added ${json.routine.name}.`);
    setDraft(blank);
    setAdding(false);
  }

  async function log(r: Routine, status: "done" | "skipped") {
    setError(null);
    const res = await fetch(`/api/routines/${r.id}/log`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }),
    });
    const json = await res.json();
    if (!res.ok) { setError(json.error); return; }
    setRoutines((rs) => rs.map((x) => (x.id === r.id ? json.routine : x)));
    setLogs((ls) => [{ id: crypto.randomUUID(), routine_id: r.id, status, due_at: null, logged_at: new Date().toISOString() }, ...ls]);
    setNotice(status === "done"
      ? `Logged ${r.name}.${json.grew ? " An herb in your garden grew." : ""}`
      : `Skipped ${r.name}. No worries.`);
    setTip(json.tip ?? null);
  }

  async function togglePause(r: Routine) {
    const { error } = await db.from("routines").update({ active: !r.active }).eq("id", r.id);
    if (error) { setError("Couldn't change that. Try again."); return; }
    setRoutines((rs) => rs.map((x) => (x.id === r.id ? { ...x, active: !r.active } : x)));
  }

  async function remove(r: Routine) {
    if (!window.confirm(`Delete “${r.name}” and its history? This can't be undone.`)) return;
    const { error } = await db.from("routines").delete().eq("id", r.id);
    if (error) { setError("Couldn't delete that. Try again."); return; }
    setRoutines((rs) => rs.filter((x) => x.id !== r.id));
  }

  // ---------- checks ----------
  async function addCheck(thing: string) {
    const t = thing.trim().toLowerCase();
    if (!t) return;
    const { data, error } = await db.from("checks").insert({ thing: t, user_id: (await db.auth.getUser()).data.user!.id }).select().single();
    if (error) { setError("Couldn't log that check. Try again."); return; }
    setChecks((cs) => [data as Check, ...cs]);
    setCheckText("");
    setNotice(`Logged “${t}” at ${time(data!.checked_at)}.`);
  }

  const frequent = useMemo(() => {
    const count = new Map<string, number>();
    checks.forEach((c) => count.set(c.thing, (count.get(c.thing) ?? 0) + 1));
    const top = [...count.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t);
    return [...new Set([...top, ...DEFAULT_CHECKS])].slice(0, 6);
  }, [checks]);

  const localDay = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date(iso));
  const time = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" });
  const when = (iso: string) => new Date(iso).toLocaleString("en-US", { timeZone: tz, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  const todayChecks = checks.filter((c) => localDay(c.checked_at) === today);
  const earlierChecks = checks.filter((c) => localDay(c.checked_at) !== today).slice(0, 12);

  /** Last 7 local days for the history strip. */
  const week = useMemo(() => Array.from({ length: 7 }).map((_, i) => {
    const d = new Date(Date.now() - (6 - i) * 86400000);
    return { key: new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(d), label: d.toLocaleDateString("en-US", { timeZone: tz, weekday: "narrow" }) };
  }), [tz]);

  function dayStatus(r: Routine, day: string) {
    const ls = logs.filter((l) => l.routine_id === r.id && localDay(l.due_at ?? l.logged_at) === day);
    if (ls.some((l) => l.status === "done")) return "done";
    if (ls.some((l) => l.status === "skipped")) return "skipped";
    if (ls.some((l) => l.status === "missed")) return "missed";
    return "none";
  }
  const STATUS_WORD = { done: "done", skipped: "skipped", missed: "not logged", none: "nothing logged" };

  return (
    <>
      <h1>Rhythms</h1>
      <p className="lede">Meds, refills, appointments and the things you double-check.
        {hasPhone ? " Nudges come by text; reply DONE or SKIP." : " Connect your phone in Settings to get nudges by text."}</p>
      {error && <p className="error" role="alert">{error}</p>}
      {notice && !error && <p className="hint" aria-live="polite">{notice}</p>}
      {tip && <SeedPacket tip={tip} onClose={() => setTip(null)} />}

      <div className="rhythms-grid">
        <section aria-labelledby="h-rh">
          <div className="section-head">
            <h2 id="h-rh">Your rhythms</h2>
            {!adding && <button className="btn quiet" onClick={() => setAdding(true)}>Add a rhythm</button>}
          </div>

          {routines.length === 0 && !adding && <p className="empty">Nothing set up yet.</p>}

          <ul className="routines">
            {routines.map((r) => {
              const due = Date.parse(r.next_due_at) <= Date.now() + 5 * 60000;
              const repeating = r.frequency === "daily" || r.frequency === "weekly";
              return (
                <li key={r.id} className={`routine${r.active ? "" : " paused"}${due && r.active ? " due" : ""}`}>
                  <div className="routine-main">
                    <h3>{r.name}</h3>
                    <p className="routine-meta">
                      {describeSchedule(r)}
                      {r.kind === "checklist" && r.checklist_items.length > 0 && <><br />{r.checklist_items.join(", ")}</>}
                    </p>
                    <p className="routine-next">
                      {!r.active ? "Paused" : due ? "Due now" : `Next: ${when(r.next_due_at)}`}
                    </p>
                    {repeating && (
                      <ol className="week" aria-label={`${r.name}, last 7 days`}>
                        {week.map((d) => {
                          const s = dayStatus(r, d.key);
                          return (
                            <li key={d.key} className={`day ${s}`} title={`${d.key}: ${STATUS_WORD[s]}`}>
                              <span className="dot" aria-hidden="true" />
                              <span className="day-label" aria-hidden="true">{d.label}</span>
                              <span className="visually-hidden">{d.key}: {STATUS_WORD[s]}</span>
                            </li>
                          );
                        })}
                      </ol>
                    )}
                  </div>
                  <div className="routine-actions">
                    {r.active && (due ? (
                      <span className="routine-buttons">
                        <button className="btn" onClick={() => log(r, "done")}>{r.kind === "meds" ? "Took it" : "Done"}</button>
                        <button className="btn quiet" onClick={() => log(r, "skipped")}>Skip</button>
                      </span>
                    ) : (
                      <button className="btn quiet" onClick={() => log(r, "done")}>{r.kind === "meds" ? "Took it early" : "Done early"}</button>
                    ))}
                    <span className="routine-tools">
                      <button className="linklike" onClick={() => togglePause(r)}>{r.active ? "Pause" : "Resume"}</button>
                      <button className="linklike" onClick={() => remove(r)}>Delete</button>
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>

          {adding && (
            <form className="rhythm-form" onSubmit={save}>
              <div className="presets" role="group" aria-label="Start from">
                {presets.map((p) => (
                  <button type="button" key={p.label} className="chip"
                    onClick={() => setDraft({ ...blank, ...p.d })}>{p.label}</button>
                ))}
              </div>

              <label className="field">
                <span>Name</span>
                <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  placeholder="morning meds" required maxLength={60} />
                <small>A nickname is fine. You never have to type the medication.</small>
              </label>

              <fieldset className="field">
                <legend>Type</legend>
                <div className="seg">
                  {([["meds", "Meds"], ["chore", "Refill, appointment or chore"], ["checklist", "Checklist"]] as [Kind, string][]).map(([k, label]) => (
                    <label key={k}><input type="radio" name="kind" checked={draft.kind === k} onChange={() => setDraft({ ...draft, kind: k })} />{label}</label>
                  ))}
                </div>
              </fieldset>

              {draft.kind === "checklist" && (
                <label className="field">
                  <span>Things to check</span>
                  <textarea rows={2} value={draft.checklist} onChange={(e) => setDraft({ ...draft, checklist: e.target.value })}
                    placeholder="stove off, curling iron unplugged, door locked" />
                  <small>Separate with commas. Marking it done logs each one in “Did I?”.</small>
                </label>
              )}

              <label className="field">
                <span>How often</span>
                <select value={draft.frequency} onChange={(e) => setDraft({ ...draft, frequency: e.target.value as Frequency })}>
                  <option value="daily">Every day</option>
                  <option value="weekly">Certain days of the week</option>
                  <option value="every_n_days">Every few days (like refills)</option>
                  <option value="monthly">Monthly</option>
                  <option value="yearly">Yearly</option>
                </select>
              </label>

              {draft.frequency === "weekly" && (
                <fieldset className="field">
                  <legend>Days</legend>
                  <div className="seg">
                    {DAYS.map((d, i) => (
                      <label key={d}><input type="checkbox" checked={draft.days.includes(i)}
                        onChange={(e) => setDraft({ ...draft, days: e.target.checked ? [...draft.days, i] : draft.days.filter((x) => x !== i) })} />{d}</label>
                    ))}
                  </div>
                </fieldset>
              )}

              {draft.frequency === "every_n_days" && (
                <label className="field">
                  <span>Every how many days</span>
                  <input type="number" min={1} max={365} value={draft.interval}
                    onChange={(e) => setDraft({ ...draft, interval: Number(e.target.value) })} />
                  <small>Counted from when you mark it done, so a late refill doesn't throw it off.</small>
                </label>
              )}

              {(draft.frequency === "monthly" || draft.frequency === "yearly" || draft.frequency === "every_n_days") && (
                <label className="field">
                  <span>{draft.frequency === "every_n_days" ? "First nudge on" : "Starting"}</span>
                  <input type="date" value={draft.start_date} onChange={(e) => setDraft({ ...draft, start_date: e.target.value })} />
                </label>
              )}

              <fieldset className="field">
                <legend>Time{draft.times.length > 1 ? "s" : ""}</legend>
                <div className="times">
                  {draft.times.map((t, i) => (
                    <span key={i} className="time-row">
                      <input type="time" value={t} aria-label={`Time ${i + 1}`}
                        onChange={(e) => setDraft({ ...draft, times: draft.times.map((x, j) => (j === i ? e.target.value : x)) })} />
                      {draft.times.length > 1 && (
                        <button type="button" className="linklike" onClick={() => setDraft({ ...draft, times: draft.times.filter((_, j) => j !== i) })}>Remove</button>
                      )}
                    </span>
                  ))}
                  {(draft.frequency === "daily" || draft.frequency === "weekly") && draft.times.length < 4 && (
                    <button type="button" className="linklike" onClick={() => setDraft({ ...draft, times: [...draft.times, "20:00"] })}>Add another time</button>
                  )}
                </div>
              </fieldset>

              <label className="check-row">
                <input type="checkbox" checked={draft.text} onChange={(e) => setDraft({ ...draft, text: e.target.checked })} />
                Text me when it&apos;s due
              </label>

              <div className="form-actions">
                <button className="btn">Add rhythm</button>
                <button type="button" className="btn quiet" onClick={() => { setAdding(false); setDraft(blank); }}>Cancel</button>
              </div>
            </form>
          )}
        </section>

        <section aria-labelledby="h-did" className="did">
          <h2 id="h-did">Did I?</h2>
          <p className="lede small">Log a check the moment you do it. Later, ask “did I turn off the stove?” in the garden or by text.</p>
          <form className="capture" onSubmit={(e) => { e.preventDefault(); addCheck(checkText); }}>
            <label htmlFor="check" className="visually-hidden">What did you just check?</label>
            <textarea id="check" rows={1} value={checkText} placeholder="What did you just check?"
              onChange={(e) => setCheckText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCheck(checkText); } }} />
            <button className="btn" disabled={!checkText.trim()}>Log it</button>
          </form>
          <div className="presets" role="group" aria-label="Quick checks">
            {frequent.map((t) => <button key={t} className="chip" onClick={() => addCheck(t)}>{t}</button>)}
          </div>

          <h3 className="patch-sub">Today</h3>
          {todayChecks.length ? (
            <ul className="receipts">
              {todayChecks.map((c) => <li key={c.id}><span>{c.thing}</span><time dateTime={c.checked_at}>{time(c.checked_at)}</time></li>)}
            </ul>
          ) : <p className="empty">Nothing checked yet today.</p>}

          {earlierChecks.length > 0 && <>
            <h3 className="patch-sub">Earlier</h3>
            <ul className="receipts quiet">
              {earlierChecks.map((c) => <li key={c.id}><span>{c.thing}</span><time dateTime={c.checked_at}>{when(c.checked_at)}</time></li>)}
            </ul>
          </>}
        </section>
      </div>
    </>
  );
}
