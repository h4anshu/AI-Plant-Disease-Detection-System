// The words of a push notification (docs/PUSH.md). A notification is built on the server, so its words live here and not in the client's
// locale files. It names the hazard, the level and the crop, and never the field's name or place: it shows on a lock screen.
// Hindi, Punjabi and Odia are AI-drafted and go to the same reviewer as the rest (task.md, Pending).
export const PUSH_LANGS = ['en', 'hi', 'pa', 'or'];

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
  pa: {
    hazard: { frost: 'ਪਾਲਾ', heat: 'ਗਰਮੀ', heatwave: 'ਲੂ', rain_harvest: 'ਵਾਢੀ ਤੋਂ ਪਹਿਲਾਂ ਮੀਂਹ', rain_heavy: 'ਭਾਰੀ ਮੀਂਹ', dry_spell: 'ਸੁੱਕਾ ਦੌਰ',
      rain_spray: 'ਛਿੜਕਾਅ ਤੋਂ ਬਾਅਦ ਮੀਂਹ', flood_river: 'ਦਰਿਆ ਵਿੱਚ ਹੜ੍ਹ ਦਾ ਖ਼ਤਰਾ', fire_near: 'ਨੇੜੇ ਅੱਗ', disease_near: 'ਨੇੜੇ ਬਿਮਾਰੀ', official: 'ਸਰਕਾਰੀ ਚੇਤਾਵਨੀ' },
    level: { urgent: 'ਫ਼ੌਰੀ', warn: 'ਚੇਤਾਵਨੀ', watch: 'ਧਿਆਨ ਰੱਖੋ', info: 'ਸੂਚਨਾ' },
    crop: { wheat: 'ਕਣਕ', rice: 'ਝੋਨਾ', sugarcane: 'ਗੰਨਾ', potato: 'ਆਲੂ', maize: 'ਮੱਕੀ', pigeonpea: 'ਅਰਹਰ (ਤੂਰ)', groundnut: 'ਮੂੰਗਫਲੀ', blackgram: 'ਮਾਂਹ (ਉੜਦ)', apple: 'ਸੇਬ', banana: 'ਕੇਲਾ' },
    when: (n) => (n <= 0 ? 'ਅੱਜ' : n === 1 ? 'ਕੱਲ੍ਹ' : `${n} ਦਿਨਾਂ ਵਿੱਚ`),
    body: (crop, when) => `ਤੁਹਾਡਾ ${crop} ਦਾ ਖੇਤ, ${when}। ਕੀ ਕਰਨਾ ਹੈ, ਇਹ ਦੇਖਣ ਲਈ ਪਲਾਂਟਗਾਰਡ ਖੋਲ੍ਹੋ।`,
    official: { sachet: 'NDMA', imd: 'IMD', cwc: 'CWC' },
    testTitle: 'ਪਲਾਂਟਗਾਰਡ ਦੀਆਂ ਸੂਚਨਾਵਾਂ ਚਾਲੂ ਹਨ',
    testBody: 'ਤੁਹਾਡੇ ਖੇਤ ਲਈ ਚੇਤਾਵਨੀ ਜਾਰੀ ਹੋਣ \'ਤੇ ਇਸ ਤਰ੍ਹਾਂ ਦਾ ਸੁਨੇਹਾ ਆਵੇਗਾ।',
  },
  or: {
    hazard: { frost: 'ହିମପାତ', heat: 'ଗରମ', heatwave: 'ଲୁ', rain_harvest: 'ଅମଳ ପୂର୍ବରୁ ବର୍ଷା', rain_heavy: 'ପ୍ରବଳ ବର୍ଷା', dry_spell: 'ଶୁଖିଲା ସମୟ',
      rain_spray: 'ସିଞ୍ଚନ ପରେ ବର୍ଷା', flood_river: 'ନଦୀରେ ବନ୍ୟାର ଆଶଙ୍କା', fire_near: 'ପାଖରେ ନିଆଁ', disease_near: 'ପାଖରେ ରୋଗ', official: 'ସରକାରୀ ଚେତାବନୀ' },
    level: { urgent: 'ତୁରନ୍ତ', warn: 'ଚେତାବନୀ', watch: 'ନଜର ରଖନ୍ତୁ', info: 'ସୂଚନା' },
    crop: { wheat: 'ଗହମ', rice: 'ଧାନ', sugarcane: 'ଆଖୁ', potato: 'ଆଳୁ', maize: 'ମକା', pigeonpea: 'ଅରହର (କନ୍ଦୁଲ)', groundnut: 'ଚିନାବାଦାମ', blackgram: 'ବିରି', apple: 'ସେଓ', banana: 'କଦଳୀ' },
    when: (n) => (n <= 0 ? 'ଆଜି' : n === 1 ? 'ଆସନ୍ତାକାଲି' : `${n} ଦିନରେ`),
    body: (crop, when) => `ଆପଣଙ୍କ ${crop} ଖେତ, ${when}। କ'ଣ କରିବେ ଦେଖିବାକୁ ପ୍ଲାଣ୍ଟଗାର୍ଡ ଖୋଲନ୍ତୁ।`,
    official: { sachet: 'NDMA', imd: 'IMD', cwc: 'CWC' },
    testTitle: 'ପ୍ଲାଣ୍ଟଗାର୍ଡର ବିଜ୍ଞପ୍ତି ଚାଲୁ ଅଛି',
    testBody: 'ଆପଣଙ୍କ ଖେତ ପାଇଁ ଚେତାବନୀ ଜାରି ହେଲେ ଏପରି ବାର୍ତ୍ତା ଆସିବ।',
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
