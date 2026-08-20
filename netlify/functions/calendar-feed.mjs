// Netlify on-demand Function (not scheduled — runs per request).
// Serves a live .ics calendar feed of bin-duty weeks. Residents
// subscribe once (via webcal://) and their calendar app re-fetches
// this feed on its own schedule, so the reminder "just works" even
// if a resident's email address changes or the send-reminder
// function's email list falls out of date.
//
// Usage:
//   /.netlify/functions/calendar-feed              -> every week, all units
//   /.netlify/functions/calendar-feed?unit=th1      -> only weeks th1 is on duty
//
// Each event carries a built-in VALARM, so the reminder travels with
// the calendar entry itself rather than depending on a separate
// email being sent and delivered.

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { getUpcomingWeeks } from '../../shared/rosterLogic.mjs';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));

async function loadConfig() {
  const raw = await readFile(path.join(moduleDir, '../../public/roster-config.json'), 'utf8');
  return JSON.parse(raw);
}

// NSW public holidays that commonly bump a Thursday council collection
// to Friday. Kept as a plain date list here (rather than a library)
// so it's easy for a non-developer to extend — add "YYYY-MM-DD" for
// any additional council-notified collection-day shift.
const COLLECTION_SHIFT_DATES = [
  '2026-10-01', // Labour Day (NSW) — collections typically shift a day
  '2027-01-28', // Australia Day observed
];

function icsDate(date, hour, minute) {
  const d = new Date(date);
  d.setUTCHours(hour, minute, 0, 0);
  return d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
}

function escapeText(str) {
  return String(str).replace(/([,;])/g, '\\$1').replace(/\n/g, '\\n');
}

function foldLine(line) {
  // RFC 5545 requires long lines folded at 75 octets.
  if (line.length <= 75) return line;
  const chunks = [];
  let i = 0;
  while (i < line.length) {
    chunks.push((i === 0 ? '' : ' ') + line.slice(i, i + 74));
    i += 74;
  }
  return chunks.join('\r\n');
}

function buildEvent(week, config, unitFilter) {
  const dutyLabel = week.dutyUnits.map(u => u.label).join(' & ');
  const generalLabel = week.binColor === 'red' ? 'Red general waste' : 'Yellow recycling';
  const isHoliday = COLLECTION_SHIFT_DATES.includes(week.pickupDate.toISOString().slice(0, 10));

  // Bins-out event runs the Wednesday evening before pickupDate through
  // pickup morning, so it shows on the calendar the night bins need to
  // go to the kerb.
  const outDate = new Date(week.pickupDate);
  outDate.setUTCDate(outDate.getUTCDate() - 1);

  const uid = `${week.pickupDate.toISOString().slice(0, 10)}-${unitFilter || 'all'}@47yorstonstreet`;

  const summary = unitFilter
    ? `Bin duty this week (with ${week.dutyUnits.find(u => u.id !== unitFilter)?.label || 'partner unit'})`
    : `Bin duty: ${dutyLabel}`;

  const description = [
    `Bins due: ${generalLabel} + green food & garden waste.`,
    `Out by: ${config.takeOutBy}.`,
    `Back by: ${config.returnBy}.`,
    isHoliday ? 'Note: collection day may shift due to a public holiday — confirm with council.' : ''
  ].filter(Boolean).join('\\n');

  return [
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${icsDate(new Date(), 0, 0)}`,
    `DTSTART:${icsDate(outDate, 18, 0)}`,
    `DTEND:${icsDate(week.pickupDate, 9, 0)}`,
    foldLine(`SUMMARY:${escapeText(summary)}`),
    foldLine(`DESCRIPTION:${escapeText(description)}`),
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    'DESCRIPTION:Bins out tonight',
    'TRIGGER:-PT2H',
    'END:VALARM',
    'END:VEVENT'
  ].join('\r\n');
}

export default async (req) => {
  const config = await loadConfig();
  const url = new URL(req.url);
  const unitFilter = url.searchParams.get('unit');

  if (unitFilter && !config.units.some(u => u.id === unitFilter)) {
    return new Response('Unknown unit id. Valid ids: ' + config.units.map(u => u.id).join(', '), { status: 400 });
  }

  const weeks = getUpcomingWeeks(config, 26); // ~6 months ahead
  const relevant = unitFilter
    ? weeks.filter(w => w.dutyUnits.some(u => u.id === unitFilter))
    : weeks;

  const events = relevant.map(w => buildEvent(w, config, unitFilter)).join('\r\n');

  const calName = unitFilter
    ? `${config.buildingName} Bin Duty — ${config.units.find(u => u.id === unitFilter).label}`
    : `${config.buildingName} Bin Roster`;

  const body = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//47 Yorston Street//Bin Roster//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(calName)}`,
    'X-WR-TIMEZONE:Australia/Sydney',
    // Ask calendar apps to re-fetch periodically so the feed stays current
    // without the resident having to do anything.
    'REFRESH-INTERVAL;VALUE=DURATION:P1D',
    'X-PUBLISHED-TTL:P1D',
    events,
    'END:VCALENDAR'
  ].join('\r\n');

  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `inline; filename="${unitFilter || 'bin-roster'}.ics"`,
      'Cache-Control': 'public, max-age=3600'
    }
  });
};
