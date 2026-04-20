const puppeteer = require('puppeteer');
const fs = require('fs');

(async () => {
  const browser = await puppeteer.connect({
    browserURL: 'http://localhost:9222',
    defaultViewport: null
  });

  const pages = await browser.pages();
  console.log('Total tabs:', pages.length);
  for (let i = 0; i < pages.length; i++) {
    console.log(i, pages[i].url());
  }

  // Find the mahabhunaksha tab
  let page = null;
  for (const p of pages) {
    const url = p.url();
    if (url.includes('mahabhumi.gov.in')) {
      page = p;
      break;
    }
  }

  if (!page) {
    console.error('Mahabhunaksha tab not found!');
    await browser.disconnect();
    return;
  }

  console.log('Connected to:', page.url());

  await page.waitForFunction(() => {
    const el = document.getElementById('level_2');
    return el && el.options.length > 1;
  }, { timeout: 15000 });

  const districts = await page.evaluate(() => {
    const select = document.getElementById('level_2');
    return Array.from(select.options)
      .filter(o => o.value && o.text.trim() !== '--Select--')
      .map(o => ({ id: o.value, name: o.text.trim() }));
  });

  console.log(`Found ${districts.length} districts`);
  const result = [];

  for (const district of districts) {
    console.log(`Scraping district: ${district.name}`);

    await page.evaluate((id) => {
      const select = document.getElementById('level_2');
      select.value = id;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }, district.id);

    await page.waitForFunction(() => {
      const el = document.getElementById('level_3');
      return el && el.options.length > 1;
    }, { timeout: 10000 }).catch(() => console.log('  Taluka load timeout'));

    await new Promise(r => setTimeout(r, 1000));

    const talukas = await page.evaluate(() => {
      const select = document.getElementById('level_3');
      if (!select) return [];
      return Array.from(select.options)
        .filter(o => o.value && o.text.trim() !== '--Select--')
        .map(o => ({ id: o.value, name: o.text.trim() }));
    });

    console.log(`  Found ${talukas.length} talukas`);
    const districtData = { ...district, talukas: [] };

    for (const taluka of talukas) {
      console.log(`  Scraping taluka: ${taluka.name}`);

      await page.evaluate((id) => {
        const select = document.getElementById('level_3');
        select.value = id;
        select.dispatchEvent(new Event('change', { bubbles: true }));
      }, taluka.id);

      await page.waitForFunction(() => {
        const el = document.getElementById('level_4');
        return el && el.options.length > 1;
      }, { timeout: 10000 }).catch(() => console.log('    Village load timeout'));

      await new Promise(r => setTimeout(r, 1000));

      const villages = await page.evaluate(() => {
        const select = document.getElementById('level_4');
        if (!select) return [];
        return Array.from(select.options)
          .filter(o => o.value && o.text.trim() !== '--Select--')
          .map(o => ({ id: o.value, name: o.text.trim() }));
      });

      console.log(`    Found ${villages.length} villages`);
      districtData.talukas.push({ ...taluka, villages });
    }

    result.push(districtData);
    fs.writeFileSync('maharashtra_full.json', JSON.stringify(result, null, 2));
    console.log(`  Saved progress (${result.length}/${districts.length} districts done)`);
  }

  console.log('Done! Saved to maharashtra_full.json');
  await browser.disconnect();
})();