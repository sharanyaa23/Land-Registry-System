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
  async transformVertices(rawVertices, crsHint = '') {
    if (!Array.isArray(rawVertices) || rawVertices.length === 0) {
      throw new Error('No vertices provided for transformation');
    }

    const firstVertex = rawVertices[0];
    const x = parseFloat(firstVertex.rawX);
    const y = parseFloat(firstVertex.rawY);

    // Auto-detect CRS from coordinate magnitude if no hint given
    let detectedCRS = crsHint || crsDetect.detect(firstVertex.rawX, firstVertex.rawY);

    // Large x values (100000+) in OL are almost always EPSG:3857 (Web Mercator)
    // e.g. x ≈ 8,200,000  y ≈ 2,300,000 for Maharashtra
    if (!detectedCRS || detectedCRS === 'UNKNOWN') {
      if (Math.abs(x) > 100000 || Math.abs(y) > 100000) {
        detectedCRS = 'EPSG:3857';
      } else if (Math.abs(x) < 180 && Math.abs(y) < 90) {
        detectedCRS = 'WGS84';
      }
    }

    // Map OL CRS codes to proj4 definitions
    if (detectedCRS === 'EPSG:3857' || detectedCRS === 'EPSG:900913') {
      proj4.defs('EPSG:3857',
        '+proj=merc +a=6378137 +b=6378137 +lat_ts=0 +lon_0=0 ' +
        '+x_0=0 +y_0=0 +k=1 +units=m +nadgrids=@null +wktext +no_defs');
    }

    logger.info('[Coord Transform] Detected CRS:', detectedCRS);

    const transformed = [];

    for (const v of rawVertices) {
      let lng = parseFloat(v.rawX);
      let lat = parseFloat(v.rawY);

      if (isNaN(lng) || isNaN(lat)) {
        logger.warn('[Coord Transform] Invalid coord skipped', v);
        continue;
      }

      if (detectedCRS !== 'WGS84' && detectedCRS !== 'EPSG:4326') {
        try {
          const result = proj4(detectedCRS, 'EPSG:4326', [lng, lat]);
          lng = result[0];
          lat = result[1];
        } catch (err) {
          logger.error('[Coord Transform] Reprojection failed for vertex', v, err.message);
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