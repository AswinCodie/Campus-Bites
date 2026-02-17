const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema({
  foodID: { type: mongoose.Schema.Types.ObjectId, ref: 'Food', required: true },
  quantity: { type: Number, required: true, min: 1 }
}, { _id: false });

function formatDateOnly(value) {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) return value;
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const orderSchema = new mongoose.Schema({
  orderID: { type: String, required: true, unique: true },
  canID: { type: String, required: true, index: true },
  // Store as Date (normalized to start-of-day in server logic).
  orderDate: { type: Date, required: true, index: true },
  dailyToken: {
    type: String,
    required: true,
    minlength: 4,
    maxlength: 4,
    match: /^\d{4}$/
  },
  studentID: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  items: { type: [orderItemSchema], required: true },
  total: { type: Number, required: true, min: 0 },
  pickupToken: {
    type: String,
    minlength: 4,
    maxlength: 4,
    match: /^\d{4}$/,
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
}, {
  timestamps: true,
  toJSON: {
    transform: (_doc, ret) => {
      ret.orderDate = formatDateOnly(ret.orderDate);
      return ret;
    }
  },
  toObject: {
    transform: (_doc, ret) => {
      ret.orderDate = formatDateOnly(ret.orderDate);
      return ret;
    }
  }
});

orderSchema.index({ canID: 1, orderDate: 1, dailyToken: 1 }, { unique: true });
orderSchema.index({ canID: 1, orderDate: 1, pickupToken: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('Order', orderSchema);
