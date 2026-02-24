const jwt = require('jsonwebtoken');
const Order = require('../Order');

const PICKUP_TOKEN_REGEX = /^\d{4}$/;
const DEFAULT_QR_TOKEN_EXPIRES_IN = '2h';

function getQrSecret() {
  const secret = String(process.env.QR_JWT_SECRET || process.env.JWT_SECRET || process.env.SESSION_SECRET || '').trim();
  if (!secret) {
    throw new Error('QR_JWT_SECRET (or JWT_SECRET/SESSION_SECRET) is required');
  }
  return secret;
}

function createPickupToken() {
  return String(Math.floor(Math.random() * 10000)).padStart(4, '0');
}

async function generateUniquePickupToken(maxAttempts = 50) {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const pickupToken = createPickupToken();
    const exists = await Order.exists({ pickupToken });
    if (!exists) return pickupToken;
  }
  throw new Error('Unable to generate a unique pickup token');
}

function signOrderQrToken({ orderId, canID, pickupToken }) {
  if (!orderId || !canID || !PICKUP_TOKEN_REGEX.test(String(pickupToken || ''))) {
    throw new Error('Invalid payload for QR token');
  }

  return jwt.sign(
    {
      type: 'order_pickup',
      orderId: String(orderId),
      canID: String(canID),
      pickupToken: String(pickupToken)
    },
    getQrSecret(),
    {
      expiresIn: process.env.QR_TOKEN_EXPIRES_IN || DEFAULT_QR_TOKEN_EXPIRES_IN
    }
  );
}

function verifyOrderQrToken(token) {
  return jwt.verify(token, getQrSecret());
}

module.exports = {
  generateUniquePickupToken,
  signOrderQrToken,
  verifyOrderQrToken
};
