import express from "express";
import { verifyReport } from "../controllers/reportController.js";

// public check of a PDF report by its id (docs/REPORT.md)
const reportRouter = express.Router();
reportRouter.get('/:reportId', verifyReport);

export default reportRouter;
