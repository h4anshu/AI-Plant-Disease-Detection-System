import express from "express";
import { predict, getHistory, getClasses, giveFeedback, deleteMine } from "../controllers/predictController.js";
import upload from "../middleware/upload.js";
import authMiddleware from "../middleware/auth.js";
import guestDevice from "../middleware/guestDevice.js";
import { fieldLimiter, predictLimiter, riskLimiter } from "../middleware/rateLimit.js";
import { getPredictionRisk } from "../controllers/riskController.js";
import { getFieldHealth } from "../controllers/fieldHealthController.js";

const predictRouter = express.Router();
predictRouter.post('/', predictLimiter, authMiddleware, guestDevice, upload.single('image'), predict);
predictRouter.get('/', authMiddleware, guestDevice, getHistory);
predictRouter.delete('/', authMiddleware, guestDevice, deleteMine);
predictRouter.get('/classes', getClasses);
predictRouter.patch('/:id/feedback', authMiddleware, guestDevice, giveFeedback);
predictRouter.get('/:id/field-health', fieldLimiter, authMiddleware, guestDevice, getFieldHealth);
predictRouter.get('/:id/disease-risk', riskLimiter, authMiddleware, guestDevice, getPredictionRisk);

export default predictRouter;
