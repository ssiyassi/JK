// Password-protected ZIP files (classic "ZipCrypto" encryption, files stored without compression).
// Chosen because Windows Explorer, macOS Archive Utility and most phone file apps open it with a password prompt
// without extra software. It keeps a file away from casual eyes; it is not strong encryption.

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

const crcByte = (crc: number, b: number) => (CRC_TABLE[(crc ^ b) & 0xff] ^ (crc >>> 8)) >>> 0;

export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const b of data) crc = crcByte(crc, b);
  return (crc ^ 0xffffffff) >>> 0;
}

class ZipCrypto {
  private k0 = 0x12345678;
  private k1 = 0x23456789;
  private k2 = 0x34567890;

  constructor(password: Uint8Array) {
    for (const b of password) this.update(b);
  }

  private update(b: number) {
    this.k0 = crcByte(this.k0, b);
    this.k1 = (this.k1 + (this.k0 & 0xff)) >>> 0;
    this.k1 = (Math.imul(this.k1, 134775813) + 1) >>> 0;
    this.k2 = crcByte(this.k2, this.k1 >>> 24);
  }

  private keyByte(): number {
    const t = (this.k2 | 2) & 0xffff;
    return ((t * (t ^ 1)) >>> 8) & 0xff;
  }

  encrypt(data: Uint8Array): Uint8Array {
    const out = new Uint8Array(data.length);
    for (let i = 0; i < data.length; i++) {
      out[i] = data[i] ^ this.keyByte();
      this.update(data[i]);
    }
    return out;
  }
}

function dosDateTime(d: Date): { time: number; date: number } {
  return {
    time: (d.getUTCHours() << 11) | (d.getUTCMinutes() << 5) | (d.getUTCSeconds() >> 1),
    date: ((d.getUTCFullYear() - 1980) << 9) | ((d.getUTCMonth() + 1) << 5) | d.getUTCDate(),
  };
}

/**
 * Builds a ZIP containing the given files, each encrypted with the password (when one is given).
 * `when` is the timestamp shown for the files (Jakarta wall-clock time is fine: ZIP stores no time zone).
 */
export function buildZip(files: { name: string; data: Uint8Array }[], password: string | null, when = new Date()): Uint8Array {
  const enc = new TextEncoder();
  const { time, date } = dosDateTime(when);
  const local: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  for (const f of files) {
    const name = enc.encode(f.name);
    const crc = crc32(f.data);
    let body = f.data;
    if (password) {
      const z = new ZipCrypto(enc.encode(password));
      const header = crypto.getRandomValues(new Uint8Array(12));
      header[11] = crc >>> 24; // lets unzip tools check the password
      const encHeader = z.encrypt(header);
      const encData = z.encrypt(f.data);
      body = new Uint8Array(12 + encData.length);
      body.set(encHeader, 0);
      body.set(encData, 12);
    }
    const flags = (password ? 0x0001 : 0) | 0x0800; // encrypted, UTF-8 names

    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true);
    lh.setUint16(4, 20, true);
    lh.setUint16(6, flags, true);
    lh.setUint16(8, 0, true); // stored
    lh.setUint16(10, time, true);
    lh.setUint16(12, date, true);
    lh.setUint32(14, crc, true);
    lh.setUint32(18, body.length, true);
    lh.setUint32(22, f.data.length, true);
    lh.setUint16(26, name.length, true);
    lh.setUint16(28, 0, true);
    local.push(new Uint8Array(lh.buffer), name, body);

    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true);
    ch.setUint16(4, 20, true);
    ch.setUint16(6, 20, true);
    ch.setUint16(8, flags, true);
    ch.setUint16(10, 0, true);
    ch.setUint16(12, time, true);
    ch.setUint16(14, date, true);
    ch.setUint32(16, crc, true);
    ch.setUint32(20, body.length, true);
    ch.setUint32(24, f.data.length, true);
    ch.setUint16(28, name.length, true);
    ch.setUint32(42, offset, true);
    central.push(new Uint8Array(ch.buffer), name);

    offset += 30 + name.length + body.length;
  }

  const cdSize = central.reduce((s, p) => s + p.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, cdSize, true);
  end.setUint32(16, offset, true);

  const parts = [...local, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let pos = 0;
  for (const p of parts) {
    out.set(p, pos);
    pos += p.length;
  }
  return out;
}
