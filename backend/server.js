const express = require('express');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const http = require('http');
const crypto = require('crypto');
const session = require('express-session');
const { Server } = require('socket.io');

require("dotenv").config();
const connectDB = require('./db');
const Canteen = require('./Canteen');
const User = require('./User');
const Food = require('./Food');
const Order = require('./Order');
const Payment = require('./Payment');
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
const STUDENT_DIR = path.join(FRONTEND_DIR, 'student');
const RAZORPAY_API_BASE = 'https://api.razorpay.com/v1';
const ORDER_STATUS_PRIORITY = {
  Preparing: 0,
  Ready: 1,
  Delivered: 2
};
const VALID_ORDER_STATUSES = ['Preparing', 'Ready', 'Delivered'];
const STUDENT_PAGE_FILE_MAP = {
  login: 'login.html',
  signup: 'signup.html',
  home: 'home.html',
  cart: 'cart.html',
  payment: 'payment.html',
  'order-success': 'order-success.html',
  'my-orders': 'my-orders.html',
  profile: 'profile.html'
};

if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

const sessionSecret = String(process.env.SESSION_SECRET || '').trim();
if (!sessionSecret) {
  throw new Error('SESSION_SECRET is required');
}

const corsOriginsFromEnv = String(process.env.CORS_ORIGIN || process.env.CORS_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

function isAllowedOrigin(origin, req) {
  if (!origin) return true;
  if (corsOriginsFromEnv.length > 0) {
    return corsOriginsFromEnv.includes(origin);
  }
  const reqHost = String(req.headers.host || '').trim();
  if (!reqHost) return false;
  const sameOriginHttp = `http://${reqHost}`;
  const sameOriginHttps = `https://${reqHost}`;
  if (origin === sameOriginHttp || origin === sameOriginHttps) return true;
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin);
}

const sessionMiddleware = session({
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 1000 * 60 * 60 * 8
  }
});

const io = new Server(server, {
  cors: {
    origin: true,
    credentials: true
  }
});

app.use((req, res, next) => {
  const requestOrigin = String(req.headers.origin || '').trim();
  if (!isAllowedOrigin(requestOrigin, req)) {
    return res.status(403).json({ message: 'CORS origin not allowed' });
  }
  const corsDelegate = cors({
    credentials: true,
    origin: true
  });
  return corsDelegate(req, res, next);
});
app.use(express.json());
app.use(sessionMiddleware);
app.use('/assets', express.static(ASSETS_DIR));

app.use((req, res, next) => {
  const method = String(req.method || 'GET').toUpperCase();
  const isWriteMethod = !['GET', 'HEAD', 'OPTIONS'].includes(method);
  if (!isWriteMethod) return next();

  const origin = String(req.headers.origin || '').trim();
  const referer = String(req.headers.referer || '').trim();
  const originAllowed = !origin || isAllowedOrigin(origin, req);
  let refererAllowed = true;
  if (referer) {
    try {
      const refererOrigin = new URL(referer).origin;
      refererAllowed = isAllowedOrigin(refererOrigin, req);
    } catch (_) {
      refererAllowed = false;
    }
  }

  if (!originAllowed || !refererAllowed) {
    return res.status(403).json({ message: 'CSRF validation failed' });
  }
  return next();
});

