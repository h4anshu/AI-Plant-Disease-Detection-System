import express from "express";
import { predict, getHistory, getClasses, giveFeedback, deleteMine } from "../controllers/predictController.js";
import upload from "../middleware/upload.js";
import authMiddleware from "../middleware/auth.js";
import guestDevice from "../middleware/guestDevice.js";
import { fieldLimiter, predictLimiter, reportLimiter, riskLimiter } from "../middleware/rateLimit.js";
import { getPredictionRisk } from "../controllers/riskController.js";
import { getFieldHealth } from "../controllers/fieldHealthController.js";
import { getReport } from "../controllers/reportController.js";

const predictRouter = express.Router();
predictRouter.post('/', predictLimiter, authMiddleware, guestDevice, upload.single('image'), predict);
predictRouter.get('/', authMiddleware, guestDevice, getHistory);
predictRouter.delete('/', authMiddleware, guestDevice, deleteMine);
predictRouter.get('/classes', getClasses);
predictRouter.patch('/:id/feedback', authMiddleware, guestDevice, giveFeedback);
predictRouter.get('/:id/field-health', fieldLimiter, authMiddleware, guestDevice, getFieldHealth);
predictRouter.get('/:id/disease-risk', riskLimiter, authMiddleware, guestDevice, getPredictionRisk);
predictRouter.get('/:id/report.pdf', reportLimiter, authMiddleware, guestDevice, getReport);

export default predictRouter;
