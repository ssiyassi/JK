// "Resep & Tips" articles (jentiskitchen.id/resep-tips). Each one answers something people search for and links to
// the products. Only publish what the owner approved; product facts come from productInfo.ts.
import type { Meat } from './productInfo';
import { SITE_NAME, SITE_URL } from './seo';

export interface ArticleBlock {
  h2?: string;
  p?: string[];
  list?: string[];
  ordered?: boolean;
}

/** A recipe article: shown with ingredients, steps and a buy box for the meat it uses (Google Recipe markup). */
export interface Recipe {
  cardTitle: string; // short name for the homepage recipe cards
  meat: Meat; // which products the buy box offers; pork and beef recipes are never mixed
  yield: string; // e.g. "4–5 piring"
  prepMinutes: number;
  cookMinutes: number;
  category: string;
  keywords: string[];
  ingredients: string[];
  steps: string[];
}

export interface Article {
  slug: string;
  title: string; // also the H1
  description: string; // Google snippet, ~150 characters
  date: string; // YYYY-MM-DD (published)
  image: string;
  imageAlt: string;
  intro: string;
  recipe?: Recipe;
  blocks: ArticleBlock[];
}

// The owner's way to cook the meat before it goes into a dish (2026-10-27): medium heat, no oil, 5 minutes a side.
const GRILL_STEP =
  'Panaskan teflon di api sedang tanpa minyak. Panggang daging 5 menit, balik, lalu 5 menit lagi sampai matang dan bumbunya mengilap seperti karamel.';
const THAW_STEP = 'Kalau daging dari freezer, cairkan dulu — paling mudah dipindah ke kulkas semalam sebelumnya.';

export const ARTICLES: Article[] = [
  {
    slug: 'cara-masak-daging-marinasi-di-teflon-tanpa-minyak',
    title: 'Cara Masak Daging Marinasi di Teflon Tanpa Minyak',
    description:
      'Panduan singkat memasak daging marinasi di teflon tanpa minyak: api yang pas, kapan dibalik, supaya bumbu karamel tidak gosong, plus cara menyimpannya.',
    date: '2026-10-22',
    image: '/shop/articles/cara-masak-teflon.jpg',
    imageAlt: 'Daging BBQ marinasi Jentis Kitchen setelah dipanggang, diangkat dengan garpu',
    intro:
      'Daging marinasi itu praktis: bumbunya sudah meresap, jadi kamu tinggal masak. Untuk daging marinasi Jentis Kitchen bahkan tidak perlu minyak sama sekali — cukup teflon atau wajan anti lengket. Ini cara supaya hasilnya empuk, juicy, dan bumbunya jadi karamel yang cantik, bukan gosong.',
    blocks: [
      {
        h2: 'Kenapa tidak perlu minyak?',
        p: [
          'Bumbu marinasi kami sudah mengandung minyak, kecap, dan gula. Saat kena panas, bumbu itu yang membuat permukaan daging berkilau dan sedikit karamel. Menambah minyak justru membuat bumbu luntur dan cipratan lebih banyak.',
        ],
      },
      {
        h2: 'Yang kamu butuhkan',
        list: ['Teflon atau wajan anti lengket (grill pan juga bisa)', 'Penjepit atau sumpit', 'Daging marinasi Jentis Kitchen'],
      },
      {
        h2: 'Langkah memasak',
        ordered: true,
        list: [
          'Kalau daging dari freezer, cairkan dulu sebelum dimasak — paling aman dipindah ke chiller/kulkas semalam sebelumnya.',
          'Panaskan teflon dulu di api sedang sampai benar-benar panas. Daging yang masuk ke wajan dingin akan keluar air dan jadi rebus, bukan panggang.',
          'Tata daging satu lapis, jangan ditumpuk. Kalau wajannya kecil, masak bertahap.',
          'Biarkan sampai sisi bawah berwarna cokelat mengilap, baru dibalik. Tidak perlu dibolak-balik terus — cukup sekali dua kali.',
          'Kecilkan api kalau bumbu mulai berbuih dan menghitam terlalu cepat. Bumbu yang mengandung gula gampang gosong di api besar.',
          'Masak sampai tingkat empuk sesuai selera, lalu angkat dan sajikan selagi hangat.',
        ],
      },
      {
        h2: 'Tips supaya hasilnya maksimal',
        list: [
          'Api sedang adalah kunci: cukup panas untuk karamel, tidak terlalu panas sampai gosong.',
          'Sisa bumbu di wajan jangan dibuang — siram ke atas daging atau nasi.',
          'Langsung bersihkan teflon setelah agak dingin supaya sisa karamel tidak mengeras.',
        ],
      },
      {
        h2: 'Ide penyajian',
        list: [
          'Nasi hangat + telur ceplok: makan malam 15 menit.',
          'Gulung dengan selada, ala BBQ Korea.',
          'Isian rice bowl dengan timun dan kimchi.',
        ],
      },
      {
        h2: 'Cara menyimpan',
        p: ['Simpan daging marinasi di freezer, tahan hingga 2 bulan. Di chiller atau kulkas, tahan hingga 2 minggu.'],
      },
    ],
  },
];

