const asyncHandler = require('../utils/asyncHandler');
const Land = require('../models/Land.model');
const CoOwner = require('../models/CoOwner.model');
const AuditLog = require('../models/AuditLog.model');
const User = require('../models/User.model');
const paginate = require('../utils/paginateQuery');
const logger = require('../utils/logger');
const locationData = require('../data/maharashtra_full.json');
const { translateToMarathi } = require('../utils/translateToMarathi');
const axios = require('axios');

const cleanMarathi = (name) => (name || '').replace(/^[\d]+\s*/, '').trim();

const marathiName = {
  district: (id) => {
    const d = locationData.find((d) => String(d.id) === String(id));
    return d ? cleanMarathi(d.name) : '';
  },
  taluka: (districtId, talukaId) => {
    const d = locationData.find((d) => String(d.id) === String(districtId));
    if (!d) return '';
    const t = d.talukas.find((t) => String(t.id) === String(talukaId));
    return t ? cleanMarathi(t.name) : '';
  },
  village: (districtId, talukaId, villageId) => {
    const d = locationData.find((d) => String(d.id) === String(districtId));
    if (!d) return '';
    const t = d.talukas.find((t) => String(t.id) === String(talukaId));
    if (!t) return '';
    const v = t.villages.find((v) => String(v.id) === String(villageId));
    return v ? cleanMarathi(v.name) : '';
  }
};


const INTERNAL_API_BASE = process.env.INTERNAL_API_BASE || 'http://localhost:5000/api/v1';

const VERDICT_TO_STATUS = {
  auto_pass: 'registered',
  auto_fail: 'verification_failed',
  officer_review: 'officer_review'
};


/**
 * POST /land/register
 * Create a new land asset in draft status.
 * Seller-only.
 */
