/**
 * Pure, browser-safe sorting rules. Used when no AI key is set, and by the demo.
 */
import type { Kind } from "./types";
import type { Frequency } from "./schedule";
import { zonedTime, localParts } from "./schedule";

export interface Sorted {
  kind: Kind;
  title: string;
  list_name: string | null;
  remind_at: string | null; // ISO 8601
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

const GROCERY = /\b(milk|eggs|bread|butter|cheese|yogurt|coffee|tea|lemons?|limes?|apples?|bananas?|avocados?|onions?|garlic|rice|pasta|chicken|tofu|spinach|berries|cereal|paper towels|toilet paper|dish soap|oat milk)\b/i;

/** "8am", "8:30 pm", "at 14:00" → "HH:MM" */
function findTime(lower: string): string | null {
  const m = lower.match(/\b(?:at\s*)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/) ?? lower.match(/\bat\s+(\d{1,2})(?::(\d{2}))\b/);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  if (m[3] === "pm" && h < 12) h += 12;
  if (m[3] === "am" && h === 12) h = 0;
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

function clean(s: string) {
  return s
    .replace(/^(please\s+)?(remind me (to|about)\s+|don'?t forget (to\s+)?|i need to\s+)/i, "")
    .replace(/\b(every\s+(day|morning|night|evening|\d+\s+days?|week|month|year)|daily|weekly|monthly|yearly)\b/gi, "")
    .replace(/\b(tomorrow|tmrw|tonight|today)\b/gi, "")
    .replace(/\b(at\s*)?\d{1,2}(:\d{2})?\s*(am|pm)\b/gi, "")
    .replace(/\s{2,}/g, " ").replace(/\s+([,.!?])/g, "$1").trim().replace(/[,.]$/, "");
}

/** Rule-based understanding for when the AI isn't available. */
export function fallbackUnderstand(text: string, tz = "America/Los_Angeles", now = new Date()): Understood[] {
  const t = text.trim();
  const lower = t.toLowerCase();

  if (/^did i\b/.test(lower)) {
    return [{ intent: "check_question", thing: lower.replace(/^did i\s+/, "").replace(/\?+$/, "") }];
  }
  if (/^(i\s+)?(took|taken)\b.*\b(meds|pills|medication|vitamins)\b/.test(lower)) {
    return [{ intent: "log_routine", routine_name: "", status: "done" }];
  }
  if (/^(i\s+)?(unplugged|turned off|switched off|locked|closed|shut|blew out)\b/.test(lower)) {
    return [{ intent: "check_done", thing: lower.replace(/^i\s+/, "").replace(/[.!]$/, "").slice(0, 80) }];
  }

  // Repeating things → a routine
  const time = findTime(lower);
  const everyN = lower.match(/\bevery\s+(\d+)\s+days?\b/);
  const repeat = everyN ? "every_n_days"
    : /\b(every\s+(day|morning|night|evening)|daily)\b/.test(lower) ? "daily"
    : /\b(every\s+year|yearly|annual)\b/.test(lower) ? "yearly"
    : /\b(every\s+month|monthly)\b/.test(lower) ? "monthly" : null;
  if (repeat) {
    const name = clean(t) || "my routine";
    const isMeds = /\b(meds|pills|medication|vitamins|inhaler|dose)\b/i.test(name);
    return [{
      intent: "new_routine",
      routine: {
        name, kind: isMeds ? "meds" : "chore", frequency: repeat as Frequency,
        times: [time ?? (isMeds ? "08:00" : "09:00")], days_of_week: [],
        interval_days: everyN ? Number(everyN[1]) : null, start_date: null, checklist_items: [],
      },
    }];
  }

  // One-time reminders with a time
  if (time && /\b(remind|tomorrow|tmrw|tonight|today|at)\b/.test(lower)) {
    const p = localParts(now, tz);
    const tomorrow = /\b(tomorrow|tmrw)\b/.test(lower);
    let at = zonedTime(p.y, p.m, p.d, time, tz);
    if (tomorrow || at <= now) {
      const d = new Date(Date.UTC(p.y, p.m - 1, p.d + 1));
      at = zonedTime(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), time, tz);
    }
    return [{ intent: "capture", kind: "reminder", title: clean(t) || t, list_name: null, remind_at: at.toISOString(), confidence: 0.4 }];
  }

  // Comma lists of groceries → several list items
  const parts = t.split(/\s*,\s*|\s+and\s+/).filter(Boolean);
  if (parts.length > 1 && parts.every((x) => GROCERY.test(x) || x.split(" ").length <= 2)) {
    return parts.map((x) => ({ intent: "capture" as const, kind: "list" as Kind, title: x.replace(/^(buy|get)\s+/i, ""), list_name: "groceries", remind_at: null, confidence: 0.4 }));
  }
  return [{ intent: "capture", ...fallbackSort(t) }];
}

export function fallbackSort(text: string): Sorted {
  const t = text.trim();
  const lower = t.toLowerCase();
  if (/^(buy|get|grocer|add .* to)/.test(lower) || GROCERY.test(lower) && lower.split(" ").length <= 3) {
    return { kind: "list", title: t.replace(/^(buy|get)\s+/i, ""), list_name: "groceries", remind_at: null, confidence: 0.3 };
  }
  if (/^(call|email|text|pay|book|schedule|send|fix|clean|return|order|renew|cancel|remind)\b/.test(lower) || /\b(tomorrow|tmrw|tonight)\b/.test(lower)) {
    return { kind: "task", title: clean(t) || t, list_name: null, remind_at: null, confidence: 0.3 };
  }
  return { kind: "note", title: t, list_name: null, remind_at: null, confidence: 0.3 };
}
