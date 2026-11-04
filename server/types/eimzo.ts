/**
 * E-IMZO (Elektron Raqamli Imzo) turlari va interfeyslari
 * O'zbekiston Respublikasi DSQ / E-IMZO standarti asosida
 */

export type CabinetVerificationStatus = 'pending' | 'verified' | 'rejected';

export interface EImzoChallenge {
  challengeId: string;
  challengeText: string;
  createdAt: number; // timestamp ms
  expiresAt: number; // timestamp ms (5 daqiqa)
  isConsumed: boolean;
  inn?: string; // Bog'langan tashkilot STIR'i
}

export interface EImzoCertificateInfo {
  serialNumber: string;
  inn: string; // Sertifikat egasi tashkilot STIR'i (9 xonali)
  pinfl?: string; // Rahbar JShShIR'i (14 xonali)
  companyName: string; // Tashkilot nomi
  directorName: string; // Rahbar F.I.Sh.
  validFrom: string;
  validTo: string;
  issuer: string; // Masalan: "O'zbekiston Respublikasi Davlat Soliq Qo'mitasi Yangi Texnologiyalar Ilmiy-Axborot Markazi"
}

export interface EImzoVerificationRequest {
  challengeId: string;
  inn: string; // Foydalanuvchi kiritgan tashkilot STIR'i (9 xonali)
  signature: string; // E-IMZO PKCS#7 / Base64 imzo
  certificate?: Partial<EImzoCertificateInfo>; // Sertifikat ma'lumotlari
}

export interface EImzoVerificationResult {
  success: boolean;
  status: CabinetVerificationStatus; // 'verified' | 'rejected' | 'pending'
  message: string;
  stirMatched: boolean;
  certificateInn?: string;
  targetInn: string;
  directorName?: string;
  companyName?: string;
  verifiedAt?: string;
  reason?: string;
  errorCode?: 'CHALLENGE_EXPIRED' | 'CHALLENGE_NOT_FOUND' | 'CHALLENGE_ALREADY_USED' | 'STIR_MISMATCH' | 'INVALID_SIGNATURE' | 'INVALID_CERTIFICATE';
}

export interface TestEImzoKey {
  id: string;
  label: string;
  inn: string;
  companyName: string;
  directorName: string;
  serialNumber: string;
  description: string;
  willMatch: boolean;
}
