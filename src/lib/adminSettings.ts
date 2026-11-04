import { AdminPermissionSection, SubAdminCabinetAccount } from '../types';
import { protobufFetch as fetch } from './protobufClient';

export interface AdminConfig {
  login: string;
  password: string;
  passwordHash?: string;
  emergencyPassword?: string;
  emergencyPasswordHash?: string;
  passwordMigrated?: boolean;
  credentialsUpdatedByAdmin?: boolean;
  logoUrl: string | null;
  telegram: string;
  telegram2?: string;
  instagram: string;
  youtube?: string;
  phone: string;
}

export interface BunkerAdminCredentials {
  login: string;
  password: string;
  passwordHash?: string;
  passwordMigrated?: boolean;
  phone?: string;
}

// Alohida Bunker Admin standart kirish ma'lumotlari (Login: ADMIN, Parol: BUNKER)
export const BUNKER_ADMIN_CREDENTIALS: BunkerAdminCredentials = {
  login: 'ADMIN',
  password: 'BUNKER',
  phone: '+998 71 200 00 50',
};

const BUNKER_ADMIN_STORAGE_KEY = 'bunkerstroy_bunker_admin_creds_v1';

let memoryBunkerCreds: BunkerAdminCredentials | null = null;
let memoryAdminConfig: AdminConfig | null = null;
let memorySubAdmins: SubAdminCabinetAccount[] | null = null;

/**
 * Rasm faylini (logotip va h.k.) localStorage kvotasini to'ldirib qo'ymasligi uchun
 * Canvas orqali ixcham o'lchamga (default 256x256) keltirib DataURL qaytaradi.
 */
export function compressImageFileToDataUrl(
  file: File,
  maxDimension = 256,
  quality = 0.82
): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      const rawResult = typeof reader.result === 'string' ? reader.result : '';
      if (!rawResult || file.type === 'image/svg+xml' || rawResult.length < 40_000) {
        resolve(rawResult);
        return;
      }
      const img = new Image();
      img.onload = () => {
        try {
          let width = img.width || maxDimension;
          let height = img.height || maxDimension;
          if (width > maxDimension || height > maxDimension) {
            if (width >= height) {
              height = Math.max(1, Math.round((height * maxDimension) / width));
              width = maxDimension;
            } else {
              width = Math.max(1, Math.round((width * maxDimension) / height));
              height = maxDimension;
            }
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(rawResult);
            return;
          }
          ctx.clearRect(0, 0, width, height);
          ctx.drawImage(img, 0, 0, width, height);
          let compressed = canvas.toDataURL('image/webp', quality);
          if (!compressed || compressed === 'data:,' || compressed.length > rawResult.length) {
            compressed = canvas.toDataURL('image/png');
          }
          if (compressed.length > 120_000) {
            compressed = canvas.toDataURL('image/jpeg', 0.7);
          }
          resolve(compressed);
        } catch {
          resolve(rawResult);
        }
      };
      img.onerror = () => resolve(rawResult);
      img.src = rawResult;
    };
    reader.onerror = () => resolve('');
    reader.readAsDataURL(file);
  });
}