exports.register = asyncHandler(async (req, res) => {

  console.log('\n=== REGISTER CONTROLLER HIT ===');
  console.log('Time:', new Date().toISOString());
  console.log('Method:', req.method);
  console.log('Full URL:', req.originalUrl);
  console.log('Content-Type:', req.get('Content-Type'));
  console.log('Authorization header exists:', !!req.headers.authorization);
  
  console.log('\n=== FULL req.body ===');
  console.dir(req.body, { depth: null });

  console.log('\nExtracted fields:');
  console.log('ownerName     :', `"${req.body?.ownerName}"`);
  console.log('districtValue :', req.body?.districtValue);
  console.log('surveyNumber  :', req.body?.surveyNumber);
  console.log('coOwners      :', req.body?.coOwners?.length || 0);
  const {
    ownerName,
    district, districtValue,
    taluka, talukaValue,
    village, villageValue,
    surveyNumber, gatNumber,
    area, areaUnit,
    encumbrances, boundaryDescription,
    coOwners = [],
    mobile
  } = req.body;



  // ==================== VALIDATION ====================
  if (!ownerName?.trim()) {
    return res.status(400).json({ success: false, message: "Owner name is required" });
  }
  if (!districtValue || !talukaValue || !villageValue) {
    return res.status(400).json({ success: false, message: "Location details are required" });
  }
  if (!surveyNumber?.trim()) {
    return res.status(400).json({ success: false, message: "Survey number is required" });
  }

  // ==================== CLEAN VALUES (Remove leading zeros) ====================
  const cleanDistrictValue = String(districtValue).replace(/^0+/, '') || districtValue;
  const cleanTalukaValue = String(talukaValue).replace(/^0+/, '') || talukaValue;
  // villageValue usually remains unchanged (it's a full code)
  const cleanVillageValue = villageValue;

  // ==================== RESOLVE MARATHI NAMES ====================
  const marathiDistrict = marathiName.district(districtValue) || district || '';
  const marathiTaluka = marathiName.taluka(districtValue, talukaValue) || taluka || '';
  const marathiVillage = marathiName.village(districtValue, talukaValue, villageValue) || village || '';

  // ==================== TRANSLATE NAMES ====================
  const marathiOwnerName = await translateToMarathi(ownerName.trim());

  const coOwnerTranslations = await Promise.all(
    coOwners.map(co => translateToMarathi((co.fullName || co.name || '').trim()))
  );

  // ==================== CREATE LAND RECORD ====================
  const land = await Land.create({
    owner: req.userId,
    location: {
      district: marathiDistrict,
      districtValue: cleanDistrictValue,        // ← Cleaned
      taluka: marathiTaluka,
      talukaValue: cleanTalukaValue,            // ← Cleaned
      village: marathiVillage,
      villageValue: cleanVillageValue,
      surveyNumber: surveyNumber.trim(),
      gatNumber: gatNumber?.trim() || null
    },
    area: {
      value: parseFloat(area) || 0,
      unit: areaUnit || 'hectare'
    },
    encumbrances: encumbrances?.trim() || '',
    boundaryDescription: boundaryDescription?.trim() || '',
    coOwners: [],
    status: 'verification_pending'
  });

  // ==================== PROCESS CO-OWNERS ====================
  const coOwnerIds = [];

  for (let i = 0; i < coOwners.length; i++) {
    const co = coOwners[i];
    let userId = null;

    if (co.walletAddress?.trim()) {
      const foundUser = await User.findOne({
        walletAddress: co.walletAddress.trim().toLowerCase()
      }).select('_id').lean();

      if (foundUser) userId = foundUser._id;
      else {
        logger.warn('Co-owner wallet not found', {
          walletAddress: co.walletAddress,
          landId: land._id
        });
      }
    }

    const coOwnerDoc = await CoOwner.create({
      land: land._id,
      user: userId,
      fullName: coOwnerTranslations[i] || (co.fullName || co.name || ''),
      walletAddress: co.walletAddress ? co.walletAddress.trim().toLowerCase() : null,
      sharePercent: parseFloat(co.sharePercent) || 0,
      isOnline: !!userId,
      nocStatus: 'pending'
    });

    coOwnerIds.push(coOwnerDoc._id);
  }

  // Link co-owners to land
  if (coOwnerIds.length > 0) {
    await Land.findByIdAndUpdate(land._id, { coOwners: coOwnerIds });
  }

  // ==================== UPDATE MAIN OWNER NAME ====================
// ==================== UPDATE MAIN OWNER NAME ====================
if (marathiOwnerName?.trim()) {
  const updatedUser = await User.findByIdAndUpdate(
    req.userId,
    { $set: { 'profile.fullName': marathiOwnerName.trim() } },
    { new: true }
  );
  console.log('Updated user profile fullName:', updatedUser?.profile?.fullName);
}

  // ==================== AUDIT LOG ====================
  await AuditLog.create({
    actor: req.userId,
    action: 'land.register',
    target: `Land:${land._id}`,
    details: {
      surveyNumber: surveyNumber.trim(),
      district: marathiDistrict,
      village: marathiVillage
    },
    ipAddress: req.ip
  });

  // ==================== CALL MAHABHULEKH VERIFICATION ====================
  let landStatus = 'verification_failed';
  let verdict = null;
  let verificationId = null;

  try {
    const finalAllOwnerNames = [marathiOwnerName, ...coOwnerTranslations]
      .filter(Boolean)
      .join(', ');

    const verifyPayload = {
      landId: String(land._id),
      districtValue: cleanDistrictValue,     // ← Cleaned value (5 instead of 05)
      talukaValue: cleanTalukaValue,         // ← Cleaned value (4 instead of 02)
      villageValue: cleanVillageValue,
      fullSurveyInput: surveyNumber.trim(),
      mobile: mobile?.trim() || '',
      ownerName: finalAllOwnerNames || marathiOwnerName,   // Never empty
      area: String(parseFloat(area) || 0),
      district: marathiDistrict,
      taluka: marathiTaluka,
      village: marathiVillage
    };

    const timeoutMs = parseInt(process.env.VERIFY_API_TIMEOUT) || 240000;

    logger.info('Calling Mahabhulekh verification', {
      landId: land._id,
      districtValue: cleanDistrictValue,
      talukaValue: cleanTalukaValue,
      ownerName: finalAllOwnerNames ? finalAllOwnerNames.substring(0, 80) + '...' : marathiOwnerName
    });

    const verifyRes = await axios.post(
      `${INTERNAL_API_BASE}/verification/verify`,
      verifyPayload,
      {
        headers: { Authorization: req.headers.authorization || '' },
        timeout: timeoutMs
      }
    );

    verdict = verifyRes.data?.verdict || null;
    verificationId = verifyRes.data?.verificationId || null;
    landStatus = VERDICT_TO_STATUS[verdict] ?? 'verification_failed';

    await Land.findByIdAndUpdate(land._id, { status: landStatus });

    logger.info('Verification initiated', { landId: land._id, verdict, landStatus });

  } catch (err) {
    const isTimeout = err.code === 'ECONNABORTED' || err.message?.includes('timeout');
    logger.error('Verification API failed', {
      landId: land._id,
      error: isTimeout ? `Timeout (${timeoutMs}ms)` : err.message,
      isTimeout
    });

    await Land.findByIdAndUpdate(land._id, {
      status: 'verification_failed',
      legacyFlag: true
    }).catch(() => { });
  }

  // ==================== FINAL RESPONSE ====================
  const updatedLand = await Land.findById(land._id)
    .populate('coOwners')
    .lean();

  return res.status(201).json({
    success: true,
    message: "Land registered successfully",
    land: updatedLand,
    verificationStatus: landStatus,
    verdict,
    verificationId
  });
});

