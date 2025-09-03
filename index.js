// index.js
require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const multer = require("multer");
const nodemailer = require("nodemailer");
const path = require("path");


const app = express();
app.use(express.json());

// ================= MongoDB Connection =================
mongoose.connect(process.env.MONGO_URI || "mongodb+srv://montracorp:montracorp@montracorp.ypvutxx.mongodb.net/montracorp", {

}).then(() => console.log("MongoDB connected"))
  .catch(err => console.error("MongoDB connection error:", err));

  

// ================= Models =================

// User Model

// Admin Model
const adminSchema = new mongoose.Schema({
  email: { type: String, unique: true, required: true },
  password: { type: String, required: true, select: false },
  role: { type: String, default: "admin" }
}, { timestamps: true });

adminSchema.pre("save", async function(next) {
  if (!this.isModified("password")) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

const Admin = mongoose.model("Admin", adminSchema);

// Transaction Model
const transactionSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  type: { type: String, enum: ["deposit", "withdrawal"], required: true },
  amount: { type: Number, required: true },
  status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending" },
  adminNote: String,
  createdAt: { type: Date, default: Date.now }
});

const Transaction = mongoose.model("Transaction", transactionSchema);

// ================= Middleware =================

const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";

const protect = async (req, res, next) => {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ message: "Not authorized, no token" });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "supersecretjwtkey");
    const user = await User.findById(decoded.id).select("-password");
    if (!user) return res.status(401).json({ message: "Not authorized" });
    if (user.isBlocked) return res.status(403).json({ message: "Account blocked" });
    req.user = user;
    next();
  } catch (err) {
    res.status(401).json({ message: "Not authorized, token failed" });
  }
};

const adminAuth = (req, res, next) => {
  const username = req.headers["admin-username"];
  const password = req.headers["admin-password"];
  if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
    req.admin = { username };
    return next();
  }
  res.status(403).json({ message: "Admin access only" });
};

// ================= Utils =================

const generateToken = (id, role) => {
  return jwt.sign({ id, role }, process.env.JWT_SECRET || "supersecretjwtkey", { expiresIn: "7d" });
};

// Dummy sendNotification
const sendNotification = async (userId, title, message, type) => {
  console.log(`[Notification] User: ${userId}, ${title}: ${message} (${type})`);
};

// Dummy email transporter (update with real SMTP)
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.example.com",
  port: process.env.SMTP_PORT || 587,
  auth: {
    user: process.env.SMTP_USER || "user@example.com",
    pass: process.env.SMTP_PASS || "password"
  }
});

// ================= Controllers =================


// --- Transactions (Admin) ---
const listTransactions = async (req, res) => {
  try {
    const { type, status, userId } = req.query;
    const filter = {};
    if (type) filter.type = type;
    if (status) filter.status = status;
    if (userId) filter.user = userId;
    const data = await Transaction.find(filter).populate("user", "name email role").sort({ createdAt: -1 });
    res.json(data);
  } catch (e) { res.status(500).json({ message: e.message }); }
};

const approveDeposit = async (req, res) => {
  try {
    const { transactionId } = req.params;
    const tx = await Transaction.findById(transactionId);
    if (!tx || tx.type !== "deposit") return res.status(404).json({ message: "Deposit not found" });
    if (tx.status === "approved") return res.status(400).json({ message: "Already approved" });
    tx.status = "approved"; await tx.save();
    const user = await User.findById(tx.user);
    user.walletBalance += tx.amount; await user.save();
    await sendNotification(user._id, "Deposit Approved", `Your deposit of $${tx.amount} was approved.`, "deposit");
    res.json({ message: "Deposit approved", transaction: tx, walletBalance: user.walletBalance });
  } catch (e) { res.status(500).json({ message: e.message }); }
};

const rejectDeposit = async (req, res) => {
  try {
    const { transactionId } = req.params;
    const { adminNote } = req.body;
    const tx = await Transaction.findById(transactionId);
    if (!tx || tx.type !== "deposit") return res.status(404).json({ message: "Deposit not found" });
    if (tx.status === "rejected") return res.status(400).json({ message: "Already rejected" });
    tx.status = "rejected"; if (adminNote) tx.adminNote = adminNote; await tx.save();
    await sendNotification(tx.user, "Deposit Rejected", `Your deposit of $${tx.amount} was rejected.`, "deposit");
    res.json({ message: "Deposit rejected", transaction: tx });
  } catch (e) { res.status(500).json({ message: e.message }); }
};

