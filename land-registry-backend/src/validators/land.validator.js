const Joi = require('joi');

// POST /land/register
const registerLand = Joi.object({
  ownerName:           Joi.string().trim().required(),
  mobile:              Joi.string().trim().allow('').default(''),

  district:            Joi.string().trim().required(),
  districtValue:       Joi.string().trim().allow(''),
  taluka:              Joi.string().trim().required(),
  talukaValue:         Joi.string().trim().allow(''),
  village:             Joi.string().trim().required(),
  villageValue:        Joi.string().trim().allow(''),
  surveyNumber:        Joi.string().trim().required(),
  gatNumber:           Joi.string().trim().allow(''),
  area:                Joi.number().positive().required(),
  areaUnit:            Joi.string().valid('sqm', 'hectare', 'acre', 'guntha').default('hectare'),
  encumbrances:        Joi.string().allow('').default(''),
  boundaryDescription: Joi.string().allow('').default(''),

  coOwners: Joi.array().items(
    Joi.object({
      fullName:      Joi.string().trim().allow(''),
      name:          Joi.string().trim().allow(''),
      sharePercent:  Joi.number().min(0).max(100).default(0),
      share:         Joi.number().min(0).max(100).default(0),
      walletAddress: Joi.string().trim().allow('', null).default(null),
    })
  ).default([]),
});

// PUT /land/:id
const updateLand = Joi.object({
  location: Joi.object({
    district:      Joi.string().trim(),
    districtValue: Joi.string().trim().allow(''),
    taluka:        Joi.string().trim(),
    talukaValue:   Joi.string().trim().allow(''),
    village:       Joi.string().trim(),
    villageValue:  Joi.string().trim().allow(''),
    surveyNumber:  Joi.string().trim(),
    gatNumber:     Joi.string().trim().allow('')
  }),
  area: Joi.object({
    value: Joi.number().positive(),
    unit:  Joi.string().valid('sqm', 'hectare', 'acre', 'guntha')
  }),
  encumbrances:        Joi.string().allow(''),
  boundaryDescription: Joi.string().allow('')
}).min(1);

// POST /land/:id/upload-documents
const uploadDocuments = Joi.object({
  sevenTwelveCID:          Joi.string().trim(),
  mahabhulekhSnapshotCID:  Joi.string().trim(),
  mahabhunakshaSnapshotCID: Joi.string().trim()
}).min(1);

// PUT /land/:id/status
const updateStatus = Joi.object({
  status: Joi.string()
    .valid(
      'draft',
      'documents_uploaded',
      'verification_pending',
      'verification_passed',
      'verification_failed',
      'officer_review',
      'listed',
      'transfer_pending',
      'transferred',
      'frozen'          // ← added
    )
    .required()
});

// POST /land/:id/list-for-sale
const listForSale = Joi.object({
  price: Joi.number().positive().required().messages({
    'number.positive': 'Price must be greater than 0',
    'any.required':    'Price is required to list land for sale'
  }),
  currency: Joi.string()
    .valid('POL', 'ETH', 'USDT', 'INR')
    .default('POL')
});

// Params — :id
const idParam = Joi.object({
  id: Joi.string().hex().length(24).required()
});

module.exports = {
  registerLand,
  updateLand,
  uploadDocuments,
  updateStatus,
  listForSale,
  idParam
};