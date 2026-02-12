const express = require('express');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');

require("dotenv").config();
const connectDB = require('./db');
const Canteen = require('./Canteen');
const User = require('./User');
const Food = require('./Food');
const Order = require('./Order');

const app = express();
const PORT = process.env.PORT || 5000;
const HOST = '0.0.0.0';
const FRONTEND_DIR = path.join(__dirname, '..', 'frontend');
const ASSETS_DIR = path.join(__dirname, '..', 'assets');

app.use(cors());
app.use(express.json());
app.use(express.static(FRONTEND_DIR));
app.use('/assets', express.static(ASSETS_DIR));

function randomToken(length = 6) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

async function generateUniqueCanID() {
  let canID;
  let exists = true;
  while (exists) {
    canID = `CAN-${randomToken(8)}`;
    exists = await Canteen.exists({ canID });
  }
  return canID;
}

async function generateUniqueOrderID() {
  let orderID;
  let exists = true;
  while (exists) {
    orderID = `ORD-${Date.now()}-${randomToken(4)}`;
    exists = await Order.exists({ orderID });
  }
  return orderID;
}

function normalizeFoodCategory(value) {
  const category = String(value || 'food').toLowerCase();
  if (category === 'drink' || category === 'drinks') return 'drink';
  if (category === 'snack' || category === 'snacks') return 'snack';
  return 'food';
}

function normalizeImageUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith('//')) return `https:${raw}`;
  if (/^www\./i.test(raw)) return `https://${raw}`;
  return raw;
}

function isValidEmail(email) {
  const value = String(email || '').trim();
  if (!value || value.length > 254 || value.includes('..')) return false;

  const parts = value.split('@');
  if (parts.length !== 2) return false;

  const [localPart, domain] = parts;
  if (!localPart || !domain || localPart.length > 64) return false;
  if (!/^[A-Za-z0-9._%+-]+$/.test(localPart)) return false;
  if (!/^[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(domain)) return false;

  const labels = domain.split('.');
  return labels.every((label) => label && !label.startsWith('-') && !label.endsWith('-'));
}

function isValidPassword(password) {
  return String(password || '').length >= 8;
}

function normalizeMobile(mobile) {
  const digits = String(mobile || '').replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  return digits;
}

function isValidMobile(mobile) {
  return /^\d{10}$/.test(String(mobile || ''));
}

app.post('/admin/signup', async (req, res) => {
  try {
    const { collegeName, email, password } = req.body;
    const normalizedEmail = String(email || '').trim().toLowerCase();

    if (!collegeName || !email || !password) {
      return res.status(400).json({ message: 'collegeName, email, and password are required' });
    }

    if (!isValidEmail(normalizedEmail)) {
      return res.status(400).json({ message: 'Please provide a valid email address' });
    }

    if (!isValidPassword(password)) {
      return res.status(400).json({ message: 'Password must be at least 8 characters' });
    }

    const existing = await Canteen.findOne({ email: normalizedEmail });
    if (existing) {
      return res.status(409).json({ message: 'Admin with this email already exists' });
    }

    const canID = await generateUniqueCanID();
    const hashedPassword = await bcrypt.hash(password, 10);

    const canteen = await Canteen.create({
      collegeName,
      email: normalizedEmail,
      password: hashedPassword,
      canID
    });

    return res.status(201).json({
      message: 'Admin signup successful',
      canID: canteen.canID,
      adminId: canteen._id,
      collegeName: canteen.collegeName,
      createdAt: canteen.createdAt
    });
  } catch (error) {
    return res.status(500).json({ message: 'Signup failed', error: error.message });
  }
});

app.post('/admin/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const normalizedEmail = String(email || '').trim().toLowerCase();

    if (!email || !password) {
      return res.status(400).json({ message: 'email and password are required' });
    }

    if (!isValidEmail(normalizedEmail)) {
      return res.status(400).json({ message: 'Please provide a valid email address' });
    }

    if (!isValidPassword(password)) {
      return res.status(400).json({ message: 'Password must be at least 8 characters' });
    }

    const canteen = await Canteen.findOne({ email: normalizedEmail });
    if (!canteen) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(password, canteen.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    return res.json({
      message: 'Login successful',
      canID: canteen.canID,
      session: {
        adminId: canteen._id,
        email: canteen.email,
        collegeName: canteen.collegeName,
        loginAt: new Date().toISOString()
      }
    });
  } catch (error) {
    return res.status(500).json({ message: 'Login failed', error: error.message });
  }
});

