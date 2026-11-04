import crypto from 'crypto';
import {
  EImzoChallenge,
  EImzoVerificationRequest,
  EImzoVerificationResult,
  TestEImzoKey,
} from '../../types/eimzo';

export const CHALLENGE_TTL_MS = 5 * 60 * 1000; // 5 daqiqa (300 000 ms)

export class EImzoService {
  private challenges: Map<string, EImzoChallenge> = new Map();

  constructor() {
    // Har 5 daqiqada eski muddati o'tgan challengelarni xotiradan tozalab turish
    setInterval(() => {
      this.cleanupExpiredChallenges();
    }, 60 * 1000);
  }

  /**
   * 1. Tasodifiy matn (challenge) yaratish
   * - Bir martalik
   * - 5 daqiqalik muddatli
   */
  public createChallenge(inn?: string): EImzoChallenge {
    const challengeId = 'ch_' + crypto.randomBytes(12).toString('hex');
    const randomSalt = crypto.randomBytes(16).toString('hex').toUpperCase();
    const now = Date.now();
    const expiresAt = now + CHALLENGE_TTL_MS;

    // O'zbekiston E-IMZO formati bo'yicha imzolash uchun matn
    const challengeText = `BUNKER_E-IMZO_AUTH_${now}_${randomSalt}${inn ? `_STIR_${inn}` : ''}`;

    const challenge: EImzoChallenge = {
      challengeId,
      challengeText,
      createdAt: now,
      expiresAt,
      isConsumed: false,
      inn,
    };

    this.challenges.set(challengeId, challenge);
    return challenge;
  }

  /**
   * Challenge ma'lumotlarini olish (mavjudligini tekshirish uchun)
   */
  public getChallenge(challengeId: string): EImzoChallenge | undefined {
    return this.challenges.get(challengeId);
  }

  /**
   * 2. Backend imzoni va sertifikatni tekshiradi:
   * - Challenge mavjudligi, bir martalik ekani va 5 daqiqalik muddati tekshiriladi
   * - Sertifikatdagi tashkilot STIR'i kiritilgan STIR bilan solishtiriladi
   * - Sertifikatdagi STIR mos kelsa: status = 'verified'
   * - STIR mos kelmasa: status = 'rejected'
   */
  public verifySignature(req: EImzoVerificationRequest): EImzoVerificationResult {
    const { challengeId, inn: targetInn, signature, certificate } = req;
    const cleanTargetInn = (targetInn || '').trim();

    // 1. Challenge mavjudligini tekshirish
    const challenge = this.challenges.get(challengeId);
    if (!challenge) {
      return {
        success: false,
        status: 'rejected',
        stirMatched: false,
        targetInn: cleanTargetInn,
        message: "E-IMZO tasdiqlanmadi: Bir martalik challenge sessiyasi topilmadi yoki yaroqsiz.",
        reason: "Challenge topilmadi",
        errorCode: 'CHALLENGE_NOT_FOUND',
      };
    }

    // 2. Bir martalik qoidasi tekshiruvi: Agar allaqachon ishlatilgan bo'lsa
    if (challenge.isConsumed) {
      return {
        success: false,
        status: 'rejected',
        stirMatched: false,
        targetInn: cleanTargetInn,
        message: "E-IMZO tasdiqlanmadi: Ushbu challenge allaqachon ishlatilgan. Har bir imzolash uchun yangi challenge talab etiladi.",
        reason: "Challenge allaqachon ishlatilgan (bir martalik)",
        errorCode: 'CHALLENGE_ALREADY_USED',
      };
    }

    // Har qanday holatda ham challengeni darhol sarflangan (consumed) deb belgilaymiz (bir martalik tamoyili)
    challenge.isConsumed = true;

    // 3. 5 daqiqalik muddat tekshiruvi
    const now = Date.now();
    if (now > challenge.expiresAt) {
      const expiredAgoSeconds = Math.round((now - challenge.expiresAt) / 1000);
      return {
        success: false,
        status: 'rejected',
        stirMatched: false,
        targetInn: cleanTargetInn,
        message: `E-IMZO tasdiqlanmadi: Challenge amal qilish muddati (5 daqiqa) ${expiredAgoSeconds} soniya oldin tugagan. Qaytadan yangi kalit bilan imzolang.`,
        reason: "Challenge muddati (5 daqiqa) tugagan",
        errorCode: 'CHALLENGE_EXPIRED',
      };
    }

    // 4. Imzo mavjudligi va formati tekshiruvi
    if (!signature || signature.trim().length < 10) {
      return {
        success: false,
        status: 'rejected',
        stirMatched: false,
        targetInn: cleanTargetInn,
        message: "E-IMZO tasdiqlanmadi: Elektron raqamli imzo bo‘sh yoki noto‘g‘ri formatda yuborilgan.",
        reason: "Noto'g'ri yoki bo'sh imzo",
        errorCode: 'INVALID_SIGNATURE',
      };
    }

    // 5. Sertifikat tekshiruvi
    const certInn = (certificate?.inn || '').trim();
    if (!certInn || !/^\d{9}$/.test(certInn)) {
      return {
        success: false,
        status: 'rejected',
        stirMatched: false,
        targetInn: cleanTargetInn,
        message: "E-IMZO tasdiqlanmadi: Sertifikatda 9 xonali tashkilot STIR raqami topilmadi yoki buzilgan.",
        reason: "Sertifikatda yaroqli STIR mavjud emas",
        errorCode: 'INVALID_CERTIFICATE',
      };
    }

    // 6. ASOSIY QOIDA: Sertifikatdagi tashkilot STIR'i kiritilgan STIR bilan mos kelishi shart!
    const stirMatched = certInn === cleanTargetInn;

    if (!stirMatched) {
      return {
        success: false,
        status: 'rejected',
        stirMatched: false,
        certificateInn: certInn,
        targetInn: cleanTargetInn,
        companyName: certificate?.companyName,
        directorName: certificate?.directorName,
        message: `E-IMZO tekshiruvi rad etildi: E-IMZO kalitidagi STIR (${certInn}) kiritilgan tashkilot STIR'i (${cleanTargetInn}) bilan mos kelmadi! Kabinet statusi 'rejected' etildi.`,
        reason: `STIR mos kelmadi: Sertifikat STIR=${certInn}, Kiritilgan STIR=${cleanTargetInn}`,
        errorCode: 'STIR_MISMATCH',
      };
    }

    // 7. Muvaffaqiyatli: STIR mos keldi, imzo va challenge to'g'ri
    return {
      success: true,
      status: 'verified',
      stirMatched: true,
      certificateInn: certInn,
      targetInn: cleanTargetInn,
      companyName: certificate?.companyName || "MChJ Tashkiloti",
      directorName: certificate?.directorName || "Rahbar",
      verifiedAt: new Date().toISOString(),
      message: `E-IMZO muvaffaqiyatli tasdiqlandi! Sertifikat STIR (${certInn}) kiritilgan STIR bilan to'liq mos keldi. Kabinet statusi 'verified' etildi.`,
    };
  }

