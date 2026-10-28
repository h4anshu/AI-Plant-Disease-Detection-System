import { XMLParser } from 'fast-xml-parser';

// NDMA SACHET speaks RSS 2.0 (the list) and CAP 1.2 (one alert per file); docs/FIELD_ALERT_RESEARCH.md T3-T4.
// Everything here is pure: text in, plain objects out; a document that is not what it should be throws.
const xml = new XMLParser({
  ignoreAttributes: true, removeNSPrefix: true, trimValues: true,
  parseTagValue: false, // identifiers are 16-digit numbers: keep them as text
  isArray: (name) => ['item', 'info', 'area', 'geocode'].includes(name),
});

const text = (v) => (typeof v === 'string' ? v : '');
const date = (v) => { const d = new Date(text(v)); return Number.isNaN(d.getTime()) ? null : d; };
const LGD = 'LGD District Code';

// [{ guid, link, author, pubDate }] newest first as published; an empty channel is a valid, empty feed
export function parseRss(body) {
  const channel = xml.parse(body)?.rss?.channel;
  if (!channel) throw new Error('not an RSS feed');
  return (channel.item ?? []).map((i) => ({ guid: text(i.guid), link: text(i.link), author: text(i.author), pubDate: date(i.pubDate) })).filter((i) => i.guid && i.pubDate);
}

// "sender,identifier,sent sender,identifier,sent" -> [identifier]
const referenceIds = (refs) => text(refs).split(/\s+/).map((r) => r.split(',')[1]).filter(Boolean);

// One CAP file -> { identifier, sender, sent, status, scope, msgType, references, infos: [...] }
export function parseCap(body) {
  const alert = xml.parse(body)?.alert;
  const sent = date(alert?.sent);
  if (!alert?.identifier || !sent || !alert.info?.length) throw new Error('not a CAP alert');
  return {
    identifier: text(alert.identifier), sender: text(alert.sender), sent, status: text(alert.status), scope: text(alert.scope),
    msgType: text(alert.msgType), references: referenceIds(alert.references),
    infos: alert.info.map((i) => ({
      language: text(i.language), event: text(i.event), urgency: text(i.urgency), severity: text(i.severity), certainty: text(i.certainty),
      effective: date(i.effective), onset: date(i.onset), expires: date(i.expires),
      headline: text(i.headline), instruction: text(i.instruction),
      areaDesc: (i.area ?? []).map((a) => text(a.areaDesc)).filter(Boolean).join('; '),
      lgd: (i.area ?? []).flatMap((a) => (a.geocode ?? []).filter((g) => text(g.valueName) === LGD).map((g) => Number(text(g.value)))).filter(Number.isInteger),
    })),
  };
}

const NO_EXPIRY_MS = 3 * 3600e3; // CAP leaves `expires` optional; SACHET's own nowcasts last 3 hours

// the English block carries the numbers; every language's headline is kept so the app can show the reader's own
export function toRecord(cap, guid) {
  const en = cap.infos.find((i) => /^en/i.test(i.language)) ?? cap.infos[0];
  const onset = en.onset ?? en.effective ?? cap.sent;
  return {
    identifier: cap.identifier, guid, sender: cap.sender, sent: cap.sent, status: cap.status, scope: cap.scope, msgType: cap.msgType,
    references: cap.references, severity: en.severity, urgency: en.urgency, certainty: en.certainty, event: en.event,
    onset, expires: en.expires ?? new Date(onset.getTime() + NO_EXPIRY_MS),
    lgd: [...new Set(cap.infos.flatMap((i) => i.lgd))], areaDesc: en.areaDesc,
    infos: cap.infos.map(({ language, headline, instruction }) => ({ language, headline, instruction })),
  };
}
