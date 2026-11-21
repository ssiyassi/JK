import type { Metadata } from 'next';
import { CONTACT_WHATSAPP } from '@/lib/shop/catalog';
import { playfair } from '../fonts';

// Privacy policy (Bahasa Indonesia), linked from the shop footer. Describes what the shop really stores and shares;
// update it (and UPDATED) when that changes, e.g. a new payment gateway, email provider or tracking tool.
export const metadata: Metadata = {
  title: 'Kebijakan Privasi',
  description: 'Bagaimana Jentis Kitchen mengumpulkan, menggunakan, dan melindungi data Anda.',
  alternates: { canonical: '/kebijakan-privasi' },
};

const UPDATED = '20 Oktober 2026';
const EMAIL = 'help@jentiskitchen.id';

const SECTIONS: { title: string; body: React.ReactNode }[] = [
  {
    title: 'Data yang kami kumpulkan',
    body: (
      <ul>
        <li><b>Data akun:</b> nama, email, nomor HP, kata sandi (disimpan dalam bentuk terenkripsi, kami tidak bisa melihatnya), dan nomor HP pemberi referensi jika Anda mengisinya.</li>
        <li><b>Data pesanan:</b> nama dan nomor HP penerima, alamat pengiriman, titik lokasi di peta (jika Anda memilihnya), catatan, produk yang dipesan, voucher, dan status pembayaran.</li>
        <li><b>Bukti transfer</b> yang Anda unggah, jika membayar dengan transfer manual.</li>
        <li><b>Data teknis:</b> alamat IP, jenis browser/perangkat, halaman yang Anda kunjungi, dan iklan atau tautan yang membawa Anda ke situs kami (misalnya kode kampanye iklan).</li>
      </ul>
    ),
  },
  {
    title: 'Data yang tidak kami simpan',
    body: <p>Data kartu kredit/debit, PIN, dan data rekening e-wallet Anda diproses langsung oleh penyedia pembayaran dan tidak pernah tersimpan di sistem kami.</p>,
  },
  {
    title: 'Untuk apa data digunakan',
    body: (
      <ul>
        <li>Memproses, mengirim, dan menginformasikan status pesanan Anda.</li>
        <li>Mengirim email penting: kode konfirmasi, status pesanan, reset kata sandi, dan voucher.</li>
        <li>Menjalankan program voucher dan referensi.</li>
        <li>Melayani pertanyaan dan keluhan melalui Customer Care.</li>
        <li>Membantu lewat WhatsApp jika Anda sudah mengisi nomor HP saat checkout tetapi pesanan belum selesai. Nomor ini kami hapus setelah 14 hari.</li>
        <li>Menjaga keamanan akun dan mencegah penyalahgunaan (misalnya pembatasan percobaan login).</li>
        <li>Mengukur dan meningkatkan efektivitas iklan kami di Facebook dan Instagram.</li>
        <li>Menampilkan info pembelian terbaru di situs tanpa identitas: hanya kota, jumlah box, produk, dan waktunya (tanpa nama, nomor HP, atau alamat).</li>
      </ul>
    ),
  },
  {
    title: 'Pihak yang menerima data',
    body: (
      <>
        <p>Kami tidak menjual data Anda. Data hanya dibagikan seperlunya kepada:</p>
        <ul>
          <li><b>Penyedia pembayaran</b> (DOKU, Duitku) untuk memproses pembayaran.</li>
          <li><b>Jasa pengiriman</b>: nama, nomor HP, dan alamat penerima untuk mengantar pesanan.</li>
          <li><b>Penyedia email</b> (Resend) untuk mengirim email kepada Anda.</li>
          <li><b>Cloudflare</b>, tempat situs dan database kami berjalan, termasuk statistik kunjungan tanpa nama.</li>
          <li>
            <b>Meta (Facebook &amp; Instagram)</b> melalui Meta Pixel dan Conversions API: halaman yang dikunjungi, produk yang
            dimasukkan ke keranjang, dan pembelian. Email, nomor HP, dan nama depan dikirim hanya dalam bentuk acak (hash)
            agar tidak bisa dibaca; alamat lengkap tidak pernah dikirim. Ini membantu kami mengukur iklan dan menampilkan
            iklan yang relevan.
          </li>
          <li>
            <b>Microsoft Clarity</b>: rekaman anonim cara halaman dipakai (gulir, ketuk, klik) untuk memperbaiki situs. Isian
            formulir disamarkan, dan halaman checkout, pesanan, dan akun direkam dalam keadaan tersamar seluruhnya.
          </li>
        </ul>
      </>
    ),
  },
  {
    title: 'Cookie dan penyimpanan di browser',
    body: (
      <ul>
        <li><b>Cookie login</b> agar Anda tetap masuk ke akun.</li>
        <li><b>Isi keranjang</b> disimpan di browser Anda sampai pesanan dibuat.</li>
        <li><b>Asal kunjungan</b> (kode iklan/tautan) disimpan selama 30 hari untuk mengukur iklan.</li>
        <li><b>Cookie Meta</b> (_fbp, _fbc) dari Meta Pixel.</li>
        <li><b>Cookie Microsoft Clarity</b> (_clck, _clsk) untuk rekaman kunjungan anonim.</li>
      </ul>
    ),
  },
  {
    title: 'Pilihan Anda',
    body: (
      <ul>
        <li>Anda dapat memblokir atau menghapus cookie melalui pengaturan browser. Login dan keranjang mungkin tidak berfungsi tanpa cookie.</li>
        <li>Anda dapat mengatur iklan yang Anda lihat melalui pengaturan iklan di akun Facebook/Instagram Anda.</li>
        <li>
          Sesuai UU No. 27 Tahun 2022 tentang Pelindungan Data Pribadi, Anda berhak meminta salinan, memperbaiki, atau
          menghapus data Anda, serta menarik persetujuan. Hubungi kami melalui kontak di bawah.
        </li>
      </ul>
    ),
  },
  {
    title: 'Berapa lama data disimpan',
    body: <p>Data akun disimpan selama akun Anda aktif. Data pesanan disimpan selama diperlukan untuk pembukuan dan kewajiban hukum. Data yang tidak lagi diperlukan akan kami hapus.</p>,
  },
];