const approveWithdrawal = async (req, res) => {
  try {
    const { transactionId } = req.params;
    const tx = await Transaction.findById(transactionId);
    if (!tx || tx.type !== "withdrawal") return res.status(404).json({ message: "Withdrawal not found" });
    if (tx.status === "approved") return res.status(400).json({ message: "Already approved" });
    const user = await User.findById(tx.user);
    if (user.walletBalance < tx.amount) return res.status(400).json({ message: "Insufficient wallet" });
    tx.status = "approved"; await tx.save();
    user.walletBalance -= tx.amount; await user.save();
    await sendNotification(user._id, "Withdrawal Approved", `Your withdrawal of $${tx.amount} was approved.`, "withdrawal");
    res.json({ message: "Withdrawal approved", transaction: tx, walletBalance: user.walletBalance });
  } catch (e) { res.status(500).json({ message: e.message }); }
};

const rejectWithdrawal = async (req, res) => {
  try {
    const { transactionId } = req.params;
    const { adminNote } = req.body;
    const tx = await Transaction.findById(transactionId);
    if (!tx || tx.type !== "withdrawal") return res.status(404).json({ message: "Withdrawal not found" });
    if (tx.status === "rejected") return res.status(400).json({ message: "Already rejected" });
    tx.status = "rejected"; if (adminNote) tx.adminNote = adminNote; await tx.save();
    await sendNotification(tx.user, "Withdrawal Rejected", `Your withdrawal of $${tx.amount} was rejected.`, "withdrawal");
    res.json({ message: "Withdrawal rejected", transaction: tx });
  } catch (e) { res.status(500).json({ message: e.message }); }
};

const manualBalanceUpdate = async (req, res) => {
  try {
    const { userId } = req.params;
    const { walletBalance } = req.body;
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });
    if (walletBalance !== undefined) user.walletBalance = Number(walletBalance);
    await user.save();
    await sendNotification(user._id, "Wallet Updated", `Admin updated your wallet to $${user.walletBalance}`, "system");
    res.json({ message: "Wallet updated", walletBalance: user.walletBalance });
  } catch (e) { res.status(500).json({ message: e.message }); }
};

// ================= MongoDB Models =================
// Update User model to include referralCode
// ================= MongoDB User Model =================
const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, unique: true, required: true },
  password: { type: String, select: false, required: true },
  role: { type: String, default: "user" },
  walletBalance: { type: Number, default: 0 },
  referredBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  referrals: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  referralCode: { type: String, unique: true },
  resetPasswordToken: String,
  resetPasswordExpire: Date,
  isBlocked: { type: Boolean, default: false },
}, { timestamps: true });

// Hash password & generate referral code
userSchema.pre("save", async function(next) {
  if (this.isModified("password")) {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
  }

  if (!this.referralCode) {
    let code, exists = true;
    while (exists) {
      code = crypto.randomBytes(3).toString("hex");
      const user = await User.findOne({ referralCode: code.toUpperCase() });
      if (!user) exists = false;
    }
    this.referralCode = code.toUpperCase();
  }

  next();
});

// Method to compare passwords
userSchema.methods.matchPassword = async function(enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// Create User model
const User = mongoose.model("User", userSchema);

// ================= Controllers =================

// Get my referrals
const getMyReferrals = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).populate(
      "referrals",
      "name email walletBalance createdAt"
    );
    res.json({
      referralCode: user.referralCode,
      totalReferrals: user.referrals.length,
      referrals: user.referrals
    });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};


const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email }).select("+password");
    if (user && await user.matchPassword(password)) {
      if (user.isBlocked) return res.status(403).json({ message: "Account blocked" });
      return res.json({ _id: user._id, name: user.name, email, token: generateToken(user._id, user.role) });
    }
    res.status(401).json({ message: "Invalid credentials" });
  } catch (e) { res.status(500).json({ message: e.message }); }
};

// ================= User Registration Controller =================
const register = async (req, res) => {
  try {
    const { name, email, password, referralCode } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: "Name, email, and password are required" });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "Email already registered" });
    }

    let referredBy = null;
    if (referralCode) {
      const referrer = await User.findOne({ referralCode: referralCode.toUpperCase() });
      if (referrer) {
        referredBy = referrer._id;
      }
    }

    const user = await User.create({
      name,
      email,
      password,
      referredBy
    });

    // If referred, update referrer's referrals array
    if (referredBy) {
      await User.findByIdAndUpdate(referredBy, { $push: { referrals: user._id } });
    }

    res.status(201).json({
      _id: user._id,
      name: user.name,
      email: user.email,
      token: generateToken(user._id, user.role)
    });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};


