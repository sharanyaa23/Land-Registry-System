// src/validators/polygon.validator.js
const Joi = require('joi');

// ─────────────────────────────────────────────────────────────
// EXISTING VALIDATORS
// ─────────────────────────────────────────────────────────────

const savePolygon = Joi.object({
  geoJson: Joi.object().required()
    .messages({ 'any.required': 'GeoJSON object is required' }),
  source: Joi.string()
    .valid('user_drawn', 'bhuvan_import', 'mahabhunaksha')
    .default('user_drawn')
});

const idParam = Joi.object({
  id: Joi.string().hex().length(24).required()
    .messages({ 'string.hex': 'Invalid MongoDB ObjectId format' })
});

// ─────────────────────────────────────────────────────────────
// MAHABHUNAKSHA VALIDATOR — FIXED
// ─────────────────────────────────────────────────────────────

const fromMahabhunaksha = Joi.object({
  landId: Joi.string().hex().length(24).optional()
    .messages({ 'string.hex': 'Invalid landId format' }),

  ownerName: Joi.when('landId', {
    is: Joi.exist(),
    then: Joi.string().optional().allow(''),
    otherwise: Joi.string().min(2).max(200).required()
      .messages({ 'any.required': 'ownerName is required when landId is not provided' })
  }),

  // ── Numeric codes (required) ────────────────────────────────
  districtValue: Joi.string().min(1).max(10).required()
    .messages({ 'any.required': 'districtValue (numeric code) is required' }),

  talukaValue: Joi.string().min(1).max(10).required()
    .messages({ 'any.required': 'talukaValue (numeric code) is required' }),

  villageValue: Joi.string().min(1).max(50).required()
    .messages({ 'any.required': 'villageValue (village code) is required' }),

  // ── Marathi name fallbacks (optional — resolved from JSON on frontend) ──
  district: Joi.string().max(100).optional().allow(''),
  taluka:   Joi.string().max(100).optional().allow(''),
  village:  Joi.string().max(200).optional().allow(''),

  surveyNo: Joi.string()
    .pattern(/^[0-9A-Za-z\u0900-\u097F\/\- ]+$/)
    .required()
    .messages({ 'any.required': 'Survey number is required' }),

  area:    Joi.number().positive().optional(),
  khataNo: Joi.string().optional().allow('')
});

// ─────────────────────────────────────────────────────────────
// OTHER VALIDATORS (unchanged)
// ─────────────────────────────────────────────────────────────

const getPolygonById = idParam;

const vertexPayload = Joi.object({
  vertices: Joi.array().items(
    Joi.object({
      id:   Joi.string().pattern(/^V\d+$/i).required(),
      lat:  Joi.number().min(-90).max(90).required(),
      lng:  Joi.number().min(-180).max(180).required(),
      rawX: Joi.string().optional(),
      rawY: Joi.string().optional()
    })
  ).min(3).required()
    .messages({ 'array.min': 'At least 3 vertices are required to form a valid polygon' })
});

const kmlExport = Joi.object({
  id: Joi.string().hex().length(24).required(),
  includeMeasurements: Joi.boolean().default(true),
  customName: Joi.string().max(200).optional()
});

// ─────────────────────────────────────────────────────────────
// MIDDLEWARE
// ─────────────────────────────────────────────────────────────

const validateSavePolygon = (req, res, next) => {
  const { error } = savePolygon.validate(req.body);
  if (error) return res.status(400).json({ success: false, error: error.details[0].message });
  next();
};

const validateFromMahabhunaksha = (req, res, next) => {
  const { error } = fromMahabhunaksha.validate(req.body);
  if (error) return res.status(400).json({ success: false, error: error.details[0].message });
  next();
};

const validateIdParam = (req, res, next) => {
  const { error } = idParam.validate(req.params);
  if (error) return res.status(400).json({ success: false, error: error.details[0].message });
  next();
};

module.exports = {
  savePolygon,
  idParam,
  fromMahabhunaksha,
  getPolygonById,
  vertexPayload,
  kmlExport,
  validateSavePolygon,
  validateFromMahabhunaksha,
  validateIdParam,
  validateGetById: validateIdParam,
};