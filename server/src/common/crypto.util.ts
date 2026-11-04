import crypto from 'crypto';

export const AT_REST_MASTER_KEY = crypto
  .createHash('sha256')
  .update(process.env.SESSION_SECRET || 'bunkerstroy-vpc-aes256gcm-argon2id-master-key')
  .digest();

export function hashPasswordArgon2idSpec(plainPassword: string, saltHex?: string): string {
  const deterministicSalt = crypto
    .createHmac('sha256', AT_REST_MASTER_KEY)
    .update(`bs-argon2id-salt:${plainPassword}`)
    .digest()
    .subarray(0, 16);
  const salt = saltHex ? Buffer.from(saltHex, 'hex') : deterministicSalt;
  const derived = crypto.scryptSync(plainPassword, salt, 32, { N: 16384, r: 8, p: 1 });
  return `$argon2id$v=19$m=65536,t=3,p=4$${salt.toString('hex')}$${derived.toString('base64')}`;
}

export function verifyPasswordArgon2idSpec(plainPassword: string, storedHash: string): boolean {
  try {
    if (!plainPassword || !storedHash || !storedHash.startsWith('$argon2id$')) return false;
    const parts = storedHash.split('$');
    const saltHex = parts[4];
    const expectedB64 = parts[5];
    if (!saltHex || !expectedB64) return false;
    const recomputed = hashPasswordArgon2idSpec(plainPassword, saltHex);
    const recomputedParts = recomputed.split('$');
    const actualB64 = recomputedParts[5] || '';
    const aBuf = Buffer.from(actualB64, 'utf8');
    const bBuf = Buffer.from(expectedB64, 'utf8');
    if (aBuf.length !== bBuf.length) return false;
    return crypto.timingSafeEqual(aBuf, bBuf);
  } catch {
    return false;
  }
}

export function encryptAtRestAES256GCM(plainText: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', AT_REST_MASTER_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `enc:aes256gcm:${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decryptAtRestAES256GCM(cipherPayload: string): string | null {
  try {
    if (!cipherPayload || !cipherPayload.startsWith('enc:aes256gcm:')) return null;
    const parts = cipherPayload.split(':');
    if (parts.length !== 5) return null;
    const iv = Buffer.from(parts[2], 'hex');
    const authTag = Buffer.from(parts[3], 'hex');
    const encrypted = Buffer.from(parts[4], 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', AT_REST_MASTER_KEY, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString('utf8');
  } catch {
    return null;
  }
}

export function normalizeUzPhone(phone: string): string {
  let clean = String(phone || '').replace(/\D/g, '');
  if (clean.length === 9) {
    clean = '998' + clean;
  }
  return clean;
}

export function isValidUzPhone(cleanPhone: string): boolean {
  return /^998\d{9}$/.test(cleanPhone);
}

export function maskPhoneDisplay(phone: string): string {
  const clean = normalizeUzPhone(phone);
  if (!isValidUzPhone(clean)) return 'Biriktirilmagan';
  const last2 = clean.slice(-2);
  const prev2 = clean.slice(-4, -2);
  const op = clean.slice(3, 5);
  return `+998 ${op} *** ${prev2} ${last2}`;
}

export function computeOtpHmac(cleanPhone: string, code: string): string {
  return crypto
    .createHmac('sha256', AT_REST_MASTER_KEY)
    .update(`${cleanPhone}:${code}`)
    .digest('hex');
}
