const asyncHandler = require('../utils/asyncHandler');
const OfficerCase = require('../models/OfficerCase.model');
const OfficerSignature = require('../models/OfficerSignature.model');
const Land = require('../models/Land.model');
const TransferRequest = require('../models/TransferRequest.model');
const Notification = require('../models/Notification.model');
const AuditLog = require('../models/AuditLog.model');
const paginate = require('../utils/paginateQuery');
const logger = require('../utils/logger');

/**
 * Flatten a case document into the shape the frontend expects.
 */
const flattenCase = (c) => {
  const land     = (c.land && typeof c.land === 'object' && c.land.location) ? c.land : {};
  const transfer = (c.transferRequest && typeof c.transferRequest === 'object') ? c.transferRequest : {};
  const buyer    = (transfer.buyer  && typeof transfer.buyer  === 'object') ? transfer.buyer  : {};
  const seller   = (transfer.seller && typeof transfer.seller === 'object') ? transfer.seller : {};
  const owner    = (land.owner && typeof land.owner === 'object') ? land.owner : {};

  return {
    _id:               c._id,
    status:            c.status,
    type:              c.type,
    findings:          c.findings,
    rejectionReason:   c.rejectionReason,
    signatures:        c.signatures || [],
    createdAt:         c.createdAt,
    updatedAt:         c.updatedAt,
    hasOfflineCoOwner: c.hasOfflineCoOwner,
    onChainReviewId:   c.onChainReviewId,

    // Land fields
    landId:        land._id,
    surveyNumber:  land.location?.surveyNumber,
    village:       land.location?.village,
    district:      land.location?.district,
    taluka:        land.location?.taluka,
    area:          land.area?.value,
    areaUnit:      land.area?.unit,
    landStatus:    land.status,
    blockchain:    land.blockchain,
    documents:     land.documents,

    // Seller — from transfer or land owner
    sellerWallet:  seller.walletAddress  || owner.walletAddress  || null,
    sellerName:    seller.profile?.fullName || owner.profile?.fullName || null,

    // Buyer — only for transfer cases
    buyerWallet:   buyer.walletAddress   || null,
    buyerName:     buyer.profile?.fullName || null,

    // Transfer fields
    transferId:     transfer._id    || null,
    transferStatus: transfer.status || null,
    price:          transfer.price  || null,
    escrow:         transfer.escrow || null,

    // Keep raw refs for frontend deep access
    land:            c.land,
    transferRequest: c.transferRequest
  };
};

/**
 * GET /officer/cases
 */
exports.listCases = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  if (req.query.type)   filter.type   = req.query.type;

  const query = OfficerCase.find(filter)
    .populate({
      path: 'land',
      populate: { path: 'owner', select: 'walletAddress profile.fullName' }
    })
    .populate({
      path: 'transferRequest',
      populate: [
        { path: 'buyer',  select: 'walletAddress profile.fullName' },
        { path: 'seller', select: 'walletAddress profile.fullName' }
      ]
    })
    .populate({
      path: 'signatures',
      populate: { path: 'officer', select: 'walletAddress profile.fullName' }
    })
    .sort({ createdAt: -1 });

  const result = await paginate(query, req.query);

  const raw  = result.docs || result.data || result || [];
  const docs = Array.isArray(raw) ? raw : [];

  docs.forEach(c => {
    console.log('case:', c._id, '| survey:', c.land?.location?.surveyNumber, '| village:', c.land?.location?.village);
  });

  const flatDocs = docs.map(flattenCase);

  res.json({ success: true, data: flatDocs, total: result.total || docs.length });
});

/**
 * GET /officer/cases/:id
 */
exports.getCaseById = asyncHandler(async (req, res) => {
  const caseDoc = await OfficerCase.findById(req.params.id)
    .populate({
      path: 'land',
      populate: [
        { path: 'owner',             select: 'walletAddress profile.fullName' },
        { path: 'coOwners' },
        { path: 'verificationResult' }
      ]
    })
    .populate({
      path: 'transferRequest',
      populate: [
        { path: 'buyer',  select: 'walletAddress profile.fullName' },
        { path: 'seller', select: 'walletAddress profile.fullName' }
      ]
    })
    .populate({
      path: 'signatures',
      populate: { path: 'officer', select: 'walletAddress profile.fullName' }
    });

  if (!caseDoc) {
    return res.status(404).json({ success: false, error: 'Case not found' });
  }

  res.json({ success: true, case: flattenCase(caseDoc) });
});

/**
 * POST /officer/cases/:id/approve
 */
