const mongoose = require('mongoose');
const { Schema } = mongoose;

const transferRequestSchema = new Schema({
  land:   { type: Schema.Types.ObjectId, ref: 'Land', required: true },
  seller: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  buyer:  { type: Schema.Types.ObjectId, ref: 'User', required: true },

  price: {
    amount:   { type: Number, required: true },
    currency: { type: String, default: 'POL' }
  },

  status: {
    type: String,
    enum: [
      'offer_sent',
      'offer_accepted',
      'coowner_consent_pending',
      'escrow_locked',
      'officer_review',
      'approved',
      'completed',
      'rejected',
      'cancelled'
    ],
    default: 'offer_sent'
  },

  coOwnerConsents: [{
    coOwner: { type: Schema.Types.ObjectId, ref: 'CoOwner' },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending'
    },
    signedAt: Date
  }],

  officerCase: { type: Schema.Types.ObjectId, ref: 'OfficerCase' },

  escrow: {
    contractAddress: String,
    txHash:          String,   // lock-funds tx hash
    submitTxHash:    String,   // submit-to-officers tx hash
    lockedAmount:    Number,
    proposalId:      String,   // on-chain MultiSigTransfer proposalId
    status: {
      type: String,
      enum: ['none', 'intent_deposit', 'locked', 'released', 'refunded'],
      default: 'none'
    }
  },

  hasOfflineCoOwner: { type: Boolean, default: false },
  fundsLockedAt:     { type: Date },
  resolvedAt:        { type: Date },
  transferTxHash:    String
}, {
  timestamps: true
});

transferRequestSchema.index({ land: 1, status: 1 });
transferRequestSchema.index({ seller: 1 });
transferRequestSchema.index({ buyer: 1 });
transferRequestSchema.index({ status: 1 });

module.exports = mongoose.model('TransferRequest', transferRequestSchema);