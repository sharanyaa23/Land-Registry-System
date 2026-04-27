const Joi = require('joi');

// POST /transfer/offer
const createOffer = Joi.object({
  landId: Joi.string().hex().length(24).required(),
  price: Joi.number().positive().optional(), // price comes from land listing, not buyer
  currency: Joi.string().valid('POL', 'MATIC', 'ETH', 'INR').default('POL')
});

// POST /transfer/:id/accept — no body needed
const acceptOffer = Joi.object({});

// POST /transfer/:id/reject — no body needed
const rejectOffer = Joi.object({});

// POST /transfer/:id/coowner-consent
const coownerConsent = Joi.object({
  coOwnerId:  Joi.string().hex().length(24).optional().allow('', null),
  approve:    Joi.boolean().required(),
  signature:  Joi.string().allow('', null).optional()
});

// POST /transfer/:id/lock-funds
const lockFunds = Joi.object({
  buyerPrivateKey: Joi.string().optional().allow('', null), // optional on local network
  amountWei:       Joi.string().optional().allow('', null)  // if not provided, uses price from DB
});

// POST /transfer/:id/submit-officers
const submitToOfficers = Joi.object({
  sellerPrivateKey: Joi.string().optional().allow('', null) // optional on local network
});

// POST /transfer/:id/officer-decision
const officerDecision = Joi.object({
  approve:          Joi.boolean().required(),
  reviewId:         Joi.number().integer().required(), // on-chain OfficerMultiSig reviewId
  reason:           Joi.string().when('approve', {
    is: false,
    then: Joi.string().min(1).max(500).required().messages({
      'any.required': 'Reason is required when rejecting',
      'string.empty': 'Reason cannot be empty'
    }),
    otherwise: Joi.string().allow('', null).optional()
  }),
  officerPrivateKey: Joi.string().optional().allow('', null), // optional on local network
  txHash:            Joi.string().optional().allow('', null)
});

// POST /transfer/:id/finalize
const finalize = Joi.object({
  txHash: Joi.string().allow('', null)
});

// Params — :id
const idParam = Joi.object({
  id: Joi.string().hex().length(24).required()
});

module.exports = {
  createOffer,
  acceptOffer,
  rejectOffer,
  coownerConsent,
  lockFunds,
  submitToOfficers,
  officerDecision,
  finalize,
  idParam
};