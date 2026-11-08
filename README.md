# Unbramble

Text or type whatever's on your mind. Unbramble sorts it into reminders, to-dos, lists and notes, learns from how you re-sort things, and grows a garden as you finish them.

## How it fits together

| Piece | Where it lives |
|---|---|
| Web app (Next.js) | `src/app`, hosted on **Vercel** |
| Database + sign-in | **Supabase** project `itgdrdyebvqotpxsncem` |
| Sorting + learning | Claude API (`src/lib/classify.ts`) |
| Texting in + reminders | **Twilio** webhook `src/app/api/sms`, reminder sender `src/app/api/cron/reminders` |

### Garden rules
- Finishing a note grows a fern, a list item a wildflower, a reminder a sunflower, a to-do a moonflower.
- Every 3 tends grows a plant one stage; stage 4 is a bloom. Plants never wilt.
- When 12 plants bloom, press the season into your Album and start a fresh bed.

### Learning
When you move something (say a "note" into your groceries list), Unbramble saves that correction and includes your recent corrections whenever it sorts new captures.

## Setup checklist

1. **Vercel environment variables** (Project → Settings → Environment Variables). See `.env.example` for the full list.
2. **Supabase auth URLs**: Authentication → URL Configuration → set Site URL to your Vercel URL and add `https://YOUR-URL/auth/callback` to Redirect URLs.
3. **Twilio**: buy a number, then under that number's Messaging settings set "A message comes in" to `https://YOUR-URL/api/sms` (HTTP POST).
4. **Reminder texts**: a Supabase scheduled job calls `/api/cron/reminders` every 5 minutes.

## Run locally

```bash
npm install
cp .env.example .env.local   # fill in values
npm run dev
```
