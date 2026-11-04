import { ICompanyLookupService } from './ICompanyLookupService';
import { MockCompanyProvider } from './MockCompanyProvider';
import { CompanyCache } from './CompanyCache';
import { CompanyLookupResult } from '../../types/company';

/**
 * CompanyLookupService
 * Asosiy servis: Provayder (Mock yoki Real API) va 24-soatlik Keshni birlashtiradi.
 * Dependency Injection orqali xohlagan provayderni qabul qilishi mumkin.
 */
export class CompanyLookupService implements ICompanyLookupService {
  private provider: ICompanyLookupService;
  private cache: CompanyCache;

  constructor(
    provider?: ICompanyLookupService,
    cache?: CompanyCache
  ) {
    this.provider = provider || new MockCompanyProvider();
    this.cache = cache || new CompanyCache();
  }

  /**
   * 9 xonali STIR formatini tekshirish (faqat raqam, aynan 9 ta)
   */
  public static isValidStirFormat(inn: string): boolean {
    if (!inn || typeof inn !== 'string') return false;
    const clean = inn.trim();
    return /^\d{9}$/.test(clean);
  }

  /**
   * STIR bo'yicha qidirish (24 soat kesh tekshiruvi bilan)
   */
  async lookupByStir(inn: string): Promise<CompanyLookupResult> {
    const cleanInn = inn.trim();

    // 1. Format tekshiruvi
    if (!CompanyLookupService.isValidStirFormat(cleanInn)) {
      return {
        success: false,
        errorCode: 'INVALID_STIR',
        error: "STIR formati noto‘g‘ri. STIR faqat 9 ta raqamdan iborat bo‘lishi shart (masalan: 201122334).",
      };
    }

    // 2. 24 soatlik Kesh tekshiruvi
    const cached = this.cache.get(cleanInn);
    if (cached && cached.data && (!cached.data.summaryText || !cached.data.summaryText.includes('manba:'))) {
      return {
        success: true,
        data: cached.data,
        cached: true,
        cachedAt: cached.cachedAt,
      };
    }

    // 3. Provayder orqali qidirish (MockProvider yoki Real Soliq API)
    try {
      const result = await this.provider.lookupByStir(cleanInn);

      // Muvaffaqiyatli natija bo'lsa, 24 soat keshga yozamiz
      if (result.success && result.data) {
        this.cache.set(cleanInn, result.data);
      }

      return result;
    } catch (err: any) {
      return {
        success: false,
        errorCode: 'UPSTREAM_ERROR',
        error: err?.message || "Tashkilotlar ma’lumotlar bazasi bilan aloqa xatosi. Iltimos, keyinroq qayta urinib ko‘ring.",
      };
    }
  }

  /**
   * Yangi provayderni o'rnatish (masalan, RealSoliqProvider)
   */
  setProvider(provider: ICompanyLookupService): void {
    this.provider = provider;
  }

  /**
   * Kesh obyektini olish
   */
  getCache(): CompanyCache {
    return this.cache;
  }
}

// Singleton instancia
export const defaultCompanyLookupService = new CompanyLookupService();
