// src/controllers/polygon.controller.js
const asyncHandler = require('../utils/asyncHandler');
const Polygon = require('../models/Polygon.model');
const Land = require('../models/Land.model');
const ipfsPinService = require('../services/ipfs/pin.service');
const mahabhunakshaService = require('../services/spatial/mahabhunaksha.service');
const geojsonService = require('../services/spatial/geojson.service');
const kmlService = require('../services/spatial/kml.service');
const bhuvanService = require('../services/spatial/bhuvan.service');
const logger = require('../utils/logger');

let turfArea;
try {
  turfArea = require('@turf/area').default || require('@turf/area');
} catch (e) {
  turfArea = null;
}

// ─────────────────────────────────────────────────────────────
// POST /land/:id/polygon
// ─────────────────────────────────────────────────────────────
exports.savePolygon = asyncHandler(async (req, res) => {
  const land = await Land.findById(req.params.id);
  if (!land) return res.status(404).json({ success: false, error: 'Land not found' });

  if (land.owner.toString() !== req.userId.toString()) {
    return res.status(403).json({ success: false, error: 'Not the owner' });
  }

  const { geoJson, source = 'user_drawn' } = req.body;

  const { toSqm } = require('../utils/areaConvert');
  const areaSqm = toSqm(land.area.value, land.area.unit);

  if (areaSqm < 500) {
    const polygon = await Polygon.create({
      land: land._id,
      geoJson: {},
      areaSqm,
      skipped: true,
      source
    });
    logger.info('Polygon skipped — area under 500sqm', { landId: land._id, areaSqm });
    return res.json({ success: true, polygon, skipped: true });
  }

  geojsonService.validate(geoJson);

  let computedArea = 0;
  if (turfArea) {
    const feature = geoJson.type === 'Feature' ? geoJson : {
      type: 'Feature',
      geometry: geoJson,
      properties: {}
    };
    computedArea = turfArea(feature);
  }

  const geoCID = await ipfsPinService.pinBuffer(
    Buffer.from(JSON.stringify(geoJson)),
    `polygon_${land._id}.geojson`
  );

  const warnings = [];
  if (computedArea > 0 && areaSqm > 0) {
    const diff = Math.abs(computedArea - areaSqm);
    const tolerance = areaSqm * 0.10;
    if (diff > tolerance) {
      warnings.push({
        type: 'area_mismatch',
        severity: diff > areaSqm * 0.25 ? 'critical' : 'warning',
        message: `Polygon area (${Math.round(computedArea)} sqm) differs from declared area (${Math.round(areaSqm)} sqm) by ${Math.round(diff)} sqm`,
        data: { computedArea, declaredArea: areaSqm, diffPercent: Math.round((diff / areaSqm) * 100) }
      });
    }
  }

  const polygon = await Polygon.create({
    land: land._id,
    geoJson,
    areaSqm: computedArea || areaSqm,
    source,
    ipfsCID: geoCID,
    warnings,
    skipped: false
  });

  land.documents = land.documents || {};
  land.documents.polygonGeoJsonCID = geoCID;
  await land.save();

  logger.info('Polygon saved', { landId: land._id, cid: geoCID, warnings: warnings.length });
  res.json({ success: true, polygon });
});

// ─────────────────────────────────────────────────────────────
// GET /land/:id/polygon
// ─────────────────────────────────────────────────────────────
exports.getPolygon = asyncHandler(async (req, res) => {
  const polygon = await Polygon.findOne({ land: req.params.id }).sort({ createdAt: -1 });
  if (!polygon) {
    return res.status(404).json({ success: false, error: 'No polygon found' });
  }
  res.json({ success: true, polygon });
});

// ─────────────────────────────────────────────────────────────
// POST /land/:id/polygon/validate
// ─────────────────────────────────────────────────────────────
exports.validatePolygon = asyncHandler(async (req, res) => {
  const polygon = await Polygon.findOne({ land: req.params.id }).sort({ createdAt: -1 });
  if (!polygon || polygon.skipped) {
    return res.json({ success: true, skipped: true, message: 'Polygon skipped or not found' });
  }
  const warnings = [...(polygon.warnings || [])];
  res.json({ success: true, polygon, warnings, advisoryOnly: true });
});

// ─────────────────────────────────────────────────────────────
// POST /polygon/from-mahabhunaksha
// ─────────────────────────────────────────────────────────────
// polygon.controller.js  — fromMahabhunaksha

// polygon.controller.js — top of file, keep existing imports, just remove any marathiName reference

