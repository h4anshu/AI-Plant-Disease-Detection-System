// The words of a push notification (docs/PUSH.md). A notification is built on the server, so its words live here and not in the client's
// locale files. It names the hazard, the level and the crop, and never the field's name or place: it shows on a lock screen.
// The Hindi is AI-drafted and goes to the same reviewer as the rest (task.md, Pending).
export const PUSH_LANGS = ['en', 'hi'];

const TEXT = {
  en: {
    hazard: { frost: 'Frost', heat: 'Heat', heatwave: 'Heat wave', rain_harvest: 'Rain before harvest', rain_heavy: 'Heavy rain', dry_spell: 'Dry spell',
      rain_spray: 'Rain after spraying', flood_river: 'River flood risk', fire_near: 'Fire nearby', disease_near: 'Disease nearby', official: 'Official warning' },
    level: { urgent: 'Urgent', warn: 'Warning', watch: 'Watch', info: 'Note' },
    crop: { wheat: 'wheat', rice: 'rice', sugarcane: 'sugarcane', potato: 'potato', maize: 'maize', pigeonpea: 'pigeonpea', groundnut: 'groundnut', blackgram: 'blackgram', apple: 'apple', banana: 'banana' },
    when: (n) => (n <= 0 ? 'today' : n === 1 ? 'tomorrow' : `in ${n} days`),
    body: (crop, when) => `Your ${crop} field, ${when}. Open PlantGuard to see what to do.`,
    official: { sachet: 'NDMA', imd: 'IMD', cwc: 'CWC' },
    testTitle: 'PlantGuard notifications are on',
    testBody: 'You will get a message like this when a warning is issued for your field.',
  },
  hi: {
    hazard: { frost: 'पाला', heat: 'गर्मी', heatwave: 'लू', rain_harvest: 'कटाई से पहले बारिश', rain_heavy: 'भारी बारिश', dry_spell: 'सूखा दौर',
      rain_spray: 'छिड़काव के बाद बारिश', flood_river: 'नदी में बाढ़ का खतरा', fire_near: 'पास में आग', disease_near: 'पास में रोग', official: 'सरकारी चेतावनी' },
    level: { urgent: 'तुरंत', warn: 'चेतावनी', watch: 'सावधान', info: 'सूचना' },
    crop: { wheat: 'गेहूँ', rice: 'धान', sugarcane: 'गन्ना', potato: 'आलू', maize: 'मक्का', pigeonpea: 'अरहर (तूर)', groundnut: 'मूंगफली', blackgram: 'उड़द', apple: 'सेब', banana: 'केला' },
    when: (n) => (n <= 0 ? 'आज' : n === 1 ? 'कल' : `${n} दिन में`),
    body: (crop, when) => `आपका ${crop} का खेत, ${when}। क्या करना है, यह देखने के लिए प्लांटगार्ड खोलें।`,
    official: { sachet: 'NDMA', imd: 'IMD', cwc: 'CWC' },
    testTitle: 'प्लांटगार्ड की सूचनाएँ चालू हैं',
    testBody: 'आपके खेत के लिए चेतावनी जारी होने पर ऐसा ही संदेश आएगा।',
  },
};

const textOf = (lang) => TEXT[lang] ?? TEXT.en;

// an alert of one field -> { title, body }; official warnings carry their issuer (NDMA, IMD, CWC) in the title
export function pushMessage(alert, crop, lang = 'en') {
  const t = textOf(lang);
  const hazard = alert.origin === 'official' ? `${t.hazard.official} (${t.official[alert.source] ?? alert.source})` : (t.hazard[alert.hazard] ?? t.hazard.official);
  return {
    title: `${hazard}: ${t.level[alert.level] ?? t.level.info}`,
    body: t.body(t.crop[crop] ?? crop, t.when(alert.offset ?? 0)),
  };
}

export const testMessage = (lang = 'en') => ({ title: textOf(lang).testTitle, body: textOf(lang).testBody });
