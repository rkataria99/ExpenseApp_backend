import mongoose from "mongoose";

/**
 * Unified transaction model:
 * type: 'income' | 'expense' | 'savings'
 * categoryGroup: expense grouping key (for type='expense'), optional for others
 * category: subcategory text
 */
const TransactionSchema = new mongoose.Schema(
  {
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
    category: { type: String, default: "" },   // concrete category label
    note: { type: String, default: "" },
    date: { type: Date, default: Date.now }
  },
  { timestamps: true }
);

export default mongoose.model("Transaction", TransactionSchema);
