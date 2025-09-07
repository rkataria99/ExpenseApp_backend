import Transaction from "../models/Transaction.js";

// Last 7 days daily totals (income, expense, savings)
export const weeklyReport = async (_req, res) => {
  try {
    const now = new Date();
    const start = new Date(now);
    start.setDate(now.getDate() - 6); // include today (7 days total)
    start.setHours(0,0,0,0);

    const data = await Transaction.aggregate([
      { $match: { date: { $gte: start, $lte: now } } },
      {
        $group: {
          _id: {
            day: { $dateToString: { format: "%Y-%m-%d", date: "$date" } },
            type: "$type"
          },
          total: { $sum: "$amount" }
        }
      },
      {
        $group: {
          _id: "$_id.day",
          items: { $push: { type: "$_id.type", total: "$total" } }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Normalize to include all days and all types
    const days = [...Array(7).keys()].map(i => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const key = d.toISOString().slice(0,10);
      return key;
    });

    const result = days.map(day => {
      const entry = data.find(d => d._id === day);
      const totals = { income: 0, expense: 0, savings: 0 };
      if (entry) {
        entry.items.forEach(i => totals[i.type] = i.total);
      }
      return { day, ...totals };
    });

    res.json(result);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};