exports.approveCase = asyncHandler(async (req, res) => {
  const { justification, txHash, reviewId } = req.body;

  const caseDoc = await OfficerCase.findById(req.params.id)
    .populate('transferRequest');

  if (!caseDoc) {
    return res.status(404).json({ success: false, error: 'Case not found' });
  }

  if (['approved', 'rejected'].includes(caseDoc.status)) {
    return res.status(400).json({ success: false, error: `Case already ${caseDoc.status}` });
  }

 const sig = await OfficerSignature.findOneAndUpdate(
  { officerCase: caseDoc._id, officer: req.userId },
  {
    $set: {
      decision:      'approve',
      justification: justification || '',
      signatureHash: txHash || '',
      txHash:        txHash || '',
      reviewId:      reviewId?.toString() || null
    }
  },
  { upsert: true, new: true, setDefaultsOnInsert: true }
);

// Only push to signatures array if not already present
if (!caseDoc.signatures.map(s => s.toString()).includes(sig._id.toString())) {
  caseDoc.signatures.push(sig._id);
}

  caseDoc.findings        = justification || '';
  caseDoc.assignedOfficer = req.userId;

  if (caseDoc.type === 'verification_review') {
    caseDoc.status     = 'approved';
    caseDoc.resolvedAt = new Date();

    await Land.findByIdAndUpdate(caseDoc.land, {
      $set: { status: 'verification_passed', legacyFlag: false }
    });

    const land = await Land.findById(caseDoc.land);
    if (land) {
      await Notification.create({
        user:    land.owner,
        type:    'verification_complete',
        title:   'Land Verified',
        message: 'Your land has been verified and approved by an officer.',
        metadata: { caseId: caseDoc._id, landId: land._id }
      });
    }

  } else if (caseDoc.type === 'transfer_review') {
    const reviewId = req.body.reviewId || caseDoc.onChainReviewId;

    const transfer = caseDoc.transferRequest;

    // Re-fetch signatures to get accurate count
    const allSigs = await OfficerSignature.find({
      officerCase: caseDoc._id,
      decision:    'approve'
    });
    const approvalCount = allSigs.length;

    if (approvalCount >= 2) {
      caseDoc.status     = 'approved';
      caseDoc.resolvedAt = new Date();

      if (transfer) {
        await TransferRequest.findByIdAndUpdate(transfer._id, {
          $set: {
            status:          'completed',
            'escrow.status': 'released',
            resolvedAt:      new Date(),
            transferTxHash:  txHash || ''
          }
        });

        await Land.findByIdAndUpdate(transfer.land, {
          $set: { owner: transfer.buyer, status: 'transferred', coOwners: [] }
        });

        for (const userId of [transfer.buyer, transfer.seller]) {
          await Notification.create({
            user:    userId,
            type:    'transfer_complete',
            title:   'Transfer Approved',
            message: userId.toString() === transfer.seller?.toString()
              ? 'Officers approved the transfer. Funds released to you.'
              : 'Officers approved the transfer. Land ownership transferred to you.',
            metadata: { caseId: caseDoc._id, transferId: transfer._id }
          });
        }
      }
    } else {
      caseDoc.status = 'in_review';
    }
  }

  await caseDoc.save();

  await AuditLog.create({
    actor:     req.userId,
    action:    'officer.approve',
    target:    `OfficerCase:${caseDoc._id}`,
    details:   { justification, txHash, reviewId },
    ipAddress: req.ip
  });

  logger.info('Case approved', { caseId: caseDoc._id, officer: req.userId });

  // Re-fetch with populated fields for response
  const populated = await OfficerCase.findById(caseDoc._id)
    .populate({ path: 'land', populate: { path: 'owner', select: 'walletAddress profile.fullName' } })
    .populate({ path: 'transferRequest', populate: [{ path: 'buyer', select: 'walletAddress profile.fullName' }, { path: 'seller', select: 'walletAddress profile.fullName' }] })
    .populate('signatures');

  res.json({ success: true, case: flattenCase(populated) });
});

/**
 * POST /officer/cases/:id/reject
 */
