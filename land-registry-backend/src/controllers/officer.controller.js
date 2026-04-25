/**
 * @file officer.controller.js
 * @description Handles all Officer/Admin-related HTTP requests for the land verification workflow.
 *              Officers are government-appointed users who manually review land records when the
 *              automated OCR verification fails or produces low-confidence results.
 *
 *              OFFICER WORKFLOW:
 *              1. The OCR system scans a 7/12 document and calculates a confidence score
 *              2. If confidence < 60%, the system creates an OfficerCase (queued for manual review)
 *              3. The officer sees the case in their dashboard with:
 *                 - OCR extracted data (what the machine read)
 *                 - Seller entered data (what the seller claimed)
 *                 - A side-by-side comparison highlighting mismatches
 *              4. The officer reviews the evidence and either APPROVES or REJECTS the case
 *              5. On approval → land status changes to 'verification_passed' (can proceed to sale)
 *              6. On rejection → land status changes to 'verification_failed' (seller must re-submit)
 *
 * NOTE: This file is essential for the backend architecture.
 * It follows the Model-View-Controller (MVC) pattern.
 */

const asyncHandler = require('../utils/asyncHandler');
const OfficerCase = require('../models/OfficerCase.model');
const OfficerSignature = require('../models/OfficerSignature.model');
const Land = require('../models/Land.model');
const TransferRequest = require('../models/TransferRequest.model');
const Notification = require('../models/Notification.model');
const paginate = require('../utils/paginateQuery');
const logger = require('../utils/logger');

/**
 * GET /officer/cases
 * List all officer cases with optional status filter.
 *
 * HOW IT WORKS:
 * - Accepts optional query params: ?status=queued&type=verification_review
 * - Queries the OfficerCase collection with MongoDB's .find()
 * - Populates the related 'land' document with its owner info for display
 * - Uses the paginate utility for cursor-based pagination
 * - Returns the full case objects including ocrData and sellerData for comparison
 */
exports.listCases = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  if (req.query.type) filter.type = req.query.type;

  // If officer has a tehsil, only show cases in their jurisdiction
  if (req.user.role === 'officer' && req.user.officerMeta?.tehsil) {
    // Could filter by land's taluka matching officer's tehsil
  }

  const query = OfficerCase.find(filter)
    .populate({
      path: 'land',
      select: 'location area status owner documents',
      populate: { path: 'owner', select: 'walletAddress profile.fullName' }
    })
    .populate('transferRequest', 'buyer seller price status')
    .populate('assignedOfficer', 'walletAddress profile.fullName')
    .populate('signatures')
    .sort({ createdAt: -1 });

  const result = await paginate(query, req.query);
  res.json({ success: true, ...result });
});

/**
 * GET /officer/cases/:id
 * Get full case details for a specific case.
 *
 * HOW IT WORKS:
 * - Finds the OfficerCase by its MongoDB _id
 * - Deep-populates the related land, owner, coOwners, verification results,
 *   transfer request, buyer, seller, and officer signatures
 * - Returns the fully populated case object for the frontend detail view
 */
