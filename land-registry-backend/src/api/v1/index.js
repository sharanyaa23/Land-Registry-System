const express = require('express');
const router = express.Router();

console.log('API v1 index.js loaded');

// Mount all sub-routers
router.use('/auth', require('./routes/auth.routes'));
router.use('/profile', require('./routes/profile.routes'));
router.use('/land', require('./routes/land.routes'));
router.use('/polygon', require('./routes/polygon.routes'));
router.use('/ipfs', require('./routes/ipfs.routes'));
router.use('/verification', require('./routes/verification.routes'));
router.use('/officer', require('./routes/officer.routes'));
router.use('/transfer', require('./routes/transfer.routes'));
router.use('/escrow', require('./routes/escrow.routes'));
router.use('/notifications', require('./routes/notification.routes'));
router.use('/webhook', require('./routes/webhook.routes'));
router.use('/spatial', require('./routes/spatial.routes'));

// Safe route logging (fixed)
console.log('\nRegistered v1 routes:');
router.stack.forEach((r) => {
  if (r.handle && r.handle.stack) {
    r.handle.stack.forEach((layer) => {
      if (layer.route) {
        const methods = Object.keys(layer.route.methods || {}).join(',').toUpperCase() || 'ALL';
        const path = layer.route.path || '';
        console.log(`  ${methods.padEnd(6)} /api/v1${r.regexp ? r.regexp.source.replace(/\\\//g, '/') : ''}${path}`);
      }
    });
  }
});

console.log('\nAll v1 routes registered successfully\n');

module.exports = router;