exports.rejectCase = asyncHandler(async (req, res) => {
  const { justification, reason, txHash, reviewId } = req.body;

  const caseDoc = await OfficerCase.findById(req.params.id)
    .populate('transferRequest');

  if (!caseDoc) {
    return res.status(404).json({ success: false, error: 'Case not found' });
  }

  if (['approved', 'rejected'].includes(caseDoc.status)) {
    return res.status(400).json({ success: false, error: `Case already ${caseDoc.status}` });
  }

  const rejectionReason = reason || justification || 'Rejected by officer';

  const sig = await OfficerSignature.findOneAndUpdate(
  { officerCase: caseDoc._id, officer: req.userId },
  {
    $set: {
      decision:      'reject',
      justification: rejectionReason,
      reason:        rejectionReason,
      signatureHash: txHash || '',
      txHash:        txHash || '',
      reviewId:      reviewId?.toString() || null
    }
  },
  { upsert: true, new: true, setDefaultsOnInsert: true }
);

// Only push to signatures array if not already present
if (!caseDoc.signatures.map(s => s.toString()).includes(sig._id.toString())) {
  caseDoc.signatures.push(sig._id);
}
  caseDoc.status          = 'rejected';
  caseDoc.findings        = rejectionReason;
  caseDoc.rejectionReason = rejectionReason;
  caseDoc.assignedOfficer = req.userId;
  caseDoc.resolvedAt      = new Date();
  await caseDoc.save();

  if (caseDoc.type === 'verification_review') {
    await Land.findByIdAndUpdate(caseDoc.land, {
      $set: { status: 'verification_failed' }
    });

    const land = await Land.findById(caseDoc.land);
    if (land) {
      await Notification.create({
        user:    land.owner,
        type:    'verification_complete',
        title:   'Land Verification Rejected',
        message: `Your land verification was rejected. Reason: ${rejectionReason}`,
        metadata: { caseId: caseDoc._id, landId: land._id }
      });
    }

  } else if (caseDoc.type === 'transfer_review') {
    const transfer = caseDoc.transferRequest;

    if (transfer) {
      await TransferRequest.findByIdAndUpdate(transfer._id, {
        $set: {
          status:          'rejected',
          'escrow.status': 'refunded',
          resolvedAt:      new Date()
        }
      });

      await Land.findByIdAndUpdate(transfer.land, {
        $set: { status: 'frozen' }
      });

      for (const userId of [transfer.buyer, transfer.seller]) {
        await Notification.create({
          user:    userId,
          type:    'transfer_complete',
          title:   'Transfer Rejected',
          message: userId.toString() === transfer.buyer?.toString()
            ? `Transfer rejected. Funds refunded. Reason: ${rejectionReason}`
            : `Transfer rejected by officers. Reason: ${rejectionReason}`,
          metadata: { caseId: caseDoc._id, transferId: transfer._id }
        });
      }
    }
  }

  await AuditLog.create({
    actor:     req.userId,
    action:    'officer.reject',
    target:    `OfficerCase:${caseDoc._id}`,
    details:   { reason: rejectionReason, txHash, reviewId },
    ipAddress: req.ip
  });

  logger.info('Case rejected', { caseId: caseDoc._id, officer: req.userId });

  const populated = await OfficerCase.findById(caseDoc._id)
    .populate({ path: 'land', populate: { path: 'owner', select: 'walletAddress profile.fullName' } })
    .populate({ path: 'transferRequest', populate: [{ path: 'buyer', select: 'walletAddress profile.fullName' }, { path: 'seller', select: 'walletAddress profile.fullName' }] })
    .populate('signatures');

  res.json({ success: true, case: flattenCase(populated) });
});

/**
 * POST /officer/land/:landId/clear-freeze
 */
exports.clearFreeze = asyncHandler(async (req, res) => {
  const { txHash } = req.body;

  await Land.findByIdAndUpdate(req.params.landId, {
    $set: { status: 'listed' }
  });

  await AuditLog.create({
    actor:     req.userId,
    action:    'officer.clearFreeze',
    target:    `Land:${req.params.landId}`,
    details:   { txHash },
    ipAddress: req.ip
  });

  logger.info('Land freeze cleared', { landId: req.params.landId, officer: req.userId });
  res.json({ success: true, message: 'Land freeze cleared.' });
});

/**
 * POST /officer/registrar/add
 */
exports.addRegistrar = asyncHandler(async (req, res) => {
  const { walletAddress } = req.body;
  if (!walletAddress) {
    return res.status(400).json({ success: false, error: 'walletAddress is required' });
  }

  const landService = require('../services/blockchain/land.service');
  const result = await landService.addRegistrar(walletAddress);

  logger.info('Registrar added', { walletAddress, txHash: result.txHash });
  res.json({ success: true, txHash: result.txHash });
});

/**
 * POST /officer/registrar/remove
 */
exports.removeRegistrar = asyncHandler(async (req, res) => {
  const { walletAddress } = req.body;
  if (!walletAddress) {
    return res.status(400).json({ success: false, error: 'walletAddress is required' });
  }

  const landService = require('../services/blockchain/land.service');
  await landService.removeRegistrar(walletAddress);

  res.json({ success: true });
});