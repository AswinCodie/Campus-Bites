const mongoose = require('mongoose');
const EMAIL_REGEX = /^(?!.*\.\.)[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

const userSchema = new mongoose.Schema({
  canID: { type: String, required: true, index: true },
  name: { type: String, required: true, trim: true },
  classSemester: { type: String, required: true, trim: true },
  mobile: { type: String, required: true, trim: true },
  admissionNumber: { type: String, required: true, trim: true },
  email: {
    type: String,
    required: true,
    trim: true,
    lowercase: true,
    match: [EMAIL_REGEX, 'Please provide a valid email address']
  },
  password: {
    type: String,
    required: true,
    minlength: [8, 'Password must be at least 8 characters']
  },
  banned: { type: Boolean, default: false },
  bannedAt: { type: Date, default: null }
}, { timestamps: true });

userSchema.index({ email: 1 }, { unique: true });
userSchema.index(
  { mobile: 1 },
  { unique: true, partialFilterExpression: { mobile: { $type: 'string' } } }
);
userSchema.index(
  { canID: 1, admissionNumber: 1 },
  { unique: true, partialFilterExpression: { admissionNumber: { $type: 'string' } } }
);

module.exports = mongoose.model('User', userSchema);
