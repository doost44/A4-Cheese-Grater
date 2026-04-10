import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import GIFEncoder from 'gif-encoder-2';
import { PNG } from 'pngjs';

const BASE_URL = 'http://localhost:5179/3D-Cheese-Grater/?clean';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const FRAME_COUNT = 72;      // full rotation
const FRAME_DELAY = 100;     // ms between frames
const WIDTH = 500;
const HEIGHT = 600;

async function captureFrames(page, modeName, buttonSelector) {
  console.log(`Capturing ${modeName} mode...`);
  // Restore UI visibility so we can click mode buttons
  await page.evaluate((sel) => {
    for (const el of document.querySelectorAll('.controls-overlay, .hint')) {
      el.style.display = '';
    }
    document.querySelector(sel)?.click();
  }, buttonSelector);
  await sleep(2000);

  // Hide UI overlay for clean capture
  await page.evaluate(() => {
    for (const el of document.querySelectorAll('.controls-overlay, .hint')) {
      el.style.display = 'none';
    }
  });

  await sleep(500);

  const frames = [];
  for (let i = 0; i < FRAME_COUNT; i++) {
    const buf = await page.screenshot({
      clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT },
      encoding: 'binary'
    });
    frames.push(buf);
    await sleep(FRAME_DELAY);
    if (i % 10 === 0) console.log(`  ${modeName}: ${i}/${FRAME_COUNT}`);
  }

  return frames;
}

function framesToGif(frames, outputPath) {
  const encoder = new GIFEncoder(WIDTH, HEIGHT, 'neuquant', false);
  encoder.setDelay(66);  // ~15fps
  encoder.setRepeat(0);  // loop forever
  encoder.setQuality(10);
  encoder.start();

  for (const buf of frames) {
    const png = PNG.sync.read(buf);
    encoder.addFrame(png.data);
  }

  encoder.finish();
  const gifBuf = encoder.out.getData();
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, gifBuf);
  console.log(`Created: ${outputPath} (${(gifBuf.length / 1024).toFixed(0)}KB)`);
}

async function main() {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=d3d11']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: WIDTH, height: HEIGHT });

  console.log('Loading 3D scene...');
  await page.goto(BASE_URL, { waitUntil: 'networkidle0', timeout: 30000 });
  await sleep(5000); // extra time for 3D to fully load

  // Debug: check if Three.js scene is accessible
  const hasScene = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    const fiber = canvas?.__r$;
    console.log('fiber keys:', fiber ? Object.keys(fiber) : 'none');
    const state = fiber?.getState?.();
    console.log('has scene:', !!state?.scene);
    return !!state?.scene;
  });
  console.log('Three.js scene accessible:', hasScene);

  const safeFrames = await captureFrames(page, 'safe', '.mode-btn.safe');
  const proFrames = await captureFrames(page, 'pro', '.mode-btn.pro');

  await browser.close();

  fs.writeFileSync('assets/images/test-safe-frame.png', safeFrames[0]);
  fs.writeFileSync('assets/images/test-pro-frame.png', proFrames[0]);

  framesToGif(safeFrames, 'assets/images/grater-safe.gif');
  framesToGif(proFrames, 'assets/images/grater-pro.gif');

  console.log('Done!');
}

main().catch(err => { console.error(err); process.exit(1); });
