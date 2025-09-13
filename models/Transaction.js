// backend/models/Transaction.js
import mongoose from "mongoose";

/**
 * Unified transaction model:
 * type: 'income' | 'expense' | 'savings'
 * categoryGroup: expense grouping key (for type='expense'), optional for others
 * category: subcategory text
 * user: reference to the owner of the transaction
 */
const TransactionSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }, // NEW: owner of the record

    type: { type: String, enum: ["income", "expense", "savings"], required: true },
    amount: { type: Number, required: true, min: 0 },
    categoryGroup: {
      type: String,
      enum: [
        "home_share",   // Direct home share (includes grocery)
        "self",         // Food, Movies, Party, Transport, Outings, Other
        "gifts_family", // Gifts & family dinners/outings
        "trip_family",  // Trips (family)
        "trip_self"     // Trips (self)
      ],
      default: undefined
    },
    category: { type: String, default: "" }, // concrete category label
    note: { type: String, default: "" },
    date: { type: Date, default: Date.now }
  },
  { timestamps: true }
);

// For faster queries by user + date
TransactionSchema.index({ user: 1, date: 1 });

export default mongoose.model("Transaction", TransactionSchema);