exports.fromMahabhunaksha = asyncHandler(async (req, res) => {
  const {
    landId,
    districtValue,
    talukaValue,
    villageValue,
    district:  districtNameFallback = '',
    taluka:    talukaNameFallback   = '',
    village:   villageNameFallback  = '',
    surveyNo,
    ownerName,
    area,
    khataNo
  } = req.body;

  const cleanDistrictValue = String(districtValue).replace(/^0+/, '') || districtValue;
  const cleanTalukaValue   = String(talukaValue).replace(/^0+/, '')   || talukaValue;
  const cleanVillageValue  = villageValue;

  const marathiDistrict = districtNameFallback;
  const marathiTaluka   = talukaNameFallback;
  const marathiVillage  = villageNameFallback;

  let land;

  if (landId) {
    // ── Case 1: Attach to existing Land ────────────────────────
    land = await Land.findById(landId);
    if (!land) return res.status(404).json({ success: false, error: 'Land not found' });
    if (land.owner.toString() !== req.userId.toString()) {
      return res.status(403).json({ success: false, error: 'Not the owner' });
    }

    // ── Duplicate polygon check for existing land ───────────────
    // If this land already has a polygon from Mahabhunaksha, return it
    const existingPolygon = await Polygon.findOne({
      land:    land._id,
      source:  'mahabhunaksha',
      skipped: false
    }).sort({ createdAt: -1 });

    if (existingPolygon) {
      logger.info('Polygon already exists for land, returning cached', {
        landId: land._id,
        polygonId: existingPolygon._id
      });
      return res.status(200).json({
        success:  true,
        message:  'Polygon already exists for this land',
        cached:   true,
        data: {
          landId:     land._id,
          polygonId:  existingPolygon._id,
          surveyCode: existingPolygon.surveyCode || land.location.surveyNumber,
          plotNo:     existingPolygon.plotNo     || null,
          areaSqm:    existingPolygon.areaSqm,
          isNewLand:  false
        }
      });
    }

    // Back-fill codes + names on existing land if missing
    if (!land.location.districtValue) land.location.districtValue = cleanDistrictValue;
    if (!land.location.talukaValue)   land.location.talukaValue   = cleanTalukaValue;
    if (!land.location.villageValue)  land.location.villageValue  = cleanVillageValue;
    if (!land.location.district)      land.location.district      = marathiDistrict;
    if (!land.location.taluka)        land.location.taluka        = marathiTaluka;
    if (!land.location.village)       land.location.village       = marathiVillage;

  } else {
    // ── Case 2: Auto-create new Land ───────────────────────────

    if (!ownerName?.trim()) {
      return res.status(400).json({
        success: false,
        error: 'ownerName is required when landId is not provided'
      });
    }

    // ── Duplicate survey number check (same owner + same surveyNo) ──
    const duplicateLand = await Land.findOne({
      owner:                   req.userId,
      'location.surveyNumber': surveyNo?.trim()
    });

    if (duplicateLand) {
      // Check if it already has a Mahabhunaksha polygon too
      const existingPolygon = await Polygon.findOne({
        land:    duplicateLand._id,
        source:  'mahabhunaksha',
        skipped: false
      }).sort({ createdAt: -1 });

      logger.info('Duplicate survey number detected in fromMahabhunaksha', {
        surveyNo,
        existingLandId: duplicateLand._id
      });

      return res.status(409).json({
        success:    false,
        duplicate:  true,
        error:      'A land with survey number "' + surveyNo + '" already exists',
        existingLandId:    duplicateLand._id,
        existingPolygonId: existingPolygon ? existingPolygon._id : null,
        suggestion: existingPolygon
          ? 'This land already has a polygon. Use landId to view or re-fetch it.'
          : 'Pass landId: "' + duplicateLand._id + '" to attach a polygon to this existing land.'
      });
    }

    land = await Land.create({
      owner: req.userId,
      status: 'draft',
      location: {
        district:      marathiDistrict,
        districtValue: cleanDistrictValue,
        taluka:        marathiTaluka,
        talukaValue:   cleanTalukaValue,
        village:       marathiVillage,
        villageValue:  cleanVillageValue,
        surveyNumber:  surveyNo,
        gatNumber:     khataNo || null
      },
      area: {
        value: area ? parseFloat(area) : 0,
        unit: 'hectare'
      },
      documents: {},
      legacyFlag: false
    });

    logger.info('New Land auto-created from Mahabhunaksha', { landId: land._id, surveyNo });
  }

  // ── Scrape Mahabhunaksha ──────────────────────────────────────
  let mbnData;
  try {
    mbnData = await mahabhunakshaService.getPlotDetails({
      district: cleanDistrictValue,
      taluka:   cleanTalukaValue,
      village:  cleanVillageValue,
      surveyNo
    });
  } catch (err) {
    logger.error('Mahabhunaksha scraping failed', err);
    return res.status(502).json({
      success: false,
      error:   'Failed to fetch data from Mahabhunaksha',
      details: err.message
    });
  }

  if (!mbnData?.vertices?.length) {
    return res.status(400).json({
      success: false,
      error:   'No plot geometry returned from Mahabhunaksha',
      surveyNo
    });
  }
  const isBboxFallback = mbnData.bboxFallback === true;

  const geoJson = geojsonService.fromMahabhunakshaVertices(mbnData.vertices, {
    plotNo:     mbnData.plotNo,
    surveyCode: mbnData.surveyCode,
    village:    marathiVillage,
    taluka:     marathiTaluka,
    district:   marathiDistrict,
    source:     'mahabhunaksha'
  });

  const kmlResult = await kmlService.generateKml(geoJson, {
    plotNo:     mbnData.plotNo,
    surveyCode: mbnData.surveyCode,
    village:    marathiVillage,
    taluka:     marathiTaluka,
    district:   marathiDistrict
  });

  const kmlCID = await ipfsPinService.pinBuffer(kmlResult.buffer, kmlResult.filename);

  const polygon = await geojsonService.savePolygon({
    landId:       land._id,
    geoJson,
    kmlCID,
    surveyCode:   mbnData.surveyCode,
    vertices:     mbnData.vertices,
    sourceCRS:    mbnData.sourceCRS || 'WGS84',
    areaSqm:      geojsonService.computeArea(geoJson),
    plotNo:       mbnData.plotNo,
    measurements: mbnData.measurements,
    scrapedAt:    new Date()
  });

  land.documents = land.documents || {};
  land.documents.polygonGeoJsonCID = polygon.ipfsCID || null;
  land.documents.kmlCID = kmlCID;

  if (!land.location.surveyNumber) {
    land.location.surveyNumber = mbnData.surveyCode || surveyNo;
  }
  if (!land.area.value && mbnData.area) {
    land.area.value = parseFloat(mbnData.area) || 0;
  }

  await land.save();

  const bhuvanConfig = bhuvanService.buildOverlayConfig(geoJson, {
    plotNo:     mbnData.plotNo,
    surveyCode: mbnData.surveyCode,
    village:    marathiVillage,
    taluka:     marathiTaluka,
    district:   marathiDistrict,
    area:       `${(polygon.areaSqm / 10000).toFixed(4)} ha`
  });

  logger.info('Polygon created from Mahabhunaksha', {
    landId:    land._id,
    surveyCode: mbnData.surveyCode,
    polygonId: polygon._id,
    isNewLand: !landId,
    kmlCID
  });

  res.status(201).json({
    success: true,
    message: landId
      ? 'Polygon attached successfully'
      : 'New land + polygon created successfully',
    data: {
      landId:          land._id,
      polygonId:       polygon._id,
      surveyCode:      mbnData.surveyCode,
      plotNo:          mbnData.plotNo,
      vertexCount:     mbnData.vertices.length,
      areaSqm:         polygon.areaSqm,
      bhuvanPreview:   bhuvanConfig,
      kmlCID,
      geometrySource:  isBboxFallback ? 'extent_bbox' : 'scraped',
      geometryWarning: isBboxFallback
        ? 'Boundary is an approximate bounding box — exact cadastral shape unavailable'
        : null,
      isNewLand: !landId
    }
  });
});

