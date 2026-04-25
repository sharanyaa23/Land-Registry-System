/**
 * @file bhuvan.service.js
 * @description This service handles complex external integrations, background tasks, or specific business operations separate from the controller.
 * 
 * NOTE: This file is essential for the backend architecture. 
 * It follows the Model-View-Controller (MVC) pattern.
 */

/**
 * Bhuvan Satellite Imagery Service
 *
 * Integrates with ISRO's Bhuvan WMS/WFS APIs to:
 *  1. Serve satellite tile configs to the Leaflet frontend
 *  2. Overlay Mahabhunaksha plot polygons on Bhuvan basemap
 *  3. Fetch cadstral feature data via WFS for a given survey parcel
 *  4. Generate a shareable Bhuvan deep-link URL for a plot boundary
 *
 * Bhuvan WMS endpoint : https://bhuvan-vec2.nrsc.gov.in/bhuvan/wms
 * Bhuvan WFS endpoint : https://bhuvan-vec2.nrsc.gov.in/bhuvan/wfs
 */

const logger = require('../../utils/logger');

// ─── Constants ───────────────────────────────────────────────────────────────

const BHUVAN_WMS_BASE = 'https://bhuvan-vec2.nrsc.gov.in/bhuvan/wms';
const BHUVAN_WFS_BASE = 'https://bhuvan-vec2.nrsc.gov.in/bhuvan/wfs';

/**
 * Bhuvan layer catalogue for Maharashtra land records.
 * Each entry maps to a published WMS layer name on the Bhuvan server.
 */
const MAHARASHTRA_LAYERS = [
  { id: 'india3',        name: 'India Satellite (Cartosat)',  description: 'High-res Cartosat satellite imagery' },
  { id: 'mh_village',   name: 'Maharashtra Villages',         description: 'Village boundary layer' },
  { id: 'mh_taluka',    name: 'Maharashtra Talukas',           description: 'Taluka boundary layer' },
  { id: 'mh_district',  name: 'Maharashtra Districts',         description: 'District boundary layer' },
  { id: 'mh_cadastral', name: 'Maharashtra Cadastral',         description: 'Survey/plot cadastral layer' }
];

// Small buffer in decimal degrees added around a bbox to give visual padding
// 0.001° ≈ 111 m at the equator, suitable for field-level plots
const DEFAULT_BBOX_BUFFER = 0.001;

// ─── WMS helpers ─────────────────────────────────────────────────────────────

/**
 * Build a Bhuvan WMS GetMap URL for a specific bounding box.
 * Used server-side to pre-compute a static image URL for thumbnails/previews.
 *
 * @param {Object} options
 * @param {string}  options.layer   - Bhuvan WMS layer name (default: 'india3')
 * @param {string}  options.bbox    - "minLng,minLat,maxLng,maxLat" in EPSG:4326
 * @param {number}  options.width   - Output image width in px (default: 256)
 * @param {number}  options.height  - Output image height in px (default: 256)
 * @param {string}  options.srs     - Spatial reference system (default: 'EPSG:4326')
 * @param {string}  options.format  - Image MIME type (default: 'image/png')
 * @returns {string} Full WMS GetMap URL
 */
exports.buildWmsTileUrl = (options = {}) => {
  const {
    layer  = 'india3',
    bbox,
    width  = 256,
    height = 256,
    srs    = 'EPSG:4326',
    format = 'image/png'
  } = options;

  if (!bbox) throw new Error('Bounding box (bbox) is required for buildWmsTileUrl');

  const params = new URLSearchParams({
    service:     'WMS',
    version:     '1.1.1',
    request:     'GetMap',
    layers:      layer,
    bbox,
    width:       String(width),
    height:      String(height),
    srs,
    format,
    transparent: 'true'
  });

  const url = `${BHUVAN_WMS_BASE}?${params.toString()}`;
  logger.debug('[bhuvan] buildWmsTileUrl →', url);
  return url;
};

/**
 * Return Leaflet-compatible WMS tile layer config for the frontend.
 * The frontend passes this directly into L.tileLayer.wms().
 *
 * @param {string} layer - Bhuvan layer id (default: 'india3')
 * @returns {Object} Leaflet WMS tile layer config object
 */
exports.getLeafletConfig = (layer = 'india3') => {
  return {
    url:  BHUVAN_WMS_BASE,
    type: 'wms',
    options: {
      layers:      layer,
      format:      'image/png',
      transparent: true,
      attribution: '© ISRO Bhuvan',
      maxZoom:     19,
      tileSize:    256
    }
  };
};

