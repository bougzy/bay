// ================== IMPORTS ==================
require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const path = require("path");
const cors = require("cors");
const WebSocket = require('ws');
const http = require('http');

// ================== APP SETUP ==================
const app = express();
app.use(express.json());
app.use(cors());
const server = http.createServer(app);

// ================== DB CONNECTION ==================
mongoose.connect(process.env.MONGO_URI || "mongodb+srv://montracorp:montracorp@montracorp.ypvutxx.mongodb.net/montracorp", {

}).then(() => console.log("MongoDB connected"))
  .catch(err => console.error("MongoDB connection error:", err));

  
// ================== MODELS ==================

// User Schema
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

const User = mongoose.model("User", userSchema);

// Admin Schema
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

// Transaction Schema
const transactionSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  type: { type: String, enum: ["deposit", "withdrawal"], required: true },
  amount: { type: Number, required: true },
  status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending" },
  adminNote: String,
  proof: String,
  processed: { type: Boolean, default: false } // Add this field
}, { timestamps: true });

const Transaction = mongoose.model("Transaction", transactionSchema);

// Message Schema
const messageSchema = new mongoose.Schema({
  sender: { type: mongoose.Schema.Types.ObjectId, ref: "Admin" },
  recipients: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  title: { type: String, required: true },
  content: { type: String, required: true },
  readBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
}, { timestamps: true });

const Message = mongoose.model("Message", messageSchema);

// Notification Schema
const notificationSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  title: { type: String, required: true },
  content: { type: String, required: true },
  type: { type: String, default: "info" },
  isRead: { type: Boolean, default: false },
}, { timestamps: true });

const Notification = mongoose.model("Notification", notificationSchema);

// Trade Schema
const tradeSchema = new mongoose.Schema({
  trader: { type: mongoose.Schema.Types.ObjectId, ref: "TraderProfile" },
  pair: { type: String, required: true },
  type: { type: String, enum: ["buy", "sell"], required: true },
  amount: { type: Number, required: true },
  status: { type: String, enum: ["pending", "executed", "cancelled"], default: "pending" },
}, { timestamps: true });

const Trade = mongoose.model("Trade", tradeSchema);

// CopyTrade Schema
const copyTradeSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  trade: { type: mongoose.Schema.Types.ObjectId, ref: "Trade" },
  amount: { type: Number, required: true },
  mode: { type: String, enum: ["demo", "live"], default: "demo" },
  status: { type: String, enum: ["pending", "executed", "cancelled"], default: "pending" },
  executedAt: Date
}, { timestamps: true });

const CopyTrade = mongoose.model("CopyTrade", copyTradeSchema);

// UserFollow Schema
const userFollowSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  trader: { type: mongoose.Schema.Types.ObjectId, ref: "TraderProfile" }
}, { timestamps: true });

const UserFollow = mongoose.model("UserFollow", userFollowSchema);

// TraderProfile Schema
const traderProfileSchema = new mongoose.Schema({
  admin: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", unique: true },
  displayName: { type: String, required: true },
  bio: String
}, { timestamps: true });

const TraderProfile = mongoose.model("TraderProfile", traderProfileSchema);

// Profit Schema
const profitSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  amount: { type: Number, required: true },
  note: String,
}, { timestamps: true });

const Profit = mongoose.model("Profit", profitSchema);

// ================== MIDDLEWARE ==================
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

// ================== UTILS ==================
const generateToken = (id, role) => {
  return jwt.sign({ id, role }, process.env.JWT_SECRET || "supersecretjwtkey", { expiresIn: "7d" });
};

const sendNotification = async (userId, title, content, type) => {
  try {
    const notif = new Notification({ user: userId, title, content, type });
    await notif.save();
  } catch (error) {
    console.error("Error sending notification:", error);
  }
};

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.example.com",
  port: process.env.SMTP_PORT || 587,
  auth: {
    user: process.env.SMTP_USER || "user@example.com",
    pass: process.env.SMTP_PASS || "password"
  }
});

