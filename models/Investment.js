// models/Investment.js
const mongoose = require("mongoose");

const investmentSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  plan: { type: mongoose.Schema.Types.ObjectId, ref: "InvestmentPlan", required: true },
  amount: { type: Number, required: true },
  startDate: { type: Date, default: Date.now },
  endDate: { type: Date },           // computed on subscribe or set by admin
  status: { type: String, enum: ["active","completed","cancelled"], default: "active" },
  profit: { type: Number, default: 0 }, // set when completed
  backdated: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.model("Investment", investmentSchema);
