/**
 * @file kml.service.js
 * @description This service handles complex external integrations, background tasks, or specific business operations separate from the controller.
 * 
 * NOTE: This file is essential for the backend architecture. 
 * It follows the Model-View-Controller (MVC) pattern.
 */

// src/services/spatial/kml.service.js
const geojsonService = require('./geojson.service');
const logger = require('../../utils/logger');

class KmlService {

  /**
   * Generate KML from GeoJSON (or directly from vertices + metadata)
   * Returns Buffer ready for IPFS pin or download.
   */
  async generateKml(geoJsonOrVertices, meta = {}) {
    let feature;

    if (geoJsonOrVertices.type) {
      // Already GeoJSON
      feature = geojsonService.normalise(geoJsonOrVertices);
    } else {
      // Assume Mahabhunaksha vertices array
      feature = geojsonService.fromMahabhunakshaVertices(geoJsonOrVertices, meta);
    }

    const kmlString = geojsonService.toKML(feature, {
      name: `Plot ${meta.plotNo || ''} - ${meta.surveyCode || ''}`,
      description: `Village: ${meta.village || ''}, Taluka: ${meta.taluka || ''}\nSurvey Code: ${meta.surveyCode || ''}`,
    });

    const buffer = Buffer.from(kmlString, 'utf-8');

    logger.info('[KML Service] KML generated', { size: buffer.length, plotNo: meta.plotNo });

    return {
      buffer,
      filename: `plot_${meta.surveyCode || 'unknown'}_${Date.now()}.kml`,
      contentType: 'application/vnd.google-earth.kml+xml',
    };
  }
}

module.exports = new KmlService();