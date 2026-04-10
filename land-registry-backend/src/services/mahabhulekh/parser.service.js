// src/services/mahabhulekh/parser.service.js
const vision = require('@google-cloud/vision');
const path = require('path');
const logger = require('../../utils/logger');

const client = new vision.ImageAnnotatorClient({
  keyFilename: path.join(__dirname, '../../google-vision-key.json')
});

class ParserService {

  // ─────────────────────────────────────────────
  // PUBLIC: Google Vision entry point
  // ─────────────────────────────────────────────
  async parseWithGoogleVision(imageBuffer) {
    try {
      const [result] = await client.documentTextDetection({
        image: { content: imageBuffer }
      });
      const fullText = result.fullTextAnnotation?.text || '';
      const parsed = this.parseOCRText(fullText);
      return { ...parsed, rawText: fullText, confidence: 0 };
    } catch (error) {
      logger.error('Vision failed', error.message);
      return this._emptyResult('vision-error');
    }
  }

  // ─────────────────────────────────────────────
  // PUBLIC: Main OCR text parser
  // ─────────────────────────────────────────────
  parseOCRText(text) {
    const result = this._emptyResult('ocr');
    if (!text) return result;

    const allLines   = text.split(/\r?\n/).map(l => l.trim());
    const cleanLines = allLines.filter(l => l.length > 2);

    // 1. Header
    const header = this._parseHeader(allLines);
    result.villageName  = header.villageName  || 'अकोला';
    result.talukaName   = header.talukaName   || '';
    result.districtName = header.districtName || '';

    // 2. Survey number
    result.surveyNumber = this._parseSurveyNumber(cleanLines);

    // 3. Encumbrances
    result.encumbrances = this._parseEncumbrances(cleanLines);

    // 4. Area — priority: बिन शेती panel
    const binShetiArea  = this._extractBinShetiArea(cleanLines);

    // 5. Owners + fallback area from table
    const tableAreaValues = [];
    const owners = this._parseOwnerTable(cleanLines, tableAreaValues);
    result.owners = [...new Set(owners)];
    result.area   = binShetiArea !== null
      ? binShetiArea
      : this._getMostFrequentArea(tableAreaValues);

    logger.info('Parsing completed', {
      ownersFound:  result.owners.length,
      area:         result.area,
      surveyNumber: result.surveyNumber,
      villageName:  result.villageName,
      talukaName:   result.talukaName,
      districtName: result.districtName,
      owners:       result.owners
    });

    return result;
  }

  // ─────────────────────────────────────────────
  // PRIVATE: Header — scan all lines for गाव/तालुका/जिल्हा
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

  // ─────────────────────────────────────────────
  // PRIVATE: Survey number
  // ─────────────────────────────────────────────
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

  // ─────────────────────────────────────────────
  // PRIVATE: Encumbrances
  // ─────────────────────────────────────────────
  _parseEncumbrances(lines) {
    for (const line of lines) {
      if (/प्रलंबित\s*फेरफार\s*नाही/i.test(line)) return 'नाही';
      if (/फेरफार\s*नाही/i.test(line))             return 'नाही';
    }
    return '';
  }

  // ─────────────────────────────────────────────
  // PRIVATE: Extract area from बिन शेती panel
  // Wide window scan ±15 lines around anchor
  // ─────────────────────────────────────────────
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

