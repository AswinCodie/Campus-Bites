const express = require('express');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const http = require('http');
const session = require('express-session');
const { Server } = require('socket.io');

require("dotenv").config();
const connectDB = require('./db');
const Canteen = require('./Canteen');
const User = require('./User');
const Food = require('./Food');
const Order = require('./Order');
const Staff = require('./Staff');
const {
  generateUniquePickupToken,
  signOrderQrToken,
  verifyOrderQrToken
} = require('./utils/orderTokens');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 5000;
const HOST = '0.0.0.0';
const FRONTEND_DIR = path.join(__dirname, '..', 'frontend');
const ASSETS_DIR = path.join(__dirname, '..', 'assets');
const ORDER_STATUS_PRIORITY = {
  Preparing: 0,
  Ready: 1,
  Delivered: 2
};
const VALID_ORDER_STATUSES = ['Preparing', 'Ready', 'Delivered'];

const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET || 'change-me-session-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: false,
    maxAge: 1000 * 60 * 60 * 8
  }
});

const io = new Server(server, {
  cors: {
    origin: true,
    credentials: true
  }
});

app.use(cors({ credentials: true, origin: true }));
app.use(express.json());
app.use(sessionMiddleware);
app.use(express.static(FRONTEND_DIR));
app.use('/assets', express.static(ASSETS_DIR));

io.use((socket, next) => {
  sessionMiddleware(socket.request, {}, next);
});

io.on('connection', (socket) => {
  const staffSession = socket.request?.session?.staff;
  if (!staffSession?.canteenId) return;
  socket.join(`staff:${staffSession.canteenId}`);
});

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

function formatOrderDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function createDailyToken() {
  return String(1000 + Math.floor(Math.random() * 9000));
}

async function generateUniqueDailyToken({ canID, orderDate }, maxAttempts = 120) {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const dailyToken = createDailyToken();
    const exists = await Order.exists({ canID, orderDate, dailyToken });
    if (!exists) return dailyToken;
  }
  throw new Error('Unable to generate a unique daily token');
}

function buildOrderQrPayload({ orderID, dailyToken, canID, orderDate }) {
  return JSON.stringify({
    orderId: String(orderID),
    token: String(dailyToken),
    canteenId: String(canID),
    date: String(orderDate)
  });
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

function normalizeStatusSortValue(status) {
  if (ORDER_STATUS_PRIORITY[status] !== undefined) return ORDER_STATUS_PRIORITY[status];
  return Number.MAX_SAFE_INTEGER;
}

function sortOrdersByStatusPriority(orders) {
  return [...orders].sort((a, b) => {
    const byPriority = normalizeStatusSortValue(a.status) - normalizeStatusSortValue(b.status);
    if (byPriority !== 0) return byPriority;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

function getStartAndEndOfToday() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

function emitOrderEvent(eventName, orderDoc) {
  if (!orderDoc?.canID) return;
  const orderPayload = typeof orderDoc.toObject === 'function' ? orderDoc.toObject() : orderDoc;
  io.to(`staff:${orderDoc.canID}`).emit(eventName, { order: orderPayload });
}

function requireStaffAuth(req, res, next) {
  const staffSession = req.session?.staff;
  if (!staffSession?.staffId || !staffSession?.canteenId) {
    return res.status(401).json({ message: 'Staff authentication required' });
  }
  req.staffSession = staffSession;
  return next();
}

function ensureStaffDashboardAuth(req, res, next) {
  if (!req.session?.staff?.staffId) {
    return res.redirect('/staff/login');
  }
  return next();
}

app.post('/api/staff/login', async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');

    if (!email || !password) {
      return res.status(400).json({ message: 'email and password are required' });
    }

    const staff = await Staff.findOne({ email });
    if (!staff) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    if (staff.status !== 'Approved') {
      return res.status(403).json({ message: 'Staff account is not approved yet. Please contact admin.' });
    }

    const storedPassword = String(staff.password || '');
    const isHashed = storedPassword.startsWith('$2a$') || storedPassword.startsWith('$2b$') || storedPassword.startsWith('$2y$');
    const isPasswordValid = isHashed
      ? await bcrypt.compare(password, storedPassword)
      : password === storedPassword;

    if (!isPasswordValid) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    req.session.staff = {
      staffId: String(staff._id),
      name: staff.name,
      email: staff.email,
      canteenId: staff.canteenId,
      loginAt: new Date().toISOString()
    };

    return res.json({
      message: 'Staff login successful',
      session: req.session.staff,
      staff: {
        _id: staff._id,
        name: staff.name,
        email: staff.email,
        canteenId: staff.canteenId
      }
    });
  } catch (error) {
    return res.status(500).json({ message: 'Staff login failed', error: error.message });
  }
});

app.post('/api/staff/signup', async (req, res) => {
  try {
    const name = String(req.body?.name || '').trim();
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    const canteenId = String(req.body?.canteenId || '').trim();

    if (!name || !email || !password || !canteenId) {
      return res.status(400).json({ message: 'name, email, password and canteenId are required' });
    }
    if (!isValidEmail(email)) {
      return res.status(400).json({ message: 'Please provide a valid email address' });
    }
    if (!isValidPassword(password)) {
      return res.status(400).json({ message: 'Password must be at least 8 characters' });
    }

    const canteen = await Canteen.findOne({ canID: canteenId }).select('_id');
    if (!canteen) {
      return res.status(404).json({ message: 'Invalid canteen ID' });
    }

    const existing = await Staff.findOne({ email });
    if (existing) {
      if (existing.status === 'Approved') {
        return res.status(409).json({ message: 'Staff already approved. Please login.' });
      }
      return res.status(409).json({ message: `Staff request already exists with status: ${existing.status}` });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const staff = await Staff.create({
      name,
      email,
      password: hashedPassword,
      canteenId,
      status: 'Pending'
    });

    return res.status(201).json({
      message: 'Signup request sent. Ask admin to approve.',
      staff: {
        _id: staff._id,
        name: staff.name,
        email: staff.email,
        canteenId: staff.canteenId,
        status: staff.status
      }
    });
  } catch (error) {
    return res.status(500).json({ message: 'Staff signup failed', error: error.message });
  }
});

app.get('/api/staff/me', requireStaffAuth, async (req, res) => {
  return res.json({ session: req.staffSession });
});

app.post('/api/staff/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    return res.json({ message: 'Logged out successfully' });
  });
});

