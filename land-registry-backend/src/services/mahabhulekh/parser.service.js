/**
 * @file parser.service.js
 * @description This service handles complex external integrations, background tasks, or specific business operations separate from the controller.
 * 
 * NOTE: This file is essential for the backend architecture. 
 * It follows the Model-View-Controller (MVC) pattern.
 */

// src/services/mahabhulekh/parser.service.js
const vision = require('@google-cloud/vision');
const path   = require('path');
const logger = require('../../utils/logger');

const client = new vision.ImageAnnotatorClient({
  keyFilename: path.join(__dirname, '../../google-vision-key.json')
});

class ParserService {

  // ─────────────────────────────────────────────
  // PUBLIC: Google Vision entry point
  // Now also extracts vertices from the OCR text
  // ─────────────────────────────────────────────
  async parseWithGoogleVision(imageBuffer) {
    try {
      const [result] = await client.documentTextDetection({
        image: { content: imageBuffer }
      });
      const fullText = result.fullTextAnnotation?.text || '';

      // Parse the 7/12 fields (owners, area etc.)
      const parsed = this.parseOCRText(fullText);

      // Also extract Mahabhunaksha vertices from the same OCR text.
      // The plot report image contains a coordinate table like:
      //   V1  402513.60  2283456.78
      //   V2  402601.23  2283512.34
      // or WGS84:
      //   V1  76.856123  20.524601
      const vertices = this._extractVerticesFromOcrText(fullText);

      // Extract plotNo and surveyCode from OCR text
      const plotNo     = this._extractPlotNoFromText(fullText);
      const surveyCode = this._extractSurveyCodeFromText(fullText);

      logger.info('[parser] parseWithGoogleVision complete', {
        textLen:     fullText.length,
        vertices:    vertices.length,
        plotNo,
        surveyCode,
      });

      return {
        ...parsed,
        vertices,
        plotNo,
        surveyCode,
        rawText:    fullText,
        confidence: 0,
      };
    } catch (error) {
      logger.error('Vision failed', error.message);
      return {
        ...this._emptyResult('vision-error'),
        vertices:   [],
        plotNo:     '',
        surveyCode: '',
      };
    }
  }

  // ─────────────────────────────────────────────
  // PRIVATE: Extract vertices from raw OCR text
  // ─────────────────────────────────────────────

  /**
   * Pulls vertex coordinates out of the OCR text from the plot report image.
   *
   * Handles these formats from Mahabhunaksha plot reports:
   *
   *   SOI projected (large easting/northing):
   *     "V1  402513.60  2283456.78"
   *     "1   402513.60  2283456.78"
   *
   *   WGS84 decimal degrees:
   *     "V1  76.856123  20.524601"
   *     "V1: 76.856123, 20.524601"
   *
   *   The report also prints side lengths like "160.35" and "249.89" —
   *   we filter those out by requiring at least one number with 3+ integer
   *   digits (SOI coords) OR 4+ decimal places (WGS84 coords).
   */
  _extractVerticesFromOcrText(text) {
    if (!text) return [];

    const vertices = [];
    const seen     = new Set();

    const addVertex = (id, rawX, rawY) => {
      // Normalise id: strip leading zeros, ensure V prefix
      const idClean = String(id).replace(/^V?0*/, '');
      const normId  = `V${idClean}`;
      if (seen.has(normId)) return;
      seen.add(normId);
      vertices.push({ id: normId, rawX: rawX.trim(), rawY: rawY.trim() });
    };

    // Strategy 1 — V-prefixed with colon/space separator
    // "V1 : 76.856123, 20.524601"  or  "V1 76.856123 20.524601"
    const vPrefixRegex = /\b(V\d+)\s*[:\-]?\s*(\d{2,}\.\d+)\s*[,\s]+\s*(\d{2,}\.\d+)/gi;
    let m;
    while ((m = vPrefixRegex.exec(text)) !== null) {
      addVertex(m[1], m[2], m[3]);
    }
    if (vertices.length >= 3) {
      logger.info('[parser] Vertices via V-prefix strategy', { count: vertices.length });
      return this._sortVertices(vertices);
    }

    // Strategy 2 — Bare number id with large coordinate values
    // "1  402513.60  2283456.78"
    // Requires: id ≤ 4 digits, at least one coord has 3+ integer digits
    const bareIdRegex = /^\s*(\d{1,2})\s+(\d{3,}\.\d+)\s+(\d{3,}\.\d+)/gm;
    while ((m = bareIdRegex.exec(text)) !== null) {
      addVertex(m[1], m[2], m[3]);
    }
    if (vertices.length >= 3) {
      logger.info('[parser] Vertices via bare-id + large-coord strategy', { count: vertices.length });
      return this._sortVertices(vertices);
    }

    // Strategy 3 — Flexible: any pair where at least one number has 3+ int digits
    // or 4+ decimal places, preceded by a small integer (vertex id)
    const flexRegex = /\b(\d{1,2})\b\s+(\d{3,}\.\d+|\d+\.\d{4,})\s+(\d{3,}\.\d+|\d+\.\d{4,})/g;
    while ((m = flexRegex.exec(text)) !== null) {
      addVertex(m[1], m[2], m[3]);
    }
    if (vertices.length >= 3) {
      logger.info('[parser] Vertices via flex strategy', { count: vertices.length });
      return this._sortVertices(vertices);
    }

    logger.warn('[parser] No vertices found in OCR text', {
      snippet: text.slice(0, 400),
    });
    return [];
  }

