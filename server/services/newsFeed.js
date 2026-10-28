import { createRequire } from "node:module";
import { XMLParser } from "fast-xml-parser";

// Pure helpers of the news panel (services/news.js): an RSS body -> headlines, and a headline -> which states and crops it names.
const require = createRequire(import.meta.url);
const xml = new XMLParser({ ignoreAttributes: true, removeNSPrefix: true, trimValues: true, parseTagValue: false, isArray: (name) => name === 'item' });
const text = (v) => (typeof v === 'string' ? v : '');
const MAX_TITLE = 300;

// [{ title, link, date | null, summary }] for every item with a title and an https link on one of `hosts` (a feed cannot send readers
// to a site it does not own); anything that is not an RSS feed throws.
export function parseFeed(body, hosts) {
  const channel = xml.parse(body)?.rss?.channel;
  if (!channel) throw new Error('not an RSS feed');
  return (channel.item ?? []).map((i) => {
    let url;
    try { url = new URL(text(i.link).trim()); } catch { return null; }
    const title = text(i.title).replace(/<[^>]*>/g, ' ').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_TITLE);
    const date = new Date(text(i.pubDate));
    if (!title || url.protocol !== 'https:' || !hosts.includes(url.hostname)) return null;
    return { title, link: url.href, date: Number.isNaN(date.getTime()) ? null : date, summary: text(i.description).replace(/<[^>]*>/g, ' ').slice(0, 600) };
  }).filter(Boolean);
}

// \b does not work on Devanagari: a name counts only when no letter of either script touches it ("असम" is not inside "असमान", "rice" not inside "price")
const word = (s, flags = 'i') => new RegExp(`(?<![A-Za-z\\u0900-\\u097F])${s}(?![A-Za-z\\u0900-\\u097F])`, flags);

const STATES = [...new Set(require('../data/lgd_districts.json').map((r) => r[2]))].filter((s) => !/^The /.test(s) && s !== 'Delhi');
// how the papers write them: abbreviations (case matters, "t.n." is nothing), the old and new spellings, Hindi (PIB); New Delhi is the capital, not a farm state
const ALIASES = [['T\\.N\\.', 'Tamil Nadu', ''], ['A\\.P\\.', 'Andhra Pradesh', ''], ['U\\.P\\.', 'Uttar Pradesh', ''], ['M\\.P\\.', 'Madhya Pradesh', ''], ['H\\.P\\.', 'Himachal Pradesh', ''],
  ['(?<!New )Delhi', 'Delhi', 'i'], ['(?<!नई )दिल्ली', 'Delhi'], ['J&K', 'Jammu and Kashmir', ''], ['Keralam', 'Kerala', 'i'], ['Orissa', 'Odisha', 'i'], ['(?<!Bay of )Bengal', 'West Bengal', 'i'], ['Kashmir', 'Jammu and Kashmir', 'i'],
  ['पंजाब', 'Punjab'], ['हरियाणा', 'Haryana'], ['राजस्थान', 'Rajasthan'], ['उत्तर प्रदेश', 'Uttar Pradesh'], ['बिहार', 'Bihar'], ['झारखंड', 'Jharkhand'], ['ओडिशा', 'Odisha'],
  ['पश्चिम बंगाल', 'West Bengal'], ['असम', 'Assam'], ['गुजरात', 'Gujarat'], ['महाराष्ट्र', 'Maharashtra'], ['छत्तीसगढ़', 'Chhattisgarh'], ['मध्य प्रदेश', 'Madhya Pradesh'],
  ['तेलंगाना', 'Telangana'], ['आंध्र प्रदेश', 'Andhra Pradesh'], ['कर्नाटक', 'Karnataka'], ['केरल', 'Kerala'], ['तमिलनाडु', 'Tamil Nadu'], ['उत्तराखंड', 'Uttarakhand'],
  ['हिमाचल प्रदेश', 'Himachal Pradesh'], ['जम्मू[- ]?(और )?कश्मीर', 'Jammu and Kashmir'], ['गोवा', 'Goa'], ['सिक्किम', 'Sikkim'], ['मणिपुर', 'Manipur'],
  ['मेघालय', 'Meghalaya'], ['मिजोरम', 'Mizoram'], ['नाग?ालैंड', 'Nagaland'], ['त्रिपुरा', 'Tripura'], ['अरुणाचल प्रदेश', 'Arunachal Pradesh'], ['लद्दाख', 'Ladakh']]
  .map(([re, state, flags]) => ({ re: word(re, flags ?? ''), state }));
const STATE_RE = [...STATES.map((s) => ({ re: word(s), state: s })), ...ALIASES];

// the crops of models/Prediction.js CROPS, as the papers say them
const CROP_RE = Object.entries({
  wheat: 'wheat|गेहूं|गेहूँ', rice: 'rice|paddy|धान|चावल', sugarcane: 'sugarcane|गन्ना', potato: 'potato|आलू', maize: 'maize|corn|मक्का',
  pigeonpea: 'pigeon ?pea|arhar|tur dal|अरहर|तुअर', groundnut: 'groundnut|peanut|मूंगफली', blackgram: 'black ?gram|urad|उड़द', apple: 'apple|सेब', banana: 'banana|केला',
}).map(([crop, re]) => ({ crop, re: word(`(?:${re})`) }));

// -> { states: ['Punjab'], crops: ['wheat'] }
export const tag = (s) => ({ states: [...new Set(STATE_RE.filter((x) => x.re.test(s)).map((x) => x.state))], crops: CROP_RE.filter((x) => x.re.test(s)).map((x) => x.crop) });