function ensureStudentPageAuth(req, res, next) {
  if (req.method !== 'GET') {
    return next();
  }
  const studentSession = req.session?.student;
  let requestPath = String(req.path || '').toLowerCase();
  if (requestPath === '/' || requestPath === '') {
    return next();
  }
  if (requestPath.endsWith('.html')) {
    requestPath = requestPath.slice(0, -5);
  }
  const pageKey = requestPath.replace(/^\//, '');
  if (!STUDENT_PAGE_FILE_MAP[pageKey]) {
    return next();
  }
  const isPublicStudentPage = pageKey === 'login' || pageKey === 'signup';
  if (!studentSession?.studentId || !studentSession?.canID) {
    if (isPublicStudentPage) return next();
    return res.redirect('/student/login');
  }
  if (isPublicStudentPage) {
    return res.redirect('/student/home');
  }
  return next();
}

app.get('/student', ensureStudentPageAuth, (req, res) => {
  if (req.session?.student?.studentId && req.session?.student?.canID) {
    return res.redirect('/student/home');
  }
  return res.redirect('/student/login');
});

app.get('/student/:page', ensureStudentPageAuth, (req, res, next) => {
  const page = String(req.params.page || '').toLowerCase();
  const fileName = STUDENT_PAGE_FILE_MAP[page];
  if (!fileName) return next();
  return res.sendFile(path.join(STUDENT_DIR, fileName));
});

app.get('/student/:page.html', ensureStudentPageAuth, (req, res, next) => {
  const page = String(req.params.page || '').toLowerCase();
  if (!STUDENT_PAGE_FILE_MAP[page]) return next();
  return res.redirect(`/student/${page}`);
});

app.use('/student', ensureStudentPageAuth, express.static(STUDENT_DIR));
app.use(express.static(FRONTEND_DIR));

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

function toOrderDate(value = new Date()) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(date.getTime())) {
    const error = new Error('Invalid orderDate');
    error.status = 400;
    throw error;
  }
  date.setHours(0, 0, 0, 0);
  return date;
}

function parseOrderDateKey(value) {
  const raw = String(value || '').trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  date.setHours(0, 0, 0, 0);
  return date;
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
    date: formatOrderDateKey(toOrderDate(orderDate))
  });
}

