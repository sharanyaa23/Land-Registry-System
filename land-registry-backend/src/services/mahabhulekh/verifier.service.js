// src/services/mahabhulekh/verifier.service.js

const { fuzzyMatch, bestMatch } = require('../../utils/fuzzyMatch');
const { convert } = require('../../utils/areaConvert');
const logger = require('../../utils/logger');

/**
 * Configurable verification thresholds.
 */
const DEFAULTS = {
  nameThreshold: 0.8,
  areaTolerancePercent: 0.05,
  encumbranceKeywords: /loan|lien|mortgage|बोजा|कर्ज|गहाण|तारण|कब्जा/i,

  weights: {
    name: 0.4,
    area: 0.4,
    noEncumbrance: 0.2
  },

  autoPassThreshold: 0.8,
  autoFailThreshold: 0.3
};

class VerifierService {
  verify({ input, scraped, options = {} }) {
    const config = {
      ...DEFAULTS,
      ...options,
      weights: { ...DEFAULTS.weights, ...(options.weights || {}) }
    };

    const result = {
      nameMatch: false,
      nameScore: 0,
      nameDetails: [],
      areaMatch: false,
      areaScore: 0,
      areaDetails: {},
      encumbranceFlag: false,
      encumbranceText: '',
      score: 0,
      verdict: 'officer_review',
      flags: [],
      parseSource: scraped.source || 'ocr',
      thresholds: {
        nameThreshold: config.nameThreshold,
        areaTolerance: config.areaTolerancePercent
      }
    };

    // ── Name Matching ─────────────────────────────────────────────────────
    const hasInputName = input.ownerName && input.ownerName.trim().length > 0;
    const hasScrapedOwners = scraped.owners && scraped.owners.length > 0;

    if (hasInputName && hasScrapedOwners) {
      const cleanOwners = scraped.owners.filter(o =>
        o && typeof o === 'string' && o.length > 5 &&
        !/^[\d\s.]+$/.test(o) && !/CDATA|bhumiabhilekh|UpdatePanel/i.test(o)
      );

      if (cleanOwners.length > 0) {
        const { match, score, index } = bestMatch(input.ownerName, cleanOwners);

        result.nameScore = Math.round(score * 10000) / 10000;
        result.nameMatch = score >= config.nameThreshold;

        result.nameDetails = cleanOwners.map((owner, i) => ({
          scrapedName: owner,
          score: Math.round(fuzzyMatch(input.ownerName, owner) * 10000) / 10000,
          isBestMatch: i === index
        }));

        if (!result.nameMatch) {
          result.flags.push(
            `Name mismatch: "${input.ownerName}" vs best match "${match}" (score: ${result.nameScore})`
          );
        }
      } else {
        result.flags.push('Owner name data present but unreadable (OCR noise)');
        result.nameScore = 0.5;
      }
    } else if (!hasInputName) {
      result.flags.push('Owner name not provided in input');
    } else {
      result.flags.push('Owner name not available in scraped data');
    }

    // ── FIXED AREA MATCHING ───────────────────────────────────────────────
    const inputArea = parseFloat(input.area);

    // Safe handling of scraped.area (it can be number, string, or empty)
    let rawScrapedArea = scraped.area ?? '';
    
    // Convert to string safely before any .replace()
    const scrapedAreaStr = String(rawScrapedArea).trim();

    // Extract numeric value (handles "2.8", 2.8, "2.80.00", etc.)
    const areaNumericMatch = scrapedAreaStr
      .replace(/[^\d.]/g, ' ')
      .trim()
      .match(/^[\d.]+/);

    const scrapedAreaRaw = areaNumericMatch ? parseFloat(areaNumericMatch[0]) : NaN;

    if (!isNaN(inputArea) && inputArea > 0 && !isNaN(scrapedAreaRaw) && scrapedAreaRaw > 0) {
      const inputUnit = input.areaUnit || 'sqm';
      let inputAreaSqm = inputArea;
      let scrapedAreaSqm = scrapedAreaRaw;

      try {
        inputAreaSqm = convert(inputArea, inputUnit, 'sqm');
      } catch (e) {
        inputAreaSqm = inputArea;
      }

      // Detect unit from original text (if any)
      let scrapedUnit = 'are';
      if (/चौ\.?\s*मी|sq\.?\s*m/i.test(scrapedAreaStr)) scrapedUnit = 'sqm';
      else if (/एकर|acre/i.test(scrapedAreaStr)) scrapedUnit = 'acre';
      else if (/गुंठा|guntha/i.test(scrapedAreaStr)) scrapedUnit = 'guntha';
      else if (/आर|are\b/i.test(scrapedAreaStr)) scrapedUnit = 'are';

      try {
        scrapedAreaSqm = convert(scrapedAreaRaw, scrapedUnit, 'sqm');
      } catch (e) {
        scrapedAreaSqm = scrapedAreaRaw;
      }

      const diff = Math.abs(inputAreaSqm - scrapedAreaSqm);
      const tolerance = inputAreaSqm * config.areaTolerancePercent;

      result.areaMatch = diff <= tolerance;
      result.areaScore = result.areaMatch ? 1 : Math.max(0, 1 - (diff / inputAreaSqm));
      result.areaScore = Math.round(result.areaScore * 10000) / 10000;

      result.areaDetails = {
        inputArea: Math.round(inputAreaSqm * 100) / 100,
        inputUnit,
        scrapedArea: Math.round(scrapedAreaSqm * 100) / 100,
        scrapedUnit,
        scrapedRaw: scrapedAreaStr,
        diffSqm: Math.round(diff * 100) / 100,
        toleranceSqm: Math.round(tolerance * 100) / 100
      };

      if (!result.areaMatch) {
        result.flags.push(`Area mismatch: ${Math.round(inputAreaSqm)} sqm vs ${Math.round(scrapedAreaSqm)} sqm`);
      }
    } else {
      result.flags.push('Area not available for comparison');
      result.areaScore = 0;
    }

    // ── Encumbrance ───────────────────────────────────────────────────────
    if (scraped.encumbrances && scraped.encumbrances.trim()) {
      result.encumbranceText = scraped.encumbrances;
      result.encumbranceFlag = config.encumbranceKeywords.test(scraped.encumbrances);

      if (result.encumbranceFlag) {
        result.flags.push(`Encumbrance detected: "${scraped.encumbrances.substring(0, 100)}..."`);
      }
    }

    // ── Overall Score & Verdict ───────────────────────────────────────────
    const w = config.weights;
    result.score = 
      (result.nameScore * w.name) +
      (result.areaScore * w.area) +
      (!result.encumbranceFlag ? w.noEncumbrance : 0);
    result.score = Math.round(result.score * 10000) / 10000;

    if (result.nameMatch && result.areaMatch && !result.encumbranceFlag) {
      result.verdict = 'auto_pass';
    } else if (result.score < config.autoFailThreshold) {
      result.verdict = 'auto_fail';
    } else {
      result.verdict = 'officer_review';
    }

    // Graceful handling when OCR data is incomplete
    const bothUnavailable = 
      result.flags.some(f => f.includes('Owner name not available')) &&
      result.flags.some(f => f.includes('Area not available'));

    if (bothUnavailable && result.verdict === 'auto_fail') {
      result.verdict = 'officer_review';
      result.flags.push('Verdict upgraded: insufficient OCR data');
    }

    logger.info('Verification complete', {
      verdict: result.verdict,
      score: result.score,
      nameMatch: result.nameMatch,
      areaMatch: result.areaMatch,
      parseSource: result.parseSource
    });

    return result;
  }
}

module.exports = new VerifierService();