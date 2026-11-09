"use client";
/**
 * In-memory stand-in for Supabase + the app's API routes, so the real screens run
 * on sample data with nothing saved. Only implements what the screens actually call.
 */
import { fallbackUnderstand } from "../rules";
import { bestOverlap, canonicalThing, matchRoutine, whenSaid, agoSaid, type Check, type Routine, type RoutineLog } from "../match";
import { describeSchedule, firstDue, localParts, nextDue, zonedTime } from "../schedule";
import { hackFor, factFor, type Tip } from "../tipsData";
import { SPECIES_FOR_KIND, type Action, type Capture, type Plant, type Profile } from "../types";

type Row = Record<string, unknown>;
const uid = () => (globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2));
export const DEMO_USER = "demo-user";

export interface DemoState {
  profiles: Row[]; captures: Row[]; plants: Row[]; actions: Row[];
  routines: Row[]; routine_logs: Row[]; checks: Row[]; corrections: Row[];
}

// ---------- seed data ----------
export function seedState(tz: string): DemoState {
  const now = Date.now(), h = 3600e3, day = 86400e3;
  const iso = (ms: number) => new Date(ms).toISOString();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());

  const profile: Profile = {
    id: DEMO_USER, display_name: "sam", phone: "+12065550123", link_code: "DEMO42", theme: "earth", timezone: tz,
    growth_points: 23, season: 1, streak_days: 4, last_tended_on: today, tips_enabled: true,
  };
  // growth = stage*3 + 2 → the next tend visibly moves each plant up a stage
  const plant = (species: Plant["species"], stage: number, x: number, y: number): Plant => ({
    id: uid(), species, stage, growth: stage * 3 + 2, plot_x: x, plot_y: y, season: 1,
    bloomed_at: stage === 4 ? iso(now - 2 * day) : null,
  });
  const plants = [
    plant("sunflower", 4, 6, 0), plant("fern", 3, 1, 1), plant("wildflower", 2, 3, 3),
    plant("moonflower", 1, 5, 2), plant("herb", 3, 2, 4), plant("sprout", 1, 4, 1), plant("fern", 4, 7, 3),
  ];

  const cap = (kind: Capture["kind"], title: string, extra: Partial<Capture> = {}): Capture => ({
    id: uid(), user_id: DEMO_USER, raw_text: title, kind, title, list_name: null, remind_at: null,
    status: "open", source: "web", created_at: iso(now - Math.random() * 2 * day), completed_at: null, ...extra,
  });
  const at = (daysAhead: number, hhmm: string) => {
    const p = localParts(new Date(now + daysAhead * day), tz);
    return zonedTime(p.y, p.m, p.d, hhmm, tz).toISOString();
  };
  const dentist = cap("reminder", "Dentist cleaning", { remind_at: at(2, "09:30"), source: "sms" });
  const captures = [
    dentist,
    cap("reminder", "Pay the HOA", { remind_at: at(5, "09:00") }),
    cap("task", "Email the landlord about the lease renewal"),
    cap("task", "Book flights for the Portugal trip"),
    cap("task", "Return the library books"),
    cap("list", "oat milk", { list_name: "groceries" }),
    cap("list", "lemons", { list_name: "groceries" }),
    cap("list", "sourdough", { list_name: "groceries" }),
    cap("list", "rain boots", { list_name: "gift ideas" }),
    cap("note", "App idea: plants could be named after what you finished"),
    cap("note", "Try the ramen place on Pike"),
  ];
  const actions: Action[] = [
    { id: uid(), capture_id: dentist.id, action_type: "calendar_event", status: "suggested", payload: { title: dentist.title!, start: dentist.remind_at! } },
    { id: uid(), capture_id: captures[2].id, action_type: "email_draft", status: "suggested", payload: { subject: captures[2].title! } },
  ];

  const routine = (name: string, kind: Routine["kind"], extra: Partial<Routine>): Routine => {
    const base = {
      id: uid(), user_id: DEMO_USER, name, kind, frequency: "daily" as const, times: ["08:00"], days_of_week: [],
      interval_days: null, start_date: today, checklist_items: [], remind_by_text: true,
      nudged_at: null, followed_up: false, active: true, ...extra,
    } as Routine;
    return { ...base, next_due_at: extra.next_due_at ?? firstDue(base, tz).toISOString() };
  };
  const meds = routine("morning meds", "meds", { next_due_at: iso(now - 12 * 60e3), nudged_at: iso(now - 10 * 60e3) });
  const evening = routine("evening vitamins", "meds", { times: ["20:00"] });
  const refill = routine("refill prescription", "chore", { frequency: "every_n_days", interval_days: 30, times: ["10:00"], next_due_at: iso(now + 9 * day) });
  const leave = routine("before I leave", "checklist", {
    frequency: "weekly", days_of_week: [1, 2, 3, 4, 5], times: ["08:30"],
    checklist_items: ["stove off", "curling iron unplugged", "front door locked"],
  });
  const physical = routine("book annual physical", "chore", { frequency: "yearly", times: ["10:00"], start_date: "2026-03-02" });

  const logs: RoutineLog[] = [];
  [1, 2, 3, 5, 6].forEach((d) => logs.push({ id: uid(), routine_id: meds.id, status: "done", due_at: iso(now - d * day), logged_at: iso(now - d * day) }));
  logs.push({ id: uid(), routine_id: meds.id, status: "missed", due_at: iso(now - 4 * day), logged_at: iso(now - 4 * day) });
  [1, 2, 4, 5].forEach((d) => logs.push({ id: uid(), routine_id: evening.id, status: "done", due_at: iso(now - d * day), logged_at: iso(now - d * day) }));
  logs.push({ id: uid(), routine_id: evening.id, status: "skipped", due_at: iso(now - 3 * day), logged_at: iso(now - 3 * day) });

  const checks: Check[] = [
    { id: uid(), thing: "curling iron unplugged", checked_at: iso(now - 2 * h), source: "sms" },
    { id: uid(), thing: "stove off", checked_at: iso(now - 3 * h), source: "web" },
    { id: uid(), thing: "front door locked", checked_at: iso(now - day - h), source: "web" },
    { id: uid(), thing: "garage closed", checked_at: iso(now - 2 * day), source: "sms" },
  ];

  return {
    profiles: [profile as unknown as Row], captures: captures as unknown as Row[], plants: plants as unknown as Row[],
    actions: actions as unknown as Row[], routines: [meds, evening, refill, leave, physical] as unknown as Row[],
    routine_logs: logs as unknown as Row[], checks: checks as unknown as Row[], corrections: [],
  };
}

