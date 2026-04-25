/**
 * @file officer.routes.js
 * @description Defines the Express API routes for the Officer/Admin verification workflow.
 *              Maps each endpoint to its respective controller function in officer.controller.js.
 *
 *              ROUTES:
 *              GET  /officer/cases             → List all verification cases (filterable by status/type)
 *              GET  /officer/cases/:id         → Get full details for a single case
 *              POST /officer/cases/:id/approve → Approve a case (requires justification)
 *              POST /officer/cases/:id/reject  → Reject a case (requires justification)
 *
 *              ACCESS: Restricted to users with role 'officer' or 'admin' via requireRole middleware.
 *
 * NOTE: This file is essential for the backend architecture.
 * It follows the Model-View-Controller (MVC) pattern.
 */

const express = require('express');
const router = express.Router();
const controller = require('../../../controllers/officer.controller');
const { authenticate } = require('../../../middleware/auth.middleware');
const { requireRole } = require('../../../middleware/role.middleware');
const { validate } = require('../../../middleware/validate.middleware');
const { approveCase, rejectCase, listCasesQuery, idParam } = require('../../../validators/officer.validator');

router.get('/cases', authenticate, requireRole('officer', 'admin'), validate(listCasesQuery, 'query'), controller.listCases);
router.get('/cases/:id', authenticate, requireRole('officer', 'admin'), validate(idParam, 'params'), controller.getCaseById);
router.post('/cases/:id/approve', authenticate, requireRole('officer', 'admin'), validate(idParam, 'params'), validate(approveCase), controller.approveCase);
router.post('/cases/:id/reject', authenticate, requireRole('officer', 'admin'), validate(idParam, 'params'), validate(rejectCase), controller.rejectCase);

module.exports = router;