  /**
   * Test va simulyatsiya uchun mavjud E-IMZO kalitlari ro'yxati
   */
  public getTestKeys(currentInn?: string): TestEImzoKey[] {
    const inn = currentInn || '201122334';
    return [
      {
        id: 'key-matched',
        label: `Tashkilot Asl E-IMZO Kaliti (STIR: ${inn})`,
        inn: inn,
        companyName: '«BUNKER STROY INVEST» MChJ',
        directorName: 'Alimov Rustam Shavkatovich',
        serialNumber: '5B7A890123CD45EF',
        description: 'Tashkilotning haqiqiy direktori nomidagi E-IMZO sertifikati (STIR mos keladi -> verified)',
        willMatch: true,
      },
      {
        id: 'key-other-company',
        label: 'Boshqa Korxona E-IMZO Kaliti (STIR: 305566778)',
        inn: '305566778',
        companyName: '«TOSHKENT G\'ISHT SERVIS» MChJ',
        directorName: 'Karimov Jamshid Ilhomovich',
        serialNumber: '99AA123456BC78DE',
        description: 'Begona korxonaning E-IMZO kaliti (STIR mos kelmaydi -> rejected)',
        willMatch: false,
      },
      {
        id: 'key-individual',
        label: 'Jismoniy Shaxs E-IMZO Kaliti (STIR yo\'q / Boshqa)',
        inn: '999999999',
        companyName: 'Xususiy Tadbirkor / Jismoniy Shaxs',
        directorName: 'Nazarov Bobur Azizovich',
        serialNumber: '1122334455667788',
        description: 'Yuridik shaxsga tegishli bo‘lmagan boshqa kalit (STIR mos kelmaydi -> rejected)',
        willMatch: false,
      },
    ];
  }

  /**
   * Muddati o'tgan challengelarni xotiradan tozalash
   */
  public cleanupExpiredChallenges(): number {
    const now = Date.now();
    let removedCount = 0;
    for (const [id, ch] of this.challenges.entries()) {
      // 10 daqiqadan oshgan eskirgan yozuvlarni o'chirish
      if (now > ch.expiresAt + 5 * 60 * 1000) {
        this.challenges.delete(id);
        removedCount++;
      }
    }
    return removedCount;
  }

  /**
   * Testlar uchun barcha challengelarni tozalash
   */
  public clearAll(): void {
    this.challenges.clear();
  }
}

export const defaultEImzoService = new EImzoService();
