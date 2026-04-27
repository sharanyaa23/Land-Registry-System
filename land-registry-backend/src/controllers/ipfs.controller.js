const asyncHandler = require('../utils/asyncHandler');
const ipfsPinService = require('../services/ipfs/pin.service');
const parserService = require('../services/mahabhulekh/parser.service'); // ✅ NEW
const compareService = require('../services/ipfs/compare.service');
const VerificationResult = require('../models/VerificationResult.model');
const Land = require('../models/Land.model');
const OfficerCase = require('../models/OfficerCase.model');
const logger = require('../utils/logger');
const axios = require('axios');

/**
 * POST /ipfs/upload
 */
exports.upload = asyncHandler(async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, error: 'No file uploaded' });
  }

  const cid = await ipfsPinService.pinBuffer(req.file.buffer);

  logger.info('File uploaded to IPFS', {
    cid,
    size: req.file.size,
    mime: req.file.mimetype
  });

  res.json({
    success: true,
    cid,
    gateway: `https://gateway.pinata.cloud/ipfs/${cid}`,
    size: req.file.size,
    mimetype: req.file.mimetype
  });
});

/**
 * GET /ipfs/:cid
 */
exports.fetch = asyncHandler(async (req, res) => {
  const { cid } = req.params;
  const gatewayUrl = `https://gateway.pinata.cloud/ipfs/${cid}`;

  try {
    const response = await axios.get(gatewayUrl, {
      responseType: 'arraybuffer',
      timeout: 30000
    });

    const contentType = response.headers['content-type'] || 'application/octet-stream';

    res.set('Content-Type', contentType);
    res.send(response.data);
  } catch (err) {
    logger.error('IPFS fetch failed', { cid, error: err.message });
    res.status(404).json({ success: false, error: 'File not found on IPFS' });
  }
});

/**
 * POST /ipfs/extract-and-compare
 * Upload → IPFS → OCR (Google Vision via parser) → Compare
 */
exports.extractAndCompare = asyncHandler(async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, error: 'Image file required' });
  }

  let userInput;
  try {
    userInput =
      typeof req.body.userInput === 'string'
        ? JSON.parse(req.body.userInput)
        : req.body.userInput;
  } catch (e) {
    return res.status(400).json({ success: false, error: 'Invalid userInput JSON' });
  }

  if (!userInput || !userInput.ownerName) {
    return res.status(400).json({
      success: false,
      error: 'userInput with ownerName required'
    });
  }

  logger.info('Extract-and-compare started', { landId: userInput.landId });

  // ====================== STEP 1: IPFS PIN ======================
  const imageCID = await ipfsPinService.pinBuffer(req.file.buffer);
  logger.info('Image pinned to IPFS', { imageCID });

  // ====================== STEP 2 + 3: OCR + PARSE ======================
  const parsedResult = await parserService.parseWithGoogleVision(req.file.buffer);

  // ====================== STRUCTURE OUTPUT ======================
  const ocrExtracted = {
    ownerName: parsedResult.owners?.[0] || null,
    surveyNumber: parsedResult.surveyNumber,
    area: parsedResult.area,
    areaUnit: 'sqm',
    village: parsedResult.villageName,
    taluka: parsedResult.talukaName,
    district: parsedResult.districtName,
    rawText: parsedResult.rawText || ''
  };

  // ====================== STEP 4: STORE OCR JSON TO IPFS ======================
  const ocrResultCID = await ipfsPinService.pinBuffer(
    Buffer.from(
      JSON.stringify({
        ocrExtracted,
        timestamp: new Date()
      })
    )
  );

  // ====================== STEP 5: COMPARE ======================
  const comparison = compareService.compare(userInput, ocrExtracted);

  // ====================== STEP 6: SAVE RESULT ======================
  const verificationData = {
    source: 'manual_upload',
    userInput: {
      ownerName: userInput.ownerName,
      surveyNumber: userInput.surveyNumber,
      area: parseFloat(userInput.area) || null,
      areaUnit: userInput.areaUnit || 'sqm',
      district: userInput.district,
      taluka: userInput.taluka,
      village: userInput.village
    },
    ocrExtracted: {
      ownerName: ocrExtracted.ownerName,
      surveyNumber: ocrExtracted.surveyNumber,
      area: ocrExtracted.area,
      areaUnit: ocrExtracted.areaUnit,
      rawText: ocrExtracted.rawText.substring(0, 5000)
    },
    comparison,
    cids: {
      imageCID,
      ocrResultCID
    }
  };

  // ====================== LINK TO LAND ======================
  if (userInput.landId) {
    verificationData.land = userInput.landId;

    const verResult = await VerificationResult.create(verificationData);

    const statusMap = {
      auto_pass: 'verification_passed',
      auto_fail: 'verification_failed',
      officer_review: 'officer_review'
    };

    const updateData = {
      verificationResult: verResult._id,
      status: statusMap[comparison.verdict] || 'officer_review',
      'documents.sevenTwelveCID': imageCID
    };

    if (
      comparison.verdict === 'auto_fail' ||
      comparison.verdict === 'officer_review'
    ) {
      updateData.legacyFlag = true;
    }

    await Land.findByIdAndUpdate(userInput.landId, {
      $set: updateData
    });

    if (
      comparison.verdict === 'officer_review' ||
      comparison.verdict === 'auto_fail'
    ) {
      await OfficerCase.create({
        land: userInput.landId,
        type: 'verification_review',
        status: 'queued'
      });

      logger.info('Officer case queued', { landId: userInput.landId });
    }

    return res.json({
      success: true,
      verificationId: verResult._id,
      imageCID,
      ocrResultCID,
      ocrExtracted: {
        ownerName: ocrExtracted.ownerName,
        surveyNumber: ocrExtracted.surveyNumber,
        area: ocrExtracted.area,
        areaUnit: ocrExtracted.areaUnit
      },
      comparison,
      landStatus: statusMap[comparison.verdict]
    });
  }

  // ====================== STANDALONE MODE ======================
  return res.json({
    success: true,
    imageCID,
    ocrResultCID,
    ocrExtracted: {
      ownerName: ocrExtracted.ownerName,
      surveyNumber: ocrExtracted.surveyNumber,
      area: ocrExtracted.area,
      areaUnit: ocrExtracted.areaUnit
    },
    comparison
  });
});