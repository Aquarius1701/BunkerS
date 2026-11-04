import { CompanyLookupResult } from '../../types/company';

/**
 * CompanyLookupService interfeysi.
 * Har qanday STIR bo'yicha provayder (Mock, Soliq.uz API, Didox API, Davlat xizmatlari API)
 * ushbu shartnomani amalga oshirishi shart.
 */
export interface ICompanyLookupService {
  /**
   * 9 xonali STIR bo'yicha tashkilot ma'lumotlarini qidirish
   * @param inn 9 xonali soliq to'lovchining identifikatsiya raqami
   * @returns CompanyLookupResult
   */
  lookupByStir(inn: string): Promise<CompanyLookupResult>;
}
