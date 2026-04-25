/**
 * @file User.model.js
 * @description This model defines the MongoDB schema and database structure for the application.
 * 
 * NOTE: This file is essential for the backend architecture. 
 * It follows the Model-View-Controller (MVC) pattern.
 */

const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  walletAddress: {
    type: String,
    unique: true,           
    required: true,
    lowercase: true,
    trim: true,
    match: /^0x[a-fA-F0-9]{40}$/
  },
  role: {
    type: String,
    enum: ['seller', 'buyer', 'officer', 'admin'],
    required: true
  },
  fullName: {
      type: String,
      trim: true,
  },   
  profile: {
    fullName: { type: String, trim: true },
    aadhaarHash: String,
    phone: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    kycVerified: { type: Boolean, default: false }
  },
  nonce: String,

  // Officer-specific fields
  officerMeta: {
    tehsil: String,
    whitelistedBy: String,
    whitelistedAt: Date
  },

  isActive: { type: Boolean, default: true },
  lastLoginAt: Date
}, {
  timestamps: true
});

// Only add extra compound index (remove the duplicate walletAddress index)
userSchema.index({ role: 1, isActive: 1 });

module.exports = mongoose.model('User', userSchema);