function freeUpLocalStorageQuota(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem('bunkerstroy_admin_config');
    localStorage.removeItem('bunkerstroy_single_admin_config_v1');

    // 1. Loglarni qisqartirish
    const rawLogs = localStorage.getItem('bunkerstroy_logs');
    if (rawLogs && rawLogs.length > 30_000) {
      try {
        const parsedLogs = JSON.parse(rawLogs);
        if (Array.isArray(parsedLogs)) {
          localStorage.setItem('bunkerstroy_logs', JSON.stringify(parsedLogs.slice(0, 25)));
        }
      } catch {
        localStorage.removeItem('bunkerstroy_logs');
      }
    }

    // 2. Qidiruv loglarini qisqartirish
    const rawSearch = localStorage.getItem('bunkerstroy_search_logs');
    if (rawSearch && rawSearch.length > 20_000) {
      try {
        const parsedSearch = JSON.parse(rawSearch);
        if (Array.isArray(parsedSearch)) {
          localStorage.setItem('bunkerstroy_search_logs', JSON.stringify(parsedSearch.slice(0, 30)));
        }
      } catch {
        localStorage.removeItem('bunkerstroy_search_logs');
      }
    }

    // 3. Ta'minotchilardagi katta hajmli base64 PDF fayllarni yengillashtirish
    const rawSupps = localStorage.getItem('bunkerstroy_suppliers');
    if (rawSupps && rawSupps.length > 500_000) {
      try {
        const parsedSupps = JSON.parse(rawSupps);
        if (Array.isArray(parsedSupps)) {
          const slimSupps = parsedSupps.map((s: any) => {
            if (s && typeof s.contractPdfData === 'string' && s.contractPdfData.length > 50_000) {
              const { contractPdfData, ...rest } = s;
              return rest;
            }
            return s;
          });
          localStorage.setItem('bunkerstroy_suppliers', JSON.stringify(slimSupps));
        }
      } catch {}
    }

    // 4. Mahsulotlardagi ortiqcha katta base64 suratlarni yengillashtirish (agar juda katta bo'lsa)
    const rawProds = localStorage.getItem('bunkerstroy_products');
    if (rawProds && rawProds.length > 2_500_000) {
      try {
        const parsedProds = JSON.parse(rawProds);
        if (Array.isArray(parsedProds)) {
          const slimProds = parsedProds.map((p: any) => {
            if (!p || typeof p !== 'object') return p;
            const imgs = Array.isArray(p.images) ? p.images.slice(0, 2) : p.images;
            return { ...p, images: imgs };
          });
          localStorage.setItem('bunkerstroy_products', JSON.stringify(slimProds));
        }
      } catch {}
    }
  } catch {}
}

function safeSetLocalStorageItem(key: string, value: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    freeUpLocalStorageQuota();
    try {
      localStorage.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  }
}

export function getBunkerAdminCredentials(): BunkerAdminCredentials {
  if (memoryBunkerCreds) {
    return { ...memoryBunkerCreds };
  }
  try {
    if (typeof window !== 'undefined') {
      const raw = localStorage.getItem(BUNKER_ADMIN_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        const login = typeof parsed?.login === 'string' ? parsed.login.trim() : '';
        const password = typeof parsed?.password === 'string' ? parsed.password.trim() : '';
        const passwordHash = typeof parsed?.passwordHash === 'string' ? parsed.passwordHash.trim() : undefined;
        const passwordMigrated = Boolean(parsed?.passwordMigrated && passwordHash);
        const phone = typeof parsed?.phone === 'string' && parsed.phone.trim() ? parsed.phone.trim() : BUNKER_ADMIN_CREDENTIALS.phone;
        if (login && (password || passwordHash)) {
          memoryBunkerCreds = { login, password: passwordMigrated ? '' : password, passwordHash, passwordMigrated, phone };
          return { ...memoryBunkerCreds };
        }
      }
    }
  } catch {}
  return { ...BUNKER_ADMIN_CREDENTIALS };
}

export function saveBunkerAdminCredentials(creds: BunkerAdminCredentials): void {
  const isMigrated = Boolean(creds.passwordMigrated && creds.passwordHash);
  const next: BunkerAdminCredentials = {
    login: (creds.login || BUNKER_ADMIN_CREDENTIALS.login).trim(),
    password: isMigrated ? '' : (creds.password || BUNKER_ADMIN_CREDENTIALS.password || '').trim(),
    passwordHash: creds.passwordHash,
    passwordMigrated: isMigrated,
    phone: (creds.phone || BUNKER_ADMIN_CREDENTIALS.phone || '+998 71 200 00 50').trim(),
  };
  memoryBunkerCreds = next;
  safeSetLocalStorageItem(BUNKER_ADMIN_STORAGE_KEY, JSON.stringify(next));
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('bunkerstroy_bunker_admin_updated', { detail: next }));
  }
}

