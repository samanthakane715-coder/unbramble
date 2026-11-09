import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Kind } from "./types";
import type { Frequency } from "./schedule";

export const MODEL = "claude-haiku-5-5";

export interface Sorted {
  kind: Kind;
  title: string;
  list_name: string | null;
  remind_at: string | null; // ISO 8601 with offset
  confidence: number;
}

export interface RoutineSpec {
  name: string;
  kind: "meds" | "chore" | "checklist";
  frequency: Frequency;
  times: string[];
  days_of_week: number[];
  interval_days: number | null;
  start_date: string | null;
  checklist_items: string[];
}

export type Understood =
  | ({ intent: "capture" } & Sorted)
  | { intent: "log_routine"; routine_name: string; status: "done" | "skipped" }
  | { intent: "check_done"; thing: string }
  | { intent: "check_question"; thing: string }
  | { intent: "new_routine"; routine: RoutineSpec };

const TOOL = {
  name: "understand_message",
  description: "Break the person's message into separate items and say what each one is.",
  input_schema: {
    type: "object" as const,
    properties: {
      items: {
        type: "array",
        items: {
          type: "object",
          properties: {
            intent: {
              type: "string",
              enum: ["capture", "log_routine", "check_done", "check_question", "new_routine"],
              description:
                "capture = a note, list item, reminder or to-do to keep. " +
                "log_routine = they did or skipped one of their routines (e.g. 'took my meds'). " +
                "check_done = they're logging that they checked something for peace of mind (e.g. 'unplugged the curling iron', 'stove off', 'locked the door'). " +
                "check_question = they're asking whether they did such a check (e.g. 'did I turn off the stove?'). " +
                "new_routine = they want a repeating nudge (daily meds, refill every 30 days, yearly physical, weekly trash night, a before-I-leave checklist).",
            },
            kind: { type: ["string", "null"], enum: ["note", "list", "reminder", "task", null] },
            title: { type: ["string", "null"], description: "For capture: short clean wording in their voice" },
            list_name: { type: ["string", "null"] },
            remind_at: { type: ["string", "null"], description: "For capture reminders: ISO 8601 with offset" },
            confidence: { type: ["number", "null"] },
            routine_name: { type: ["string", "null"], description: "For log_routine: which of their routines (use the exact existing name)" },
            status: { type: ["string", "null"], enum: ["done", "skipped", null] },
            thing: { type: ["string", "null"], description: "For checks: short phrase like 'curling iron unplugged'. Reuse an existing check phrase when it's the same thing." },
            routine: {
              type: ["object", "null"],
              properties: {
                name: { type: "string", description: "Short friendly name, e.g. 'morning meds', 'refill prescription', 'annual physical'" },
                kind: { type: "string", enum: ["meds", "chore", "checklist"] },
                frequency: { type: "string", enum: ["daily", "weekly", "every_n_days", "monthly", "yearly"] },
                times: { type: "array", items: { type: "string" }, description: "Local times as HH:MM 24h. Default ['09:00']" },
                days_of_week: { type: "array", items: { type: "integer" }, description: "0=Sun..6=Sat, weekly only" },
                interval_days: { type: ["integer", "null"] },
                start_date: { type: ["string", "null"], description: "YYYY-MM-DD local; for monthly/yearly the anchor date" },
                checklist_items: { type: "array", items: { type: "string" } },
              },
              required: ["name", "kind", "frequency", "times", "days_of_week", "interval_days", "start_date", "checklist_items"],
            },
          },
          required: ["intent"],
        },
      },
    },
    required: ["items"],
  },
};

/**
 * Work out what each part of a message is. Learns from the person's past corrections,
 * and knows their routines and usual checks so it can match them.
 */
