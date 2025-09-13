// backend/server.js
import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import morgan from "morgan";
import { connectDB } from "./config/db.js";

import authRoutes from "./routes/auth.js";              // NEW (public)
import requireAuth from "./middleware/requireAuth.js";  // NEW

import transactionRoutes from "./routes/transactionRoutes.js";
import reportRoutes from "./routes/reportRoutes.js";

dotenv.config();

const app = express();
app.use(express.json());
app.use(morgan("dev"));

// CORS
const ORIGIN = process.env.CLIENT_ORIGIN || "http://localhost:5173";
app.use(cors({ origin: ORIGIN }));

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
