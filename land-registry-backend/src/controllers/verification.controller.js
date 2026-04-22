// src/controllers/verification.controller.js

const fs = require('fs');

const scraper = require('../services/mahabhulekh/scraper.service');
const parser = require('../services/mahabhulekh/parser.service');
const verifier = require('../services/mahabhulekh/verifier.service');
const mapper = require('../services/mahabhulekh/fieldMapper.service');
const ipfsService = require('../services/ipfs/pin.service');

const VerificationResult = require('../models/VerificationResult.model');
const Land = require('../models/Land.model');
const OfficerCase = require('../models/OfficerCase.model');

const asyncHandler = require('../utils/asyncHandler');
const logger = require('../utils/logger');

/**
 * Queue land for officer review
 */
async function queueForOfficerReview(landId, reason) {
  if (!landId) return;

  await Land.findByIdAndUpdate(landId, {
    $set: { status: 'officer_review', legacyFlag: true }
  });

  await OfficerCase.create({
    land: landId,
    type: 'verification_review',
    status: 'queued',
    notes: reason
  });
}

// ─────────────────────────────────────────────────────────────
// POST /verification/mahabhulekh
// ─────────────────────────────────────────────────────────────
exports.verifyLand = asyncHandler(async (req, res) => {
  logger.info('Mahabhulekh verification started', { body: req.body });

  const mapped = mapper.mapToMahabhulekh(req.body);
  const scrapeResult = await scraper.scrapeLandRecord(mapped);

  if (!scrapeResult.html || typeof scrapeResult.html !== 'string') {
    scrapeResult.html = '';
  }

  // ── Early exits ─────────────────────────────
  if (scrapeResult.retry) {
    return res.status(400).json({
      success: false,
      message: 'Invalid Captcha. Please try again.',
      retry: true
    });
  }

  if (!scrapeResult.verified) {
    if (req.body.landId) {
      await queueForOfficerReview(
        req.body.landId,
        scrapeResult.reason || 'Land record verification failed'
      );

      await Land.findByIdAndUpdate(req.body.landId, {
        $set: { status: 'verification_failed', legacyFlag: true }
      });
    }

    return res.json({
      success: false,
      legacyFlag: true,
      reason: scrapeResult.reason || 'Verification failed'
    });
  }

  const { surveyLabel } = scrapeResult;

  // ── Parse Logic ─────────────────────────────
  let parsed;
  let parseSource = 'html';

  if (scrapeResult.imageBased && scrapeResult.mainImagePath) {
    logger.info('Image-based 7/12 detected — using Google Vision API');

    try {
      const imageBuffer = fs.readFileSync(scrapeResult.mainImagePath);

      parsed = await parser.parseWithGoogleVision(imageBuffer);
      parseSource = 'google-vision';

      logger.info('Google Vision parsing completed', {
        ownersFound: parsed.owners?.length || 0,
        area: parsed.area,
        surveyNumber: parsed.surveyNumber
      });
    } catch (err) {
      logger.error('Google Vision failed', err.message);

      if (req.body.landId) {
        await queueForOfficerReview(
          req.body.landId,
          `Google Vision OCR failed: ${err.message}`
        );
      }

      return res.json({
        success: false,
        legacyFlag: true,
        imageBased: true,
        reason: 'OCR extraction failed. Sent for officer review.'
      });
    }
  } else {
    parsed = parser.parseHTML(scrapeResult.html);
    parseSource = 'html';
  }

  parsed = parsed || {};

  // ── Verification ─────────────────────────────
  const verification = verifier.verify({
    input: req.body,
    scraped: parsed
  });

  // 🔥 NORMALIZATION FIX (CRITICAL)
  const normalizedVerification = {
    ...verification,

    nameMatch: Boolean(verification.nameMatch),
    areaMatch: Boolean(verification.areaMatch),

    nameScore: Number(verification.nameScore || 0),
    areaScore: Number(verification.areaScore || 0),

    flags: Array.isArray(verification.flags) ? verification.flags : []
  };

  // ── IPFS Pinning ─────────────────────────────
  let htmlCID, pdfCID, imageCID = null;

  try {
    htmlCID = await ipfsService.pinBuffer(Buffer.from(scrapeResult.html || ''));
    pdfCID = await ipfsService.pinBuffer(scrapeResult.pdfBuffer || Buffer.from(''));
  } catch (err) {
    logger.error('IPFS pin failed', err.message);
  }

  if (scrapeResult.imageBased && scrapeResult.mainImagePath) {
    try {
      const imageBuffer = fs.readFileSync(scrapeResult.mainImagePath);
      imageCID = await ipfsService.pinBuffer(imageBuffer);
    } catch (e) {
      logger.warn('Image IPFS pin failed', e.message);
    }
  }

  const cids = { htmlCID, pdfCID, ...(imageCID && { imageCID }) };

  // ── Save to DB ─────────────────────────────
  let verResult = null;

  if (req.body.landId) {
    verResult = await VerificationResult.create({
      land: req.body.landId,
      source: 'mahabhulekh',
      parseSource,

      userInput: {
        ownerName: req.body.ownerName,
        surveyNumber: req.body.fullSurveyInput,
        area: parseFloat(req.body.area) || null
      },

      scrapedData: parsed,

      comparison: normalizedVerification,

      cids
    });

    // 🔥 FIXED VERDICT LOGIC
    const landStatus =
      verification.verdict === 'verified'
        ? 'verification_passed'
        : 'officer_review';

    await Land.findByIdAndUpdate(req.body.landId, {
      $set: {
        verificationResult: verResult._id,
        status: landStatus,
        'documents.mahabhulekhSnapshotCID': imageCID || htmlCID,
        legacyFlag: landStatus !== 'verification_passed'
      }
    });

    // 🔥 SINGLE OFFICER CASE PATH (NO DUPLICATE)
    if (landStatus === 'officer_review') {
      await queueForOfficerReview(req.body.landId, 'Auto verification mismatch');
    }
  }

  // ── Response ─────────────────────────────
  return res.json({
    success: true,
    surveyLabel,
    parseSource,
    parsed,
    verification: normalizedVerification,
    cids,
    verificationId: verResult?._id
  });
});

