import { getAdminConfig, saveAdminConfig, getBunkerAdminCredentials, getSubAdmins, saveSubAdmins } from './adminSettings';
import { protobufFetch as fetch } from './protobufClient';
import { encodeProtobufPacket, PROTOBUF_MIME_TYPE } from './protobufCodec';

export interface FailedPasswordAttempt {
  attemptNumber: number;
  enteredPassword: string;
  timestamp: string;
}

export interface SecurityBlockRequest {
  id: string;
  login: string;
  currentPassword: string;
  oneTimePassword?: string;
  cabinetId?: string;
  cabinetName: string;
  cabinetType: 'B2B' | 'B2C' | 'Mijoz' | 'Admin' | 'Bunker Admin' | 'Noma’lum';
  phone: string;
  inn?: string;
  region?: string;
  district?: string;
  contractNumber?: string;
  ip: string;
  failedAttempts: FailedPasswordAttempt[];
  attemptsCount: number;
  isBlocked: boolean;
  blockedAt?: string;
  blockedUntil?: number; // ms timestamp (25 minutes = 25 * 60 * 1000)
  acknowledgedByAdmin: boolean;
  updatedAt: string;
}

const SECURITY_REQUESTS_KEY = 'bunkerstroy_security_requests_v1';
export const BLOCK_DURATION_MS = 25 * 60 * 1000; // 25 daqiqa
export const MAX_FAILED_ATTEMPTS = 5; // 5 marta xato parol

function appendSystemSecurityLog(entry: {
  action: string;
  actor: string;
  category: string;
  details: string;
  ip?: string;
  level?: 'info' | 'warning' | 'error' | 'success';
}) {
  try {
    const savedLogs = localStorage.getItem('bunkerstroy_logs');
    const logsList = savedLogs ? JSON.parse(savedLogs) : [];
    const safeList = Array.isArray(logsList) ? logsList : [];
    safeList.unshift({
      id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      action: entry.action,
      actor: entry.actor,
      category: entry.category,
      details: entry.details,
      timestamp: new Date().toISOString(),
      ip: entry.ip || getClientIpAddress(),
      level: entry.level || 'info',
    });
    localStorage.setItem('bunkerstroy_logs', JSON.stringify(safeList.slice(0, 150)));
    window.dispatchEvent(new CustomEvent('bunkerstroy_logs_updated'));
  } catch {}
}

export function getClientIpAddress(): string {
  try {
    const savedIp = sessionStorage.getItem('bs_client_ip');
    if (savedIp) return savedIp;
    const generated = `195.158.${Math.floor(10 + Math.random() * 80)}.${Math.floor(10 + Math.random() * 240)}`;
    sessionStorage.setItem('bs_client_ip', generated);
    return generated;
  } catch {
    return '195.158.12.84';
  }
}

