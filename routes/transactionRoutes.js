import { Router } from "express";
import {
  createTransaction,
  listTransactions,
  deleteTransaction,
  clearAll,
  getTotals,
} from "../controllers/transactionController.js";
import requireAuth from "../middleware/requireAuth.js";

const router = Router();

// All transaction routes require authentication
router.use(requireAuth);

router.post("/", createTransaction);      // body: { type, amount, category?, note?, date? }
router.get("/", listTransactions);
router.get("/totals", getTotals);
router.delete("/:id", deleteTransaction);
router.delete("/", clearAll);

export default router;