app.post('/student/signup', async (req, res) => {
  try {
    const {
      canID,
      name,
      classSemester,
      mobile,
      email,
      admissionNumber,
      password
    } = req.body;
    const normalizedEmail = String(email || '').trim().toLowerCase();
    const normalizedMobile = normalizeMobile(mobile);
    const normalizedAdmissionNumber = String(admissionNumber || '').trim().toUpperCase();

    if (!canID || !name || !classSemester || !mobile || !email || !admissionNumber || !password) {
      return res.status(400).json({
        message: 'canID, name, classSemester, mobile, email, admissionNumber, and password are required'
      });
    }

    if (!isValidEmail(normalizedEmail)) {
      return res.status(400).json({ message: 'Please provide a valid email address' });
    }

    if (!isValidMobile(normalizedMobile)) {
      return res.status(400).json({ message: 'Please provide a valid 10-digit mobile number' });
    }

    if (!isValidPassword(password)) {
      return res.status(400).json({ message: 'Password must be at least 8 characters' });
    }

    const canteen = await Canteen.findOne({ canID });
    if (!canteen) {
      return res.status(404).json({ message: 'Invalid canID' });
    }

    const [existingByEmail, existingByMobile, existingByAdmission] = await Promise.all([
      User.findOne({ email: normalizedEmail }),
      User.findOne({ mobile: normalizedMobile }),
      User.findOne({ canID, admissionNumber: normalizedAdmissionNumber })
    ]);

    if (existingByEmail || existingByMobile) {
      return res.status(409).json({ message: 'Mobile number or email already exists. Please use different details.' });
    }
    if (existingByAdmission) {
      return res.status(409).json({ message: 'Student with this admission number already exists for this canID' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const student = await User.create({
      canID,
      name,
      classSemester: String(classSemester).trim(),
      mobile: normalizedMobile,
      email: normalizedEmail,
      admissionNumber: normalizedAdmissionNumber,
      password: hashedPassword
    });

    return res.status(201).json({
      message: 'Student signup successful',
      student: {
        _id: student._id,
        canID: student.canID,
        name: student.name,
        classSemester: student.classSemester,
        mobile: student.mobile,
        email: student.email,
        admissionNumber: student.admissionNumber,
        banned: student.banned
      }
    });
  } catch (error) {
    if (error?.code === 11000) {
      const duplicateField = Object.keys(error.keyPattern || {})[0];
      if (duplicateField === 'email' || duplicateField === 'mobile') {
        return res.status(409).json({ message: 'Mobile number or email already exists. Please use different details.' });
      }
      if (duplicateField === 'admissionNumber') {
        return res.status(409).json({ message: 'Student with this admission number already exists for this canID' });
      }
    }
    return res.status(500).json({ message: 'Student signup failed', error: error.message });
  }
});

app.post('/student/login', async (req, res) => {
  try {
    const { loginWith, identifier, email, password } = req.body;
    const loginMode = loginWith === 'mobile' ? 'mobile' : 'email';
    const rawIdentifier = identifier !== undefined ? identifier : email;
    const normalizedEmail = String(rawIdentifier || '').trim().toLowerCase();
    const normalizedMobile = normalizeMobile(rawIdentifier);

    if (!rawIdentifier || !password) {
      return res.status(400).json({ message: 'email or phone and password are required' });
    }

    if (loginMode === 'email' && !isValidEmail(normalizedEmail)) {
      return res.status(400).json({ message: 'Please provide a valid email address' });
    }
    if (loginMode === 'mobile' && !isValidMobile(normalizedMobile)) {
      return res.status(400).json({ message: 'Please provide a valid 10-digit mobile number' });
    }

    if (!isValidPassword(password)) {
      return res.status(400).json({ message: 'Password must be at least 8 characters' });
    }

    const query = loginMode === 'mobile'
      ? { mobile: normalizedMobile }
      : { email: normalizedEmail };
    const student = await User.findOne(query);
    if (!student) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    if (student.banned) {
      return res.status(403).json({ message: 'Your account has been banned. Please contact support.' });
    }

    const isMatch = await bcrypt.compare(password, student.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    return res.json({
      message: 'Student login successful',
      student: {
        _id: student._id,
        canID: student.canID,
        name: student.name,
        classSemester: student.classSemester,
        mobile: student.mobile,
        email: student.email,
        admissionNumber: student.admissionNumber,
        banned: student.banned
      }
    });
  } catch (error) {
    return res.status(500).json({ message: 'Student login failed', error: error.message });
  }
});

app.get('/admin/dashboard/:canID', async (req, res) => {
  try {
    const { canID } = req.params;
    const [foodCount, orderCount, studentCount] = await Promise.all([
      Food.countDocuments({ canID }),
      Order.countDocuments({ canID }),
      User.countDocuments({ canID })
    ]);

    return res.json({ canID, stats: { foodCount, orderCount, studentCount } });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to load dashboard', error: error.message });
  }
});

app.get('/admin/analytics/:canID', async (req, res) => {
  try {
    const { canID } = req.params;
    const canIDFilter = { canID };

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const orders = await Order.find(canIDFilter).populate('items.foodID', 'name');

    const monthlySales = orders
      .filter((o) => o.createdAt >= startOfMonth)
      .reduce((sum, o) => sum + o.total, 0);

    const totalRevenue = orders.reduce((sum, o) => sum + o.total, 0);
    const avgOrderValue = orders.length > 0 ? totalRevenue / orders.length : 0;

    const ordersToday = orders.filter((o) => o.createdAt >= startOfToday).length;

    const itemCounts = orders.flatMap((o) => o.items).reduce((acc, item) => {
      const foodName = item.foodID?.name || 'Deleted Food';
      acc[foodName] = (acc[foodName] || 0) + item.quantity;
      return acc;
    }, {});

    const topSellingItem = Object.entries(itemCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A';

    const ordersByStatus = ['Preparing', 'Ready', 'Delivered'].map((status) => ({
      status,
      count: orders.filter((order) => order.status === status).length
    }));

    const revenueTrendMap = orders
      .filter((order) => order.createdAt >= startOfMonth)
      .reduce((acc, order) => {
        const day = String(order.createdAt.getDate()).padStart(2, '0');
        acc[day] = (acc[day] || 0) + Number(order.total || 0);
        return acc;
      }, {});

    const revenueTrend = Object.entries(revenueTrendMap)
      .sort((a, b) => Number(a[0]) - Number(b[0]))
      .map(([day, total]) => ({ day, total }));

    const topMenuItems = Object.entries(itemCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, quantity]) => ({ name, quantity }));

    return res.json({
      canID,
      stats: {
        monthlySales,
        avgOrderValue,
        topSellingItem,
        ordersToday
      },
      ordersByStatus,
      revenueTrend,
      topMenuItems
    });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to load analytics', error: error.message });
  }
});

app.get('/foods/:canID', async (req, res) => {
  try {
    const foods = await Food.find({ canID: req.params.canID }).sort({ name: 1 });
    return res.json(foods);
  } catch (error) {
    return res.status(500).json({ message: 'Failed to load foods', error: error.message });
  }
});

app.post('/food/add', async (req, res) => {
  try {
    const { canID, name, price, inStock, category, imageUrl } = req.body;

    if (!canID || !name || price === undefined) {
      return res.status(400).json({ message: 'canID, name, and price are required' });
    }

    const food = await Food.create({
      canID,
      name,
      price: Number(price),
      inStock: inStock !== undefined ? Boolean(inStock) : true,
      category: normalizeFoodCategory(category),
      imageUrl: normalizeImageUrl(imageUrl)
    });

    return res.status(201).json({ message: 'Food added', food });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to add food', error: error.message });
  }
});

app.delete('/food/:id', async (req, res) => {
  try {
    const deleted = await Food.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ message: 'Food not found' });
    }
    return res.json({ message: 'Food deleted' });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to delete food', error: error.message });
  }
});

