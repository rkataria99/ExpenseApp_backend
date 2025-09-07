import Transaction from "../models/Transaction.js";

// ---------- helpers ----------
const monthKey = { $dateToString: { format: "%Y-%m", date: "$date" } };

// build series with zeros for missing periods
function fillSeries(keys, docs, typeKeys = ["income", "expense", "savings"]) {
  // docs: [{ _id: "YYYY-MM" | "YYYY-MM-DD", items: [{type,total}]}]
  const map = Object.fromEntries(
    docs.map(d => [d._id, Object.fromEntries(d.items.map(i => [i.type, i.total]))])
  );
  return keys.map(k => {
    const item = map[k] || {};
    const out = { period: k };
    typeKeys.forEach(t => { out[t] = item[t] || 0; });
    return out;
  });
}

// ---------- Weekly (unchanged response shape: array) ----------
export const weeklyReport = async (_req, res) => {
  try {
    const now = new Date();
    const start = new Date(now);
    start.setDate(now.getDate() - 6); // include today (7 days total)
    start.setHours(0, 0, 0, 0);

    const data = await Transaction.aggregate([
      { $match: { date: { $gte: start, $lte: now } } },
      {
        $group: {
          _id: {
            day: { $dateToString: { format: "%Y-%m-%d", date: "$date" } },
            type: "$type",
          },
          total: { $sum: "$amount" },
        },
      },
      {
        $group: {
          _id: "$_id.day",
          items: { $push: { type: "$_id.type", total: "$total" } },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    // Normalize to include all days and all types
    const days = [...Array(7).keys()].map((i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const key = d.toISOString().slice(0, 10);
      return key;
    });

    const result = days.map((day) => {
      const entry = data.find((d) => d._id === day);
      const totals = { income: 0, expense: 0, savings: 0 };
      if (entry) {
        entry.items.forEach((i) => (totals[i.type] = i.total));
      }
      return { day, ...totals };
    });

    // IMPORTANT: keep legacy shape = array
    res.json(result);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

// ---------- Monthly (last 12 months; returns { period, data }) ----------
export const monthlyReport = async (_req, res) => {
  try {
    const now = new Date();
    const start = new Date(now);
    start.setMonth(now.getMonth() - 11);
    start.setDate(1);
    start.setHours(0, 0, 0, 0);

    const data = await Transaction.aggregate([
      { $match: { date: { $gte: start, $lte: now } } },
      {
        $group: {
          _id: { month: monthKey, type: "$type" },
          total: { $sum: "$amount" },
        },
      },
      {
        $group: {
          _id: "$_id.month",
          items: { $push: { type: "$_id.type", total: "$total" } },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    // last 12 months keys "YYYY-MM"
    const keys = [];
    const cursor = new Date(start);
    for (let i = 0; i < 12; i++) {
      const y = cursor.getFullYear();
      const m = String(cursor.getMonth() + 1).padStart(2, "0");
      keys.push(`${y}-${m}`);
      cursor.setMonth(cursor.getMonth() + 1);
    }

    const series = fillSeries(keys, data);
    const result = series.map((d) => ({
      month: d.period,
      income: d.income,
      expense: d.expense,
      savings: d.savings,
    }));

    res.json({ period: "monthly", data: result });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

// ---------- Total (all-time, grouped by month; returns { period, data, totals }) ----------
export const totalReport = async (_req, res) => {
  try {
    const first = await Transaction.findOne().sort({ date: 1 }).lean();
    if (!first) return res.json({ period: "total", data: [], totals: { income: 0, expense: 0, savings: 0, balance: 0 } });

    const data = await Transaction.aggregate([
      {
        $group: {
          _id: { month: monthKey, type: "$type" },
          total: { $sum: "$amount" },
        },
      },
      {
        $group: {
          _id: "$_id.month",
          items: { $push: { type: "$_id.type", total: "$total" } },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    // month keys from first month to current month
    const start = new Date(first.date);
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    const now = new Date();
    now.setDate(1);
    const keys = [];
    const cursor = new Date(start);
    while (cursor <= now) {
      const y = cursor.getFullYear();
      const m = String(cursor.getMonth() + 1).padStart(2, "0");
      keys.push(`${y}-${m}`);
      cursor.setMonth(cursor.getMonth() + 1);
    }

    const series = fillSeries(keys, data);
    const result = series.map((d) => ({
      month: d.period,
      income: d.income,
      expense: d.expense,
      savings: d.savings,
    }));

    const totals = result.reduce(
      (acc, r) => {
        acc.income += r.income;
        acc.expense += r.expense;
        acc.savings += r.savings;
        return acc;
      },
      { income: 0, expense: 0, savings: 0 }
    );
    const balance = totals.income - totals.expense - totals.savings;

    res.json({ period: "total", data: result, totals: { ...totals, balance } });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};
