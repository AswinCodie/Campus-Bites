const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  orderId: { type: String, default: null, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  razorpay_order_id: { type: String, required: true, unique: true, index: true },
  razorpay_payment_id: { type: String, default: null },
  amount: { type: Number, required: true, min: 0 },
  currency: { type: String, required: true, default: 'INR' },
  status: {
    type: String,
    enum: ['created', 'authorized', 'captured', 'failed'],
    default: 'created',
    index: true
  },
  paidAt: { type: Date, default: null },
  canID: { type: String, required: true, index: true }
}, {
  timestamps: true,
  collection: 'PaymentDB'
});

paymentSchema.index({ orderId: 1, userId: 1 }, { unique: true, sparse: true });
paymentSchema.index(
  { razorpay_payment_id: 1 },
  {
    unique: true,
    partialFilterExpression: {
      razorpay_payment_id: { $type: 'string', $ne: '' }
    }
  }
);

module.exports = mongoose.model('Payment', paymentSchema);
