// models/TradeSignal.js
const mongoose = require('mongoose');

const signalSchema = new mongoose.Schema({
  admin: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  title: { type: String, required: true },
  asset: { type: String, required: true },
  action: { type: String, enum: ['BUY','SELL'], required: true },
  entryPrice: Number,
  stopLoss: Number,
  takeProfit: Number,
  description: String,
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('TradeSignal', signalSchema);