export const RECIPES: Article[] = [
  {
    slug: 'nasi-goreng-babi-bbq',
    title: 'Resep Nasi Goreng Babi BBQ, 1 Pack untuk 4–5 Piring',
    description:
      'Resep nasi goreng babi BBQ yang gampang: panggang daging marinasi 10 menit, potong kecil, lalu tumis dengan nasi dan telur. 1 pack cukup untuk 4–5 piring.',
    date: '2026-10-27',
    image: '/shop/articles/nasi-goreng-daging-bbq.jpg',
    imageAlt: 'Nasi goreng dengan irisan tipis daging BBQ, telur ceplok, timun, kerupuk, dan cabai rawit',
    intro:
      'Daging marinasi tidak harus selalu jadi lauk utama. Setelah dipanggang dan dipotong kecil, babi BBQ jadi "bumbu rahasia" nasi goreng: manis-gurih karamelnya menempel di setiap butir nasi. Satu pack cukup untuk 4–5 piring — pas untuk makan malam keluarga.',
    recipe: {
      cardTitle: 'Nasi Goreng Babi BBQ',
      meat: 'babi',
      yield: '4–5 piring',
      prepMinutes: 15,
      cookMinutes: 20,
      category: 'Makanan utama',
      keywords: ['nasi goreng babi', 'nasi goreng babi bbq', 'resep nasi goreng daging', 'olahan daging marinasi'],
      ingredients: [
        '1 pack Babi Marinade Jentis Kitchen (Manis atau Asin Gurih)',
        '5 piring nasi putih, sebaiknya nasi dingin atau nasi kemarin',
        '4 butir telur',
        '5 siung bawang putih, cincang',
        '6 butir bawang merah, iris tipis',
        '2 batang daun bawang, iris',
        '2 sdm minyak goreng',
        '1–2 sdm kecap manis (opsional, kalau suka lebih manis)',
        'Garam dan merica secukupnya',
        'Pelengkap: timun, kerupuk, cabai rawit',
      ],
      steps: [
        THAW_STEP,
        GRILL_STEP,
        'Angkat, diamkan 1–2 menit, lalu potong daging kecil-kecil seukuran dadu. Sisa bumbu di teflon jangan dibuang.',
        'Panaskan minyak di wajan besar. Tumis bawang putih dan bawang merah sampai harum dan kekuningan.',
        'Pinggirkan bumbu, masukkan telur, orak-arik sampai setengah matang.',
        'Masukkan nasi, aduk rata dengan api besar sampai nasi terasa kering dan tidak menggumpal.',
        'Masukkan potongan daging dan sisa bumbu dari teflon. Tambahkan kecap manis, garam, dan merica sesuai selera, aduk 2–3 menit.',
        'Matikan api, taburi daun bawang. Sajikan dengan timun, kerupuk, dan cabai rawit.',
      ],
    },
    blocks: [
      {
        h2: 'Tips supaya nasi gorengnya mantap',
        list: [
          'Pakai nasi dingin: nasi baru matang terlalu basah dan mudah lembek.',
          'Rasa Manis cocok untuk anak-anak; Asin Gurih cocok kalau kamu suka nasi goreng yang lebih "kampung".',
          'Daging dimasukkan di akhir supaya tetap juicy dan tidak keras.',
        ],
      },
      { h2: 'Info halal', p: ['Resep ini memakai daging babi (non-halal).'] },
    ],
  },
  {
    slug: 'babi-bbq-sambal-matah',
    title: 'Resep Babi BBQ Sambal Matah ala Bali',
    description:
      'Babi BBQ marinasi dipanggang di teflon tanpa minyak, lalu disiram sambal matah segar. Siap dalam 25 menit, cocok dengan nasi hangat dan kerupuk.',
    date: '2026-10-27',
    image: '/shop/articles/babi-sambal-matah.jpg',
    imageAlt: 'Babi BBQ Jentis Kitchen dengan sambal matah, timun, dan kerupuk di atas piring putih',
    intro:
      'Manis-gurih babi BBQ bertemu segarnya sambal matah: bawang merah, cabai rawit, serai, dan perasan jeruk limau. Kombinasi ala Bali ini cuma butuh 25 menit, dan sambalnya tidak perlu diulek.',
    recipe: {
      cardTitle: 'Babi BBQ Sambal Matah',
      meat: 'babi',
      yield: '3–4 porsi',
      prepMinutes: 15,
      cookMinutes: 10,
      category: 'Lauk',
      keywords: ['babi sambal matah', 'babi bbq sambal matah', 'resep sambal matah', 'olahan daging marinasi'],
      ingredients: [
        '1 pack Babi Marinade Jentis Kitchen (paling cocok rasa Asin Gurih)',
        'Sambal matah: 10 butir bawang merah, iris tipis',
        '5–8 cabai rawit, iris',
        '3 batang serai, ambil bagian putihnya, iris tipis',
        '4 lembar daun jeruk, buang tulang daunnya, iris halus',
        '1 buah jeruk limau, ambil airnya',
        '½ sdt garam',
        '4 sdm minyak kelapa atau minyak goreng',
        'Pelengkap: nasi hangat, timun, kerupuk',
      ],
      steps: [
        THAW_STEP,
        'Buat sambal matah: campur bawang merah, cabai, serai, daun jeruk, dan garam di mangkuk. Remas sebentar dengan sendok supaya aromanya keluar.',
        'Panaskan minyak sampai benar-benar panas, lalu siramkan ke campuran sambal. Tambahkan air jeruk limau, aduk.',
        GRILL_STEP,
        'Tata daging di piring, siram sambal matah di atasnya. Sajikan dengan nasi hangat, timun, dan kerupuk.',
      ],
    },
    blocks: [
      {
        h2: 'Tips',
        list: [
          'Sambal matah paling enak dibuat mendadak, jangan disimpan lebih dari sehari.',
          'Suka pedas? Tambah cabai rawit, atau campur sedikit cabai merah untuk warna.',
        ],
      },
      { h2: 'Info halal', p: ['Resep ini memakai daging babi (non-halal).'] },
    ],
  },
  {
    slug: 'mantau-isi-daging-sapi-bbq',
    title: 'Resep Mantau Isi Daging Sapi BBQ',
    description:
      'Mantau kukus lembut diisi daging sapi BBQ marinasi yang dipanggang di teflon. Camilan atau sarapan yang siap dalam 20 menit. Bisa juga untuk sandwich.',
    date: '2026-10-27',
    image: '/shop/articles/mantau-sapi-bbq.jpg',
    imageAlt: 'Mantau kukus berisi irisan daging sapi BBQ Jentis Kitchen yang mengilap, dipegang di tangan',
    intro:
      'Mantau yang lembut dan hangat, diisi daging sapi BBQ yang manis-gurih dan sedikit gosong di pinggir. Ini cara paling gampang membuat "bao" ala kafe di rumah — mantau beku dari supermarket pun jadi.',
    recipe: {
      cardTitle: 'Mantau Isi Daging Sapi BBQ',
      meat: 'sapi',
      yield: '8–10 mantau',
      prepMinutes: 10,
      cookMinutes: 15,
      category: 'Camilan',
      keywords: ['mantau isi daging', 'bao daging sapi', 'resep mantau', 'sandwich daging bbq', 'olahan daging marinasi'],
      ingredients: [
        '1 pack Sapi Marinade Jentis Kitchen (Manis atau Asin Gurih)',
        '8–10 buah mantau (beli jadi, boleh yang beku)',
        '1 buah timun, iris tipis memanjang',
        'Beberapa lembar selada',
        '1 batang daun bawang, iris',
        'Opsional: mayones, saus sambal, atau wijen sangrai',
      ],
      steps: [
        THAW_STEP,
        'Kukus mantau 8–10 menit sampai lembut dan mengembang (ikuti petunjuk di kemasan).',
        GRILL_STEP,
        'Angkat, diamkan 1 menit, lalu iris daging memanjang.',
        'Belah mantau, isi dengan selada, timun, dan 2–3 iris daging. Tambahkan mayones atau saus sambal kalau suka, taburi daun bawang. Sajikan selagi hangat.',
      ],
    },
    blocks: [
      {
        h2: 'Variasi: sandwich daging BBQ',
        p: [
          'Tidak ada mantau? Pakai roti tawar panggang, roti burger, atau roti gandeng. Isi dengan daging BBQ, selada, timun, dan sedikit mayones — bekal sekolah atau kantor yang pasti habis.',
        ],
      },
      {
        h2: 'Info halal',
        p: ['Produk sapi kami belum bersertifikat halal. Peralatan produksi sapi dipisahkan dan diproduksi di hari yang berbeda dari produk babi.'],
      },
    ],
  },
  {
    slug: 'tumis-buncis-daging-sapi-bbq',
    title: 'Resep Tumis Buncis Daging Sapi BBQ, Siap 20 Menit',
    description:
      'Tumis buncis dan wortel dengan potongan daging sapi BBQ marinasi. Sayur dan lauk jadi satu, cukup satu wajan, siap dalam 20 menit untuk 4 porsi.',
    date: '2026-10-27',
    image: '/shop/articles/tumis-buncis-daging-bbq.jpg',
    imageAlt: 'Tumis buncis dan wortel dengan irisan daging sapi BBQ di mangkuk putih, dengan semangkuk nasi',
    intro:
      'Mau anak makan sayur? Campurkan dengan daging BBQ. Bumbu marinasi yang manis-gurih ikut membalut buncis dan wortel, jadi tumisan ini enak tanpa perlu banyak bumbu tambahan.',
    recipe: {
      cardTitle: 'Tumis Buncis Daging Sapi BBQ',
      meat: 'sapi',
      yield: '4 porsi',
      prepMinutes: 10,
      cookMinutes: 15,
      category: 'Makanan utama',
      keywords: ['tumis buncis daging sapi', 'tumis daging sapi', 'olahan daging marinasi', 'menu praktis'],
      ingredients: [
        '1 pack Sapi Marinade Jentis Kitchen (Manis atau Asin Gurih)',
        '250 gram buncis, potong serong',
        '1 buah wortel, iris tipis',
        '½ buah bawang bombay, iris',
        '3 siung bawang putih, cincang',
        '1 sdm saus tiram',
        '1 sdm minyak goreng',
        '3–4 sdm air',
        'Merica secukupnya',
      ],
      steps: [
        THAW_STEP,
        GRILL_STEP,
        'Angkat, diamkan 1 menit, lalu potong daging tipis-tipis atau seukuran dadu.',
        'Panaskan minyak, tumis bawang putih dan bawang bombay sampai harum.',
        'Masukkan wortel dan buncis, tambahkan air, masak 3–4 menit sampai sayur matang tapi masih renyah.',
        'Masukkan potongan daging dan saus tiram, beri merica, aduk rata 1–2 menit. Sajikan dengan nasi hangat.',
      ],
    },
    blocks: [
      {
        h2: 'Ganti sayurnya sesuka hati',
        list: ['Brokoli dan wortel', 'Kangkung atau sawi', 'Paprika dan bawang bombay', 'Jamur kancing atau jamur tiram'],
      },
      {
        h2: 'Info halal',
        p: ['Produk sapi kami belum bersertifikat halal. Peralatan produksi sapi dipisahkan dan diproduksi di hari yang berbeda dari produk babi.'],
      },
    ],
  },
];

