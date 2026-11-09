/** Curated, browser-safe seed packets: life hacks and hand-checked fun facts. */

export interface Tip { type: "hack" | "fact"; text: string }

/** Life hacks matched to what someone captured. Practical, general, nothing medical beyond habit-building. */
const HACKS: { match: RegExp; tips: string[] }[] = [
  { match: /\b(refill|pharmac|prescription|rx)\b/i, tips: [
    "Many pharmacies offer auto-refill and a text when it's ready. Ask at your next pickup.",
    "Ask your insurer whether a 90-day supply is covered. Fewer trips, fewer chances to run out.",
    "Set the refill nudge for when you have about a week left, not the last day.",
  ]},
  { match: /\b(meds?|pills?|medication|vitamins?|dose)\b/i, tips: [
    "Habit stacking: keep them next to something you already use daily, like your toothbrush or coffee mug.",
    "A weekly pill organizer turns 'did I take it?' into a quick glance.",
    "Same time, same place every day makes it automatic faster than willpower ever will.",
  ]},
  { match: /\b(dentist|doctor|dr\.?|appointment|appt|physical|checkup|vet)\b/i, tips: [
    "Book the next appointment before you leave the current one. Future you will thank you.",
    "Jot your questions in a note the day before so you don't blank in the room.",
    "Ask for the first slot of the day. It's the least likely to be running late.",
  ]},
  { match: /\b(curling iron|straightener|flat iron|stove|oven|iron|candle|space heater)\b/i, tips: [
    "Snap a photo of the unplugged cord or the off knob on your way out. Your camera roll becomes proof.",
    "Plug hot tools into an outlet timer or smart plug so they switch themselves off.",
    "Point at it and say it out loud: 'stove is off.' Naming the action helps your memory store it.",
  ]},
  { match: /\b(lock|locked|door|keys?|garage)\b/i, tips: [
    "Give your keys one home, like a hook or bowl by the door, and never set them anywhere else.",
    "Touch the handle and say 'locked' out loud. Small rituals make memories stick.",
  ]},
  { match: /\b(grocer|milk|eggs|bread|produce|costco|trader joe)/i, tips: [
    "Order your grocery list by store section. Your trip gets noticeably faster.",
    "Snap a photo of your fridge before you shop. No more buying a third jar of mustard.",
  ]},
  { match: /\b(pay|bill|rent|hoa|invoice|mortgage)\b/i, tips: [
    "Turn on autopay for fixed bills and a calendar reminder for the ones that change.",
    "Ask billers to move due dates so most land in the same week. One money session, done.",
  ]},
  { match: /\b(email|inbox|reply)\b/i, tips: [
    "If a reply takes under two minutes, do it now. Otherwise, capture it and let it go.",
    "Write the email's subject line as the ask: 'Can you confirm by Friday?'",
  ]},
  { match: /\b(call|phone)\b/i, tips: [
    "Batch your calls: knock them all out in one 20-minute window.",
  ]},
  { match: /\b(laundry|wash|dishes|clean|vacuum|trash|recycling)\b/i, tips: [
    "Set a 15-minute timer and race it. Chores shrink when they have an end.",
    "Pair a dull chore with a podcast you only allow yourself during chores.",
  ]},
  { match: /\b(flight|trip|travel|pack|passport)\b/i, tips: [
    "Keep a reusable packing list in Unbramble and tick it off every trip.",
    "Screenshot boarding passes and confirmations so they work without signal.",
  ]},
  { match: /\b(birthday|gift|anniversary)\b/i, tips: [
    "Keep a running gift-idea list per person. Ideas show up months before the date does.",
  ]},
  { match: /\b(sleep|bed|tired)\b/i, tips: [
    "Keeping the same wake-up time, even on weekends, steadies your sleep more than a fixed bedtime.",
  ]},
];

/** Fun facts, garden-first. All well established; keep additions verifiable. */
const FACTS: { species?: string; text: string }[] = [
  { species: "fern", text: "Ferns reproduce with spores, not seeds, and their family tree is far older than the dinosaurs." },
  { species: "fern", text: "A new fern frond unrolls from a tight coil called a fiddlehead." },
  { species: "sunflower", text: "Young sunflowers follow the sun across the sky. Once they bloom, most settle facing east." },
  { species: "sunflower", text: "A sunflower head is hundreds to thousands of tiny flowers packed together, arranged in spirals that follow Fibonacci numbers." },
  { species: "moonflower", text: "Moonflowers open at dusk and close by morning, which suits night-flying moths that pollinate them." },
  { species: "wildflower", text: "Bees can see ultraviolet, so many petals carry landing-strip patterns we can't see at all." },
  { species: "wildflower", text: "Some wildflower seeds need a cold winter before they'll sprout. Gardeners call it stratification." },
  { species: "herb", text: "Rosemary was officially moved into the sage genus in 2017. Its proper name is now Salvia rosmarinus." },
  { species: "herb", text: "Lavender, basil, rosemary and mint are all members of the same mint family." },
  { species: "herb", text: "Basil's name comes from the Greek word for royal." },
  { species: "herb", text: "Mint spreads by underground runners, which is why gardeners plant it in pots." },
  { text: "The earthy smell after rain has a name, petrichor, and much of it comes from a compound made by soil bacteria." },
  { text: "Botanically, bananas are berries and strawberries are not." },
  { text: "Peanuts aren't nuts. They're legumes, closer to peas and beans." },
  { text: "Some bamboo species can grow almost a meter in a single day." },
  { text: "Unfinished tasks tend to keep nagging at your memory. Research suggests simply writing down a plan for them helps your mind let go." },
  { text: "Japanese train staff point at signals and call them out loud. The ritual measurably cuts mistakes, and it works for stoves and door locks too." },
];

const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];

/** A hack that fits the text, if we have one. */
export function hackFor(text: string): Tip | null {
  const hit = HACKS.find((h) => h.match.test(text));
  return hit ? { type: "hack", text: pick(hit.tips) } : null;
}

export function factFor(species?: string): Tip {
  const matching = species ? FACTS.filter((f) => f.species === species) : [];
  return { type: "fact", text: pick(matching.length && Math.random() < 0.7 ? matching : FACTS).text };
}

