import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Kind } from "./types";

export interface Sorted {
  kind: Kind;
  title: string;
  list_name: string | null;
  remind_at: string | null; // ISO 8601 with offset
  confidence: number;
}

const MODEL = "claude-haiku-5-5";

const SORT_TOOL = {
  name: "file_captures",
  description: "File each separate thing the person wrote into the right place.",
  input_schema: {
    type: "object" as const,
    properties: {
      items: {
        type: "array",
        items: {
          type: "object",
          properties: {
            kind: { type: "string", enum: ["note", "list", "reminder", "task"] },
            title: { type: "string", description: "Short, clean wording of the item, in the person's own voice" },
            list_name: { type: ["string", "null"], description: "For kind=list: which list (e.g. groceries). Reuse existing list names." },
            remind_at: { type: ["string", "null"], description: "For kind=reminder: ISO 8601 datetime with timezone offset" },
            confidence: { type: "number", description: "0 to 1" },
          },
          required: ["kind", "title", "list_name", "remind_at", "confidence"],
        },
      },
    },
    required: ["items"],
  },
};

/**
 * Sort raw text into notes, list items, reminders and to-dos.
 * Learns from this person's past corrections, which are passed as examples.
 */
export async function sortCapture(
  db: SupabaseClient,
  userId: string,
  text: string,
  timezone: string
): Promise<Sorted[]> {
  if (!process.env.ANTHROPIC_API_KEY) return [fallbackSort(text)];

  const [{ data: corrections }, { data: lists }] = await Promise.all([
    db.from("corrections").select("raw_text, to_kind, to_list")
      .eq("user_id", userId).order("created_at", { ascending: false }).limit(25),
    db.from("captures").select("list_name")
      .eq("user_id", userId).eq("kind", "list").not("list_name", "is", null).limit(200),
  ]);

  const listNames = [...new Set((lists ?? []).map((l) => l.list_name as string))];
  const now = new Date().toLocaleString("en-US", { timeZone: timezone, dateStyle: "full", timeStyle: "short" });
  const learned = (corrections ?? [])
    .map((c) => `- "${c.raw_text}" → ${c.to_kind}${c.to_list ? ` (list: ${c.to_list})` : ""}`)
    .join("\n");

  const system = [
    "You sort quick brain-dump messages for a personal capture app called Unbramble.",
    "Split a message into separate items when it clearly holds several (e.g. 'eggs, milk, call mom tmrw').",
    "note = an idea or thought to keep; list = an item for a named list; reminder = something tied to a time; task = something to do with no set time.",
    `Right now it is ${now} in the person's timezone (${timezone}). Resolve relative times like "tmrw at 3" into an exact datetime with offset.`,
    listNames.length ? `Their existing lists: ${listNames.join(", ")}. Reuse these names when they fit.` : "",
    learned ? `This person has corrected your sorting before. Follow their habits:\n${learned}` : "",
  ].filter(Boolean).join("\n\n");

  try {
    const client = new Anthropic();
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system,
      tools: [SORT_TOOL],
      tool_choice: { type: "tool", name: SORT_TOOL.name },
      messages: [{ role: "user", content: text }],
    });
    const block = res.content.find((b) => b.type === "tool_use");
    const items = (block && "input" in block ? (block.input as { items: Sorted[] }).items : []) ?? [];
    return items.length ? items.map(clean) : [fallbackSort(text)];
  } catch (err) {
    console.error("sortCapture failed, using fallback", err);
    return [fallbackSort(text)];
  }
}

function clean(item: Sorted): Sorted {
  const kind: Kind = ["note", "list", "reminder", "task"].includes(item.kind) ? item.kind : "note";
  const remind = item.remind_at && !isNaN(Date.parse(item.remind_at)) ? item.remind_at : null;
  return {
    kind: kind === "reminder" && !remind ? "task" : kind,
    title: (item.title || "").slice(0, 280),
    list_name: kind === "list" ? (item.list_name || "misc").toLowerCase().slice(0, 40) : null,
    remind_at: kind === "reminder" ? remind : null,
    confidence: Math.max(0, Math.min(1, Number(item.confidence) || 0.5)),
  };
}

/** Simple keyword sort for when no AI key is set yet. */
export function fallbackSort(text: string): Sorted {
  const t = text.trim();
  const lower = t.toLowerCase();
  if (/^(buy|get|grocer|add .* to)/.test(lower)) {
    return { kind: "list", title: t, list_name: "groceries", remind_at: null, confidence: 0.3 };
  }
  if (/\b(remind|tomorrow|tmrw|tonight|at \d)/.test(lower)) {
    return { kind: "task", title: t, list_name: null, remind_at: null, confidence: 0.3 };
  }
  if (/^(call|email|text|pay|book|schedule|send|fix|clean)\b/.test(lower)) {
    return { kind: "task", title: t, list_name: null, remind_at: null, confidence: 0.3 };
  }
  return { kind: "note", title: t, list_name: null, remind_at: null, confidence: 0.3 };
}

/** Insert sorted items and any suggested actions. Returns inserted capture rows. */
export async function saveSorted(
  db: SupabaseClient,
  userId: string,
  raw: string,
  items: Sorted[],
  source: "web" | "sms"
) {
  const rows = items.map((i) => ({
    user_id: userId,
    raw_text: raw,
    kind: i.kind,
    title: i.title || raw,
    list_name: i.list_name,
    remind_at: i.remind_at,
    source,
    ai_confidence: i.confidence,
  }));
  const { data, error } = await db.from("captures").insert(rows).select();
  if (error) throw error;

  // Suggest actions: reminders can go to your calendar; to-dos mentioning email get a draft
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
