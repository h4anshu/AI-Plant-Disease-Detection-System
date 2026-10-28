import mongoose from "mongoose";

// Headlines for the news panel (docs/FIELD_ALERTS.md, "News and advisories"): a title, an outbound link and when it was published,
// nothing of the article itself. `states` and `crops` are tags the server worked out from the headline (and the feed's own
// summary, which is not kept); they only decide who sees the item. Kept 30 days.
const newsSchema = new mongoose.Schema({
    key: { type: String, required: true, unique: true },   // sha1 of the link: the same story is stored once
    source: { type: String, required: true },              // thehindu | pib
    title: { type: String, required: true },
    link: { type: String, required: true },
    publishedAt: { type: Date, required: true, index: true },
    dated: { type: Boolean, default: true },               // false: the feed gave no date, publishedAt is when we first saw it (PIB)
    lang: String,                                          // en | hi
    states: [String],
    crops: [String],
    expireAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } }
});

export default mongoose.models.NewsItem || mongoose.model('NewsItem', newsSchema);
