// Weekly reseller stories (owner, 2026-11-16): every Friday the CMO bot gets 2 Instagram/WhatsApp status pictures
// (1080x1920) that resellers can post as their own: one product photo poster and one customer testimonial poster.
// No Jentis logo or website (the reseller sells under their own name), big "ORDER NOW!!".
// Creative rules: no price, no Babi/Sapi, no free delivery; everything straight (no tilted badges); brown palette.
// Photos live in public/shop/status/. Framework-free (tests/resellerStories.test.ts).

export interface ProductStory {
  photo: string;
  /** Two short lines, the big headline. */
  headline: [string, string];
}

export interface TestimonialStory {
  /** Cropped chat screenshot (names hidden). */
  chat: string;
  photo: string;
}

export const PRODUCT_STORIES: ProductStory[] = [
  { photo: 'p01.jpg', headline: ['Tinggal panggang,', 'langsung lahap.'] },
  { photo: 'p03.jpg', headline: ['Sudah berbumbu.', 'Tinggal masak.'] },
  { photo: 'p02.jpg', headline: ['Juicy, manis,', 'bikin nagih.'] },
  { photo: 'p04.jpg', headline: ['Selipin di bao,', 'makin mantap!'] },
  { photo: 'p08.jpg', headline: ['Full daging,', 'tanpa lemak.'] },
  { photo: 'p06.jpg', headline: ['Sarapan jadi', 'spesial.'] },
  { photo: 'p07.jpg', headline: ['Nasi goreng', 'naik level.'] },
  { photo: 'p09.jpg', headline: ['Pakai teflon', 'aja udah jadi.'] },
  { photo: 'p11.jpg', headline: ['Makin nikmat', 'pakai sambal matah.'] },
  { photo: 'p13.jpg', headline: ['Satu potong', 'nggak bakal cukup.'] },
  { photo: 'p12.jpg', headline: ['Bingung masak apa?', 'Ini jawabannya.'] },
  { photo: 'p14.jpg', headline: ['Stok lauk enak', 'di freezer.'] },
];

export const TESTIMONIAL_STORIES: TestimonialStory[] = [
  { chat: 't02.png', photo: 'p03.jpg' }, // empuk kaya bantal
  { chat: 't01.png', photo: 'p02.jpg' }, // anak susah makan langsung 4 slice
  { chat: 't04.png', photo: 'p01.jpg' }, // setengah kilo udah ludes
  { chat: 't03.png', photo: 'p11.jpg' }, // dagingnya lembut, enak
  { chat: 't05.png', photo: 'p08.jpg' }, // manis pas di lidah
  { chat: 't07.png', photo: 'p13.jpg' }, // 5 bintang, sudah mau habis
  { chat: 't06.png', photo: 'p04.jpg' }, // sumpah enak banget
];

/** Colours rotate each week so resellers' status never looks the same twice in a row. */
const THEMES = [
  { bg: '#2a140a', band: '#f6e7d3', bandText: '#3b1a0c', accent: '#e9b77c' },
  { bg: '#3b1a0c', band: '#9a3412', bandText: '#fff4e6', accent: '#f6c89a' },
  { bg: '#1f1a17', band: '#fff8ef', bandText: '#7c2d12', accent: '#e9b77c' },
] as const;

/** First Friday of the series; week 0 shows the first picture of each list. */
const START = Date.UTC(2026, 10, 20);

export function storyWeek(now: number): number {
  return Math.max(0, Math.floor((now + 7 * 3600 * 1000 - START) / (7 * 24 * 3600 * 1000)));
}

export function storiesForWeek(week: number) {
  return {
    product: PRODUCT_STORIES[week % PRODUCT_STORIES.length],
    testimonial: TESTIMONIAL_STORIES[week % TESTIMONIAL_STORIES.length],
    theme: THEMES[week % THEMES.length],
  };
}

type Theme = (typeof THEMES)[number];

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const FONTS =
  '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>' +
  '<link href="https://fonts.googleapis.com/css2?family=Anton&family=Plus+Jakarta+Sans:wght@600;800&display=block" rel="stylesheet">';

