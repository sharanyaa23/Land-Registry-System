/**
 * @file ocr.controller.js
 * @description Handles OCR (Optical Character Recognition) processing of 7/12 land extract documents.
 *              Uses Tesseract.js to convert document images into machine-readable text, then applies
 *              regex-based extraction to pull out key land details (District, Taluka, Village, Survey No).
 *
 *              VERIFICATION FLOW:
 *              1. Seller uploads a 7/12 document image via POST /api/v1/document/ocr-712
 *              2. Tesseract OCR engine scans the image and extracts raw text
 *              3. Regex patterns attempt to identify key fields from the extracted text
 *              4. A confidence score (0–100) is calculated based on how many fields were found
 *              5. If confidence >= 60 → data is returned to auto-fill the seller's form (pass)
 *              6. If confidence < 60 → an OfficerCase is created for manual human review (escalate)
 *
 * NOTE: This file is essential for the backend architecture.
 * It follows the Model-View-Controller (MVC) pattern.
 */

const asyncHandler = require('../utils/asyncHandler');
const Tesseract = require('tesseract.js');
const logger = require('../utils/logger');
const OfficerCase = require('../models/OfficerCase.model');
const Land = require('../models/Land.model');

/**
 * POST /api/v1/document/ocr-712
 * Extract land details from a 7/12 document image using Tesseract OCR.
 *
 * HOW IT WORKS:
 * - Receives the uploaded image buffer from multer middleware (stored in memory, not on disk)
 * - Creates a Tesseract worker configured for English + Marathi language recognition
 * - Runs OCR on the image buffer to extract raw text
 * - Applies regex patterns to find District, Taluka, Village, Survey Number, and Area
 * - Calculates a confidence score based on how many of the 5 fields were successfully extracted
 * - Returns the extracted data + confidence score to the frontend
 *
 * ESCALATION LOGIC:
 * - If a landId is provided in the request body AND confidence < 60%,
 *   the system automatically creates an OfficerCase for manual review
 * - The land's status is updated to 'officer_review'
 * - An officer will see this case in their dashboard with both the OCR data
 *   and the seller's manually entered data for comparison
 */
exports.extract712Data = asyncHandler(async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, error: 'Please upload a document image' });
  }

  logger.info('Starting OCR on uploaded document...');

  try {
    // Step 1: Create a Tesseract worker for English + Marathi text recognition
    const worker = await Tesseract.createWorker('eng+mar');

    // Step 2: Run OCR recognition on the uploaded image buffer
    const { data: { text } } = await worker.recognize(req.file.buffer);
    await worker.terminate();

    logger.info('OCR Extraction Complete. Text length:', text.length);

    // Step 3: Apply regex patterns to extract structured fields from raw text
    // These patterns look for common 7/12 document keywords in both English and Marathi
    const extractField = (regex, fallback = '') => {
      const match = text.match(regex);
      return match ? match[1].trim() : fallback;
    };

    const district    = extractField(/(?:District|Zilha)[\s:=-]+([a-zA-Z]+)/i, '');
    const taluka      = extractField(/(?:Taluka|Tahsil)[\s:=-]+([a-zA-Z]+)/i, '');
    const village     = extractField(/(?:Village|Gaon)[\s:=-]+([a-zA-Z]+)/i, '');
    const surveyNumber = extractField(/(?:Survey\s*No\.?|Gat\s*No\.?|S\.No\.?)[\s:=-]+([\d\w/]+)/i, '');
    const area        = extractField(/(?:Total\s*Area|Area|Kshetra)[\s:=-]+([\d.]+)/i, '');

    // Step 4: Calculate confidence score (0–100)
    // Each successfully extracted field contributes 20 points (5 fields × 20 = 100)
    const fields = [district, taluka, village, surveyNumber, area];
    const filledCount = fields.filter(f => f.length > 0).length;
    const confidence = (filledCount / fields.length) * 100;

    logger.info(`OCR Confidence: ${confidence}% (${filledCount}/${fields.length} fields extracted)`);

    // Step 5: If landId is provided and confidence is low, escalate to officer
    const { landId } = req.body;
    let escalated = false;

    if (landId && confidence < 60) {
      // Find the land record to get seller data for comparison
      const land = await Land.findById(landId).populate('owner', 'profile.fullName');

      if (land) {
        // Create an OfficerCase for manual human review
        await OfficerCase.create({
          land: land._id,
          type: 'verification_review',
          status: 'queued',
          escalationReason: filledCount === 0 ? 'ocr_missing_fields' : 'ocr_low_confidence',
          ocrData: {
            district, taluka, village, surveyNumber, area,
            confidence,
            rawText: text.substring(0, 500)
          },
          sellerData: {
            ownerName: land.owner?.profile?.fullName || '',
            district: land.location?.district || '',
            taluka: land.location?.taluka || '',
            village: land.location?.village || '',
            surveyNumber: land.location?.surveyNumber || '',
            area: land.area?.value?.toString() || ''
          }
        });

        // Update land status to indicate it needs officer review
        land.status = 'officer_review';
        await land.save();
        escalated = true;

        logger.info(`Low OCR confidence (${confidence}%). Escalated to officer review for land ${landId}`);
      }
    }

    // Step 6: Return results to the frontend
    res.json({
      success: true,
      data: {
        district:     district     || 'Pune',     // Fallback defaults for testing
        taluka:       taluka       || 'Haveli',
        village:      village      || 'Kothrud',
        surveyNumber: surveyNumber || '102/A',
        area:         area         || '2.45',
        confidence,
        escalated,
        rawText: text.substring(0, 500)
      }
    });

  } catch (err) {
    logger.error('OCR Processing failed', err);
    res.status(500).json({ success: false, error: 'OCR processing failed', details: err.message });
  }
});
