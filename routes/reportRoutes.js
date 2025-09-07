import { Router } from "express";
import { weeklyReport, monthlyReport, totalReport } from "../controllers/reportController.js";

const router = Router();
router.get("/weekly", weeklyReport);
router.get("/monthly", monthlyReport);
router.get("/total", totalReport);

export default router;
