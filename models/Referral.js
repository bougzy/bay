// models/Referral.js
const mongoose = require("mongoose");

const referralSchema = new mongoose.Schema({
  referrer: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }, // who gets the bonus
  referredUser: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }, // new user
  amount: { type: Number, required: true, default: 0 }, // bonus amount
  status: { type: String, enum: ["pending", "credited"], default: "pending" },
  reason: { type: String }, // e.g., "bonus on invest"
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Referral", referralSchema);
