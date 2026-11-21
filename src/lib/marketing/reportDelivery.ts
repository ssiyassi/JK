// Prints the marketing report HTML to PDF with Cloudflare Browser Rendering (binding BROWSER, Workers Paid) and sends
// it to the owner's Telegram (CMO bot) as a document with a short caption.
import puppeteer from '@cloudflare/puppeteer';
import { botToken, type TelegramBot, type TelegramEnv } from '../notify/telegram.ts';

type BrowserBinding = Parameters<typeof puppeteer.launch>[0];

export async function htmlToPdf(browserBinding: BrowserBinding, html: string): Promise<Uint8Array> {
  const browser = await puppeteer.launch(browserBinding);
  try {
    const page = await browser.newPage();
    // The page is all inline except the logo: wait for the HTML, then give the logo a few seconds. A slow logo
    // download must never stop the report (2026-11-08: "Navigation timeout of 20000 ms exceeded" twice).
    await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForNetworkIdle({ idleTime: 300, timeout: 8000 }).catch(() => {});
    const pdf = await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true });
    return new Uint8Array(pdf);
  } finally {
    await browser.close();
  }
}

/** Sends a file to the owner's chat; returns false when the bot is not configured or Telegram refuses. */
export async function sendTelegramDocument(
  env: TelegramEnv,
  bot: TelegramBot,
  file: Uint8Array,
  filename: string,
  caption: string,
  fetchFn: (url: string, init: RequestInit) => Promise<Response> = fetch,
): Promise<boolean> {
  const token = botToken(env, bot);
  if (!token || !env.TELEGRAM_CHAT_ID) return false;
  const form = new FormData();
  form.append('chat_id', env.TELEGRAM_CHAT_ID);
  form.append('caption', caption.slice(0, 1000));
  form.append('document', new Blob([file as BlobPart], { type: 'application/pdf' }), filename);
  const res = await fetchFn(`https://api.telegram.org/bot${token}/sendDocument`, { method: 'POST', body: form });
  return res.ok;
}

/** One JPEG per page (each HTML is a fixed-size poster, e.g. a 1080x1920 story), in one browser session. */
export async function htmlToJpegs(browserBinding: BrowserBinding, pages: string[], width: number, height: number): Promise<Uint8Array[]> {
  const browser = await puppeteer.launch(browserBinding);
  try {
    const out: Uint8Array[] = [];
    for (const html of pages) {
      const page = await browser.newPage();
      await page.setViewport({ width, height, deviceScaleFactor: 1 });
      await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: 30000 });
      // Photos and Google Fonts: wait for them, but never longer than a few seconds.
      await page.waitForNetworkIdle({ idleTime: 500, timeout: 12000 }).catch(() => {});
      await page.evaluate(() => document.fonts.ready).catch(() => {});
      out.push(new Uint8Array(await page.screenshot({ type: 'jpeg', quality: 90, clip: { x: 0, y: 0, width, height } })));
      await page.close();
    }
    return out;
  } finally {
    await browser.close();
  }
}

/** Sends pictures as one album (2–10) with the caption under the first; false when not configured or refused. */
export async function sendTelegramPhotos(
  env: TelegramEnv,
  bot: TelegramBot,
  photos: { file: Uint8Array; filename: string }[],
  caption: string,
  fetchFn: (url: string, init: RequestInit) => Promise<Response> = fetch,
): Promise<boolean> {
  const token = botToken(env, bot);
  if (!token || !env.TELEGRAM_CHAT_ID) return false;
  const form = new FormData();
  form.append('chat_id', env.TELEGRAM_CHAT_ID);
  form.append(
    'media',
    JSON.stringify(photos.map((p, i) => ({ type: 'photo', media: `attach://photo${i}`, ...(i === 0 ? { caption: caption.slice(0, 1000) } : {}) }))),
  );
  photos.forEach((p, i) => form.append(`photo${i}`, new Blob([p.file as BlobPart], { type: 'image/jpeg' }), p.filename));
  const res = await fetchFn(`https://api.telegram.org/bot${token}/sendMediaGroup`, { method: 'POST', body: form });
  return res.ok;
}
