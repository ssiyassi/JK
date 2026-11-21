// Shipping labels for the OKAY D100 (4-inch thermal label printer, black only, 100 x 120 mm stickers). Drawn on a
// canvas in the browser and saved as a PNG: printed from a computer (USB driver, page size 100 x 120 mm) or opened in
// the printer's phone app. Two kinds: "reseller" (no Jentis Kitchen branding, "DARI" = the reseller) and "customer"
// (website order: logo, Google review QR code and customer care contacts). Prices are never printed.
import qrcode from 'qrcode-generator';
import { CONTACT_WHATSAPP } from './shop/catalog';

export const GOOGLE_REVIEW_URL = 'https://g.page/r/CU9ZtAQxNVBZEAI/review';
const SUPPORT_EMAIL = 'help@jentiskitchen.id';
const LOGO_URL = '/shop/brand/logo.png';
// Storage and cooking instructions (on both labels).
const CARE: { title: string; lines: string[] }[] = [
  { title: 'PETUNJUK PENYIMPANAN', lines: ['Simpan di freezer tahan 2 bulan', 'Simpan di chiller tahan 2 minggu'] },
  {
    title: 'CARA MASAK',
    lines: ['Cukup letakkan di atas teflon TANPA MINYAK, bolak-balik dan angkat ketika sudah mencapai tingkat kematangan yang disukai.'],
  },
];

interface LabelBase {
  recipientName: string;
  recipientPhone: string;
  address: string;
  notes?: string | null; // delivery notes, printed on their own line
  lines: { name: string; qty: number }[];
  deliveryDate: number | string | Date | null; // midnight UTC of the delivery day
}
export interface ResellerLabel extends LabelBase {
  kind: 'reseller';
  resellerName: string;
  resellerPhone: string | null;
}
export interface CustomerLabel extends LabelBase {
  kind: 'customer';
  orderId: string;
}
export type ShippingLabel = ResellerLabel | CustomerLabel;

// Label size in mm, drawn at 12 px per mm (above the printer's 203 dpi = 8 dots per mm).
export const LABEL_WIDTH_MM = 100;
export const LABEL_HEIGHT_MM = 120;
const W = LABEL_WIDTH_MM;
const H = LABEL_HEIGHT_MM;
const PX = 12;
const FONT = '"Helvetica Neue", Helvetica, Arial, sans-serif';
const EDGE = 2; // frame inset from the left and right edges
const EDGE_Y = 4; // frame inset from the top and bottom edges (printer margin)
const PAD = 6; // text inset from the label edge
const TEXT_W = W - PAD * 2;

/** 6285215448802 / +62 852... / 0852-1544-8802 → 085215448802. Anything that is not a plain number stays as typed. */
export function formatPhone(phone: string): string {
  const digits = phone.replace(/[\s\-().+]/g, '');
  if (!/^\d{8,15}$/.test(digits)) return phone.trim();
  return digits.startsWith('62') ? `0${digits.slice(2)}` : digits;
}

