import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const SERVER_URL = 'http://localhost:5173';
const OUTPUT_DIR = path.join(process.cwd(), 'artifacts', 'terrain-smoke');

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

async function clickButtonByText(page, label) {
  const clicked = await page.evaluate((text) => {
    const button = [...document.querySelectorAll('button')].find((candidate) => candidate.textContent?.trim() === text);
    if (!button) return false;
    button.click();
    return true;
  }, label);
  if (!clicked) throw new Error(`Button not found: ${label}`);
}

const viteBinary = path.join(process.cwd(), 'node_modules', '.bin', process.platform === 'win32' ? 'vite.cmd' : 'vite');
const server = spawn(viteBinary, ['preview', '--host', '127.0.0.1', '--port', '5173'], {
  stdio: ['ignore', 'pipe', 'pipe'],
});
server.stdout.on('data', (chunk) => process.stdout.write(`[vite] ${chunk}`));
server.stderr.on('data', (chunk) => process.stderr.write(`[vite] ${chunk}`));

let browser;
try {
  await waitForServer();
  await mkdir(OUTPUT_DIR, { recursive: true });

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

  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await page.goto(SERVER_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.waitForSelector('.intro-overlay', { visible: true, timeout: 10_000 });
  await clickButtonByText(page, 'START SHIFT');
  await page.waitForSelector('.command-hud', { visible: true, timeout: 10_000 });

  try {
    await page.waitForFunction(
      () => document.body.textContent?.includes('TERRAIN 3D'),
      { timeout: 30_000 },
    );
  } catch (error) {
    const bodyText = await page.evaluate(() => document.body?.innerText?.slice(0, 4000) ?? '');
    await page.screenshot({
      path: path.join(OUTPUT_DIR, 'terrain-smoke-failure.png'),
      fullPage: false,
    });
    throw new Error(
      `Terrain did not reach TERRAIN 3D. body=${JSON.stringify(bodyText)} diagnostics=${JSON.stringify(diagnostics)} cause=${error.message}`,
    );
  }

  await clickButtonByText(page, 'REGIONAL VIEW');
  await new Promise((resolve) => setTimeout(resolve, 8_000));

  const state = await page.evaluate(() => ({
    terrain3d: document.body.textContent?.includes('TERRAIN 3D') ?? false,
    ellipsoid: document.body.textContent?.includes('TERRAIN ELLIPSOID') ?? false,
    fallbackVisible: (() => {
      const element = document.querySelector('.map-fallback');
      if (!(element instanceof HTMLElement)) return false;
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    })(),
  }));

  if (!state.terrain3d || state.ellipsoid || state.fallbackVisible) {
    throw new Error(`Unexpected terrain smoke state: ${JSON.stringify(state)} diagnostics=${JSON.stringify(diagnostics)}`);
  }

  await page.screenshot({
    path: path.join(OUTPUT_DIR, 'veladero-terrain-1440x900.png'),
    fullPage: false,
  });

  console.log(`Terrain smoke passed: ${JSON.stringify(state)}`);
  if (diagnostics.length) console.log(`Terrain smoke diagnostics: ${JSON.stringify(diagnostics)}`);
  await page.close();
} finally {
  if (browser) await browser.close();
  server.kill('SIGTERM');
}
