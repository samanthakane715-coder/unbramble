# Unbramble

Text or type whatever's on your mind. Unbramble sorts it into reminders, to-dos, lists and notes, learns from how you re-sort things, and grows a garden as you finish them.

## How it fits together

| Piece | Where it lives |
|---|---|
| Web app (Next.js) | `src/app`, hosted on **Vercel** |
| Database + sign-in | **Supabase** project `itgdrdyebvqotpxsncem` |
| Sorting + learning | Claude API (`src/lib/classify.ts`) |
| Texting in + reminders | **SignalWire** (`src/lib/sms.ts`): webhook `src/app/api/sms`, nudge sender `src/app/api/cron/reminders` |

### Garden rules
- Finishing a note grows a fern, a list item a wildflower, a reminder a sunflower, a to-do a moonflower.
- Every 3 tends grows a plant one stage; stage 4 is a bloom. Plants never wilt.
- When 12 plants bloom, press the season into your Album and start a fresh bed.

### Rhythms (meds, refills, appointments, checklists)
- Set up on the Rhythms page or by text ("remind me to take morning meds at 8am every day", "refill every 30 days").
- At the due time Unbramble texts a nudge; reply **DONE** or **SKIP**. One gentle follow-up after an hour. A daily dose with no answer after 12 hours is recorded as "not logged", never scolded.
- Refills count from when you mark them done, and keep a daily nudge until handled.
- Finished rhythms grow herbs in the garden.

### Did I?
- Text or log "curling iron unplugged" the moment you do it. Later ask "did I unplug the curling iron?" and get the time back.
- A "before I leave" checklist logs every item at once when you reply DONE.

### Seed packets
- Life hacks matched to what you capture (`src/lib/tips.ts`), and garden fun facts when plants grow. Facts are a hand-checked list; by text at most one a day. Toggle in Settings.

### Learning
When you move something (say a "note" into your groceries list), Unbramble saves that correction and includes your recent corrections whenever it sorts new captures.

## Setup checklist

1. **Vercel environment variables** (Project → Settings → Environment Variables). See `.env.example` for the full list.
2. **Supabase auth URLs**: Authentication → URL Configuration → set Site URL to your Vercel URL and add `https://YOUR-URL/auth/callback` to Redirect URLs.
3. **SignalWire**:
   - Create a Space, buy a local number, and register it for texting (Messaging → Campaign Registry: a brand, then a campaign; approval takes a few business days).
   - In the number's settings, handle messages with **LaML/cXML webhooks** and set the incoming-message URL to `https://YOUR-URL/api/sms` (POST).
   - Add the `SIGNALWIRE_*` values from API Credentials to Vercel (see `.env.example`). The API token needs the Messaging scope.
4. **Nudges + reminder texts**: Supabase job `unbramble-nudges` (pg_cron + pg_net) calls `/api/cron/reminders` every 5 minutes, using the `unbramble_cron_secret` vault secret, which matches `CRON_SECRET` in Vercel.

## Run locally

```bash
npm install
cp .env.example .env.local   # fill in values
npm run dev
```
