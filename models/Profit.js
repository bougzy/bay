// models/Profit.js
const mongoose = require("mongoose");

const profitSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  investment: { type: mongoose.Schema.Types.ObjectId, ref: "Investment", required: false },
  amount: { type: Number, required: true },
  description: { type: String, default: "Investment profit credit" },
  date: { type: Date, default: Date.now }
}, { timestamps: true });

module.exports = mongoose.model("Profit", profitSchema);
