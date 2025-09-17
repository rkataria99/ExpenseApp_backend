// backend/server.js
import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import morgan from "morgan";
import { connectDB } from "./config/db.js";

import authRoutes from "./routes/Auth.js";              // NEW (public)
import requireAuth from "./middleware/requireAuth.js";  // NEW

import transactionRoutes from "./routes/transactionRoutes.js";
import reportRoutes from "./routes/reportRoutes.js";

dotenv.config();

const app = express();
app.use(express.json());
app.use(morgan("dev"));

// CORS
const rawOrigins = process.env.CLIENT_ORIGINS || process.env.CLIENT_ORIGIN || "http://localhost:5173";
const WHITELIST = rawOrigins
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);

app.use(cors({
  origin: (origin, cb) => {
    // allow server-to-server / curl / Postman (no Origin header)
    if (!origin) return cb(null, true);

    const allowed =
      WHITELIST.includes(origin) ||
      /\.vercel\.app$/.test(origin);   // allow any *.vercel.app by default

    return allowed ? cb(null, true) : cb(new Error("Not allowed by CORS"));
  },
  methods: ["GET","POST","PUT","PATCH","DELETE","OPTIONS"],
  allowedHeaders: ["Content-Type","Authorization"]
}));

// Fast preflight
app.options("*", cors());


// Health
app.get("/", (_req, res) => res.send("Expense Tracker API running"));

// Public auth endpoints
app.use("/api/auth", authRoutes);

// Protected app endpoints (JWT required)
app.use("/api/transactions", requireAuth, transactionRoutes);
app.use("/api/reports", requireAuth, reportRoutes);

// Boot
const PORT = process.env.PORT || 5000;
connectDB(process.env.MONGO_URI).then(() => {
  app.listen(PORT, () => console.log(`🚀 Server listening on ${PORT}`));
});
