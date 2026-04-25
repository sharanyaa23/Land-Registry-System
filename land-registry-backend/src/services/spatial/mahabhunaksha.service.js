/**
 * @file mahabhunaksha.service.js
 * @description This service handles complex external integrations, background tasks, or specific business operations separate from the controller.
 * 
 * NOTE: This file is essential for the backend architecture. 
 * It follows the Model-View-Controller (MVC) pattern.
 */

// src/services/spatial/mahabhunaksha.service.js
const fs     = require('fs');
const scraper = require('../mahabhulekh/scraper.service');
const parser  = require('../mahabhulekh/parser.service');
const coordinateTransform = require('./coordinateTransform.service');
const logger  = require('../../utils/logger');

class MahabhunakshaService {

  async getPlotDetails(params = {}) {
    const { district, taluka, village, surveyNo, useApiFirst = true } = params;

    if (!district || !taluka || !village || !surveyNo)
      throw new Error('district, taluka, village, and surveyNo are required');

    let rawData = null;

    // ── Strategy 1: WFS API (fast, usually fails) ──────────────────────────
    if (useApiFirst) {
      logger.info('[MBN Service] Trying API scrape first...');
      try {
        const apiResult = await scraper.scrapeMahabhunakshaViaApi({
          stateCode: 'MH', districtCode: district,
          talukaCode: taluka, villageCode: village, surveyNo,
        });
        if (apiResult.success && apiResult.featureJson) {
          rawData = parser.parseMahabhunakshaWfsFeature(apiResult.featureJson);
          logger.info('[MBN Service] API scrape succeeded');
        }
      } catch (err) {
        logger.warn('[MBN Service] API scrape threw, falling through:', err.message);
      }
    }

    // ── Strategy 2: Puppeteer UI scrape ────────────────────────────────────
    if (!rawData || !rawData.vertices?.length) {
      logger.info('[MBN Service] Falling back to Puppeteer scrape...');

      const scrapeResult = await scraper.scrapeMahabhunaksha({
        district, taluka, village, surveyNo, timeoutMs: 180000,
      });

      if (!scrapeResult.success) {
        throw new Error(`Mahabhunaksha scrape failed: ${scrapeResult.reason}`);
      }

      // ── Step A: Try parsing HTML first (fast, works if vertex table is in DOM)
      const htmlForParsing = scrapeResult.mapReportHtml || scrapeResult.infoPanelHtml || '';

      logger.info('[MBN Service] HTML lengths', {
        mapReportHtmlLen: scrapeResult.mapReportHtml?.length  ?? 0,
        infoPanelHtmlLen: scrapeResult.infoPanelHtml?.length  ?? 0,
      });

      rawData = parser.parseMahabhunakshaLayerReport(htmlForParsing);
      rawData.plotInfoEntries = scrapeResult.plotInfoEntries || [];

      // ── Step B: If HTML parsing gave no vertices, OCR the screenshot ──────
      // The PDF is rendered inside an iframe — its content is NOT in the page
      // HTML. The screenshot of the right panel IS the plot boundary map with
      // vertex coordinates printed on it, so we OCR that image.
      if (!rawData.vertices?.length && scrapeResult.screenshotPath) {
        logger.info('[MBN Service] No vertices from HTML — trying OCR on screenshot', {
          screenshotPath: scrapeResult.screenshotPath,
        });

        try {
          const imageBuffer = fs.readFileSync(scrapeResult.screenshotPath);
          const ocrResult   = await parser.parseWithGoogleVision(imageBuffer);

          logger.info('[MBN Service] OCR result', {
            rawTextLen:  ocrResult.rawText?.length ?? 0,
            vertexCount: ocrResult.vertices?.length ?? 0,
          });

          if (ocrResult.vertices?.length) {
            rawData.vertices = ocrResult.vertices;
            logger.info('[MBN Service] Vertices extracted via OCR', {
              count: rawData.vertices.length,
            });
          } else {
            // Also try parsing the raw OCR text through the layer-report parser
            // in case the coordinate format matches those patterns
            const ocrParsed = parser.parseMahabhunakshaLayerReport(
              `<pre>${ocrResult.rawText}</pre>`
            );
            if (ocrParsed.vertices?.length) {
              rawData.vertices = ocrParsed.vertices;
              logger.info('[MBN Service] Vertices extracted via OCR+layer-report parser', {
                count: rawData.vertices.length,
              });
            } else {
              logger.warn('[MBN Service] OCR ran but still no vertices', {
                rawTextSnippet: ocrResult.rawText?.slice(0, 500),
              });
            }
          }

          // Back-fill other fields from OCR if missing
          if (!rawData.plotNo && ocrResult.plotNo)         rawData.plotNo     = ocrResult.plotNo;
          if (!rawData.surveyCode && ocrResult.surveyCode) rawData.surveyCode = ocrResult.surveyCode;

        } catch (ocrErr) {
          logger.error('[MBN Service] OCR failed:', ocrErr.message);
        }
      }

      // ── Step C: Back-fill owners / area / plotNo from plotInfoEntries ─────
      if (!rawData.owners?.length && rawData.plotInfoEntries.length) {
        rawData.owners = rawData.plotInfoEntries
          .map(e => e.ownerName)
          .filter(Boolean);
      }

      if (!rawData.area && rawData.plotInfoEntries.length) {
        const areas = rawData.plotInfoEntries
          .map(e => parseFloat(e.totalArea))
          .filter(v => v > 0);
        if (areas.length) rawData.area = Math.max(...areas);
      }

      if (!rawData.plotNo && rawData.plotInfoEntries.length) {
        rawData.plotNo = rawData.plotInfoEntries[0]?.surveyNo || surveyNo;
      }

      // Store screenshot path so controller can surface it if needed
      rawData.screenshotPath = scrapeResult.screenshotPath || null;

      logger.info('[MBN Service] Puppeteer scrape complete', {
        screenshotPath:  scrapeResult.screenshotPath,
        plotInfoEntries: rawData.plotInfoEntries.length,
        vertices:        rawData.vertices?.length ?? 0,
        plotNo:          rawData.plotNo,
      });

      if (!rawData.vertices?.length) {
        logger.warn('[MBN Service] Still no vertices after all strategies', {
          htmlSnippet: htmlForParsing.slice(0, 600),
        });
      }
    }

    // ── CRS transform ──────────────────────────────────────────────────────
    let transformedVertices = [];
    let sourceCRS = 'WGS84';

    if (rawData.vertices?.length) {
      transformedVertices = await coordinateTransform.transformVertices(rawData.vertices);
      sourceCRS = transformedVertices[0]?.sourceCRS || 'WGS84';
    } else {
      logger.warn('[MBN Service] No vertices found — returning partial result');
    }

    return this._buildResult(rawData, transformedVertices, sourceCRS);
  }

  _buildResult(rawData, vertices, sourceCRS) {
    const result = {
      plotNo:          rawData.plotNo          || '',
      surveyCode:      rawData.surveyCode       || '',
      surveyNumber:    rawData.surveyNumber     || '',
      villageName:     rawData.villageName      || '',
      talukaName:      rawData.talukaName       || '',
      districtName:    rawData.districtName     || '',
      owners:          rawData.owners           || [],
      area:            rawData.area             || '',
      encumbrances:    rawData.encumbrances     || '',
      plotInfoEntries: rawData.plotInfoEntries  || [],
      vertices,
      measurements:    rawData.measurements     || {},
      rawText:         rawData.rawText          || '',
      sourceCRS,
      screenshotPath:  rawData.screenshotPath   || null,
    };

    logger.info('[MBN Service] Plot details processed', {
      plotNo:          result.plotNo,
      vertexCount:     result.vertices.length,
      plotInfoEntries: result.plotInfoEntries.length,
      owners:          result.owners?.length ?? 0,
    });

    return result;
  }

  async processScrapeJob(jobData) {
    return this.getPlotDetails(jobData);
  }
}

module.exports = new MahabhunakshaService();