/**
 * @file webhook.routes.js
 * @description This file configures the primary API routing and versioning for the backend.
 * 
 * NOTE: This file is essential for the backend architecture. 
 * It follows the Model-View-Controller (MVC) pattern.
 */

const express = require('express');
const router = express.Router();
const controller = require('../../../controllers/webhook.controller');

// Webhooks are unauthenticated — they use shared secrets instead
router.post('/pinata', controller.pinataWebhook);
router.post('/blockchain', controller.blockchainWebhook);

module.exports = router;
