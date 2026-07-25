import express from "express";
import { predict , getHistory } from "../controllers/predictController.js";
import upload from "../middleware/upload.js";
import authMiddleware from "../middleware/auth.js";

const predictRouter = express.Router();
predictRouter.post('/', authMiddleware , upload.single('image') ,predict);
predictRouter.get('/', authMiddleware, getHistory);

export default predictRouter;