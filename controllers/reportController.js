// backend/controllers/reportController.js
import mongoose from "mongoose";
import Transaction from "../models/Transaction.js";

const { ObjectId } = mongoose.Types;

// ---------- helpers ----------
const monthKey = { $dateToString: { format: "%Y-%m", date: "$date" } };

// build series with zeros for missing periods
function fillSeries(keys, docs, typeKeys = ["income", "expense", "savings"]) {
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

// ---------- THIS WEEK (Mon–Sun) totals with timezone support (SCOPED TO USER) ----------
export const weeklyReport = async (req, res) => {
  try {
    const userId = new ObjectId(req.user.id);               // <-- scope
    const tz = req.query.tz || process.env.TZ || "UTC";
    const now = new Date();

    const data = await Transaction.aggregate([
      {
        $match: {
          user: userId,                                      // <-- scope
          $expr: {
            $eq: [
              { $dateTrunc: { date: "$date", unit: "week", timezone: tz, startOfWeek: "Monday" } },
              { $dateTrunc: { date: now, unit: "week", timezone: tz, startOfWeek: "Monday" } }
            ]
          }
        }
      },
      {
        $group: {
          _id: {
            day: { $dateToString: { format: "%Y-%m-%d", date: "$date", timezone: tz } },
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

    // Build Monday..Sunday in the SAME timezone (tz)
    const toLocalISO = (d) =>
      new Date(d).toLocaleDateString("en-CA", { timeZone: tz }); // YYYY-MM-DD

    // Compute Monday 00:00 in tz
    const localNow = new Date(now.toLocaleString("en-US", { timeZone: tz }));
    const dow = localNow.getDay(); // 0=Sun..6=Sat (in tz)
    const diffToMonday = dow === 0 ? -6 : 1 - dow;
    const monday = new Date(localNow);
    monday.setDate(localNow.getDate() + diffToMonday);
    monday.setHours(0, 0, 0, 0);

    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      return toLocalISO(d);
    });

    const result = days.map((day) => {
      const entry = data.find((d) => d._id === day);
      const totals = { income: 0, expense: 0, savings: 0 };
      if (entry) entry.items.forEach((i) => (totals[i.type] = i.total));
      return { day, ...totals };
    });

    res.json(result);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

// ---------- Monthly (BY YEAR; returns { period:'monthly', year, data, carry, latestMonth }) ----------
export const monthlyReport = async (req, res) => {
  try {
    const userId = new ObjectId(req.user.id);               // <-- scope
    const now = new Date();
    const year = Number(req.query.year) || now.getFullYear();

    const yearStart = new Date(year, 0, 1, 0, 0, 0, 0);     // inclusive
    const nextYear  = new Date(year + 1, 0, 1, 0, 0, 0, 0); // exclusive

    // 1) Flow in the selected year
    const flows = await Transaction.aggregate([
      { $match: { user: userId, date: { $gte: yearStart, $lt: nextYear } } },  // <-- scope
      { $group: { _id: { month: monthKey, type: "$type" }, total: { $sum: "$amount" } } },
      { $group: { _id: "$_id.month", items: { $push: { type: "$_id.type", total: "$total" } } } },
      { $sort: { _id: 1 } },
    ]);

    // 2) Carry (everything BEFORE this year)
    const carryAgg = await Transaction.aggregate([
      { $match: { user: userId, date: { $lt: yearStart } } },                  // <-- scope
      { $group: { _id: "$type", total: { $sum: "$amount" } } },
    ]);
    const carry = { income: 0, expense: 0, savings: 0 };
    carryAgg.forEach(i => { carry[i._id] = i.total; });

    // 3) Build 12 month keys
    const keys = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`);

    // 4) Fill series for the year (raw per-month flows)
    const map = Object.fromEntries(
      flows.map(d => [d._id, Object.fromEntries(d.items.map(i => [i.type, i.total]))])
    );
    const series = keys.map(k => ({
      month: k,
      income: map[k]?.income || 0,
      expense: map[k]?.expense || 0,
      savings: map[k]?.savings || 0,
    }));

    // 5) latestMonth: stop at current month for current year; full (12) for past years
    const latestMonth = (year === now.getFullYear()) ? (now.getMonth() + 1) : 12;

    res.json({
      period: "monthly",
      year,
      data: series,
      carry,
      latestMonth
    });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

// ---------- Total (all-time; returns { period, data, totals }) ----------
export const totalReport = async (req, res) => {
  try {
    const userId = new ObjectId(req.user.id);               // <-- scope

    const first = await Transaction
      .findOne({ user: req.user.id })                       // <-- scope
      .sort({ date: 1 })
      .lean();

    if (!first) {
      return res.json({
        period: "total",
        data: [],
        totals: { income: 0, expense: 0, savings: 0, balance: 0 }
      });
    }

    const now = new Date();
    const data = await Transaction.aggregate([
      { $match: { user: userId, date: { $gte: new Date(first.date), $lte: now } } }, // <-- scope
      {
        $group: {
          _id: { month: monthKey, type: "$type" },
          total: { $sum: "$amount" }
        }
      },
      {
        $group: {
          _id: "$_id.month",
          items: { $push: { type: "$_id.type", total: "$total" } }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    const start = new Date(first.date); start.setDate(1); start.setHours(0, 0, 0, 0);
    const end = new Date(now); end.setDate(1); end.setHours(0, 0, 0, 0);

    const keys = [];
    const cursor = new Date(start);
    while (cursor <= end) {
      const y = cursor.getFullYear();
      const m = String(cursor.getMonth() + 1).padStart(2, "0");
      keys.push(`${y}-${m}`);
      cursor.setMonth(cursor.getMonth() + 1);
    }

    const map = Object.fromEntries(
      data.map(d => [d._id, Object.fromEntries(d.items.map(i => [i.type, i.total]))])
    );
    const series = keys.map(k => ({
      month: k,
      income: map[k]?.income || 0,
      expense: map[k]?.expense || 0,
      savings: map[k]?.savings || 0
    }));

    const totals = series.reduce((acc, r) => {
      acc.income += r.income; acc.expense += r.expense; acc.savings += r.savings; return acc;
    }, { income: 0, expense: 0, savings: 0 });
    const balance = totals.income - totals.expense - totals.savings;

    res.json({ period: "total", data: series, totals: { ...totals, balance } });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

// ---------- Years list (kept simple/global as before) ----------
export const reportYears = async (_req, res) => {
  try {
    const nowYear = new Date().getFullYear();
    const start = nowYear - 5;
    const end = nowYear + 5;
    const years = [];
    for (let y = start; y <= end; y++) years.push(y);
    res.json({ years });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};