/**
 * Return the full layer catalogue for Maharashtra.
 * Exposed on GET /api/v1/polygon/bhuvan-layers so the frontend
 * can populate a layer-switcher dropdown.
 *
 * @returns {Array<{id, name, description}>}
 */
exports.getMaharashtraLayers = () => MAHARASHTRA_LAYERS;

// ─── Bbox helpers ─────────────────────────────────────────────────────────────

/**
 * Derive a WGS-84 bounding box string from a GeoJSON Polygon or Feature.
 * A configurable buffer is added on all sides so the plot is not flush
 * against the tile edge.
 *
 * @param {Object} geoJson  - GeoJSON Feature or Polygon geometry
 * @param {number} [buffer] - Buffer in decimal degrees (default: 0.001)
 * @returns {string} "minLng,minLat,maxLng,maxLat"
 */
exports.bboxFromGeoJson = (geoJson, buffer = DEFAULT_BBOX_BUFFER) => {
  const coords =
    geoJson.type === 'Feature'
      ? geoJson.geometry.coordinates[0]
      : geoJson.coordinates[0];

  if (!coords || coords.length === 0) {
    throw new Error('No coordinates found in GeoJSON for bbox computation');
  }

  let minLng = Infinity,  minLat = Infinity;
  let maxLng = -Infinity, maxLat = -Infinity;

  for (const [lng, lat] of coords) {
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }

  return `${minLng - buffer},${minLat - buffer},${maxLng + buffer},${maxLat + buffer}`;
};

/**
 * Compute the geographic centre [lng, lat] of a GeoJSON polygon.
 * Used to initialise the Leaflet map view when sending config to frontend.
 *
 * @param {Object} geoJson - GeoJSON Feature or Polygon geometry
 * @returns {{ lat: number, lng: number }}
 */
exports.centreFromGeoJson = (geoJson) => {
  const coords =
    geoJson.type === 'Feature'
      ? geoJson.geometry.coordinates[0]
      : geoJson.coordinates[0];

  if (!coords || coords.length === 0) throw new Error('No coordinates for centroid');

  const n   = coords.length;
  const sum = coords.reduce(([sLng, sLat], [lng, lat]) => [sLng + lng, sLat + lat], [0, 0]);
  return { lng: sum[0] / n, lat: sum[1] / n };
};

// ─── Mahabhunaksha vertex → Bhuvan overlay ───────────────────────────────────

/**
 * Build the complete Bhuvan map config required by the frontend to render
 * a Mahabhunaksha plot polygon on top of the ISRO satellite basemap.
 *
 * Flow:
 *   mahabhunaksha.service → coordinateTransform.service → geojson.service
 *   → HERE → frontend Leaflet component
 *
 * @param {Object} geoJson         - WGS-84 GeoJSON polygon of the plot
 * @param {Object} [meta]          - Optional plot metadata to embed in popup
 * @param {string} [meta.plotNo]   - e.g. "100"
 * @param {string} [meta.surveyCode] - e.g. "CM7EBD9U8M7H0"
 * @param {string} [meta.village]
 * @param {string} [meta.taluka]
 * @param {string} [meta.district]
 * @param {string} [meta.area]     - Human-readable area string e.g. "0.45 ha"
 * @param {string} [baseLayer]     - Bhuvan WMS layer to use as basemap
 * @returns {Object} Leaflet-ready map config payload
 */
exports.buildOverlayConfig = (geoJson, meta = {}, baseLayer = 'india3') => {
  if (!geoJson) throw new Error('GeoJSON polygon is required for overlay config');

  const bbox   = exports.bboxFromGeoJson(geoJson);
  const centre = exports.centreFromGeoJson(geoJson);

  // Extract [lat, lng] array for Leaflet polygon (note: Leaflet uses [lat,lng])
  const rawCoords =
    geoJson.type === 'Feature'
      ? geoJson.geometry.coordinates[0]
      : geoJson.coordinates[0];

  const leafletLatLngs = rawCoords.map(([lng, lat]) => [lat, lng]);

  // Build popup HTML string for the plot marker
  const popupHtml = _buildPopupHtml(meta);

  logger.info('[bhuvan] buildOverlayConfig – plot %s, centre %o', meta.plotNo, centre);

  return {
    centre,                           // { lat, lng } – map.setView target
    zoom:        17,                  // good default for field-level cadastral
    bbox,                             // precomputed bbox string
    basemap: exports.getLeafletConfig(baseLayer),
    plotPolygon: {
      latLngs:       leafletLatLngs, // ready for L.polygon(latLngs)
      style: {
        color:       '#FF6B00',       // orange boundary – stands out on satellite
        weight:      2.5,
        opacity:     1,
        fillColor:   '#FF6B00',
        fillOpacity: 0.15
      },
      popupHtml
    },
    // Thumbnail WMS URL (256×256) for list cards / PDF thumbnails
    thumbnailUrl: exports.buildWmsTileUrl({ layer: baseLayer, bbox, width: 400, height: 400 }),
    meta
  };
};

