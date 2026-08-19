// Netlify Scheduled Function.
// Fires weekly (see netlify.toml), works out which two townhouses are
// on duty for the coming Wednesday/Thursday, and emails each of them
// a reminder via a free Gmail account.
//
// OPTIONAL / SECONDARY as of the calendar-feed addition: residents who
// subscribe to their unit's .ics feed (netlify/functions/calendar-feed.mjs)
// get reminders built into their own calendar app and don't need this.
// This function is left in place as a fallback for anyone who'd rather
// get an email and hasn't subscribed — it only fires if RESIDENTS_JSON
// is set; leave it unset to skip email reminders entirely.
//
// Required environment variables (set in Netlify → Site settings → Environment variables):
//   GMAIL_USER            e.g. 47yorstonbins@gmail.com
//   GMAIL_APP_PASSWORD    a Gmail "app password" (not the account password)
//   RESIDENTS_JSON        JSON string mapping unit id -> email, e.g.
//                          {"th1":"a@example.com","th2":"b@example.com", ...}
//   SITE_URL              (optional) link included in the email

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import nodemailer from 'nodemailer';
import { getWeekInfo } from '../../shared/rosterLogic.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function loadConfig(){
  const raw = await readFile(path.join(__dirname, '../../public/roster-config.json'), 'utf8');
  return JSON.parse(raw);
}

function loadResidents(){
  try {
    return JSON.parse(process.env.RESIDENTS_JSON || '{}');
  } catch {
    return {};
  }
}

export default async () => {
  const config = await loadConfig();
  const residents = loadResidents();

  // The function runs on a Monday, which already falls inside the
  // Friday-to-Thursday week it should be reminding people about, so
  // no date offset is needed — "now" is enough.
  const week = getWeekInfo(config, new Date());

  const generalLabel = week.binColor === 'red' ? 'red general waste' : 'yellow recycling';
  const siteUrl = process.env.SITE_URL || '';

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD
    }
  });

  const results = [];
  for (const unit of week.dutyUnits) {
    const email = residents[unit.id];
    if (!email) {
      console.log(`No email on file for ${unit.id} — skipping.`);
      continue;
    }

    const otherUnit = week.dutyUnits.find(u => u.id !== unit.id);

    await transporter.sendMail({
      from: `"${config.buildingName} Bin Roster" <${process.env.GMAIL_USER}>`,
      to: email,
      subject: `🗑️ Your bin duty week — ${unit.label}`,
      text:
`Hi ${unit.label},

You're on kerb duty this week at ${config.buildingName}, alongside ${otherUnit.label}.

Bins due: ${generalLabel} + green food & garden waste
Bins out: ${config.takeOutBy}
Bins back: ${config.returnBy}
Council collection: ${config.pickupDay} ${config.pickupTime}

Two townhouses are rostered together each week so the bins still get out
even if one of you can't make it — please cover for each other if needed.

Thanks for keeping the strata roster fair for everyone.
${siteUrl ? '\n' + siteUrl : ''}`
    });

    results.push(unit.label);
  }

  console.log(`Reminder sent to: ${results.join(', ') || 'nobody (no emails on file)'}.`);
  return new Response(`Reminders sent to: ${results.join(', ') || 'none'}`, { status: 200 });
};