export default function PrivacyPolicyPage() {
  return (
    <article className={`${playfair.variable} max-w-2xl mx-auto py-2 sm:py-6`}>
      <h1 className="font-[family-name:var(--font-heading)] text-3xl sm:text-4xl font-bold text-[#3b1a0c]">Kebijakan Privasi</h1>
      <p className="mt-2 text-sm text-[#8a7a6d]">Terakhir diperbarui: {UPDATED}</p>
      <p className="mt-4 text-[#374151] leading-relaxed">
        Jentis Kitchen menghargai privasi Anda. Halaman ini menjelaskan data apa yang kami kumpulkan saat Anda menggunakan
        jentiskitchen.id, bagaimana kami menggunakannya, dan pilihan yang Anda miliki.
      </p>
      <div className="mt-6 flex flex-col gap-6">
        {SECTIONS.map((s) => (
          <section key={s.title}>
            <h2 className="text-lg font-bold text-[#111827]">{s.title}</h2>
            <div className="mt-2 text-[#374151] leading-relaxed [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1.5 [&_p+ul]:mt-2">{s.body}</div>
          </section>
        ))}
        <section>
          <h2 className="text-lg font-bold text-[#111827]">Hubungi kami</h2>
          <p className="mt-2 text-[#374151] leading-relaxed">
            Email: <a href={`mailto:${EMAIL}`} className="text-[#9a3412] underline underline-offset-2">{EMAIL}</a>
            <br />
            WhatsApp: <a href={`https://wa.me/${CONTACT_WHATSAPP}`} className="text-[#9a3412] underline underline-offset-2">0852-1544-8802</a>
          </p>
        </section>
      </div>
    </article>
  );
}
