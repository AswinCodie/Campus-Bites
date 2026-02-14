const mongoose = require('mongoose');

const staffSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  canteenId: { type: String, required: true, index: true },
  status: {
    type: String,
    enum: ['Pending', 'Approved', 'Declined'],
    default: 'Pending',
    index: true
  }
}, { timestamps: true, collection: 'staffs' });

module.exports = mongoose.model('Staff', staffSchema);
