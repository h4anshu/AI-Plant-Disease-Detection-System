import mongoose from "mongoose";

// One row per generated PDF report (docs/REPORT.md). What GET /api/reports/:reportId shows to anyone
// holding the id: the hashes and the key values, never the location, the photo or who made it.
const reportSchema = new mongoose.Schema({
  reportId: { type: String, required: true, unique: true },
  predictionId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  lang: { type: String, required: true },
  contentSha256: { type: String, required: true },
  pdfSha256: { type: String, required: true },
  summary: { type: mongoose.Schema.Types.Mixed, required: true },
}, { timestamps: { createdAt: true, updatedAt: false } });

export default mongoose.models.Report || mongoose.model('Report', reportSchema);
