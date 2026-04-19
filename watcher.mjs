import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const DEFAULT_WATCH_DIRS = [
  path.join(process.env.HOME || os.homedir() || '/root', '.openclaw/agents/main/sessions'),
];

const WATCH_DIRS = (process.env.WATCH_DIRS || DEFAULT_WATCH_DIRS.join(':'))
  .split(':')
  .filter(Boolean);
const RELAY_URL = process.env.RELAY_URL || 'http://66.212.21.208:8799/notify';
const RELAY_AUTH = process.env.RELAY_AUTH || '';
const OFFSETS_PATH = process.env.OFFSETS_PATH || path.join(process.env.HOME || '/root', '.perspective-push-bridge/offsets.json');
const NOTIFY_TITLE = process.env.NOTIFY_TITLE || 'Perspective Agents';
const GATEWAY_LABEL = process.env.GATEWAY_LABEL || os.hostname();
const LOG_PREFIX = '[push-bridge]';

let offsets = {};

async function loadOffsets() {
  try { offsets = JSON.parse(await fsp.readFile(OFFSETS_PATH, 'utf8')); }
  catch { offsets = {}; }
}

async function saveOffsets() {
  await fsp.mkdir(path.dirname(OFFSETS_PATH), { recursive: true });
  await fsp.writeFile(OFFSETS_PATH, JSON.stringify(offsets, null, 2));
}

function cleanText(raw) {
  return String(raw || '')
    .replace(/\[\[reply_to_current\]\]\s*/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180);
}

async function sendNotify(body) {
  try {
    const res = await fetch(RELAY_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-relay-auth': RELAY_AUTH },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      console.error(LOG_PREFIX, 'relay responded', res.status, await res.text());
    }
  } catch (err) {
    console.error(LOG_PREFIX, 'relay call failed', err.message);
  }
}

async function processFile(filePath, { firstScan = false } = {}) {
  let stat;
  try { stat = await fsp.stat(filePath); } catch { return; }
  const prev = offsets[filePath] ?? (firstScan ? stat.size : 0);
  if (stat.size === prev) return;
  if (stat.size < prev) {
    offsets[filePath] = stat.size;
    await saveOffsets();
    return;
  }
  const fd = await fsp.open(filePath, 'r');
  try {
    const len = stat.size - prev;
    const buf = Buffer.alloc(len);
    await fd.read(buf, 0, len, prev);
    const lines = buf.toString('utf8').split('\n').filter(Boolean);
    for (const line of lines) {
      let obj;
      try { obj = JSON.parse(line); } catch { continue; }
      if (obj?.type !== 'message') continue;
      if (obj?.message?.role !== 'assistant') continue;
      const content = Array.isArray(obj?.message?.content) ? obj.message.content : [];
      const text = content
        .filter((part) => part && typeof part.text === 'string')
        .map((part) => part.text)
        .join(' ');
      const body = cleanText(text);
      if (!body) continue;
      const sessionId = path.basename(filePath, '.jsonl');
      await sendNotify({
        title: NOTIFY_TITLE,
        body,
        runId: obj.id || `${sessionId}:${obj.timestamp || Date.now()}`,
        chatId: sessionId,
        custom: { gatewayLabel: GATEWAY_LABEL },
      });
    }
    offsets[filePath] = stat.size;
    await saveOffsets();
  } finally {
    await fd.close();
  }
}

async function initialScan() {
  for (const dir of WATCH_DIRS) {
    let entries;
    try { entries = await fsp.readdir(dir); } catch { continue; }
    for (const name of entries) {
      if (!name.endsWith('.jsonl')) continue;
      const filePath = path.join(dir, name);
      try {
        const stat = await fsp.stat(filePath);
        if (offsets[filePath] === undefined) offsets[filePath] = stat.size;
      } catch {}
    }
  }
  await saveOffsets();
}

let scheduled = false;
function scheduleScan() {
  if (scheduled) return;
  scheduled = true;
  setTimeout(async () => {
    scheduled = false;
    for (const dir of WATCH_DIRS) {
      let entries;
      try { entries = await fsp.readdir(dir); } catch { continue; }
      for (const name of entries) {
        if (name.endsWith('.jsonl')) {
          await processFile(path.join(dir, name));
        }
      }
    }
  }, 400);
}

async function main() {
  if (!RELAY_AUTH) {
    console.error(LOG_PREFIX, 'RELAY_AUTH env is empty; refusing to start');
    process.exit(1);
  }
  await loadOffsets();
  await initialScan();
  console.log(LOG_PREFIX, 'watching', WATCH_DIRS.join(', '), 'relay', RELAY_URL);

  for (const dir of WATCH_DIRS) {
    try {
      fs.watch(dir, { persistent: true }, (_event, filename) => {
        if (!filename || !String(filename).endsWith('.jsonl')) return;
        scheduleScan();
      });
    } catch (err) {
      console.error(LOG_PREFIX, 'fs.watch failed for', dir, err.message);
    }
  }
  setInterval(scheduleScan, 15000);
}

main().catch((err) => { console.error(err); process.exit(1); });
