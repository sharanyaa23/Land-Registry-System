// src/services/spatial/mahabhunaksha.service.js

const fs = require('fs');
const scraper = require('../mahabhulekh/scraper.service');
const parser = require('../mahabhulekh/parser.service');
const coordinateTransform = require('./coordinateTransform.service');
const logger = require('../../utils/logger');

class MahabhunakshaService {

  async getPlotDetails(params = {}) {
    const { district, taluka, village, surveyNo, useApiFirst = true } = params;

    if (!district || !taluka || !village || !surveyNo)
      throw new Error('district, taluka, village, and surveyNo are required');

    // FIX 1: Safe default — rawData is never null
    let rawData = { vertices: [], plotInfoEntries: [] };

    // ── Strategy 1: WFS API (fast, usually fails) ──────────────────────────
    if (useApiFirst) {
      logger.info('[MBN Service] Trying API scrape first...');
      try {
        const apiResult = await scraper.scrapeMahabhunakshaViaApi({
          stateCode: 'MH', districtCode: district,
          talukaCode: taluka, villageCode: village, surveyNo,
        });
        if (apiResult.success && apiResult.featureJson) {
          const parsed = parser.parseMahabhunakshaWfsFeature(apiResult.featureJson);
          // Merge safely so defaults are never lost
          rawData = {
            ...rawData,
            ...parsed,
            vertices: parsed.vertices || [],
            plotInfoEntries: parsed.plotInfoEntries || [],
          };
          logger.info('[MBN Service] API scrape succeeded');
        }
      } catch (err) {
        logger.warn('[MBN Service] API scrape threw, falling through:', err.message);
      }
    }

    let scrapeResult = null;

    // ── Strategy 2: Puppeteer UI scrape ────────────────────────────────────
    if (!rawData.vertices.length) {
      logger.info('[MBN Service] Falling back to Puppeteer scrape...');

      scrapeResult = await scraper.scrapeMahabhunaksha({
        district, taluka, village, surveyNo, timeoutMs: 180000,
      });

      if (!scrapeResult.success) {
        throw new Error(`Mahabhunaksha scrape failed: ${scrapeResult.reason}`);
      }

      // ── Step A0: OpenLayers vertices from map canvas (most reliable) ───────
      // FIX 2: Checked FIRST. The duplicate A-1 block that previously appeared
      // before this (and crashed on null rawData) has been removed entirely.
      if (scrapeResult.olVertices?.length >= 3) {

        const isValidOL = scrapeResult.olVertices.every(v => {
          const x = parseFloat(v.rawX);
          const y = parseFloat(v.rawY);

          // Reject tiny values (screen coords / garbage)
          return x > 60 && x < 80 && y > 10 && y < 40;
        });

        if (isValidOL) {
          logger.info('[MBN Service] Using OL vertices from map canvas', {
            count: scrapeResult.olVertices.length,
            crs: scrapeResult.olCRS,
          });

          rawData.vertices = scrapeResult.olVertices;
          rawData.olCRS = scrapeResult.olCRS;
        } else {
          logger.warn('[MBN Service] OL vertices rejected (invalid range)');
        }
      }


      // ── Step A1: Use normalized WFS geometry (BEST SOURCE) ─────────
      if (!rawData.vertices.length && scrapeResult.normalizedCoords?.length >= 3) {

        const validNormalized = scrapeResult.normalizedCoords.filter(c =>
          c != null &&
          c[0] != null && c[1] != null &&
          !isNaN(parseFloat(c[0])) && !isNaN(parseFloat(c[1]))
        );

        if (validNormalized.length >= 3) {
          logger.info('[MBN Service] Using normalized WFS coordinates', {
            count: validNormalized.length
          });
          rawData.vertices = validNormalized.map((c, i) => ({
            id: `V${i + 1}`,
            rawX: String(c[0]),
            rawY: String(c[1])
          }));
          rawData.sourceCRS = 'EPSG:4326';   // ← MOVED inside this block
        } else {
          logger.warn('[MBN Service] normalizedCoords present but all invalid, skipping', {
            sample: JSON.stringify(scrapeResult.normalizedCoords?.slice(0, 2))
          });
          // rawData.vertices stays empty → Step E (bbox fallback) will run
        }
      }

      // ── separate if, not else-if ──────────────────────────────────────────────
      if (!rawData.vertices.length && scrapeResult.interceptedGeometry) {
        logger.warn('[MBN Service] Intercepted geometry exists but not normalized');
      }
      // ── Step A2: Parse HTML layer report ───────────────────────────────────
      // Always parse for metadata; only use vertices if we still have none.
      const htmlForParsing = scrapeResult.mapReportHtml || scrapeResult.infoPanelHtml || '';

      logger.info('[MBN Service] HTML lengths', {
        mapReportHtmlLen: scrapeResult.mapReportHtml?.length ?? 0,
        infoPanelHtmlLen: scrapeResult.infoPanelHtml?.length ?? 0,
      });

      const htmlParsed = parser.parseMahabhunakshaLayerReport(htmlForParsing);

      // Merge metadata — never overwrite values already populated
      rawData.plotNo = rawData.plotNo || htmlParsed.plotNo;
      rawData.surveyCode = rawData.surveyCode || htmlParsed.surveyCode;
      rawData.surveyNumber = rawData.surveyNumber || htmlParsed.surveyNumber;
      rawData.villageName = rawData.villageName || htmlParsed.villageName;
      rawData.talukaName = rawData.talukaName || htmlParsed.talukaName;
      rawData.districtName = rawData.districtName || htmlParsed.districtName;
      rawData.owners = rawData.owners?.length ? rawData.owners : (htmlParsed.owners || []);
      rawData.area = rawData.area || htmlParsed.area;
      rawData.encumbrances = rawData.encumbrances || htmlParsed.encumbrances;
      rawData.measurements = rawData.measurements || htmlParsed.measurements || {};
      rawData.rawText = rawData.rawText || htmlParsed.rawText;

      if (!rawData.vertices.length && htmlParsed.vertices?.length) {
        rawData.vertices = htmlParsed.vertices;
        logger.info('[MBN Service] Vertices from HTML layer report', {
          count: rawData.vertices.length,
        });
      }

      rawData.plotInfoEntries = scrapeResult.plotInfoEntries || [];

      if (rawData.plotInfoEntries.length > 20) {
        logger.warn('[MBN Service] Suspiciously large plotInfoEntries — likely full-page parse, discarding', {
          count: rawData.plotInfoEntries.length,
        });
        rawData.plotInfoEntries = [];
      }
      // ── Step B: OCR screenshot if still no vertices ────────────────────────
      if (!rawData.vertices.length && scrapeResult.screenshotPath) {
        logger.info('[MBN Service] No vertices from HTML — trying OCR on screenshot', {
          screenshotPath: scrapeResult.screenshotPath,
        });

        try {
          const imageBuffer = fs.readFileSync(scrapeResult.screenshotPath);
          const ocrResult = await parser.parseWithGoogleVision(imageBuffer);

          logger.info('[MBN Service] OCR result', {
            rawTextLen: ocrResult.rawText?.length ?? 0,
            vertexCount: ocrResult.vertices?.length ?? 0,
          });

          if (ocrResult.vertices?.length) {
            rawData.vertices = ocrResult.vertices;
            logger.info('[MBN Service] Vertices extracted via OCR', {
              count: rawData.vertices.length,
            });
          } else {
            // Also try running raw OCR text through the layer-report parser
            const ocrParsed = parser.parseMahabhunakshaLayerReport(
              `<pre>${ocrResult.rawText}</pre>`
            );
            if (ocrParsed.vertices?.length) {
              rawData.vertices = ocrParsed.vertices;
              logger.info('[MBN Service] Vertices extracted via OCR + layer-report parser', {
                count: rawData.vertices.length,
              });
            } else {
              logger.warn('[MBN Service] OCR ran but still no vertices', {
                rawTextSnippet: ocrResult.rawText?.slice(0, 500),
              });
            }
          }

          // Back-fill other fields from OCR if missing
          if (!rawData.plotNo && ocrResult.plotNo) rawData.plotNo = ocrResult.plotNo;
          if (!rawData.surveyCode && ocrResult.surveyCode) rawData.surveyCode = ocrResult.surveyCode;

        } catch (ocrErr) {
          logger.error('[MBN Service] OCR failed:', ocrErr.message);
        }
      }

      // ── Step C: Back-fill owners / area / plotNo from plotInfoEntries ──────
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
        screenshotPath: scrapeResult.screenshotPath,
        plotInfoEntries: rawData.plotInfoEntries.length,
        vertices: rawData.vertices.length,
        plotNo: rawData.plotNo,
      });

