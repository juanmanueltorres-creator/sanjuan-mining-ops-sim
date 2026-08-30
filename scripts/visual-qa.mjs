import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const SERVER_URL = 'http://127.0.0.1:4173';
const VIEWPORTS = [
  { name: 'desktop-1440x900', width: 1440, height: 900 },
  { name: 'tablet-1024x768', width: 1024, height: 768 },
  { name: 'mobile-390x844', width: 390, height: 844 },
];

function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ].filter(Boolean);
  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) throw new Error(`Chrome/Chromium executable not found. Checked: ${candidates.join(', ')}`);
  return found;
}

async function waitForServer(timeoutMs = 30_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(SERVER_URL);
      if (response.ok) return;
    } catch {
      // Preview server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Vite preview did not become ready within ${timeoutMs} ms`);
}

function assertReport(report, viewportName) {
  const failures = [];
  if (report.pageHorizontalOverflow > 1) failures.push(`page horizontal overflow ${report.pageHorizontalOverflow}px`);
  for (const item of report.items) {
    if (!item.exists) {
      failures.push(`${item.selector}: missing`);
      continue;
    }
    if (!item.visible) failures.push(`${item.selector}: not visible`);
    if (!item.inViewport) failures.push(`${item.selector}: outside viewport (${JSON.stringify(item.rect)})`);
    if (item.horizontalOverflow > 1 && !item.allowsHorizontalScroll) {
      failures.push(`${item.selector}: clipped horizontally by ${item.horizontalOverflow}px`);
    }
  }
  if (failures.length) throw new Error(`${viewportName} visual QA failed:\n- ${failures.join('\n- ')}`);
}

async function clickButtonByText(page, label) {
  const clicked = await page.evaluate((text) => {
    const button = [...document.querySelectorAll('button')].find((candidate) => candidate.textContent?.trim() === text);
    if (!button) return false;
    button.click();
    return true;
  }, label);
  if (!clicked) throw new Error(`Button not found: ${label}`);
}

async function inspectCoreLayout(page) {
  return page.evaluate(() => {
    const selectors = ['.map-stage', '.command-hud', '.map-status', '.timeline', '.map-instruments'];
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    const inspect = (selector) => {
      const element = document.querySelector(selector);
      if (!(element instanceof HTMLElement)) return { selector, exists: false };
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return {
        selector,
        exists: true,
        visible: style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0,
        inViewport: rect.left >= -1 && rect.top >= -1 && rect.right <= viewport.width + 1 && rect.bottom <= viewport.height + 1,
        horizontalOverflow: Math.max(0, element.scrollWidth - element.clientWidth),
        allowsHorizontalScroll: ['auto', 'scroll'].includes(style.overflowX),
        rect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height },
      };
    };
    return {
      pageHorizontalOverflow: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
      items: selectors.map(inspect),
    };
  });
}

async function inspectDrawer(page) {
  return page.evaluate(() => {
    const drawer = document.querySelector('.analysis-drawer');
    const scroller = document.querySelector('.analysis-drawer-scroll');
    if (!(drawer instanceof HTMLElement) || !(scroller instanceof HTMLElement)) {
      return { ok: false, reason: 'drawer or internal scroller missing' };
    }
    const rect = drawer.getBoundingClientRect();
    const style = getComputedStyle(drawer);
    const scrollerStyle = getComputedStyle(scroller);
    const maxExpectedWidth = Math.min(420, window.innerWidth - 20);
    const zIndex = Number.parseInt(style.zIndex, 10);
    const reasons = [];
    if (!['absolute', 'fixed'].includes(style.position)) reasons.push(`drawer position is ${style.position}`);
    if (rect.left < -1 || rect.top < -1 || rect.right > window.innerWidth + 1 || rect.bottom > window.innerHeight + 1) {
      reasons.push('drawer escapes viewport');
    }
    if (rect.width > maxExpectedWidth + 1) reasons.push(`drawer width ${rect.width}px > ${maxExpectedWidth}px`);
    if (!Number.isFinite(zIndex) || zIndex < 4) reasons.push(`drawer z-index ${style.zIndex || '(auto)'} is below operational overlays`);
    if (!['auto', 'scroll'].includes(scrollerStyle.overflowY)) reasons.push(`drawer scroller overflow-y is ${scrollerStyle.overflowY}`);
    if (drawer.scrollWidth - drawer.clientWidth > 1) reasons.push(`drawer horizontal overflow ${drawer.scrollWidth - drawer.clientWidth}px`);
    return {
      ok: reasons.length === 0,
      reason: reasons.join('; '),
      rect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height },
    };
  });
}

