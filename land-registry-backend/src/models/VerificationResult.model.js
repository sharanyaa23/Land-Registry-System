// src/models/VerificationResult.model.js  (or wherever VerificationResult is defined)
const mongoose = require('mongoose');
const { Schema } = mongoose;


const comparisonSchema = new Schema({
  nameMatch: { type: Boolean, default: false },
  nameScore: { type: Number, default: 0 },
  nameDetails: [{
    scrapedName: String,
    score: Number,
    isBestMatch: Boolean
  }],

  // FIX THIS PART
  areaMatch: { type: Boolean, default: false },           // ← Changed to Boolean
  areaScore: { type: Number, default: 0 },
  areaDetails: {
    inputArea: Number,
    inputUnit: String,
    scrapedArea: Number,
    scrapedUnit: String,
    scrapedRaw: String,
    diffSqm: Number,
    toleranceSqm: Number
  },

  encumbranceFlag: { type: Boolean, default: false },
  encumbranceText: String,

  score: { type: Number, default: 0 },
  verdict: {
    type: String,
    enum: ['verified', 'officer_review', 'rejected'],
    default: 'officer_review'
  },
  flags: [String],

  parseSource: String,
  thresholds: {
    nameThreshold: Number,
    areaTolerance: Number
  }
}, { _id: false });   // No separate _id for subdocument

const VerificationResultSchema = new Schema({
  land: { type: Schema.Types.ObjectId, ref: 'Land', required: true },
  comparison: comparisonSchema,
}, {
  timestamps: true
});

module.exports = mongoose.model('VerificationResult', VerificationResultSchema);