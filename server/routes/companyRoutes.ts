import { Router, Request, Response } from 'express';
import { defaultCompanyLookupService, CompanyLookupService } from '../services/companyLookup/CompanyLookupService';
import { stirRateLimiter } from '../middlewares/rateLimiter';
import { validateStirMiddleware } from '../middlewares/validateStir';
import { MchjRegistrationRequest, MchjRegistrationResponse } from '../types/company';

const router = Router();

/**
 * GET /api/company/test-stirs
 * Test STIR raqamlari ro'yxati (Frontend va API sinovlari uchun)
 */
router.get('/test-stirs', (_req: Request, res: Response) => {
  res.json({
    active: [
      { inn: '201122334', name: '«BUNKER STROY INVEST» MChJ', director: 'Karimov Jasur Bahromovich', region: 'Toshkent shahri', district: 'Yunusobod tumani', status: 'Faol' },
      { inn: '305566778', name: '«TOSHKENT G\'ISHT SERVIS» MChJ', director: 'Xolmatov Dilshod Rustamovich', region: 'Toshkent viloyati', district: 'Yangiyo‘l tumani', status: 'Faol' },
      { inn: '123456789', name: '«SAMARQAND CEMENT INDUSTRY» QK MChJ', director: 'Mirzayev Ulug‘bek Shavkatovich', region: 'Samarqand viloyati', district: 'Pastdarg‘om tumani', status: 'Faol' },
      { inn: '987654321', name: '«VODIY LOGISTIKA TRANS» MChJ', director: 'Rahimov Alisher Baxtiyorovich', region: 'Farg‘ona viloyati', district: 'Qo‘qon shahri', status: 'Faol' },
      { inn: '200362124', name: '«QIZILQUMSEMENT SANOAT ZAVODI» MChJ', director: 'Nazarov Bekzod Ilhomovich', region: 'Navoiy viloyati', district: 'Navoiy shahri', status: 'Faol' },
      { inn: '200245189', name: '«OHANGARON SEMENT KOMBINATI» MChJ', director: 'Abdullayev Farrux Sobirovich', region: 'Toshkent viloyati', district: 'Ohangaron shahri', status: 'Faol' },
      { inn: '200154872', name: '«BEKOBOD METALL PROKAT ZAVODI» MChJ', director: 'Tursunov Sardor G‘ulomovich', region: 'Toshkent viloyati', district: 'Bekobod shahri', status: 'Faol' },
      { inn: '206123456', name: '«BUXORO GIPS VA QURUQ QORISHMALAR ZAVODI» XK MChJ', director: 'Jo‘rayev Anvar Mahmudovich', region: 'Buxoro viloyati', district: 'Kogon shahri', status: 'Faol' },
      { inn: '304556677', name: '«GRAND STROY SAVDO MARKAZI» MChJ', director: 'Yuldashev Sherzod Akmalovich', region: 'Toshkent shahri', district: 'Sergeli tumani', status: 'Faol' },
      { inn: '308221144', name: '«ANDIJON QURILISH SAVDO TA’MINOT» MChJ', director: 'Qodirov Azizbek O‘ktamovich', region: 'Andijon viloyati', district: 'Andijon shahri', status: 'Faol' },
    ],
    liquidated: [
      { inn: '209999999', name: '«ESKI QURILISH INVEST» MChJ', status: 'Tugatilgan (Likvidatsiya)' },
    ],
    suspended: [
      { inn: '208888888', name: '«TO‘XTATILGAN SERVIS TRANS» MChJ', status: 'Vaqtincha to‘xtatilgan' },
    ],
    apiError: [
      { inn: '200000000', name: 'Tashqi Soliq API xatosi simulyatsiyasi', status: 'Xato' },
    ],
  });
});

/**
 * GET /api/company/lookup
 * POST /api/company/lookup
 * 
 * 1. Rate-limit: IP bo'yicha daqiqasiga 5 ta
 * 2. 9 xonali STIR format validatsiyasi
 * 3. 24-soatlik kesh
 * 4. Tashkilot nomi va holati (faol/tugatilgan)
 */
