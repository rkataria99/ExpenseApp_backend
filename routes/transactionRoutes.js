import { Router } from "express";
import {
  createTransaction,
  listTransactions,
  deleteTransaction,
  clearAll,
  getTotals
} from "../controllers/transactionController.js";

const router = Router();

router.post("/", createTransaction);     // body: { type, amount, category?, note?, date? }
router.get("/", listTransactions);
router.delete("/:id", deleteTransaction);
router.delete("/", clearAll);
router.get("/totals", getTotals);

export default router;
