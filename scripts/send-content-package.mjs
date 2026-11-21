// Sends a content package (KVs/videos as full-quality files, copy-ready captions, posting guide) to the owner via the
// Jentis CMO Telegram bot. Package = JSON list of steps in marketing/packages/<name>.json:
//   { "text": "..." } | { "file": "path from repo root", "caption": "..." } | { "photo": "path", "caption": "..." }
// Run: node scripts/send-content-package.mjs <name>
import { readFileSync } from 'node:fs';
import { sendFile, sendPhoto, sendText } from './telegram-cmo.mjs';

const ROOT = new URL('../', import.meta.url);
const name = process.argv[2];
if (!name) throw new Error('usage: node scripts/send-content-package.mjs <package name>');
const steps = JSON.parse(readFileSync(new URL(`marketing/packages/${name}.json`, ROOT), 'utf8'));
for (const s of steps) {
  if (s.text) await sendText(s.text);
  else if (s.file) await sendFile(new URL(s.file, ROOT).pathname, s.caption);
  else if (s.photo) await sendPhoto(new URL(s.photo, ROOT).pathname, s.caption);
  await new Promise((r) => setTimeout(r, 700)); // keep Telegram's order and rate limits
}
console.log(`sent ${steps.length} messages`);
