const express = require('express');
const router = express.Router();
const controller = require('../../../controllers/officer.controller');
const { authenticate, authorize } = require('../../../middleware/auth.middleware');
const { requireRole } = require('../../../middleware/role.middleware');
const { validate } = require('../../../middleware/validate.middleware');
const {
  approveCase, rejectCase,
  listCasesQuery, idParam,
  landIdParam, registrarBody, clearFreeze
} = require('../../../validators/officer.validator');

// Case management
router.get('/cases',        authenticate, requireRole('officer', 'admin'), validate(listCasesQuery, 'query'), controller.listCases);
router.get('/cases/:id',    authenticate, requireRole('officer', 'admin'), validate(idParam, 'params'),       controller.getCaseById);
router.post('/cases/:id/approve', authenticate, requireRole('officer', 'admin'), validate(idParam, 'params'), validate(approveCase), controller.approveCase);
router.post('/cases/:id/reject',  authenticate, requireRole('officer', 'admin'), validate(idParam, 'params'), validate(rejectCase),  controller.rejectCase);

// Land freeze management
router.post('/land/:landId/clear-freeze', authenticate, requireRole('officer', 'admin'), validate(landIdParam, 'params'), validate(clearFreeze), controller.clearFreeze);
router.post('/registrar/add',    authenticate, requireRole('officer', 'admin'), validate(registrarBody), controller.addRegistrar);
router.post('/registrar/remove', authenticate, requireRole('officer', 'admin'), validate(registrarBody), controller.removeRegistrar);

module.exports = router;