function getRazorpayCredentials() {
  const readEnv = (names) => {
    for (const name of names) {
      const raw = process.env[name];
      const value = String(raw || '').trim().replace(/^['"]|['"]$/g, '');
      if (value) return value;
    }
    return '';
  };
  const keyId = readEnv(['RAZORPAY_KEY_ID', 'RAZORPAY_KEYID', 'RAZORPAY_KEY']);
  const keySecret = readEnv(['RAZORPAY_KEY_SECRET', 'RAZORPAY_SECRET', 'RAZORPAY_KEYSECRET']);
  if (!keyId || !keySecret) {
    const error = new Error(
      'Razorpay is not configured on server. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in environment.'
    );
    error.status = 500;
    throw error;
  }
  return { keyId, keySecret };
}

async function callRazorpay(pathname, { method = 'GET', body, keyId, keySecret } = {}) {
  const headers = {
    Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`
  };
  if (body) headers['Content-Type'] = 'application/json';

  const response = await fetch(`${RAZORPAY_API_BASE}${pathname}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });

  const raw = await response.text();
  let data = {};
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch (_) {
    data = {};
  }

  if (!response.ok) {
    const message = data?.error?.description || data?.error?.reason || data?.message || 'Razorpay request failed';
    const error = new Error(message);
    error.status = 502;
    throw error;
  }

  return data;
}

function createReceiptToken() {
  return `rcpt_${Date.now()}_${randomToken(4)}`;
}

function toPaise(amountInRupees) {
  return Math.round(Number(amountInRupees || 0) * 100);
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

function requireAdminAuth(req, res, next) {
  const adminSession = req.session?.admin;
  if (!adminSession?.adminId || !adminSession?.canID) {
    return res.status(401).json({ message: 'Admin authentication required' });
  }
  req.adminSession = adminSession;
  return next();
}

function requireAdminOrStaffAuth(req, res, next) {
  const staffSession = req.session?.staff;
  if (staffSession?.staffId && staffSession?.canteenId) {
    req.staffSession = staffSession;
    return next();
  }
  const adminSession = req.session?.admin;
  if (adminSession?.adminId && adminSession?.canID) {
    req.adminSession = adminSession;
    return next();
  }
  return res.status(401).json({ message: 'Authentication required' });
}

function requireAnySessionAuth(req, res, next) {
  const studentSession = req.session?.student;
  if (studentSession?.studentId && studentSession?.canID) {
    req.studentSession = studentSession;
    return next();
  }
  return requireAdminOrStaffAuth(req, res, next);
}

function getSessionCanID(req) {
  return req.staffSession?.canteenId || req.adminSession?.canID || req.studentSession?.canID || '';
}

function requireStudentAuth(req, res, next) {
  const studentSession = req.session?.student;
  if (!studentSession?.studentId || !studentSession?.canID) {
    return res.status(401).json({ message: 'Student authentication required' });
  }
  req.studentSession = studentSession;
  return next();
}

function ensureStaffDashboardAuth(req, res, next) {
  if (!req.session?.staff?.staffId) {
    return res.redirect('/staff/login');
  }
  return next();
}

async function ensurePaymentIndexes() {
  try {
    const indexes = await Payment.collection.indexes();
    const oldRazorpayPaymentIndex = indexes.find((index) => (
      index?.name === 'razorpay_payment_id_1' &&
      index?.unique === true &&
      !index?.partialFilterExpression
    ));

    if (oldRazorpayPaymentIndex) {
      await Payment.collection.dropIndex('razorpay_payment_id_1');
    }

    await Payment.syncIndexes();
  } catch (error) {
    console.error('Payment index sync warning:', error.message);
  }
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
      { returnDocument: 'after' }
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

    req.session.admin = {
      adminId: String(canteen._id),
      canID: canteen.canID,
      email: canteen.email,
      collegeName: canteen.collegeName,
      loginAt: new Date().toISOString()
    };

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

    req.session.admin = {
      adminId: String(canteen._id),
      canID: canteen.canID,
      email: canteen.email,
      collegeName: canteen.collegeName,
      loginAt: new Date().toISOString()
    };

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

    req.session.student = {
      studentId: String(student._id),
      canID: student.canID,
      name: student.name,
      email: student.email,
      loginAt: new Date().toISOString()
    };

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

    req.session.student = {
      studentId: String(student._id),
      canID: student.canID,
      name: student.name,
      email: student.email,
      loginAt: new Date().toISOString()
    };

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

app.post('/student/logout', (req, res) => {
  if (req.session?.student) {
    delete req.session.student;
  }
  req.session.save(() => {
    res.json({ message: 'Student logout successful' });
  });
});

app.get('/admin/dashboard/:canID', requireAdminAuth, async (req, res) => {
  try {
    const { canID } = req.params;
    if (canID !== req.adminSession.canID) {
      return res.status(403).json({ message: 'Cannot access another canteen dashboard' });
    }
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

app.get('/admin/analytics/:canID', requireAdminAuth, async (req, res) => {
  try {
    const { canID } = req.params;
    if (canID !== req.adminSession.canID) {
      return res.status(403).json({ message: 'Cannot access another canteen analytics' });
    }
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
        const dateKey = formatOrderDateKey(order.createdAt);
        acc[dateKey] = (acc[dateKey] || 0) + Number(order.total || 0);
        return acc;
      }, {});

    const revenueTrend = Object.entries(revenueTrendMap)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, total]) => ({ date, total }));

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

app.get('/foods/:canID', requireAnySessionAuth, async (req, res) => {
  try {
    const requestedCanID = String(req.params.canID || '').trim();
    const sessionCanID = getSessionCanID(req);
    if (!requestedCanID || requestedCanID !== sessionCanID) {
      return res.status(403).json({ message: 'Cannot access foods from another canteen' });
    }
    const foods = await Food.find({ canID: requestedCanID }).sort({ name: 1 });
    return res.json(foods);
  } catch (error) {
    return res.status(500).json({ message: 'Failed to load foods', error: error.message });
  }
});

app.post('/food/add', requireAdminAuth, async (req, res) => {
  try {
    const { canID, name, price, inStock, category, imageUrl } = req.body;

    if (!canID || !name || price === undefined) {
      return res.status(400).json({ message: 'canID, name, and price are required' });
    }
    if (String(canID) !== req.adminSession.canID) {
      return res.status(403).json({ message: 'Cannot add food for another canteen' });
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

app.delete('/food/:id', requireAdminAuth, async (req, res) => {
  try {
    const deleted = await Food.findOneAndDelete({ _id: req.params.id, canID: req.adminSession.canID });
    if (!deleted) {
      return res.status(404).json({ message: 'Food not found' });
    }
    return res.json({ message: 'Food deleted' });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to delete food', error: error.message });
  }
});

app.patch('/food/:id', requireAdminAuth, async (req, res) => {
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

    const updated = await Food.findOneAndUpdate(
      { _id: req.params.id, canID: req.adminSession.canID },
      updates,
      { returnDocument: 'after' }
    );
    if (!updated) {
      return res.status(404).json({ message: 'Food not found' });
    }

    return res.json({ message: 'Food updated', food: updated });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to update food', error: error.message });
  }
});

app.get('/students/:canID', requireAdminAuth, async (req, res) => {
  try {
    const requestedCanID = String(req.params.canID || '').trim();
    if (requestedCanID !== req.adminSession.canID) {
      return res.status(403).json({ message: 'Cannot access students from another canteen' });
    }
    const students = await User.find({ canID: requestedCanID }).select('-password').sort({ name: 1 });
    return res.json(students);
  } catch (error) {
    return res.status(500).json({ message: 'Failed to load students', error: error.message });
  }
});

app.delete('/student/:id', requireAdminAuth, async (req, res) => {
  try {
    const deleted = await User.findOneAndDelete({ _id: req.params.id, canID: req.adminSession.canID });
    if (!deleted) {
      return res.status(404).json({ message: 'Student not found' });
    }
    return res.json({ message: 'Student deleted' });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to delete student', error: error.message });
  }
});

app.patch('/student/:id/ban', requireAdminAuth, async (req, res) => {
  try {
    const student = await User.findOne({ _id: req.params.id, canID: req.adminSession.canID });
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    const isBanned = !student.banned;
    const updated = await User.findByIdAndUpdate(
      { _id: req.params.id, canID: req.adminSession.canID },
      { 
        banned: isBanned,
        bannedAt: isBanned ? new Date() : null
      },
      { returnDocument: 'after' }
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
  const orderDate = toOrderDate(new Date());

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

app.post('/order/place', requireStudentAuth, async (req, res) => {
  try {
    const canID = req.studentSession.canID;
    const { studentID, items } = req.body;
    if (String(studentID || '') !== req.studentSession.studentId) {
      return res.status(403).json({ message: 'Student mismatch for this session' });
    }
    const order = await createOrderWithDailyToken({ canID, studentID, items });
    emitOrderEvent('newOrder', order);
    return res.status(201).json({ message: 'Order placed', order });
  } catch (error) {
    return res.status(error.status || 500).json({ message: 'Failed to place order', error: error.message });
  }
});

app.post('/payment/razorpay/order', requireStudentAuth, async (req, res) => {
  try {
    const canID = req.studentSession.canID;
    const { studentID, items } = req.body || {};
    if (String(studentID || '') !== req.studentSession.studentId) {
      return res.status(403).json({ message: 'Student mismatch for this session' });
    }
    const { total } = await buildValidatedOrderInput({ canID, studentID, items });
    const amount = toPaise(total);
    if (amount <= 0) {
      return res.status(400).json({ message: 'Order total must be greater than zero' });
    }

    const { keyId, keySecret } = getRazorpayCredentials();
    const razorpayOrder = await callRazorpay('/orders', {
      method: 'POST',
      keyId,
      keySecret,
      body: {
        amount,
        currency: 'INR',
        receipt: createReceiptToken(),
        notes: {
          canID,
          studentID: String(studentID || '')
        }
      }
    });

    await Payment.findOneAndUpdate(
      {
        razorpay_order_id: razorpayOrder.id,
        userId: studentID
      },
      {
        orderId: null,
        userId: studentID,
        razorpay_order_id: razorpayOrder.id,
        amount: Number(razorpayOrder.amount || amount),
        currency: razorpayOrder.currency || 'INR',
        status: 'created',
        paidAt: null,
        canID
      },
      { upsert: true, setDefaultsOnInsert: true, returnDocument: 'after' }
    );

    return res.json({
      keyId,
      razorpayOrderId: razorpayOrder.id,
      amount: razorpayOrder.amount,
      currency: razorpayOrder.currency || 'INR'
    });
  } catch (error) {
    return res.status(error.status || 500).json({
      message: error.message || 'Failed to create Razorpay order',
      error: error.message
    });
  }
});

app.post('/payment/razorpay/verify-and-place', requireStudentAuth, async (req, res) => {
  try {
    const canID = req.studentSession.canID;
    const { studentID, items } = req.body || {};
    const razorpayOrderId = String(req.body?.razorpay_order_id || '').trim();
    const razorpayPaymentId = String(req.body?.razorpay_payment_id || '').trim();
    const razorpaySignature = String(req.body?.razorpay_signature || '').trim();

    if (!canID || !studentID || !Array.isArray(items) || !items.length) {
      return res.status(400).json({ message: 'canID, studentID and items are required' });
    }
    if (String(studentID || '') !== req.studentSession.studentId) {
      return res.status(403).json({ message: 'Student mismatch for this session' });
    }
    if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
      return res.status(400).json({ message: 'Razorpay payment fields are required' });
    }

    const { keyId, keySecret } = getRazorpayCredentials();
    const expectedSignature = crypto
      .createHmac('sha256', keySecret)
      .update(`${razorpayOrderId}|${razorpayPaymentId}`)
      .digest('hex');
    const signatureMatched = (
      expectedSignature.length === razorpaySignature.length &&
      crypto.timingSafeEqual(Buffer.from(expectedSignature), Buffer.from(razorpaySignature))
    );
    if (!signatureMatched) {
      return res.status(400).json({ message: 'Invalid payment signature' });
    }

    const payment = await callRazorpay(`/payments/${encodeURIComponent(razorpayPaymentId)}`, {
      method: 'GET',
      keyId,
      keySecret
    });
    const normalizedStatus = String(payment?.status || '').toLowerCase();
    if (payment?.order_id !== razorpayOrderId || !['captured', 'authorized'].includes(normalizedStatus)) {
      return res.status(400).json({ message: 'Payment is not valid for this order' });
    }

    const { total } = await buildValidatedOrderInput({ canID, studentID, items });
    const expectedAmount = toPaise(total);
    if (Number(payment?.amount || 0) !== expectedAmount) {
      return res.status(400).json({ message: 'Paid amount does not match current order total' });
    }

    const isPaidState = ['captured', 'authorized'].includes(normalizedStatus);
    const paymentRecord = await Payment.findOneAndUpdate(
      {
        razorpay_order_id: razorpayOrderId,
        userId: studentID
      },
      {
        userId: studentID,
        razorpay_order_id: razorpayOrderId,
        razorpay_payment_id: razorpayPaymentId,
        amount: Number(payment?.amount || expectedAmount),
        currency: String(payment?.currency || 'INR'),
        status: isPaidState ? normalizedStatus : 'failed',
        paidAt: isPaidState ? new Date() : null,
        canID
      },
      { upsert: true, setDefaultsOnInsert: true, returnDocument: 'after' }
    );

    const existingOrderId = String(paymentRecord?.orderId || '').trim();
    if (existingOrderId && !existingOrderId.startsWith('LOCK:')) {
      const existingOrder = await Order.findOne({ orderID: existingOrderId, canID, studentID });
      if (existingOrder) {
        return res.status(201).json({
          message: 'Payment verified and order placed',
          order: existingOrder
        });
      }
    }

    const lockToken = `LOCK:${Date.now()}:${randomToken(6)}`;
    const lockedPayment = await Payment.findOneAndUpdate(
      {
        _id: paymentRecord._id,
        $or: [{ orderId: null }, { orderId: '' }]
      },
      { orderId: lockToken },
      { returnDocument: 'after' }
    );

    if (!lockedPayment) {
      for (let attempt = 0; attempt < 8; attempt += 1) {
        const latestPayment = await Payment.findById(paymentRecord._id).select('orderId');
        const latestOrderId = String(latestPayment?.orderId || '').trim();
        if (latestOrderId && !latestOrderId.startsWith('LOCK:')) {
          const existingOrder = await Order.findOne({ orderID: latestOrderId, canID, studentID });
          if (existingOrder) {
            return res.status(201).json({
              message: 'Payment verified and order placed',
              order: existingOrder
            });
          }
        }
        await new Promise((resolve) => setTimeout(resolve, 120));
      }
      return res.status(409).json({ message: 'Payment is already being processed' });
    }

    let order;
    try {
      order = await createOrderWithDailyToken({ canID, studentID, items });
      await Payment.findOneAndUpdate(
        { _id: paymentRecord._id, orderId: lockToken },
        { orderId: order.orderID },
        { returnDocument: 'after' }
      );
    } catch (error) {
      await Payment.findOneAndUpdate(
        { _id: paymentRecord._id, orderId: lockToken },
        { orderId: null },
        { returnDocument: 'after' }
      );
      throw error;
    }

    emitOrderEvent('newOrder', order);
    return res.status(201).json({
      message: 'Payment verified and order placed',
      order
    });
  } catch (error) {
    return res.status(error.status || 500).json({ message: 'Failed to verify payment and place order', error: error.message });
  }
});

app.get('/payment/history/:studentID', requireStudentAuth, async (req, res) => {
  try {
    const studentID = String(req.params?.studentID || '').trim();
    const canID = String(req.query?.canID || '').trim();
    if (!canID) {
      return res.status(400).json({ message: 'canID is required as query parameter' });
    }
    if (studentID !== req.studentSession.studentId || canID !== req.studentSession.canID) {
      return res.status(403).json({ message: 'Session does not match requested student data' });
    }
    if (!mongoose.Types.ObjectId.isValid(studentID)) {
      return res.status(400).json({ message: 'Invalid studentID' });
    }

    const payments = await Payment.find({ userId: studentID, canID })
      .sort({ createdAt: -1 })
      .select('orderId userId razorpay_order_id razorpay_payment_id amount currency status paidAt createdAt updatedAt');

    return res.json(payments);
  } catch (error) {
    return res.status(500).json({ message: 'Failed to load payment history', error: error.message });
  }
});

app.post('/api/orders/create', requireAdminOrStaffAuth, async (req, res) => {
  try {
    const canID = String(req.body?.canID || req.body?.canteenId || '').trim();
    const sessionCanID = req.staffSession?.canteenId || req.adminSession?.canID || '';
    if (!canID || canID !== sessionCanID) {
      return res.status(403).json({ message: 'Cannot create order for another canteen' });
    }
    const { studentID, items } = req.body;
    const order = await createOrderWithDailyToken({ canID, studentID, items });
    emitOrderEvent('newOrder', order);
    return res.status(201).json({ message: 'Order created', order });
  } catch (error) {
    return res.status(error.status || 500).json({ message: 'Failed to create order', error: error.message });
  }
});

app.get('/orders/:canID', requireAdminOrStaffAuth, async (req, res) => {
  try {
    const requestedCanID = String(req.params.canID || '').trim();
    const sessionCanID = req.staffSession?.canteenId || req.adminSession?.canID || '';
    if (!requestedCanID || requestedCanID !== sessionCanID) {
      return res.status(403).json({ message: 'Cannot access orders from another canteen' });
    }
    const orders = await Order.find({ canID: requestedCanID })
      .populate('studentID', 'name email')
      .populate('items.foodID', 'name price')
      .sort({ createdAt: -1 });

    return res.json(orders);
  } catch (error) {
    return res.status(500).json({ message: 'Failed to load orders', error: error.message });
  }
});

app.get('/student/orders/:studentID', requireStudentAuth, async (req, res) => {
  try {
    const { studentID } = req.params;
    const canID = String(req.query?.canID || '').trim();

    if (!canID) {
      return res.status(400).json({ message: 'canID is required as query parameter' });
    }
    if (studentID !== req.studentSession.studentId || canID !== req.studentSession.canID) {
      return res.status(403).json({ message: 'Session does not match requested student data' });
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

app.get('/student/session/:studentID', requireStudentAuth, async (req, res) => {
  try {
    const { studentID } = req.params;
    const canID = String(req.query?.canID || '').trim();

    if (!canID) {
      return res.status(400).json({ message: 'canID is required as query parameter' });
    }
    if (studentID !== req.studentSession.studentId || canID !== req.studentSession.canID) {
      return res.status(403).json({ message: 'Session does not match requested student data' });
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

app.patch('/order/:id/status', requireAdminOrStaffAuth, async (req, res) => {
  try {
    const { status } = req.body;
    const allowed = VALID_ORDER_STATUSES;

    if (!allowed.includes(status)) {
      return res.status(400).json({ message: 'Invalid status value' });
    }

    const sessionCanID = req.staffSession?.canteenId || req.adminSession?.canID || '';
    const updated = await Order.findOneAndUpdate(
      { _id: req.params.id, canID: sessionCanID },
      { status },
      { returnDocument: 'after' }
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

app.get('/admin/staffs/:canID', requireAdminAuth, async (req, res) => {
  try {
    const requestedCanID = String(req.params.canID || '').trim();
    if (requestedCanID !== req.adminSession.canID) {
      return res.status(403).json({ message: 'Cannot access staffs from another canteen' });
    }
    const staffs = await Staff.find({ canteenId: requestedCanID })
      .select('-password')
      .sort({ createdAt: -1 });
    return res.json(staffs);
  } catch (error) {
    return res.status(500).json({ message: 'Failed to load staffs', error: error.message });
  }
});

app.patch('/admin/staff/:id/review', requireAdminAuth, async (req, res) => {
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
    if (canID !== req.adminSession.canID) {
      return res.status(403).json({ message: 'Cannot review staff from another canteen' });
    }
    const staff = await Staff.findOneAndUpdate(
      { _id: req.params.id, canteenId: canID },
      { status: nextStatus },
      { returnDocument: 'after' }
    ).select('-password');

    if (!staff) {
      return res.status(404).json({ message: 'Staff not found' });
    }
    return res.json({ message: `Staff ${nextStatus.toLowerCase()}`, staff });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to review staff request', error: error.message });
  }
});

app.patch('/api/orders/:id/mark-ready', requireAdminOrStaffAuth, async (req, res) => {
  try {
    const sessionCanID = req.staffSession?.canteenId || req.adminSession?.canID || '';
    const order = await Order.findOne({ _id: req.params.id, canID: sessionCanID });
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    if (!order.dailyToken) {
      order.dailyToken = await generateUniqueDailyToken({
        canID: order.canID,
        orderDate: toOrderDate(order.orderDate || order.createdAt || new Date())
      });
    }
    if (!order.orderDate) {
      order.orderDate = toOrderDate(order.createdAt || new Date());
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

  const parsedOrderDate = parseOrderDateKey(normalizedDate);
  if (!parsedOrderDate) {
    const error = new Error('date must be in YYYY-MM-DD format');
    error.status = 400;
    throw error;
  }
  const nextDate = new Date(parsedOrderDate.getTime());
  nextDate.setDate(nextDate.getDate() + 1);

  const existing = await Order.findOne({
    orderID: normalizedOrderId,
    canID: normalizedCanteenId,
    orderDate: { $gte: parsedOrderDate, $lt: nextDate },
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

app.get('/api/orders/verify', requireAdminOrStaffAuth, async (req, res) => {
  try {
    const token = String(req.query?.token || '').trim();
    if (!/^\d{4}$/.test(token)) {
      return res.status(400).json({ message: 'Invalid token format' });
    }
    const canteenId = String(req.query?.canteenId || '').trim();
    const sessionCanID = req.staffSession?.canteenId || req.adminSession?.canID || '';
    if (!canteenId || canteenId !== sessionCanID) {
      return res.status(403).json({ message: 'Cannot verify another canteen order' });
    }
    res.set('Cache-Control', 'no-store');
    const result = await verifyOrderAndMarkDelivered({
      orderId: req.query?.orderId,
      token,
      canteenId,
      date: req.query?.date
    });
    return res.status(result.status).json(result.body);
  } catch (error) {
    return res.status(error.status || 500).json({ message: 'Failed to verify order', error: error.message });
  }
});

app.post('/api/orders/scan', requireAdminOrStaffAuth, async (req, res) => {
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
      const sessionCanID = req.staffSession?.canteenId || req.adminSession?.canID || '';
      if (String(parsed.canteenId || '').trim() !== sessionCanID) {
        return res.status(403).json({ message: 'Cannot verify another canteen order' });
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
    const sessionCanID = req.staffSession?.canteenId || req.adminSession?.canID || '';
    if (String(payload.canID || '').trim() !== sessionCanID) {
      return res.status(403).json({ message: 'Cannot verify another canteen order' });
    }

    const updated = await Order.findOneAndUpdate(
      {
        orderID: payload.orderId,
        canID: payload.canID,
        status: 'Ready',
        qrToken: scannedToken
      },
      { status: 'Delivered' },
      { returnDocument: 'after' }
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
  res.redirect('/student/login');
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

connectDB().then(async () => {
  await ensurePaymentIndexes();
  server.listen(PORT, HOST, () => {
    console.log(`Server running on http://${HOST}:${PORT}`);
  });
});

