/**
 * MChJ va Yuridik shaxslarni tekshirish uchun DTO va interfeyslar
 */

export type CompanyStatus = 'active' | 'liquidated' | 'suspended';

export interface CompanyInfo {
  inn: string; // 9 xonali STIR (TIN)
  companyName: string; // Tashkilot to'liq rasmiy nomi
  shortName?: string; // Tashkilot qisqacha nomi
  status: CompanyStatus; // 'active' (Faol) | 'liquidated' (Tugatilgan) | 'suspended' (To'xtatilgan)
  statusDescription: string; // O'zbek tilidagi tavsifi
  director?: string; // Direktor / Rahbar F.I.Sh.
  phone?: string; // Tashkilot telefon raqami
  email?: string; // Tashkilot email manzili
  address?: string; // To'liq yuridik manzil
  locality?: string; // Viloyat, tuman, shahar (masalan: Qashqadaryo viloyati, Qarshi tumani, Beshkent shahri)
  region?: string; // Viloyat / Shahar
  district?: string; // Tuman
  registrationDate?: string; // Ro'yxatdan o'tgan sana (masalan: 06.06.2026)
  registrationOrgan?: string; // Ro'yxatdan o'tkazuvchi organ
  activityType?: string; // Asosiy faoliyat turi (OKED / IFUT)
  okedCode?: string; // OKED kodi (masalan: 62010)
  thsht?: string; // Tashkiliy-huquqiy shakli (THSHT)
  dbibt?: string; // DBIBT
  charterCapital?: string; // Ustav kapitali (masalan: 1 700 000 so'm)
  foundersCount?: number; // Ta'sischilar soni
  founders?: string[]; // Ta'sischilar ro'yxati va ulushi
  updatedAt?: string; // Ma'lumot yangilangan sana (masalan: 08.10.2026)
  source?: string; // Manba: orginfo.uz / stat.uz
  summaryText?: string; // Yagona xulosa matni
  vatPayer?: boolean; // QQS to'lovchisi
}

export interface CompanyLookupResult {
  success: boolean;
  data?: CompanyInfo;
  cached?: boolean;
  cachedAt?: string;
  error?: string;
  errorCode?: 'INVALID_STIR' | 'NOT_FOUND' | 'INACTIVE_COMPANY' | 'RATE_LIMITED' | 'UPSTREAM_ERROR';
}

export type CabinetVerificationStatus = 'pending' | 'verified' | 'rejected';

export interface MchjRegistrationRequest {
  inn: string;
  phone: string;
  companyName?: string;
  directorName?: string;
  login: string;
  password?: string;
  region?: string;
  district?: string;
  mahalla?: string;
  // E-IMZO orqali tasdiqlash ma'lumotlari (ixtiyoriy yoki E-IMZO bosqichida)
  eimzo?: {
    challengeId: string;
    signature: string;
    certificate?: {
      inn?: string;
      serialNumber?: string;
      companyName?: string;
      directorName?: string;
    };
  };
}

export interface MchjRegistrationResponse {
  success: boolean;
  message: string;
  cabinetActivated: boolean;
  verificationStatus: CabinetVerificationStatus; // 'pending' | 'verified' | 'rejected'
  company?: CompanyInfo;
  user?: {
    id: string;
    inn: string;
    companyName: string;
    role: 'legal';
    phone: string;
    verificationStatus: CabinetVerificationStatus;
    eimzoVerifiedAt?: string;
  };
  error?: string;
}