// Hozirgi mavjud Bosh Admin standart kirish ma'lumotlari (Login: ADMIN., Parol: ADMIN.)
const DEFAULT_CONFIG: AdminConfig = {
  login: 'ADMIN.',
  password: 'ADMIN.',
  credentialsUpdatedByAdmin: false,
  logoUrl: null,
  telegram: '@bunkerstroy_uz',
  telegram2: '@bunkerstroy_uz',
  instagram: '@bunkerstroy_official',
  youtube: '@bunkerstroy',
  phone: '+998 (71) 200-00-50',
};

const STORAGE_KEY = 'bunkerstroy_single_admin_config_v2';
const LEGACY_STORAGE_KEY = 'bunkerstroy_admin_config';
const SUB_ADMINS_STORAGE_KEY = 'bunkerstroy_sub_admins_v1';

export const ADMIN_PERMISSION_META: {
  id: AdminPermissionSection;
  label: string;
  shortLabel: string;
  description: string;
}[] = [
  {
    id: 'reports',
    label: 'Monitoring, hisobot',
    shortLabel: 'Monitoring, hisobot',
    description: 'Monitoring, hisobot va moliyaviy tahlil bo‘limi',
  },
  {
    id: 'suppliers',
    label: "Ta'minotchi B2B2C Kuzatuvi",
    shortLabel: "Ta'minotchi B2B2C Hamkorlar",
    description: "Ta'minotchi B2B2C Hamkorlar bo‘limida B2B va B2C kabinetlar bilan ishlash",
  },
  {
    id: 'requests_customers',
    label: "So'rov va Mijozlar",
    shortLabel: "So'rov va Mijozlar",
    description: "So'rov va mijozlar bo‘limida buyurtmalar, qidiruvlar va mijozlar bilan ishlash",
  },
  {
    id: 'b2b_crm',
    label: 'B2B CRM',
    shortLabel: 'B2B CRM',
    description: "B2B (Ishlab chiqaruvchi) ta'minotchilar CRM savdolari, ombor qoldig‘i va B2B so‘rovlari",
  },
  {
    id: 'b2c_crm',
    label: 'B2C CRM',
    shortLabel: 'B2C CRM',
    description: "B2C (Hamkor) ta'minotchilar CRM savdolari, ombor qoldig‘i va kirim-chiqim hisoboti",
  },
];

export function getAdminConfig(): AdminConfig {
  if (memoryAdminConfig) {
    return { ...memoryAdminConfig };
  }
  try {
    if (typeof window !== 'undefined' && localStorage.getItem(LEGACY_STORAGE_KEY)) {
      localStorage.removeItem(LEGACY_STORAGE_KEY);
    }

    const raw = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
    if (raw) {
      const parsed = JSON.parse(raw);
      const hasCustomChanged = Boolean(parsed.credentialsUpdatedByAdmin);
      const rawLogin = typeof parsed.login === 'string' ? parsed.login.trim() : '';
      const rawPass = typeof parsed.password === 'string' ? parsed.password.trim() : '';
      const rawHash = typeof parsed.passwordHash === 'string' ? parsed.passwordHash.trim() : undefined;
      const isMigrated = Boolean(parsed.passwordMigrated && rawHash);

      const isForbiddenLegacy =
        !rawLogin ||
        (!rawPass && !rawHash) ||
        rawLogin.toLowerCase() === 'yelenabe' ||
        rawLogin.toLowerCase() === 'aaaa' ||
        rawLogin === 'AA' ||
        rawLogin.toLowerCase() === 'super' ||
        rawLogin.toLowerCase() === 'superadmin';

      const loginVal = hasCustomChanged && !isForbiddenLegacy ? rawLogin : DEFAULT_CONFIG.login;
      const passwordVal = isMigrated
        ? ''
        : hasCustomChanged && !isForbiddenLegacy
        ? rawPass
        : DEFAULT_CONFIG.password;

      const resolved: AdminConfig = {
        login: loginVal,
        password: passwordVal,
        passwordHash: !isForbiddenLegacy ? rawHash : undefined,
        passwordMigrated: !isForbiddenLegacy && isMigrated,
        credentialsUpdatedByAdmin: hasCustomChanged && !isForbiddenLegacy,
        logoUrl: parsed.logoUrl !== undefined ? parsed.logoUrl : DEFAULT_CONFIG.logoUrl,
        telegram: parsed.telegram !== undefined ? parsed.telegram : DEFAULT_CONFIG.telegram,
        telegram2: parsed.telegram2 !== undefined ? parsed.telegram2 : (parsed.telegram || DEFAULT_CONFIG.telegram2),
        instagram: parsed.instagram !== undefined ? parsed.instagram : DEFAULT_CONFIG.instagram,
        youtube: parsed.youtube !== undefined ? parsed.youtube : DEFAULT_CONFIG.youtube,
        phone: parsed.phone !== undefined ? parsed.phone : DEFAULT_CONFIG.phone,
      };
      memoryAdminConfig = resolved;
      return { ...resolved };
    }
  } catch {}
  return { ...DEFAULT_CONFIG };
}

