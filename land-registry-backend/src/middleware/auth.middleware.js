/**
 * @file auth.middleware.js
 * @description Intercepts every authenticated API request to verify the user's identity.
 *
 *              AUTHENTICATION FLOW (Wallet-Based, No Passwords):
 *              1. User connects their MetaMask wallet on the frontend
 *              2. Backend generates a unique nonce (random number) for the wallet address
 *              3. User signs the nonce with their private key in MetaMask (proves ownership)
 *              4. Backend verifies the signature using ethers.js and issues a JWT token
 *              5. This middleware extracts the JWT from the Authorization header on every request,
 *                 decodes it, finds the user in MongoDB, and attaches req.user and req.userId
 *              6. If the token is invalid or expired, the request is rejected with 401 Unauthorized
 *
 *              WHY WALLET AUTH? Unlike traditional email/password, wallet-based auth guarantees
 *              that the person making the request actually controls the blockchain wallet.
 *              This is critical for a land registry where ownership = wallet address.
 *
 * NOTE: This file is essential for the backend architecture.
 * It follows the Model-View-Controller (MVC) pattern.
 */

const jwt = require('jsonwebtoken');
const User = require('../models/User.model');
const logger = require('../utils/logger');

const JWT_SECRET = process.env.JWT_SECRET || 'land-registry-dev-secret-change-in-production';

/**
 * JWT authentication middleware.
 * Extracts token from Authorization header, verifies it,
 * and attaches the user document to req.user.
 */
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required. Provide Bearer token.'
      });
    }

    const token = authHeader.split(' ')[1];

    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({ success: false, error: 'Token expired' });
      }
      return res.status(401).json({ success: false, error: 'Invalid token' });
    }

    const user = await User.findById(decoded.userId).lean();

    if (!user || !user.isActive) {
      return res.status(401).json({
        success: false,
        error: 'User not found or deactivated'
      });
    }

   console.log('Bearer ' + token);

    req.user = user;
    req.userId = user._id;
    next();
  } catch (err) {
    logger.error('Auth middleware error', { error: err.message });
    return res.status(500).json({ success: false, error: 'Authentication error' });
  }
};

/**
 * Generate a JWT token for a user.
 */
const generateToken = (user) => {
  return jwt.sign(
    {
      userId: user._id,
      walletAddress: user.walletAddress,
      role: user.role
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
};

/**
 * Optional auth — attaches user if token present, but doesn't block.
 */
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      const decoded = jwt.verify(token, JWT_SECRET);
      const user = await User.findById(decoded.userId).lean();
      if (user && user.isActive) {
        req.user = user;
        req.userId = user._id;
      }
    }
  } catch (_) {
    // Silently continue without auth
  }
  next();
};

module.exports = { authenticate, generateToken, optionalAuth };
