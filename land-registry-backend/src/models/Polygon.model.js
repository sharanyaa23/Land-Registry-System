/**
 * @file Polygon.model.js
 * @description This model defines the MongoDB schema and database structure for the application.
 * 
 * NOTE: This file is essential for the backend architecture. 
 * It follows the Model-View-Controller (MVC) pattern.
 */

const mongoose = require('mongoose');
const { Schema } = mongoose;

const polygonSchema = new Schema({
  land: { 
    type: Schema.Types.ObjectId, 
    ref: 'Land', 
    required: true 
  },

  geoJson: { 
    type: Object, 
    required: true 
  },   // GeoJSON Feature<Polygon> in WGS84

  areaSqm: { 
    type: Number 
  },   // computed from polygon via @turf/area

  source: {
    type: String,
    enum: ['user_drawn', 'bhuvan_import', 'mahabhunaksha'],
    default: 'user_drawn'
  },

  ipfsCID: String,                              // pinned GeoJSON on IPFS (optional legacy)

  // ─────────────────────────────────────────────────────────────
  // MAHABHUNAKSHA SPECIFIC FIELDS (NEW)
  // ─────────────────────────────────────────────────────────────
  mahabhunakshaVertices: [{
    id: String,           // V1, V2, V3, ...
    lat: Number,
    lng: Number,
    rawX: String,         // original value from Mahabhunaksha portal
    rawY: String,
    sourceCRS: String     // "WGS84" or "SOI_EVEREST"
  }],

  surveyCode: { 
    type: String, 
    index: true 
  },   // e.g. "CM7EBD9U8M7H0" — unique parcel identifier from Mahabhunaksha

  // Bhuvan Integration
  bhuvanOverlayUrl: String,     // Rendered tile URL or Bhuvan deep-link with overlay
  kmlCID: String,               // IPFS CID of exported KML file (for Bhuvan upload)

  sourceCRS: { 
    type: String, 
    enum: ['WGS84', 'SOI_EVEREST', 'PROJECTED', 'UNKNOWN'],
    default: 'WGS84'
  },

  // Spatial validation warnings (advisory only)
  warnings: [{
    type: {
      type: String,
      enum: ['overlap', 'area_mismatch', 'boundary_irregular', 'crs_conversion_issue']
    },
    severity: {
      type: String,
      enum: ['info', 'warning', 'critical'],
      default: 'info'
    },
    message: String,
    data: Schema.Types.Mixed
  }],

  skipped: { 
    type: Boolean, 
    default: false 
  },    // true if area < 500 sqm (or other business rule)

  // Metadata from Mahabhunaksha
  plotNo: String,               // e.g. "100" or "Gat No 45"
  measurements: Schema.Types.Mixed,   // side lengths { side1: 160.35, side2: 249.89, ... }

  // Debugging / Audit
  scrapedAt: Date,              // When Mahabhunaksha data was scraped
  screenshotPath: String,       // Path to debug screenshot (optional, for dev)
  lastBhuvanSync: Date,         // Last time Bhuvan overlay was generated

}, {
  timestamps: true
});

// ─── Indexes ───────────────────────────────────────────────────────────────
polygonSchema.index({ land: 1 });
polygonSchema.index({ surveyCode: 1 });           // Fast lookup by Mahabhunaksha code
polygonSchema.index({ source: 1, createdAt: -1 });
polygonSchema.index({ 'mahabhunakshaVertices.id': 1 });

// ─── Virtuals (optional but useful) ────────────────────────────────────────
polygonSchema.virtual('hasMahabhunakshaData').get(function() {
  return this.mahabhunakshaVertices && this.mahabhunakshaVertices.length > 0;
});

polygonSchema.virtual('vertexCount').get(function() {
  return this.mahabhunakshaVertices ? this.mahabhunakshaVertices.length : 0;
});

// ─── Pre-save middleware (optional validation) ─────────────────────────────
polygonSchema.pre('save', function() {
  // Auto-set source if Mahabhunaksha vertices exist
  if (this.mahabhunakshaVertices && this.mahabhunakshaVertices.length > 0) {
    this.source = 'mahabhunaksha';
  }

  // Ensure sourceCRS is set
  if (this.mahabhunakshaVertices && this.mahabhunakshaVertices.length > 0 && !this.sourceCRS) {
    this.sourceCRS = this.mahabhunakshaVertices[0].sourceCRS || 'WGS84';
  }
});

module.exports = mongoose.model('Polygon', polygonSchema);