export function saveAdminConfig(config: AdminConfig): void {
  const isMigrated = Boolean(config.passwordMigrated && config.passwordHash);
  const nextConfig: AdminConfig = {
    ...config,
    login: (config.login || DEFAULT_CONFIG.login).trim(),
    password: isMigrated ? '' : (config.password || DEFAULT_CONFIG.password || '').trim(),
    passwordHash: config.passwordHash,
    passwordMigrated: isMigrated,
    credentialsUpdatedByAdmin: true,
  };
  memoryAdminConfig = nextConfig;

  try {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(LEGACY_STORAGE_KEY);
    }
  } catch {}

  const saved = safeSetLocalStorageItem(STORAGE_KEY, JSON.stringify(nextConfig));
  if (!saved && nextConfig.logoUrl && nextConfig.logoUrl.length > 20_000) {
    const slimConfig: AdminConfig = { ...nextConfig, logoUrl: null };
    safeSetLocalStorageItem(STORAGE_KEY, JSON.stringify(slimConfig));
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('bunkerstroy_admin_config_updated', { detail: nextConfig }));
  }
}

export function getSubAdmins(): SubAdminCabinetAccount[] {
  if (memorySubAdmins) {
    return [...memorySubAdmins];
  }
  try {
    const raw = typeof window !== 'undefined' ? localStorage.getItem(SUB_ADMINS_STORAGE_KEY) : null;
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const filtered = parsed.filter(
          (item: SubAdminCabinetAccount) =>
            item &&
            typeof item.id === 'string' &&
            typeof item.login === 'string' &&
            (typeof item.password === 'string' || typeof item.passwordHash === 'string') &&
            Array.isArray(item.permissions)
        );
        memorySubAdmins = filtered;
        return [...filtered];
      }
    }
  } catch {}
  return [];
}

export function saveSubAdmins(list: SubAdminCabinetAccount[]): void {
  memorySubAdmins = [...list];
  safeSetLocalStorageItem(SUB_ADMINS_STORAGE_KEY, JSON.stringify(list));
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('bunkerstroy_sub_admins_updated', { detail: list }));
  }
}

export const MIN_LOGIN_LENGTH = 5;
export const MIN_PASSWORD_LENGTH = 7;
export const LOGIN_REJECTED_MESSAGE = "Login qabul qilinmadi! Qayta urinib ko‘ring.";

export function isLoginRejectedError(msg: string | null | undefined): boolean {
  return Boolean(msg && msg.includes('Login qabul qilinmadi'));
}