/**
 * GET /land
 * List current user's lands with pagination.
 */
exports.list = asyncHandler(async (req, res) => {
  const query = Land.find({ owner: req.userId });
  const result = await paginate(query, req.query);

  res.json({ success: true, ...result });
});

/**
 * GET /land/search
 * Search lands for buyers (only registered/listed lands).
 */
exports.search = asyncHandler(async (req, res) => {
  const filter = { status: { $in: ['registered', 'listed', 'verification_passed'] } };

  if (req.query.district) filter['location.district'] = new RegExp(req.query.district, 'i');
  if (req.query.taluka) filter['location.taluka'] = new RegExp(req.query.taluka, 'i');
  if (req.query.village) filter['location.village'] = new RegExp(req.query.village, 'i');
  if (req.query.surveyNumber) filter['location.surveyNumber'] = req.query.surveyNumber;

  const query = Land.find(filter)
    .populate('owner', 'walletAddress profile.fullName')
    .populate('verificationResult', 'comparison.verdict comparison.overallScore');

  const result = await paginate(query, req.query);

  res.json({ success: true, ...result });
});

/**
 * GET /land/:id
 * Get land details with populated references.
 */
exports.getById = asyncHandler(async (req, res) => {
  const land = await Land.findById(req.params.id)
    .populate('owner', 'walletAddress profile.fullName')
    .populate('coOwners')
    .populate('verificationResult');

  if (!land) {
    return res.status(404).json({ success: false, error: 'Land not found' });
  }

  res.json({ success: true, land });
});

/**
 * PUT /land/:id
 * Update a land draft (only if status is 'draft').
 */
exports.update = asyncHandler(async (req, res) => {
  const land = await Land.findById(req.params.id);

  if (!land) {
    return res.status(404).json({ success: false, error: 'Land not found' });
  }

  if (land.owner.toString() !== req.userId.toString()) {
    return res.status(403).json({ success: false, error: 'Not the owner of this land' });
  }

  if (land.status !== 'draft') {
    return res.status(400).json({ success: false, error: 'Can only edit lands in draft status' });
  }

  const allowedFields = [
    'location', 'area', 'encumbrances', 'boundaryDescription'
  ];

  allowedFields.forEach(field => {
    if (req.body[field] !== undefined) {
      land[field] = req.body[field];
    }
  });

  land.updatedAt = new Date();
  await land.save();

  res.json({ success: true, land });
});

/**
 * POST /land/:id/upload-documents
 * Upload 7/12 document and trigger verification.
 * Updates land status to 'documents_uploaded'.
 */
exports.uploadDocuments = asyncHandler(async (req, res) => {
  const land = await Land.findById(req.params.id);

  if (!land) {
    return res.status(404).json({ success: false, error: 'Land not found' });
  }

  if (land.owner.toString() !== req.userId.toString()) {
    return res.status(403).json({ success: false, error: 'Not the owner' });
  }

  // CIDs come from a prior /ipfs/upload or /ipfs/extract-and-compare call
  const { sevenTwelveCID, mahabhulekhSnapshotCID, mahabhunakshaSnapshotCID } = req.body;

  if (sevenTwelveCID) land.documents.sevenTwelveCID = sevenTwelveCID;
  if (mahabhulekhSnapshotCID) land.documents.mahabhulekhSnapshotCID = mahabhulekhSnapshotCID;
  if (mahabhunakshaSnapshotCID) land.documents.mahabhunakshaSnapshotCID = mahabhunakshaSnapshotCID;

  if (land.status === 'draft') {
    land.status = 'documents_uploaded';
  }

  await land.save();

  logger.info('Documents uploaded', { landId: land._id });

  res.json({ success: true, land });
});

/**
 * PUT /land/:id/status
 * Update land status (admin/officer or system use).
 */
exports.updateStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;

  const land = await Land.findByIdAndUpdate(
    req.params.id,
    { $set: { status, updatedAt: new Date() } },
    { new: true }
  );

  if (!land) {
    return res.status(404).json({ success: false, error: 'Land not found' });
  }

  res.json({ success: true, land });
});
