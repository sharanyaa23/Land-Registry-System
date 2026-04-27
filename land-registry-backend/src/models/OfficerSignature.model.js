const mongoose = require('mongoose');
const { Schema } = mongoose;

const officerSignatureSchema = new Schema({
  officerCase: { type: Schema.Types.ObjectId, ref: 'OfficerCase', required: true },
  officer:     { type: Schema.Types.ObjectId, ref: 'User',        required: true },

  decision: {
    type: String,
    enum: ['approve', 'reject'],
    required: true
  },

  justification: { type: String, default: '' },
  reason:        { type: String, default: '' },  // for rejections
  signatureHash: { type: String, default: '' },  // MetaMask wallet signature
  txHash:        { type: String, default: '' },  // on-chain tx hash
  reviewId:      { type: String, default: null }, // OfficerMultiSig reviewId

  signedAt: { type: Date, default: Date.now }
}, {
  timestamps: true
});

officerSignatureSchema.index({ officerCase: 1 });
officerSignatureSchema.index({ officer: 1 });
officerSignatureSchema.index({ officerCase: 1, officer: 1 }, { unique: true }); // one vote per officer per case

module.exports = mongoose.model('OfficerSignature', officerSignatureSchema);