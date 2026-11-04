import { Request, Response, NextFunction } from 'express';

/**
 * 9 xonali STIR format tekshiruvi middleware
 * Faqat raqam, aynan 9 ta belgi: /^\d{9}$/
 */
export const validateStirMiddleware = (req: Request, res: Response, next: NextFunction) => {
  // Query param yoki body'dan olish
  const innRaw = req.query.inn || req.body?.inn;

  if (!innRaw || typeof innRaw !== 'string') {
    return res.status(400).json({
      success: false,
      errorCode: 'INVALID_STIR',
      error: "STIR raqami kiritilmagan. Iltimos, 9 xonali STIR raqamini yuboring.",
    });
  }

  const cleanInn = innRaw.trim();

  // Faqat raqam va aynan 9 ta
  if (!/^\d{9}$/.test(cleanInn)) {
    return res.status(400).json({
      success: false,
      errorCode: 'INVALID_STIR',
      error: `Kiritilgan STIR formati noto‘g‘ri ('${cleanInn}'). STIR faqat raqamlardan va aynan 9 ta raqamdan iborat bo‘lishi lozim (masalan: 201122334).`,
      providedValue: cleanInn,
      length: cleanInn.length,
    });
  }

  // Tozalangan STIRni request obyektiga qo'shib keyingi qadamga o'tkazish
  res.locals.cleanInn = cleanInn;
  next();
};