// ---------- fake Supabase client ----------
type Filter = (r: Row) => boolean;

class Query implements PromiseLike<{ data: unknown; error: null }> {
  private op: "select" | "insert" | "update" | "delete" = "select";
  private payload: Row | Row[] | null = null;
  private filters: Filter[] = [];
  private wantSingle = false;
  private returning = false;
  private orderBy: { col: string; asc: boolean } | null = null;
  private max: number | null = null;

  constructor(private state: DemoState, private table: keyof DemoState) {}

  select() { if (this.op !== "select") this.returning = true; return this; }
  insert(v: Row | Row[]) { this.op = "insert"; this.payload = v; return this; }
  update(v: Row) { this.op = "update"; this.payload = v; return this; }
  delete() { this.op = "delete"; return this; }
  eq(c: string, v: unknown) { this.filters.push((r) => r[c] === v); return this; }
  neq(c: string, v: unknown) { this.filters.push((r) => r[c] !== v); return this; }
  lt(c: string, v: never) { this.filters.push((r) => (r[c] as never) < v); return this; }
  lte(c: string, v: never) { this.filters.push((r) => (r[c] as never) <= v); return this; }
  gte(c: string, v: never) { this.filters.push((r) => (r[c] as never) >= v); return this; }
  is(c: string, v: unknown) { this.filters.push((r) => (r[c] ?? null) === v); return this; }
  not(c: string, _op: string, v: unknown) { this.filters.push((r) => (r[c] ?? null) !== v); return this; }
  in(c: string, vs: unknown[]) { this.filters.push((r) => vs.includes(r[c])); return this; }
  order(col: string, o?: { ascending?: boolean }) { this.orderBy = { col, asc: o?.ascending !== false }; return this; }
  limit(n: number) { this.max = n; return this; }
  single() { this.wantSingle = true; return this; }

