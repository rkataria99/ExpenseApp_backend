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
// CORS  ----------------------------------------------------
const rawOrigins =
  process.env.CLIENT_ORIGINS ||
  process.env.CLIENT_ORIGIN ||
  ""; // comma-separated, e.g. "https://expense-app-frontend-ten.vercel.app,http://localhost:5173"

const ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "https://expense-app-frontend-ten.vercel.app",
  ...rawOrigins.split(",").map(s => s.trim()).filter(Boolean),
];

const corsOptions = {
  origin(origin, cb) {
    // allow server-to-server/curl (no Origin header)
    if (!origin) return cb(null, true);

    const allowed =
      ALLOWED_ORIGINS.includes(origin) ||
      /\.vercel\.app$/.test(origin); // allow any *.vercel.app (optional)

    return allowed ? cb(null, true) : cb(new Error(`CORS blocked for ${origin}`));
  },
  // set to true if you use cookies; false if you use Authorization header only
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "Accept"],
  exposedHeaders: ["Authorization"],
  optionsSuccessStatus: 204,
};

app.use(cors(corsOptions));
// Reply to preflights WITH THE SAME OPTIONS as above
app.options("*", cors(corsOptions));


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
