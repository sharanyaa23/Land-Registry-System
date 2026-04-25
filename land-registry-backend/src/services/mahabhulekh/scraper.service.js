/**
 * @file scraper.service.js
 * @description This service handles complex external integrations, background tasks, or specific business operations separate from the controller.
 * 
 * NOTE: This file is essential for the backend architecture. 
 * It follows the Model-View-Controller (MVC) pattern.
 */

// src/services/mahabhulekh/scraper.service.js

const path = require('path');
const puppeteer = require('puppeteer');
const dotenv = require('dotenv');
dotenv.config();

const delay = (ms) => new Promise(res => setTimeout(res, ms));

const LAUNCH_OPTS = {
  headless: false,
  slowMo:   50,
  args:     ['--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security'],
  defaultViewport: { width: 1366, height: 900 },
};

// ─── Mahabhulekh (7/12) constants ────────────────────────────────────────────
const ID = {
  district:          'ContentPlaceHolder1_ddlMainDist',
  taluka:            'ContentPlaceHolder1_ddlTalForAll',
  village:           'ContentPlaceHolder1_ddlVillForAll',
  rbtnSearchTypeCTS: 'ContentPlaceHolder1_rbtnSearchType_0',
  ctsInput:          'ContentPlaceHolder1_txtcsno',
  searchBtn:         'ContentPlaceHolder1_btnsearchfind',
  surveyResult:      'ContentPlaceHolder1_ddlsurveyno',
  mobileInput:       'ContentPlaceHolder1_txtmobile1',
  captchaInput:      'ContentPlaceHolder1_txtcaptcha',
};

const SITE_URL = 'https://bhulekh.mahabhumi.gov.in/NewBhulekh.aspx';
const IMAGE_SAVE_DIR = process.env.IMAGE_SAVE_DIR || process.cwd();

// ─── Mahabhunaksha district-code → URL path segment ──────────────────────────
const MBN_DISTRICT_PATH = {
  '01': '1',  '02': '2',  '03': '3',  '04': '4',
  '05': '27',
  '06': '6',  '07': '7',  '08': '8',  '09': '9',
  '10': '10', '11': '11', '12': '12', '13': '13',
  '14': '14', '15': '15', '16': '16', '17': '17',
  '18': '18', '19': '19', '20': '20', '21': '21',
  '22': '22', '23': '23', '24': '24', '25': '25',
  '26': '26', '27': '27', '28': '28', '29': '29',
  '30': '30', '31': '31', '32': '32', '33': '33',
  '34': '34', '35': '35', '36': '36',
};

function getMahabhunakshaUrl(districtCode) {
  const digits = String(districtCode).trim().match(/^(\d+)/)?.[1]?.padStart(2, '0') || '05';
  const seg    = MBN_DISTRICT_PATH[digits] || digits.replace(/^0/, '');
  return `https://mahabhunakasha.mahabhumi.gov.in/${seg}/index.html`;
}

function extractVillageMatchTokens(villageInput) {
  const str       = String(villageInput).trim();
  const textMatch = str.match(/^\d+\s+(.+)$/);
  const textPart  = textMatch ? textMatch[1].trim() : '';
  const numPart   = str.match(/^(\d+)/)?.[1] || '';

  let portalCode = '';
  if (numPart) {
    const stripped = numPart.replace(/0+$/, '');
    const segments = stripped.split(/0+/).filter(Boolean);
    const lastSeg  = segments[segments.length - 1] || '';
    portalCode = String(parseInt(lastSeg, 10) || 0);
    if (portalCode === '0' || portalCode === '') {
      portalCode = String(parseInt(stripped.slice(-4), 10));
    }
  }

  const shortCode = numPart.length > 7 ? numPart.slice(-7) : numPart;
  return { textPart, numPart, shortCode, portalCode, raw: str };
}

// ─────────────────────────────────────────────────────────────────────────────

class MahabhulekhScraper {

  // ═══════════════════════════════════════════════════════════════════════════
  // EXISTING: scrapeLandRecord  (7/12 Mahabhulekh — unchanged)
  // ═══════════════════════════════════════════════════════════════════════════