// ─────────────────────────────────────────────────────────────
// GET /polygon/:id/bhuvan-preview
// ─────────────────────────────────────────────────────────────
exports.getBhuvanPreview = asyncHandler(async (req, res) => {
  const polygon = await Polygon.findOne({ land: req.params.id }).sort({ createdAt: -1 });
  if (!polygon) {
    return res.status(404).json({ success: false, error: 'No polygon found for this land' });
  }
  if (!polygon.geoJson || !polygon.geoJson.geometry) {
    return res.status(400).json({ success: false, error: 'Polygon has no valid GeoJSON geometry' });
  }

  const meta = {
    plotNo: polygon.geoJson.properties.plotNo|| 'N/A',
    surveyCode: polygon.surveyCode || 'N/A',
    village: polygon.geoJson.properties?.village,
    taluka: polygon.geoJson.properties?.taluka,
    district: polygon.geoJson.properties?.district,
    area: polygon.areaSqm ? `${(polygon.areaSqm / 10000).toFixed(4)} ha` : '0.0000 ha'
  };

  const previewConfig = bhuvanService.buildOverlayConfig(polygon.geoJson, meta);
  res.json({ success: true, data: previewConfig, meta });
});

// ─────────────────────────────────────────────────────────────
// GET /polygon/:id/export/kml
// ─────────────────────────────────────────────────────────────
exports.exportKml = asyncHandler(async (req, res) => {
  const polygon = await Polygon.findOne({ land: req.params.id }).sort({ createdAt: -1 });
  if (!polygon) {
    return res.status(404).json({ success: false, error: 'No polygon found for this land' });
  }
  if (!polygon.geoJson) {
    return res.status(400).json({ success: false, error: 'No GeoJSON available for KML export' });
  }

  const kmlResult = await kmlService.generateKml(polygon.geoJson, {
    plotNo: polygon.plotNo,
    surveyCode: polygon.surveyCode,
    village: polygon.geoJson.properties?.village,
    taluka: polygon.geoJson.properties?.taluka,
    district: polygon.geoJson.properties?.district
  });

  res.setHeader('Content-Type', kmlResult.contentType || 'application/vnd.google-earth.kml+xml');
  res.setHeader('Content-Disposition', `attachment; filename="${kmlResult.filename}"`);
  res.send(kmlResult.buffer);
});

// ─────────────────────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────────────────────
module.exports = {
  savePolygon: exports.savePolygon,
  getPolygon: exports.getPolygon,
  validatePolygon: exports.validatePolygon,
  fromMahabhunaksha: exports.fromMahabhunaksha,
  getBhuvanPreview: exports.getBhuvanPreview,
  exportKml: exports.exportKml
};