    // ONLY accept X.XX.XX Indian format — never plain decimals or colon values
    // 3:60 is आकारणी (tax), 1.80.00 is the actual area
    for (let j = start; j <= end; j++) {
      const match = lines[j].match(/\b(\d+)\.(\d{2})\.(\d{2})\b/);
      if (match) {
        const ares = parseFloat(`${match[1]}.${match[2]}`);
        if (ares > 0 && ares < 1000) {
          logger.info('Area from बिन शेती panel', { ares, line: lines[j] });
          return Number(ares.toFixed(2));
        }
      }
    }
    return null;
  }

  // ─────────────────────────────────────────────
  // PRIVATE: Parse owner table
  //
  // CRITICAL FIX: The real OCR line order is:
  //   भोगवटादार वर्ग-1          ← section start
  //   खाते क्र. / [6346]        ← column headers / account codes
  //   [राजिनामसच जिसके          ← struck (OCR dropped -)
  //   भोगवटादाराचे नांव         ← column header (NOT exit)
  //   क्षेत्र                   ← column header
  //   -सामाईक क्षे...           ← skip
  //   [-चंद्रकांत विठ्ठलराव    ← struck
  //   आकार / पो.ख.              ← column headers
  //   1.00.00                   ← area line
  //   शेताचे स्थानिक नाव:      ← ⚠️ NOT an exit — appears mid-table in OCR
  //   फे. फा.                   ← column header
  //   [-एश्वर्मा...             ← struck
  //   शोभा दिनकर डिवरे          ← ✅ VALID owner
  //
  // EXIT only on: "कुळाचे नाव", "अहवाल दिनांक", "गाव नमुना बारा", "सुचना"
  // Do NOT exit on: "शेताचे स्थानिक नाव", "भोगवटादाराचे नांव"
  // ─────────────────────────────────────────────
  _parseOwnerTable(lines, areaValues) {
    const owners = [];
    let inOwnerSection = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // ── Enter ──
      if (/भोगवटादार\s*वर्ग/i.test(line)) {
        inOwnerSection = true;
        continue;
      }

      // ── Exit — ONLY these hard markers that appear after the table ──
      if (inOwnerSection && this._isPostTableMarker(line)) {
        inOwnerSection = false;
        continue;
      }

      if (!inOwnerSection) continue;

      // ── Skip pure column header lines ──
      if (this._isColumnHeader(line)) continue;

      // ── Skip सामाईक rows ──
      if (/सामाईक\s*क्षे/i.test(line)) continue;

      // ── Skip struck entries ──
      if (this._isStruckLine(line)) continue;

      // ── Skip bare account number lines: [6346] or 8910 ──
      if (/^\[?\d+\]?\s*$/.test(line)) continue;

      // ── Skip standalone area-only lines (e.g. "1.00.00" on its own) ──
      if (/^\d+\.\d{2}\.\d{2}$/.test(line.trim())) {
        const area = this._extractAreaFromTableRow(line);
        if (area) areaValues.push(area);
        continue;
      }

      // ── Collect area from rows that have both name and area ──
      const area = this._extractAreaFromTableRow(line);
      if (area) areaValues.push(area);

      // ── Extract name ──
      const name = this._extractOwnerName(line);
      if (name && this._isLikelyRealName(name)) {
        owners.push(name);
      }
    }

    return owners;
  }

  // ─────────────────────────────────────────────
  // PRIVATE: True post-table section markers
  // ONLY these reliably appear AFTER the owner table
  // ─────────────────────────────────────────────
  _isPostTableMarker(line) {
    return (
      /कुळाचे\s*नाव/i.test(line)           ||  // कुळ section starts
      /अहवाल\s*दिनांक/i.test(line)         ||  // report date
      /गाव\s*नमुना\s*बारा/i.test(line)     ||  // Form 12 section
      /पिकांची\s*नोंदवही/i.test(line)      ||  // crop register
      /^सुचना\s*:/i.test(line)                  // disclaimer (starts with सुचना:)
    );
  }

  // ─────────────────────────────────────────────
  // PRIVATE: Column header lines to skip (NOT exit triggers)
  // ─────────────────────────────────────────────
  _isColumnHeader(line) {
    return (
      /^भोगवटादाराचे\s*नांव$/i.test(line)  ||
      /^खाते\s*क्र\.?$/i.test(line)         ||
      /^क्षेत्र$/i.test(line)               ||
      /^आकार$/i.test(line)                  ||
      /^पो\.?ख\.?$/i.test(line)             ||
      /^फे\.?\s*फा\.?$/i.test(line)         ||
      /शेताचे\s*स्थानिक\s*नाव/i.test(line)  ||  // label only, never an exit
      /क्षेत्र.*आकार/i.test(line)           ||
      /आकार.*पो\.?ख/i.test(line)
    );
  }

  // ─────────────────────────────────────────────
  // PRIVATE: Struck / cancelled line detection
  //
  // Maharashtra 7/12 patterns:
  //   [-name]   canonical struck
  //   [-name    OCR dropped closing ]
  //   [name     OCR dropped the - (but [ alone = struck)
  // ─────────────────────────────────────────────
  _isStruckLine(line) {
    // Starts with [- (canonical struck format)
    if (/^\s*\[-/.test(line)) return true;

    // Starts with [ + Devanagari char (OCR dropped the dash after [)
    if (/^\s*\[[\u0900-\u097F]/.test(line)) return true;

    // Starts with - + Devanagari (OCR dropped the [)
    if (/^\s*-[\u0900-\u097F]/.test(line) && !/सामाईक/i.test(line)) return true;

    // Entire line is bracketed
    if (/^\s*\[.*\]\s*$/.test(line)) return true;

    
    if (/^\s*\[\s+[\u0900-\u097F]/.test(line)) return true;

    // Dash BETWEEN Devanagari words = OCR rendering of a strikethrough line
    // e.g. "चंद्रकांत-विठ्ठलराव रखने" — the hyphen is actually the struck line
    // Only flag when Devanagari words appear on both sides of the dash
    if (/[\u0900-\u097F]-[\u0900-\u097F]/.test(line)) {
      const withoutDash = line.replace(/-/g, ' ').trim();
      const words = withoutDash.split(/\s+/).filter(w => /^[\u0900-\u097F]{2,}$/.test(w));
      if (words.length >= 2 && words.length <= 4) return true;
    }

    // Explicit cancellation words
    if (/रद्द|वगळले|कमी|कट/.test(line)) return true;

    // Zero area row
    if (/\b0\.00\.00\b/.test(line)) return true;

    return false;
  }

  // ─────────────────────────────────────────────
  // PRIVATE: Extract area from a table row
  // ─────────────────────────────────────────────
  _extractAreaFromTableRow(line) {
    // Priority: X.XX.XX Indian format
    const indianMatches = line.match(/\b(\d+)\.(\d{2})\.(\d{2})\b/g);
    if (indianMatches) {
      for (const val of indianMatches) {
        const parts = val.split('.');
        const ares = parseFloat(`${parts[0]}.${parts[1]}`);
        if (ares > 0 && ares < 1000) return Number(ares.toFixed(2));
      }
    }
    // Fallback: plain decimal
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

  // ─────────────────────────────────────────────
  // PRIVATE: Extract clean Devanagari name
  // ─────────────────────────────────────────────
  _extractOwnerName(line) {
    return line
      .replace(/\[\d+\]/g, '')
      .replace(/\(\d+\)/g, '')
      .replace(/\b\d+\.?\d*\b/g, '')
      .replace(/[^\u0900-\u097F\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // ─────────────────────────────────────────────
  // PRIVATE: Validate extracted name
  // Real Marathi names: 2–4 words, each ≥2 pure Devanagari chars
  // ─────────────────────────────────────────────
  _isLikelyRealName(name) {
    if (!name || name.length < 6) return false;


    const words = name.trim().split(/\s+/).filter(w => w.length > 1);
    if (words.length < 2 || words.length > 4) return false;

    // Every word must be pure Devanagari, ≥2 chars
    const devanagariOnly = /^[\u0900-\u097F]{2,}$/;
    for (const word of words) {
      if (!devanagariOnly.test(word)) return false;
    }

    // Block known noise/label/garbled tokens
    const noiseWords = new Set([
      'खाते', 'क्र', 'आकार', 'पो', 'फे', 'फा', 'क्षेत्र', 'एकक',
      'आकारणी', 'कुळाचे', 'खंड', 'फेरफार', 'दिनांक', 'वर्ष', 'हंगाम',
      'खाता', 'पिकाचा', 'पिकाचे', 'टीप', 'सदरची', 'नोंद', 'मोबाइल',
      'शेताचे', 'स्थानिक', 'सामाईक', 'अहवाल', 'सुचना', 'भोगवटादार', 'क्रमांक', 'गट',
      'अधिकार', 'महसूल', 'तालुका', 'जिल्हा', 'गाव', 'नमुना',"उपविभाग",
      // OCR garbage tokens common in Maharashtra 7/12 struck rows
      'जिसके', 'जिसक', 'विनामकसव', 'विनानकसन', 'राजिनामसच',
      'एश्वर्मा', 'बक्तर्मा', 'ऐश्वर्या'
    ]);

    for (const word of words) {
      if (noiseWords.has(word)) return false;
    }

    return true;
  }

  // ─────────────────────────────────────────────
  // PRIVATE: Most frequent area; on tie prefer larger
  // ─────────────────────────────────────────────
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
        maxCount = count;
        best = val;
      }
    });

    return best;
  }

  // ─────────────────────────────────────────────
  // PRIVATE: Empty result skeleton
  // ─────────────────────────────────────────────
  _emptyResult(source) {
    return {
      owners:       [],
      area:         '',
      encumbrances: '',
      surveyNumber: '',
      villageName:  '',
      talukaName:   '',
      districtName: '',
      rawText:      '',
      source
    };
  }
}

module.exports = new ParserService();