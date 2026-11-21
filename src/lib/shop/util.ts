// Small framework-free helpers for the shop: normalising input, random codes, password hashing.
// Uses only Web Crypto, which exists both on Cloudflare Workers and in Node (tests).
import { AppError } from '../core/d1.ts';

export function normalizeEmail(value: unknown): string {
  const email = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) {
    throw new AppError(400, 'Alamat email tidak valid');
  }
  return email;
}

/** Indonesian mobile numbers in one form: 08xx, +628xx, 628xx and 8xx all become 628xx. */
export function normalizePhone(value: unknown): string {
  let digits = (typeof value === 'string' ? value : '').replace(/[^\d]/g, '');
  if (digits.startsWith('0')) digits = '62' + digits.slice(1);
  else if (digits.startsWith('8')) digits = '62' + digits;
  if (!/^628\d{7,12}$/.test(digits)) throw new AppError(400, 'Nomor HP tidak valid (contoh: 081234567890)');
  return digits;
}

/** 6281234567890 -> 081234567890, the way customers write it. */
export function displayPhone(phone: string): string {
  return phone.startsWith('62') ? '0' + phone.slice(2) : phone;
}

export function requireText(value: unknown, label: string, max = 200): string {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) throw new AppError(400, `${label} wajib diisi`);
  if (text.length > max) throw new AppError(400, `${label} terlalu panjang`);
  return text;
}

export function optionalText(value: unknown, max = 500): string | null {
  const text = typeof value === 'string' ? value.trim() : '';
  return text ? text.slice(0, max) : null;
}

// Letters and digits that cannot be confused with each other (no 0/O, 1/I/L).
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function randomCode(length: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let out = '';
  for (const b of bytes) out += CODE_ALPHABET[b % CODE_ALPHABET.length];
  return out;
}

function base64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** A random secret for session cookies and reset links. Only its SHA-256 is stored. */
export function randomToken(): string {
  return base64url(crypto.getRandomValues(new Uint8Array(32)));
}

export async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return base64url(new Uint8Array(digest));
}

// PBKDF2-SHA256. 100,000 iterations is the maximum Cloudflare Workers allows.
const ITERATIONS = 100_000;

async function pbkdf2(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations }, key, 256);
  return new Uint8Array(bits);
}

export function validatePassword(value: unknown): string {
  const password = typeof value === 'string' ? value : '';
  if (password.length < 8) throw new AppError(400, 'Password minimal 8 karakter');
  if (password.length > 200) throw new AppError(400, 'Password terlalu panjang');
  return password;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(password, salt, ITERATIONS);
  return `pbkdf2$${ITERATIONS}$${btoa(String.fromCharCode(...salt))}$${btoa(String.fromCharCode(...hash))}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, iter, saltB64, hashB64] = stored.split('$');
  if (scheme !== 'pbkdf2') return false;
  const expected = fromBase64(hashB64);
  const actual = await pbkdf2(password, fromBase64(saltB64), Number(iter));
  if (actual.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < actual.length; i++) diff |= actual[i] ^ expected[i];
  return diff === 0;
}