app.get('/api/orders', requireStaffAuth, async (req, res) => {
  try {
    const requestedCanteenId = String(req.query?.canteenId || '').trim();
    if (requestedCanteenId && requestedCanteenId !== req.staffSession.canteenId) {
      return res.status(403).json({ message: 'Cannot access orders from another canteen' });
    }

    const canteenId = req.staffSession.canteenId;
    const { start, end } = getStartAndEndOfToday();
    const orders = await Order.find({ canID: canteenId })
      .where('createdAt').gte(start).lt(end)
      .populate('items.foodID', 'name')
      .sort({ createdAt: -1 });
    const staffOrders = sortOrdersByStatusPriority(orders).map((order) => ({
      _id: order._id,
      orderID: order.orderID,
      orderDate: order.orderDate,
      dailyToken: order.dailyToken,
      status: order.status,
      total: order.total,
      createdAt: order.createdAt,
      items: (order.items || []).map((item) => ({
        name: item.foodID?.name || 'Unknown',
        quantity: item.quantity
      })),
      canID: order.canID
    }));

    return res.json(staffOrders);
  } catch (error) {
    return res.status(500).json({ message: 'Failed to load staff orders', error: error.message });
  }
});

app.put('/api/orders/:orderId/status', requireStaffAuth, async (req, res) => {
  try {
    const { orderId } = req.params;
    const status = String(req.body?.status || '').trim();

    if (!VALID_ORDER_STATUSES.includes(status)) {
      return res.status(400).json({ message: 'Invalid status value' });
    }

    const query = { canID: req.staffSession.canteenId };
    if (mongoose.Types.ObjectId.isValid(orderId)) {
      query.$or = [{ _id: orderId }, { orderID: orderId }];
    } else {
      query.orderID = orderId;
    }

    const updated = await Order.findOneAndUpdate(
      query,
      { status },
      { new: true }
    ).populate('items.foodID', 'name');

    if (!updated) {
      return res.status(404).json({ message: 'Order not found for your canteen' });
    }

    emitOrderEvent('orderUpdated', updated);
    return res.json({
      message: 'Order status updated',
      order: {
        _id: updated._id,
        orderID: updated.orderID,
        orderDate: updated.orderDate,
        dailyToken: updated.dailyToken,
        status: updated.status,
        total: updated.total,
        createdAt: updated.createdAt,
        canID: updated.canID,
        items: (updated.items || []).map((item) => ({
          name: item.foodID?.name || 'Unknown',
          quantity: item.quantity
        }))
      }
    });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to update order status', error: error.message });
  }
});

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