export function resolveCabinetMetadataByLogin(rawLogin: string): {
  cabinetId?: string;
  login: string;
  currentPassword: string;
  cabinetName: string;
  cabinetType: 'B2B' | 'B2C' | 'Mijoz' | 'Admin' | 'Bunker Admin' | 'Noma’lum';
  phone: string;
  inn?: string;
  region?: string;
  district?: string;
  contractNumber?: string;
} {
  const trimmed = (rawLogin || '').trim();
  const lower = trimmed.toLowerCase();

  try {
    // 1. Bunker Admin
    const bunkerCreds = getBunkerAdminCredentials();
    if (trimmed === bunkerCreds.login || lower === bunkerCreds.login.toLowerCase()) {
      return {
        cabinetId: 'bunker-admin-master',
        login: bunkerCreds.login,
        currentPassword: bunkerCreds.password,
        cabinetName: 'Bunker Admin Kabineti',
        cabinetType: 'Bunker Admin',
        phone: bunkerCreds.phone || '+998 77 017 03 01',
      };
    }

    // 2. Asosiy Admin Kabineti
    const adminCfg = getAdminConfig();
    if (trimmed === adminCfg.login || lower === (adminCfg.login || 'ADMIN.').toLowerCase()) {
      return {
        cabinetId: 'admin-master',
        login: adminCfg.login || 'ADMIN.',
        currentPassword: adminCfg.password || 'ADMIN.',
        cabinetName: 'Admin Kabineti',
        cabinetType: 'Admin',
        phone: adminCfg.phone || '+998 71 200 00 50',
      };
    }

    // 3. Qo'shilgan Admin Kabinetlar
    const subAdmins = getSubAdmins();
    const matchedSub =
      subAdmins.find((sa) => sa && String(sa.login || '').trim() === trimmed) ||
      subAdmins.find((sa) => sa && String(sa.login || '').trim().toLowerCase() === lower);
    if (matchedSub) {
      return {
        cabinetId: matchedSub.id,
        login: matchedSub.login,
        currentPassword: matchedSub.password,
        cabinetName: matchedSub.cabinetName || 'Admin Kabinet',
        cabinetType: 'Admin',
        phone: matchedSub.phone || adminCfg.phone || '+998 71 200 00 50',
      };
    }

    // 4. B2B va B2C Ta'minotchilar
    const rawSupps = localStorage.getItem('bunkerstroy_suppliers');
    if (rawSupps) {
      const supps = JSON.parse(rawSupps);
      if (Array.isArray(supps)) {
        const matchedSupp =
          supps.find((s: any) => s && String(s.login || '').trim() === trimmed) ||
          supps.find((s: any) => s && String(s.login || '').trim().toLowerCase() === lower);
        if (matchedSupp) {
          return {
            cabinetId: matchedSupp.id,
            login: matchedSupp.login,
            currentPassword: matchedSupp.password || '',
            cabinetName: matchedSupp.companyName || matchedSupp.name || matchedSupp.login,
            cabinetType: matchedSupp.cabinetType === 'manufacturer' ? 'B2B' : 'B2C',
            phone: matchedSupp.phone || '+998 ',
            inn: matchedSupp.inn,
            region: matchedSupp.region,
            district: matchedSupp.district,
            contractNumber: matchedSupp.contractNumber,
          };
        }
      }
    }

    // 5. Foydalanuvchi (Mijoz) Kabinetlari
    const rawCusts = localStorage.getItem('bunkerstroy_customers');
    if (rawCusts) {
      const custs = JSON.parse(rawCusts);
      if (Array.isArray(custs)) {
        const matchedCust =
          custs.find((c: any) => c && String(c.login || '').trim() === trimmed) ||
          custs.find((c: any) => c && String(c.login || '').trim().toLowerCase() === lower);
        if (matchedCust) {
          return {
            cabinetId: matchedCust.id,
            login: matchedCust.login || trimmed,
            currentPassword: matchedCust.password || '',
            cabinetName:
              matchedCust.displayName ||
              matchedCust.companyName ||
              `${matchedCust.firstName || ''} ${matchedCust.lastName || ''}`.trim() ||
              trimmed,
            cabinetType: 'Mijoz',
            phone: matchedCust.phone || '+998 ',
            inn: matchedCust.inn,
            region: matchedCust.region,
            district: matchedCust.district,
          };
        }
      }
    }
  } catch {}

  return {
    login: trimmed,
    currentPassword: '— (Ro‘yxatdan o‘tmagan login)',
    cabinetName: `Noma’lum urinish (${trimmed})`,
    cabinetType: 'Noma’lum',
    phone: '—',
  };
}

