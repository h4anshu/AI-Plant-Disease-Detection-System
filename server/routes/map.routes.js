import express from "express";
import { getReports } from "../controllers/mapController.js";

const mapRouter = express.Router();
mapRouter.get('/reports', getReports);

export default mapRouter;
