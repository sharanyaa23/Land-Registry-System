/**
 * @file CoOwner.model.js
 * @description This model defines the MongoDB schema and database structure for the application.
 * 
 * NOTE: This file is essential for the backend architecture. 
 * It follows the Model-View-Controller (MVC) pattern.
 */

const mongoose = require('mongoose');
const { Schema } = mongoose;

const coOwnerSchema = new Schema({
  land: { type: Schema.Types.ObjectId, ref: 'Land', required: true },
  user: { type: Schema.Types.ObjectId, ref: 'User' },  // null if offline co-owner

  fullName: { type: String, required: true, trim: true },
  walletAddress: { type: String, lowercase: true, trim: true },  // null if offline
  sharePercent: { type: Number, required: true, min: 0, max: 100 },

  isOnline: { type: Boolean, default: true },

  // NOC consent tracking
  nocStatus: {
    type: String,
    enum: ['pending', 'signed', 'rejected', 'offline_uploaded'],
    default: 'pending'
  },
  nocSignature: String,       // on-chain wallet signature hash
  nocDocumentCID: String,     // IPFS CID for offline signed NOC PDF
  signedAt: Date
}, {
  timestamps: true
});

coOwnerSchema.index({ land: 1 });
coOwnerSchema.index({ user: 1 });
coOwnerSchema.index({ walletAddress: 1 });

module.exports = mongoose.model('CoOwner', coOwnerSchema);
