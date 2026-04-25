/**
 * @file auth.controller.js
 * @description This controller handles incoming HTTP requests, processes business logic, and returns API responses.
 * 
 * NOTE: This file is essential for the backend architecture. 
 * It follows the Model-View-Controller (MVC) pattern.
 */

const asyncHandler = require('../utils/asyncHandler');
const nonceService = require('../services/auth/nonce.service');
const signatureService = require('../services/auth/signature.service');
const { buildSiweMessage } = require('../utils/walletUtils');
const User = require('../models/User.model');
const logger = require('../utils/logger');
// Make sure this import exists at the top of auth.controller.js
const { generateToken } = require('../middleware/auth.middleware');

/**
 * POST /auth/nonce
 * Generate a nonce for wallet-based SIWE authentication.
 * Also returns whether the wallet already exists and its role,
 * so the frontend can skip role-selection for returning users.
 */
exports.getNonce = asyncHandler(async (req, res) => {
  const { walletAddress } = req.body;

  if (!walletAddress) {
    return res.status(400).json({ success: false, error: 'walletAddress required' });
  }

  const nonce = await nonceService.generate(walletAddress);

  // Build the SIWE message for the frontend to display
  const message = buildSiweMessage({
    address: walletAddress,
    nonce,
    chainId: parseInt(process.env.CHAIN_ID) || 137,
    domain: process.env.FRONTEND_DOMAIN || 'localhost',
    uri: process.env.FRONTEND_URI || 'http://localhost:3000'
  });

  // Check if wallet is already registered — helps frontend decide the flow
  const existingUser = await User.findOne({ walletAddress: walletAddress.toLowerCase() }).select('role').lean();

  res.json({
    success: true,
    nonce,
    message,
    existingRole: existingUser?.role || null
  });
});

/**
 * POST /auth/verify
 * Verify a signed SIWE message and issue JWT.
 * Auto-creates profile if user is new.
 * For returning users, the role in DB is preserved (no escalation).
 */
exports.verifySignature = asyncHandler(async (req, res) => {
  const { message, signature, role } = req.body;

  if (!message || !signature) {
    return res.status(400).json({
      success: false,
      error: 'message and signature required'
    });
  }

  // Validate role if provided — only buyer/seller can self-select
  const validRoles = ['seller', 'buyer'];
  const userRole = validRoles.includes(role) ? role : 'buyer';

  const result = await signatureService.verifyAndAuthenticate({
    message,
    signature,
    role: userRole
  });

  logger.info('User authenticated', {
    walletAddress: result.user.walletAddress,
    role: result.user.role,
    isNew: result.isNew
  });

  res.json({
    success: true,
    ...result
  });
});

/**
 * GET /auth/me
 * Get current authenticated user from JWT.
 */
exports.getMe = asyncHandler(async (req, res) => {
  const user = await User.findById(req.userId).select('-nonce');

  if (!user) {
    return res.status(404).json({ success: false, error: 'User not found' });
  }

  res.json({
    success: true,
    user
  });
});

/**
 * POST /auth/whitelist-officer
 * Admin-only: pre-whitelist a wallet as an officer for a tehsil.
 * Officers cannot self-register — they must be whitelisted here.
 */
exports.whitelistOfficer = asyncHandler(async (req, res) => {
  const { walletAddress, tehsil } = req.body;

  if (!walletAddress || !tehsil) {
    return res.status(400).json({ success: false, error: 'walletAddress and tehsil required' });
  }

  // Check if wallet already exists
  let user = await User.findOne({ walletAddress: walletAddress.toLowerCase() });

  if (user) {
    // Upgrade existing user to officer
    if (user.role === 'officer') {
      return res.status(409).json({ success: false, error: 'Wallet is already an officer' });
    }
    user.role = 'officer';
    user.officerMeta = {
      tehsil,
      whitelistedBy: req.user.walletAddress,
      whitelistedAt: new Date()
    };
    await user.save();
    logger.info('Existing user upgraded to officer', { walletAddress, tehsil, by: req.user.walletAddress });
  } else {
    // Pre-create officer account
    user = await User.create({
      walletAddress: walletAddress.toLowerCase(),
      role: 'officer',
      profile: {},
      officerMeta: {
        tehsil,
        whitelistedBy: req.user.walletAddress,
        whitelistedAt: new Date()
      },
      isActive: true
    });
    logger.info('Officer pre-whitelisted', { walletAddress, tehsil, by: req.user.walletAddress });
  }

  res.status(201).json({
    success: true,
    user: {
      _id: user._id,
      walletAddress: user.walletAddress,
      role: user.role,
      officerMeta: user.officerMeta
    }
  });
});


exports.updateRole = asyncHandler(async (req, res) => {
  const { role } = req.body;
  const validRoles = ['buyer', 'seller'];
  if (!validRoles.includes(role)) {
    return res.status(400).json({ success: false, error: 'Invalid role' });
  }

  const user = await User.findByIdAndUpdate(
    req.userId,
    { role },
    { new: true }
  );

  // Re-issue JWT with new role
  const token = generateToken(user);
  console.log('updateRole called', { userId: req.userId, body: req.body });
  res.json({ success: true, user, token });
});