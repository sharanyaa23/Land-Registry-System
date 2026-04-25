/**
 * @file verification.routes.js
 * @description This file configures the primary API routing and versioning for the backend.
 * 
 * NOTE: This file is essential for the backend architecture. 
 * It follows the Model-View-Controller (MVC) pattern.
 */

const express = require('express');
const router = express.Router();
const controller = require('../../../controllers/verification.controller');
const { authenticate } = require('../../../middleware/auth.middleware');
const { uploadSingle } = require('../../../middleware/upload.middleware');


router.post('/verify', controller.verifyLand);         // Alias for backwards compat
router.post('/document-compare', authenticate, uploadSingle, controller.documentCompare);
router.get('/:landId/result', authenticate, controller.getResult);
router.post('/:landId/retry', authenticate, controller.retry);

module.exports = router;