import "server-only";
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { config } from "@/server/config";

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number, opts: object) => Promise<Buffer>;

// OWASP-acceptable scrypt parameters (N=2^15, r=8, p=1), ~64 MiB.
const N = 32768, R = 8, P = 1, KEYLEN = 32;
const MAXMEM = 128 * N * R * 2;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const dk = await scrypt(password.normalize("NFKC"), salt, KEYLEN, { N, r: R, p: P, maxmem: MAXMEM });
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64")}$${dk.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string | null | undefined): Promise<boolean> {
  if (!stored) {
    // Burn equivalent time so a missing account is indistinguishable by timing.
    await scrypt(password, randomBytes(16), KEYLEN, { N, r: R, p: P, maxmem: MAXMEM });
    return false;
  }
  const [alg, n, r, p, salt, hash] = stored.split("$");
  if (alg !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64");
  const dk = await scrypt(password.normalize("NFKC"), Buffer.from(salt, "base64"), expected.length, {
    N: Number(n), r: Number(r), p: Number(p), maxmem: 128 * Number(n) * Number(r) * 2,
  });
  return dk.length === expected.length && timingSafeEqual(dk, expected);
}

/** Opaque random token for cookies and links. Only its SHA-256 hash is stored. */
export function newToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}
export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
/** Keyed hash for privacy-preserving identifiers (e.g. IP addresses in rate limits). */
export function hmac(value: string): string {
  return createHmac("sha256", config.encryptionKey).update(value).digest("hex").slice(0, 32);
}

/** AES-256-GCM encryption for secrets at rest (e.g. MFA seeds). */
export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", config.encryptionKey, iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), ct.toString("base64")].join(".");
}
export function decrypt(payload: string): string {
  const [v, iv, tag, ct] = payload.split(".");
  if (v !== "v1" || !iv || !tag || !ct) throw new Error("Unsupported ciphertext");
  const decipher = createDecipheriv("aes-256-gcm", config.encryptionKey, Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(ct, "base64")), decipher.final()]).toString("utf8");
}

const COMMON = new Set(["password1234", "123456789012", "qwertyuiopas", "letmein12345", "passwordpassword", "welcome12345", "asteric12345"]);
/** Returns an error message, or null when the password is acceptable. */
export function passwordProblem(pw: string, email?: string): string | null {
  if (pw.length < 12) return "Use at least 12 characters.";
  if (pw.length > 200) return "Use 200 characters or fewer.";
  if (COMMON.has(pw.toLowerCase())) return "This password is too common.";
  if (email && pw.toLowerCase().includes(email.split("@")[0]!.toLowerCase())) return "Do not include your email name in your password.";
  return null;
}
