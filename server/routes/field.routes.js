import express from "express";
import { createField, deleteField, getAlerts, getFloodExtent, getNews, getPrices, giveAlertFeedback, listFields, updateField } from "../controllers/fieldController.js";
import authMiddleware from "../middleware/auth.js";
import guestDevice from "../middleware/guestDevice.js";
import { alertLimiter, extentLimiter } from "../middleware/rateLimit.js";

const fieldRouter = express.Router();
fieldRouter.use(alertLimiter, authMiddleware, guestDevice);
fieldRouter.get('/', listFields);
fieldRouter.post('/', createField);
fieldRouter.get('/alerts', getAlerts); // before /:id
fieldRouter.get('/:id/flood-extent', extentLimiter, getFloodExtent);
fieldRouter.get('/:id/news', getNews);
fieldRouter.get('/:id/prices', getPrices);
fieldRouter.post('/:id/alerts/feedback', giveAlertFeedback);
fieldRouter.patch('/:id', updateField);
fieldRouter.delete('/:id', deleteField);

export default fieldRouter;
