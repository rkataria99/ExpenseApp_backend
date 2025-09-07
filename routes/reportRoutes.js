import { Router } from "express";
import { weeklyReport } from "../controllers/reportController.js";

const router = Router();
router.get("/weekly", weeklyReport);

export default router;
