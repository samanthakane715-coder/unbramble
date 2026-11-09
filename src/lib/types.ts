export type Kind = "note" | "list" | "reminder" | "task";
export type Theme = "earth" | "dusk" | "dazzle";
export type Species = "fern" | "wildflower" | "sunflower" | "sprout" | "moonflower" | "herb";

export interface Capture {
  id: string;
  user_id: string;
  raw_text: string;
  kind: Kind;
  title: string | null;
  list_name: string | null;
  remind_at: string | null;
  status: "open" | "done" | "archived";
  source: "web" | "sms";
  created_at: string;
  completed_at: string | null;
}

export interface Plant {
  id: string;
  species: Species;
  stage: number;
  growth: number;
  plot_x: number;
  plot_y: number;
  season: number;
  bloomed_at: string | null;
}

export interface Profile {
  id: string;
  display_name: string | null;
  phone: string | null;
  link_code: string | null;
  theme: Theme;
  timezone: string;
  growth_points: number;
  season: number;
  streak_days: number;
  last_tended_on: string | null;
  tips_enabled: boolean;
}

export interface Action {
  id: string;
  capture_id: string | null;
  action_type: "sms_reminder" | "calendar_event" | "email_draft";
  status: "suggested" | "approved" | "done" | "dismissed";
  payload: Record<string, string>;
}

/** Which plant a kind of capture grows when it's tended */
export const SPECIES_FOR_KIND: Record<Kind, Species> = {
  note: "fern",
  list: "wildflower",
  reminder: "sunflower",
  task: "moonflower",
};

export const KIND_LABEL: Record<Kind, string> = {
  note: "Note",
  list: "List item",
  reminder: "Reminder",
  task: "To-do",
};

export const BLOOMS_PER_SEASON = 12;
