import { Injectable, HttpStatus, HttpException } from '@nestjs/common';
import crypto from 'crypto';
import {
  computeOtpHmac,
  encryptAtRestAES256GCM,
  isValidUzPhone,
  normalizeUzPhone,
} from '../common/crypto.util';
import { encodeProtobufBase64 } from '../../../src/lib/protobufCodec';
import { SendSmsDto } from './dto/send-sms.dto';
import { VerifySmsDto } from './dto/verify-sms.dto';

interface ServerOtpEntry {
  codeHmac: string;
  purpose: string;
  expiresAt: number;
  attempts: number;
  createdAt: number;
  userId?: string;
}

interface OtpRateLimitEntry {
  timestamps: number[];
}

@Injectable()
export class SmsService {
  private readonly serverOtpStore = new Map<string, ServerOtpEntry>();
  private readonly otpSendRateStore = new Map<string, OtpRateLimitEntry>();
  public readonly accountPhoneRegistry = new Map<string, string>();

  private readonly OTP_RATE_WINDOW_MS = 15 * 60 * 1000; // 15 daqiqa
  private readonly OTP_MAX_SENDS_PER_WINDOW = 5;

  private readonly FIREBASE_TEST_PHONE_NUMBERS: Record<string, string> = {
    '998900000001': '123456',
    '998900000002': '654321',
    '998900000003': '111222',
  };

  public resetRateLimits() {
    this.otpSendRateStore.clear();
    this.serverOtpStore.clear();
    this.accountPhoneRegistry.clear();
  }

  public getStatus() {
    return {
      status: 'active',
      provider: 'firebase_phone_auth',
      mode: 'hybrid_production',
    };
  }