  async scrapeLandRecord(params = {}) {
    const {
      districtValue, talukaValue, villageValue,
      fullSurveyInput, mobile = '9999999999',
    } = params;

    let browser = null, finalHTML = '', match = null, mainImagePath = null;

    try {
      browser = await puppeteer.launch(LAUNCH_OPTS);
      const page = await browser.newPage();

      await page.evaluateOnNewDocument(() => {
        Object.defineProperty(Function.prototype, 'caller', { get: () => null });
        Object.defineProperty(Function.prototype, 'callee', { get: () => null });
      });

      await page.goto(SITE_URL, { waitUntil: 'networkidle2', timeout: 60000 });
      await delay(4000);

      let frame = await this.findFrameWithElement(page, `#${ID.district}`);
      await this.setSelectValue(frame, ID.district, districtValue);
      await delay(1800);
      await this.setSelectValue(frame, ID.taluka, talukaValue);
      await delay(1800);
      await this.setSelectValue(frame, ID.village, villageValue);
      await delay(3000);

      frame = await this.findFrameWithElement(page, `#${ID.rbtnSearchTypeCTS}`);
      await frame.evaluate(id => document.getElementById(id)?.click(), ID.rbtnSearchTypeCTS);
      await delay(2000);

      const prefix = fullSurveyInput.split('/')[0].trim();
      frame = await this.findFrameWithElement(page, `#${ID.ctsInput}`);
      await frame.type(`#${ID.ctsInput}`, prefix, { delay: 80 });
      await delay(1500);

      frame = await this.findFrameWithElement(page, `#${ID.searchBtn}`);
      await frame.click(`#${ID.searchBtn}`);
      await delay(2500);

      frame = await this.findFrameWithElement(page, `#${ID.surveyResult}`);
      const surveyOptions = await frame.$$eval(`#${ID.surveyResult} option`, opts =>
        opts.map(o => ({ label: o.textContent.trim(), value: o.value })).filter(o => o.label)
      );
      match = surveyOptions.find(o => o.label === fullSurveyInput) || surveyOptions[0];
      if (match) await this.setSelectValue(frame, ID.surveyResult, match.value);
      await delay(2500);

      console.log(`Entering Mobile: ${mobile}`);
      frame = await this.findFrameWithElement(page, `#${ID.mobileInput}`);
      await frame.evaluate((id, val) => {
        const el = document.getElementById(id);
        if (el) {
          el.focus(); el.value = val;
          ['input', 'change', 'blur'].forEach(ev =>
            el.dispatchEvent(new Event(ev, { bubbles: true }))
          );
        }
      }, ID.mobileInput, mobile);
      await delay(2000);

      console.log('\nPlease solve the CAPTCHA and CLICK the SUBMIT button yourself.');
      await delay(4000);

      const startTime   = Date.now();
      const MAX_WAIT_MS = 300000;
      let successDetected = false;

      while (Date.now() - startTime < MAX_WAIT_MS) {
        await delay(3000);
        try { finalHTML = await page.content(); }
        catch (e) {
          return { verified: false, reason: 'Browser closed unexpectedly',
                   html: '', retry: true, imageBased: false, mainImagePath: null };
        }
        const lowerHTML       = finalHTML.toLowerCase();
        const elapsed         = Math.floor((Date.now() - startTime) / 1000);
        const hasCaptchaError =
          lowerHTML.includes('invalid captcha') ||
          lowerHTML.includes('कॅप्चा चुकीचा') ||
          lowerHTML.includes('incorrect captcha');
        const largeImageCount = await this.getLargeImageCount(page);
        const hasResultButton =
          lowerHTML.includes('back') || lowerHTML.includes('print') ||
          lowerHTML.includes('download') || lowerHTML.includes('मागे') ||
          lowerHTML.includes('प्रिंट');

        console.log(`[Poll] largeImgCount=${largeImageCount} | resultBtn=${hasResultButton} | ` +
                    `htmlLen=${finalHTML.length} | captchaErr=${hasCaptchaError} | elapsed=${elapsed}s`);

        const isRealResult =
          largeImageCount >= 1 && hasResultButton &&
          finalHTML.length > 650000 && !hasCaptchaError;

        if (isRealResult) {
          console.log('Result page loaded successfully!');
          successDetected = true;
          mainImagePath   = await this.captureMainResultImage(page, fullSurveyInput);
          break;
        }
        if (hasCaptchaError) console.log('CAPTCHA error. Please re-enter and submit.');
      }

      return {
        verified: successDetected, surveyLabel: match?.label || fullSurveyInput,
        html: finalHTML, pdfBuffer: null,
        imageBased: successDetected && mainImagePath !== null, mainImagePath,
        retry: !successDetected,
        reason: successDetected ? null : 'Result not detected within timeout',
      };

    } catch (err) {
      console.error('Scraper ERROR:', err.message);
      return { verified: false, reason: err.message, html: finalHTML || '',
               pdfBuffer: null, imageBased: false, mainImagePath: null, retry: true };
    } finally {
      // if (browser) await browser.close();
    }
  }

  async captureMainResultImage(page, fullSurveyInput) {
    const safe = fullSurveyInput.replace(/[^a-zA-Z0-9]/g, '_');
    try {
      await delay(1500);
      const handle = await page.evaluateHandle(() => {
        let best = null, maxArea = 0;
        for (const img of document.querySelectorAll('img')) {
          const w = img.naturalWidth || img.clientWidth || 0;
          const h = img.naturalHeight || img.clientHeight || 0;
          if (w * h > maxArea && w > 600 && h > 300) { maxArea = w * h; best = img; }
        }
        return best;
      });
      if (handle && (await handle.asElement())) {
        const p = path.resolve(IMAGE_SAVE_DIR, `land_record_main_${safe}_${Date.now()}.png`);
        await handle.screenshot({ path: p, type: 'png', omitBackground: true });
        return p;
      }
      return this._saveFullPageFallback(page, safe);
    } catch (e) {
      try { return this._saveFullPageFallback(page, safe); } catch (_) { return null; }
    }
  }

  async _saveFullPageFallback(page, safe) {
    const p = path.resolve(IMAGE_SAVE_DIR, `land_record_full_${safe}_${Date.now()}.png`);
    await page.screenshot({ fullPage: true, path: p, type: 'png' });
    return p;
  }

  async getLargeImageCount(page) {
    let count = 0;
    for (const f of page.frames()) {
      try {
        count += await f.evaluate(() =>
          [...document.querySelectorAll('img')]
            .filter(img => (img.naturalWidth || img.clientWidth || 0) > 600).length
        );
      } catch (_) {}
    }
    return count;
  }

  async setSelectValue(frame, id, value) {
    return frame.evaluate((id, val) => {
      const el = document.getElementById(id);
      if (el) { el.value = val; el.dispatchEvent(new Event('change', { bubbles: true })); }
      return !!el;
    }, id, value);
  }