/** Delivery day in full, e.g. "SENIN, 2 NOVEMBER 2026". */
function fullDate(d: LabelBase['deliveryDate']): string | null {
  if (d === null || d === '') return null;
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).toUpperCase();
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Could not load ${src}`));
    img.src = src;
  });
}

function font(ctx: CanvasRenderingContext2D, size: number, weight = 400, italic = false) {
  ctx.font = `${italic ? 'italic ' : ''}${weight} ${size}px ${FONT}`;
}

/** Splits text into lines that fit `width` mm with the current font (long words are cut). */
function wrap(ctx: CanvasRenderingContext2D, text: string, width: number): string[] {
  const lines: string[] = [];
  for (const para of text.split(/\n/)) {
    let line = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (ctx.measureText(next).width <= width) {
        line = next;
        continue;
      }
      if (line) lines.push(line);
      line = word;
      while (ctx.measureText(line).width > width && line.length > 1) {
        let cut = line.length - 1;
        while (cut > 1 && ctx.measureText(line.slice(0, cut)).width > width) cut--;
        lines.push(line.slice(0, cut));
        line = line.slice(cut);
      }
    }
    if (line) lines.push(line);
  }
  return lines;
}

/** Font size (mm) that fits `text` on one line of `width` mm, at most `size`. */
function fitSize(ctx: CanvasRenderingContext2D, text: string, size: number, width: number, weight = 700): number {
  font(ctx, size, weight);
  const w = ctx.measureText(text).width;
  return w > width ? (size * width) / w : size;
}

/** Letter-spaced capitals (bars and section titles), made smaller when wider than `maxWidth` mm. */
function caps(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, align: 'left' | 'right' | 'center' = 'left', maxWidth = TEXT_W) {
  font(ctx, size, 800);
  ctx.letterSpacing = `${size * 0.12}px`;
  const w = ctx.measureText(text).width;
  if (w > maxWidth) {
    size = (size * maxWidth) / w;
    font(ctx, size, 800);
    ctx.letterSpacing = `${size * 0.12}px`;
  }
  ctx.textAlign = align;
  ctx.fillText(text, align === 'right' ? x + size * 0.12 : x, y);
  ctx.textAlign = 'left';
  ctx.letterSpacing = '0px';
}

type Block = { text: string; size: number; weight: number; lineHeight: number; gapBefore: number; italic?: boolean };

/** Height in mm of the wrapped blocks; draws them from `y` when `draw` is set. */
function blocks(ctx: CanvasRenderingContext2D, list: Block[], y: number, draw: boolean): number {
  let h = 0;
  for (const b of list) {
    font(ctx, b.size, b.weight, b.italic);
    h += b.gapBefore;
    for (const line of wrap(ctx, b.text, TEXT_W)) {
      if (draw) ctx.fillText(line, PAD, y + h + b.size * 0.82);
      h += b.size * b.lineHeight;
    }
  }
  return h;
}

/** Tick box + quantity + product rows; returns the height in mm. */
function orderLines(ctx: CanvasRenderingContext2D, lines: LabelBase['lines'], size: number, y: number, draw: boolean): number {
  const box = size * 0.8;
  const qtyX = PAD + box + size * 0.55;
  const nameX = qtyX + size * 2.2;
  const lineH = size * 1.4;
  let h = 0;
  for (const l of lines) {
    font(ctx, size);
    const rows = wrap(ctx, l.name, PAD + TEXT_W - nameX);
    if (draw) {
      const base = y + h + (lineH - size) / 2 + size * 0.82;
      ctx.save();
      ctx.lineWidth = size * 0.1;
      ctx.beginPath();
      ctx.roundRect(PAD, base - size * 0.72, box, box, size * 0.12);
      ctx.stroke();
      ctx.restore();
      font(ctx, size, 700);
      ctx.fillText(`${l.qty} x`, qtyX, base);
      font(ctx, size);
      rows.forEach((r, i) => ctx.fillText(r, nameX, base + i * lineH));
    }
    h += rows.length * lineH;
  }
  return h;
}

function hRule(ctx: CanvasRenderingContext2D, y: number, dashed: boolean) {
  ctx.save();
  ctx.lineWidth = dashed ? 0.5 : 0.7;
  ctx.setLineDash(dashed ? [1.4, 0.9] : []);
  ctx.beginPath();
  ctx.moveTo(dashed ? PAD : 0, y);
  ctx.lineTo(dashed ? W - PAD : W, y);
  ctx.stroke();
  ctx.restore();
}

/** One instructions part (title + lines) in a column `width` mm wide from (x, y); returns the height in mm. */
function carePart(ctx: CanvasRenderingContext2D, part: (typeof CARE)[number], x: number, y: number, width: number, size: number, draw: boolean): number {
  if (draw) caps(ctx, part.title, x, y + size * 0.85, size * 0.88, 'left', width);
  let h = size * 1.3;
  for (const text of part.lines) {
    font(ctx, size);
    const rows = wrap(ctx, text, width);
    rows.forEach((row, j) => {
      if (!draw) return;
      // "TANPA MINYAK" in bold
      let cx = x;
      for (const t of row.split(/(TANPA|MINYAK)/)) {
        font(ctx, size, t === 'TANPA' || t === 'MINYAK' ? 800 : 400);
        ctx.fillText(t, cx, y + h + j * size * 1.25 + size * 0.85);
        cx += ctx.measureText(t).width;
      }
    });
    h += rows.length * size * 1.25;
  }
  return h;
}

/** Storage (left) and cooking (right) instructions side by side, `width` mm wide; returns the height in mm. */
function careText(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, size: number, draw: boolean): number {
  const [storage, cooking] = CARE;
  const gap = 4;
  font(ctx, size);
  const leftW = Math.min(width * 0.5, Math.max(...storage.lines.map((l) => ctx.measureText(l).width)) + 0.5);
  const rightX = x + leftW + gap;
  if (draw) {
    ctx.save();
    ctx.lineWidth = 0.3;
    ctx.setLineDash([0.8, 0.6]);
    ctx.beginPath();
    ctx.moveTo(rightX - gap / 2, y);
    ctx.lineTo(rightX - gap / 2, y + careText(ctx, x, y, width, size, false));
    ctx.stroke();
    ctx.restore();
  }
  return Math.max(carePart(ctx, storage, x, y, leftW, size, draw), carePart(ctx, cooking, rightX, y, width - leftW - gap, size, draw));
}

/** Black bar across the label with white text; returns its height. */
function blackBar(ctx: CanvasRenderingContext2D, y: number, text: string): number {
  const h = 8;
  ctx.fillRect(0, y, W, h);
  ctx.fillStyle = '#fff';
  caps(ctx, text, PAD, y + 5.7, 5);
  ctx.fillStyle = '#000';
  return h;
}

/** Draws the label and returns it as a PNG blob (white background, black only). */
export async function renderShippingLabel(label: ShippingLabel): Promise<Blob> {
  const logo = label.kind === 'customer' ? await loadImage(LOGO_URL) : null;
  const canvas = document.createElement('canvas');
  canvas.width = W * PX;
  canvas.height = H * PX;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is not supported in this browser');
  ctx.scale(PX, PX);
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, W, H);

  // Rounded frame; everything is clipped inside it so the black bars follow the corners.
  const frame = new Path2D();
  frame.roundRect(EDGE, EDGE_Y, W - EDGE * 2, H - EDGE_Y * 2, 3);
  ctx.save();
  ctx.clip(frame);
  ctx.fillStyle = '#000';
  ctx.strokeStyle = '#000';
  const day = fullDate(label.deliveryDate);

  // Bottom section (fixed height), drawn first so the middle knows how much room it has.
  let bottomY: number;
  if (label.kind === 'reseller') {
    const bottomH = 15;
    bottomY = H - EDGE_Y - bottomH;
    hRule(ctx, bottomY, false);
    caps(ctx, 'DARI', PAD, bottomY + 4.8, 2.8);
    // "Name - 0812-3456-7890" on one line
    const from = label.resellerPhone ? `${label.resellerName} - ${formatPhone(label.resellerPhone)}` : label.resellerName;
    font(ctx, fitSize(ctx, from, 4.8, TEXT_W), 700);
    ctx.fillText(from, PAD, bottomY + 10.6);
    // Storage + cooking box just above "DARI".
    const careSize = 2.8;
    const inner = TEXT_W - 5;
    const boxH = careText(ctx, 0, 0, inner, careSize, false) + 4;
    const boxY = bottomY - 2.2 - boxH;
    ctx.save();
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.roundRect(PAD, boxY, TEXT_W, boxH, 1.4);
    ctx.stroke();
    ctx.restore();
    careText(ctx, PAD + 2.5, boxY + 2, inner, careSize, true);
    bottomY = boxY - 1;
  } else {
    // Storage + cooking side by side, then the review QR with customer care next to it.
    const qrSize = 13;
    const careSize = 2.6;
    const careH = careText(ctx, 0, 0, TEXT_W, careSize, false);
    const bottomH = 2.4 + careH + 2.2 + 1.8 + qrSize + 1.8;
    bottomY = H - EDGE_Y - bottomH;
    hRule(ctx, bottomY, false);
    careText(ctx, PAD, bottomY + 2.4, TEXT_W, careSize, true);
    const qrRuleY = bottomY + 2.4 + careH + 2.2;
    hRule(ctx, qrRuleY, true);
    const qr = qrcode(0, 'M');
    qr.addData(GOOGLE_REVIEW_URL);
    qr.make();
    const n = qr.getModuleCount();
    const qx = PAD;
    const qy = qrRuleY + 1.8;
    const m = qrSize / n;
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) ctx.fillRect(qx + c * m, qy + r * m, m + 0.02, m + 0.02);
    const tx = qx + qrSize + 3;
    const tw = W - PAD - tx;
    font(ctx, fitSize(ctx, 'Suka? Beri ulasan di Google', 3.3, tw, 800), 800);
    ctx.fillText('Suka? Beri ulasan di Google', tx, qy + 3.6);
    const help = `Butuh bantuan? WA ${formatPhone(CONTACT_WHATSAPP)}`;
    font(ctx, fitSize(ctx, help, 3, tw, 700), 700);
    ctx.fillText(help, tx, qy + 8);
    font(ctx, 3);
    ctx.fillText(SUPPORT_EMAIL, tx, qy + 12);
  }

  // Top: logo + order number (customer), then the black bar with the delivery day.
  let y = EDGE_Y;
  if (label.kind === 'customer' && logo) {
    const logoH = 12;
    ctx.drawImage(logo, PAD - 1, y + 2, (logoH * logo.width) / logo.height, logoH);
    const right = W - PAD;
    ctx.textAlign = 'right';
    font(ctx, 3.2);
    ctx.fillText('No. Pesanan', right, y + 6.4);
    const id = `#${label.orderId}`;
    font(ctx, fitSize(ctx, id, 5.6, 60, 800), 800);
    ctx.fillText(id, right, y + 12.2);
    ctx.textAlign = 'left';
    y += 16;
  }
  y += blackBar(ctx, y, day ?? 'TANGGAL KIRIM BELUM DITENTUKAN');

  // Middle: receiver + order. Shrinks the text until it fits above the bottom section.
  const address = label.address.replace(/\s*\|\s*Pin:.*$/i, '').trim();
  const notes = label.notes?.trim();
  const lines = label.lines.filter((l) => l.qty > 0);
  const packs = lines.reduce((sum, l) => sum + l.qty, 0);
  const room = bottomY - y;
  let f = 1;
  const big = label.kind === 'customer';
  const layout = (draw: boolean) => {
    let h = 3;
    const list: Block[] = [
      { text: label.recipientName, size: (big ? 5.4 : 6.6) * f, weight: 800, lineHeight: 1.12, gapBefore: 0 },
      { text: address, size: (big ? 4 : 4.6) * f, weight: 400, lineHeight: 1.25, gapBefore: 1.2 },
      { text: formatPhone(label.recipientPhone), size: (big ? 3.7 : 4.2) * f, weight: 600, lineHeight: 1.2, gapBefore: 1 },
    ];
    if (notes) list.push({ text: `Catatan: ${notes}`, size: 3.7 * f, weight: 400, lineHeight: 1.28, gapBefore: 0.8, italic: true });
    h += blocks(ctx, list, y + h, draw);
    h += 2;
    if (draw) hRule(ctx, y + h, true);
    h += 2.4;
    if (draw) {
      caps(ctx, 'PESANAN', PAD, y + h + 2.6, 3);
      caps(ctx, `TOTAL ${packs} PACK`, W - PAD, y + h + 2.6, 3, 'right');
    }
    h += 4;
    h += orderLines(ctx, lines, (big ? 3.9 : 4.6) * f, y + h, draw);
    return h + 1.5;
  };
  while (f > 0.55 && layout(false) > room) f -= 0.05;
  layout(true);
  ctx.restore();

  // Frame on top of everything.
  ctx.lineWidth = 0.9;
  ctx.stroke(frame);

  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not create the image'))), 'image/png'));
}
