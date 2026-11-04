import { Request, Response, NextFunction } from 'express';

interface RateLimitRecord {
  count: number;
  resetTime: number; // timestamp in ms
}

/**
 * IP bo'yicha Rate Limiter middleware
 * STIR kiritish endpointi uchun: IP bo'yicha daqiqasiga 5 ta so'rov
 */
export class IpRateLimiter {
  private records: Map<string, RateLimitRecord> = new Map();
  private maxRequests: number;
  private windowMs: number;

  constructor(maxRequests: number = 5, windowMs: number = 60 * 1000) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;

    // Har 5 daqiqada eskirgan IP yozuvlarni tozalab turish
    setInterval(() => this.cleanup(), 5 * 60 * 1000).unref();
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [ip, record] of this.records.entries()) {
      if (now > record.resetTime) {
        this.records.delete(ip);
      }
    }
  }

  public getMiddleware() {
    return (req: Request, res: Response, next: NextFunction) => {
      // IP manzilni aniqlash
      const forwarded = req.headers['x-forwarded-for'];
      const ip = (typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : '') ||
        req.socket.remoteAddress ||
        '127.0.0.1';

      const now = Date.now();
      const record = this.records.get(ip);

      if (!record || now > record.resetTime) {
        // Yangi oyna boshlanishi
        this.records.set(ip, {
          count: 1,
          resetTime: now + this.windowMs,
        });

        res.setHeader('X-RateLimit-Limit', this.maxRequests);
        res.setHeader('X-RateLimit-Remaining', this.maxRequests - 1);
        res.setHeader('X-RateLimit-Reset', Math.ceil((now + this.windowMs) / 1000));
        return next();
      }

      if (record.count >= this.maxRequests) {
        const retryAfterSeconds = Math.max(1, Math.ceil((record.resetTime - now) / 1000));
        
        res.setHeader('X-RateLimit-Limit', this.maxRequests);
        res.setHeader('X-RateLimit-Remaining', 0);
        res.setHeader('X-RateLimit-Reset', Math.ceil(record.resetTime / 1000));
        res.setHeader('Retry-After', retryAfterSeconds);

        return res.status(429).json({
          success: false,
          errorCode: 'RATE_LIMITED',
          error: `STIR tekshirish so‘rovlari limiti oshdi. Xavfsizlik maqsadida bir daqiqada ko‘pi bilan 5 ta so‘rov yuborish mumkin. Iltimos, ${retryAfterSeconds} soniyadan so‘ng qayta urinib ko‘ring.`,
          retryAfter: retryAfterSeconds,
        });
      }

      record.count += 1;
      res.setHeader('X-RateLimit-Limit', this.maxRequests);
      res.setHeader('X-RateLimit-Remaining', this.maxRequests - record.count);
      res.setHeader('X-RateLimit-Reset', Math.ceil(record.resetTime / 1000));
      return next();
    };
  }

  /**
   * Testlar uchun yozuvlarni tozalash
   */
  public reset(): void {
    this.records.clear();
  }
}

// STIR qidirish uchun daqiqasiga 60 ta so'rov limitli middleware
export const stirRateLimiter = new IpRateLimiter(60, 60 * 1000);
