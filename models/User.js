// const mongoose = require("mongoose");
// const bcrypt = require("bcryptjs");

// const userSchema = new mongoose.Schema({
//   username: { type: String, required: true },
//   email: { type: String, required: true, unique: true },
//   password: { type: String, required: true },
//   role: { type: String, enum: ["user", "admin"], default: "user" },
//   // Add inside schema
//   resetPasswordToken: String,
//   resetPasswordExpire: Date,

//   // Referral system
//   referralCode: { type: String, unique: true },
//   referredBy: { type: String },

//   // Wallet balances
//   balance: { type: Number, default: 0 },
//   profit: { type: Number, default: 0 },
//   totalDeposits: { type: Number, default: 0 },
//   totalWithdrawals: { type: Number, default: 0 },

// }, { timestamps: true });

// // Hash password before save
// userSchema.pre("save", async function (next) {
//   if (!this.isModified("password")) return next();
//   this.password = await bcrypt.hash(this.password, 10);
//   next();
// });

// // Compare password
// userSchema.methods.matchPassword = async function (enteredPassword) {
//   return await bcrypt.compare(enteredPassword, this.password);
// };

// module.exports = mongoose.model("User", userSchema);



const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema({
  username: { type: String, required: true },
  email: { 
    type: String, 
    required: true, 
    unique: true, 
    match: [/^\S+@\S+\.\S+$/, "Please use a valid email address"]
  },
  password: { type: String, required: true },
  role: { type: String, enum: ["user", "admin"], default: "user" },

  // Password reset
  resetPasswordToken: String,
  resetPasswordExpire: Date,

  // Referral system
  // models/User.js (snippet - update referredBy & referralEarnings)
    referredBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    referralEarnings: { type: Number, default: 0 },
    referrals: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }], // optional: users they referred

  // Wallet balances
  balance: { type: Number, default: 0 },
  profit: { type: Number, default: 0 },
  totalDeposits: { type: Number, default: 0 },
  totalWithdrawals: { type: Number, default: 0 },

}, { timestamps: true });

// Hash password before save
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

// Generate referral code if not present
userSchema.pre("save", function (next) {
  if (!this.referralCode) {
    this.referralCode = Math.random().toString(36).substring(2, 8).toUpperCase();
  }
  next();
});

// Compare password
userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model("User", userSchema);