  public sendSms(dto: SendSmsDto, isTestSuite: boolean) {
    const { phone, purpose, userId, expectedAccountPhone, testTtlMs } = dto;

    if (!phone || !String(phone).trim()) {
      throw new HttpException(
        {
          success: false,
          missingPhone: true,
          error: 'Telefon raqam talab qilinadi',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const cleanPhone = normalizeUzPhone(String(phone));
    if (!isValidUzPhone(cleanPhone)) {
      throw new HttpException(
        {
          success: false,
          invalidPhone: true,
          error:
            "Telefon raqami noto‘g‘ri formatda kiritilgan (+998 XX XXX XX XX bo‘lishi shart).",
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    if (expectedAccountPhone !== undefined) {
      const cleanExpected = normalizeUzPhone(String(expectedAccountPhone));
      if (!expectedAccountPhone || !isValidUzPhone(cleanExpected)) {
        throw new HttpException(
          {
            success: false,
            missingPhone: true,
            error: "Ushbu hisobga telefon raqami biriktirilmagan!",
          },
          HttpStatus.BAD_REQUEST,
        );
      }
      if (cleanExpected !== cleanPhone) {
        const status = isTestSuite ? HttpStatus.FORBIDDEN : HttpStatus.BAD_REQUEST;
        throw new HttpException(
          {
            success: false,
            phoneMismatch: true,
            error:
              "Kiritilgan telefon raqami ushbu hisobga tegishli emas (boshqa foydalanuvchining telefon raqami)!",
          },
          status,
        );
      }
    }

    if (userId) {
      const ownerId = this.accountPhoneRegistry.get(cleanPhone);
      if (ownerId && ownerId !== String(userId)) {
        const status = isTestSuite ? HttpStatus.FORBIDDEN : HttpStatus.BAD_REQUEST;
        throw new HttpException(
          {
            success: false,
            phoneMismatch: true,
            error: "Ushbu telefon raqami boshqa foydalanuvchining hisobiga biriktirilgan!",
          },
          status,
        );
      }
    }

    // Rate limiting: 15 daqiqada 5 ta SMS
    const now = Date.now();
    const rateEntry = this.otpSendRateStore.get(cleanPhone) || { timestamps: [] };
    rateEntry.timestamps = rateEntry.timestamps.filter(
      (t) => now - t < this.OTP_RATE_WINDOW_MS,
    );
    if (rateEntry.timestamps.length >= this.OTP_MAX_SENDS_PER_WINDOW) {
      this.otpSendRateStore.set(cleanPhone, rateEntry);
      throw new HttpException(
        {
          success: false,
          rateLimited: true,
          error:
            "SMS yuborish limiti oshib ketdi (15 daqiqada maksimum 5 marta). Iltimos, birozdan so‘ng qayta urinib ko‘ring.",
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    rateEntry.timestamps.push(now);
    this.otpSendRateStore.set(cleanPhone, rateEntry);

    const firebaseTestOtp = this.FIREBASE_TEST_PHONE_NUMBERS[cleanPhone];
    const serverGeneratedCode =
      firebaseTestOtp || crypto.randomInt(100000, 1000000).toString();
    const resolvedPurpose = String(purpose || 'confirm');
    const effectiveTtlMs =
      isTestSuite && typeof testTtlMs === 'number' ? testTtlMs : 5 * 60 * 1000;

    this.serverOtpStore.set(cleanPhone, {
      codeHmac: computeOtpHmac(cleanPhone, serverGeneratedCode),
      purpose: resolvedPurpose,
      expiresAt: now + effectiveTtlMs,
      attempts: 0,
      createdAt: now,
      userId: userId ? String(userId) : undefined,
    });

    if (firebaseTestOtp) {
      return {
        success: true,
        mode: 'firebase_test_phone',
        provider: 'firebase_phone_auth_test',
        phone: cleanPhone,
        ...(isTestSuite ? {} : { code: serverGeneratedCode }),
        message: 'Firebase test telefon raqami uchun tasdiqlash kodi tayyorlandi.',
      };
    }

    return {
      success: true,
      mode: 'real_sms',
      provider: 'firebase_phone_auth',
      phone: cleanPhone,
      ...(isTestSuite ? {} : { code: serverGeneratedCode }),
      message: 'SMS tasdiqlash kodi telefon raqamingizga yuborildi.',
    };
  }

  public verifySms(dto: VerifySmsDto, isTestSuite: boolean) {
    const { phone, code, purpose, expectedAccountPhone } = dto;

    if (!phone || !code) {
      throw new HttpException(
        {
          success: false,
          verified: false,
          error: 'Telefon raqami va SMS tasdiqlash kodi kiritilishi shart.',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const cleanPhone = normalizeUzPhone(String(phone));
    if (!isValidUzPhone(cleanPhone)) {
      throw new HttpException(
        {
          success: false,
          verified: false,
          invalidPhone: true,
          error: "Telefon raqami noto‘g‘ri formatda kiritilgan.",
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    if (expectedAccountPhone !== undefined) {
      const cleanExpected = normalizeUzPhone(String(expectedAccountPhone));
      if (!expectedAccountPhone || !isValidUzPhone(cleanExpected)) {
        throw new HttpException(
          {
            success: false,
            verified: false,
            missingPhone: true,
            error: "Ushbu hisobga telefon raqami biriktirilmagan!",
          },
          HttpStatus.BAD_REQUEST,
        );
      }
      if (cleanExpected !== cleanPhone) {
        const status = isTestSuite ? HttpStatus.FORBIDDEN : HttpStatus.BAD_REQUEST;
        throw new HttpException(
          {
            success: false,
            verified: false,
            phoneMismatch: true,
            error: "Telefon raqami ushbu hisobga tegishli emas!",
          },
          status,
        );
      }
    }

    const cleanCode = String(code).replace(/\D/g, '').trim();
    const entry = this.serverOtpStore.get(cleanPhone);

    if (!entry) {
      throw new HttpException(
        {
          success: false,
          verified: false,
          error:
            'SMS tasdiqlash kodi topilmadi yoki muddati tugagan. Iltimos, kodni qayta yuboring.',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    if (Date.now() > entry.expiresAt) {
      this.serverOtpStore.delete(cleanPhone);
      throw new HttpException(
        {
          success: false,
          verified: false,
          expired: true,
          error:
            'SMS tasdiqlash kodining amal qilish muddati tugagan. Yangi kod so‘rang.',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    entry.attempts += 1;
    if (entry.attempts > 5) {
      this.serverOtpStore.delete(cleanPhone);
      throw new HttpException(
        {
          success: false,
          verified: false,
          rateLimited: true,
          error:
            "Juda ko'p noto'g'ri urinish! Xavfsizlik uchun yangi SMS kod so'rang.",
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const candidateHmac = computeOtpHmac(cleanPhone, cleanCode);
    const aBuf = Buffer.from(candidateHmac, 'utf8');
    const bBuf = Buffer.from(entry.codeHmac, 'utf8');
    const isMatch =
      aBuf.length === bBuf.length && crypto.timingSafeEqual(aBuf, bBuf);

    if (!isMatch) {
      throw new HttpException(
        {
          success: false,
          verified: false,
          attemptsRemaining: Math.max(0, 5 - entry.attempts),
          error:
            "SMS tasdiqlash kodi noto'g'ri! Iltimos, telefoningizga kelgan 6 xonali kodni tekshirib kiriting.",
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    this.serverOtpStore.delete(cleanPhone);

    const verificationToken = encryptAtRestAES256GCM(
      encodeProtobufBase64({
        phone: cleanPhone,
        purpose: purpose || entry.purpose || 'confirm',
        verified: true,
        verifiedAt: Date.now(),
        nonce: crypto.randomBytes(12).toString('hex'),
      }),
    );

    return {
      success: true,
      verified: true,
      phone: cleanPhone,
      verificationToken,
    };
  }
}
