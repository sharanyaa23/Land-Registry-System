/**
 * @file document.routes.js
 * @description Defines the Express API routes for document processing, specifically OCR extraction.
 *              Uses multer middleware for multipart file uploads (image buffer stored in memory).
 *
 *              ROUTE:
 *              POST /document/ocr-712 → Receives a 7/12 extract image, runs Tesseract OCR,
 *                                        extracts land details, and returns them to auto-fill
 *                                        the seller's registration form.
 *
 *              ESCALATION: If the OCR confidence is below 60% and a landId is included in the
 *                          request body, the system automatically creates an OfficerCase for
 *                          manual verification by a government officer.
 *
 * NOTE: This file is essential for the backend architecture.
 * It follows the Model-View-Controller (MVC) pattern.
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const ocrController = require('../../../controllers/ocr.controller');
const { authenticate } = require('../../../middleware/auth.middleware');
const { requireRole } = require('../../../middleware/role.middleware');

// Setup multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only images are allowed'));
    }
  }
});

// Seller uploads 7/12 for OCR extraction
router.post('/ocr-712', authenticate, requireRole('seller'), upload.single('document'), ocrController.extract712Data);

module.exports = router;