/** Homepage "Mau masak apa?" cards: one per recipe. */
export interface RecipeCard {
  path: string;
  title: string;
  image: string;
  imageAlt: string;
  meat: Meat;
  minutes: number;
  yield: string;
}

export const recipeCards = (): RecipeCard[] =>
  RECIPES.filter((a) => a.recipe).map((a) => ({
    path: articlePath(a),
    title: a.recipe!.cardTitle,
    image: a.image,
    imageAlt: a.imageAlt,
    meat: a.recipe!.meat,
    minutes: a.recipe!.prepMinutes + a.recipe!.cookMinutes,
    yield: a.recipe!.yield,
  }));

/** Everything under /resep-tips: recipes first, then the guides. */
export const ALL_ARTICLES: Article[] = [...RECIPES, ...ARTICLES];

export const articlePath = (a: Pick<Article, 'slug'>) => `/resep-tips/${a.slug}`;

export function articleJsonLd(a: Article, siteUrl = SITE_URL) {
  const url = `${siteUrl}${articlePath(a)}`;
  return {
    '@context': 'https://schema.org',
    '@graph': [
      a.recipe ? recipeNode(a, url, siteUrl) : {
        '@type': 'Article',
        '@id': `${url}#article`,
        headline: a.title,
        description: a.description,
        image: [`${siteUrl}${a.image}`],
        datePublished: a.date,
        dateModified: a.date,
        inLanguage: 'id-ID',
        author: { '@type': 'Organization', name: SITE_NAME, url: `${siteUrl}/` },
        publisher: { '@id': `${siteUrl}/#organization` },
        mainEntityOfPage: url,
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Beranda', item: `${siteUrl}/` },
          { '@type': 'ListItem', position: 2, name: 'Resep & Tips', item: `${siteUrl}/resep-tips` },
          { '@type': 'ListItem', position: 3, name: a.title, item: url },
        ],
      },
    ],
  };
}