export async function understand(
  db: SupabaseClient,
  userId: string,
  text: string,
  timezone: string
): Promise<Understood[]> {
  if (!process.env.ANTHROPIC_API_KEY) return fallbackUnderstand(text);

  const [{ data: corrections }, { data: lists }, { data: routines }, { data: checks }] = await Promise.all([
    db.from("corrections").select("raw_text, to_kind, to_list").eq("user_id", userId)
      .order("created_at", { ascending: false }).limit(25),
    db.from("captures").select("list_name").eq("user_id", userId).eq("kind", "list")
      .not("list_name", "is", null).limit(200),
    db.from("routines").select("name, kind").eq("user_id", userId).eq("active", true),
    db.from("checks").select("thing").eq("user_id", userId).order("checked_at", { ascending: false }).limit(60),
  ]);

  const listNames = [...new Set((lists ?? []).map((l) => l.list_name as string))];
  const checkThings = [...new Set((checks ?? []).map((c) => c.thing as string))];
  const now = new Date().toLocaleString("en-US", { timeZone: timezone, dateStyle: "full", timeStyle: "short" });
  const learned = (corrections ?? [])
    .map((c) => `- "${c.raw_text}" → ${c.to_kind}${c.to_list ? ` (list: ${c.to_list})` : ""}`)
    .join("\n");

  const system = [
    "You read quick messages for Unbramble, a personal capture app, and file each part correctly.",
    "Split a message into separate items when it clearly holds several.",
    "For captures: note = an idea to keep; list = an item for a named list; reminder = a one-time thing tied to a time; task = something to do with no set time.",
    "A one-time appointment is a capture reminder. Something that repeats is a new_routine.",
    `Right now it is ${now} in the person's timezone (${timezone}). Resolve relative times into exact datetimes with offset.`,
    listNames.length ? `Their lists: ${listNames.join(", ")}.` : "",
    routines?.length ? `Their routines: ${routines.map((r) => `${r.name} (${r.kind})`).join(", ")}.` : "They have no routines yet.",
    checkThings.length ? `Checks they've logged before: ${checkThings.join("; ")}.` : "",
    learned ? `They've corrected your sorting before. Follow their habits:\n${learned}` : "",
  ].filter(Boolean).join("\n\n");

  try {
    const client = new Anthropic();
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 1500,
      system,
      tools: [TOOL],
      tool_choice: { type: "tool", name: TOOL.name },
      messages: [{ role: "user", content: text }],
    });
    const block = res.content.find((b) => b.type === "tool_use");
    const raw = (block && "input" in block ? (block.input as { items: Record<string, unknown>[] }).items : []) ?? [];
    const items = raw.map((r) => cleanItem(r, text)).filter(Boolean) as Understood[];
    return items.length ? items : fallbackUnderstand(text);
  } catch (err) {
    console.error("understand failed, using fallback", err);
    return fallbackUnderstand(text);
  }
}

function cleanItem(r: Record<string, unknown>, raw: string): Understood | null {
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  switch (r.intent) {
    case "log_routine":
      return { intent: "log_routine", routine_name: str(r.routine_name), status: r.status === "skipped" ? "skipped" : "done" };
    case "check_done":
      return str(r.thing) ? { intent: "check_done", thing: str(r.thing).toLowerCase().slice(0, 80) } : null;
    case "check_question":
      return str(r.thing) ? { intent: "check_question", thing: str(r.thing).toLowerCase().slice(0, 80) } : null;
    case "new_routine": {
      const s = r.routine as Partial<RoutineSpec> | null;
      if (!s?.name || !s.frequency) return null;
      const times = (s.times ?? []).filter((t) => /^\d{1,2}:\d{2}$/.test(t)).map((t) => t.padStart(5, "0"));
      return {
        intent: "new_routine",
        routine: {
          name: s.name.slice(0, 60),
          kind: ["meds", "chore", "checklist"].includes(s.kind as string) ? (s.kind as RoutineSpec["kind"]) : "chore",
          frequency: s.frequency,
          times: times.length ? times : ["09:00"],
          days_of_week: (s.days_of_week ?? []).filter((d) => d >= 0 && d <= 6),
          interval_days: s.interval_days ? Math.max(1, Math.min(365, s.interval_days)) : null,
          start_date: s.start_date && /^\d{4}-\d{2}-\d{2}$/.test(s.start_date) ? s.start_date : null,
          checklist_items: (s.checklist_items ?? []).map((x) => String(x).slice(0, 60)).slice(0, 12),
        },
      };
    }
    default: {
      const kind: Kind = ["note", "list", "reminder", "task"].includes(r.kind as string) ? (r.kind as Kind) : "note";
      const remind = str(r.remind_at) && !isNaN(Date.parse(str(r.remind_at))) ? str(r.remind_at) : null;
      return {
        intent: "capture",
        kind: kind === "reminder" && !remind ? "task" : kind,
        title: (str(r.title) || raw).slice(0, 280),
        list_name: kind === "list" ? (str(r.list_name) || "misc").toLowerCase().slice(0, 40) : null,
        remind_at: kind === "reminder" ? remind : null,
        confidence: Math.max(0, Math.min(1, Number(r.confidence) || 0.5)),
      };
    }
  }
}

