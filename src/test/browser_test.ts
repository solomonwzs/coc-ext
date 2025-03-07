import puppeteer from 'puppeteer-core';
import { Page } from 'puppeteer-core';

function autoScroll(page: Page) {
  return page.evaluate(() => {
    return new Promise((resolve, _reject) => {
      var totalHeight = 0;
      var distance = 100;
      var timer = setInterval(() => {
        var scrollHeight = document.body.scrollHeight;
        window.scrollBy(0, distance);
        totalHeight += distance;
        if (totalHeight >= scrollHeight) {
          clearInterval(timer);
          resolve(null);
        }
      }, 100);
    });
  });
}

export async function puppeteerTest() {
  let start = Date.now();

  let browser = await puppeteer.connect({
    // browserWSEndpoint: 'ws://127.0.0.1:9222',
    browserWSEndpoint:
      'ws://127.0.0.1:9222/devtools/browser/9fdbd42a-56a6-406f-add6-4f3006de51fd',
  });
  let context = await browser.createBrowserContext();
  let page = await context.newPage();

  // await page.goto('https://www.baidu.com');
  await page.goto('file:///home/solomon/tmp/pixel.html');

  const links = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('a')).map((row) => {
      return row.getAttribute('href');
    });
  });
  console.log(links);

  await autoScroll(page);
  await page.screenshot({
    path: '/tmp/1.jpg',
    fullPage: true,
  });

  await page.close();
  await context.close();
  await browser.disconnect();

  console.log(`cost ${Date.now() - start} ms`);
}
