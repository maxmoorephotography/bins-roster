// Shared roster logic — imported by public/app.js (browser) and
// netlify/functions/send-reminder.mjs (server). Keep this file
// free of browser-only or Node-only APIs so it works in both.
//
// A "collection week" runs Friday -> Thursday and is identified by
// its Thursday (the council pickup day). Bins go out Wednesday
// afternoon/evening and come back any time Thursday after the 7am
// collection.

export const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;
const THURSDAY = 4; // JS getUTCDay(): Sun=0 ... Thu=4 ... Sat=6

function cycleThursdayUTC(dateLike) {
  const d = new Date(dateLike);
  const day = d.getUTCDay();
  const diffToThursday = (THURSDAY - day + 7) % 7; // Fri..Thu -> 6,5,4,3,2,1,0
  d.setUTCDate(d.getUTCDate() + diffToThursday);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function weeksBetween(laterThu, earlierThu) {
  return Math.round((laterThu - earlierThu) / MS_PER_WEEK);
}

/**
 * Returns full detail for the collection week containing `referenceDate`.
 * config: { units, rosterStartDate, redWeekStartDate, pickupDay }
 * rosterStartDate / redWeekStartDate should both be the Thursday
 * (pickup date) that starts the respective cycle.
 */
export function getWeekInfo(config, referenceDate = new Date()) {
  const { units, rosterStartDate, redWeekStartDate, pickupDay } = config;

  const pickupThu = cycleThursdayUTC(referenceDate);

  const rosterThu = cycleThursdayUTC(rosterStartDate);
  const weeksSinceStart = weeksBetween(pickupThu, rosterThu);
  const n = units.length;
  // Two units on duty each week, stepping the pair forward by one
  // unit per week so the workload rotates evenly (2 of 5 units/week
  // -> everyone is on duty on average 2 weeks in 5).
  //
  // The second unit is offset by roughly half the roster (not +1),
  // so a given unit's two duty weeks per cycle land apart from each
  // other instead of back-to-back. With +1, each unit was next to
  // itself in the pairing sequence and ended up doing two
  // consecutive weeks followed by a long stretch off; the ~n/2
  // offset spreads that into two separated weeks per cycle instead.
  const firstIndex = ((weeksSinceStart % n) + n) % n;
  const secondIndex = (firstIndex + Math.floor(n / 2)) % n;

  const redThu = cycleThursdayUTC(redWeekStartDate);
  const weeksSinceRed = weeksBetween(pickupThu, redThu);
  const isRedWeek = ((weeksSinceRed % 2) + 2) % 2 === 0;

  return {
    pickupDate: pickupThu,
    dutyUnits: [units[firstIndex], units[secondIndex]],
    dutyIndexes: [firstIndex, secondIndex],
    binColor: isRedWeek ? 'red' : 'yellow',
    greenBin: true,
    pickupDay
  };
}

/** Returns an array of `count` consecutive week-infos starting at `fromDate`'s week. */
export function getUpcomingWeeks(config, count = 6, fromDate = new Date()) {
  const weeks = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(fromDate);
    d.setUTCDate(d.getUTCDate() + i * 7);
    weeks.push(getWeekInfo(config, d));
  }
  return weeks;
}

/** Formats a pickup-date Date as "20 Aug" */
export function formatShortDate(date) {
  return date.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}
