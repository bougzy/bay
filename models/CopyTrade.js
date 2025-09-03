// models/CopyTrade.js
const mongoose = require('mongoose');

const copyTradeSchema = new mongoose.Schema({
  trader: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  copier: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  active: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('CopyTrade', copyTradeSchema);
