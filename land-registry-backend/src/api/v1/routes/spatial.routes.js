/**
 * @file spatial.routes.js
 * @description This file configures the primary API routing and versioning for the backend.
 * 
 * NOTE: This file is essential for the backend architecture. 
 * It follows the Model-View-Controller (MVC) pattern.
 */

// src/api/v1/routes/spatial.routes.js
const express = require('express');
const router = express.Router();
const controller = require('../../../controllers/spatial.controller');
const { optionalAuth } = require('../../../middleware/auth.middleware');

// Optional auth — public endpoint, but attaches user if token present
router.get('/plot-boundary', optionalAuth, controller.getPlotBoundary);

module.exports = router;
// const express = require('express');
