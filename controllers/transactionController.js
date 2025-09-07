import Transaction from "../models/Transaction.js";

export const createTransaction = async (req, res) => {
  try {
    const { type, amount, category, categoryGroup, note, date } = req.body;
    if (!type || amount == null) {
      return res.status(400).json({ message: "type and amount are required" });
    }
    const tx = await Transaction.create({ type, amount, category, categoryGroup, note, date });
    res.status(201).json(tx);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

export const listTransactions = async (req, res) => {
  try {
    const txs = await Transaction.find().sort({ date: -1, createdAt: -1 });
    res.json(txs);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

export const deleteTransaction = async (req, res) => {
  try {
    const { id } = req.params;
    await Transaction.findByIdAndDelete(id);
    res.json({ message: "Deleted" });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

export const clearAll = async (_req, res) => {
  try {
    await Transaction.deleteMany({});
    res.json({ message: "All transactions cleared" });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

export const getTotals = async (_req, res) => {
  try {
    const agg = await Transaction.aggregate([
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
