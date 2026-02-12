const mongoose = require('mongoose');

const foodSchema = new mongoose.Schema({
  canID: { type: String, required: true, index: true },
  name: { type: String, required: true, trim: true },
  price: { type: Number, required: true, min: 0 },
  inStock: { type: Boolean, default: true },
  category: { type: String, enum: ['food', 'drink', 'snack'], default: 'food' },
  imageUrl: { type: String, trim: true, default: '' }
});

module.exports = mongoose.model('Food', foodSchema);
