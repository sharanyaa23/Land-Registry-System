/**
 * @file geojson.service.js
 * @description This service handles complex external integrations, background tasks, or specific business operations separate from the controller.
 * 
 * NOTE: This file is essential for the backend architecture. 
 * It follows the Model-View-Controller (MVC) pattern.
 */

/**
 * GeoJSON Service
 *
 * Responsibilities:
 *  1. Validate and normalise GeoJSON polygons
 *  2. Compute polygon area (via @turf/area)
 *  3. Convert Mahabhunaksha vertex arrays into GeoJSON Polygons   ← NEW
 *  4. Export GeoJSON to KML string                                ← NEW
 *  5. Tag polygons with CRS metadata for downstream reprojection  ← NEW
 *  6. Persist a normalised polygon record to the DB model         ← NEW
 */

const logger = require('../../utils/logger');

// ─── Constants ───────────────────────────────────────────────────────────────

const VALID_TYPES = [
  'Point', 'LineString', 'Polygon',
  'MultiPolygon', 'Feature', 'FeatureCollection'
];

// ─── 1. Validate ─────────────────────────────────────────────────────────────

/**
 * Validate a GeoJSON object.
 * Throws a descriptive Error on failure; returns true on success.
 *
 * @param {Object} geo - Any GeoJSON object
 * @returns {true}
 */
exports.validate = (geo) => {
  if (!geo) throw new Error('GeoJSON is required');

  // Unwrap Feature before type-checking geometry
  if (geo.type === 'Feature') {
    if (!geo.geometry) throw new Error('GeoJSON Feature must have a geometry');
    return exports.validate(geo.geometry);
  }

  if (!VALID_TYPES.includes(geo.type)) {
    throw new Error(
      `Invalid GeoJSON type: "${geo.type}". Expected one of: ${VALID_TYPES.join(', ')}`
    );
  }

  if (!['Feature', 'FeatureCollection'].includes(geo.type) && !geo.coordinates) {
    throw new Error(`GeoJSON type "${geo.type}" must have a coordinates array`);
  }

  if (geo.type === 'Polygon') {
    if (!Array.isArray(geo.coordinates) || geo.coordinates.length === 0) {
      throw new Error('Polygon must have at least one ring in coordinates');
    }
    const ring = geo.coordinates[0];
    if (ring.length < 4) {
      throw new Error('Polygon exterior ring must have at least 4 positions (first === last)');
    }
    const first = ring[0];
    const last  = ring[ring.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) {
      logger.warn('[geojson] Polygon ring is not closed – auto-closing');
    }
  }

  return true;
};

// ─── 2. Normalise ─────────────────────────────────────────────────────────────

/**
 * Normalise any GeoJSON object into a GeoJSON Feature<Polygon>.
 * - Closes open rings automatically
 * - Ensures coordinates are [lng, lat] (WGS-84 convention)
 *
 * @param {Object} geo - GeoJSON Feature, Polygon, or raw coordinate array
 * @returns {Object} GeoJSON Feature<Polygon>
 */
exports.normalise = (geo) => {
  let polygon;

  if (geo.type === 'Feature') {
    polygon = geo.geometry;
  } else if (geo.type === 'Polygon') {
    polygon = geo;
  } else {
    throw new Error(`Cannot normalise GeoJSON of type "${geo.type}" to Polygon`);
  }

  // Close ring if needed
  const ring = polygon.coordinates[0];
  if (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1]) {
    polygon.coordinates[0] = [...ring, ring[0]];
  }

  return {
    type:       'Feature',
    geometry:   polygon,
    properties: geo.properties || {}
  };
};

// ─── 3. Area computation ──────────────────────────────────────────────────────

/**
 * Compute the area of a GeoJSON polygon in square metres.
 * Falls back to 0 if @turf/area is not installed.
 *
 * @param {Object} geoJson - GeoJSON Feature or Polygon
 * @returns {number} Area in m²
 */
exports.computeArea = (geoJson) => {
  try {
    const turfArea = require('@turf/area');
    const areaFn   = turfArea.default || turfArea;
    const feature  = geoJson.type === 'Feature'
      ? geoJson
      : { type: 'Feature', geometry: geoJson, properties: {} };
    return areaFn(feature);
  } catch (err) {
    logger.warn('[geojson] @turf/area not available – returning 0: %s', err.message);
    return 0;
  }
};