async function buildValidatedOrderInput({ canID, studentID, items }) {
  if (!canID || !studentID || !Array.isArray(items) || items.length === 0) {
    const error = new Error('canID, studentID, and items are required');
    error.status = 400;
    throw error;
  }

  if (!mongoose.Types.ObjectId.isValid(studentID)) {
    const error = new Error('Invalid studentID');
    error.status = 400;
    throw error;
  }

  const student = await User.findOne({ _id: studentID, canID });
  if (!student) {
    const error = new Error('Student not found for this canID');
    error.status = 404;
    throw error;
  }

  const normalizedItems = [];
  let total = 0;

  for (const item of items) {
    const { foodID, quantity } = item;
    if (!mongoose.Types.ObjectId.isValid(foodID) || !quantity || Number(quantity) <= 0) {
      const error = new Error('Each item must have valid foodID and quantity > 0');
      error.status = 400;
      throw error;
    }

    const food = await Food.findOne({ _id: foodID, canID });
    if (!food) {
      const error = new Error(`Food not found for id ${foodID}`);
      error.status = 404;
      throw error;
    }

    if (!food.inStock) {
      const error = new Error(`${food.name} is out of stock`);
      error.status = 400;
      throw error;
    }

    const qty = Number(quantity);
    total += food.price * qty;
    normalizedItems.push({ foodID: food._id, quantity: qty });
  }

  return { normalizedItems, total };
}

async function createOrderWithDailyToken({ canID, studentID, items }) {
  const { normalizedItems, total } = await buildValidatedOrderInput({ canID, studentID, items });
  const orderID = await generateUniqueOrderID();
  const orderDate = formatOrderDateKey(new Date());

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const dailyToken = await generateUniqueDailyToken({ canID, orderDate });
    const qrToken = buildOrderQrPayload({ orderID, dailyToken, canID, orderDate });
    const pickupToken = await generateUniquePickupToken();

    try {
      const order = await Order.create({
        orderID,
        canID,
        orderDate,
        dailyToken,
        studentID,
        items: normalizedItems,
        total,
        pickupToken,
        qrToken,
        status: 'Preparing'
      });
      return order;
    } catch (error) {
      const duplicate = error?.code === 11000 && (
        error?.keyPattern?.dailyToken ||
        error?.keyPattern?.orderID ||
        error?.keyPattern?.pickupToken
      );
      if (!duplicate || attempt === 11) throw error;
    }
  }

  throw new Error('Unable to create order');
}

app.post('/order/place', async (req, res) => {
  try {
    const canID = String(req.body?.canID || req.body?.canteenId || '').trim();
    const { studentID, items } = req.body;
    const order = await createOrderWithDailyToken({ canID, studentID, items });
    emitOrderEvent('newOrder', order);
    return res.status(201).json({ message: 'Order placed', order });
  } catch (error) {
    return res.status(error.status || 500).json({ message: 'Failed to place order', error: error.message });
  }
});

app.post('/api/orders/create', async (req, res) => {
  try {
    const canID = String(req.body?.canID || req.body?.canteenId || '').trim();
    const { studentID, items } = req.body;
    const order = await createOrderWithDailyToken({ canID, studentID, items });
    emitOrderEvent('newOrder', order);
    return res.status(201).json({ message: 'Order created', order });
  } catch (error) {
    return res.status(error.status || 500).json({ message: 'Failed to create order', error: error.message });
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
    const allowed = VALID_ORDER_STATUSES;

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

    emitOrderEvent('orderUpdated', updated);
    return res.json({ message: 'Order status updated', order: updated });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to update order status', error: error.message });
  }
});

app.get('/admin/staffs/:canID', async (req, res) => {
  try {
    const staffs = await Staff.find({ canteenId: req.params.canID })
      .select('-password')
      .sort({ createdAt: -1 });
    return res.json(staffs);
  } catch (error) {
    return res.status(500).json({ message: 'Failed to load staffs', error: error.message });
  }
});

app.patch('/admin/staff/:id/review', async (req, res) => {
  try {
    const action = String(req.body?.action || '').trim().toLowerCase();
    const canID = String(req.body?.canID || '').trim();
    const nextStatus = action === 'accept' ? 'Approved' : action === 'decline' ? 'Declined' : '';
    if (!nextStatus) {
      return res.status(400).json({ message: 'action must be accept or decline' });
    }
    if (!canID) {
      return res.status(400).json({ message: 'canID is required' });
    }
    const staff = await Staff.findOneAndUpdate(
      { _id: req.params.id, canteenId: canID },
      { status: nextStatus },
      { new: true }
    ).select('-password');

    if (!staff) {
      return res.status(404).json({ message: 'Staff not found' });
    }
    return res.json({ message: `Staff ${nextStatus.toLowerCase()}`, staff });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to review staff request', error: error.message });
  }
});

