/**
 * @file profile.routes.js
 * @description This file configures the primary API routing and versioning for the backend.
 * 
 * NOTE: This file is essential for the backend architecture. 
 * It follows the Model-View-Controller (MVC) pattern.
 */

const express = require('express');
const router = express.Router();
const controller = require('../../../controllers/profile.controller');
const { authenticate } = require('../../../middleware/auth.middleware');

router.get('/', authenticate, controller.getProfile);
router.put('/', authenticate, controller.updateProfile);
router.post('/kyc', authenticate, controller.submitKyc);

module.exports = router;
