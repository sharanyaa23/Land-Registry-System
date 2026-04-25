/**
 * @file AuditLog.model.js
 * @description This model defines the MongoDB schema and database structure for the application.
 * 
 * NOTE: This file is essential for the backend architecture. 
 * It follows the Model-View-Controller (MVC) pattern.
 */

const mongoose = require('mongoose');
const { Schema } = mongoose;

const auditLogSchema = new Schema({
  actor: { type: Schema.Types.ObjectId, ref: 'User' },
  action: { type: String, required: true },     // e.g. 'land.register', 'transfer.offer'
  target: String,                                // collection:id format
  details: Schema.Types.Mixed,
  ipAddress: String
}, {
  timestamps: true
});

auditLogSchema.index({ actor: 1, createdAt: -1 });
auditLogSchema.index({ action: 1 });
auditLogSchema.index({ target: 1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
