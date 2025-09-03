// models/Trade.js
const mongoose = require('mongoose');

const tradeSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type: { type: String, enum: ['BUY','SELL'], required: true },
  asset: { type: String, required: true }, // e.g. BTCUSD
  price: { type: Number, required: true },
  quantity: { type: Number, required: true },
  notional: { type: Number, required: true }, // price * quantity
  copied: { type: Boolean, default: false }, // true if mirrored trade
  originalTrader: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // if copied, who originated
  result: { type: Number, default: 0 }, // profit/loss when closed (can be 0 until closed)
  status: { type: String, enum: ['open','closed'], default: 'open' },
  createdAt: { type: Date, default: Date.now }
}, { timestamps: true });

module.exports = mongoose.model('Trade', tradeSchema);
