const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema({
  foodID: { type: mongoose.Schema.Types.ObjectId, ref: 'Food', required: true },
  quantity: { type: Number, required: true, min: 1 }
}, { _id: false });

const orderSchema = new mongoose.Schema({
  orderID: { type: String, required: true, unique: true },
  canID: { type: String, required: true, index: true },
  studentID: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  items: { type: [orderItemSchema], required: true },
  total: { type: Number, required: true, min: 0 },
  pickupToken: {
    type: String,
    minlength: 4,
    maxlength: 4,
    match: /^\d{4}$/,
    unique: true,
    sparse: true
  },
  qrToken: {
    type: String,
    default: null
  },
  status: {
    type: String,
    enum: ['Preparing', 'Ready', 'Delivered'],
    default: 'Preparing'
  }
}, { timestamps: true });

module.exports = mongoose.model('Order', orderSchema);
