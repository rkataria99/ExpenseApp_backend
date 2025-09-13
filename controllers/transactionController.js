// backend/controllers/transactionController.js
import Transaction from "../models/Transaction.js";

function parseDateOrNow(dateLike) {
  if (!dateLike) return new Date();
  // Accept "YYYY-MM-DD" or Date; fall back to now on invalid
  const d = new Date(dateLike);
  return isNaN(d.getTime()) ? new Date() : d;
}

export const createTransaction = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const { type, amount, category, categoryGroup, note, date } = req.body;

    if (!type || amount == null) {
      return res.status(400).json({ message: "type and amount are required" });
    }

    const dt = parseDateOrNow(date);

    // Server-side guard: no future-dated income/expense
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    if ((type === "income" || type === "expense") && dt > today) {
      return res.status(400).json({ message: "Future-dated income/expense is not allowed" });
    }

    const tx = await Transaction.create({
      user: userId,                 // <-- tie to user
      type,
      amount,
      category,
      categoryGroup,
      note,
      date: dt,
    });

    res.status(201).json(tx);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

export const listTransactions = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const txs = await Transaction
      .find({ user: userId })       // <-- scope
      .sort({ date: -1, createdAt: -1 });

    res.json(txs);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

export const deleteTransaction = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const { id } = req.params;

    const deleted = await Transaction.findOneAndDelete({ _id: id, user: userId }); // <-- scope + own
    if (!deleted) return res.status(404).json({ message: "Not found" });

    res.json({ message: "Deleted" });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

export const clearAll = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    await Transaction.deleteMany({ user: userId }); // <-- only this user's data
    res.json({ message: "All transactions cleared for current user" });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

export const getTotals = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const agg = await Transaction.aggregate([
      { $match: { user: Transaction.db.base.Types.ObjectId.createFromHexString(userId) } }, // <-- scope
      { $group: { _id: "$type", total: { $sum: "$amount" } } }
    ]);

    const findTotal = (t) => agg.find(a => a._id === t)?.total || 0;
    const income = findTotal("income");
    const expense = findTotal("expense");
    const savings = findTotal("savings");
    const balance = income - expense - savings;

    res.json({ income, expense, savings, balance });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};
