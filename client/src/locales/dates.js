// Dates and times in the language of the screen. English and Hindi use the browser's own locale data. Punjabi and Odia use the tables below:
// a browser's locale data for them is often missing (an older Chrome prints "M10 29, Thu" in Punjabi and English month names in Odia), and
// a date that is half in another language is worse than none. Digits stay 0-9 and times use the 12-hour English form ("6:47 pm"), the way
// both languages' apps write them. (docs/LANGUAGES.md)
const TABLES = {
  pa: {
    month: {
      long: ['ਜਨਵਰੀ', 'ਫ਼ਰਵਰੀ', 'ਮਾਰਚ', 'ਅਪ੍ਰੈਲ', 'ਮਈ', 'ਜੂਨ', 'ਜੁਲਾਈ', 'ਅਗਸਤ', 'ਸਤੰਬਰ', 'ਅਕਤੂਬਰ', 'ਨਵੰਬਰ', 'ਦਸੰਬਰ'],
      short: ['ਜਨ', 'ਫ਼ਰ', 'ਮਾਰਚ', 'ਅਪ੍ਰੈ', 'ਮਈ', 'ਜੂਨ', 'ਜੁਲਾ', 'ਅਗ', 'ਸਤੰ', 'ਅਕਤੂ', 'ਨਵੰ', 'ਦਸੰ'],
    },
    weekday: {
      long: ['ਐਤਵਾਰ', 'ਸੋਮਵਾਰ', 'ਮੰਗਲਵਾਰ', 'ਬੁੱਧਵਾਰ', 'ਵੀਰਵਾਰ', 'ਸ਼ੁੱਕਰਵਾਰ', 'ਸ਼ਨਿੱਚਰਵਾਰ'],
      short: ['ਐਤ', 'ਸੋਮ', 'ਮੰਗਲ', 'ਬੁੱਧ', 'ਵੀਰ', 'ਸ਼ੁੱਕਰ', 'ਸ਼ਨਿੱਚਰ'],
    },
  },
  or: {
    month: {
      long: ['ଜାନୁଆରୀ', 'ଫେବୃଆରୀ', 'ମାର୍ଚ୍ଚ', 'ଏପ୍ରିଲ', 'ମଇ', 'ଜୁନ', 'ଜୁଲାଇ', 'ଅଗଷ୍ଟ', 'ସେପ୍ଟେମ୍ବର', 'ଅକ୍ଟୋବର', 'ନଭେମ୍ବର', 'ଡିସେମ୍ବର'],
      short: ['ଜାନୁ', 'ଫେବ୍ର', 'ମାର୍ଚ୍ଚ', 'ଏପ୍ର', 'ମଇ', 'ଜୁନ', 'ଜୁଲାଇ', 'ଅଗ', 'ସେପ୍ଟେ', 'ଅକ୍ଟୋ', 'ନଭେ', 'ଡିସେ'],
    },
    weekday: {
      long: ['ରବିବାର', 'ସୋମବାର', 'ମଙ୍ଗଳବାର', 'ବୁଧବାର', 'ଗୁରୁବାର', 'ଶୁକ୍ରବାର', 'ଶନିବାର'],
      short: ['ରବି', 'ସୋମ', 'ମଙ୍ଗଳ', 'ବୁଧ', 'ଗୁରୁ', 'ଶୁକ୍ର', 'ଶନି'],
    },
  },
};

// the locale for Intl: Indian date order in English; Hindi as is
const intlLocale = (lang) => (lang === 'en' ? 'en-IN' : lang);

// opts as for toLocaleDateString: weekday, day, month ('short' | 'long'), year
export function formatDate(date, lang, opts = {}) {
  const t = TABLES[lang];
  if (!t) return date.toLocaleDateString(intlLocale(lang), opts);
  const { weekday, day, month, year } = opts;
  const dm = [day ? date.getDate() : '', month ? t.month[month === 'long' ? 'long' : 'short'][date.getMonth()] : ''].filter(Boolean).join(' ');
  const wd = weekday ? t.weekday[weekday === 'long' ? 'long' : 'short'][date.getDay()] : '';
  return [wd && (dm || year ? `${wd},` : wd), dm, year ? date.getFullYear() : ''].filter(Boolean).join(' ');
}

// opts as for toLocaleTimeString: hour, minute
export function formatTime(date, lang, opts = {}) {
  return date.toLocaleTimeString(TABLES[lang] ? 'en-IN' : intlLocale(lang), opts);
}

// a date and a time: opts as for toLocaleString
export function formatDateTime(date, lang, opts = {}) {
  if (!TABLES[lang]) return date.toLocaleString(intlLocale(lang), opts);
  const { hour, minute, ...dateOpts } = opts;
  return `${formatDate(date, lang, dateOpts)}, ${formatTime(date, lang, { hour, minute })}`;
}
