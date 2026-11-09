import Anthropic from "@anthropic-ai/sdk";
import { MODEL } from "./classify";

import { hackFor, factFor, type Tip } from "./tipsData";

export { hackFor, factFor, type Tip } from "./tipsData";

/**
 * Pick a seed packet for a moment in the app.
 * - after capturing: a matching hack if one fits (AI fills in when nothing curated matches)
 * - after tending/growing: a fun fact about that plant, or a hack for what was finished
 */
export async function seedPacket(moment: "capture" | "grow", text: string, species?: string): Promise<Tip | null> {
  const hack = hackFor(text);
  if (moment === "grow") return hack && Math.random() < 0.4 ? hack : factFor(species);
  if (hack) return hack;
  return aiHack(text);
}

async function aiHack(text: string): Promise<Tip | null> {
  if (!process.env.ANTHROPIC_API_KEY || Math.random() < 0.5) return null;
  try {
    const client = new Anthropic();
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 120,
      system:
        "Give one short, practical, well-known life hack (under 25 words) related to what the person just wrote down. " +
        "Keep it general and uncontroversial. No medical, legal, financial or safety-critical advice, no product names, no made-up statistics. " +
        "Write it as a plain sentence, no preamble. If nothing genuinely useful fits, reply with exactly NONE.",
      messages: [{ role: "user", content: text.slice(0, 500) }],
    });
    const out = res.content.find((b) => b.type === "text");
    const tip = out && "text" in out ? out.text.trim() : "";
    return tip && tip !== "NONE" && tip.length < 220 ? { type: "hack", text: tip } : null;
  } catch {
    return null;
  }
}
