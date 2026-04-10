// src/services/mahabhulekh/scraper.service.js

const path = require('path');
const puppeteer = require('puppeteer');
const dotenv = require('dotenv');
dotenv.config();

const delay = (ms) => new Promise(res => setTimeout(res, ms));

const LAUNCH_OPTS = {
  headless: false,
  slowMo: 50,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security'],
  defaultViewport: { width: 1366, height: 900 },
};

const ID = {
  district:        'ContentPlaceHolder1_ddlMainDist',
  taluka:          'ContentPlaceHolder1_ddlTalForAll',
  village:         'ContentPlaceHolder1_ddlVillForAll',
  rbtnSearchTypeCTS: 'ContentPlaceHolder1_rbtnSearchType_0',
  ctsInput:        'ContentPlaceHolder1_txtcsno',
  searchBtn:       'ContentPlaceHolder1_btnsearchfind',
  surveyResult:    'ContentPlaceHolder1_ddlsurveyno',
  mobileInput:     'ContentPlaceHolder1_txtmobile1',
  captchaInput:    'ContentPlaceHolder1_txtcaptcha',
};

const SITE_URL = 'https://bhulekh.mahabhumi.gov.in/NewBhulekh.aspx';

// Directory where captured images are saved.
// Override via IMAGE_SAVE_DIR env var; defaults to process.cwd().
const IMAGE_SAVE_DIR = process.env.IMAGE_SAVE_DIR || process.cwd();

class MahabhulekhScraper {

  async scrapeLandRecord(params = {}) {
    const {
      districtValue,
      talukaValue,
      villageValue,
      fullSurveyInput,
      mobile = '9999999999',
    } = params;

    let browser       = null;
    let finalHTML     = '';
    let match         = null;
    let mainImagePath = null; // ← absolute path to saved PNG (set when image-based)

    try {
      browser = await puppeteer.launch(LAUNCH_OPTS);
      const page = await browser.newPage();

      await page.evaluateOnNewDocument(() => {
        Object.defineProperty(Function.prototype, 'caller', { get: () => null });
        Object.defineProperty(Function.prototype, 'callee', { get: () => null });
      });

      await page.goto(SITE_URL, { waitUntil: 'networkidle2', timeout: 60000 });
      await delay(4000);

      // ── Fill district / taluka / village ───────────────────────────────────
      let frame = await this.findFrameWithElement(page, `#${ID.district}`);
      await this.setSelectValue(frame, ID.district, districtValue);
      await delay(1800);

      await this.setSelectValue(frame, ID.taluka, talukaValue);
      await delay(1800);

      await this.setSelectValue(frame, ID.village, villageValue);
      await delay(3000);

      // ── CTS search type ────────────────────────────────────────────────────
      frame = await this.findFrameWithElement(page, `#${ID.rbtnSearchTypeCTS}`);
      await frame.evaluate(id => document.getElementById(id)?.click(), ID.rbtnSearchTypeCTS);
      await delay(2000);

      // ── Survey prefix ──────────────────────────────────────────────────────
      const prefix = fullSurveyInput.split('/')[0].trim();
      frame = await this.findFrameWithElement(page, `#${ID.ctsInput}`);
      await frame.type(`#${ID.ctsInput}`, prefix, { delay: 80 });
      await delay(1500);

      // ── Search ─────────────────────────────────────────────────────────────
      frame = await this.findFrameWithElement(page, `#${ID.searchBtn}`);
      await frame.click(`#${ID.searchBtn}`);
      await delay(2500);

      // ── Select survey number from dropdown ────────────────────────────────
      frame = await this.findFrameWithElement(page, `#${ID.surveyResult}`);
      const surveyOptions = await frame.$$eval(`#${ID.surveyResult} option`, opts =>
        opts.map(o => ({ label: o.textContent.trim(), value: o.value })).filter(o => o.label)
      );
      match = surveyOptions.find(o => o.label === fullSurveyInput) || surveyOptions[0];
      if (match) await this.setSelectValue(frame, ID.surveyResult, match.value);
      await delay(2500);

      // ── Mobile number ──────────────────────────────────────────────────────
      console.log(`Entering Mobile: ${mobile}`);
      frame = await this.findFrameWithElement(page, `#${ID.mobileInput}`);
      await frame.evaluate((id, val) => {
        const el = document.getElementById(id);
        if (el) {
          el.focus();
          el.value = val;
          ['input', 'change', 'blur'].forEach(ev =>
            el.dispatchEvent(new Event(ev, { bubbles: true }))
          );
        }
      }, ID.mobileInput, mobile);

      await delay(2000);

      console.log('\nPlease solve the CAPTCHA and CLICK the SUBMIT button yourself.');
      console.log('Wait until you see the big 7/12 result image on screen.');
      console.log('Do not close the browser until you see "Result page loaded successfully!"');

      await delay(4000);

      // ── Poll for result ────────────────────────────────────────────────────
      const startTime   = Date.now();
      const MAX_WAIT_MS = 300000; // 5 minutes
      let successDetected = false;

      while (Date.now() - startTime < MAX_WAIT_MS) {
        await delay(3000);

        try {
          finalHTML = await page.content();
        } catch (e) {
          return {
            verified: false,
            reason:   'Browser closed unexpectedly',
            html:     '',
            retry:    true,
            imageBased:    false,
            mainImagePath: null,
          };
        }

        const lowerHTML = finalHTML.toLowerCase();
        const elapsed   = Math.floor((Date.now() - startTime) / 1000);

        const hasCaptchaError =
          lowerHTML.includes('invalid captcha') ||
          lowerHTML.includes('कॅप्चा चुकीचा') ||
          lowerHTML.includes('incorrect captcha');

        const largeImageCount = await this.getLargeImageCount(page);

        const hasResultButton =
          lowerHTML.includes('back')    || lowerHTML.includes('print')    ||
          lowerHTML.includes('download')|| lowerHTML.includes('मागे')     ||
          lowerHTML.includes('प्रिंट');

        console.log(
          `[Poll] largeImgCount=${largeImageCount} | resultBtn=${hasResultButton} | ` +
          `htmlLen=${finalHTML.length} | captchaErr=${hasCaptchaError} | elapsed=${elapsed}s`
        );

        const isRealResult =
          largeImageCount >= 1 &&
          hasResultButton &&
          finalHTML.length > 650000 &&
          !hasCaptchaError;

        if (isRealResult) {
          console.log('Result page loaded successfully! (Image-based 7/12 result detected)');
          successDetected = true;

          // ── Capture PNG and get back its absolute path ─────────────────
          mainImagePath = await this.captureMainResultImage(page, fullSurveyInput);

          break;
        }

        if (hasCaptchaError) {
          console.log('Still showing CAPTCHA error. Please re-enter correct CAPTCHA and click Submit again.');
        }
      }

      // ── Return ─────────────────────────────────────────────────────────────
      return {
        verified:      successDetected,
        surveyLabel:   match?.label || fullSurveyInput,
        html:          finalHTML,
        pdfBuffer:     null,

        // Image-based fields — controller checks these to route OCR path
        imageBased:    successDetected && mainImagePath !== null,
        mainImagePath: mainImagePath,

        retry:  !successDetected,
        reason: successDetected ? null : 'Result not detected within timeout',
      };

    } catch (err) {
      console.error('Scraper ERROR:', err.message);
      return {
        verified:      false,
        reason:        err.message,
        html:          finalHTML || '',
        pdfBuffer:     null,
        imageBased:    false,
        mainImagePath: null,
        retry:         true,
      };
    } finally {
      if (browser) {
        // await browser.close();
      }
    }
  }