export function computePasswordSignature(plainPassword: string): string {
  const clean = String(plainPassword || '').trim();
  if (!clean) return '';
  let h1 = 0xdeadbeef ^ clean.length;
  let h2 = 0x41c6ce57 ^ clean.length;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return `psig_${(h2 >>> 0).toString(16).padStart(8, '0')}${(h1 >>> 0).toString(16).padStart(8, '0')}_${clean.length}`;
}

function collectAccountsWithSameLogin(cleanCandidateLower: string, excludeId?: string): any[] {
  const matched: any[] = [];
  if (!cleanCandidateLower) return matched;

  try {
    // 1. Bunker Admin
    if (excludeId !== 'bunker-admin-master') {
      const bunkerCreds = getBunkerAdminCredentials();
      if ((bunkerCreds.login || '').trim().toLowerCase() === cleanCandidateLower) {
        matched.push({ ...bunkerCreds, id: 'bunker-admin-master' });
      }
    }

    // 2. Asosiy Admin Kabineti
    if (excludeId !== 'admin-master') {
      const adminCfg = getAdminConfig();
      if ((adminCfg.login || '').trim().toLowerCase() === cleanCandidateLower) {
        matched.push({ ...adminCfg, id: 'admin-master' });
      }
    }

    // 3. Qo'shilgan Admin Kabinetlar
    const subAdmins = getSubAdmins();
    subAdmins.forEach((sa) => {
      if (sa && sa.id !== excludeId && (sa.login || '').trim().toLowerCase() === cleanCandidateLower) {
        matched.push(sa);
      }
    });

    // 4. B2B va B2C Ta'minotchi Kabinetlar
    if (typeof window !== 'undefined') {
      const rawSupps = localStorage.getItem('bunkerstroy_suppliers');
      if (rawSupps) {
        const parsedSupps = JSON.parse(rawSupps);
        if (Array.isArray(parsedSupps)) {
          parsedSupps.forEach((s: any) => {
            if (s && s.id !== excludeId && (s.login || '').trim().toLowerCase() === cleanCandidateLower) {
              matched.push(s);
            }
          });
        }
      }

      // 5. Jismoniy shaxs / Mijoz Kabinetlar
      const rawCusts = localStorage.getItem('bunkerstroy_customers');
      if (rawCusts) {
        const parsedCusts = JSON.parse(rawCusts);
        if (Array.isArray(parsedCusts)) {
          parsedCusts.forEach((c: any) => {
            if (
              c &&
              c.id !== excludeId &&
              ((c.login || '').trim().toLowerCase() === cleanCandidateLower ||
                (c.email || '').split('@')[0].trim().toLowerCase() === cleanCandidateLower)
            ) {
              matched.push(c);
            }
          });
        }
      }
    }
  } catch {}

  return matched;
}

function doesAccountHaveSamePasswordSync(
  existingAcc: any,
  cleanCandidatePassword: string,
  currentAccount?: any
): boolean {
  if (!existingAcc) return false;
  const existingPlain = typeof existingAcc.password === 'string' ? existingAcc.password.trim() : '';
  const existingSig =
    typeof existingAcc.passwordSignature === 'string' && existingAcc.passwordSignature
      ? existingAcc.passwordSignature
      : existingPlain
      ? computePasswordSignature(existingPlain)
      : '';
  const existingHash = typeof existingAcc.passwordHash === 'string' ? existingAcc.passwordHash.trim() : '';

  if (cleanCandidatePassword) {
    const candidateSig = computePasswordSignature(cleanCandidatePassword);
    if (existingPlain && existingPlain === cleanCandidatePassword) return true;
    if (existingSig && candidateSig && existingSig === candidateSig) return true;
    return false;
  }

  if (currentAccount) {
    const currPlain = typeof currentAccount.password === 'string' ? currentAccount.password.trim() : '';
    const currSig =
      typeof currentAccount.passwordSignature === 'string' && currentAccount.passwordSignature
        ? currentAccount.passwordSignature
        : currPlain
        ? computePasswordSignature(currPlain)
        : '';
    const currHash = typeof currentAccount.passwordHash === 'string' ? currentAccount.passwordHash.trim() : '';

    if (currPlain && existingPlain && currPlain === existingPlain) return true;
    if (currSig && existingSig && currSig === existingSig) return true;
    if (currHash && existingHash && currHash === existingHash) return true;
  }

  return false;
}