app.patch('/food/:id', async (req, res) => {
  try {
    const updates = {};
    if (req.body.name !== undefined) {
      updates.name = String(req.body.name).trim();
    }
    if (req.body.price !== undefined) {
      updates.price = Number(req.body.price);
    }
    if (req.body.inStock !== undefined) {
      updates.inStock = Boolean(req.body.inStock);
    }
    if (req.body.category !== undefined) {
      updates.category = normalizeFoodCategory(req.body.category);
    }
    if (req.body.imageUrl !== undefined) {
      updates.imageUrl = normalizeImageUrl(req.body.imageUrl);
    }

    const updated = await Food.findByIdAndUpdate(req.params.id, updates, { new: true });
    if (!updated) {
      return res.status(404).json({ message: 'Food not found' });
    }

    return res.json({ message: 'Food updated', food: updated });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to update food', error: error.message });
  }
});

app.get('/students/:canID', async (req, res) => {
  try {
    const students = await User.find({ canID: req.params.canID }).select('-password').sort({ name: 1 });
    return res.json(students);
  } catch (error) {
    return res.status(500).json({ message: 'Failed to load students', error: error.message });
  }
});

app.delete('/student/:id', async (req, res) => {
  try {
    const deleted = await User.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ message: 'Student not found' });
    }
    return res.json({ message: 'Student deleted' });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to delete student', error: error.message });
  }
});

