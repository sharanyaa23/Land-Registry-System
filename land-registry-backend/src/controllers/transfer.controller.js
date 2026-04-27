const asyncHandler = require('../utils/asyncHandler');
const TransferRequest = require('../models/TransferRequest.model');
const Land = require('../models/Land.model');
const CoOwner = require('../models/CoOwner.model');
const OfficerCase = require('../models/OfficerCase.model');
const Notification = require('../models/Notification.model');
const AuditLog = require('../models/AuditLog.model');
const paginate = require('../utils/paginateQuery');
const logger = require('../utils/logger');
const User = require('../models/User.model');
const escrowService = require('../services/blockchain/escrow.service');
const { toLandIdBytes32,getLand } = require('../services/blockchain/land.service');
const { ethers } = require('ethers');

// Helper: convert MongoDB _id to bytes32
const toBytes32 = (mongoId) => {
  return ethers.encodeBytes32String(mongoId.toString().slice(0, 31));
};

/**
 * POST /transfer/offer
 * Buyer submits offer (off-chain only — funds locked later at lock-funds step)
 */
exports.createOffer = asyncHandler(async (req, res) => {
  const { landId } = req.body;

  const land = await Land.findById(landId);
  if (!land) return res.status(404).json({ success: false, error: 'Land not found' });

  if (!['verification_passed', 'listed'].includes(land.status)) {
    return res.status(400).json({ success: false, error: 'Land is not available for transfer' });
  }

  if (land.owner.toString() === req.userId.toString()) {
    return res.status(400).json({ success: false, error: 'Cannot buy your own land' });
  }

  const price    = land.listingPrice?.amount;
  const currency = land.listingPrice?.currency || 'POL';

  if (!price) {
    return res.status(400).json({ success: false, error: 'Land does not have a listing price set' });
  }

  const transfer = await TransferRequest.create({
    land: land._id,
    seller: land.owner,
    buyer: req.userId,
    price: { amount: price, currency },
    status: 'offer_sent',
    coOwnerConsents: []
  });

  land.status = 'transfer_pending';
  await land.save();

  await Notification.create({
    user: land.owner,
    type: 'transfer_offer',
    title: 'New Transfer Offer',
    message: `A buyer has offered ${price} ${currency} for your land.`,
    metadata: { transferId: transfer._id, landId: land._id }
  });

  await AuditLog.create({
    actor: req.userId,
    action: 'transfer.offer',
    target: `TransferRequest:${transfer._id}`,
    details: { landId, price, currency },
    ipAddress: req.ip
  });

  logger.info('Transfer offer created', { transferId: transfer._id });
  res.status(201).json({ success: true, transfer });
});

/**
 * POST /transfer/:id/accept
 * Seller accepts offer. If co-owners exist → coowner_consent_pending, else → offer_accepted.
 */
exports.acceptOffer = asyncHandler(async (req, res) => {
  const transfer = await TransferRequest.findById(req.params.id).populate('land');
  if (!transfer) return res.status(404).json({ success: false, error: 'Transfer not found' });

  if (transfer.seller.toString() !== req.userId.toString()) {
    return res.status(403).json({ success: false, error: 'Only the seller can accept' });
  }

  if (transfer.status !== 'offer_sent') {
    return res.status(400).json({ success: false, error: `Cannot accept from status: ${transfer.status}` });
  }

  const land     = transfer.land;
  const coOwners = await CoOwner.find({ land: land._id });

  if (coOwners.length > 0) {
    transfer.coOwnerConsents = coOwners.map(co => ({
      coOwner: co._id,
      status: 'pending'
    }));
    transfer.status = 'coowner_consent_pending';
  } else {
    transfer.status = 'offer_accepted';
  }

  await transfer.save();

  await Notification.create({
    user: transfer.buyer,
    type: 'transfer_offer',
    title: 'Offer Accepted',
    message: coOwners.length > 0
      ? 'The seller accepted your offer. Waiting for co-owner consents.'
      : 'The seller accepted your offer. Please lock your funds to proceed.',
    metadata: { transferId: transfer._id }
  });

  for (const co of coOwners) {
    if (!co.walletAddress) continue;
    const coOwnerUser = await User.findOne({ walletAddress: co.walletAddress.toLowerCase() });
    if (!coOwnerUser) continue;

    await Notification.create({
      user: coOwnerUser._id,
      type: 'noc_request',
      title: 'NOC Required',
      message: 'The owner accepted a transfer offer. Your consent is required.',
      metadata: { transferId: transfer._id, landId: land._id, coOwnerId: co._id }
    });
  }

  res.json({ success: true, transfer });
});