  // ── captureMainResultImage ────────────────────────────────────────────────
  /**
   * Captures the largest result image on the page and saves it to IMAGE_SAVE_DIR.
   *
   * @param {import('puppeteer').Page} page
   * @param {string} fullSurveyInput
   * @returns {Promise<string|null>} Absolute path to the saved PNG, or null on failure.
   */
  async captureMainResultImage(page, fullSurveyInput) {
    const safeSurvey = fullSurveyInput.replace(/[^a-zA-Z0-9]/g, '_');

    try {
      console.log('Capturing main 7/12 result image...');
      await delay(1500); // let image fully render

      const imageHandle = await page.evaluateHandle(() => {
        const images = Array.from(document.querySelectorAll('img'));
        let best    = null;
        let maxArea = 0;

        for (const img of images) {
          const w    = img.naturalWidth  || img.clientWidth  || 0;
          const h    = img.naturalHeight || img.clientHeight || 0;
          const area = w * h;
          if (area > maxArea && w > 600 && h > 300) {
            maxArea = area;
            best    = img;
          }
        }
        return best;
      });

      if (imageHandle && (await imageHandle.asElement())) {
        const filename     = `land_record_main_${safeSurvey}_${Date.now()}.png`;
        const absolutePath = path.resolve(IMAGE_SAVE_DIR, filename);

        await imageHandle.screenshot({
          path:            absolutePath,
          type:            'png',
          omitBackground:  true,
        });

        console.log(`Main result image saved: ${absolutePath}`);
        return absolutePath; // ← returned to caller
      }

      // Fallback: full-page screenshot
      console.log('Could not isolate main image — saving full page as fallback.');
      return await this._saveFullPageFallback(page, safeSurvey);

    } catch (e) {
      console.log('Image capture error:', e.message);
      try {
        return await this._saveFullPageFallback(page, safeSurvey);
      } catch (_) {
        return null;
      }
    }
  }

  /**
   * Full-page screenshot fallback.
   * @returns {Promise<string>} Absolute path to saved PNG.
   */
  async _saveFullPageFallback(page, safeSurvey) {
    const filename     = `land_record_full_${safeSurvey}_${Date.now()}.png`;
    const absolutePath = path.resolve(IMAGE_SAVE_DIR, filename);
    await page.screenshot({ fullPage: true, path: absolutePath, type: 'png' });
    console.log(`Fallback full-page screenshot saved: ${absolutePath}`);
    return absolutePath;
  }

  // ── getLargeImageCount ────────────────────────────────────────────────────
  async getLargeImageCount(page) {
    let count = 0;
    for (const f of page.frames()) {
      try {
        const found = await f.evaluate(() =>
          Array.from(document.querySelectorAll('img'))
            .filter(img => (img.naturalWidth || img.clientWidth || 0) > 600)
            .length
        );
        count += found;
      } catch (_) {}
    }
    return count;
  }

  // ── setSelectValue ────────────────────────────────────────────────────────
  async setSelectValue(frame, id, value) {
    return frame.evaluate((id, val) => {
      const el = document.getElementById(id);
      if (el) {
        el.value = val;
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }
      return !!el;
    }, id, value);
  }

  // ── findFrameWithElement ──────────────────────────────────────────────────
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
}

module.exports = new MahabhulekhScraper();