  _sortVertices(vertices) {
    return vertices.sort((a, b) => {
      const na = parseInt(a.id.replace('V', ''), 10);
      const nb = parseInt(b.id.replace('V', ''), 10);
      return na - nb;
    });
  }

  _extractPlotNoFromText(text) {
    if (!text) return '';
    // "Plot No: 100"  "Plot No.100"  "Plot No 100"
    const m = text.match(/plot\s*no[.\s:]*(\d+)/i) ||
              text.match(/gat\s*no[.\s:]*(\d+)/i);
    return m ? m[1] : '';
  }

  _extractSurveyCodeFromText(text) {
    if (!text) return '';
    // Alphanumeric codes like "7CM8ZRD9U8ZZH0"
    const m = text.match(/\b([A-Z0-9]{8,16})\b/g);
    if (!m) return '';
    // Return the first one that looks like a survey code (mix of letters and digits)
    return m.find(c => /[A-Z]/.test(c) && /\d/.test(c)) || '';
  }

  // ─────────────────────────────────────────────
  // PUBLIC: Main OCR text parser (7/12 Mahabhulekh)
  // ─────────────────────────────────────────────
  parseOCRText(text) {
    const result = this._emptyResult('ocr');
    if (!text) return result;

    const allLines   = text.split(/\r?\n/).map(l => l.trim());
    const cleanLines = allLines.filter(l => l.length > 2);

    const header = this._parseHeader(allLines);
    result.villageName  = header.villageName  || 'अकोला';
    result.talukaName   = header.talukaName   || '';
    result.districtName = header.districtName || '';

    result.surveyNumber = this._parseSurveyNumber(cleanLines);
    result.encumbrances = this._parseEncumbrances(cleanLines);

    const binShetiArea    = this._extractBinShetiArea(cleanLines);
    const tableAreaValues = [];
    const owners          = this._parseOwnerTable(cleanLines, tableAreaValues);
    result.owners = [...new Set(owners)];
    result.area   = binShetiArea !== null
      ? binShetiArea
      : this._getMostFrequentArea(tableAreaValues);

    logger.info('Parsing completed', {
      ownersFound:  result.owners.length,
      area:         result.area,
      surveyNumber: result.surveyNumber,
    });

    return result;
  }

