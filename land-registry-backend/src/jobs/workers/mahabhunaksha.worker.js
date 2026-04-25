/**
 * @file mahabhunaksha.worker.js
 * @description This file defines background jobs and schedulers for asynchronous operations.
 * 
 * NOTE: This file is essential for the backend architecture. 
 * It follows the Model-View-Controller (MVC) pattern.
 */

// src/jobs/workers/mahabhunaksha.worker.js
const Queue = require('bull');                    // or your preferred queue (Bull, Bee-Queue, etc.)
const mahabhunakshaService = require('../../services/spatial/mahabhunaksha.service');
const geojsonService = require('../../services/spatial/geojson.service');
const kmlService = require('../../services/spatial/kml.service');
const bhuvanService = require('../../services/spatial/bhuvan.service');
const ipfsPinService = require('../../services/ipfs/pin.service');
const Polygon = require('../../models/Polygon.model');
const Land = require('../../models/Land.model');
const logger = require('../../utils/logger');

const mahabhunakshaQueue = new Queue('mahabhunaksha-scrape', {
  redis: {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: process.env.REDIS_PORT || 6379,
  },
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: true,
    removeOnFail: false,
  }
});

// ─────────────────────────────────────────────────────────────
// MAIN JOB PROCESSOR
// ─────────────────────────────────────────────────────────────
mahabhunakshaQueue.process(async (job) => {
  const { landId, district, taluka, village, surveyNo, userId } = job.data;

  logger.info('[MBN Worker] Starting Mahabhunaksha scrape job', {
    jobId: job.id,
    landId,
    surveyNo
  });

  try {
    // 1. Verify Land exists and user has permission
    const land = await Land.findById(landId);
    if (!land) throw new Error('Land not found');
    if (land.owner.toString() !== userId) throw new Error('Unauthorized');

    // 2. Scrape Mahabhunaksha + Transform Coordinates
    const mbnData = await mahabhunakshaService.getPlotDetails({
      district,
      taluka,
      village,
      surveyNo
    });

    // 3. Create GeoJSON from vertices
    const geoJson = geojsonService.fromMahabhunakshaVertices(mbnData.vertices, {
      plotNo: mbnData.plotNo,
      surveyCode: mbnData.surveyCode,
      village,
      taluka,
      district,
      source: 'mahabhunaksha'
    });

    // 4. Generate KML (Bhuvan compatible)
    const kmlResult = await kmlService.generateKml(geoJson, {
      plotNo: mbnData.plotNo,
      surveyCode: mbnData.surveyCode,
      village,
      taluka,
      district
    });

    // 5. Pin KML and GeoJSON to IPFS
    const kmlCID = await ipfsPinService.pinBuffer(
      kmlResult.buffer,
      kmlResult.filename
    );

    const geoCID = await ipfsPinService.pinBuffer(
      Buffer.from(JSON.stringify(geoJson)),
      `polygon_${landId}_${Date.now()}.geojson`
    );

    // 6. Compute area
    const areaSqm = geojsonService.computeArea(geoJson);

    // 7. Save to Polygon model using geojsonService helper
    const polygon = await geojsonService.savePolygon({
      landId: land._id,
      geoJson,
      kmlCID,
      surveyCode: mbnData.surveyCode,
      vertices: mbnData.vertices,
      sourceCRS: mbnData.sourceCRS || 'WGS84',
      areaSqm,
      plotNo: mbnData.plotNo,
      measurements: mbnData.measurements,
      scrapedAt: new Date(),
      bhuvanOverlayUrl: null // will be generated on demand
    });

    // 8. Update Land document
    land.documents = land.documents || {};
    land.documents.polygonGeoJsonCID = geoCID;
    land.documents.kmlCID = kmlCID;
    await land.save();

    // 9. Generate Bhuvan preview config (for notification)
    const bhuvanConfig = bhuvanService.buildOverlayConfig(geoJson, {
      plotNo: mbnData.plotNo,
      surveyCode: mbnData.surveyCode,
      village,
      taluka,
      district,
      area: `${(areaSqm / 10000).toFixed(4)} ha`
    });

    logger.info('[MBN Worker] Job completed successfully', {
      jobId: job.id,
      polygonId: polygon._id,
      surveyCode: mbnData.surveyCode,
      kmlCID,
      vertexCount: mbnData.vertices.length
    });

    // Optional: Emit socket/notification
    // await notificationService.sendPolygonReady(land.owner, polygon._id, bhuvanConfig);

    return {
      success: true,
      polygonId: polygon._id,
      surveyCode: mbnData.surveyCode,
      kmlCID,
      bhuvanPreview: bhuvanConfig
    };

  } catch (error) {
    logger.error('[MBN Worker] Job failed', {
      jobId: job.id,
      landId,
      surveyNo,
      error: error.message
    });

    // You can add failed job handling / retry logic here
    throw error; // Bull will handle retries based on config
  }
});

// ─────────────────────────────────────────────────────────────
// QUEUE EVENTS (Optional but Recommended)
// ─────────────────────────────────────────────────────────────

mahabhunakshaQueue.on('completed', (job, result) => {
  logger.info(`[MBN Worker] Job ${job.id} completed`, result);
});

mahabhunakshaQueue.on('failed', (job, err) => {
  logger.error(`[MBN Worker] Job ${job.id} failed`, { error: err.message });
});

mahabhunakshaQueue.on('stalled', (job) => {
  logger.warn(`[MBN Worker] Job ${job.id} stalled`);
});

// ─────────────────────────────────────────────────────────────
// HELPER: Add Job to Queue (to be called from controller)
// ─────────────────────────────────────────────────────────────
exports.addMahabhunakshaJob = async (data) => {
  const job = await mahabhunakshaQueue.add(data, {
    priority: 1,
    attempts: 3,
    backoff: { type: 'exponential', delay: 8000 }
  });

  logger.info('[MBN Worker] Job added to queue', {
    jobId: job.id,
    landId: data.landId,
    surveyNo: data.surveyNo
  });

  return job.id;
};

// Export queue for monitoring / graceful shutdown if needed
exports.mahabhunakshaQueue = mahabhunakshaQueue;

module.exports = exports;