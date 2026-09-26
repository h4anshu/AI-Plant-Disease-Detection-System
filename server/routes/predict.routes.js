import express from "express";
import { predict , getHistory} from "../controllers/predictController.js";
import upload from "../middleware/upload.js";
import authMiddleware from "../middleware/auth.js";
import guestDevice from "../middleware/guestDevice.js";
import { predictLimiter } from "../middleware/rateLimit.js";

const predictRouter = express.Router();
predictRouter.post('/', predictLimiter, authMiddleware, guestDevice, upload.single('image'), predict);
predictRouter.get('/', authMiddleware, guestDevice, getHistory);

export default predictRouter;