// ─── 4. From Mahabhunaksha vertices ──────────────────────────────────────────

/**
 * Convert an array of Mahabhunaksha vertex objects into a GeoJSON Feature<Polygon>.
 *
 * Vertices come from mahabhunaksha.service after coordinate transformation
 * (coordinateTransform.service converts SOI → WGS-84 before calling here).
 *
 * @param {Array<{ id: string, lat: number, lng: number }>} vertices
 *   Ordered list of boundary vertices in WGS-84 (V1, V2, V3 ... from the report)
 * @param {Object} [properties] - Optional metadata to embed in the Feature
 * @returns {Object} GeoJSON Feature<Polygon>
 *
 * @example
 * const geoJson = geojsonService.fromMahabhunakshaVertices([
 *   { id: 'V1', lat: 18.5246, lng: 73.8561 },
 *   { id: 'V2', lat: 18.5224, lng: 73.8578 },
 *   { id: 'V3', lat: 18.5218, lng: 73.8549 },
 *   { id: 'V4', lat: 18.5239, lng: 73.8533 }
 * ], { plotNo: '100', surveyCode: 'CM7EBD9U8M7H0' });
 */
exports.fromMahabhunakshaVertices = (vertices, properties = {}) => {
  if (!Array.isArray(vertices) || vertices.length < 3) {
    throw new Error('At least 3 vertices are required to form a polygon');
  }

  // Validate each vertex has numeric lat/lng
  vertices.forEach((v, i) => {
    if (typeof v.lat !== 'number' || typeof v.lng !== 'number') {
      throw new Error(
        `Vertex at index ${i} (id: ${v.id}) is missing valid lat/lng. ` +
        'Ensure coordinateTransform.service has been run before calling this method.'
      );
    }
  });

  // GeoJSON coordinates are [lng, lat]
  const ring = vertices.map(v => [v.lng, v.lat]);

  // Close the ring (GeoJSON spec: first position === last position)
  ring.push(ring[0]);

  const feature = {
    type: 'Feature',
    geometry: {
      type:        'Polygon',
      coordinates: [ring]
    },
    properties: {
      ...properties,
      vertexCount:    vertices.length,
      vertexIds:      vertices.map(v => v.id),
      sourceCRS:      'WGS84',          // guaranteed by coordinateTransform.service
      generatedFrom:  'mahabhunaksha',
      generatedAt:    new Date().toISOString()
    }
  };

  logger.info(
    '[geojson] fromMahabhunakshaVertices – built polygon with %d vertices, plot %s',
    vertices.length,
    properties.plotNo ?? '?'
  );

  return feature;
};

// ─── 5. CRS tagging ──────────────────────────────────────────────────────────

/**
 * Tag a GeoJSON Feature with a named CRS block.
 * Useful before sending to services that need explicit CRS declarations (e.g. WFS).
 *
 * @param {Object} feature  - GeoJSON Feature
 * @param {string} [crs]    - EPSG code string, e.g. 'EPSG:4326' (default)
 * @returns {Object} Feature with crs property added
 */
exports.tagCRS = (feature, crs = 'EPSG:4326') => {
  return {
    ...feature,
    crs: {
      type:       'name',
      properties: { name: `urn:ogc:def:crs:${crs.replace(':', '::')}` }
    }
  };
};

// ─── 6. KML export ───────────────────────────────────────────────────────────

/**
 * Convert a GeoJSON Feature<Polygon> to a KML string.
 *
 * Compatible with:
 *  - ISRO Bhuvan "Upload KML" feature
 *  - Google Earth / Google Maps import
 *  - Maharashtra land-record portals that accept KML
 *
 * Uses the `tokml` npm package if available; falls back to a hand-rolled
 * minimal KML serialiser so the service never throws due to a missing dep.
 *
 * @param {Object} feature    - GeoJSON Feature<Polygon> in WGS-84
 * @param {Object} [options]
 * @param {string} [options.name]        - Placemark name (shown in Bhuvan)
 * @param {string} [options.description] - Placemark description popup text
 * @param {string} [options.styleColor]  - KML hex AABBGGRR colour (default orange)
 * @returns {string} KML document string
 */