/**
 * POST /transfer/:id/reject
 * Seller rejects the offer.
 */
exports.rejectOffer = asyncHandler(async (req, res) => {
  const transfer = await TransferRequest.findById(req.params.id);
  if (!transfer) return res.status(404).json({ success: false, error: 'Transfer not found' });

  if (transfer.seller.toString() !== req.userId.toString()) {
    return res.status(403).json({ success: false, error: 'Only the seller can reject' });
  }

  transfer.status = 'rejected';
  await transfer.save();

  await Land.findByIdAndUpdate(transfer.land, { $set: { status: 'listed' } });
  res.json({ success: true, transfer });
});

/**
 * POST /transfer/:id/coowner-consent
 * Co-owner approves or rejects off-chain. On all approved → offer_accepted.
 */
exports.coownerConsent = asyncHandler(async (req, res) => {
  const { approve, coOwnerId } = req.body;

  const transfer = await TransferRequest.findById(req.params.id);
  if (!transfer) return res.status(404).json({ success: false, error: 'Transfer not found' });

  if (transfer.status !== 'coowner_consent_pending') {
    return res.status(400).json({ success: false, error: `Cannot consent from status: ${transfer.status}` });
  }

  const currentUser = await User.findById(req.userId);
  if (!currentUser) return res.status(404).json({ success: false, error: 'User not found' });

  let consent = null;
  let matchedCoOwner = null;

  for (const c of transfer.coOwnerConsents) {
    const coOwner = await CoOwner.findById(c.coOwner);
    if (!coOwner) continue;

    const walletMatch =
      coOwner.walletAddress &&
      currentUser.walletAddress &&
      coOwner.walletAddress.toLowerCase() === currentUser.walletAddress.toLowerCase();

    const idMatch =
      coOwnerId &&
      c.coOwner.toString() === (typeof coOwnerId === 'object' ? coOwnerId?._id?.toString() : coOwnerId);

    if (walletMatch || idMatch) {
      consent = c;
      matchedCoOwner = coOwner;
      break;
    }
  }

  if (!consent || !matchedCoOwner) {
    return res.status(404).json({ success: false, error: 'Co-owner consent entry not found' });
  }

  if (consent.status !== 'pending') {
    return res.status(400).json({ success: false, error: `Consent already ${consent.status}` });
  }

  if (!approve) {
    consent.status  = 'rejected';
    transfer.status = 'cancelled';
    await transfer.save();
    await Land.findByIdAndUpdate(transfer.land, { $set: { status: 'listed' } });

    for (const userId of [transfer.seller, transfer.buyer]) {
      await Notification.create({
        user: userId,
        type: 'transfer_offer',
        title: 'Transfer Cancelled',
        message: 'A co-owner rejected the transfer.',
        metadata: { transferId: transfer._id }
      });
    }

    return res.json({ success: true, message: 'Co-owner rejected. Transfer cancelled.', transfer });
  }

  consent.status   = 'approved';
  consent.signedAt = new Date();

  if (!matchedCoOwner.isOnline || matchedCoOwner.nocStatus === 'offline_uploaded') {
    transfer.hasOfflineCoOwner = true;
  }

  const allApproved = transfer.coOwnerConsents.every(c => c.status === 'approved');

  if (allApproved) {
    transfer.status = 'offer_accepted';

    await Notification.create({
      user: transfer.buyer,
      type: 'transfer_offer',
      title: 'All Co-owners Approved',
      message: 'All co-owners approved. Please lock your funds to proceed.',
      metadata: { transferId: transfer._id }
    });
  }

  await transfer.save();

  res.json({
    success: true,
    message: allApproved
      ? 'All co-owners approved. Awaiting buyer fund deposit.'
      : 'Consent recorded. Awaiting remaining co-owners.',
    transfer
  });
});

/**
 * POST /transfer/:id/lock-funds
 * Buyer locks funds ON-CHAIN via MultiSigTransfer.proposeTransfer().
 */
