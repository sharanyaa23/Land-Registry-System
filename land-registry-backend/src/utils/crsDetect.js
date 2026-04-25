/**
 * @file crsDetect.js
 * @description This utility file contains reusable helper functions used across the application.
 * 
 * NOTE: This file is essential for the backend architecture. 
 * It follows the Model-View-Controller (MVC) pattern.
 */

// src/utils/crsDetect.js
/**
 * Auto-detect CRS from raw coordinate values returned by Mahabhunaksha.
 * Common patterns:
 *   - WGS84:          lat ~18.x, lng ~73.x (Maharashtra)
 *   - SOI/Everest:    large Easting/Northing (e.g. 300000–800000 range) or different ranges
 */
const crsDetect = (x, y) => {
  const numX = parseFloat(x);
  const numY = parseFloat(y);

  if (isNaN(numX) || isNaN(numY)) return 'UNKNOWN';

  // Maharashtra typical WGS84 bounds
  if (numX >= 72 && numX <= 81 && numY >= 15 && numY <= 22.5) {
    return 'WGS84';
  }

  // Likely projected / local SOI (large numbers, common in Indian cadastral)
  if ((numX > 100000 && numX < 1000000) || (numY > 1000000 && numY < 3000000)) {
    return 'SOI_EVEREST';
  }

  // Fallback heuristics
  if (Math.abs(numX) > 180 || Math.abs(numY) > 90) {
    return 'PROJECTED'; // likely UTM / LCC variant
  }

  return 'WGS84'; // safest default for most modern portals
};

module.exports = { detect: crsDetect };