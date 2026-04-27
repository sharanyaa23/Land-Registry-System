const express = require('express');
const router = express.Router();
const controller = require('../../../controllers/transfer.controller');
const { authenticate} = require('../../../middleware/auth.middleware');
const { validate } = require('../../../middleware/validate.middleware');
const {
  createOffer,
  coownerConsent,
  lockFunds,
  submitToOfficers,
  officerDecision,
  finalize,
  idParam
} = require('../../../validators/transfer.validator');

router.post('/offer',              authenticate, validate(createOffer), controller.createOffer);
router.get('/my',                  authenticate, controller.getMyTransfers);
router.get('/incoming',            authenticate, controller.getIncomingOffers);
router.get('/coowner-pending',     authenticate, controller.getCoownerPending);

router.post('/:id/accept',         authenticate, validate(idParam, 'params'), controller.acceptOffer);
router.post('/:id/reject',         authenticate, validate(idParam, 'params'), controller.rejectOffer);
router.post('/:id/coowner-consent',authenticate, validate(idParam, 'params'), validate(coownerConsent), controller.coownerConsent);
router.post('/:id/lock-funds',      authenticate, validate(idParam, 'params'), validate(lockFunds),        controller.lockFunds);
router.post('/:id/submit-officers', authenticate, validate(idParam, 'params'), validate(submitToOfficers), controller.submitToOfficers);
router.post('/:id/officer-decision',authenticate, validate(idParam, 'params'), validate(officerDecision), controller.officerDecision)
router.post('/:id/finalize',       authenticate, validate(idParam, 'params'), validate(finalize), controller.finalize);

module.exports = router;