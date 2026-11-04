import { Router, Request, Response } from 'express';
import { defaultEImzoService } from '../services/eimzo/EImzoService';
import { EImzoVerificationRequest } from '../types/eimzo';
import { stirRateLimiter } from '../middlewares/rateLimiter';

const router = Router();

/**
 * POST /api/eimzo/challenge
 * Foydalanuvchi E-IMZO bilan imzolashi uchun tasodifiy matn (challenge) yaratadi.
 * - Bir martalik
 * - 5 daqiqalik muddatli
 */
router.post('/challenge', (req: Request, res: Response) => {
  const inn = req.body?.inn ? String(req.body.inn).trim() : undefined;
  const challenge = defaultEImzoService.createChallenge(inn);

  const expiresInSeconds = Math.max(0, Math.round((challenge.expiresAt - Date.now()) / 1000));

  res.json({
    success: true,
    challengeId: challenge.challengeId,
    challengeText: challenge.challengeText,
    createdAt: new Date(challenge.createdAt).toISOString(),
    expiresAt: new Date(challenge.expiresAt).toISOString(),
    expiresInSeconds,
    ttlMinutes: 5,
    message: "Bir martalik challenge muvaffaqiyatli yaratildi. Amal qilish muddati: 5 daqiqa.",
  });
});

/**
 * GET /api/eimzo/challenge/:id
 * Challenge holatini va qolgan vaqtini tekshirish
 */
router.get('/challenge/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const challenge = defaultEImzoService.getChallenge(id);

  if (!challenge) {
    return res.status(404).json({
      success: false,
      error: "Challenge topilmadi.",
    });
  }

  const now = Date.now();
  const isExpired = now > challenge.expiresAt;
  const remainingSeconds = isExpired ? 0 : Math.round((challenge.expiresAt - now) / 1000);

  return res.json({
    success: true,
    challengeId: challenge.challengeId,
    challengeText: challenge.challengeText,
    isConsumed: challenge.isConsumed,
    isExpired,
    remainingSeconds,
    createdAt: new Date(challenge.createdAt).toISOString(),
    expiresAt: new Date(challenge.expiresAt).toISOString(),
  });
});

/**
 * POST /api/eimzo/verify
 * Backend imzoni va sertifikatni tekshiradi.
 * - Sertifikatdagi tashkilot STIR'i kiritilgan STIR bilan mos kelsa: status = 'verified'
 * - Aks holda: status = 'rejected'
 * - Challenge bir martalik va 5 daqiqalik muddatli
 */
router.post('/verify', stirRateLimiter.getMiddleware(), (req: Request, res: Response) => {
  const body: EImzoVerificationRequest = req.body || {};
  const { challengeId, inn, signature, certificate } = body;

  if (!challengeId) {
    return res.status(400).json({
      success: false,
      status: 'rejected',
      error: "Challenge identifikatori (challengeId) yuborilmagan.",
    });
  }

  if (!inn) {
    return res.status(400).json({
      success: false,
      status: 'rejected',
      error: "Tashkilot STIR raqami (inn) yuborilmagan.",
    });
  }

  if (!signature) {
    return res.status(400).json({
      success: false,
      status: 'rejected',
      error: "Elektron raqamli imzo (signature) kiritilmagan.",
    });
  }

  const verificationResult = defaultEImzoService.verifySignature({
    challengeId,
    inn,
    signature,
    certificate,
  });

  if (!verificationResult.success) {
    // Rejected: STIR mos kelmadi, challenge eskirgan yoki imzo yaroqsiz
    const httpStatus = verificationResult.errorCode === 'STIR_MISMATCH' ? 422 : 400;
    return res.status(httpStatus).json(verificationResult);
  }

  // Verified: STIR mos keldi, imzo to'g'ri
  return res.json(verificationResult);
});

/**
 * GET /api/eimzo/test-keys
 * E-IMZO testi va sinovi uchun namunaviy sertifikat kalitlari
 */
router.get('/test-keys', (req: Request, res: Response) => {
  const inn = (req.query.inn as string) || '201122334';
  const keys = defaultEImzoService.getTestKeys(inn);
  res.json({
    success: true,
    inn,
    keys,
  });
});

export default router;
