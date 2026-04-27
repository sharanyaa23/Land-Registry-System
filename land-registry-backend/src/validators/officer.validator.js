const Joi = require('joi');

// POST /officer/cases/:id/approve
const approveCase = Joi.object({
  justification: Joi.string().trim().max(2000).allow('').default(''),
  signatureHash: Joi.string().trim().allow('').default(''),

  // Blockchain fields for transfer_review
  txHash:   Joi.string().trim().allow('', null).optional(),
  reviewId: Joi.alternatives().try(
    Joi.number().integer().min(0),
    Joi.string().trim()
  ).optional().allow(null)
});

// POST /officer/cases/:id/reject
const rejectCase = Joi.object({
  justification: Joi.string().trim().max(2000).allow('').default(''),
  signatureHash: Joi.string().trim().allow('').default(''),

  // reason is required for transfer_review rejections
  reason: Joi.string().trim().min(1).max(500).optional().allow('', null),

  // Blockchain fields
  txHash:   Joi.string().trim().allow('', null).optional(),
  reviewId: Joi.alternatives().try(
    Joi.number().integer().min(0),
    Joi.string().trim()
  ).optional().allow(null)
}).custom((value, helpers) => {
  // Either justification or reason must be provided
  if (!value.justification && !value.reason) {
    return helpers.error('any.required', { message: 'justification or reason is required' });
  }
  return value;
});

// Query params for GET /officer/cases
const listCasesQuery = Joi.object({
  status: Joi.string().valid('queued', 'in_review', 'approved', 'rejected', 'escalated'),
  type:   Joi.string().valid('verification_review', 'transfer_review', 'dispute'),
  page:   Joi.number().integer().min(1).default(1),
  limit:  Joi.number().integer().min(1).max(100).default(20),
  sort:   Joi.string()
});

// Params — :id
const idParam = Joi.object({
  id: Joi.string().hex().length(24).required()
});

// Params — :landId
const landIdParam = Joi.object({
  landId: Joi.string().hex().length(24).required()
});

// POST /officer/registrar/add or /remove
const registrarBody = Joi.object({
  walletAddress: Joi.string().trim().required()
    .messages({ 'any.required': 'walletAddress is required' })
});

// POST /officer/land/:landId/clear-freeze
const clearFreeze = Joi.object({
  txHash: Joi.string().trim().allow('', null).optional()
});

module.exports = {
  approveCase,
  rejectCase,
  listCasesQuery,
  idParam,
  landIdParam,
  registrarBody,
  clearFreeze
};