exports.getCaseById = asyncHandler(async (req, res) => {
  const caseDoc = await OfficerCase.findById(req.params.id)
    .populate({
      path: 'land',
      populate: [
        { path: 'owner', select: 'walletAddress profile.fullName' },
        { path: 'coOwners' },
        { path: 'verificationResult' }
      ]
    })
    .populate({
      path: 'transferRequest',
      populate: [
        { path: 'buyer', select: 'walletAddress profile.fullName' },
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

  res.json({ success: true, case: caseDoc });
});

/**
 * POST /officer/cases/:id/approve
 * Officer approves a case with justification.
 *
 * HOW IT WORKS:
 * - Finds the OfficerCase by ID
 * - Creates an OfficerSignature record (for audit trail and multi-sig support)
 * - Updates the case status to 'approved'
 * - If it's a verification_review → updates the land status to 'verification_passed'
 *   (this means the land is now cleared for listing and sale)
 * - If it's a transfer_review → updates the transfer status to 'approved'
 * - Sends a notification to the land owner informing them of the approval
 */
exports.approveCase = asyncHandler(async (req, res) => {
  const { justification, signatureHash } = req.body;

  const caseDoc = await OfficerCase.findById(req.params.id);
  if (!caseDoc) {
    return res.status(404).json({ success: false, error: 'Case not found' });
  }

  // Create officer signature for audit trail
  const sig = await OfficerSignature.create({
    officerCase: caseDoc._id,
    officer: req.userId,
    decision: 'approve',
    justification: justification || '',
    signatureHash: signatureHash || '',
  });

  caseDoc.signatures.push(sig._id);
  caseDoc.status = 'approved';
  caseDoc.findings = justification || '';
  caseDoc.assignedOfficer = req.userId;
  caseDoc.resolvedAt = new Date();
  await caseDoc.save();

  // Update related land status based on case type
  if (caseDoc.type === 'verification_review') {
    // Land was stuck in 'officer_review' → move it to 'verification_passed'
    await Land.findByIdAndUpdate(caseDoc.land, {
      $set: { status: 'registered', legacyFlag: false }
    });
  }

  // If transfer review, update transfer status
  if (caseDoc.type === 'transfer_review' && caseDoc.transferRequest) {
    await TransferRequest.findByIdAndUpdate(caseDoc.transferRequest, {
      $set: { status: 'approved' }
    });
  }

  // Notify the land owner about the approval
  const land = await Land.findById(caseDoc.land);
  if (land) {
    await Notification.create({
      user: land.owner,
      type: 'verification_complete',
      title: 'Verification Approved',
      message: `Your land record has been verified and approved by a government officer. Your land is now registered on the blockchain.`,
      metadata: { caseId: caseDoc._id, landId: land._id }
    });
  }

  logger.info('Case approved', { caseId: caseDoc._id, officer: req.userId });

  res.json({ success: true, case: caseDoc });
});

/**
 * POST /officer/cases/:id/reject
 * Officer rejects a case with justification.
 *
 * HOW IT WORKS:
 * - Same flow as approve, but sets status to 'rejected'
 * - Updates land status to 'verification_failed' → seller must re-submit documents
 * - Creates an OfficerSignature for audit trail
 */
exports.rejectCase = asyncHandler(async (req, res) => {
  const { justification, signatureHash } = req.body;

  const caseDoc = await OfficerCase.findById(req.params.id);
  if (!caseDoc) {
    return res.status(404).json({ success: false, error: 'Case not found' });
  }

  const sig = await OfficerSignature.create({
    officerCase: caseDoc._id,
    officer: req.userId,
    decision: 'reject',
    justification: justification || '',
    signatureHash: signatureHash || '',
  });

  caseDoc.signatures.push(sig._id);
  caseDoc.status = 'rejected';
  caseDoc.findings = justification || '';
  caseDoc.assignedOfficer = req.userId;
  caseDoc.resolvedAt = new Date();
  await caseDoc.save();

  // Update related records
  if (caseDoc.type === 'verification_review') {
    await Land.findByIdAndUpdate(caseDoc.land, { $set: { status: 'verification_failed' } });
  }
  if (caseDoc.type === 'transfer_review' && caseDoc.transferRequest) {
    await TransferRequest.findByIdAndUpdate(caseDoc.transferRequest, { $set: { status: 'rejected' } });
  }

  // Notify the land owner
  const land = await Land.findById(caseDoc.land);
  if (land) {
    await Notification.create({
      user: land.owner,
      type: 'verification_failed',
      title: 'Verification Rejected',
      message: `Your land verification has been rejected. Reason: ${justification || 'No reason provided'}. Please re-submit corrected documents.`,
      metadata: { caseId: caseDoc._id, landId: land._id }
    });
  }

  logger.info('Case rejected', { caseId: caseDoc._id, officer: req.userId });

  res.json({ success: true, case: caseDoc });
});