exports.toKML = (feature, options = {}) => {
  const {
    name        = feature.properties?.plotNo ? `Plot ${feature.properties.plotNo}` : 'Land Parcel',
    description = _buildKmlDescription(feature.properties),
    styleColor  = 'ff0055ff'     // AABBGGRR: opaque orange-ish
  } = options;

  // Try tokml package first
  try {
    const tokml = require('tokml');
    const kml   = tokml(feature, { name: 'name', description: 'description' });
    logger.debug('[geojson] toKML – used tokml package');
    return kml;
  } catch (_) {
    // tokml not installed – use fallback serialiser
  }

  const coords = feature.geometry.coordinates[0]
    .map(([lng, lat]) => `${lng},${lat},0`)
    .join(' ');

  const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${_escapeXml(name)}</name>
    <Style id="plotStyle">
      <LineStyle>
        <color>${styleColor}</color>
        <width>2</width>
      </LineStyle>
      <PolyStyle>
        <color>330055ff</color>
      </PolyStyle>
    </Style>
    <Placemark>
      <name>${_escapeXml(name)}</name>
      <description>${_escapeXml(description)}</description>
      <styleUrl>#plotStyle</styleUrl>
      <Polygon>
        <extrude>0</extrude>
        <altitudeMode>clampToGround</altitudeMode>
        <outerBoundaryIs>
          <LinearRing>
            <coordinates>${coords}</coordinates>
          </LinearRing>
        </outerBoundaryIs>
      </Polygon>
    </Placemark>
  </Document>
</kml>`;

  logger.debug('[geojson] toKML – used fallback serialiser');
  return kml.trim();
};

// ─── 7. Persist to Polygon model ─────────────────────────────────────────────

/**
 * Persist a normalised GeoJSON polygon to the Polygon model.
 * Also stores the KML CID (after IPFS pinning) and spatial flags.
 *
 * Intended to be called after:
 *   fromMahabhunakshaVertices → validate → computeArea → toKML → pin.service → HERE
 *
 * @param {Object} params
 * @param {string}  params.landId        - MongoDB ObjectId of the Land record
 * @param {Object}  params.geoJson       - Normalised GeoJSON Feature<Polygon>
 * @param {string}  [params.kmlCID]      - IPFS CID of the pinned KML file
 * @param {number}  [params.areaSqm]     - Pre-computed area in m²
 * @param {string}  [params.surveyCode]  - Mahabhunaksha survey/parcel code
 * @param {Array}   [params.vertices]    - Raw vertex array from Mahabhunaksha
 * @param {string}  [params.sourceCRS]   - 'SOI' | 'WGS84'
 * @param {string}  [params.bhuvanUrl]   - Bhuvan deep-link or overlay URL
 * @returns {Promise<Object>} Saved Polygon model document
 */
exports.savePolygon = async (params) => {
  const Polygon = require('../../models/Polygon.model');

  const {
    landId,
    geoJson,
    kmlCID,
    areaSqm,
    surveyCode,
    vertices,
    sourceCRS = 'WGS84',
    bhuvanUrl
  } = params;

  if (!landId)  throw new Error('landId is required to save a polygon');
  if (!geoJson) throw new Error('geoJson is required to save a polygon');

  const doc = await Polygon.findOneAndUpdate(
    { land: landId },
    {
      land:                    landId,
      geoJson,
      mahabhunakshaVertices:   vertices ?? [],
      surveyCode:              surveyCode ?? '',
      areaSqm:                 areaSqm  ?? exports.computeArea(geoJson),
      kmlCID:                  kmlCID   ?? '',
      sourceCRS,
      bhuvanOverlayUrl:        bhuvanUrl ?? '',
      updatedAt:               new Date()
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  logger.info('[geojson] savePolygon – upserted Polygon %s for land %s', doc._id, landId);
  return doc;
};

// ─── Internal helpers ─────────────────────────────────────────────────────────

function _buildKmlDescription(props = {}) {
  if (!props || Object.keys(props).length === 0) return '';
  return Object.entries(props)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n');
}

function _escapeXml(str) {
  return String(str ?? '')
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
    .replace(/'/g,  '&apos;');
}