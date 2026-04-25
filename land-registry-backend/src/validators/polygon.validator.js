/**
 * @file polygon.validator.js
 * @description This validator defines the request payload validation schemas to ensure data integrity.
 * 
 * NOTE: This file is essential for the backend architecture. 
 * It follows the Model-View-Controller (MVC) pattern.
 */

// src/validators/polygon.validator.js
const Joi = require('joi');

// ─────────────────────────────────────────────────────────────
// EXISTING VALIDATORS (Kept + Minor Improvements)
// ─────────────────────────────────────────────────────────────

/**
 * POST /land/:id/polygon
 */
const savePolygon = Joi.object({
  geoJson: Joi.object().required()
    .messages({ 'any.required': 'GeoJSON object is required' }),
  source: Joi.string()
    .valid('user_drawn', 'bhuvan_import', 'mahabhunaksha')
    .default('user_drawn')
});

/**
 * Params — :id (used for land/:id/polygon and polygon/:id routes)
 */
const idParam = Joi.object({
  id: Joi.string().hex().length(24).required()
    .messages({ 'string.hex': 'Invalid MongoDB ObjectId format' })
});

// ─────────────────────────────────────────────────────────────
// NEW VALIDATORS FOR MAHABHUNAKSHA + BHUVAN
// ─────────────────────────────────────────────────────────────

/**
 * POST /polygon/from-mahabhunaksha
 * Accepts survey details + landId to trigger scrape
 */
const fromMahabhunaksha = Joi.object({
  landId: Joi.string().hex().length(24).optional()
    .messages({
      'string.hex': 'Invalid landId format'
    }),

  ownerName: Joi.when('landId', {
    is: Joi.exist(),
    then: Joi.string().optional(),
    otherwise: Joi.string().min(2).max(200).required()
      .messages({ 'any.required': 'ownerName is required when landId is not provided' })
  }),

  district: Joi.string().min(2).max(100).required()
    .messages({ 'any.required': 'District name is required' }),

  taluka: Joi.string().min(2).max(100).required()
    .messages({ 'any.required': 'Taluka name is required' }),

  village: Joi.string().min(2).max(200).required()
    .messages({ 'any.required': 'Village name is required' }),

  surveyNo: Joi.string()
    .pattern(/^[0-9A-Za-z\/\- ]+$/)
    .min(1)
    .max(50)
    .required()
    .messages({
      'string.pattern.base': 'Survey number can only contain letters, numbers, spaces, / and -',
      'any.required': 'Survey number is required'
    }),

  area: Joi.number().positive().optional(),
  khataNo: Joi.string().optional()
});
/**
 * GET /polygon/:id/bhuvan-preview
 * GET /polygon/:id/export/kml
 * (Reuses idParam, but defined separately for clarity)
 */
const getPolygonById = idParam;   // alias for clarity

/**
 * Vertex coordinate payload validation
 * (Useful if you ever expose a direct vertex import endpoint)
 */
const vertexPayload = Joi.object({
  vertices: Joi.array().items(
    Joi.object({
      id: Joi.string().pattern(/^V\d+$/i).required(),
      lat: Joi.number().min(-90).max(90).required(),
      lng: Joi.number().min(-180).max(180).required(),
      rawX: Joi.string().optional(),
      rawY: Joi.string().optional()
    })
  ).min(3).required()
    .messages({
      'array.min': 'At least 3 vertices are required to form a valid polygon'
    })
});

/**
 * KML Export Request (for future query params if needed)
 */
const kmlExport = Joi.object({
  id: Joi.string().hex().length(24).required(),
  // Optional future extensions
  includeMeasurements: Joi.boolean().default(true),
  customName: Joi.string().max(200).optional()
});

// ─────────────────────────────────────────────────────────────
// Middleware Functions
// ─────────────────────────────────────────────────────────────

const validateSavePolygon = (req, res, next) => {
  const { error } = savePolygon.validate(req.body);
  if (error) {
    return res.status(400).json({
      success: false,
      error: error.details[0].message
    });
  }
  next();
};

const validateFromMahabhunaksha = (req, res, next) => {
  const { error } = fromMahabhunaksha.validate(req.body);
  if (error) {
    return res.status(400).json({
      success: false,
      error: error.details[0].message
    });
  }
  next();
};

const validateIdParam = (req, res, next) => {
  const { error } = idParam.validate(req.params);
  if (error) {
    return res.status(400).json({
      success: false,
      error: error.details[0].message
    });
  }
  next();
};

// Export everything
module.exports = {
  // Existing
  savePolygon,
  idParam,
  validateSavePolygon,
  validateIdParam,

  // New Mahabhunaksha + Bhuvan
  fromMahabhunaksha,
  validateFromMahabhunaksha,
  getPolygonById,
  validateGetById: validateIdParam,   // reuse for /:id routes

  // Additional schemas (for direct use if needed)
  vertexPayload,
  kmlExport,

  // Middleware
  validateSavePolygon,
  validateFromMahabhunaksha,
  validateIdParam
};