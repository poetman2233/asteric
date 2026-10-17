import "server-only";
import * as OTPAuth from "otpauth";
import QRCode from "qrcode";
import { randomBytes } from "node:crypto";
import { decrypt, encrypt, sha256 } from "./crypto";

function totp(secretBase32: string, email: string) {
  return new OTPAuth.TOTP({ issuer: "Asteric", label: email, algorithm: "SHA1", digits: 6, period: 30, secret: OTPAuth.Secret.fromBase32(secretBase32) });
}

export async function newMfaEnrollment(email: string) {
  const secret = new OTPAuth.Secret({ size: 20 }).base32;
  const uri = totp(secret, email).toString();
  const qrDataUrl = await QRCode.toDataURL(uri, { margin: 1, width: 192, color: { dark: "#18181b", light: "#ffffff" } });
  return { secret, secretEnc: encrypt(secret), qrDataUrl };
}

export function verifyTotp(secretEnc: string, email: string, code: string): boolean {
  const clean = code.replace(/\s+/g, "");
  if (!/^\d{6}$/.test(clean)) return false;
  return totp(decrypt(secretEnc), email).validate({ token: clean, window: 1 }) !== null;
}

const ALPH = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function newRecoveryCodes(n = 10) {
  const codes = Array.from({ length: n }, () => {
    const b = randomBytes(8);
    const s = Array.from(b, (x) => ALPH[x % ALPH.length]).join("");
    return `${s.slice(0, 4)}-${s.slice(4)}`;
  });
  return { codes, hashes: codes.map((c) => sha256(c)) };
}

/** Returns the remaining hashes if `code` matched one, otherwise null. */
export function consumeRecoveryCode(hashes: string[] | null, code: string): string[] | null {
  if (!hashes?.length) return null;
  const h = sha256(code.trim().toUpperCase());
  if (!hashes.includes(h)) return null;
  return hashes.filter((x) => x !== h);
}
