import express from "express";
import { getRisk } from "../controllers/riskController.js";
import { riskLimiter } from "../middleware/rateLimit.js";

const riskRouter = express.Router();
riskRouter.get('/', riskLimiter, getRisk);

export default riskRouter;