// ================== CONTROLLERS ==================

// Auth Controllers
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

// Transaction Controllers
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

// const approveDeposit = async (req, res) => {
//   try {
//     const { transactionId } = req.params;
//     const tx = await Transaction.findById(transactionId);
//     if (!tx || tx.type !== "deposit") return res.status(404).json({ message: "Deposit not found" });
//     if (tx.status === "approved") return res.status(400).json({ message: "Already approved" });
//     tx.status = "approved"; await tx.save();
//     const user = await User.findById(tx.user);
//     user.walletBalance += tx.amount; await user.save();
//     await sendNotification(user._id, "Deposit Approved", `Your deposit of $${tx.amount} was approved.`, "deposit");
//     res.json({ message: "Deposit approved", transaction: tx, walletBalance: user.walletBalance });
//   } catch (e) { res.status(500).json({ message: e.message }); }
// };


const wss = new WebSocket.Server({ server });

// Store connected clients
const clients = new Map();

// WebSocket connection handling
wss.on('connection', (ws, req) => {
  // Extract token from query string
  const url = new URL(req.url, `http://${req.headers.host}`);
  const token = url.searchParams.get('token');
  
  if (!token) {
    ws.close();
    return;
  }
  
  try {
    // Verify token and get user ID
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "supersecretjwtkey");
    const userId = decoded.id;
    
    // Store connection with user ID
    clients.set(userId, ws);
    

     // Send initial balance update
    User.findById(userId).then(user => {
      if (user) {
        ws.send(JSON.stringify({
          type: 'BALANCE_UPDATE',
          walletBalance: user.walletBalance,
          message: 'Connected successfully'
        }));
      }
    });



    // Handle connection close
    ws.on('close', () => {
      clients.delete(userId);
    });
    
    // Handle errors
     ws.on('error', (error) => {
      console.error('WebSocket error:', error);
      clients.delete(userId);
    });
    
  } catch (error) {
    console.error('WebSocket authentication error:', error);
    ws.close();
  }
});

