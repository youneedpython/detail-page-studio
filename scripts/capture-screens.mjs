// Usage: node scripts/capture-screens.mjs <url> <outDir> <prefix> <width...>  (예: http://localhost:3000/ docs/images/task-0NN home 390 768 1280)
// Captures full-page PNGs at exact viewport widths through the Chrome DevTools Protocol.
// Optional CAPTURE_STORAGE=<json file> seeds localStorage ({ "name": value }) on the page origin first.
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const [url, outDir, prefix, ...widths] = process.argv.slice(2);
const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const port = 9333;
const profile = mkdtempSync(path.join(tmpdir(), 'cdp-'));
const proc = spawn(chrome, ['--headless=new', '--disable-gpu', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });

const sleep = ms => new Promise(r => setTimeout(r, ms));
let target;
for (let i = 0; i < 50 && !target; i++) {
  try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find(t => t.type === 'page'); } catch { await sleep(200); }
}
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener('open', r, { once: true }));
let id = 0;
const pending = new Map();
ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } });
const send = (method, params = {}) => new Promise(r => { pending.set(++id, r); ws.send(JSON.stringify({ id, method, params })); });

await send('Page.enable');
if (process.env.CAPTURE_STORAGE) {
  const entries = JSON.parse(readFileSync(process.env.CAPTURE_STORAGE, 'utf8'));
  await send('Page.navigate', { url: new URL(url).origin });
  await sleep(1500);
  const script = Object.entries(entries).map(([name, value]) => `localStorage.setItem(${JSON.stringify(name)}, ${JSON.stringify(typeof value === 'string' ? value : JSON.stringify(value))});`).join('');
  await send('Runtime.evaluate', { expression: script });
}
for (const w of widths.map(Number)) {
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: 900, deviceScaleFactor: 1, mobile: w < 600 });
  await send('Page.navigate', { url });
  await sleep(2000);
  const { cssContentSize } = await send('Page.getLayoutMetrics');
  const height = Math.max(900, Math.ceil(cssContentSize.height));
  const { data } = await send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: w, height, scale: 1 }, captureBeyondViewport: true });
  writeFileSync(path.join(outDir, `${prefix}-${w}.png`), Buffer.from(data, 'base64'));
  console.log('saved', `${prefix}-${w}.png`, w, height);
}
ws.close();
proc.kill();
