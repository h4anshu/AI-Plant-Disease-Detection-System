import express from "express";
import { getKey, subscribe, test, unsubscribe } from "../controllers/pushController.js";
import authMiddleware from "../middleware/auth.js";
import guestDevice from "../middleware/guestDevice.js";
import { pushLimiter, pushTestLimiter } from "../middleware/rateLimit.js";

const pushRouter = express.Router();
pushRouter.get('/key', getKey);
pushRouter.post('/subscribe', pushLimiter, authMiddleware, guestDevice, subscribe);
pushRouter.post('/unsubscribe', pushLimiter, unsubscribe);
pushRouter.post('/test', pushTestLimiter, authMiddleware, guestDevice, test);

export default pushRouter;
