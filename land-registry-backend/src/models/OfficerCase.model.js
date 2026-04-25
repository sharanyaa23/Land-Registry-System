/**
 * @file OfficerCase.model.js
 * @description Defines the MongoDB schema for an OfficerCase — a verification case escalated
 *              from the automated OCR system to a government officer for manual review.
 *
 *              WHEN IS A CASE CREATED?
 *              - When the OCR engine scans a 7/12 document and achieves < 60% confidence
 *              - The system automatically creates an OfficerCase with type 'verification_review'
 *              - The case stores both ocrData (what the machine extracted) and sellerData
 *                (what the seller entered) so the officer can compare them side by side
 *
 *              CASE TYPES: verification_review | transfer_review | dispute
 *              STATUS FLOW: queued → in_review → approved / rejected / escalated
 *
 * NOTE: This file is essential for the backend architecture.
 * It follows the Model-View-Controller (MVC) pattern.
 */

const mongoose = require('mongoose');
const { Schema } = mongoose;

const officerCaseSchema = new Schema({
  land: { type: Schema.Types.ObjectId, ref: 'Land', required: true },
  transferRequest: { type: Schema.Types.ObjectId, ref: 'TransferRequest' },
  assignedOfficer: { type: Schema.Types.ObjectId, ref: 'User' },

  type: {
    type: String,
    enum: ['verification_review', 'transfer_review', 'dispute'],
    required: true
  },

  status: {
    type: String,
    enum: ['queued', 'in_review', 'approved', 'rejected', 'escalated'],
    default: 'queued'
  },

  findings: { type: String, default: '' },

  // OCR escalation data — what the machine extracted before handing off to human
  ocrData: {
    district: String,
    taluka: String,
    village: String,
    surveyNumber: String,
    area: String,
    confidence: { type: Number, default: 0 },   // 0–100 score
    rawText: String                               // first 500 chars of OCR output
  },

  escalationReason: {
    type: String,
    enum: ['ocr_low_confidence', 'ocr_missing_fields', 'manual_request', 'dispute', 'flagged'],
    default: 'ocr_low_confidence'
  },

  // The seller-entered data for the officer to compare against OCR
  sellerData: {
    ownerName: String,
    district: String,
    taluka: String,
    village: String,
    surveyNumber: String,
    area: String
  },

  // Multi-sig officer signatures
  signatures: [{ type: Schema.Types.ObjectId, ref: 'OfficerSignature' }],

  resolvedAt: Date
}, {
  timestamps: true
});

officerCaseSchema.index({ status: 1, type: 1 });
officerCaseSchema.index({ assignedOfficer: 1 });
officerCaseSchema.index({ land: 1 });

module.exports = mongoose.model('OfficerCase', officerCaseSchema);
