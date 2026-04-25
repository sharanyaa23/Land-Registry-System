/**
 * @file index.js
 * @description This file configures the primary API routing and versioning for the backend.
 * 
 * NOTE: This file is essential for the backend architecture. 
 * It follows the Model-View-Controller (MVC) pattern.
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');

console.log('API v1 index.js loaded');

// Root info route
router.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Land Registry API v1',
    version: '1.0.0',
    endpoints: [
      '/auth', '/profile', '/land', '/polygon', '/ipfs',
      '/verification', '/officer', '/transfer', '/escrow',
      '/notifications', '/webhook', '/spatial', '/contracts'
    ]
  });
});

// Contract ABIs
router.get('/contracts', (req, res) => {
  try {
    const contractsDir = path.join(__dirname, '../../contracts');
    const registry = fs.existsSync(path.join(contractsDir, 'LandRegistry.json'))
      ? require(path.join(contractsDir, 'LandRegistry.json')) : null;
    const multisig = fs.existsSync(path.join(contractsDir, 'MultiSigTransfer.json'))
      ? require(path.join(contractsDir, 'MultiSigTransfer.json')) : null;

    res.json({
      success: true,
      contracts: {
        LandRegistry: registry,
        MultiSigTransfer: multisig
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to load ABIs' });
  }
});


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
router.use('/document', require('./routes/document.routes'));

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