const mongoose = require('mongoose');

async function connectDB() {
  const mongoURI = process.env.MONGO_URI || 'mongodb+srv://canteenbites_db:canteen%402025@campusbites.makzk88.mongodb.net/?appName=CAMPUSBITES';

  try {
    await mongoose.connect(mongoURI);
    console.log('MongoDB connected');
  } catch (error) {
    console.error('MongoDB connection failed:', error.message);
    process.exit(1);
  }
}

module.exports = connectDB;
