const mongoose = require('mongoose');
const { Schema } = mongoose;

const officerCaseSchema = new Schema({
  land:            { type: Schema.Types.ObjectId, ref: 'Land',            required: true },
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

  findings:        { type: String, default: '' },
  rejectionReason: { type: String, default: '' },

  // Offline co-owner flag — passed from transfer controller
  hasOfflineCoOwner: { type: Boolean, default: false },

  // On-chain review ID from OfficerMultiSig.submitForReview()
  // Needed by officers to call approve(reviewId) / reject(reviewId)
  onChainReviewId: { type: String, default: null },

  // Multi-sig officer signatures
  signatures: [{ type: Schema.Types.ObjectId, ref: 'OfficerSignature' }],

  resolvedAt: Date
}, {
  timestamps: true
});

officerCaseSchema.index({ status: 1, type: 1 });
officerCaseSchema.index({ assignedOfficer: 1 });
officerCaseSchema.index({ land: 1 });
officerCaseSchema.index({ transferRequest: 1 });

module.exports = mongoose.model('OfficerCase', officerCaseSchema);