  // ─────────────────────────────────────────────
  // PRIVATE: 7/12 helpers (unchanged)
  // ─────────────────────────────────────────────
  _parseHeader(lines) {
    const result = { villageName: '', talukaName: '', districtName: '' };
    for (const line of lines) {
      if (!result.villageName) {
        const m = line.match(/गाव\s*[:.\-–]+\s*([\u0900-\u097F]+)/);
        if (m && !/नमुना|सात|बारा/.test(m[1])) result.villageName = m[1];
      }
      if (!result.talukaName) {
        const m = line.match(/तालुका\s*[:.\-–]+\s*([\u0900-\u097F]+)/);
        if (m) result.talukaName = m[1];
      }
      if (!result.districtName) {
        const m = line.match(/जिल्हा\s*[:.\-–]+\s*([\u0900-\u097F]+)/);
        if (m) result.districtName = m[1];
      }
      if (result.villageName && result.talukaName && result.districtName) break;
    }
    return result;
  }

  _parseSurveyNumber(lines) {
    for (const line of lines) {
      if (/गट\s*क्रमांक|उपविभाग/i.test(line)) {
        const m = line.match(/(\d+)\s*[\/\\]\s*([अ-ह०-९a-zA-Z]+)(?:\s*[\/\\]\s*(\d+))?(?:\s*[\/\\]\s*([अ-ह०-९a-zA-Z]+))?/);
        if (m) return this._buildSurveyString(m);
      }
    }
    for (const line of lines) {
      const m = line.match(/(\d+)\s*[\/\\]\s*([अ-ह०-९a-zA-Z]+)(?:\s*[\/\\]\s*(\d+))?(?:\s*[\/\\]\s*([अ-ह०-९a-zA-Z]+))?/);
      if (m) return this._buildSurveyString(m);
    }
    return '';
  }

  _buildSurveyString(m) {
    let s = `${m[1]}/${m[2]}`;
    if (m[3]) s += `/${m[3]}`;
    if (m[4]) s += `/${m[4]}`;
    return s;
  }

  _parseEncumbrances(lines) {
    for (const line of lines) {
      if (/प्रलंबित\s*फेरफार\s*नाही/i.test(line)) return 'नाही';
      if (/फेरफार\s*नाही/i.test(line))             return 'नाही';
    }
    return '';
  }

  _extractBinShetiArea(lines) {
    let anchorIdx = -1;
    for (let i = 0; i < lines.length; i++) {
      if (/बिन\s*शेती/i.test(lines[i])) { anchorIdx = i; break; }
    }
    if (anchorIdx === -1) {
      for (let i = 0; i < lines.length; i++) {
        if (/अकृषिक/i.test(lines[i])) { anchorIdx = i; break; }
      }
    }
    if (anchorIdx === -1) return null;

    const start = Math.max(0, anchorIdx - 5);
    const end   = Math.min(lines.length - 1, anchorIdx + 15);
    for (let j = start; j <= end; j++) {
      const match = lines[j].match(/\b(\d+)\.(\d{2})\.(\d{2})\b/);
      if (match) {
        const ares = parseFloat(`${match[1]}.${match[2]}`);
        if (ares > 0 && ares < 1000) return Number(ares.toFixed(2));
      }
    }
    return null;
  }

