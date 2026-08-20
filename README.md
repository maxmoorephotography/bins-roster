# 47 Yorston Street — Kerbside Bin Roster

A small static site that fairly rotates the weekly job of taking the
common-area bins to the kerb (and back) between 5 townhouses, plus a
free weekly email reminder to whoever's on duty.

- 3 red general-waste bins and 3 yellow recycling bins, collected on
  alternate weeks
- 1 green food & garden bin, collected every week
- Council collection is **Thursday 7:00 AM**. Bins go out **Wednesday
  afternoon/evening** and come back **any time Thursday** after pickup.
- **Two townhouses on duty per week**, rotating through all 5 — a
  deliberate buffer, so if one household forgets or is away, the
  other still gets a minimum of two bins to the kerb.
- No database, no login, no paid services

## File structure

```
47-yorston-bin-roster/
├── netlify.toml                     # build + weekly scheduled function
├── package.json                     # nodemailer dependency for the function
├── .env.example                     # env var template (copy into Netlify, don't commit real values)
├── .gitignore
├── public/                          # the site Netlify publishes
│   ├── index.html
│   ├── styles.css
│   ├── app.js
│   └── roster-config.json           # <-- edit THIS to change townhouses/dates
├── shared/
│   └── rosterLogic.mjs              # roster math, used by both the site and the function
├── netlify/
│   └── functions/
│       └── send-reminder.mjs        # scheduled weekly reminder email
└── data/
    ├── residents.example.json       # example only — real emails live in Netlify env vars
    ├── unit-tokens.json              # real per-unit secret tokens — see "Calendar subscription privacy" below
    └── unit-tokens.example.json      # template
```

## Calendar subscription privacy

Each townhouse's calendar feed is protected by a secret token in
`data/unit-tokens.json`. This file lives outside `public/`, so it's
never sent to anyone's browser — only the Netlify function reads it.

A resident's personal subscribe link is:

```
https://<your-site>.netlify.app/?unit=th1&token=<their token from data/unit-tokens.json>
```

Send each resident **only their own link** (text/email), not a link
to the homepage. When they open it, the site shows just their unit's
subscribe button — the homepage itself doesn't list anyone's link.
If someone edits `?unit=th1` to `?unit=th2` without also knowing
th2's token, the calendar feed rejects the request (403).

To rotate a token (e.g. a unit changes hands), edit
`data/unit-tokens.json`, commit, and resend that resident's new link
— their old link stops working immediately.

## How the roster is calculated

Everything is driven by `public/roster-config.json`:

```json
{
  "rosterStartDate": "2026-08-20",   // a Thursday — first pickup of the duty cycle
  "redWeekStartDate": "2026-08-20",  // a Thursday that is a RED + green collection
  "pickupDay": "Thursday",
  "pickupTime": "7:00 AM",
  "units": [ ... 5 townhouses ... ]
}
```

- A "week" is identified by its Thursday pickup date (the days
  Friday through Thursday belong together).
- **Two townhouses are on duty each week** — the roster steps
  forward by one townhouse per week (week 1: TH1 & TH2, week 2: TH2
  & TH3, week 3: TH3 & TH4 …), looping back to TH1 after TH5. Over a
  5-week cycle every townhouse does 2 weeks of duty — equal shares,
  with a same-week partner as backup.
- Red + green is due from `redWeekStartDate` (20 August 2026);
  yellow + green is due the alternate week.
- The green bin is always due.

To change townhouse names, or shift the roster's starting date,
edit this one file, commit, and Netlify redeploys automatically —
no code changes needed.

## Deploying to Netlify (free tier)

1. Push this folder to a **GitHub repository** (keep it private if
   you'd rather not have townhouse numbers/roster dates public).
2. In Netlify: **Add new site → Import an existing project** → pick
   the repo. Build command: leave blank. Publish directory: `public`.
   Netlify will pick up `netlify.toml` automatically.
3. Deploy. You'll get a free `*.netlify.app` URL — share that with
   residents (or add a custom domain later, also free on Netlify's
   free tier if you own one).

## Setting up the free weekly email reminder

The reminder function uses a **free Gmail account** as the sender —
no paid email service required, and Gmail's free sending limit
(~500/day) is far more than 5 townhouses need.

1. Create a dedicated Gmail account, e.g. `47yorstonbins@gmail.com`.
2. Turn on 2-Step Verification on that account, then generate an
   **App Password** (Google Account → Security → App passwords).
3. In Netlify → **Site settings → Environment variables**, add:
   - `GMAIL_USER` — the Gmail address
   - `GMAIL_APP_PASSWORD` — the app password from step 2
   - `RESIDENTS_JSON` — a JSON object mapping each townhouse id to
     their email, e.g. `{"th1":"...", "th2":"...", ...}`
   - `SITE_URL` — your Netlify site URL (optional, included in the email)
4. Redeploy. `netlify/functions/send-reminder.mjs` is already
   scheduled to run weekly (see `netlify.toml`) and will email
   **both** townhouses on duty for the coming week.

**Never commit real resident email addresses to the repo.** They
belong only in the Netlify environment variable, which is why
`data/residents.json` is git-ignored — `residents.example.json` is
just there to show the shape.

### Adjusting the reminder time

`netlify.toml` schedules the function in UTC. `0 20 * * 1` means
Monday 20:00 UTC, which lands early-to-mid Tuesday in Sydney (giving
a day or two of notice before Wednesday's bin-out) — but the exact
local time shifts with daylight saving (AEST/AEDT), since Netlify's
scheduler doesn't do timezone conversion. Nudge the hour/day in
`netlify.toml` if you want the email to land at a different local time.

## Local preview

No build step is required — `public/` is plain HTML/CSS/JS. You can
open `public/index.html` in a local server (e.g. `npx serve public`)
to preview; opening it directly via `file://` will block the
`fetch()` call for the config file in some browsers.