  private run(): unknown {
    const rows = this.state[this.table];
    const match = (r: Row) => this.filters.every((f) => f(r));
    let out: Row[] = [];
    if (this.op === "insert") {
      const list = (Array.isArray(this.payload) ? this.payload : [this.payload!]).map((r) => ({
        id: uid(), created_at: new Date().toISOString(), user_id: DEMO_USER,
        ...(this.table === "checks" ? { checked_at: new Date().toISOString(), source: "web" } : {}), ...r,
      }));
      rows.unshift(...list);
      out = list;
    } else if (this.op === "update") {
      out = rows.filter(match);
      out.forEach((r) => Object.assign(r, this.payload));
    } else if (this.op === "delete") {
      out = rows.filter(match);
      this.state[this.table] = rows.filter((r) => !match(r));
    } else {
      out = rows.filter(match);
    }
    if (this.orderBy) {
      const { col, asc } = this.orderBy;
      out = [...out].sort((a, b) => (String(a[col]) < String(b[col]) ? -1 : 1) * (asc ? 1 : -1));
    }
    if (this.max != null) out = out.slice(0, this.max);
    if (this.op !== "select" && !this.returning) return null;
    const copy = out.map((r) => ({ ...r }));
    return this.wantSingle ? copy[0] ?? null : copy;
  }

  then<A, B>(ok?: ((v: { data: unknown; error: null }) => A | PromiseLike<A>) | null, bad?: ((e: unknown) => B | PromiseLike<B>) | null) {
    return Promise.resolve({ data: this.run(), error: null as null }).then(ok, bad);
  }
}

export function makeDemoClient(state: DemoState) {
  return {
    from: (t: keyof DemoState) => new Query(state, t),
    auth: { getUser: async () => ({ data: { user: { id: DEMO_USER, email: "you@example.com" } }, error: null }) },
    rpc: async (fn: string) => {
      if (fn === "start_new_season") {
        const p = state.profiles[0];
        const blooms = state.plants.filter((x) => x.season === p.season && x.stage === 4).length;
        if (blooms < 12) return { data: { ok: false, blooms }, error: null };
        p.season = (p.season as number) + 1;
        state.plants.push({ id: uid(), species: "sprout", stage: 0, growth: 0, plot_x: 3, plot_y: 2, season: p.season, bloomed_at: null });
        return { data: { ok: true, season: p.season }, error: null };
      }
      if (fn === "new_link_code") return { data: "DEMO" + Math.floor(Math.random() * 90 + 10), error: null };
      return { data: null, error: null };
    },
  };
}

// ---------- fake API routes ----------
function grow(state: DemoState, species: string) {
  const p = state.profiles[0];
  let plant = state.plants.find((x) => x.species === species && (x.stage as number) < 4 && x.season === p.season);
  let isNew = false;
  if (!plant) {
    plant = { id: uid(), species, stage: 0, growth: 0, plot_x: Math.floor(Math.random() * 8), plot_y: Math.floor(Math.random() * 5), season: p.season, bloomed_at: null };
    state.plants.push(plant);
    isNew = true;
  } else {
    plant.growth = (plant.growth as number) + 1;
    plant.stage = Math.min(4, Math.floor((plant.growth as number) / 3));
    if (plant.stage === 4 && !plant.bloomed_at) plant.bloomed_at = new Date().toISOString();
  }
  p.growth_points = (p.growth_points as number) + 1;
  return { species, stage: plant.stage as number, new_plant: isNew, plant_id: plant.id as string };
}

function packet(moment: "capture" | "grow", text: string, species?: string): Tip | null {
  const hack = hackFor(text);
  if (moment === "grow") return hack && Math.random() < 0.4 ? hack : factFor(species);
  return hack;
}