function page(body: string, css: string, t: Theme) {
  return `<!doctype html><html><head><meta charset="utf-8">${FONTS}<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:1080px;height:1920px;overflow:hidden;background:${t.bg}}
body{position:relative;font-family:'Plus Jakarta Sans',system-ui,sans-serif;color:#fff}
.order{position:absolute;left:0;right:0;background:${t.band};color:${t.bandText};text-align:center;padding:34px 40px 40px}
.order b{display:block;font-family:Anton,Impact,sans-serif;font-weight:400;font-size:176px;line-height:1;letter-spacing:3px;white-space:nowrap}
.order span{display:block;margin-top:14px;font-size:38px;font-weight:800;letter-spacing:.5px}
${css}
</style></head><body>${body}</body></html>`;
}

const ORDER_BAND = (top: number) =>
  `<div class="order" style="top:${top}px"><b>ORDER NOW!!</b><span>Full daging · tanpa lemak · sudah berbumbu</span></div>`;

/** Product poster: the photo full screen, the headline at the top, ORDER NOW!! band low in the safe area. */
export function productStoryHtml(imagesBase: string, s: ProductStory, t: Theme): string {
  const css = `
.photo{position:absolute;inset:0;background:url('${imagesBase}/${s.photo}') center/cover no-repeat}
.shade{position:absolute;inset:0;background:linear-gradient(180deg,rgba(20,8,3,.88) 0%,rgba(20,8,3,.55) 22%,rgba(20,8,3,0) 40%,rgba(20,8,3,0) 60%,rgba(20,8,3,.75) 80%,${t.bg} 100%)}
.top{position:absolute;left:70px;right:70px;top:250px}
.kicker{display:inline-block;background:${t.accent};color:#2a140a;font-size:32px;font-weight:800;letter-spacing:3px;padding:10px 24px;border-radius:8px}
h1{margin-top:28px;font-size:96px;line-height:1.05;font-weight:800;letter-spacing:-1.5px;text-shadow:0 4px 30px rgba(0,0,0,.45)}`;
  return page(
    `<div class="photo"></div><div class="shade"></div>
<div class="top"><span class="kicker">FRESH FROZEN · SIAP MASAK</span><h1>${esc(s.headline[0])}<br>${esc(s.headline[1])}</h1></div>
${ORDER_BAND(1390)}`,
    css,
    t,
  );
}

/** Testimonial poster: blurred photo behind, the real chat in a white card, the photo, ORDER NOW!! band. */
export function testimonialStoryHtml(imagesBase: string, s: TestimonialStory, t: Theme): string {
  const css = `
.blur{position:absolute;inset:-60px;background:url('${imagesBase}/${s.photo}') center/cover;filter:blur(40px) brightness(.45)}
.wrap{position:absolute;left:60px;right:60px;top:240px;bottom:560px;display:flex;flex-direction:column}
.stars{font-size:52px;letter-spacing:6px;color:${t.accent}}
h1{margin-top:6px;font-size:74px;line-height:1.08;font-weight:800;letter-spacing:-1px}
.chat{flex:none;margin-top:34px;background:#fff;border-radius:28px;padding:26px;box-shadow:0 20px 60px rgba(0,0,0,.45)}
.chat img{display:block;width:100%;max-height:340px;object-fit:contain}
.pic{margin-top:28px;flex:1;min-height:300px;border-radius:28px;background:url('${imagesBase}/${s.photo}') center/cover;box-shadow:0 20px 60px rgba(0,0,0,.45);border:6px solid rgba(255,255,255,.9)}`;
  return page(
    `<div class="blur"></div>
<div class="wrap"><div class="stars">★★★★★</div><h1>Kata mereka yang<br>sudah coba</h1>
<div class="chat"><img src="${imagesBase}/${s.chat}" alt=""></div>
<div class="pic"></div></div>
${ORDER_BAND(1390)}`,
    css,
    t,
  );
}

/** Text that comes with the pictures on Telegram: what they are + a ready caption for the reseller. */
export function storiesCaption(week: number, dayLabel: string): string {
  const captions = [
    'Lauk enak tanpa ribet 😋 Full daging, tanpa lemak, sudah berbumbu. Tinggal masak! Order sekarang, chat aku ya 👉',
    'Stok freezer wajib minggu ini 🔥 Sudah berbumbu, tinggal panggang. Mau? Langsung chat aku!',
    'Yang sudah coba pasti order lagi 😍 Full daging tanpa lemak. Order sekarang, chat aku ya!',
  ];
  return [
    `📲 Reseller stories — ${dayLabel}`,
    'Two pictures for resellers to post on their WhatsApp / Instagram status this weekend: 1 product, 1 testimonial.',
    '',
    'Caption they can copy:',
    captions[week % captions.length],
  ].join('\n');
}
