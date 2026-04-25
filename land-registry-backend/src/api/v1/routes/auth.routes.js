/**
 * @file auth.routes.js
 * @description This file configures the primary API routing and versioning for the backend.
 * 
 * NOTE: This file is essential for the backend architecture. 
 * It follows the Model-View-Controller (MVC) pattern.
 */

const express = require('express');
const router = express.Router();
const controller = require('../../../controllers/auth.controller');
const { authenticate } = require('../../../middleware/auth.middleware');
const { requireRole } = require('../../../middleware/role.middleware');
const { authLimiter } = require('../../../middleware/rateLimit.middleware');

router.post('/nonce', authLimiter, controller.getNonce);
router.post('/verify', authLimiter, controller.verifySignature);
router.get('/me', authenticate, controller.getMe);
router.patch('/role', authenticate, controller.updateRole);

// Admin-only: pre-whitelist officers
router.post('/whitelist-officer', authenticate, requireRole('admin'), controller.whitelistOfficer);

module.exports = router;