exports.lockFunds = asyncHandler(async (req, res) => {
  const { amountWei } = req.body;

  const transfer = await TransferRequest.findById(req.params.id);
  if (!transfer) return res.status(404).json({ success: false, error: 'Transfer not found' });

  if (transfer.buyer.toString() !== req.userId.toString()) {
    return res.status(403).json({ success: false, error: 'Only the buyer can lock funds' });
  }

  if (transfer.status !== 'offer_accepted') {
    return res.status(400).json({ success: false, error: `Cannot lock funds from status: ${transfer.status}` });
  }

  const landIdBytes32 = toLandIdBytes32(transfer.land.toString());
  const offChainRef   = toLandIdBytes32(transfer._id.toString());

  // Verify land is actually registered on-chain before attempting escrow
  const onChainLand = await getLand(transfer.land.toString());
  if (!onChainLand || !onChainLand._exists) {
    return res.status(400).json({
      success: false,
      error: 'Land is not registered on-chain. Cannot lock funds.'
    });
  }


  const { ethers } = require('ethers');
  const priceWei = amountWei
    || ethers.parseEther(transfer.price.amount.toString()).toString();

  let escrowResult = { txHash: 'not-deployed', proposalId: null };
  try {
    escrowResult = await escrowService.lockFunds({
      landIdBytes32,
      offChainRef,
      amountWei: priceWei  
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'On-chain fund lock failed: ' + err.message });
  }

  transfer.escrow = {
    txHash:       escrowResult.txHash,
    lockedAmount: transfer.price.amount,
    status:       'locked',
    proposalId:   escrowResult.proposalId
  };
  transfer.status        = 'escrow_locked';
  transfer.fundsLockedAt = new Date();

  await transfer.save();

  await Notification.create({
    user:     transfer.seller,
    type:     'transfer_offer',
    title:    'Funds Locked',
    message:  'The buyer locked funds in escrow. Please submit for officer review.',
    metadata: { transferId: transfer._id }
  });

  await AuditLog.create({
    actor:     req.userId,
    action:    'transfer.lockFunds',
    target:    `TransferRequest:${transfer._id}`,
    details:   { txHash: escrowResult.txHash, proposalId: escrowResult.proposalId },
    ipAddress: req.ip
  });

  res.json({ success: true, message: 'Funds locked on-chain.', transfer });
});

/**
 * POST /transfer/:id/submit-officers
 * Seller submits to officer review ON-CHAIN via MultiSigTransfer.submitToOfficers().
 * Idempotent — reuses existing OfficerCase if already created (prevents duplicate key error).
 */
exports.submitToOfficers = asyncHandler(async (req, res) => {
  const transfer = await TransferRequest.findById(req.params.id);
  if (!transfer) return res.status(404).json({ success: false, error: 'Transfer not found' });

  if (transfer.seller.toString() !== req.userId.toString()) {
    return res.status(403).json({ success: false, error: 'Only the seller can submit to officers' });
  }

  if (transfer.status !== 'escrow_locked') {
    return res.status(400).json({ success: false, error: `Cannot submit from status: ${transfer.status}` });
  }

  if (!transfer.escrow?.proposalId) {
    return res.status(400).json({ success: false, error: 'No on-chain proposalId found. Was lock-funds called?' });
  }

  // Get seller wallet address for local signer lookup
  const seller = await User.findById(req.userId).select('walletAddress').lean();
  if (!seller?.walletAddress) {
    return res.status(400).json({ success: false, error: 'Seller wallet address not found' });
  }

  // ✅ Idempotent: reuse existing OfficerCase if present — prevents duplicate key error on retry
  let officerCase = await OfficerCase.findOne({ transferRequest: transfer._id });
  let isNewCase   = false;

  if (!officerCase) {
    officerCase = await OfficerCase.create({
      land: transfer.land,
      transferRequest: transfer._id,
      type: 'transfer_review',
      status: 'queued',
      hasOfflineCoOwner: transfer.hasOfflineCoOwner || false
    });
    isNewCase = true;
  }

  const offChainCaseRef = toBytes32(officerCase._id.toString());

  // Submit on-chain — returns reviewId from SubmittedToOfficers event
  let result = { txHash: 'not-deployed', reviewId: null };
  try {
    result = await escrowService.submitToOfficers({
      proposalId: transfer.escrow.proposalId,
      offChainCaseRef,
      sellerWallet: seller.walletAddress
    });
  } catch (err) {
    // Only delete case if we just created it and nothing was saved yet
    if (isNewCase && !officerCase.onChainReviewId) {
      await OfficerCase.findByIdAndDelete(officerCase._id);
    }
    return res.status(500).json({ success: false, error: 'On-chain submit failed: ' + err.message });
  }

  // Save reviewId — read later by officerDecision from OfficerCase.onChainReviewId
  officerCase.onChainReviewId = result.reviewId;
  await officerCase.save();

  transfer.officerCase         = officerCase._id;
  transfer.status              = 'officer_review';
  transfer.escrow.submitTxHash = result.txHash;
  await transfer.save();

  await Notification.create({
    user: transfer.buyer,
    type: 'transfer_offer',
    title: 'Under Officer Review',
    message: 'The transfer has been submitted for officer review.',
    metadata: { transferId: transfer._id }
  });

  await AuditLog.create({
    actor: req.userId,
    action: 'transfer.submitToOfficers',
    target: `TransferRequest:${transfer._id}`,
    details: { txHash: result.txHash, reviewId: result.reviewId, officerCaseId: officerCase._id },
    ipAddress: req.ip
  });

  res.json({ success: true, message: 'Submitted for officer review.', transfer, officerCase });
});