const viteBinary = path.join(process.cwd(), 'node_modules', '.bin', process.platform === 'win32' ? 'vite.cmd' : 'vite');
const server = spawn(viteBinary, ['preview', '--host', '127.0.0.1', '--port', '4173'], {
  stdio: ['ignore', 'pipe', 'pipe'],
});
server.stdout.on('data', (chunk) => process.stdout.write(`[vite] ${chunk}`));
server.stderr.on('data', (chunk) => process.stderr.write(`[vite] ${chunk}`));

let browser;
try {
  await waitForServer();
  await mkdir(path.join(process.cwd(), 'artifacts', 'visual-qa'), { recursive: true });
  browser = await puppeteer.launch({
    executablePath: findChrome(),
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--enable-webgl',
      '--ignore-gpu-blocklist',
      '--use-gl=swiftshader',
    ],
  });

  for (const viewport of VIEWPORTS) {
    const page = await browser.newPage();
    const diagnostics = [];
    page.on('console', (message) => {
      if (['error', 'warning'].includes(message.type())) diagnostics.push(`console:${message.type()}: ${message.text()}`);
    });
    page.on('pageerror', (error) => diagnostics.push(`pageerror: ${error.message}`));
    page.on('requestfailed', (request) => {
      const failure = request.failure();
      diagnostics.push(`requestfailed: ${request.url()} ${failure?.errorText ?? ''}`.trim());
    });

    await page.setViewport({ width: viewport.width, height: viewport.height, deviceScaleFactor: 1 });
    await page.goto(SERVER_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });

    try {
      await page.waitForSelector('.intro-overlay', { visible: true, timeout: 10_000 });
    } catch (error) {
      const dom = await page.evaluate(() => ({
        title: document.title,
        bodyText: document.body?.innerText?.slice(0, 1200) ?? '',
        rootHtml: document.querySelector('#root')?.innerHTML?.slice(0, 2000) ?? '',
      }));
      await page.screenshot({
        path: path.join(process.cwd(), 'artifacts', 'visual-qa', `${viewport.name}-bootstrap-failure.png`),
        fullPage: false,
      });
      throw new Error(`${viewport.name}: intro did not render. DOM=${JSON.stringify(dom)} diagnostics=${JSON.stringify(diagnostics)} cause=${error.message}`);
    }

    const introReport = await page.evaluate(() => {
      const card = document.querySelector('.intro-card');
      if (!(card instanceof HTMLElement)) return { inViewport: false, horizontalOverflow: 999 };
      const rect = card.getBoundingClientRect();
      return {
        inViewport: rect.left >= -1 && rect.top >= -1 && rect.right <= window.innerWidth + 1 && rect.bottom <= window.innerHeight + 1,
        horizontalOverflow: Math.max(0, card.scrollWidth - card.clientWidth),
      };
    });
    if (!introReport.inViewport || introReport.horizontalOverflow > 1) {
      throw new Error(`${viewport.name}: intro card clipped or outside viewport`);
    }

    await clickButtonByText(page, 'START SHIFT');
    await page.waitForSelector('.command-hud', { visible: true, timeout: 10_000 });
    await page.waitForFunction(() => document.body.textContent?.includes('BACKGROUND TRAFFIC · SYNTHETIC'), { timeout: 10_000 });

    assertReport(await inspectCoreLayout(page), viewport.name);

    const creditVisible = await page.evaluate(() => {
      const credit = document.querySelector('.cesium-widget-credits');
      if (!(credit instanceof HTMLElement)) return false;
      const rect = credit.getBoundingClientRect();
      const style = getComputedStyle(credit);
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    });
    if (!creditVisible) throw new Error(`${viewport.name}: Cesium/provider attribution is not visible`);

    await clickButtonByText(page, 'Sources');
    await page.waitForSelector('.analysis-drawer', { visible: true, timeout: 5_000 });
    const drawerReport = await inspectDrawer(page);
    if (!drawerReport.ok) throw new Error(`${viewport.name}: ${drawerReport.reason}`);

    await page.screenshot({
      path: path.join(process.cwd(), 'artifacts', 'visual-qa', `${viewport.name}.png`),
      fullPage: false,
    });
    await page.close();
    console.log(`Visual QA passed: ${viewport.name}`);
  }
} finally {
  if (browser) await browser.close();
  server.kill('SIGTERM');
}
