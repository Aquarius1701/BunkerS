import { CompanyInfo } from '../../types/company';

interface CacheEntry {
  data: CompanyInfo;
  cachedAt: number; // timestamp in ms
  expiresAt: number; // timestamp in ms
}

/**
 * CompanyCache - 24 soatlik kesh xizmati
 * Natijalarni xotirada (in-memory) 24 soat (86,400,000 ms) davomida saqlaydi.
 */
export class CompanyCache {
  private cache: Map<string, CacheEntry> = new Map();
  // 24 soat (millisekundlarda)
  public static readonly DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

  constructor(private ttlMs: number = CompanyCache.DEFAULT_TTL_MS) {}

  /**
   * Keshdan ma'lumot olish. Agar muddati o'tgan bo'lsa, o'chirib tashlaydi.
   */
  get(inn: string): { data: CompanyInfo; cachedAt: string } | null {
    const entry = this.cache.get(inn);
    if (!entry) return null;

    const now = Date.now();
    if (now > entry.expiresAt) {
      this.cache.delete(inn);
      return null;
    }

    return {
      data: entry.data,
      cachedAt: new Date(entry.cachedAt).toISOString(),
    };
  }

  /**
   * Keshga saqlash (24 soatlik TTL bilan)
   */
  set(inn: string, data: CompanyInfo): void {
    const now = Date.now();
    this.cache.set(inn, {
      data,
      cachedAt: now,
      expiresAt: now + this.ttlMs,
    });
  }

  /**
   * Muayyan STIR keshini tozalash
   */
  delete(inn: string): void {
    this.cache.delete(inn);
  }

  /**
   * Barcha keshni tozalash
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Keshdagi elementlar soni
   */
  size(): number {
    return this.cache.size;
  }
}
