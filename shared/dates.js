// One way to write dates everywhere (polish spec §4.3). Inputs are local wall-clock strings
// (YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss): they are written as recorded, never moved to another zone.
const LOCAL = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}:\d{2}:\d{2}))?/;

function parse(value) {
  const match = typeof value === 'string' ? LOCAL.exec(value) : null;
  if (!match) return null;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return { y, m, d, date, time: match[4] ?? '' };
}

// Intl puts thin spaces around the range dash; the rest of the interface uses plain spaces.
const plain = (text) => text.replace(/[\u2009\u202f]/g, ' ');

// Made once: a new formatter for every photo is slow in albums with thousands of them.
const ENGLISH = {
  day: new Intl.DateTimeFormat('en', { timeZone: 'UTC', year: 'numeric', month: 'short', day: 'numeric' }),
  month: new Intl.DateTimeFormat('en', { timeZone: 'UTC', year: 'numeric', month: 'short' }),
};

function english(a, b, month) {
  const format = month ? ENGLISH.month : ENGLISH.day;
  return plain(b ? format.formatRange(a.date, b.date) : format.format(a.date));
}

// zh-CN Intl ranges read "2026/7/12 – 2026/7/15", so Chinese is spelled out by hand.
function chinese(a, b, month) {
  const day = (p) => (month ? '' : `${p.d}日`);
  const full = (p) => `${p.y}年${p.m}月${day(p)}`;
  if (!b) return full(a);
  if (a.y !== b.y) return `${full(a)}–${full(b)}`;
  if (a.m !== b.m) return `${full(a)}–${b.m}月${day(b)}`;
  return `${full(a)}–${day(b)}`;
}

export function formatRange(from, to = from, { lang = 'en', month = false } = {}) {
  let [a, b] = [parse(from), parse(to)];
  if (!a || !b) return '';
  if (b.date < a.date) [a, b] = [b, a];
  const same = month ? a.y === b.y && a.m === b.m : a.date.getTime() === b.date.getTime();
  return lang === 'zh' ? chinese(a, same ? null : b, month) : english(a, same ? null : b, month);
}

export function formatDateTime(local, { lang = 'en' } = {}) {
  const value = parse(local);
  if (!value) return '';
  const date = formatRange(local, local, { lang });
  if (!value.time) return date;
  return lang === 'zh' ? `${date} ${value.time}` : `${date}, ${value.time}`;
}

// A moment stored in UTC (a file's modification time): written in local time with the zone's name.
export function formatInstant(iso, { lang = 'en', timeZone } = {}) {
  const moment = typeof iso === 'string' ? new Date(iso) : null;
  if (!moment || !Number.isFinite(moment.getTime())) return '';
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(moment).map(({ type, value }) => [type, value]));
  const written = formatDateTime(`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`, { lang });
  if (!written) return '';
  const zone = new Intl.DateTimeFormat(lang === 'zh' ? 'zh-CN' : 'en', { timeZone, timeZoneName: 'short' })
    .formatToParts(moment).find(({ type }) => type === 'timeZoneName')?.value;
  return zone ? `${written} ${zone}` : written;
}
