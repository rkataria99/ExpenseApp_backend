// backend/middleware/requireAuth.js
import jwt from "jsonwebtoken";
import User from "../models/User.js";

export default async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) return res.status(401).json({ message: "Auth required" });

    const payload = jwt.verify(token, process.env.JWT_SECRET || "devsecret");
    const user = await User.findById(payload.id).lean();
    if (!user) return res.status(401).json({ message: "Invalid token" });

    req.user = { id: user._id.toString(), email: user.email, name: user.name };
    next();
  } catch (e) {
    res.status(401).json({ message: "Unauthorized" });
  }
}
