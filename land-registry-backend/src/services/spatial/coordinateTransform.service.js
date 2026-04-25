/**
 * @file coordinateTransform.service.js
 * @description This service handles complex external integrations, background tasks, or specific business operations separate from the controller.
 * 
 * NOTE: This file is essential for the backend architecture. 
 * It follows the Model-View-Controller (MVC) pattern.
 */

// src/services/spatial/coordinateTransform.service.js
const proj4 = require('proj4');
const logger = require('../../utils/logger');
const crsDetect = require('../../utils/crsDetect');

// Define common Indian CRS (Everest / Survey of India variants)
proj4.defs('EPSG:4326', '+proj=longlat +datum=WGS84 +no_defs'); // target

// Common Maharashtra / India local systems (adjust per your observed data)
proj4.defs('SOI_EVEREST', '+proj=longlat +a=6377276.345 +b=6356075.413 +no_defs'); // Everest 1830 approx
// Add more precise zone-specific if needed (e.g., LCC for Maharashtra zones)

class CoordinateTransformService {

  /**
   * Auto-detect + transform raw vertices from Mahabhunaksha to WGS84 [lat, lng].
   * Returns array of { id, lat, lng, sourceCRS }
   */
  async transformVertices(rawVertices) {
    if (!Array.isArray(rawVertices) || rawVertices.length === 0) {
      throw new Error('No vertices provided for transformation');
    }

    const firstVertex = rawVertices[0];
    const detectedCRS = crsDetect.detect(firstVertex.rawX, firstVertex.rawY);

    logger.info('[Coord Transform] Detected CRS:', detectedCRS);

    const transformed = [];

    for (const v of rawVertices) {
      let lng = parseFloat(v.rawX);
      let lat = parseFloat(v.rawY);

      if (isNaN(lng) || isNaN(lat)) {
        logger.warn('[Coord Transform] Invalid coord skipped', v);
        continue;
      }

      // Reproject if not already WGS84
      if (detectedCRS !== 'WGS84') {
        try {
          // Example: from local Everest to WGS84 (customize projection string per actual data)
          const sourceProj = proj4.defs('SOI_EVEREST') || proj4.WGS84;
          const result = proj4(sourceProj, proj4.WGS84, [lng, lat]);
          lng = result[0];
          lat = result[1];
        } catch (err) {
          logger.error('[Coord Transform] Reprojection failed for vertex', v, err.message);
          // Fallback: assume already approx WGS84
        }
      }

      transformed.push({
        id: v.id,
        lat: Number(lat.toFixed(8)),
        lng: Number(lng.toFixed(8)),
        sourceCRS: detectedCRS,
        rawX: v.rawX,
        rawY: v.rawY,
      });
    }

    return transformed;
  }

  /**
   * Convert single point (useful for testing)
   */
  transformPoint(x, y, fromCRS = 'SOI_EVEREST') {
    const source = proj4.defs(fromCRS) || proj4.WGS84;
    const [lng, lat] = proj4(source, proj4.WGS84, [parseFloat(x), parseFloat(y)]);
    return { lat: Number(lat.toFixed(8)), lng: Number(lng.toFixed(8)) };
  }
}

module.exports = new CoordinateTransformService();