const isoMinutes = (m: number) => `PT${m}M`;

/** Short step title for Google: the step's first sentence. */
export const stepName = (text: string) => text.split(/(?<=\.)\s/)[0].replace(/\.$/, '');

function recipeNode(a: Article, url: string, siteUrl: string) {
  const r = a.recipe!;
  return {
    '@type': 'Recipe',
    '@id': `${url}#recipe`,
    name: a.title,
    description: a.description,
    image: [`${siteUrl}${a.image}`],
    datePublished: a.date,
    inLanguage: 'id-ID',
    author: { '@type': 'Organization', name: SITE_NAME, url: `${siteUrl}/` },
    prepTime: isoMinutes(r.prepMinutes),
    cookTime: isoMinutes(r.cookMinutes),
    totalTime: isoMinutes(r.prepMinutes + r.cookMinutes),
    recipeYield: r.yield,
    recipeCategory: r.category,
    recipeCuisine: 'Indonesia',
    keywords: r.keywords.join(', '),
    recipeIngredient: r.ingredients,
    // name + url per step (Search Console asks for both); the url points at the step's anchor on the page.
    recipeInstructions: r.steps.map((text, i) => ({
      '@type': 'HowToStep',
      position: i + 1,
      name: stepName(text),
      text,
      url: `${url}#langkah-${i + 1}`,
      image: `${siteUrl}${a.image}`,
    })),
    mainEntityOfPage: url,
  };
}