const handleLookup = async (req: Request, res: Response) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  const inn: string = res.locals.cleanInn || (req.query.inn as string) || req.body?.inn;

  try {
    const result = await defaultCompanyLookupService.lookupByStir(inn);

    if (!result.success) {
      if (result.errorCode === 'INVALID_STIR') {
        return res.status(400).json(result);
      }
      if (result.errorCode === 'NOT_FOUND') {
        return res.status(404).json(result);
      }
      if (result.errorCode === 'UPSTREAM_ERROR') {
        return res.status(503).json(result);
      }
      return res.status(400).json(result);
    }

    return res.json({
      success: true,
      data: result.data,
      cached: !!result.cached,
      cachedAt: result.cachedAt,
      message: result.cached 
        ? "Ma'lumotlar 24 soatlik keshdan tezkor olindi" 
        : "Ma'lumotlar davlat reyestridan muvaffaqiyatli olindi",
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      errorCode: 'UPSTREAM_ERROR',
      error: error?.message || "Tashkilot ma'lumotlarini olishda kutilmagan server xatosi yuz berdi.",
    });
  }
};

router.get('/lookup', stirRateLimiter.getMiddleware(), validateStirMiddleware, handleLookup);
router.post('/lookup', stirRateLimiter.getMiddleware(), validateStirMiddleware, handleLookup);

/**
 * POST /api/company/register-mchj
 * 
 * MChJ kabinetini ro'yxatdan o'tkazish oqimi:
 * - 9 xonali STIR tekshiriladi
 * - Backend STIR bo'yicha tashkilot nomi va holatini oladi
 * - Tashkilot holati 'active' (faol) bo'lishi shart
 * - Agar tashkilot tugatilgan yoki to'xtatilgan bo'lsa: KABINETNI FAOLLASHTIRMAYDI
 * - Agar tashqi API ishlamasa: aniq xato xabari qaytaradi va kabinetni faollashtirmaydi
 */
