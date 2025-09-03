const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    type: {
      type: String,
      enum: ["deposit", "withdrawal"],
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      
    },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
    txId: {
      type: String, // transaction ID or reference from user
    },
    proof: {
      type: String, // URL to uploaded screenshot (if provided)
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User", // Admin ID
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

// Use module.exports instead of export default
module.exports = mongoose.model("Transaction", transactionSchema);