function logRoutine(state: DemoState, r: Routine, status: "done" | "skipped", tz: string) {
  const now = new Date();
  const due = new Date(r.next_due_at);
  let next: Date | null = null;
  if (r.frequency === "every_n_days") next = nextDue(r, now, tz);
  else if (now.getTime() >= due.getTime() - 3 * 3600e3) next = nextDue(r, new Date(Math.max(due.getTime(), now.getTime())), tz);
  state.routine_logs.unshift({ id: uid(), routine_id: r.id, status, due_at: next ? r.next_due_at : null, logged_at: now.toISOString() });
  const row = state.routines.find((x) => x.id === r.id)!;
  if (next) Object.assign(row, { next_due_at: next.toISOString(), nudged_at: null, followed_up: false });
  if (status === "done" && r.kind === "checklist") {
    r.checklist_items.forEach((thing) => state.checks.unshift({ id: uid(), thing, checked_at: now.toISOString(), source: "web" }));
  }
  return status === "done" ? grow(state, "herb") : null;
}

const DONE = /^(done|did it|took (them|it|my \w+)|taken|yes|yep|yup|y)[\s.!]*$/i;
const SKIP = /^(skip|skipped|no|nope|n|not today)[\s.!]*$/i;

function handleMessage(state: DemoState, text: string, tz: string) {
  const out = { captures: [] as Row[], lines: [] as string[], grew: null as ReturnType<typeof grow> | null, tip: null as Tip | null };
  const routines = state.routines.filter((r) => r.active) as unknown as Routine[];
  const t = text.trim();

  if (DONE.test(t) || SKIP.test(t)) {
    const status = DONE.test(t) ? "done" : "skipped";
    const pending = [...routines].filter((r) => r.nudged_at).sort((a, b) => Date.parse(b.nudged_at!) - Date.parse(a.nudged_at!))[0];
    if (pending) {
      out.grew = logRoutine(state, pending, status, tz);
      out.lines.push(status === "done" ? `Logged ${pending.name}.${out.grew ? " An herb in your garden grew." : ""}` : `Skipped ${pending.name}. No worries.`);
      if (status === "done") out.tip = packet("grow", pending.name, "herb");
      return out;
    }
  }

  for (const item of fallbackUnderstand(t, tz)) {
    if (item.intent === "capture") {
      const row = {
        id: uid(), user_id: DEMO_USER, raw_text: t, kind: item.kind, title: item.title, list_name: item.list_name,
        remind_at: item.remind_at, status: "open", source: "web", created_at: new Date().toISOString(), completed_at: null,
      };
      state.captures.unshift(row);
      out.captures.push(row);
      if (item.kind === "reminder" && item.remind_at) {
        state.actions.push({ id: uid(), capture_id: row.id, action_type: "calendar_event", status: "suggested", payload: { title: row.title, start: row.remind_at } });
      }
      if (item.kind === "task" && /\bemail\b/i.test(item.title)) {
        state.actions.push({ id: uid(), capture_id: row.id, action_type: "email_draft", status: "suggested", payload: { subject: row.title } });
      }
    } else if (item.intent === "log_routine") {
      const r = matchRoutine(routines, item.routine_name);
      if (!r) { out.lines.push("I don't have a routine for that yet."); continue; }
      out.grew = logRoutine(state, r, item.status, tz);
      out.lines.push(`Logged ${r.name}.`);
    } else if (item.intent === "check_done") {
      const thing = canonicalThing([...new Set(state.checks.map((x) => String(x.thing)))], item.thing);
      const c = { id: uid(), thing, checked_at: new Date().toISOString(), source: "web" };
      state.checks.unshift(c);
      out.lines.push(`Got it: ${thing}, ${whenSaid(c.checked_at, tz)}. Ask me "did I…?" anytime.`);
    } else if (item.intent === "check_question") {
      const c = bestOverlap(state.checks as unknown as Check[], item.thing, (x) => x.thing);
      if (!c) out.lines.push(`I don't have a record of that. Next time, log "${item.thing}" when you check and I'll keep the receipt.`);
      else if (Date.now() - Date.parse(c.checked_at) < 18 * 3600e3) out.lines.push(`Yes. You logged "${c.thing}" ${whenSaid(c.checked_at, tz)} (${agoSaid(c.checked_at)}).`);
      else out.lines.push(`Not today. The last time you logged "${c.thing}" was ${whenSaid(c.checked_at, tz)}.`);
    } else if (item.intent === "new_routine") {
      const today = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
      const spec = item.routine;
      const r = {
        id: uid(), user_id: DEMO_USER, ...spec, start_date: spec.start_date ?? today, remind_by_text: true,
        nudged_at: null, followed_up: false, active: true, created_at: new Date().toISOString(),
      } as unknown as Routine;
      r.next_due_at = firstDue(r, tz).toISOString();
      state.routines.push(r as unknown as Row);
      out.lines.push(`Set up "${r.name}": ${describeSchedule(r).toLowerCase()}. See it under Rhythms.`);
    }
  }
  if (out.captures.length && !out.tip) out.tip = packet("capture", t);
  return out;
}