      if (!rawData.vertices.length) {
        logger.warn('[MBN Service] Still no vertices after all strategies', {
          htmlSnippet: htmlForParsing.slice(0, 600),
        });
      }
    }

    // ── Step D: HARD FALLBACK — Generate polygon from map bounds ─────────
    if (!rawData.vertices.length && scrapeResult.mapBounds) {
      logger.warn('[MBN Service] Using fallback: map bounds polygon');
      const b = scrapeResult.mapBounds;
      rawData.vertices = [
        { id: 'V1', rawX: String(b.minX), rawY: String(b.minY) },
        { id: 'V2', rawX: String(b.maxX), rawY: String(b.minY) },
        { id: 'V3', rawX: String(b.maxX), rawY: String(b.maxY) },
        { id: 'V4', rawX: String(b.minX), rawY: String(b.maxY) },
        { id: 'V5', rawX: String(b.minX), rawY: String(b.minY) }
      ];
      rawData.sourceCRS = scrapeResult.olCRS || 'EPSG:3857';
    }

    // ── Step E: EXTENT FALLBACK — getExtentGeoref bbox (WGS84, official) ──
    if (!rawData.vertices.length && scrapeResult.interceptedExtent) {
      const ext = scrapeResult.interceptedExtent;
      const xmin = parseFloat(ext.xmin);
      const ymin = parseFloat(ext.ymin);
      const xmax = parseFloat(ext.xmax);
      const ymax = parseFloat(ext.ymax);

      const validExtent =
        !isNaN(xmin) && !isNaN(ymin) && !isNaN(xmax) && !isNaN(ymax) &&
        xmin > 60 && xmax < 100 && ymin > 8 && ymax < 38 && // within India bbox
        xmax > xmin && ymax > ymin;

      if (validExtent) {
        logger.warn('[MBN Service] Using getExtentGeoref bbox as polygon fallback', {
          xmin, ymin, xmax, ymax
        });

        rawData.vertices = [
          { id: 'V1', rawX: String(xmin), rawY: String(ymin) },
          { id: 'V2', rawX: String(xmax), rawY: String(ymin) },
          { id: 'V3', rawX: String(xmax), rawY: String(ymax) },
          { id: 'V4', rawX: String(xmin), rawY: String(ymax) },
          { id: 'V5', rawX: String(xmin), rawY: String(ymin) },  // close ring
        ];

        rawData.sourceCRS = 'EPSG:4326';
        rawData.bboxFallback = true;

        // Back-fill from interceptedPlotInfo if still missing
        if (!rawData.area && scrapeResult.interceptedPlotInfo?.area) {
          rawData.area = scrapeResult.interceptedPlotInfo.area;
        }
        if (!rawData.plotNo && scrapeResult.interceptedPlotInfo?.plotno) {
          rawData.plotNo = String(scrapeResult.interceptedPlotInfo.plotno);
        }
      } else {
        logger.warn('[MBN Service] interceptedExtent out of India range, skipping', {
          xmin, ymin, xmax, ymax
        });
      }
    }
    // ── CRS transform ──────────────────────────────────────────────────────
    let transformedVertices = [];
    let sourceCRS = 'WGS84';

    if (rawData.vertices.length) {
      transformedVertices = await coordinateTransform.transformVertices(
        rawData.vertices,
        rawData.olCRS || rawData.sourceCRS || ''
      );
      sourceCRS = transformedVertices[0]?.sourceCRS || 'WGS84';
    } else {
      logger.warn('[MBN Service] No vertices found — returning partial result');
    }

    return this._buildResult(rawData, transformedVertices, sourceCRS);
  }

  _buildResult(rawData, vertices, sourceCRS) {
    const result = {
      plotNo: rawData.plotNo || '',
      surveyCode: rawData.surveyCode || '',
      surveyNumber: rawData.surveyNumber || '',
      villageName: rawData.villageName || '',
      talukaName: rawData.talukaName || '',
      districtName: rawData.districtName || '',
      owners: rawData.owners || [],
      area: rawData.area || '',
      encumbrances: rawData.encumbrances || '',
      plotInfoEntries: rawData.plotInfoEntries || [],
      vertices,
      measurements: rawData.measurements || {},
      rawText: rawData.rawText || '',
      sourceCRS,
      screenshotPath: rawData.screenshotPath || null,
      bboxFallback: rawData.bboxFallback || false,
    };

    logger.info('[MBN Service] Plot details processed', {
      plotNo: result.plotNo,
      vertexCount: result.vertices.length,
      plotInfoEntries: result.plotInfoEntries.length,
      owners: result.owners.length,
    });

    return result;
  }

  async processScrapeJob(jobData) {
    return this.getPlotDetails(jobData);
  }
}

module.exports = new MahabhunakshaService();