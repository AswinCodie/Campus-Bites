const mongoose = require('mongoose');
const EMAIL_REGEX = /^(?!.*\.\.)[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

const canteenSchema = new mongoose.Schema({
  collegeName: { type: String, required: true, trim: true },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    match: [EMAIL_REGEX, 'Please provide a valid email address']
  },
  password: {
    type: String,
    required: true,
    minlength: [8, 'Password must be at least 8 characters']
  },
  canID: { type: String, required: true, unique: true },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Canteen', canteenSchema);
