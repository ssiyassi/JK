// Jentis CMO Telegram bot from the laptop: sends content packages (files + caption + posting guide) to the owner.
// Token in .telegram-cmo-token (scripts/save-telegram-cmo-token.sh), chat id in .telegram-cmo-chat (found once from
// the owner's first message to the bot). Neither is printed or committed.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';

const ROOT = new URL('../', import.meta.url);
const token = () => readFileSync(new URL('.telegram-cmo-token', ROOT), 'utf8').trim();
const api = (method) => `https://api.telegram.org/bot${token()}/${method}`;

async function call(method, body) {
  const res = await fetch(api(method), body instanceof FormData ? { method: 'POST', body } : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}) });
  const json = await res.json();
  if (!json.ok) throw new Error(`Telegram ${method}: ${json.description}`);
  return json.result;
}

/** The owner's chat: saved on first use from the latest private message sent to the bot. */
export async function chatId() {
  const file = new URL('.telegram-cmo-chat', ROOT);
  if (existsSync(file)) return readFileSync(file, 'utf8').trim();
  const updates = await call('getUpdates', { limit: 50 });
  const msg = updates.map((u) => u.message).filter((m) => m?.chat?.type === 'private').pop();
  if (!msg) throw new Error('No message found: send any message to the Jentis CMO bot first.');
  writeFileSync(file, String(msg.chat.id), { mode: 0o600 });
  return String(msg.chat.id);
}

export async function sendText(text) {
  return call('sendMessage', { chat_id: await chatId(), text, disable_web_page_preview: true });
}

/** Sends a file uncompressed (as a document), so the owner saves the full-quality KV/video for Instagram. */
export async function sendFile(path, caption = '') {
  const form = new FormData();
  form.append('chat_id', await chatId());
  form.append('document', new Blob([readFileSync(path)]), basename(path));
  if (caption) form.append('caption', caption);
  return call('sendDocument', form);
}

/** Sends a compressed preview photo (shows inline in the chat). */
export async function sendPhoto(path, caption = '') {
  const form = new FormData();
  form.append('chat_id', await chatId());
  form.append('photo', new Blob([readFileSync(path)]), basename(path));
  if (caption) form.append('caption', caption);
  return call('sendPhoto', form);
}

if (import.meta.url === `file://${process.argv[1]}` && process.argv[2] === 'test') {
  await sendText('✅ Jentis CMO siap. Mulai sekarang KV, caption, dan panduan posting Instagram dikirim lewat sini.');
  console.log('test message sent');
}