export function makeDemoFetch(state: DemoState, tz: string): typeof fetch {
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

  return async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.pathname : input.url;
    const path = url.replace(/^https?:\/\/[^/]+/, "");
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    let m: RegExpMatchArray | null;

    if (path === "/api/capture") {
      const text = String(body.text ?? "").trim();
      if (!text) return json({ error: "Write something to capture." }, 400);
      return json(handleMessage(state, text, tz));
    }
    if ((m = path.match(/^\/api\/captures\/([^/]+)\/tend$/))) {
      const c = state.captures.find((x) => x.id === m![1] && x.status === "open");
      if (!c) return json({ ok: false });
      Object.assign(c, { status: "done", completed_at: new Date().toISOString() });
      const g = grow(state, SPECIES_FOR_KIND[c.kind as Capture["kind"]]);
      const p = state.profiles[0];
      return json({ ok: true, ...g, streak: p.streak_days, tip: packet("grow", String(c.title), g.species) });
    }
    if ((m = path.match(/^\/api\/captures\/([^/]+)\/resort$/))) {
      const c = state.captures.find((x) => x.id === m![1]);
      if (!c) return json({ error: "That capture no longer exists." }, 404);
      Object.assign(c, { kind: body.kind, list_name: body.kind === "list" ? String(body.list_name || "misc").toLowerCase() : null });
      return json({ capture: { ...c } });
    }
    if ((m = path.match(/^\/api\/actions\/([^/]+)$/))) {
      const a = state.actions.find((x) => x.id === m![1]);
      if (a) a.status = body.status;
      return json({ ok: true });
    }
    if (path === "/api/routines") {
      const name = String(body.name ?? "").trim();
      if (!name) return json({ error: "Give it a name, like “morning meds”." }, 400);
      if (body.frequency === "weekly" && !(body.days_of_week ?? []).length) return json({ error: "Pick at least one day." }, 400);
      const today = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
      const items = String(body.checklist ?? "").split(/[,\n]/).map((s: string) => s.trim()).filter(Boolean);
      if (body.kind === "checklist" && !items.length) return json({ error: "Add the things to check, separated by commas." }, 400);
      const r = {
        id: uid(), user_id: DEMO_USER, name, kind: body.kind, frequency: body.frequency,
        times: body.times?.length ? body.times : ["09:00"], days_of_week: body.days_of_week ?? [],
        interval_days: body.frequency === "every_n_days" ? Number(body.interval_days) || 30 : null,
        start_date: body.start_date || today, checklist_items: body.kind === "checklist" ? items : [],
        remind_by_text: body.remind_by_text !== false, nudged_at: null, followed_up: false, active: true,
      } as unknown as Routine;
      r.next_due_at = firstDue(r, tz).toISOString();
      state.routines.push(r as unknown as Row);
      return json({ routine: r });
    }
    if ((m = path.match(/^\/api\/routines\/([^/]+)\/log$/))) {
      const r = state.routines.find((x) => x.id === m![1]) as unknown as Routine | undefined;
      if (!r) return json({ error: "That routine no longer exists." }, 404);
      const grew = logRoutine(state, r, body.status, tz);
      const tip = body.status === "done" ? packet("grow", r.name, "herb") : null;
      return json({ routine: { ...state.routines.find((x) => x.id === r.id) }, grew, tip });
    }
    return json({ error: "Not available in the demo." }, 404);
  };
}