// --- Password Reset ---
const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: "User not found" });

    const resetToken = crypto.randomBytes(20).toString("hex");
    user.resetPasswordToken = crypto.createHash("sha256").update(resetToken).digest("hex");
    user.resetPasswordExpire = Date.now() + 10 * 60 * 1000;
    await user.save({ validateBeforeSave: false });

    const resetUrl = `${process.env.CLIENT_URL}/reset-password/${resetToken}`;
    await transporter.sendMail({ to: user.email, subject: "Reset Password", html: `<a href="${resetUrl}">Reset</a>` });
    res.json({ message: "Password reset link sent" });
  } catch (e) { res.status(500).json({ message: e.message }); }
};

const resetPassword = async (req, res) => {
  try {
    const token = crypto.createHash("sha256").update(req.params.token).digest("hex");
    const user = await User.findOne({ resetPasswordToken: token, resetPasswordExpire: { $gt: Date.now() } });
    if (!user) return res.status(400).json({ message: "Invalid or expired token" });
    user.password = req.body.password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;
    await user.save();
    res.json({ message: "Password reset successful" });
  } catch (e) { res.status(500).json({ message: e.message }); }
};




// ================= Investment Plan Model =================
const investmentPlanSchema = new mongoose.Schema({
  name: { type: String, required: true },           // Plan name
  description: String,                              // Plan description
  wallets: [{ type: String, required: true }],      // Array of wallet addresses
  minAmount: { type: Number, required: true },      // Minimum deposit amount
  maxAmount: { type: Number, required: true },      // Maximum deposit amount
}, { timestamps: true });

const InvestmentPlan = mongoose.model("InvestmentPlan", investmentPlanSchema);

// ================= Controllers =================

// Create default investment plans if none exist
const createDefaultPlans = async () => {
  const count = await InvestmentPlan.countDocuments();
  if (count === 0) {
    const plans = [
      {
        name: "Starter Plan",
        description: "Low risk, entry-level plan for beginners.",
        wallets: [
          "0xStarterWallet1ABC123",
          "0xStarterWallet2DEF456",
          "0xStarterWallet3GHI789"
        ],
        minAmount: 50,
        maxAmount: 500
      },
      {
        name: "Pro Plan",
        description: "Medium risk, higher returns for experienced investors.",
        wallets: [
          "0xProWallet1JKL123",
          "0xProWallet2MNO456",
          "0xProWallet3PQR789"
        ],
        minAmount: 501,
        maxAmount: 2000
      },
      {
        name: "Elite Plan",
        description: "High risk, maximum potential returns for advanced investors.",
        wallets: [
          "0xEliteWallet1STU123",
          "0xEliteWallet2VWX456",
          "0xEliteWallet3YZA789"
        ],
        minAmount: 2001,
        maxAmount: 10000
      }
    ];

    await InvestmentPlan.insertMany(plans);
    console.log("Default investment plans created");
  }
};

// Get all investment plans
const getInvestmentPlans = async (req, res) => {
  try {
    const plans = await InvestmentPlan.find();
    res.json(plans);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

// ================= Express Routes =================

// Route to get all plans
app.get("/api/investment-plans", getInvestmentPlans);

// Initialize default plans
createDefaultPlans();



// ================= Trading Models =================

// Admin Trader Profile (optional for multiple admins)
const traderProfileSchema = new mongoose.Schema({
  admin: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", unique: true },
  displayName: { type: String, required: true },
  bio: String
}, { timestamps: true });

const TraderProfile = mongoose.model("TraderProfile", traderProfileSchema);

// Trade Schema
const tradeSchema = new mongoose.Schema({
  trader: { type: mongoose.Schema.Types.ObjectId, ref: "TraderProfile" }, // Trader who created the trade
  pair: { type: String, required: true }, // e.g., BTC/USD
  type: { type: String, enum: ["buy", "sell"], required: true },
  amount: { type: Number, required: true }, // Amount in USD
  status: { type: String, enum: ["pending", "executed", "cancelled"], default: "pending" },
  createdAt: { type: Date, default: Date.now },
}, { timestamps: true });

const Trade = mongoose.model("Trade", tradeSchema);

// CopyTrade Schema to track user trades following a trader
const copyTradeSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  trade: { type: mongoose.Schema.Types.ObjectId, ref: "Trade" },
  amount: { type: Number, required: true }, // Amount user copied
  mode: { type: String, enum: ["demo", "live"], default: "demo" }, // Demo or live
  status: { type: String, enum: ["pending", "executed", "cancelled"], default: "pending" },
  executedAt: Date
}, { timestamps: true });