  async findFrameWithElement(page, selector, timeout = 40000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      for (const f of page.frames()) {
        if (await f.$(selector)) return f;
      }
      await delay(500);
    }
    throw new Error(`Element ${selector} not found in any frame within ${timeout}ms`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MAHABHUNAKSHA SCRAPER
  // ═══════════════════════════════════════════════════════════════════════════

  async scrapeMahabhunaksha(params = {}) {
    const { district, taluka, village, surveyNo, timeoutMs = 180000 } = params;

    let browser  = null;
    let mainPage = null;

    try {
      browser  = await puppeteer.launch(LAUNCH_OPTS);
      mainPage = await browser.newPage();

      // ── 1. Navigate ────────────────────────────────────────────────────────
      const url = getMahabhunakshaUrl(district);
      console.log(`[MBN] Navigating → ${url}`);
      await mainPage.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
      await delay(3000);

      // ── 2. State ───────────────────────────────────────────────────────────
      console.log('[MBN] Step 2: Selecting State → Maharashtra');
      await this._mbnSetNthSelect(mainPage, 0, 'Maharastra');
      await delay(600);

      // ── 3. Category ────────────────────────────────────────────────────────
      console.log('[MBN] Step 3: Selecting Category → Rural');
      await this._mbnSetNthSelect(mainPage, 1, 'Rural');
      await delay(1200);

      // ── 4. District ────────────────────────────────────────────────────────
      console.log(`[MBN] Step 4: Waiting for District dropdown, then selecting "${district}"`);
      await this._mbnWaitSelectGrows(mainPage, 2, 2, 10000);
      const districtSet = await this._mbnSetNthSelect(mainPage, 2, district);
      if (!districtSet) {
        await this._mbnLogSelectOptions(mainPage, 2);
        return this._mbnFail(mainPage, surveyNo, `District not matched: "${district}"`);
      }

      // ── 5. Taluka ──────────────────────────────────────────────────────────
      console.log(`[MBN] Step 5: Waiting for Taluka dropdown, then selecting "${taluka}"`);
      await this._mbnWaitSelectGrows(mainPage, 3, 2, 12000);
      await delay(600);
      const talukaSet = await this._mbnSetNthSelect(mainPage, 3, taluka);
      if (!talukaSet) {
        await this._mbnLogSelectOptions(mainPage, 3);
        return this._mbnFail(mainPage, surveyNo, `Taluka not matched: "${taluka}"`);
      }

      // ── 6. Village ─────────────────────────────────────────────────────────
      console.log(`[MBN] Step 6: Waiting for Village dropdown, then selecting "${village}"`);
      await this._mbnWaitSelectGrows(mainPage, 4, 2, 12000);
      await delay(800);
      const tokens     = extractVillageMatchTokens(village);
      const villageSet = await this._mbnSetVillage(mainPage, tokens);
      if (!villageSet) {
        await this._mbnLogSelectOptions(mainPage, 4);
        return this._mbnFail(mainPage, surveyNo, `Village not matched: "${village}"`);
      }
      console.log('[MBN] Village set. Waiting for map area to load...');
      await mainPage.waitForNetworkIdle({ idleTime: 1500, timeout: 15000 }).catch(() => delay(3000));

      // ── 7. Fill search input ───────────────────────────────────────────────
      const prefix = String(surveyNo).split('/')[0].trim();
      console.log(`[MBN] Step 7: Typing search prefix "${prefix}"`);
      await this._mbnFillSearchInput(mainPage, prefix);
      await delay(400);

      // ── 8. Click Search button ─────────────────────────────────────────────
      console.log('[MBN] Step 8: Clicking Search button');
      const btnClicked = await this._mbnClickSearchBtn(mainPage);
      if (!btnClicked) console.warn('[MBN] Search button not found — continuing anyway');

      // ── 9. Wait for Plot No dropdown to populate ───────────────────────────
      console.log('[MBN] Step 9: Waiting for Plot No dropdown to populate');
      const plotDropdownReady = await this._mbnWaitSelectGrows(mainPage, 5, 1, 12000);
      if (!plotDropdownReady) console.warn('[MBN] Plot dropdown may be empty');
      await delay(600);

      // ── 10. Select matching plot ───────────────────────────────────────────
      console.log(`[MBN] Step 10: Selecting plot "${surveyNo}" from dropdown`);
      const plotSelected = await this._mbnPickPlot(mainPage, surveyNo);
      if (!plotSelected) console.warn('[MBN] Exact plot match not found; first option selected');

      // ── 11. Wait for Plot Info panel ──────────────────────────────────────
      console.log('[MBN] Step 11: Waiting for Plot Info panel');
      await mainPage.waitForNetworkIdle({ idleTime: 1200, timeout: 10000 }).catch(() => delay(3000));

      // ── 12. Capture Plot Info ──────────────────────────────────────────────
      const plotInfoEntries = await this._mbnExtractPlotInfo(mainPage);
      const infoPanelHtml   = await this._mbnGetPlotInfoHtml(mainPage);
      console.log(`[MBN] Plot info entries: ${plotInfoEntries.length}`);

      // ── 13. Scroll to reveal Map Report link ───────────────────────────────
      console.log('[MBN] Step 13: Scrolling to reveal Map Report link');
      await mainPage.evaluate(() => {
        document.querySelectorAll('*').forEach(el => {
          try {
            const cs = window.getComputedStyle(el);
            if (/auto|scroll/.test(cs.overflow + cs.overflowY) && el.scrollHeight > el.clientHeight + 10) {
              el.scrollTop = el.scrollHeight;
            }
          } catch (_) {}
        });
        window.scrollTo(0, document.body.scrollHeight);
      });
      await delay(800);

      // ── 14. Extract Map Report URL ─────────────────────────────────────────
      console.log('[MBN] Step 14: Extracting Map Report URL');
      const mapReportUrl = await this._mbnGetMapReportUrl(mainPage);
      console.log(`[MBN] Map Report URL: ${mapReportUrl}`);

      if (!mapReportUrl) {
        return {
          success: false, plotInfoEntries, infoPanelHtml,
          screenshotPath: null,
          reason: '"Map Report" link/URL not found on page',
        };
      }

      // ── 15. Open Map Report page ───────────────────────────────────────────
      console.log('[MBN] Step 15: Opening Map Report page directly');
      const mapPage = await browser.newPage();
      const layerPaneUrl = mapReportUrl.replace(/#.*$/, '') + '#layer-pane';
      await mapPage.goto(layerPaneUrl, { waitUntil: 'networkidle2', timeout: 60000 });
      await delay(3000);

      // ── 16. Tick all checkboxes in #layer-pane ─────────────────────────────
      // This is critical — checkboxes must ALL be checked to get coordinates
      // and measurement labels visible in the report output.
      console.log('[MBN] Step 16: Waiting for checkboxes in #layer-pane');
      await this._mbnWaitForCheckboxes(mapPage, 10000);
      await delay(500);
      const checkedCount = await this._mbnCheckAllCheckboxes(mapPage);
      console.log(`[MBN] Checked ${checkedCount} checkboxes`);
      await delay(1500); // extra wait for map to re-render with all layers

      // ── 17. Navigate to #home-pane (Report tab) ────────────────────────────
      console.log('[MBN] Step 17: Navigating to #home-pane');
      const reportTabClicked = await this._mbnClickNavItem(mapPage, 0);
      if (!reportTabClicked) {
        await mapPage.evaluate(() => { window.location.hash = '#home-pane'; });
      }
      await delay(2000);

      // ── 18. Set up new-tab listener BEFORE clicking Show Report PDF ────────
      console.log('[MBN] Step 18: Setting up new-tab listener and clicking Show Report PDF');

      const pdfTabPromise = new Promise(resolve => {
        browser.once('targetcreated', async (target) => {
          console.log(`[MBN] New target created: type=${target.type()} url=${target.url()}`);
          resolve(target);
        });
      });

      const pdfBtnClicked = await this._mbnClickShowReportPdf(mapPage);
      console.log(`[MBN] Show Report PDF button clicked: ${pdfBtnClicked}`);

      if (!pdfBtnClicked) {
        console.warn('[MBN] Show Report PDF button not found');
        const screenshotPath = await this._mbnSS(mapPage, surveyNo + '_no_pdf_btn');
        return {
          success: false, plotInfoEntries, infoPanelHtml,
          screenshotPath,
          reason: '"Show Report PDF" button not found',
        };
      }

      // ── 19. Wait for new tab, screenshot the report page ──────────────────
      // The report opens in a new tab (Chrome PDF viewer or HTML report page).
      // We re-open that URL in a fresh Puppeteer page so screenshot works.
      // We capture ONLY the image — no PDF saving needed.
      console.log('[MBN] Step 19: Waiting for report tab...');

      let finalScreenshotPath = null;

      let pdfTarget = null;
      try {
        pdfTarget = await Promise.race([
          pdfTabPromise,
          new Promise((_, reject) => setTimeout(() => reject(new Error('no new tab')), 15000)),
        ]);
        console.log(`[MBN] Report target detected, type: ${await pdfTarget.type()}`);
      } catch (e) {
        console.warn(`[MBN] No new tab detected within 15s: ${e.message}`);
        pdfTarget = null;
      }

      if (pdfTarget && (await pdfTarget.type()) === 'page') {

        // Get the URL from the tab Chrome opened
        const nativePage = await pdfTarget.page();
        await delay(3000);
        const reportUrl = nativePage.url();
        console.log(`[MBN] Report URL from new tab: ${reportUrl}`);

        // Close Chrome's native tab (can't screenshot PDF viewer natively)
        await nativePage.close().catch(() => {});

        // Re-open the URL in a fresh normal Puppeteer page for screenshotting
        const renderPage = await browser.newPage();

        if (reportUrl && reportUrl.match(/\.pdf($|\?)/i)) {
          // Direct .pdf URL — render via PDF.js so it becomes a screenshottable DOM page
          console.log('[MBN] Direct PDF URL — opening via PDF.js viewer');
          const pdfJsUrl = `https://mozilla.github.io/pdf.js/web/viewer.html?file=${encodeURIComponent(reportUrl)}`;
          await renderPage.goto(pdfJsUrl, { waitUntil: 'networkidle2', timeout: 60000 });
          await this._mbnWaitForPdfContent(renderPage, 20000);
          await delay(3000);

        } else if (reportUrl && reportUrl !== 'about:blank') {
          // HTML report page — navigate normally
          console.log('[MBN] HTML report URL — navigating normally');
          await renderPage.goto(reportUrl, { waitUntil: 'networkidle2', timeout: 60000 });
          await delay(3000);

        } else {
          console.warn('[MBN] Report URL is blank — falling back to mapPage right-panel screenshot');
          finalScreenshotPath = await this._mbnScreenshotRightPanel(mapPage, surveyNo);
        }

        if (!finalScreenshotPath) {
          finalScreenshotPath = await this._mbnScreenshotReportPage(renderPage, surveyNo);
        }

        await renderPage.close().catch(() => {});

      } else {
        // ── No new tab: report may have rendered inline in mapPage ────────────
        console.log('[MBN] No new tab — checking if mapPage navigated or report is inline');

        await delay(3000);

        const currentUrl = mapPage.url();
        console.log(`[MBN] Current mapPage URL after button click: ${currentUrl}`);

        if (currentUrl && currentUrl !== layerPaneUrl && currentUrl !== 'about:blank') {
          // mapPage itself navigated to the report URL — re-open in fresh page
          console.log('[MBN] mapPage navigated to report URL — re-opening in fresh page');
          const renderPage = await browser.newPage();

          if (currentUrl.match(/\.pdf($|\?)/i)) {
            const pdfJsUrl = `https://mozilla.github.io/pdf.js/web/viewer.html?file=${encodeURIComponent(currentUrl)}`;
            await renderPage.goto(pdfJsUrl, { waitUntil: 'networkidle2', timeout: 60000 });
            await this._mbnWaitForPdfContent(renderPage, 20000);
            await delay(3000);
          } else {
            await renderPage.goto(currentUrl, { waitUntil: 'networkidle2', timeout: 60000 });
            await delay(3000);
          }

          finalScreenshotPath = await this._mbnScreenshotReportPage(renderPage, surveyNo);
          await renderPage.close().catch(() => {});

        } else {
          // Report is embedded inline in mapPage — screenshot just the right panel
          console.log('[MBN] Report appears inline in mapPage — capturing right panel only');
          const viewerReady = await this._mbnWaitForPdfViewer(mapPage, 20000);
          console.log(`[MBN] PDF viewer ready: ${viewerReady}`);
          if (viewerReady) {
            await this._mbnWaitForPdfContent(mapPage, 15000);
          }
          await delay(2000);

          // Screenshot only the right-side report panel (not the left sidebar)
          finalScreenshotPath = await this._mbnScreenshotRightPanel(mapPage, surveyNo);
        }
      }

      const mapReportHtml = await this._mbnGetMapReportHtml(mapPage).catch(() => '');

      return {
        success: true,
        plotInfoEntries,
        infoPanelHtml,
        mapReportHtml,
        screenshotPath: finalScreenshotPath,
        reason: null,
      };

    } catch (err) {
      console.error('[MBN] Fatal error:', err.message, err.stack);
      const ss = mainPage
        ? await this._mbnSS(mainPage, 'err_' + Date.now()).catch(() => null)
        : null;
      return {
        success: false, plotInfoEntries: [], infoPanelHtml: '',
        screenshotPath: ss, reason: err.message,
      };
    } finally {
      // if (browser) await browser.close();
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Screenshot the full rendered report page (renderPage / PDF.js page).
  // This is used when the report opens in a new tab and we re-open it in
  // a fresh Puppeteer page — no sidebar, no clipping needed.
  // ═══════════════════════════════════════════════════════════════════════════

  async _mbnScreenshotReportPage(page, surveyNo) {
    const safe   = String(surveyNo).replace(/[^a-zA-Z0-9]/g, '_');
    const ssPath = path.resolve(IMAGE_SAVE_DIR, `mbn_plot_report_${safe}_${Date.now()}.png`);
    await page.screenshot({ path: ssPath, fullPage: true, type: 'png' });
    console.log(`[MBN] Report screenshot saved: ${ssPath}`);
    return ssPath;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Screenshot only the right-side report/map panel of mapPage,
  // excluding the left sidebar (Home panel).
  // Used when the PDF renders inline rather than in a new tab.
  // ═══════════════════════════════════════════════════════════════════════════

  async _mbnScreenshotRightPanel(page, surveyNo) {
    const safe = String(surveyNo).replace(/[^a-zA-Z0-9]/g, '_');
    const ssPath = path.resolve(IMAGE_SAVE_DIR, `mbn_plot_report_${safe}_${Date.now()}.png`);

    // Find the bounding box of the right-side panel (report/PDF viewer area)
    const clip = await page.evaluate(() => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      // Strategy 1: find a large element to the right of the sidebar
      const candidates = [
        ...document.querySelectorAll('iframe, embed, object, canvas, .ol-viewport, .leaflet-container, [class*="report"], [class*="viewer"], [class*="map-pane"], [id*="report"], [id*="viewer"]'),
      ].filter(el => {
        const r = el.getBoundingClientRect();
        return r.width > 300 && r.height > 300 && r.left > vw * 0.25;
      }).sort((a, b) => {
        const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
        return (rb.width * rb.height) - (ra.width * ra.height);
      });

      if (candidates[0]) {
        const r = candidates[0].getBoundingClientRect();
        return { x: Math.floor(r.left), y: Math.floor(r.top), width: Math.ceil(r.width), height: Math.ceil(r.height) };
      }

      // Strategy 2: find the widest/largest div that starts past 25% of viewport
      const divs = [...document.querySelectorAll('div, section')].filter(el => {
        const r = el.getBoundingClientRect();
        return r.left > vw * 0.25 && r.width > vw * 0.4 && r.height > vh * 0.4;
      }).sort((a, b) => {
        const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
        return (rb.width * rb.height) - (ra.width * ra.height);
      });

      if (divs[0]) {
        const r = divs[0].getBoundingClientRect();
        return { x: Math.floor(r.left), y: Math.floor(r.top), width: Math.ceil(r.width), height: Math.ceil(r.height) };
      }

      // Strategy 3: hard-coded right half of viewport as fallback
      const sidebarWidth = Math.round(vw * 0.28); // approx sidebar width
      return { x: sidebarWidth, y: 0, width: vw - sidebarWidth, height: vh };
    });

    console.log(`[MBN] Right panel clip: x=${clip.x} y=${clip.y} w=${clip.width} h=${clip.height}`);

    await page.screenshot({ path: ssPath, type: 'png', clip });
    console.log(`[MBN] Right-panel screenshot saved: ${ssPath}`);
    return ssPath;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Wait for PDF viewer iframe/embed to appear
  // ═══════════════════════════════════════════════════════════════════════════

  async _mbnWaitForPdfViewer(page, timeoutMs = 25000) {
    const deadline = Date.now() + timeoutMs;
    console.log('[MBN] Polling for PDF viewer element...');

    while (Date.now() < deadline) {
      const found = await page.evaluate(() => {
        const vw = window.innerWidth;
        const embeds = [
          ...document.querySelectorAll('iframe, embed, object'),
        ].filter(el => {
          const r = el.getBoundingClientRect();
          return r.width > 200 && r.height > 200 && r.left > vw * 0.35;
        });
        if (embeds.length > 0) return { found: true, tag: embeds[0].tagName };

        const divs = [...document.querySelectorAll('div, section')].filter(el => {
          const r   = el.getBoundingClientRect();
          const cls = (el.id + ' ' + el.className).toLowerCase();
          return r.width > 300 && r.height > 400 &&
                 r.left > vw * 0.35 &&
                 /pdf|viewer|report|preview/.test(cls);
        });
        if (divs.length > 0) return { found: true, tag: 'div' };

        return { found: false };
      });

      if (found.found) {
        console.log(`[MBN] PDF viewer found (${found.tag})`);
        return true;
      }
      await delay(500);
    }

    console.warn('[MBN] PDF viewer not found within timeout');
    return false;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Wait for PDF.js canvas to render
  // ═══════════════════════════════════════════════════════════════════════════

  async _mbnWaitForPdfContent(page, timeoutMs = 15000) {
    const deadline = Date.now() + timeoutMs;
    console.log('[MBN] Waiting for PDF canvas to render...');

    await page.waitForNetworkIdle({ idleTime: 1500, timeout: timeoutMs * 0.5 }).catch(() => {});

    while (Date.now() < deadline) {
      const hasCanvas = await (async () => {
        const n = await page.evaluate(() => document.querySelectorAll('canvas').length);
        if (n > 0) return true;
        for (const frame of page.frames()) {
          try {
            const ok = await frame.evaluate(() =>
              document.querySelectorAll('canvas').length > 0 ||
              document.querySelectorAll('.page, .pdfViewer').length > 0
            );
            if (ok) return true;
          } catch (_) {}
        }
        return false;
      })();

      if (hasCanvas) {
        console.log('[MBN] PDF canvas detected — extra 2s render buffer');
        await delay(2000);
        return true;
      }
      await delay(400);
    }

    console.warn('[MBN] PDF canvas not detected — proceeding anyway');
    return false;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Map Report URL extractor
  // ═══════════════════════════════════════════════════════════════════════════

  async _mbnGetMapReportUrl(page) {
    return page.evaluate(() => {
      const all = [...document.querySelectorAll('a, button, [role=button], span, div, li')];

      let link = all.find(el =>
        /map\s*report/i.test((el.textContent || el.innerText || '').trim()) &&
        el.tagName === 'A' && el.href
      );
      if (!link) {
        link = all.find(el =>
          /map\s*report/i.test((el.textContent || el.innerText || '').trim())
        );
      }
      if (!link) {
        link = all.find(el =>
          el.tagName === 'A' &&
          /signplotreport|mapreport|map.report/i.test(el.href || '')
        );
      }
      if (!link) return null;

      if (link.tagName === 'A' && link.href) return link.href;

      const nested = link.querySelector('a[href]');
      if (nested) return nested.href;

      const onclick = link.getAttribute('onclick') || '';
      const urlMatch = onclick.match(/['"]([^'"]*signplotreport[^'"]*)['"]/i) ||
                       onclick.match(/window\.open\(['"]([^'"]+)['"]/i) ||
                       onclick.match(/location\.href\s*=\s*['"]([^'"]+)['"]/i);
      if (urlMatch) {
        const raw = urlMatch[1];
        return raw.startsWith('http') ? raw : (window.location.origin + (raw.startsWith('/') ? '' : '/') + raw);
      }

      const anyAnchor = document.querySelector('a[href*="signplotreport"], a[href*="mapreport"]');
      if (anyAnchor) return anyAnchor.href;

      return null;
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE HELPERS — location selectors
  // ═══════════════════════════════════════════════════════════════════════════

  async _mbnLogSelects(page) {
    const info = await page.evaluate(() =>
      [...document.querySelectorAll('select')].map((el, i) => ({
        i, id: el.id, name: el.name, optCount: el.options.length,
        opts: [...el.options].slice(0, 8).map(o => ({
          val: o.value, text: o.textContent.trim()
        })),
      }))
    );
    console.log('[MBN] selects:', JSON.stringify(info, null, 2));
  }

  async _mbnLogSelectOptions(page, nth) {
    const opts = await page.evaluate((nth) => {
      const el = document.querySelectorAll('select')[nth];
      if (!el) return [];
      return [...el.options].map(o => ({ val: o.value, text: o.textContent.trim() }));
    }, nth);
    console.log(`[MBN] select[${nth}] all options (${opts.length}):`, JSON.stringify(opts));
  }

  async _mbnSetNthSelect(page, nth, searchText) {
    return page.evaluate((nth, text) => {
      const el = document.querySelectorAll('select')[nth];
      if (!el) return false;
      const t       = text.toString().toLowerCase().trim();
      const numPart = t.match(/^(\d+)/)?.[1] || '';
      const options = [...el.options];

      let match = options.find(o => o.value.toLowerCase() === t);
      if (!match) match = options.find(o => o.textContent.trim().toLowerCase() === t);
      if (!match) match = options.find(o => o.textContent.trim().toLowerCase().includes(t));
      if (!match) match = options.find(o => {
        const ot = o.textContent.trim().toLowerCase();
        return ot && t.includes(ot);
      });
      if (!match && numPart) {
        match = options.find(o => {
          const ov      = o.value.toString().trim();
          const ot      = o.textContent.trim();
          const leadNum = ov.match(/^(\d+)/)?.[1] || ot.match(/^(\d+)/)?.[1] || '';
          return leadNum === numPart || leadNum.replace(/^0+/, '') === numPart.replace(/^0+/, '');
        });
      }
      if (!match && numPart)
        match = options.find(o => o.value.toString().trim().startsWith(numPart));

      if (!match) return false;
      el.value = match.value;
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }, nth, searchText);
  }

  async _mbnSetVillage(page, tokens) {
    return page.evaluate((tokens) => {
      const el = document.querySelectorAll('select')[4];
      if (!el || el.options.length < 2) return false;

      const options = [...el.options].filter(o => o.value && o.value !== '-1');
      const { textPart, numPart, shortCode, raw } = tokens;
      const norm = s => s.toString().trim().toLowerCase().replace(/\s+/g, ' ');

      let match = null;

      if (!match && numPart)
        match = options.find(o => norm(o.value) === norm(numPart));
      if (!match && shortCode)
        match = options.find(o => norm(o.value) === norm(shortCode));
      if (!match && shortCode)
        match = options.find(o => norm(o.value).endsWith(norm(shortCode)));
      if (!match && textPart)
        match = options.find(o => norm(o.textContent).includes(norm(textPart)));
      if (!match && shortCode.length >= 5)
        match = options.find(o => norm(o.value).includes(norm(shortCode)));
      if (!match && numPart.length >= 7) {
        for (let suffixLen = 7; suffixLen >= 5 && !match; suffixLen--) {
          const suffix = numPart.slice(-suffixLen);
          match = options.find(o =>
            norm(o.value).endsWith(suffix) || norm(o.value).includes(suffix)
          );
        }
      }
      if (!match) {
        match = options.find(o => {
          const ot = norm(o.textContent);
          const nr = norm(raw);
          return ot && nr.includes(ot) && ot.length > 2;
        });
      }

      if (!match) return false;

      el.value = match.value;
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }, tokens);
  }

  async _mbnWaitSelectGrows(page, nth, minOpts, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const n = await page.evaluate(
        (nth) => (document.querySelectorAll('select')[nth]?.options.length ?? 0), nth
      ).catch(() => 0);
      if (n >= minOpts) return true;
      await delay(400);
    }
    console.warn(`[MBN] select[${nth}] didn't reach ${minOpts} options within ${timeoutMs}ms`);
    return false;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE HELPERS — search & plot selection
  // ═══════════════════════════════════════════════════════════════════════════

  async _mbnFillSearchInput(page, value) {
    return page.evaluate((val) => {
      const inputs = [...document.querySelectorAll('input[type=text], input:not([type])')].filter(i => i.offsetParent !== null);
      const byPlaceholder = inputs.find(i => /parcel|plot|survey|enter/i.test(i.placeholder || ''));
      if (byPlaceholder) {
        byPlaceholder.focus(); byPlaceholder.value = ''; byPlaceholder.value = val;
        ['input', 'change'].forEach(ev => byPlaceholder.dispatchEvent(new Event(ev, { bubbles: true })));
        return true;
      }
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        if (/search\s*plot\s*no/i.test(node.nodeValue || '')) {
          let el = node.parentElement;
          for (let i = 0; i < 6 && el; i++, el = el.parentElement) {
            const inp = el.querySelector('input[type=text], input:not([type])');
            if (inp && inp.offsetParent !== null) {
              inp.focus(); inp.value = ''; inp.value = val;
              ['input', 'change'].forEach(ev => inp.dispatchEvent(new Event(ev, { bubbles: true })));
              return true;
            }
          }
        }
      }
      if (inputs[0]) {
        inputs[0].focus(); inputs[0].value = ''; inputs[0].value = val;
        ['input', 'change'].forEach(ev => inputs[0].dispatchEvent(new Event(ev, { bubbles: true })));
        return true;
      }
      return false;
    }, value);
  }

  async _mbnClickSearchBtn(page) {
    return page.evaluate(() => {
      const btns = [...document.querySelectorAll('button, input[type=submit], input[type=button], a')]
        .filter(b => b.offsetParent !== null);
      const byText = btns.find(b =>
        /\bsearch\b|\bfind\b|\bgo\b|🔍/i.test(
          (b.textContent || '') + (b.value || '') + (b.title || '') + (b.getAttribute('aria-label') || '')
        )
      );
      if (byText) { byText.click(); return true; }
      const icon = document.querySelector('.fa-search, .glyphicon-search, [class*="search-ico"], [class*="search-btn"]');
      if (icon) { (icon.closest('button,a') || icon).click(); return true; }
      const inputs = [...document.querySelectorAll('input')].filter(i => i.offsetParent !== null);
      if (inputs[0]) {
        const parent = inputs[0].closest('div,section,form,table,tr,td') || inputs[0].parentElement;
        const adj = parent?.querySelector('button, input[type=submit], input[type=button], a[onclick]');
        if (adj && adj !== inputs[0]) { adj.click(); return true; }
      }
      if (btns[0]) { btns[0].click(); return true; }
      return false;
    });
  }

  async _mbnPickPlot(page, surveyNo) {
    return page.evaluate((surveyNo) => {
      const prefix = surveyNo.split('/')[0].trim();
      const norm   = s => s.toString().trim().toLowerCase();
      const allSelects = [...document.querySelectorAll('select')];

      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        if (/select\s*plot\s*no/i.test(node.nodeValue || '')) {
          let el = node.parentElement;
          for (let i = 0; i < 6 && el; i++, el = el.parentElement) {
            const sel = el.querySelector('select');
            if (sel && sel.options.length >= 1) {
              const opts   = [...sel.options].filter(o => o.value);
              const chosen =
                opts.find(o => norm(o.textContent) === norm(surveyNo)) ||
                opts.find(o => norm(o.textContent).includes(norm(prefix))) ||
                opts.find(o => norm(o.value) === norm(surveyNo)) ||
                opts[0];
              if (chosen) {
                sel.value = chosen.value;
                sel.dispatchEvent(new Event('change', { bubbles: true }));
                return true;
              }
            }
          }
        }
      }

      const candidates = allSelects.length > 5 ? [allSelects[5], ...allSelects.slice(6)] : allSelects;
      for (const sel of candidates) {
        const opts = [...sel.options].filter(o => /\d/.test(o.textContent || o.value));
        if (opts.length >= 1) {
          const chosen =
            opts.find(o => norm(o.textContent) === norm(surveyNo)) ||
            opts.find(o => norm(o.textContent).includes(norm(prefix))) ||
            opts[0];
          if (chosen) {
            sel.value = chosen.value;
            sel.dispatchEvent(new Event('change', { bubbles: true }));
            return true;
          }
        }
      }
      return false;
    }, surveyNo);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE HELPERS — Map Report tab interactions
  // ═══════════════════════════════════════════════════════════════════════════

  async _mbnClickNavItem(page, index) {
    return page.evaluate((index) => {
      const selectors = [
        'nav li', 'nav > ul > li', 'nav a',
        'ul.nav > li', 'ul.navbar-nav > li',
        '[role="tablist"] [role="tab"]',
        '.tab-bar li', '.tabs li', '.nav-tabs li',
        'header a', '.header a', '#header a',
        '.toolbar button', '.toolbar a',
        '.sidebar li', '.menu li',
      ];

      for (const sel of selectors) {
        const items = [...document.querySelectorAll(sel)].filter(el => el.offsetParent !== null);
        if (items.length > index) {
          items[index].scrollIntoView({ block: 'center' });
          const clickTarget = items[index].querySelector('a, button') || items[index];
          clickTarget.click();
          return true;
        }
      }

      const topItems = [...document.querySelectorAll('a, button, li, [role="tab"]')]
        .filter(el => {
          if (!el.offsetParent) return false;
          const rect = el.getBoundingClientRect();
          return rect.top < 80 && rect.width > 20;
        })
        .sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left);

      if (topItems.length > index) {
        topItems[index].click();
        return true;
      }

      return false;
    }, index);
  }

  async _mbnWaitForCheckboxes(page, timeoutMs = 5000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const n = await page.evaluate(
        () => document.querySelectorAll('input[type="checkbox"]').length
      ).catch(() => 0);
      if (n > 0) return true;
      await delay(300);
    }
    console.warn('[MBN] No checkboxes found within timeout');
    return false;
  }

  async _mbnCheckAllCheckboxes(page) {
    return page.evaluate(() => {
      const boxes = [...document.querySelectorAll('input[type="checkbox"]')];
      let count = 0;
      for (const cb of boxes) {
        if (!cb.checked) {
          cb.checked = true;
          cb.dispatchEvent(new Event('change', { bubbles: true }));
          cb.dispatchEvent(new Event('click',  { bubbles: true }));
        }
        count++;
      }
      return count;
    });
  }

  async _mbnClickShowReportPdf(page) {
    return page.evaluate(() => {
      const candidates = [
        ...document.querySelectorAll('button, input[type=submit], input[type=button], a, [role=button]')
      ].filter(el => el.offsetParent !== null);

      // 1. Exact text match — safest, avoids clicking "Sign" by mistake
      const exact = candidates.find(el => {
        const text = (el.textContent || el.value || '').trim();
        return text === 'Show Report PDF' || text === 'Show Report Pdf';
      });
      if (exact) {
        exact.scrollIntoView({ block: 'center' });
        exact.click();
        return 'exact';
      }

      // 2. Must contain BOTH "show/generate/view" AND "report/pdf"
      const partial = candidates.find(el => {
        const text = (el.textContent || el.value || '').trim().toLowerCase();
        return (text.includes('show') && text.includes('report')) ||
               (text.includes('report') && text.includes('pdf'))  ||
               (text.includes('generate') && text.includes('pdf'));
      });
      if (partial) {
        partial.scrollIntoView({ block: 'center' });
        partial.click();
        return 'partial';
      }

      return false;
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE HELPERS — info extraction & screenshot
  // ═══════════════════════════════════════════════════════════════════════════

  async _mbnExtractPlotInfo(page) {
    const text = await page.evaluate(() => {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        if (/plot\s*info/i.test(node.nodeValue || '')) {
          let el = node.parentElement;
          for (let i = 0; i < 5 && el; i++, el = el.parentElement) {
            if ((el.innerText || '').includes('Survey No')) return el.innerText;
          }
        }
      }
      const body = document.body.innerText || '';
      const idx  = body.search(/Survey\s*No\s*[.:]/i);
      return idx !== -1 ? body.slice(idx, idx + 2000) : '';
    });
    return this._parsePlotInfoText(text);
  }

  async _mbnGetPlotInfoHtml(page) {
    return page.evaluate(() => {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        if (/plot\s*info/i.test(node.nodeValue || '')) {
          let el = node.parentElement;
          for (let i = 0; i < 5 && el; i++, el = el.parentElement) {
            if ((el.innerHTML || '').includes('Survey')) return el.innerHTML;
          }
        }
      }
      return document.body.innerHTML || '';
    });
  }

  async _mbnGetMapReportHtml(page) {
    return page.evaluate(() => {
      const candidates = [
        document.querySelector('#mapReport, .map-report, [id*="report"]'),
        document.querySelector('canvas')?.closest('div,section'),
        document.querySelector('.ol-viewport')?.closest('div,section'),
        document.querySelector('.leaflet-container')?.closest('div,section'),
        [...document.querySelectorAll('table')].find(t =>
          /vertex|coordinate|northing|easting/i.test(t.textContent || '')
        ),
      ].filter(Boolean);

      if (candidates[0]) return candidates[0].innerHTML;
      return document.body.innerHTML || '';
    });
  }

  _parsePlotInfoText(text) {
    if (!text) return [];
    const entries = [];
    for (const block of text.split(/[-─]{5,}/g)) {
      const entry = { surveyNo: '', totalArea: '', potKharaba: '', ownerName: '', khataNo: '' };
      for (const line of block.split(/\r?\n/).map(l => l.trim()).filter(Boolean)) {
        const kv = line.match(/^([^:]+?)\s*:\s*(.+)$/);
        if (!kv) continue;
        const k = kv[1].trim(), v = kv[2].trim();
        if (/survey\s*no/i.test(k))       entry.surveyNo   = v;
        else if (/total\s*area/i.test(k))  entry.totalArea  = parseFloat(v) || v;
        else if (/pot\s*kharaba/i.test(k)) entry.potKharaba = parseFloat(v) || v;
        else if (/owner\s*name/i.test(k))  entry.ownerName  = v;
        else if (/khata\s*no/i.test(k))    entry.khataNo    = v;
      }
      if (entry.surveyNo || entry.ownerName) entries.push(entry);
    }
    return entries;
  }

  async _mbnSS(page, label) {
    const safe    = String(label).replace(/[^a-zA-Z0-9_]/g, '_');
    const absPath = path.resolve(IMAGE_SAVE_DIR, `mbn_${safe}_${Date.now()}.png`);
    try {
      await page.screenshot({ fullPage: false, path: absPath, type: 'png' });
      console.log(`[MBN] Screenshot: ${absPath}`);
    } catch (e) {
      console.warn(`[MBN] Screenshot failed (${label}):`, e.message);
    }
    return absPath;
  }

  async _mbnFail(page, surveyNo, reason) {
    console.error(`[MBN] FAIL: ${reason}`);
    return {
      success: false, plotInfoEntries: [], infoPanelHtml: '',
      screenshotPath: await this._mbnSS(page, surveyNo + '_fail').catch(() => null),
      reason,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // API fallback
  // ═══════════════════════════════════════════════════════════════════════════

  async scrapeMahabhunakshaViaApi(params = {}) {
    let fetch;
    try { fetch = require('node-fetch'); } catch (_) {
      return { success: false, featureJson: null, reason: 'node-fetch not available' };
    }
    const { stateCode = 'MH', districtCode, talukaCode, villageCode, surveyNo } = params;
    if (!districtCode || !villageCode || !surveyNo)
      return { success: false, featureJson: null, reason: 'districtCode, villageCode, surveyNo required' };

    const urls = [
      `https://mahabhunakasha.maharashtra.gov.in/wfs?service=WFS&version=1.1.0` +
        `&request=GetFeature&typeName=cadastral&outputFormat=application/json` +
        `&CQL_FILTER=district_code='${districtCode}'+AND+taluka_code='${talukaCode}'` +
        `+AND+village_code='${villageCode}'+AND+survey_no='${surveyNo}'`,
      `https://mahabhunakasha.maharashtra.gov.in/api/parcel?state=${stateCode}` +
        `&district=${districtCode}&taluka=${talukaCode}&village=${villageCode}&survey=${surveyNo}&format=json`,
    ];

    for (const url of urls) {
      try {
        console.log('[MBN API] Trying:', url);
        const res  = await fetch(url, { timeout: 15000 });
        if (!res.ok) continue;
        const json = await res.json();
        if (json?.type === 'FeatureCollection' || json?.type === 'Feature')
          return { success: true, featureJson: json, reason: null };
      } catch (e) { console.warn('[MBN API] Failed:', e.message); }
    }
    return { success: false, featureJson: null, reason: 'No valid GeoJSON from API.' };
  }
}

module.exports = new MahabhulekhScraper();