// ─────────────────────────────────────────────
exports.documentCompare = asyncHandler(async (req, res) => {
  const ipfsController = require('./ipfs.controller');
  return ipfsController.extractAndCompare(req, res);
});

// ─────────────────────────────────────────────
exports.getResult = asyncHandler(async (req, res) => {
  const { landId } = req.params;

  if (!landId || landId.length < 10) {
    return res.status(400).json({
      success: false,
      error: 'Invalid landId provided'
    });
  }

  // First check if Land exists
  const land = await Land.findById(landId).select('status owner verificationResult');
  if (!land) {
    return res.status(404).json({
      success: false,
      error: 'Land record not found',
      landId
    });
  }

  // Get latest verification result
  const result = await VerificationResult
    .findOne({ land: landId })
    .sort({ createdAt: -1 })
    .lean();   // Use lean for better performance

  if (!result) {
    return res.status(404).json({
      success: false,
      error: 'No verification result found for this land',
      landId,
      landStatus: land.status,
      suggestion: 'Run verification first using POST /verification/verify or /polygon/from-mahabhunaksha'
    });
  }

  // Enrich response with land context
  const response = {
    success: true,
    landId: land._id,
    landStatus: land.status,
    verification: {
      _id: result._id,
      source: result.source,
      parseSource: result.parseSource,
      createdAt: result.createdAt,
      userInput: result.userInput,
      scrapedData: result.scrapedData,
      comparison: result.comparison,
      cids: result.cids
    },
    verdict: result.comparison?.verdict || 'unknown',
    isVerified: result.comparison?.verdict === 'verified',
    nameMatch: Boolean(result.comparison?.nameMatch),
    areaMatch: Boolean(result.comparison?.areaMatch),
    flags: result.comparison?.flags || []
  };

  logger.info('Verification result returned', { 
    landId, 
    verificationId: result._id,
    verdict: response.verdict 
  });

  res.json(response);
});

// ─────────────────────────────────────────────
exports.retry = asyncHandler(async (req, res) => {
  const land = await Land.findById(req.params.landId);

  if (!land) {
    return res.status(404).json({
      success: false,
      error: 'Land not found'
    });
  }

  land.status = 'verification_pending';
  land.legacyFlag = false;

  await land.save();

  res.json({
    success: true,
    message: 'Ready for re-verification'
  });
});