// Function to send updates to a specific user
function sendUserUpdate(userId, data) {
  const ws = clients.get(userId);
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

const approveDeposit = async (req, res) => {
  try {
    const { transactionId } = req.params;
    const tx = await Transaction.findById(transactionId);
    if (!tx || tx.type !== "deposit") return res.status(404).json({ message: "Deposit not found" });
    if (tx.status === "approved") return res.status(400).json({ message: "Already approved" });
    
    tx.status = "approved";
    tx.processed = false; // Set to false so the user endpoint can process it
    await tx.save();
    
    const user = await User.findById(tx.user);
    
    // Send real-time update to the user
    sendUserUpdate(tx.user.toString(), {
      type: 'BALANCE_UPDATE',
      walletBalance: user.walletBalance, // Current balance (not updated yet)
      transaction: tx,
      message: `Your deposit of $${tx.amount} has been approved and will be added to your balance shortly.`
    });
    
    await sendNotification(user._id, "Deposit Approved", `Your deposit of $${tx.amount} was approved.`, "deposit");
    
    res.json({ 
      message: "Deposit approved", 
      transaction: tx,
      note: "The amount will be added to the user's balance when they check for approved deposits."
    });
  } catch (e) { 
    res.status(500).json({ message: e.message }); 
  }
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

// User Management Controllers
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

const addProfitToUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const { amount, note } = req.body;

    if (!amount || amount <= 0) return res.status(400).json({ message: "Invalid profit amount" });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    user.walletBalance += Number(amount);
    await user.save();

    const profit = await Profit.create({ userId: user._id, amount, note });

    await sendNotification(
      user._id,
      "Profit Added",
      `Admin added a profit of $${amount}${note ? ` - ${note}` : ""} to your wallet.`,
      "profit"
    );

    res.json({ message: "Profit added successfully", walletBalance: user.walletBalance, profit });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

// Trading Controllers
const createTrade = async (req, res) => {
  try {
    const { traderId, pair, type, amount } = req.body;
    const trade = await Trade.create({ trader: traderId, pair, type, amount });
    res.json({ message: "Trade created", trade });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

const executeTrade = async (req, res) => {
  try {
    const { tradeId } = req.params;
    const trade = await Trade.findById(tradeId);
    if (!trade) return res.status(404).json({ message: "Trade not found" });
    if (trade.status === "executed") return res.status(400).json({ message: "Trade already executed" });

    trade.status = "executed";
    await trade.save();

    const followers = await UserFollow.find({ trader: trade.trader }).populate("user");
    for (const follow of followers) {
      const user = follow.user;
      const mode = user.walletBalance >= trade.amount ? "live" : "demo";
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

const unfollowTrader = async (req, res) => {
  try {
    const { traderId } = req.body;
    await UserFollow.findOneAndDelete({ user: req.user._id, trader: traderId });
    res.json({ message: "Unfollowed trader" });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

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

const getTraders = async (req, res) => {
  try {
    const traders = await TraderProfile.find().populate("admin", "email");
    res.json(traders);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

// Messaging Controller
const sendMessage = async (req, res) => {
  try {
    const { userIds, title, content } = req.body;

    if (!title || !content) return res.status(400).json({ message: "Title and content are required" });
    if (!userIds || userIds.length === 0) return res.status(400).json({ message: "Recipients are required" });

    const recipients = Array.isArray(userIds) ? userIds : [userIds];

    const message = await Message.create({
      sender: null,
      recipients,
      title,
      content
    });

    for (const userId of recipients) {
      await sendNotification(userId, title, content, "message");
    }

    res.json({ message: "Message sent successfully", data: message });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

// ================== ROUTES ==================

// Auth Routes
app.post("/api/register", register);
app.post("/api/login", login);
app.post("/api/forgot-password", forgotPassword);
app.post("/api/reset-password/:token", resetPassword);

// User Routes
app.get("/api/me", protect, (req, res) => res.json({ user: req.user }));
app.get("/api/user/transactions", protect, async (req, res) => {
  try {
    const transactions = await Transaction.find({ user: req.user._id }).sort({ createdAt: -1 });
    res.json(transactions);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});
app.get("/api/user/referrals", protect, getMyReferrals);
// app.post("/api/deposits", protect, async (req, res) => {
//   try {
//     const { amount } = req.body;
    
//     if (!amount || amount <= 0) {
//       return res.status(400).json({ message: "Invalid deposit amount" });
//     }
    
//     const transaction = await Transaction.create({
//       user: req.user._id,
//       type: "deposit",
//       amount: parseFloat(amount),
//       status: "pending"
//     });
    
//     await sendNotification(
//       req.user._id,
//       "Deposit Submitted",
//       `Your deposit of $${amount} has been submitted for approval.`,
//       "deposit"
//     );
    
//     res.json({ 
//       message: "Deposit submitted for approval", 
//       transaction 
//     });
//   } catch (e) {
//     res.status(500).json({ message: e.message });
//   }
// });

// Add multer for file uploads at the top of your server file
const multer = require('multer');
const upload = multer({ dest: 'uploads/' });

// ... existing code ...

// Update the deposit route to handle file uploads
app.post("/api/deposits", protect, upload.single('proof'), async (req, res) => {
  try {
    const { amount } = req.body;
    const proofFile = req.file;
    
    if (!amount || amount <= 0) {
      return res.status(400).json({ message: "Invalid deposit amount" });
    }
    
    if (!proofFile) {
      return res.status(400).json({ message: "Proof of payment is required" });
    }
    
    const transaction = await Transaction.create({
      user: req.user._id,
      type: "deposit",
      amount: parseFloat(amount),
      status: "pending",
      proof: proofFile.filename // Store the filename in the database
    });
    
    await sendNotification(
      req.user._id,
      "Deposit Submitted",
      `Your deposit of $${amount} has been submitted for approval.`,
      "deposit"
    );
    
    res.json({ 
      message: "Deposit submitted for approval", 
      transaction 
    });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// ... rest of the server code ...

app.post("/api/withdrawals", protect, async (req, res) => {
  try {
    const { amount } = req.body;
    
    if (!amount || amount <= 0) {
      return res.status(400).json({ message: "Invalid withdrawal amount" });
    }
    
    const user = await User.findById(req.user._id);
    if (user.walletBalance < parseFloat(amount)) {
      return res.status(400).json({ message: "Insufficient balance" });
    }
    
    const transaction = await Transaction.create({
      user: req.user._id,
      type: "withdrawal", 
      amount: parseFloat(amount),
      status: "pending"
    });
    
    await sendNotification(
      req.user._id,
      "Withdrawal Requested",
      `Your withdrawal request of $${amount} has been submitted.`,
      "withdrawal"
    );
    
    res.json({ 
      message: "Withdrawal request submitted", 
      transaction 
    });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// Notification Routes
app.get("/api/user/notifications", protect, async (req, res) => {
  try {
    const notifs = await Notification.find({ user: req.user._id }).sort({ createdAt: -1 });
    res.json(notifs);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});
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

// Message Routes
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

// Trading Routes
app.get("/api/traders", protect, getTraders);
app.get("/api/user/copy-trades", protect, getUserCopyTrades);
app.post("/api/user/follow-trader", protect, followTrader);
app.post("/api/user/unfollow-trader", protect, unfollowTrader);

// Investment Plans (Placeholder)
app.get("/api/investment-plans", async (req, res) => {
  try {
    const plans = [
      {
        _id: "1",
        name: "Basic Plan",
        profitRate: 5,
        minDeposit: 50,
        maxDeposit: 1000,
        walletAddress: "0xBasicWallet123"
      },
      {
        _id: "2", 
        name: "Premium Plan",
        profitRate: 8,
        minDeposit: 1001,
        maxDeposit: 5000,
        walletAddress: "0xPremiumWallet456"
      },
      {
        _id: "3",
        name: "VIP Plan", 
        profitRate: 12,
        minDeposit: 5001,
        maxDeposit: 20000,
        walletAddress: "0xVIPWallet789"
      }
    ];
    res.json(plans);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// Admin Routes
app.get("/api/admin/users", adminAuth, async (req, res) => {
  try {
    const users = await User.find().select("name email walletBalance referrals isBlocked createdAt");
    res.json(users);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});
app.get("/api/admin/users/:userId", adminAuth, async (req, res) => {
  try {
    const user = await User.findById(req.params.userId).select("name email walletBalance referrals isBlocked createdAt");
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json(user);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});
app.get("/api/admin/users/:userId/transactions", adminAuth, async (req, res) => {
  try {
    const transactions = await Transaction.find({ user: req.params.userId }).sort({ createdAt: -1 });
    res.json(transactions);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});
app.get("/api/admin/users/:userId/deposits", adminAuth, async (req, res) => {
  try {
    const deposits = await Transaction.find({ user: req.params.userId, type: "deposit" });
    res.json(deposits);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});
app.get("/api/admin/users/:userId/withdrawals", adminAuth, async (req, res) => {
  try {
    const withdrawals = await Transaction.find({ user: req.params.userId, type: "withdrawal" });
    res.json(withdrawals);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});
app.get("/api/admin/users/:userId/profits", adminAuth, async (req, res) => {
  try {
    const profits = await Profit.find({ userId: req.params.userId }).sort({ createdAt: -1 });
    res.json(profits);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});
app.put("/api/admin/users/:userId/block", adminAuth, async (req, res) => {
  try {
    const { isBlocked } = req.body;
    const user = await User.findByIdAndUpdate(
      req.params.userId,
      { isBlocked },
      { new: true }
    ).select("-password");
    
    if (!user) return res.status(404).json({ message: "User not found" });
    
    res.json({ 
      message: `User ${isBlocked ? 'blocked' : 'unblocked'} successfully`, 
      user 
    });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// ================== NEW ENDPOINT: CHECK APPROVED DEPOSITS ==================
app.get("/api/user/check-approved-deposits", protect, async (req, res) => {
  try {
    const userId = req.user._id;
    
    // Find all approved deposits that haven't been processed yet
    const approvedDeposits = await Transaction.find({
      user: userId,
      type: "deposit",
      status: "approved",
      processed: { $ne: true } // Look for deposits that haven't been marked as processed
    });
    
    let totalApprovedAmount = 0;
    let processedDeposits = [];
    
    // Process each approved deposit
    for (const deposit of approvedDeposits) {
      // Update user's wallet balance
      const user = await User.findById(userId);
      user.walletBalance += deposit.amount;
      await user.save();
      
      // Mark deposit as processed
      deposit.processed = true;
      await deposit.save();
      
      totalApprovedAmount += deposit.amount;
      processedDeposits.push(deposit);
      
      // Send real-time update if WebSocket is connected
      sendUserUpdate(userId.toString(), {
        type: 'BALANCE_UPDATE',
        walletBalance: user.walletBalance,
        transaction: deposit,
        message: `Deposit of $${deposit.amount} has been approved and added to your balance`
      });
    }
    
    res.json({
      success: true,
      message: processedDeposits.length > 0 
        ? `Processed ${processedDeposits.length} approved deposits totaling $${totalApprovedAmount}`
        : 'No new approved deposits found',
      processedCount: processedDeposits.length,
      totalAmount: totalApprovedAmount,
      walletBalance: req.user.walletBalance + totalApprovedAmount,
      deposits: processedDeposits
    });
    
  } catch (e) {
    res.status(500).json({ 
      success: false,
      message: e.message 
    });
  }
});



app.get("/api/admin/transactions", adminAuth, listTransactions);
app.put("/api/admin/deposit/:transactionId/approve", adminAuth, approveDeposit);
app.put("/api/admin/deposit/:transactionId/reject", adminAuth, rejectDeposit);
app.put("/api/admin/withdrawal/:transactionId/approve", adminAuth, approveWithdrawal);
app.put("/api/admin/withdrawal/:transactionId/reject", adminAuth, rejectWithdrawal);
app.put("/api/admin/user/:userId/balance", adminAuth, manualBalanceUpdate);
app.put("/api/admin/user/:userId/profit", adminAuth, addProfitToUser);
app.post("/api/admin/message", adminAuth, sendMessage);
app.post("/api/admin/trade", adminAuth, createTrade);
app.put("/api/admin/trade/:tradeId/execute", adminAuth, executeTrade);
app.get("/api/admin/dashboard-stats", adminAuth, async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const totalDeposits = await Transaction.aggregate([
      { $match: { type: "deposit", status: "approved" } },
      { $group: { _id: null, total: { $sum: "$amount" } } }
    ]);
    const totalWithdrawals = await Transaction.aggregate([
      { $match: { type: "withdrawal", status: "approved" } },
      { $group: { _id: null, total: { $sum: "$amount" } } }
    ]);
    const pendingTransactions = await Transaction.countDocuments({ 
      status: "pending" 
    });
    
    res.json({
      totalUsers,
      totalDeposits: totalDeposits[0]?.total || 0,
      totalWithdrawals: totalWithdrawals[0]?.total || 0,
      pendingTransactions
    });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});



// Serve frontend last, only for non-API routes
app.use(express.static(path.join(__dirname, "public")));
app.get(/^\/(?!api).*/, (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ================== START SERVER ==================
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));