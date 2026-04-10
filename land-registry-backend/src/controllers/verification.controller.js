// src/controllers/verification.controller.js

const fs = require('fs');
const cheerio = require('cheerio');

const scraper = require('../services/mahabhulekh/scraper.service');
const parser = require('../services/mahabhulekh/parser.service');
const verifier = require('../services/mahabhulekh/verifier.service');
const mapper = require('../services/mahabhulekh/fieldMapper.service');
const ipfsService = require('../services/ipfs/pin.service');
const compareService = require('../services/ipfs/compare.service');   // Updated import if needed

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

// ─────────────────────────────────────────────────────────────────────────────
// POST /verification/mahabhulekh
// ─────────────────────────────────────────────────────────────────────────────
exports.verifyLand = asyncHandler(async (req, res) => {
  logger.info('Mahabhulekh verification started', { body: req.body });

  const mapped = mapper.mapToMahabhulekh(req.body);
  const scrapeResult = await scraper.scrapeLandRecord(mapped);

  if (!scrapeResult.html || typeof scrapeResult.html !== 'string') {
    scrapeResult.html = '';
  }

  // Early exits
  if (scrapeResult.retry) {
    return res.status(400).json({
      success: false,
      message: 'Invalid Captcha. Please try again.',
      retry: true
    });
  }

  if (!scrapeResult.verified) {
    if (req.body.landId) {
      await Land.findByIdAndUpdate(req.body.landId, {
        $set: { status: 'verification_failed', legacyFlag: true }
      });
      await OfficerCase.create({
        land: req.body.landId,
        type: 'verification_review',
        status: 'queued'
      });
    }
    return res.json({
      success: false,
      legacyFlag: true,
      reason: scrapeResult.reason || 'Land record verification failed'
    });
  }

  const { surveyLabel } = scrapeResult;

  // ── 3. Parse Logic ───────────────────────────────────────────────────────
  let parsed;
  let parseSource = 'html';

  if (scrapeResult.imageBased && scrapeResult.mainImagePath) {
    // ==================== GOOGLE VISION PATH ====================
    logger.info('Image-based 7/12 detected — using Google Vision API');

    try {
      const imageBuffer = fs.readFileSync(scrapeResult.mainImagePath);

      // Use Google Vision instead of old OCR
      parsed = await parser.parseWithGoogleVision(imageBuffer);
      parseSource = 'google-vision';

      logger.info('Google Vision parsing completed', {
        ownersFound: parsed.owners.length,
        area: parsed.area,
        surveyNumber: parsed.surveyNumber
      });
    } catch (err) {
      logger.error('Google Vision failed', err.message);

      await queueForOfficerReview(
        req.body.landId,
        `Google Vision OCR failed: ${err.message}`
      );

      return res.json({
        success: false,
        legacyFlag: true,
        imageBased: true,
        reason: 'Failed to extract text from 7/12 image. Queued for officer review.'
      });
    }
  } else {
    // Standard HTML path
    parsed = parser.parseHTML(scrapeResult.html);
    parseSource = 'html';
  }

  // ── 4. Verify ─────────────────────────────────────────────────────────────
  const verification = verifier.verify({
    input: req.body,
    scraped: parsed
  });

  // ── 5. IPFS Pinning ───────────────────────────────────────────────────────
  const htmlCID = await ipfsService.pinBuffer(Buffer.from(scrapeResult.html || ''));
  const pdfCID = await ipfsService.pinBuffer(scrapeResult.pdfBuffer || Buffer.from(''));

  let imageCID = null;
  if (scrapeResult.imageBased && scrapeResult.mainImagePath) {
    try {
      const imageBuffer = fs.readFileSync(scrapeResult.mainImagePath);
      imageCID = await ipfsService.pinBuffer(imageBuffer);
    } catch (e) {
      logger.warn('Failed to pin image to IPFS', e.message);
    }
  }

  const cids = { htmlCID, pdfCID, ...(imageCID && { imageCID }) };

  // ── 6. Save to Database ───────────────────────────────────────────────────
  let verResult = null;
  if (req.body.landId) {
    verResult = await VerificationResult.create({
      land: req.body.landId,
      source: 'mahabhulekh',
      parseSource,
      userInput: {
        ownerName: req.body.ownerName,
        surveyNumber: req.body.fullSurveyInput,
        area: parseFloat(req.body.area) || null,
      },
      scrapedData: parsed,
      comparison: verification,
      cids
    });

    const landStatus = verification.verdict === 'auto_pass' 
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

    if (landStatus === 'officer_review') {
      await OfficerCase.create({
        land: req.body.landId,
        type: 'verification_review',
        status: 'queued'
      });
    }
  }

  // ── 7. Final Response ─────────────────────────────────────────────────────
  return res.json({
    success: true,
    surveyLabel,
    parseSource,
    parsed,
    verification,
    cids,
    verificationId: verResult?._id
  });

});

exports.documentCompare = asyncHandler(async (req, res) => {
  const ipfsController = require('./ipfs.controller');
  return ipfsController.extractAndCompare(req, res);
});

exports.getResult = asyncHandler(async (req, res) => {
  const result = await VerificationResult
    .findOne({ land: req.params.landId })
    .sort({ createdAt: -1 });

  if (!result) return res.status(404).json({ success: false, error: 'No result found' });

  res.json({ success: true, result });
});

exports.retry = asyncHandler(async (req, res) => {
  const land = await Land.findById(req.params.landId);
  if (!land) return res.status(404).json({ success: false, error: 'Land not found' });

  land.status = 'verification_pending';
  land.legacyFlag = false;
  await land.save();

  res.json({ success: true, message: 'Ready for re-verification' });
});