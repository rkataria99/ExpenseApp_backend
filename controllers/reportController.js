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
    const userId = new ObjectId(req.user.id);
    const tz = req.query.tz || process.env.TZ || "UTC";
    const now = new Date();

    const data = await Transaction.aggregate([
      {
        $match: {
          user: userId,
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

    //  Build Mon..Sun keys in tz WITHOUT parsing locale strings back into Date
    const tzTodayISO = (tzName, d = new Date()) =>
      new Intl.DateTimeFormat("en-CA", {
        timeZone: tzName,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(d); // YYYY-MM-DD

    const plainDateUTC = (ymd) => {
      const [y, m, day] = ymd.split("-").map(Number);
      return new Date(Date.UTC(y, m - 1, day)); // UTC midnight for that calendar date
    };

    const weekDaysISO = (tzName, d = new Date()) => {
      const todayISO = tzTodayISO(tzName, d); // calendar date in tz
      const today = plainDateUTC(todayISO);   // treat as "plain date"
      const dow = today.getUTCDay();          // 0=Sun..6=Sat
      const diffToMonday = dow === 0 ? -6 : 1 - dow;

      const monday = new Date(today);
      monday.setUTCDate(today.getUTCDate() + diffToMonday);

      return Array.from({ length: 7 }, (_, i) => {
        const x = new Date(monday);
        x.setUTCDate(monday.getUTCDate() + i);
        return x.toISOString().slice(0, 10); // YYYY-MM-DD
      });
    };

    const days = weekDaysISO(tz, now);

    //  Faster lookup than data.find()
    const dayMap = Object.fromEntries(data.map((d) => [d._id, d.items]));

    const result = days.map((day) => {
      const items = dayMap[day] || [];
      const totals = { income: 0, expense: 0, savings: 0 };
      items.forEach((i) => (totals[i.type] = i.total));
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
    const nextYear = new Date(year + 1, 0, 1, 0, 0, 0, 0); // exclusive

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

// Total (all-time, per-user, timezone-aware, grouped by month)
export const totalReport = async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user.id);
    const tz = req.query.tz || process.env.TZ || "UTC";

    // 1) earliest doc for THIS user (uses your {user, date} index)
    const firstDoc = await Transaction
      .findOne({ user: userId })
      .sort({ date: 1 })
      .lean();

    if (!firstDoc) {
      return res.json({
        period: "total",
        data: [],
        totals: { income: 0, expense: 0, savings: 0, balance: 0 }
      });
    }

    // 2) aggregate all history for THIS user, month-bucketed in tz
    const data = await Transaction.aggregate([
      { $match: { user: userId } },
      {
        $group: {
          _id: {
            month: { $dateToString: { format: "%Y-%m", date: "$date", timezone: tz } },
            type: "$type"
          },
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

    // 3) build month keys from first month to current month (both in tz)
    const fmtYM = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit" });
    const firstMonthStr = fmtYM.format(new Date(firstDoc.date));
    const nowMonthStr = fmtYM.format(new Date());
    const nextYM = (ym) => {
      const [y, m] = ym.split("-").map(Number);
      const ny = m === 12 ? y + 1 : y;
      const nm = m === 12 ? 1 : m + 1;
      return `${ny}-${String(nm).padStart(2, "0")}`;
    };

    const keys = [];
    for (let k = firstMonthStr; ; k = nextYM(k)) {
      keys.push(k);
      if (k === nowMonthStr) break;
    }

    // 4) fill series, compute totals/balance
    const map = Object.fromEntries(
      data.map(d => [d._id, Object.fromEntries(d.items.map(i => [i.type, i.total]))])
    );

    const series = keys.map(k => ({
      month: k,
      income: map[k]?.income ?? 0,
      expense: map[k]?.expense ?? 0,
      savings: map[k]?.savings ?? 0
    }));

    const totals = series.reduce(
      (a, r) => ({ income: a.income + r.income, expense: a.expense + r.expense, savings: a.savings + r.savings }),
      { income: 0, expense: 0, savings: 0 }
    );
    const balance = totals.income - totals.expense - totals.savings;

    res.json({ period: "total", data: series, totals: { ...totals, balance } });
  } catch (e) {
    console.error("totalReport error:", e);
    res.status(500).json({ message: e.message });
  }
};
// at the bottom of controllers/reportController.js
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