app.patch('/api/orders/:id/mark-ready', async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    if (!order.dailyToken) {
      order.dailyToken = await generateUniqueDailyToken({
        canID: order.canID,
        orderDate: order.orderDate || formatOrderDateKey(order.createdAt || new Date())
      });
    }
    if (!order.orderDate) {
      order.orderDate = formatOrderDateKey(order.createdAt || new Date());
    }
    if (!order.pickupToken) {
      order.pickupToken = await generateUniquePickupToken();
    }
    if (!order.qrToken) {
      order.qrToken = buildOrderQrPayload({
        orderID: order.orderID,
        dailyToken: order.dailyToken,
        canID: order.canID,
        orderDate: order.orderDate
      });
    }

    order.status = 'Ready';
    await order.save();

    emitOrderEvent('orderUpdated', order);
    return res.json({ message: 'Order marked as ready', order });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to mark order as ready', error: error.message });
  }
});

async function verifyOrderAndMarkDelivered({ orderId, token, canteenId, date }) {
  const normalizedOrderId = String(orderId || '').trim();
  const normalizedToken = String(token || '').trim();
  const normalizedCanteenId = String(canteenId || '').trim();
  const normalizedDate = String(date || '').trim();

  if (!normalizedOrderId || !normalizedToken || !normalizedCanteenId || !normalizedDate) {
    const error = new Error('orderId, token, canteenId and date are required');
    error.status = 400;
    throw error;
  }

  const existing = await Order.findOne({
    orderID: normalizedOrderId,
    canID: normalizedCanteenId,
    orderDate: normalizedDate,
    dailyToken: normalizedToken
  })
    .populate('studentID', 'name email')
    .populate('items.foodID', 'name');

  if (!existing) {
    return { status: 404, body: { message: 'Order not found for today' } };
  }

  if (existing.status === 'Delivered') {
    return { status: 409, body: { message: 'Order already delivered', order: existing } };
  }

  existing.status = 'Delivered';
  await existing.save();
  emitOrderEvent('orderUpdated', existing);

  return {
    status: 200,
    body: {
      message: 'Order delivered',
      order: existing
    }
  };
}

app.get('/api/orders/verify', async (req, res) => {
  try {
    const result = await verifyOrderAndMarkDelivered({
      orderId: req.query?.orderId,
      token: req.query?.token,
      canteenId: req.query?.canteenId,
      date: req.query?.date
    });
    return res.status(result.status).json(result.body);
  } catch (error) {
    return res.status(error.status || 500).json({ message: 'Failed to verify order', error: error.message });
  }
});

app.post('/api/orders/scan', async (req, res) => {
  try {
    const scannedToken = String(req.body?.token || '').trim();
    if (!scannedToken) {
      return res.status(400).json({ message: 'Scanned token is required' });
    }

    if (scannedToken.startsWith('{')) {
      let parsed;
      try {
        parsed = JSON.parse(scannedToken);
      } catch (_) {
        return res.status(400).json({ message: 'Invalid QR JSON payload' });
      }
      const result = await verifyOrderAndMarkDelivered({
        orderId: parsed.orderId,
        token: parsed.token,
        canteenId: parsed.canteenId,
        date: parsed.date
      });
      return res.status(result.status).json(result.body);
    }

    let payload;
    try {
      payload = verifyOrderQrToken(scannedToken);
    } catch (error) {
      const isExpired = error.name === 'TokenExpiredError';
      return res.status(401).json({ message: isExpired ? 'QR token expired' : 'Invalid QR token' });
    }

    if (payload?.type !== 'order_pickup' || !payload?.orderId || !payload?.canID) {
      return res.status(401).json({ message: 'Invalid QR token payload' });
    }

    const updated = await Order.findOneAndUpdate(
      {
        orderID: payload.orderId,
        canID: payload.canID,
        status: 'Ready',
        qrToken: scannedToken
      },
      { status: 'Delivered' },
      { new: true }
    ).populate('studentID', 'name email');

    if (!updated) {
      const existing = await Order.findOne({
        orderID: payload.orderId,
        canID: payload.canID
      }).populate('studentID', 'name email');

      if (!existing) {
        return res.status(404).json({ message: 'Order not found' });
      }

      if (existing.status === 'Delivered') {
        return res.status(409).json({ message: 'QR already used. Order already delivered' });
      }

      if (existing.status !== 'Ready') {
        return res.status(409).json({ message: 'Order is not ready for pickup' });
      }

      return res.status(409).json({ message: 'Invalid or stale QR token for this order' });
    }

    emitOrderEvent('orderUpdated', updated);
    return res.json({
      message: 'Pickup confirmed. Order marked as delivered',
      order: updated
    });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to process QR scan', error: error.message });
  }
});

app.get('/', (req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, 'student', 'login.html'));
});

app.get('/staff/login', (req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, 'staff-login.html'));
});

app.get('/staff/signup', (req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, 'staff-signup.html'));
});

app.get('/staff/dashboard', ensureStaffDashboardAuth, (req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, 'staff-dashboard.html'));
});

connectDB().then(() => {
  server.listen(PORT, HOST, () => {
    console.log(`Server running on http://${HOST}:${PORT}`);
  });
});