/**
 * POST /transfer/:id/officer-decision
 * Officer approves or rejects ON-CHAIN.
 * reviewId is read from OfficerCase.onChainReviewId — never from request body.
 */
exports.officerDecision = asyncHandler(async (req, res) => {
  const { approve, reason, officerPrivateKey } = req.body;

  const transfer = await TransferRequest.findById(req.params.id);
  if (!transfer) return res.status(404).json({ success: false, error: 'Transfer not found' });

  if (transfer.status !== 'officer_review') {
    return res.status(400).json({ success: false, error: `Transfer not in officer review. Status: ${transfer.status}` });
  }

  const officerCase = await OfficerCase.findById(transfer.officerCase);
  if (!officerCase) return res.status(404).json({ success: false, error: 'Officer case not found' });

  // reviewId comes from DB — saved at submitToOfficers time from SubmittedToOfficers event
  const reviewId = officerCase.onChainReviewId;
  if (!reviewId) {
    return res.status(400).json({ success: false, error: 'No on-chain review ID found. Was submitToOfficers called?' });
  }

  let result = { txHash: 'not-deployed' };

  if (approve) {
    try {
      result = await escrowService.officerApproveOnChain({ reviewId, officerPrivateKey });
    } catch (err) {
      return res.status(500).json({ success: false, error: 'On-chain approval failed: ' + err.message });
    }

    transfer.status         = 'completed';
    transfer.escrow.status  = 'released';
    transfer.resolvedAt     = new Date();
    transfer.transferTxHash = result.txHash;
    officerCase.status      = 'approved';
    officerCase.resolvedAt  = new Date();

    await Land.findByIdAndUpdate(transfer.land, {
      $set: { owner: transfer.buyer, status: 'transferred', coOwners: [] }
    });

    for (const userId of [transfer.seller, transfer.buyer]) {
      await Notification.create({
        user: userId,
        type: 'transfer_complete',
        title: 'Transfer Approved',
        message: userId.toString() === transfer.seller.toString()
          ? 'Officer approved. Funds have been released to you.'
          : 'Officer approved. Land ownership transferred to you.',
        metadata: { transferId: transfer._id }
      });
    }

    logger.info('Officer approved transfer on-chain', { transferId: transfer._id, txHash: result.txHash });

  } else {
    if (!reason) return res.status(400).json({ success: false, error: 'Reason is required for rejection' });

    try {
      result = await escrowService.officerRejectOnChain({ reviewId, reason, officerPrivateKey });
    } catch (err) {
      return res.status(500).json({ success: false, error: 'On-chain rejection failed: ' + err.message });
    }

    transfer.status             = 'rejected';
    transfer.escrow.status      = 'refunded';
    transfer.resolvedAt         = new Date();
    officerCase.status          = 'rejected';
    officerCase.rejectionReason = reason;
    officerCase.resolvedAt      = new Date();

    await Land.findByIdAndUpdate(transfer.land, { $set: { status: 'frozen' } });

    for (const userId of [transfer.seller, transfer.buyer]) {
      await Notification.create({
        user: userId,
        type: 'transfer_complete',
        title: 'Transfer Rejected',
        message: userId.toString() === transfer.buyer.toString()
          ? `Transfer rejected. Funds refunded. Reason: ${reason}`
          : `Transfer rejected by officer. Reason: ${reason}`,
        metadata: { transferId: transfer._id }
      });
    }

    logger.info('Officer rejected transfer on-chain', { transferId: transfer._id, reason });
  }

  await transfer.save();
  await officerCase.save();

  await AuditLog.create({
    actor: req.userId,
    action: approve ? 'transfer.officerApproved' : 'transfer.officerRejected',
    target: `TransferRequest:${transfer._id}`,
    details: { reason, txHash: result.txHash, reviewId },
    ipAddress: req.ip
  });

  res.json({
    success: true,
    message: approve
      ? 'Approved on-chain. Funds released to seller. Ownership transferred.'
      : 'Rejected on-chain. Funds refunded to buyer. Land frozen.',
    transfer
  });
});

