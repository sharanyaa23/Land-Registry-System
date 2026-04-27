const express = require('express');
const router = express.Router();
const controller = require('../../../controllers/polygon.controller');
const { authenticate } = require('../../../middleware/auth.middleware');
const { requireRole } = require('../../../middleware/role.middleware');
const {
  validateSavePolygon,
  validateIdParam,
  validateFromMahabhunaksha
} = require('../../../validators/polygon.validator');

router.get('/test', (req, res) => res.json({ ok: true }));

router.post('/from-mahabhunaksha',   authenticate, requireRole('seller'), validateFromMahabhunaksha, controller.fromMahabhunaksha);
router.post('/:id/polygon',          authenticate, requireRole('seller'), validateIdParam, validateSavePolygon, controller.savePolygon);
router.get('/:id/polygon',           authenticate, validateIdParam, controller.getPolygon);
router.post('/:id/polygon/validate', authenticate, validateIdParam, controller.validatePolygon);
router.get('/:id/bhuvan-preview',    authenticate, validateIdParam, controller.getBhuvanPreview);
router.get('/:id/export/kml',        authenticate, validateIdParam, controller.exportKml);

module.exports = router;