import { Router } from "express";
import {
  weeklyReport,
  monthlyReport,
  totalReport,
  reportYears,
} from "../controllers/reportController.js";
import requireAuth from "../middleware/requireAuth.js"; // <- verify JWT, sets req.user

const router = Router();

// All report endpoints require authentication
router.use(requireAuth);

router.get("/weekly", weeklyReport);
router.get("/monthly", monthlyReport); // supports ?year=YYYY
router.get("/total", totalReport);
router.get("/years", reportYears);     // list of selectable years for the user

export default router;