/**
 * Login va parol qoidalari:
 * 1) Login kamida 5 ta belgidan iborat bo'lishi shart (harf, raqam, simvol aralash mumkin).
 * 2) Parol kamida 7 ta belgidan iborat bo'lishi shart (harf, raqam, simvol aralash mumkin).
 * 3) Platformada bir nechta bir xil login yoki bir xil parol bo'lishi mumkin,
 *    AMMO ham login, ham parol bir xil bo'lsa: "Login qabul qilinmadi! Qayta urinib ko‘ring." qaytariladi.
 */
export function getLoginConflictError(
  candidateLogin: string,
  excludeId?: string,
  candidatePassword?: string,
  options?: { requirePassword?: boolean; currentAccount?: any }
): string | null {
  const cleanCandidateRaw = (candidateLogin || '').trim();
  if (!cleanCandidateRaw) return null;

  if (cleanCandidateRaw.length < MIN_LOGIN_LENGTH) {
    return "Login kamida 5 ta belgidan iborat bo‘lishi kerak!";
  }

  const cleanPass = typeof candidatePassword === 'string' ? candidatePassword.trim() : '';
  if ((options?.requirePassword || cleanPass.length > 0) && cleanPass.length < MIN_PASSWORD_LENGTH) {
    return "Parol kamida 7 ta belgidan iborat bo‘lishi kerak!";
  }

  const sameLoginAccounts = collectAccountsWithSameLogin(cleanCandidateRaw.toLowerCase(), excludeId);
  if (sameLoginAccounts.length === 0) {
    return null;
  }

  if (cleanPass || options?.currentAccount) {
    const hasExactLoginAndPasswordMatch = sameLoginAccounts.some((acc) =>
      doesAccountHaveSamePasswordSync(acc, cleanPass, options?.currentAccount)
    );
    if (hasExactLoginAndPasswordMatch) {
      return LOGIN_REJECTED_MESSAGE;
    }
  }

  return null;
}

export async function validateLoginAndPasswordAsync(
  candidateLogin: string,
  candidatePassword?: string,
  excludeId?: string,
  options?: { requirePassword?: boolean; currentAccount?: any }
): Promise<{ error: string | null; clearLogin: boolean }> {
  const syncErr = getLoginConflictError(candidateLogin, excludeId, candidatePassword, options);
  if (syncErr) {
    return {
      error: syncErr,
      clearLogin: isLoginRejectedError(syncErr),
    };
  }

  const cleanCandidateRaw = (candidateLogin || '').trim();
  const cleanPass = typeof candidatePassword === 'string' ? candidatePassword.trim() : '';
  if (!cleanCandidateRaw || !cleanPass) {
    return { error: null, clearLogin: false };
  }

  const sameLoginAccounts = collectAccountsWithSameLogin(cleanCandidateRaw.toLowerCase(), excludeId);
  for (const acc of sameLoginAccounts) {
    if (acc?.passwordHash && String(acc.passwordHash).startsWith('$argon2id$')) {
      try {
        const resp = await fetch('/api/auth/verify-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: cleanPass, passwordHash: acc.passwordHash }),
        });
        const data = await resp.json().catch(() => ({}));
        if (data?.valid) {
          return {
            error: LOGIN_REJECTED_MESSAGE,
            clearLogin: true,
          };
        }
      } catch {}
    }
  }

  return { error: null, clearLogin: false };
}

export function isLoginTakenAnywhere(
  candidateLogin: string,
  excludeId?: string,
  candidatePassword?: string
): boolean {
  return Boolean(getLoginConflictError(candidateLogin, excludeId, candidatePassword));
}