// ─── WFS feature fetch ────────────────────────────────────────────────────────

/**
 * Fetch cadastral feature data from Bhuvan WFS for a given bounding box.
 * Returns raw GeoJSON FeatureCollection from the server.
 *
 * NOTE: Bhuvan WFS requires an institutional login for most layers.
 *       The BHUVAN_WFS_KEY env var must be set if authentication is needed.
 *       If the layer is publicly accessible, no key is required.
 *
 * @param {string} bbox       - "minLng,minLat,maxLng,maxLat"
 * @param {string} typeName   - WFS feature type / layer name
 * @returns {Promise<Object>} GeoJSON FeatureCollection
 */
exports.fetchWfsFeatures = async (bbox, typeName = 'mh_cadastral') => {
  const fetch = require('node-fetch');

  const params = new URLSearchParams({
    service:      'WFS',
    version:      '1.1.0',
    request:      'GetFeature',
    typeName,
    outputFormat: 'application/json',
    srsName:      'EPSG:4326',
    bbox:         `${bbox},EPSG:4326`
  });

  const key = process.env.BHUVAN_WFS_KEY;
  if (key) params.append('key', key);

  const url = `${BHUVAN_WFS_BASE}?${params.toString()}`;
  logger.info('[bhuvan] fetchWfsFeatures → %s', url);

  try {
    const res = await fetch(url, { timeout: 15000 });
    if (!res.ok) {
      throw new Error(`Bhuvan WFS returned HTTP ${res.status}: ${res.statusText}`);
    }
    const data = await res.json();
    logger.info('[bhuvan] WFS returned %d features', data?.features?.length ?? 0);
    return data;
  } catch (err) {
    logger.error('[bhuvan] WFS fetch failed: %s', err.message);
    throw err;
  }
};

// ─── Bhuvan deep-link ─────────────────────────────────────────────────────────

/**
 * Generate a shareable Bhuvan portal deep-link URL that opens the map
 * centred on the given plot with the cadastral layer active.
 *
 * The Bhuvan portal accepts #lat/lng/zoom hash parameters.
 *
 * @param {Object} geoJson - WGS-84 GeoJSON polygon
 * @param {string} [layer] - Bhuvan layer id
 * @returns {string} Bhuvan portal URL
 */
exports.buildDeepLink = (geoJson, layer = 'india3') => {
  const { lat, lng } = exports.centreFromGeoJson(geoJson);
  const zoom = 17;
  return `https://bhuvan.nrsc.gov.in/bhuvan2d/bhuvan2d.php#${lat}/${lng}/${zoom}/${layer}`;
};

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Build the HTML string rendered inside the Leaflet popup for the plot.
 *
 * @param {Object} meta
 * @returns {string}
 */
function _buildPopupHtml(meta = {}) {
  const rows = [
    meta.plotNo     && `<tr><td>Plot No</td><td><strong>${meta.plotNo}</strong></td></tr>`,
    meta.surveyCode && `<tr><td>Survey Code</td><td><code>${meta.surveyCode}</code></td></tr>`,
    meta.village    && `<tr><td>Village</td><td>${meta.village}</td></tr>`,
    meta.taluka     && `<tr><td>Taluka</td><td>${meta.taluka}</td></tr>`,
    meta.district   && `<tr><td>District</td><td>${meta.district}</td></tr>`,
    meta.area       && `<tr><td>Area</td><td>${meta.area}</td></tr>`
  ].filter(Boolean).join('');

  return `
    <div style="font-family:sans-serif;font-size:13px;min-width:180px">
      <p style="margin:0 0 6px;font-weight:700;font-size:14px;color:#FF6B00">
        Plot ${meta.plotNo || '—'}
      </p>
      <table style="border-collapse:collapse;width:100%">
        <tbody>${rows}</tbody>
      </table>
    </div>
  `.trim();
}