/**
 * GET /transfer/my
 */
exports.getMyTransfers = asyncHandler(async (req, res) => {
  const filter = { $or: [{ buyer: req.userId }, { seller: req.userId }] };
  if (req.query.status) filter.status = req.query.status;

  const query = TransferRequest.find(filter)
    .populate('land', 'location area status documents')
    .populate('buyer', 'walletAddress profile.fullName')
    .populate('seller', 'walletAddress profile.fullName');

  const result = await paginate(query, req.query);
  res.json({ success: true, ...result });
});

/**
 * GET /transfer/incoming
 */
exports.getIncomingOffers = asyncHandler(async (req, res) => {
  const filter = {
    seller: req.userId,
    status: req.query.status || {
      $in: ['offer_sent', 'coowner_consent_pending', 'offer_accepted', 'escrow_locked', 'officer_review']
    }
  };

  const query = TransferRequest.find(filter)
    .populate('land', 'location area status documents listingPrice')
    .populate('buyer', 'walletAddress profile.fullName profile.email')
    .sort({ createdAt: -1 });

  const result = await paginate(query, req.query);
  res.json({ success: true, ...result });
});

/**
 * GET /transfer/coowner-pending
 */
exports.getCoownerPending = asyncHandler(async (req, res) => {
  const currentUser = await User.findById(req.userId);
  if (!currentUser) return res.status(404).json({ success: false, error: 'User not found' });

  const coOwners   = await CoOwner.find({ walletAddress: currentUser.walletAddress?.toLowerCase() });
  const coOwnerIds = coOwners.map(c => c._id);

  if (coOwnerIds.length === 0) {
    return res.json({ success: true, transfers: [], allCoownerTransfers: [] });
  }

  const pendingTransfers = await TransferRequest.find({
    'coOwnerConsents.coOwner': { $in: coOwnerIds },
    status: { $in: ['coowner_consent_pending', 'offer_accepted', 'escrow_locked'] }
  })
    .populate('land', 'location area status listingPrice')
    .populate('seller', 'walletAddress profile.fullName')
    .populate('buyer', 'walletAddress profile.fullName')
    .sort({ createdAt: -1 });

  const allCoownerTransfers = await TransferRequest.find({
    'coOwnerConsents.coOwner': { $in: coOwnerIds }
  })
    .populate('land', 'location area status listingPrice')
    .populate('seller', 'walletAddress profile.fullName')
    .populate('buyer', 'walletAddress profile.fullName')
    .sort({ createdAt: -1 });

  const attachConsent = (transfers) => transfers.map(t => {
    const myConsent = t.coOwnerConsents.find(c =>
      coOwnerIds.map(id => id.toString()).includes(c.coOwner.toString())
    );
    return { ...t.toObject(), myConsent };
  });

  res.json({
    success: true,
    transfers: attachConsent(pendingTransfers),
    allCoownerTransfers: attachConsent(allCoownerTransfers)
  });
});

/**
 * POST /transfer/:id/finalize
 */
exports.finalize = asyncHandler(async (req, res) => {
  const transfer = await TransferRequest.findById(req.params.id);
  if (!transfer) return res.status(404).json({ success: false, error: 'Transfer not found' });

  if (!['approved', 'escrow_locked'].includes(transfer.status)) {
    return res.status(400).json({ success: false, error: 'Transfer not ready for finalization' });
  }

  transfer.status         = 'completed';
  transfer.transferTxHash = req.body.txHash || 'pending-chain-confirmation';
  await transfer.save();

  await Land.findByIdAndUpdate(transfer.land, {
    $set: { owner: transfer.buyer, status: 'transferred', coOwners: [] }
  });

  for (const userId of [transfer.buyer, transfer.seller]) {
    await Notification.create({
      user: userId,
      type: 'transfer_complete',
      title: 'Transfer Complete',
      message: 'The land transfer has been successfully completed.',
      metadata: { transferId: transfer._id }
    });
  }

  logger.info('Transfer finalized', { transferId: transfer._id });
  res.json({ success: true, transfer });
});