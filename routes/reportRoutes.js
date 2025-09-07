import { Router } from "express";
import { weeklyReport, monthlyReport, totalReport, reportYears } from "../controllers/reportController.js";

const router = Router();
router.get("/weekly", weeklyReport);
router.get("/monthly", monthlyReport); // supports ?year=YYYY
router.get("/total", totalReport);
router.get("/years", reportYears);     // list of selectable years

export default router;