router.post('/register-mchj', stirRateLimiter.getMiddleware(), async (req: Request, res: Response) => {
  const body: MchjRegistrationRequest = req.body || {};
  const { inn, phone, login, password, region, district, mahalla } = body;

  // 1. STIR format tekshiruvi: faqat raqam, aynan 9 ta
  if (!CompanyLookupService.isValidStirFormat(inn)) {
    return res.status(400).json({
      success: false,
      cabinetActivated: false,
      error: "STIR formati noto‘g‘ri. STIR aynan 9 ta raqamdan iborat bo‘lishi shart (masalan: 201122334).",
    } as MchjRegistrationResponse);
  }

  // 2. Telefon raqami tekshiruvi
  const cleanPhone = (phone || '').replace(/\D/g, '');
  if (cleanPhone.length < 9) {
    return res.status(400).json({
      success: false,
      cabinetActivated: false,
      error: "Telefon raqami kiritilmagan yoki noto‘g‘ri (+998 ... formatida bo‘lishi lozim).",
    } as MchjRegistrationResponse);
  }

  // 3. Login va parol tekshiruvi
  if (!login || login.trim().length < 5) {
    return res.status(400).json({
      success: false,
      cabinetActivated: false,
      error: "Login kamida 5 ta belgidan iborat bo‘lishi kerak!",
    } as MchjRegistrationResponse);
  }
  if (!password || String(password).trim().length < 7) {
    return res.status(400).json({
      success: false,
      cabinetActivated: false,
      error: "Parol kamida 7 ta belgidan iborat bo‘lishi kerak!",
    } as MchjRegistrationResponse);
  }

  // 4. Backend STIR bo'yicha tashkilot nomi va holatini oladi
  const lookupResult = await defaultCompanyLookupService.lookupByStir(inn);

  // API ishlamasa: aniq xato xabari qaytar, kabinetni faollashtirma
  if (!lookupResult.success || !lookupResult.data) {
    const errorMsg = lookupResult.error || "Tashkilot ma'lumotlarini tekshirib bo'lmadi. Kabinet faollashtirilmadi.";
    const status = lookupResult.errorCode === 'NOT_FOUND' ? 404 : 503;
    return res.status(status).json({
      success: false,
      cabinetActivated: false,
      error: `Davlat reyestridan STIR tasdiqlanmadi: ${errorMsg}`,
    } as MchjRegistrationResponse);
  }

  const company = lookupResult.data;

  // 5. Tashkilot holati tekshiruvi: Faqat faol tashkilotlar uchun kabinet faollashadi!
  if (company.status === 'liquidated') {
    return res.status(422).json({
      success: false,
      cabinetActivated: false,
      company,
      error: `«${company.companyName}» tashkiloti davlat reyestrida TUGATILGAN (Likvidatsiya qilingan) deb belgilangan. Faoliyati tugatilgan yuridik shaxslar uchun kabinet faollashtirilmaydi!`,
    } as MchjRegistrationResponse);
  }

  if (company.status === 'suspended') {
    return res.status(422).json({
      success: false,
      cabinetActivated: false,
      company,
      error: `«${company.companyName}» tashkilotining faoliyati vaqtincha to‘xtatilgan. Faoliyati tiklanmaguncha MChJ kabinetini faollashtirib bo‘lmaydi.`,
    } as MchjRegistrationResponse);
  }

  // 6. E-IMZO tasdiq tekshiruvi (agar so'rovda eimzo uzatilgan bo'lsa)
  let verificationStatus: 'pending' | 'verified' | 'rejected' = 'pending';
  let eimzoVerifiedAt: string | undefined = undefined;

  if (body.eimzo && body.eimzo.challengeId && body.eimzo.signature) {
    const eimzoResult = (await import('../services/eimzo/EImzoService')).defaultEImzoService.verifySignature({
      challengeId: body.eimzo.challengeId,
      inn: company.inn,
      signature: body.eimzo.signature,
      certificate: body.eimzo.certificate,
    });

    if (eimzoResult.success && eimzoResult.status === 'verified') {
      verificationStatus = 'verified';
      eimzoVerifiedAt = eimzoResult.verifiedAt;
    } else {
      verificationStatus = 'rejected';
      return res.status(422).json({
        success: false,
        cabinetActivated: false,
        verificationStatus: 'rejected',
        company,
        error: eimzoResult.message || "E-IMZO tekshiruvi rad etildi (STIR mos kelmadi yoki imzo noto'g'ri).",
      } as MchjRegistrationResponse);
    }
  }

  // 7. Faol tashkilot uchun MChJ kabineti ro'yxatdan o'tkaziladi
  const userId = 'usr-mchj-' + Date.now().toString(36);
  const formattedPhone = cleanPhone.startsWith('998') ? '+' + cleanPhone : '+998' + cleanPhone.slice(-9);

  return res.status(201).json({
    success: true,
    cabinetActivated: true,
    verificationStatus,
    message: verificationStatus === 'verified'
      ? `«${company.companyName}» MChJ kabineti E-IMZO orqali tasdiqlandi va muvaffaqiyatli faollashtirildi!`
      : `«${company.companyName}» MChJ kabineti ro‘yxatdan o‘tkazildi. E-IMZO tasdiqlanishi: ${verificationStatus}.`,
    company,
    user: {
      id: userId,
      inn: company.inn,
      companyName: company.companyName,
      director: company.director,
      role: 'legal',
      phone: formattedPhone,
      verificationStatus,
      eimzoVerifiedAt,
      region: region || company.region,
      district: district || company.district,
      mahalla: mahalla || '',
    },
  });
});

/**
 * POST /api/company/verify-eimzo
 * Mavjud yoki yangi ro'yxatdan o'tayotgan MChJ uchun E-IMZO kalitini tekshirish
 * Status: pending -> verified / rejected
 */
router.post('/verify-eimzo', stirRateLimiter.getMiddleware(), async (req: Request, res: Response) => {
  const { inn, challengeId, signature, certificate } = req.body || {};

  if (!CompanyLookupService.isValidStirFormat(inn)) {
    return res.status(400).json({
      success: false,
      status: 'rejected',
      error: "STIR formati noto‘g‘ri (aynan 9 ta raqam bo'lishi kerak).",
    });
  }

  const { defaultEImzoService } = await import('../services/eimzo/EImzoService');
  const result = defaultEImzoService.verifySignature({
    challengeId,
    inn,
    signature,
    certificate,
  });

  const statusCode = result.status === 'verified' ? 200 : 422;
  return res.status(statusCode).json(result);
});

export default router;
