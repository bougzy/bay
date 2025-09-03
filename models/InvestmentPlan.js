// models/InvestmentPlan.js
const mongoose = require("mongoose");

const investmentPlanSchema = new mongoose.Schema({
  name: { type: String, required: true },
  roiPercent: { type: Number, required: true }, // e.g., 10 (means 10%)
  durationDays: { type: Number, required: true }, // how long in days
  frequency: { type: String, enum: ["daily","weekly","monthly","once"], default: "once" }, // optional
  minAmount: { type: Number, default: 1 },
  maxAmount: { type: Number, default: 1000000 },
  description: { type: String, default: "" },
  active: { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.model("InvestmentPlan", investmentPlanSchema);