/** Simple rules for when no AI key is set yet. */
export function fallbackUnderstand(text: string): Understood[] {
  const t = text.trim();
  const lower = t.toLowerCase();
  if (/^did i\b/.test(lower)) {
    return [{ intent: "check_question", thing: lower.replace(/^did i\s+/, "").replace(/\?+$/, "") }];
  }
  if (/^(took|taken|i took)\b.*\b(meds|pills|medication|vitamins)\b/.test(lower)) {
    return [{ intent: "log_routine", routine_name: "", status: "done" }];
  }
  if (/^(i )?(unplugged|turned off|switched off|locked|closed|shut)\b/.test(lower)) {
    return [{ intent: "check_done", thing: lower.replace(/^i\s+/, "").slice(0, 80) }];
  }
  return [{ intent: "capture", ...fallbackSort(t) }];
}

export function fallbackSort(text: string): Sorted {
  const t = text.trim();
  const lower = t.toLowerCase();
  if (/^(buy|get|grocer|add .* to)/.test(lower)) {
    return { kind: "list", title: t, list_name: "groceries", remind_at: null, confidence: 0.3 };
  }
  if (/^(call|email|text|pay|book|schedule|send|fix|clean|remind)\b/.test(lower) || /\b(tomorrow|tmrw|tonight)\b/.test(lower)) {
    return { kind: "task", title: t, list_name: null, remind_at: null, confidence: 0.3 };
  }
  return { kind: "note", title: t, list_name: null, remind_at: null, confidence: 0.3 };
}

/** Insert sorted captures and any suggested actions. Returns inserted rows. */
export async function saveSorted(
  db: SupabaseClient,
  userId: string,
  raw: string,
  items: Sorted[],
  source: "web" | "sms"
) {
  if (!items.length) return [];
  const rows = items.map((i) => ({
    user_id: userId, raw_text: raw, kind: i.kind, title: i.title || raw,
    list_name: i.list_name, remind_at: i.remind_at, source, ai_confidence: i.confidence,
  }));
  const { data, error } = await db.from("captures").insert(rows).select();
  if (error) throw error;

  const actions = (data ?? []).flatMap((c) => {
    const out: { user_id: string; capture_id: string; action_type: string; payload: object }[] = [];
    if (c.kind === "reminder" && c.remind_at) {
      out.push({ user_id: userId, capture_id: c.id, action_type: "calendar_event", payload: { title: c.title, start: c.remind_at } });
    }
    if (c.kind === "task" && /\bemail\b/i.test(c.title ?? "")) {
      out.push({ user_id: userId, capture_id: c.id, action_type: "email_draft", payload: { subject: c.title } });
    }
    return out;
  });
  if (actions.length) await db.from("actions").insert(actions);
  return data ?? [];
}