  _parseOwnerTable(lines, areaValues) {
    const owners = [];
    let inOwnerSection = false;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/भोगवटादार\s*वर्ग/i.test(line)) { inOwnerSection = true; continue; }
      if (inOwnerSection && this._isPostTableMarker(line)) { inOwnerSection = false; continue; }
      if (!inOwnerSection) continue;
      if (this._isColumnHeader(line)) continue;
      if (/सामाईक\s*क्षे/i.test(line)) continue;
      if (this._isStruckLine(line)) continue;
      if (/^\[?\d+\]?\s*$/.test(line)) continue;
      if (/^\d+\.\d{2}\.\d{2}$/.test(line.trim())) {
        const area = this._extractAreaFromTableRow(line);
        if (area) areaValues.push(area);
        continue;
      }
      const area = this._extractAreaFromTableRow(line);
      if (area) areaValues.push(area);
      const name = this._extractOwnerName(line);
      if (name && this._isLikelyRealName(name)) owners.push(name);
    }
    return owners;
  }

  _isPostTableMarker(line) {
    return (
      /कुळाचे\s*नाव/i.test(line)       ||
      /अहवाल\s*दिनांक/i.test(line)     ||
      /गाव\s*नमुना\s*बारा/i.test(line) ||
      /पिकांची\s*नोंदवही/i.test(line)  ||
      /^सुचना\s*:/i.test(line)
    );
  }

  _isColumnHeader(line) {
    return (
      /^भोगवटादाराचे\s*नांव$/i.test(line) ||
      /^खाते\s*क्र\.?$/i.test(line)        ||
      /^क्षेत्र$/i.test(line)              ||
      /^आकार$/i.test(line)                 ||
      /^पो\.?ख\.?$/i.test(line)            ||
      /^फे\.?\s*फा\.?$/i.test(line)        ||
      /शेताचे\s*स्थानिक\s*नाव/i.test(line) ||
      /क्षेत्र.*आकार/i.test(line)          ||
      /आकार.*पो\.?ख/i.test(line)
    );
  }

  _isStruckLine(line) {
    if (/^\s*\[-/.test(line)) return true;
    if (/^\s*\[[\u0900-\u097F]/.test(line)) return true;
    if (/^\s*-[\u0900-\u097F]/.test(line) && !/सामाईक/i.test(line)) return true;
    if (/^\s*\[.*\]\s*$/.test(line)) return true;
    if (/^\s*\[\s+[\u0900-\u097F]/.test(line)) return true;
    if (/[\u0900-\u097F]-[\u0900-\u097F]/.test(line)) {
      const withoutDash = line.replace(/-/g, ' ').trim();
      const words = withoutDash.split(/\s+/).filter(w => /^[\u0900-\u097F]{2,}$/.test(w));
      if (words.length >= 2 && words.length <= 4) return true;
    }
    if (/रद्द|वगळले|कमी|कट/.test(line)) return true;
    if (/\b0\.00\.00\b/.test(line)) return true;
    return false;
  }

  _extractAreaFromTableRow(line) {
    const indianMatches = line.match(/\b(\d+)\.(\d{2})\.(\d{2})\b/g);
    if (indianMatches) {
      for (const val of indianMatches) {
        const parts = val.split('.');
        const ares = parseFloat(`${parts[0]}.${parts[1]}`);
        if (ares > 0 && ares < 1000) return Number(ares.toFixed(2));
      }
    }
    const decimalMatches = line.match(/\b(\d+)[.:](\d{2})\b/g);
    if (decimalMatches) {
      for (let val of decimalMatches) {
        val = val.replace(':', '.');
        const num = parseFloat(val);
        if (num > 0.5 && num < 500) return Number(num.toFixed(2));
      }
    }
    return null;
  }

  _extractOwnerName(line) {
    return line
      .replace(/\[\d+\]/g, '')
      .replace(/\(\d+\)/g, '')
      .replace(/\b\d+\.?\d*\b/g, '')
      .replace(/[^\u0900-\u097F\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  _isLikelyRealName(name) {
    if (!name || name.length < 6) return false;
    const words = name.trim().split(/\s+/).filter(w => w.length > 1);
    if (words.length < 2 || words.length > 4) return false;
    const devanagariOnly = /^[\u0900-\u097F]{2,}$/;
    for (const word of words) {
      if (!devanagariOnly.test(word)) return false;
    }
    const noiseWords = new Set([
      'खाते', 'क्र', 'आकार', 'पो', 'फे', 'फा', 'क्षेत्र', 'एकक',
      'आकारणी', 'कुळाचे', 'खंड', 'फेरफार', 'दिनांक', 'वर्ष', 'हंगाम',
      'खाता', 'पिकाचा', 'पिकाचे', 'टीप', 'सदरची', 'नोंद', 'मोबाइल',
      'शेताचे', 'स्थानिक', 'सामाईक', 'अहवाल', 'सुचना', 'भोगवटादार',
      'क्रमांक', 'गट', 'अधिकार', 'महसूल', 'तालुका', 'जिल्हा', 'गाव',
      'नमुना', 'उपविभाग', 'जिसके', 'जिसक', 'विनामकसव', 'विनानकसन',
      'राजिनामसच', 'एश्वर्मा', 'बक्तर्मा', 'ऐश्वर्या'
    ]);
    for (const word of words) {
      if (noiseWords.has(word)) return false;
    }
    return true;
  }

  _getMostFrequentArea(values) {
    if (!values.length) return '';
    const freq = {};
    values.forEach(v => {
      const key = Number(v.toFixed(2));
      freq[key] = (freq[key] || 0) + 1;
    });
    let best = 0, maxCount = 0;
    Object.keys(freq).forEach(k => {
      const count = freq[k];
      const val   = parseFloat(k);
      if (count > maxCount || (count === maxCount && val > best)) {
        maxCount = count; best = val;
      }
    });
    return best;
  }

  _emptyResult(source) {
    return {
      owners: [], area: '', encumbrances: '', surveyNumber: '',
      villageName: '', talukaName: '', districtName: '', rawText: '', source
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MAHABHUNAKSHA PARSING METHODS
  // ═══════════════════════════════════════════════════════════════════════════

  parseMahabhunakshaLayerReport(rawHtml) {
    if (!rawHtml) return this._emptyMahabhunakshaResult('no-html');

    const text  = this._stripHtmlTags(rawHtml);
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);

    const result      = this._emptyMahabhunakshaResult('layer-report');
    result.plotNo     = this._extractPlotNo(lines);
    result.surveyCode = this._extractSurveyCode(lines);
    result.vertices   = this._extractVertices(rawHtml, text, lines);
    result.measurements = this._extractMeasurements(lines);
    result.rawText    = text;

    logger.info('[parser] parseMahabhunakshaLayerReport', {
      plotNo:      result.plotNo,
      surveyCode:  result.surveyCode,
      vertexCount: result.vertices.length,
    });

    return result;
  }

  parseMahabhunakshaWfsFeature(featureJson) {
    if (!featureJson) return this._emptyMahabhunakshaResult('no-json');
    const result = this._emptyMahabhunakshaResult('wfs-feature');
    try {
      const feature = featureJson.type === 'FeatureCollection'
        ? featureJson.features?.[0]
        : featureJson;
      if (!feature) return result;

      const props = feature.properties || {};
      result.plotNo = String(
        props.plotno ?? props.plot_no ?? props.PLOTNO ??
        props.gat_no ?? props.GAT_NO  ?? props.survey_no ?? ''
      );
      result.surveyCode = String(
        props.parcel_id ?? props.PARCEL_ID ?? props.survey_code ??
        props.SURVEY_CODE ?? props.uid ?? props.UID ?? ''
      );
      if (feature.geometry?.type === 'Polygon') {
        const ring = feature.geometry.coordinates[0] || [];
        result.vertices = ring.slice(0, -1).map((coord, idx) => ({
          id:   `V${idx + 1}`,
          rawX: String(coord[0]),
          rawY: String(coord[1])
        }));
      }
      result.rawText = JSON.stringify(props);
    } catch (err) {
      logger.error('[parser] parseMahabhunakshaWfsFeature error: %s', err.message);
    }
    return result;
  }

  // ─────────────────────────────────────────────
  // MAHABHUNAKSHA PRIVATE HELPERS
  // ─────────────────────────────────────────────

  _extractPlotNo(lines) {
    for (const line of lines) {
      const mEn = line.match(/(?:plot\s*no|gat\s*no|survey\s*no)[^\d]*(\d+)/i);
      if (mEn) return mEn[1];
      const mMr = line.match(/(?:गट\s*क्र|भूमापन\s*क्र)[^\d]*(\d+)/i);
      if (mMr) return mMr[1];
    }
    for (const line of lines) {
      if (/^\d{1,4}$/.test(line.trim())) return line.trim();
    }
    return '';
  }

  _extractSurveyCode(lines) {
    const codeRegex = /\b([A-Z]{2}[A-Z0-9]{6,14})\b/;
    for (const line of lines) {
      const m = line.match(codeRegex);
      if (m && !this._isKnownNonCode(m[1])) return m[1];
    }
    return '';
  }

  _isKnownNonCode(str) {
    const knownLabels = new Set([
      'DISTRICT', 'VILLAGE', 'TALUKA', 'MAHARASHTRA',
      'PLOTNO', 'SURVEY', 'FEATURE', 'POLYGON'
    ]);
    return knownLabels.has(str.toUpperCase());
  }

  _extractVertices(rawHtml, text, lines) {
    const vertices = [];
    const seen     = new Set();

    const addVertex = (id, rawX, rawY) => {
      const normId = /^V/i.test(id) ? id.toUpperCase() : `V${id}`;
      if (!seen.has(normId)) {
        seen.add(normId);
        vertices.push({ id: normId, rawX: rawX.trim(), rawY: rawY.trim() });
      }
    };

    // Strategy 0: plain text — large coords or high-precision decimals
    const plainVertexRegex = /\b(V?\d+)\s*[:\-]?\s*(\d{3,}\.\d+|\d+\.\d{4,})\s*[,\s]+(\d{3,}\.\d+|\d+\.\d{4,})/gi;
    let pv;
    while ((pv = plainVertexRegex.exec(text)) !== null) {
      addVertex(pv[1], pv[2], pv[3]);
    }
    if (vertices.length > 0) {
      logger.info('[parser] Vertices via Strategy 0 (plain-text)', { count: vertices.length });
      return vertices;
    }

    // Strategy A: HTML table rows
    const tableRowRegex = /<tr[^>]*>[\s\S]*?<\/tr>/gi;
    const cellRegex     = /<td[^>]*>(.*?)<\/td>/gi;
    let tableMatch;
    while ((tableMatch = tableRowRegex.exec(rawHtml)) !== null) {
      const row   = tableMatch[0];
      const cells = [];
      let cellMatch;
      cellRegex.lastIndex = 0;
      while ((cellMatch = cellRegex.exec(row)) !== null) {
        cells.push(this._stripHtmlTags(cellMatch[1]).trim());
      }
      if (cells.length >= 3 && /^V?\d+$/i.test(cells[0])) {
        addVertex(cells[0], cells[1], cells[2]);
      }
    }
    if (vertices.length > 0) {
      logger.info('[parser] Vertices via Strategy A (HTML table)', { count: vertices.length });
      return vertices;
    }

    // Strategy B: V-prefix lines
    const vertexLineRegex = /\b(V\d+)\s*[:\-]?\s*([\d.]+)\s*[,\s]\s*([\d.]+)/i;
    for (const line of lines) {
      const m = line.match(vertexLineRegex);
      if (m) addVertex(m[1], m[2], m[3]);
    }
    if (vertices.length > 0) {
      logger.info('[parser] Vertices via Strategy B (V-prefix lines)', { count: vertices.length });
      return vertices;
    }

    // Strategy C: onclick attributes
    const onclickRegex = /showInfo\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*['"]?(V\d+)['"]?\s*\)/gi;
    let oc;
    while ((oc = onclickRegex.exec(rawHtml)) !== null) {
      addVertex(oc[3], oc[1], oc[2]);
    }
    if (vertices.length > 0) {
      logger.info('[parser] Vertices via Strategy C (onclick)', { count: vertices.length });
    }

    return vertices;
  }

  _extractMeasurements(lines) {
    const measurements = {};
    let sideIndex = 1;
    const measureRegex = /\b(\d{1,4}\.\d{1,3})\b/g;
    const seen = new Set();
    for (const line of lines) {
      if (/\b\d{2,3}\.\d{4,}\b/.test(line)) continue;
      let m;
      while ((m = measureRegex.exec(line)) !== null) {
        const val = parseFloat(m[1]);
        if (val >= 5 && val <= 2000) {
          const key = val.toFixed(2);
          if (!seen.has(key)) {
            seen.add(key);
            measurements[`side${sideIndex++}`] = val;
          }
        }
      }
    }
    return measurements;
  }

  _stripHtmlTags(html) {
    return (html || '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(?:p|div|tr|li)>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/[ \t]{2,}/g, ' ')
      .trim();
  }

  _emptyMahabhunakshaResult(source) {
    return {
      plotNo: '', surveyCode: '', vertices: [],
      measurements: {}, rawText: '', source
    };
  }
}

module.exports = new ParserService();