app.patch('/student/:id/ban', async (req, res) => {
  try {
    const student = await User.findById(req.params.id);
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    const isBanned = !student.banned;
    const updated = await User.findByIdAndUpdate(
      req.params.id,
      { 
        banned: isBanned,
        bannedAt: isBanned ? new Date() : null
      },
      { new: true }
    ).select('-password');

    return res.json({ 
      message: isBanned ? 'Student banned successfully' : 'Student unbanned successfully',
      student: updated
    });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to update student ban status', error: error.message });
  }
});

app.post('/order/place', async (req, res) => {
  try {
    const { canID, studentID, items } = req.body;

    if (!canID || !studentID || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: 'canID, studentID, and items are required' });
    }

    if (!mongoose.Types.ObjectId.isValid(studentID)) {
      return res.status(400).json({ message: 'Invalid studentID' });
    }

    const student = await User.findOne({ _id: studentID, canID });
    if (!student) {
      return res.status(404).json({ message: 'Student not found for this canID' });
    }

    const normalizedItems = [];
    let total = 0;

    for (const item of items) {
      const { foodID, quantity } = item;

      if (!mongoose.Types.ObjectId.isValid(foodID) || !quantity || Number(quantity) <= 0) {
        return res.status(400).json({ message: 'Each item must have valid foodID and quantity > 0' });
      }

      const food = await Food.findOne({ _id: foodID, canID });
      if (!food) {
        return res.status(404).json({ message: `Food not found for id ${foodID}` });
      }

      if (!food.inStock) {
        return res.status(400).json({ message: `${food.name} is out of stock` });
      }

      const qty = Number(quantity);
      total += food.price * qty;
      normalizedItems.push({ foodID: food._id, quantity: qty });
    }

    const orderID = await generateUniqueOrderID();

    const order = await Order.create({
      orderID,
      canID,
      studentID,
      items: normalizedItems,
      total,
      status: 'Preparing'
    });

    return res.status(201).json({ message: 'Order placed', order });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to place order', error: error.message });
  }
});

app.get('/orders/:canID', async (req, res) => {
  try {
    const orders = await Order.find({ canID: req.params.canID })
      .populate('studentID', 'name email')
      .populate('items.foodID', 'name price')
      .sort({ createdAt: -1 });

    return res.json(orders);
  } catch (error) {
    return res.status(500).json({ message: 'Failed to load orders', error: error.message });
  }
});

app.get('/student/orders/:studentID', async (req, res) => {
  try {
    const { studentID } = req.params;
    const { canID } = req.query;

    if (!canID) {
      return res.status(400).json({ message: 'canID is required as query parameter' });
    }

    if (!mongoose.Types.ObjectId.isValid(studentID)) {
      return res.status(400).json({ message: 'Invalid studentID' });
    }

    const orders = await Order.find({ canID, studentID })
      .populate('items.foodID', 'name price')
      .sort({ createdAt: -1 });

    return res.json(orders);
  } catch (error) {
    return res.status(500).json({ message: 'Failed to load student orders', error: error.message });
  }
});

app.get('/student/session/:studentID', async (req, res) => {
  try {
    const { studentID } = req.params;
    const { canID } = req.query;

    if (!canID) {
      return res.status(400).json({ message: 'canID is required as query parameter' });
    }

    if (!mongoose.Types.ObjectId.isValid(studentID)) {
      return res.status(400).json({ message: 'Invalid studentID' });
    }

    const student = await User.findOne({ _id: studentID, canID }).select('banned');
    if (!student) {
      return res.status(404).json({ message: 'Student not found for this canID' });
    }

    return res.json({
      studentID,
      canID,
      banned: Boolean(student.banned)
    });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to load student session status', error: error.message });
  }
});

app.patch('/order/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    const allowed = ['Preparing', 'Ready', 'Delivered'];

    if (!allowed.includes(status)) {
      return res.status(400).json({ message: 'Invalid status value' });
    }

    const updated = await Order.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ message: 'Order not found' });
    }

    return res.json({ message: 'Order status updated', order: updated });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to update order status', error: error.message });
  }
});

app.get('/', (req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, 'admin-login.html'));
});

connectDB().then(() => {
  app.listen(PORT, HOST, () => {
    console.log(`Server running on http://${HOST}:${PORT}`);
  });
});