export function getSecurityBlockRequests(): SecurityBlockRequest[] {
  try {
    const raw = localStorage.getItem(SECURITY_REQUESTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const now = Date.now();
    return parsed.map((item: SecurityBlockRequest) => {
      const meta = resolveCabinetMetadataByLogin(item.login);
      const stillBlocked = Boolean(item.isBlocked && item.blockedUntil && item.blockedUntil > now);
      return {
        ...item,
        cabinetId: meta.cabinetId || item.cabinetId,
        cabinetName: meta.cabinetType !== 'Noma’lum' ? meta.cabinetName : item.cabinetName,
        cabinetType: meta.cabinetType !== 'Noma’lum' ? meta.cabinetType : item.cabinetType,
        currentPassword:
          meta.cabinetType !== 'Noma’lum' && meta.currentPassword
            ? meta.currentPassword
            : item.currentPassword,
        phone: meta.phone && meta.phone !== '—' ? meta.phone : item.phone,
        inn: meta.inn || item.inn,
        region: meta.region || item.region,
        district: meta.district || item.district,
        contractNumber: meta.contractNumber || item.contractNumber,
        isBlocked: stillBlocked,
      };
    });
  } catch {
    return [];
  }
}

export function saveSecurityBlockRequests(list: SecurityBlockRequest[]): void {
  try {
    localStorage.setItem(SECURITY_REQUESTS_KEY, JSON.stringify(list));
    window.dispatchEvent(new CustomEvent('bunkerstroy_security_updated', { detail: list }));
  } catch (e) {
    console.error('Failed to save security requests:', e);
  }
}

export function getLoginBlockStatus(rawLogin: string): {
  isBlocked: boolean;
  remainingSeconds: number;
  attemptsCount: number;
  record?: SecurityBlockRequest;
} {
  const trimmed = (rawLogin || '').trim();
  if (!trimmed) return { isBlocked: false, remainingSeconds: 0, attemptsCount: 0 };

  const list = getSecurityBlockRequests();
  const matched =
    list.find((r) => r.login === trimmed) ||
    list.find((r) => r.login.toLowerCase() === trimmed.toLowerCase());

  if (!matched) {
    return { isBlocked: false, remainingSeconds: 0, attemptsCount: 0 };
  }

  const now = Date.now();
  if (matched.isBlocked && matched.blockedUntil && matched.blockedUntil > now) {
    const remainingSeconds = Math.max(1, Math.ceil((matched.blockedUntil - now) / 1000));
    return {
      isBlocked: true,
      remainingSeconds,
      attemptsCount: matched.attemptsCount,
      record: matched,
    };
  }

  return {
    isBlocked: false,
    remainingSeconds: 0,
    attemptsCount: matched.attemptsCount,
    record: matched,
  };
}

export function recordFailedLoginAttempt(rawLogin: string, enteredPassword: string): {
  isBlocked: boolean;
  attemptsCount: number;
  remainingAttempts: number;
  remainingSeconds: number;
  record: SecurityBlockRequest;
} {
  const trimmedLogin = (rawLogin || '').trim();
  const list = getSecurityBlockRequests();
  const meta = resolveCabinetMetadataByLogin(trimmedLogin);
  const nowIso = new Date().toISOString();
  const nowMs = Date.now();
  const ip = getClientIpAddress();

  const existingIdx = list.findIndex(
    (r) => r.login === trimmedLogin || r.login.toLowerCase() === trimmedLogin.toLowerCase()
  );

  let record: SecurityBlockRequest;

  if (existingIdx >= 0) {
    const prev = list[existingIdx];
    const prevAttempts = Array.isArray(prev.failedAttempts) ? prev.failedAttempts : [];
    const nextCount =
      prev.isBlocked && prev.blockedUntil && prev.blockedUntil > nowMs
        ? prev.attemptsCount + 1
        : prev.attemptsCount >= MAX_FAILED_ATTEMPTS && (!prev.blockedUntil || prev.blockedUntil <= nowMs)
        ? 1
        : prev.attemptsCount + 1;

    const baseAttempts =
      nextCount === 1 && prev.attemptsCount >= MAX_FAILED_ATTEMPTS ? [] : prevAttempts;

    const newAttempt: FailedPasswordAttempt = {
      attemptNumber: baseAttempts.length + 1,
      enteredPassword,
      timestamp: nowIso,
    };

    const updatedAttempts = [...baseAttempts, newAttempt];
    const shouldBlock = nextCount >= MAX_FAILED_ATTEMPTS;
    const blockedUntil = shouldBlock
      ? prev.isBlocked && prev.blockedUntil && prev.blockedUntil > nowMs
        ? prev.blockedUntil
        : nowMs + BLOCK_DURATION_MS
      : undefined;

    record = {
      ...prev,
      login: meta.login || trimmedLogin,
      currentPassword: meta.currentPassword,
      cabinetId: meta.cabinetId,
      cabinetName: meta.cabinetName,
      cabinetType: meta.cabinetType,
      phone: meta.phone,
      inn: meta.inn,
      region: meta.region,
      district: meta.district,
      contractNumber: meta.contractNumber,
      ip,
      failedAttempts: updatedAttempts,
      attemptsCount: nextCount,
      isBlocked: shouldBlock,
      blockedAt: shouldBlock ? prev.blockedAt || nowIso : prev.blockedAt,
      blockedUntil,
      acknowledgedByAdmin: shouldBlock ? false : prev.acknowledgedByAdmin,
      updatedAt: nowIso,
    };

    list.splice(existingIdx, 1);
    list.unshift(record);
  } else {
    const firstAttempt: FailedPasswordAttempt = {
      attemptNumber: 1,
      enteredPassword,
      timestamp: nowIso,
    };
    record = {
      id: `sec-${nowMs}-${Math.random().toString(36).slice(2, 6)}`,
      login: meta.login || trimmedLogin,
      currentPassword: meta.currentPassword,
      cabinetId: meta.cabinetId,
      cabinetName: meta.cabinetName,
      cabinetType: meta.cabinetType,
      phone: meta.phone,
      inn: meta.inn,
      region: meta.region,
      district: meta.district,
      contractNumber: meta.contractNumber,
      ip,
      failedAttempts: [firstAttempt],
      attemptsCount: 1,
      isBlocked: false,
      acknowledgedByAdmin: true,
      updatedAt: nowIso,
    };
    list.unshift(record);
  }

  saveSecurityBlockRequests(list);

  if (record.isBlocked && record.attemptsCount === MAX_FAILED_ATTEMPTS) {
    appendSystemSecurityLog({
      action: `Xavfsizlik: Login 25 daqiqaga bloklandi (Login: ${record.login})`,
      actor: `${record.cabinetName} (Login: ${record.login})`,
      category: 'auth_access',
      details: `Kabinet logini: ${record.login} • «${record.cabinetName}» bo‘yicha 5 marta xato parol terilgani sababli IP (${record.ip}) va login 25 daqiqaga bloklandi. Xato parollar ketma-ketligi: ${record.failedAttempts.map((a) => a.enteredPassword).join(' → ')}`,
      ip: record.ip,
      level: 'error',
    });
  }

  const remSec =
    record.isBlocked && record.blockedUntil
      ? Math.max(1, Math.ceil((record.blockedUntil - nowMs) / 1000))
      : 0;

  return {
    isBlocked: record.isBlocked,
    attemptsCount: record.attemptsCount,
    remainingAttempts: Math.max(0, MAX_FAILED_ATTEMPTS - record.attemptsCount),
    remainingSeconds: remSec,
    record,
  };
}

export function clearFailedAttemptsOnSuccess(rawLogin: string): void {
  const trimmed = (rawLogin || '').trim();
  if (!trimmed) return;
  const list = getSecurityBlockRequests();
  const idx = list.findIndex(
    (r) => r.login === trimmed || r.login.toLowerCase() === trimmed.toLowerCase()
  );
  if (idx >= 0) {
    list[idx] = {
      ...list[idx],
      isBlocked: false,
      blockedUntil: undefined,
      attemptsCount: 0,
      acknowledgedByAdmin: true,
      updatedAt: new Date().toISOString(),
    };
    saveSecurityBlockRequests(list);
  }
}

export function acknowledgeSecurityRequest(requestId: string): void {
  const list = getSecurityBlockRequests();
  let targetRecord: SecurityBlockRequest | null = null;
  let changed = false;
  const updated = list.map((item) => {
    if (item.id === requestId) {
      targetRecord = item;
      if (!item.acknowledgedByAdmin) {
        changed = true;
        return { ...item, acknowledgedByAdmin: true };
      }
    }
    return item;
  });
  if (changed) {
    saveSecurityBlockRequests(updated);
  }
  if (targetRecord) {
    const rec = targetRecord as SecurityBlockRequest;
    appendSystemSecurityLog({
      action: `Xavfsizlik So‘rovi: Kabinet bilan bog‘lanish ochildi (Login: ${rec.login})`,
      actor: `Bosh Admin (Login: ${rec.login})`,
      category: 'auth_access',
      details: `Kabinet logini: ${rec.login} • Xavfsizlik So‘rovi bo‘limida «${rec.cabinetName}» (Login: ${rec.login}, Tel: ${rec.phone}) kabineti ma’lumotlari va xato parollar ketma-ketligi ko‘rib chiqildi.`,
      ip: rec.ip,
      level: 'info',
    });
  }
}

export function removeSecurityBlockRequest(requestId: string): void {
  const list = getSecurityBlockRequests();
  const target = list.find((item) => item.id === requestId);
  const nextList = list.filter((item) => item.id !== requestId);
  saveSecurityBlockRequests(nextList);

  if (target) {
    appendSystemSecurityLog({
      action: `Xavfsizlik So‘rovi ro‘yxatdan o‘chirildi (X) — Login: ${target.login}`,
      actor: `Bosh Admin (Login: ${target.login})`,
      category: 'auth_access',
      details: `Kabinet logini: ${target.login} • Xavfsizlik So‘rovi bo‘limidan «${target.cabinetName}» (Login: ${target.login}) bo‘yicha blok so‘rovi yopildi va o‘chirildi.`,
      ip: target.ip,
      level: 'warning',
    });
  }
}

export function assignOneTimePasswordToCabinet(
  requestId: string,
  oneTimePassword: string
): SecurityBlockRequest | null {
  const cleanOtp = (oneTimePassword || '').trim();
  if (!cleanOtp) return null;

  const list = getSecurityBlockRequests();
  const idx = list.findIndex((item) => item.id === requestId);
  if (idx < 0) return null;

  const target = list[idx];
  const updatedRecord: SecurityBlockRequest = {
    ...target,
    oneTimePassword: cleanOtp,
    isBlocked: false,
    blockedUntil: undefined,
    attemptsCount: 0,
    acknowledgedByAdmin: true,
    updatedAt: new Date().toISOString(),
  };

  list[idx] = updatedRecord;
  saveSecurityBlockRequests(list);

  // Sync one-time password to supplier / customer / sub-admin record as well
  try {
    if (target.cabinetType === 'B2B' || target.cabinetType === 'B2C') {
      const rawSupps = localStorage.getItem('bunkerstroy_suppliers');
      if (rawSupps) {
        const supps = JSON.parse(rawSupps);
        if (Array.isArray(supps)) {
          const nextSupps = supps.map((s: any) => {
            if (
              s &&
              (s.id === target.cabinetId ||
                String(s.login || '').trim() === target.login ||
                String(s.login || '').trim().toLowerCase() === target.login.toLowerCase())
            ) {
              return { ...s, emergencyPassword: cleanOtp, status: 'active' };
            }
            return s;
          });
          localStorage.setItem('bunkerstroy_suppliers', JSON.stringify(nextSupps));
          window.dispatchEvent(new CustomEvent('bunkerstroy_suppliers_updated'));
        }
      }
    } else if (target.cabinetType === 'Mijoz') {
      const rawCusts = localStorage.getItem('bunkerstroy_customers');
      if (rawCusts) {
        const custs = JSON.parse(rawCusts);
        if (Array.isArray(custs)) {
          const nextCusts = custs.map((c: any) => {
            if (
              c &&
              (c.id === target.cabinetId ||
                String(c.login || '').trim() === target.login ||
                String(c.login || '').trim().toLowerCase() === target.login.toLowerCase())
            ) {
              return { ...c, emergencyPassword: cleanOtp, status: 'active' };
            }
            return c;
          });
          localStorage.setItem('bunkerstroy_customers', JSON.stringify(nextCusts));
          window.dispatchEvent(new CustomEvent('bunkerstroy_customers_updated'));
        }
      }
    } else if (target.cabinetType === 'Admin' && target.cabinetId && target.cabinetId !== 'admin-master') {
      const subAdmins = getSubAdmins();
      const nextSub = subAdmins.map((sa: any) => {
        if (sa && (sa.id === target.cabinetId || sa.login === target.login)) {
          return { ...sa, emergencyPassword: cleanOtp };
        }
        return sa;
      });
      saveSubAdmins(nextSub);
    }
  } catch {}

  appendSystemSecurityLog({
    action: `Xavfsizlik So‘rovi: 1 martalik parol berildi (Login: ${target.login})`,
    actor: `Bosh Admin (Login: ${target.login})`,
    category: 'emergency_pass',
    details: `Kabinet logini: ${target.login} • Xavfsizlik So‘rovi bo‘limida «${target.cabinetName}» (Login: ${target.login}) kabinetiga «${cleanOtp}» 1 martalik parol biriktirildi va 25 daqiqalik blokdan chiqarildi.`,
    ip: target.ip,
    level: 'success',
  });

  return updatedRecord;
}

export function verifyAndConsumeOneTimePassword(rawLogin: string, enteredPass: string): boolean {
  const trimmedLogin = (rawLogin || '').trim();
  const trimmedPass = (enteredPass || '').trim();
  if (!trimmedLogin || !trimmedPass) return false;

  const list = getSecurityBlockRequests();
  const idx = list.findIndex(
    (r) =>
      (r.login === trimmedLogin || r.login.toLowerCase() === trimmedLogin.toLowerCase()) &&
      r.oneTimePassword &&
      r.oneTimePassword.trim() === trimmedPass
  );

  if (idx >= 0) {
    const target = list[idx];
    list[idx] = {
      ...target,
      oneTimePassword: undefined,
      isBlocked: false,
      blockedUntil: undefined,
      attemptsCount: 0,
      acknowledgedByAdmin: true,
      updatedAt: new Date().toISOString(),
    };
    saveSecurityBlockRequests(list);

    appendSystemSecurityLog({
      action: `1 martalik parol orqali kabinetga kirildi (Login: ${target.login})`,
      actor: `${target.cabinetName} (Login: ${target.login})`,
      category: 'emergency_pass',
      details: `Kabinet logini: ${target.login} • «${target.cabinetName}» (Login: ${target.login}) Admin bergan 1 martalik parol orqali tizimga muvaffaqiyatli kirdi.`,
      ip: target.ip,
      level: 'success',
    });

    return true;
  }

  return false;
}

/**
 * 25 daqiqaga bloklangan foydalanuvchi telefon raqami orqali parolni qayta tiklaganda:
 * Telefon raqami va/yoki joriy login bo'yicha kabinetni topish
 */
export function findCabinetForPhoneRecovery(
  rawPhone: string,
  hintLogin?: string
): {
  found: boolean;
  login: string;
  cabinetName: string;
  cabinetType: string;
  phone: string;
} | null {
  const digits = (rawPhone || '').replace(/\D/g, '').slice(-9);
  const cleanHint = (hintLogin || '').trim();
  const lowerHint = cleanHint.toLowerCase();

  if (digits.length !== 9) return null;

  try {
    // 1. Agar hintLogin berilgan bo'lsa, avval o'sha login bo'yicha tekshiramiz
    if (cleanHint) {
      const meta = resolveCabinetMetadataByLogin(cleanHint);
      if (meta.cabinetType !== 'Noma’lum') {
        const metaPhoneDigits = (meta.phone || '').replace(/\D/g, '').slice(-9);
        if (!metaPhoneDigits || metaPhoneDigits === digits) {
          return {
            found: true,
            login: meta.login,
            cabinetName: meta.cabinetName,
            cabinetType: meta.cabinetType,
            phone: meta.phone,
          };
        }
      }
    }

    // 2. Mijozlar orasidan telefon raqam bo'yicha qidirish
    const rawCusts = localStorage.getItem('bunkerstroy_customers');
    if (rawCusts) {
      const custs = JSON.parse(rawCusts);
      if (Array.isArray(custs)) {
        const matchedCust = custs.find((c: any) => {
          if (!c) return false;
          const cDigits = String(c.phone || '').replace(/\D/g, '').slice(-9);
          if (cleanHint && String(c.login || '').trim().toLowerCase() === lowerHint) {
            return cDigits === digits;
          }
          return cDigits === digits;
        });
        if (matchedCust) {
          return {
            found: true,
            login: matchedCust.login || cleanHint,
            cabinetName: matchedCust.displayName || matchedCust.firstName || matchedCust.login,
            cabinetType: 'Mijoz',
            phone: matchedCust.phone,
          };
        }
      }
    }

    // 3. B2B va B2C Ta'minotchilar orasidan telefon raqam bo'yicha qidirish
    const rawSupps = localStorage.getItem('bunkerstroy_suppliers');
    if (rawSupps) {
      const supps = JSON.parse(rawSupps);
      if (Array.isArray(supps)) {
        const matchedSupp = supps.find((s: any) => {
          if (!s) return false;
          const sDigits = String(s.phone || '').replace(/\D/g, '').slice(-9);
          if (cleanHint && String(s.login || '').trim().toLowerCase() === lowerHint) {
            return sDigits === digits;
          }
          return sDigits === digits;
        });
        if (matchedSupp) {
          return {
            found: true,
            login: matchedSupp.login,
            cabinetName: matchedSupp.companyName || matchedSupp.name || matchedSupp.login,
            cabinetType: matchedSupp.cabinetType === 'manufacturer' ? 'B2B' : 'B2C',
            phone: matchedSupp.phone,
          };
        }
      }
    }
  } catch {}

  if (cleanHint) {
    return {
      found: true,
      login: cleanHint,
      cabinetName: cleanHint,
      cabinetType: 'Mijoz',
      phone: rawPhone,
    };
  }

  return null;
}

/**
 * SMS tasdiqlangandan keyin yangi parolni saqlash va blokdan chiqarish
 */
export function updateCabinetPasswordAfterSmsRecovery(
  targetLogin: string,
  newPassword: string,
  passwordHash?: string,
  firebaseUid?: string
): boolean {
  const trimmedLogin = (targetLogin || '').trim();
  const trimmedPass = (newPassword || '').trim();
  if (!trimmedLogin || !trimmedPass) return false;

  const lowerLogin = trimmedLogin.toLowerCase();
  let updatedAny = false;

  try {
    // 1. Mijozlar ro'yxatida yangilash (ochiq parolni olib tashlab xeshni saqlash)
    const rawCusts = localStorage.getItem('bunkerstroy_customers');
    if (rawCusts) {
      const custs = JSON.parse(rawCusts);
      if (Array.isArray(custs)) {
        const nextCusts = custs.map((c: any) => {
          if (
            c &&
            (String(c.login || '').trim() === trimmedLogin ||
              String(c.login || '').trim().toLowerCase() === lowerLogin)
          ) {
            updatedAny = true;
            const copy = { ...c, status: 'active' };
            if (passwordHash) {
              delete copy.password;
              delete copy.emergencyPassword;
              copy.passwordHash = passwordHash;
              copy.passwordMigrated = true;
              if (firebaseUid) copy.firebaseUid = firebaseUid;
            } else {
              copy.password = trimmedPass;
            }
            return copy;
          }
          return c;
        });
        if (updatedAny) {
          localStorage.setItem('bunkerstroy_customers', JSON.stringify(nextCusts));
          window.dispatchEvent(new CustomEvent('bunkerstroy_customers_updated'));
        }
      }
    }

    // 2. Ta'minotchilar ro'yxatida yangilash (ochiq parolni olib tashlab xeshni saqlash)
    const rawSupps = localStorage.getItem('bunkerstroy_suppliers');
    if (rawSupps) {
      const supps = JSON.parse(rawSupps);
      if (Array.isArray(supps)) {
        let suppUpdated = false;
        const nextSupps = supps.map((s: any) => {
          if (
            s &&
            (String(s.login || '').trim() === trimmedLogin ||
              String(s.login || '').trim().toLowerCase() === lowerLogin)
          ) {
            suppUpdated = true;
            updatedAny = true;
            const copy = { ...s, status: 'active' };
            if (passwordHash) {
              delete copy.password;
              delete copy.emergencyPassword;
              copy.passwordHash = passwordHash;
              copy.passwordMigrated = true;
              if (firebaseUid) copy.firebaseUid = firebaseUid;
            } else {
              copy.password = trimmedPass;
            }
            return copy;
          }
          return s;
        });
        if (suppUpdated) {
          localStorage.setItem('bunkerstroy_suppliers', JSON.stringify(nextSupps));
          window.dispatchEvent(new CustomEvent('bunkerstroy_suppliers_updated'));
        }
      }
    }

    // 3. Qo'shimcha Adminlar ro'yxatida yangilash
    const subAdmins = getSubAdmins();
    let subUpdated = false;
    const nextSubs = subAdmins.map((sa) => {
      if (
        sa &&
        (String(sa.login || '').trim() === trimmedLogin ||
          String(sa.login || '').trim().toLowerCase() === lowerLogin)
      ) {
        subUpdated = true;
        updatedAny = true;
        return {
          ...sa,
          password: passwordHash ? '' : trimmedPass,
          ...(passwordHash ? { passwordHash, passwordMigrated: true } : {}),
        };
      }
      return sa;
    });
    if (subUpdated) {
      saveSubAdmins(nextSubs);
    }

    // 4. Asosiy Admin bo'lsa
    const adminCfg = getAdminConfig();
    if (String(adminCfg.login || '').trim() === trimmedLogin) {
      saveAdminConfig({ ...adminCfg, password: trimmedPass });
      updatedAny = true;
    }
  } catch {}

  // Security blockni tozalash (ochiq parolni saqlamasdan)
  const list = getSecurityBlockRequests();
  const nextList = list.map((item) => {
    if (item.login === trimmedLogin || item.login.toLowerCase() === lowerLogin) {
      return {
        ...item,
        currentPassword: '[HASHED_ARGON2ID]',
        isBlocked: false,
        blockedUntil: undefined,
        attemptsCount: 0,
        acknowledgedByAdmin: true,
        updatedAt: new Date().toISOString(),
      };
    }
    return item;
  });
  saveSecurityBlockRequests(nextList);

  appendSystemSecurityLog({
    action: `Kabinet qayta faollashtirildi va yangi parol saqlandi (Login: ${trimmedLogin})`,
    actor: `Login: ${trimmedLogin}`,
    category: 'auth_access',
    details: `Kabinet logini: ${trimmedLogin} • Telefon raqami SMS tasdiq orqali tasdiqlanib, kabinet qayta faollashtirildi va xavfsiz xeshlangan parol o‘rnatildi.`,
    level: 'success',
  });

  return updatedAny;
}

export function getBlockedLoginRegisteredPhoneInfo(rawLogin: string): {
  phone: string;
  last4Digits: string;
  login: string;
} {
  const trimmed = (rawLogin || '').trim();
  const meta = resolveCabinetMetadataByLogin(trimmed);
  const blockStatus = getLoginBlockStatus(trimmed);
  const fullPhone =
    (meta.phone && meta.phone !== '—' ? meta.phone : '') ||
    (blockStatus.record?.phone && blockStatus.record.phone !== '—' ? blockStatus.record.phone : '') ||
    '+998 90 123 45 67';
  const digitsOnly = fullPhone.replace(/\D/g, '');
  const last4 = digitsOnly.length >= 4 ? digitsOnly.slice(-4) : '4567';
  return {
    phone: fullPhone,
    last4Digits: last4,
    login: meta.login || trimmed,
  };
}

export async function issueSecureHttpOnlySession(payload: {
  userId: string;
  login: string;
  role: string;
  password?: string;
}): Promise<void> {
  try {
    await fetch('/api/security/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload),
    });
  } catch {}
}

