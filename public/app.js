import { getWeekInfo, getUpcomingWeeks, formatShortDate } from './shared/rosterLogic.mjs';

function chipHTML(week){
  const generalClass = week.binColor === 'red' ? 'chip-red' : 'chip-yellow';
  const generalLabel = week.binColor === 'red' ? 'Red bins' : 'Yellow bins';
  return `<span class="chip ${generalClass}">${generalLabel}</span><span class="chip chip-green">Green bin</span>`;
}

function dutyLabel(week){
  return week.dutyUnits.map(u => u.label).join(' & ');
}

function dutyAbbrev(week){
  // "Townhouse 3" -> "TH3"; falls back to first letters if labels differ
  return week.dutyUnits
    .map(u => {
      const num = u.label.match(/\d+/);
      return num ? `TH${num[0]}` : u.label.slice(0, 4).toUpperCase();
    })
    .join(' · ');
}

function nextPickupCountdown(config, thisWeek){
  // pickupDate is a UTC-midnight marker for the correct calendar day —
  // reconstruct it as a LOCAL date/time so the countdown reflects the
  // resident's actual local clock (they're all in Sydney).
  const p = thisWeek.pickupDate;
  const target = new Date(p.getUTCFullYear(), p.getUTCMonth(), p.getUTCDate(), 7, 0, 0);

  const now = new Date();
  let diffMs = target - now;
  if (diffMs < 0) diffMs = 0;
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diffMs / (1000 * 60 * 60)) % 24);

  if (days === 0 && hours === 0) return `<strong>Collection is happening now</strong>`;
  if (days === 0) return `<strong>${hours}h</strong> until ${config.pickupTime} pickup (${config.pickupDay})`;
  return `<strong>${days}d ${hours}h</strong> until ${config.pickupTime} pickup (${config.pickupDay})`;
}

async function init(){
  const config = await fetch('roster-config.json').then(r => r.json());

  const thisWeek = getWeekInfo(config);

  document.getElementById('tw-range').textContent =
    `Week of ${formatShortDate(thisWeek.pickupDate)}`;
  document.getElementById('tw-unit').textContent = dutyLabel(thisWeek);
  document.getElementById('tw-out').textContent = config.takeOutBy;
  document.getElementById('tw-back').textContent = config.returnBy;
  document.getElementById('tw-chips').innerHTML = chipHTML(thisWeek);
  document.getElementById('tw-countdown').innerHTML = nextPickupCountdown(config, thisWeek);

  // colour the general bins to match this week, mark them "due"
  const generalColor = thisWeek.binColor === 'red' ? '#C1440E' : '#E8A93E';
  ['bin-g1','bin-g2','bin-g3'].forEach(id => {
    const el = document.getElementById(id);
    el.classList.add('due');
    el.style.setProperty('--bin-color', generalColor);
  });

  document.getElementById('duty-tag-text').textContent = dutyAbbrev(thisWeek);

  // upcoming table
  const upcoming = getUpcomingWeeks(config, 6);
  const table = document.getElementById('upcoming-table');
  upcoming.forEach((week, i) => {
    const row = document.createElement('div');
    row.className = 'row' + (i === 0 ? ' current' : '');
    row.innerHTML = `
      <span class="row-date">${formatShortDate(week.pickupDate)}</span>
      <span class="row-unit">${dutyLabel(week)}</span>
      <span class="row-chips">${chipHTML(week)}</span>
    `;
    table.appendChild(row);
  });

  document.querySelector('.eyebrow').textContent =
    `${config.buildingName} · Strata Bin Roster`;

  // per-unit calendar subscription links
  const subscribeGrid = document.getElementById('subscribe-grid');
  config.units.forEach(unit => {
    const feedPath = `/.netlify/functions/calendar-feed?unit=${unit.id}`;
    const httpsUrl = `${window.location.origin}${feedPath}`;

    const row = document.createElement('div');
    row.className = 'subscribe-row';

    const link = document.createElement('a');
    link.className = 'subscribe-chip';
    link.href = `webcal://${window.location.host}${feedPath}`;
    link.textContent = unit.label;
    row.appendChild(link);

    // Fallback for whenever webcal:// doesn't trigger anything
    // (no registered handler, a one-off glitch, etc.) — lets someone
    // copy the plain https:// feed URL and add it manually via
    // "Add calendar by URL" in Google Calendar / Outlook / Apple Calendar.
    const copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.className = 'subscribe-copy';
    copyBtn.textContent = 'Copy link';
    copyBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(httpsUrl);
        copyBtn.textContent = 'Copied!';
      } catch {
        // Clipboard API unavailable — fall back to showing the URL for manual copy.
        window.prompt('Copy this calendar feed URL:', httpsUrl);
      }
      setTimeout(() => { copyBtn.textContent = 'Copy link'; }, 2000);
    });
    row.appendChild(copyBtn);

    subscribeGrid.appendChild(row);
  });

  // keep the countdown fresh
  setInterval(() => {
    document.getElementById('tw-countdown').innerHTML = nextPickupCountdown(config, getWeekInfo(config));
  }, 60 * 1000);
}

init().catch(err => {
  document.getElementById('tw-unit').textContent = 'Could not load roster';
  console.error(err);
});