const CopyTrade = mongoose.model("CopyTrade", copyTradeSchema);

// User Follow Schema
const userFollowSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  trader: { type: mongoose.Schema.Types.ObjectId, ref: "TraderProfile" }
}, { timestamps: true });

const UserFollow = mongoose.model("UserFollow", userFollowSchema);

// ================= Trading Controllers =================

// Admin creates a trade
const createTrade = async (req, res) => {
  try {
    const { traderId, pair, type, amount } = req.body;
    const trade = await Trade.create({ trader: traderId, pair, type, amount });
    res.json({ message: "Trade created", trade });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

// Execute trade and replicate to followers (copy trading)
const executeTrade = async (req, res) => {
  try {
    const { tradeId } = req.params;
    const trade = await Trade.findById(tradeId);
    if (!trade) return res.status(404).json({ message: "Trade not found" });
    if (trade.status === "executed") return res.status(400).json({ message: "Trade already executed" });

    trade.status = "executed";
    await trade.save();

    // Get all users following this trader
    const followers = await UserFollow.find({ trader: trade.trader }).populate("user");
    for (const follow of followers) {
      const user = follow.user;
      const mode = user.walletBalance >= trade.amount ? "live" : "demo"; // If insufficient balance, copy as demo
      const copyAmount = mode === "live" ? trade.amount : 0;

      if (mode === "live") user.walletBalance -= copyAmount;
      await user.save();

      await CopyTrade.create({
        user: user._id,
        trade: trade._id,
        amount: copyAmount,
        mode,
        status: "executed",
        executedAt: new Date()
      });

      await sendNotification(user._id, "Trade Signal", `Trader executed ${trade.type} on ${trade.pair} (${mode})`, "trade");
    }

    res.json({ message: "Trade executed and copied to followers", trade });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

// User follows a trader
const followTrader = async (req, res) => {
  try {
    const { traderId } = req.body;
    const exists = await UserFollow.findOne({ user: req.user._id, trader: traderId });
    if (exists) return res.status(400).json({ message: "Already following this trader" });
    await UserFollow.create({ user: req.user._id, trader: traderId });
    res.json({ message: "Now following trader" });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

// User unfollows a trader
const unfollowTrader = async (req, res) => {
  try {
    const { traderId } = req.body;
    await UserFollow.findOneAndDelete({ user: req.user._id, trader: traderId });
    res.json({ message: "Unfollowed trader" });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

// Get user copy trades
const getUserCopyTrades = async (req, res) => {
  try {
    const trades = await CopyTrade.find({ user: req.user._id }).populate({
      path: "trade",
      populate: { path: "trader", select: "displayName" }
    });
    res.json(trades);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

// Get list of all traders
const getTraders = async (req, res) => {
  try {
    const traders = await TraderProfile.find().populate("admin", "email");
    res.json(traders);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};


// ================= Admin Profit Controller =================
const addProfitToUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const { amount, note } = req.body;

    if (!amount || amount <= 0) return res.status(400).json({ message: "Invalid profit amount" });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    user.walletBalance += Number(amount);
    await user.save();

    await sendNotification(
      user._id,
      "Profit Added",
      `Admin added a profit of $${amount}${note ? ` - ${note}` : ""} to your wallet.`,
      "profit"
    );

    res.json({ message: "Profit added successfully", walletBalance: user.walletBalance });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

// Admin adds profit to a user
app.put("/api/admin/user/:userId/profit", adminAuth, addProfitToUser);

// ================= User Notification Routes =================

// Get all my notifications
app.get("/api/user/notifications", protect, async (req, res) => {
  try {
    const notifs = await Notification.find({ user: req.user._id })
      .sort({ createdAt: -1 });
    res.json(notifs);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Mark notification as read
app.put("/api/user/notifications/:id/read", protect, async (req, res) => {
  try {
    const notif = await Notification.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      { isRead: true },
      { new: true }
    );
    if (!notif) return res.status(404).json({ message: "Notification not found" });
    res.json(notif);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Mark all notifications as read
app.put("/api/user/notifications/read-all", protect, async (req, res) => {
  try {
    await Notification.updateMany(
      { user: req.user._id, isRead: false },
      { isRead: true }
    );
    res.json({ message: "All notifications marked as read" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});


// ================= Message Model =================
const messageSchema = new mongoose.Schema({
  sender: { type: mongoose.Schema.Types.ObjectId, ref: "Admin" },
  recipients: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  title: { type: String, required: true },
  content: { type: String, required: true },
  readBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  createdAt: { type: Date, default: Date.now },
}, { timestamps: true });

const Message = mongoose.model("Message", messageSchema);


// ================= Admin Messaging Controller =================
const sendMessage = async (req, res) => {
  try {
    const { userIds, title, content } = req.body; // userIds can be single or multiple

    if (!title || !content) return res.status(400).json({ message: "Title and content are required" });
    if (!userIds || userIds.length === 0) return res.status(400).json({ message: "Recipients are required" });

    // Ensure userIds is an array
    const recipients = Array.isArray(userIds) ? userIds : [userIds];

    const message = await Message.create({
      sender: req.admin._id, // or null if you don't store admin id
      recipients,
      title,
      content
    });

    // Send notification to each recipient
    for (const userId of recipients) {
      await sendNotification(userId, title, content, "message");
    }

    res.json({ message: "Message sent successfully", data: message });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};


// ================= Admin Messaging Route =================
app.post("/api/admin/message", adminAuth, sendMessage);


// ================= User Fetch Messages =================
app.get("/api/user/messages", protect, async (req, res) => {
  try {
    const messages = await Message.find({ recipients: req.user._id })
      .sort({ createdAt: -1 })
      .populate("sender", "email role");
    res.json(messages);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});



// ================= Notification Model =================
const notificationSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  title: { type: String, required: true },
  message: { type: String, required: true },
  type: { type: String, default: "info" }, // info, success, error
  isRead: { type: Boolean, default: false },
}, { timestamps: true });

const Notification = mongoose.model("Notification", notificationSchema);




// ================= User Notification Routes =================

// Get all my notifications
app.get("/api/user/notifications", protect, async (req, res) => {
  try {
    const notifs = await Notification.find({ user: req.user._id })
      .sort({ createdAt: -1 });
    res.json(notifs);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Mark notification as read
app.put("/api/user/notifications/:id/read", protect, async (req, res) => {
  try {
    const notif = await Notification.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      { isRead: true },
      { new: true }
    );
    if (!notif) return res.status(404).json({ message: "Notification not found" });
    res.json(notif);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Mark all notifications as read
app.put("/api/user/notifications/read-all", protect, async (req, res) => {
  try {
    await Notification.updateMany(
      { user: req.user._id, isRead: false },
      { isRead: true }
    );
    res.json({ message: "All notifications marked as read" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});











// ================= Express Routes =================

// Admin trade routes
app.post("/api/admin/trade", adminAuth, createTrade);
app.put("/api/admin/trade/:tradeId/execute", adminAuth, executeTrade);

// User copy trades & follow system
app.get("/api/user/copy-trades", protect, getUserCopyTrades);
app.post("/api/user/follow-trader", protect, followTrader);
app.post("/api/user/unfollow-trader", protect, unfollowTrader);
app.get("/api/traders", protect, getTraders);



// ================= Express Routes =================

// Add new referral route
app.get("/api/user/referrals", protect, getMyReferrals);


// ================= Express App =================


// User Routes
app.post("/api/register", register);
app.post("/api/login", login);
app.post("/api/forgot-password", forgotPassword);
app.post("/api/reset-password/:token", resetPassword);

// Admin Transaction Routes
app.get("/api/admin/transactions", adminAuth, listTransactions);
app.put("/api/admin/deposit/:transactionId/approve", adminAuth, approveDeposit);
app.put("/api/admin/deposit/:transactionId/reject", adminAuth, rejectDeposit);
app.put("/api/admin/withdrawal/:transactionId/approve", adminAuth, approveWithdrawal);
app.put("/api/admin/withdrawal/:transactionId/reject", adminAuth, rejectWithdrawal);
app.put("/api/admin/user/:userId/balance", adminAuth, manualBalanceUpdate);

// Protected Test Route
app.get("/api/me", protect, (req, res) => res.json({ user: req.user }));


// Serve frontend last, only for non-API routes
app.use(express.static(path.join(__dirname, "public")));
app.get(/^\/(?!api).*/, (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});


// ================= Start Server =================
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