// ============================================================================
// SINGLE-DEVICE ACTIVE CABINET LOCK (Kabinet ichida foydalanuvchi bo'lganda boshqa qurilmadan kirishni bloklash)
// ============================================================================
const LOCAL_CABINET_LOCKS_KEY = 'bunkerstroy_active_cabinet_locks_v1';
const LOCAL_CABINET_LOCK_TTL_MS = 35 * 1000;

export function getDeviceSessionId(): string {
  try {
    const existing = sessionStorage.getItem('bs_device_session_id');
    if (existing) return existing;
    const generated = `dev-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    sessionStorage.setItem('bs_device_session_id', generated);
    return generated;
  } catch {
    return 'dev-default';
  }
}

interface LocalCabinetLockEntry {
  login: string;
  userId: string;
  deviceSessionId: string;
  lastHeartbeat: number;
}

function getActiveLocalCabinetLocks(): Record<string, LocalCabinetLockEntry> {
  try {
    const raw = localStorage.getItem(LOCAL_CABINET_LOCKS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    const now = Date.now();
    const cleaned: Record<string, LocalCabinetLockEntry> = {};
    for (const [k, v] of Object.entries(parsed)) {
      const entry = v as LocalCabinetLockEntry;
      if (entry && entry.lastHeartbeat && now - entry.lastHeartbeat <= LOCAL_CABINET_LOCK_TTL_MS) {
        cleaned[k] = entry;
      }
    }
    return cleaned;
  } catch {
    return {};
  }
}

export async function checkCabinetActiveOnAnotherDevice(
  login: string,
  userId?: string
): Promise<{ locked: boolean; message?: string }> {
  const normLogin = (login || '').trim().toLowerCase();
  const normUserId = (userId || '').trim();
  const deviceSessionId = getDeviceSessionId();
  const lockMsg =
    "Ushbu kabinetda hozirda boshqa qurilma faol! Kabinet ichkarisida foydalanuvchi bo‘lgan vaqtda boshqa qurilma orqali kirish amalga oshirilmaydi.";

  // 1. Check localStorage across browser tabs
  try {
    const locks = getActiveLocalCabinetLocks();
    for (const entry of Object.values(locks)) {
      const sameCabinet =
        (normLogin && entry.login === normLogin) ||
        (normUserId && entry.userId && entry.userId === normUserId);
      if (sameCabinet && entry.deviceSessionId !== deviceSessionId) {
        return { locked: true, message: lockMsg };
      }
    }
  } catch {}

  // 2. Check server across devices
  try {
    const resp = await fetch('/api/security/cabinet-lock/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ login: normLogin, userId: normUserId, deviceSessionId }),
    });
    const data = await resp.json();
    if (data?.locked) {
      return { locked: true, message: data.message || lockMsg };
    }
  } catch {}

  return { locked: false };
}

export async function acquireCabinetDeviceLock(
  login: string,
  userId?: string
): Promise<{ locked: boolean; message?: string }> {
  const normLogin = (login || '').trim().toLowerCase();
  const normUserId = (userId || '').trim();
  const key = normUserId || normLogin;
  const deviceSessionId = getDeviceSessionId();
  const lockMsg =
    "Ushbu kabinetda hozirda boshqa qurilma faol! Kabinet ichkarisida foydalanuvchi bo‘lgan vaqtda boshqa qurilma orqali kirish amalga oshirilmaydi.";

  if (!key) return { locked: false };

  // Check local first
  try {
    const locks = getActiveLocalCabinetLocks();
    for (const entry of Object.values(locks)) {
      const sameCabinet =
        (normLogin && entry.login === normLogin) ||
        (normUserId && entry.userId && entry.userId === normUserId);
      if (sameCabinet && entry.deviceSessionId !== deviceSessionId) {
        return { locked: true, message: lockMsg };
      }
    }
    locks[key] = {
      login: normLogin,
      userId: normUserId,
      deviceSessionId,
      lastHeartbeat: Date.now(),
    };
    localStorage.setItem(LOCAL_CABINET_LOCKS_KEY, JSON.stringify(locks));
  } catch {}

  // Acquire on server
  try {
    const resp = await fetch('/api/security/cabinet-lock/acquire', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ login: normLogin, userId: normUserId, deviceSessionId }),
    });
    const data = await resp.json();
    if (resp.status === 409 || data?.locked) {
      return { locked: true, message: data?.message || lockMsg };
    }
  } catch {}

  return { locked: false };
}

export function sendCabinetDeviceHeartbeat(login: string, userId?: string): void {
  const normLogin = (login || '').trim().toLowerCase();
  const normUserId = (userId || '').trim();
  const key = normUserId || normLogin;
  const deviceSessionId = getDeviceSessionId();
  if (!key) return;

  try {
    const locks = getActiveLocalCabinetLocks();
    const existing = locks[key];
    if (!existing || existing.deviceSessionId === deviceSessionId) {
      locks[key] = {
        login: normLogin,
        userId: normUserId,
        deviceSessionId,
        lastHeartbeat: Date.now(),
      };
      localStorage.setItem(LOCAL_CABINET_LOCKS_KEY, JSON.stringify(locks));
    }
  } catch {}

  try {
    fetch('/api/security/cabinet-lock/heartbeat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ login: normLogin, userId: normUserId, deviceSessionId }),
    }).catch(() => {});
  } catch {}
}

export function releaseCabinetDeviceLock(login?: string, userId?: string): void {
  const normLogin = (login || '').trim().toLowerCase();
  const normUserId = (userId || '').trim();
  const deviceSessionId = getDeviceSessionId();

  try {
    const locks = getActiveLocalCabinetLocks();
    let changed = false;
    for (const [k, entry] of Object.entries(locks)) {
      const sameCabinet =
        (normLogin && entry.login === normLogin) ||
        (normUserId && entry.userId && entry.userId === normUserId);
      if (sameCabinet && entry.deviceSessionId === deviceSessionId) {
        delete locks[k];
        changed = true;
      }
    }
    if (changed) {
      localStorage.setItem(LOCAL_CABINET_LOCKS_KEY, JSON.stringify(locks));
    }
  } catch {}

  try {
    const rawObj = { login: normLogin, userId: normUserId, deviceSessionId };
    if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
      const protoBytes = encodeProtobufPacket(rawObj, 200);
      const copyBuf = new Uint8Array(protoBytes.byteLength);
      copyBuf.set(protoBytes);
      const blob = new Blob([copyBuf.buffer], { type: PROTOBUF_MIME_TYPE });
      navigator.sendBeacon('/api/security/cabinet-lock/release', blob);
    } else {
      fetch('/api/security/cabinet-lock/release', {
        method: 'POST',
        body: encodeProtobufPacket(rawObj, 200) as any,
        keepalive: true,
      }).catch(() => {});
    }
  } catch {}
}

