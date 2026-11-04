import { CompanyLookupService } from '../services/companyLookup/CompanyLookupService';
import { MockCompanyProvider } from '../services/companyLookup/MockCompanyProvider';
import { CompanyCache } from '../services/companyLookup/CompanyCache';
import { IpRateLimiter } from '../middlewares/rateLimiter';

/**
 * Rangli konsol chiqarish yordamchilari
 */
const PASS = '\x1b[32m✔ PASS\x1b[0m';
const FAIL = '\x1b[31m✖ FAIL\x1b[0m';

let passedCount = 0;
let failedCount = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  ${PASS}: ${message}`);
    passedCount++;
  } else {
    console.error(`  ${FAIL}: ${message}`);
    failedCount++;
  }
}

export async function runAllTests() {
  console.log('\n======================================================');
  console.log('🧪 MChJ RO‘YXATDAN O‘TKAZISH VA STIR LOOKUP TESTLARI');
  console.log('======================================================\n');

  // -------------------------------------------------------------------
  // 1-Guruh: STIR Format Validatsiyasi Testlari
  // -------------------------------------------------------------------
  console.log('📌 1. STIR Format Validatsiyasi (Faqat raqam, aynan 9 ta):');
  {
    assert(CompanyLookupService.isValidStirFormat('201122334') === true, 'To‘g‘ri 9 xonali STIR qabul qilinishi kerak ("201122334")');
    assert(CompanyLookupService.isValidStirFormat('123456789') === true, 'To‘g‘ri 9 xonali STIR qabul qilinishi kerak ("123456789")');
    assert(CompanyLookupService.isValidStirFormat('12345678') === false, '8 xonali STIR rad etilishi kerak ("12345678")');
    assert(CompanyLookupService.isValidStirFormat('1234567890') === false, '10 xonali STIR rad etilishi kerak ("1234567890")');
    assert(CompanyLookupService.isValidStirFormat('20112233A') === false, 'Harfli STIR rad etilishi kerak ("20112233A")');
    assert(CompanyLookupService.isValidStirFormat('') === false, 'Bo‘sh qiymat rad etilishi kerak');
    assert(CompanyLookupService.isValidStirFormat('  201122334  ') === true, 'Bo‘sh joylar trim qilingan STIR qabul qilinishi kerak');
    assert(CompanyLookupService.isValidStirFormat('201 122 334') === false, 'Ichida bo‘sh joyi bor STIR rad etilishi kerak');
  }

  // -------------------------------------------------------------------
  // 2-Guruh: MockCompanyProvider va Qidiruv Testlari
  // -------------------------------------------------------------------
  console.log('\n📌 2. MockCompanyProvider va STIR bo‘yicha qidiruv:');
  {
    const provider = new MockCompanyProvider();
    
    // Faol MChJ
    const activeRes = await provider.lookupByStir('201122334');
    assert(activeRes.success === true, 'Faol MChJ muvaffaqiyatli topilishi kerak');
    assert(activeRes.data?.companyName.includes('BUNKER STROY INVEST') === true, 'Kompaniya nomi to‘g‘ri kelishi kerak');
    assert(activeRes.data?.status === 'active', 'Kompaniya holati "active" bo‘lishi kerak');

    // Tugatilgan (Liquidated) MChJ
    const liquidatedRes = await provider.lookupByStir('209999999');
    assert(liquidatedRes.success === true, 'Tugatilgan MChJ reyestrdan topiladi');
    assert(liquidatedRes.data?.status === 'liquidated', 'Kompaniya holati "liquidated" deb qaytishi kerak');

    // To'xtatilgan (Suspended) MChJ
    const suspendedRes = await provider.lookupByStir('208888888');
    assert(suspendedRes.success === true, 'To‘xtatilgan MChJ reyestrdan topiladi');
    assert(suspendedRes.data?.status === 'suspended', 'Kompaniya holati "suspended" deb qaytishi kerak');

    // Noma'lum STIR
    const notFoundRes = await provider.lookupByStir('999999999');
    assert(notFoundRes.success === false, 'Noma‘lum STIR bo‘yicha success=false qaytishi kerak');
    assert(notFoundRes.errorCode === 'NOT_FOUND', 'errorCode "NOT_FOUND" bo‘lishi kerak');

    // API xatosi simulyatsiyasi (200000000)
    const apiErrorRes = await provider.lookupByStir('200000000');
    assert(apiErrorRes.success === false, 'API xatosida success=false qaytishi kerak');
    assert(apiErrorRes.errorCode === 'UPSTREAM_ERROR', 'errorCode "UPSTREAM_ERROR" bo‘lishi kerak');
    assert(typeof apiErrorRes.error === 'string' && apiErrorRes.error.length > 0, 'Aniq xato xabari qaytishi kerak');
  }

  // -------------------------------------------------------------------
  // 3-Guruh: 24 Soatlik Kesh (24h Cache) Testlari
  // -------------------------------------------------------------------
  console.log('\n📌 3. 24 Soatlik Kesh (CompanyCache):');
  {
    const cache = new CompanyCache(24 * 60 * 60 * 1000); // 24h
    const testData: any = {
      inn: '201122334',
      companyName: 'Test MChJ',
      status: 'active',
      statusDescription: 'Faol',
    };

    assert(cache.get('201122334') === null, 'Dastlab keshda ma‘lumot bo‘lmasligi kerak');
    
    cache.set('201122334', testData);
    const cached = cache.get('201122334');
    assert(cached !== null, 'Keshga yozilgandan so‘ng topilishi kerak');
    assert(cached?.data.companyName === 'Test MChJ', 'Keshdagi kompaniya nomi to‘g‘ri bo‘lishi kerak');

    // CompanyLookupService orqali kesh ishlashini tekshirish
    const mockProvider = new MockCompanyProvider();
    const serviceWithCache = new CompanyLookupService(mockProvider, cache);

    const call1 = await serviceWithCache.lookupByStir('201122334');
    assert(call1.cached === true, 'Keshdagi ma‘lumot cached=true bayrog‘i bilan qaytishi kerak');

    // Yangi STIR so'ralganda birinchi marta provayderdan olib keshga yozishi
    const call2 = await serviceWithCache.lookupByStir('305566778');
    assert(call2.cached !== true, 'Birinchi marta keshdan olinmasligi kerak');
    
    // Ikkinchi chaqiruvda keshdan olinishi
    const call3 = await serviceWithCache.lookupByStir('305566778');
    assert(call3.cached === true, 'Ikkinchi chaqiruvda 24 soatlik keshdan olinishi kerak');
  }

  // -------------------------------------------------------------------
  // 4-Guruh: Rate-Limiting Testi (IP bo'yicha daqiqasiga 5 ta)
  // -------------------------------------------------------------------
  console.log('\n📌 4. Rate-Limiting Testi (IP bo‘yicha daqiqasiga 5 ta):');
  {
    const limiter = new IpRateLimiter(5, 60 * 1000);
    const middleware = limiter.getMiddleware();

    let allowedCount = 0;
    let blockedCount = 0;

    for (let i = 1; i <= 7; i++) {
      let isNextCalled = false;
      let statusCode = 200;

      const mockReq: any = {
        headers: {},
        socket: { remoteAddress: '192.168.1.100' },
      };

      const mockRes: any = {
        setHeader: () => {},
        status: (code: number) => {
          statusCode = code;
          return {
            json: (_data: any) => {},
          };
        },
      };

      const mockNext = () => {
        isNextCalled = true;
      };

      middleware(mockReq, mockRes, mockNext);

      if (isNextCalled) {
        allowedCount++;
      } else if (statusCode === 429) {
        blockedCount++;
      }
    }

    assert(allowedCount === 5, `Birinchi 5 ta so‘rov o‘tkazilishi kerak (Haqiqiy: ${allowedCount})`);
    assert(blockedCount === 2, `6- va 7-so‘rovlar 429 Too Many Requests bilan bloklanishi kerak (Haqiqiy: ${blockedCount})`);
  }

  // -------------------------------------------------------------------
  // 5-Guruh: Xavfsizlik va Kabinetni Faollashtirmaslik Testlari
  // -------------------------------------------------------------------
  console.log('\n📌 5. MChJ Kabinetini Ro‘yxatdan O‘tkazish Xavfsizlik Qoidalari:');
  {
    const service = new CompanyLookupService();

    // Qoida 1: Tugatilgan tashkilot nomidan kabinet ochish taqiqlanadi
    const liquidated = await service.lookupByStir('209999999');
    assert(
      liquidated.data?.status === 'liquidated',
      'Tugatilgan tashkilot aniqlanishi va kabinet faollashtirilmasligi shart'
    );

    // Qoida 2: To'xtatilgan tashkilot nomidan kabinet ochish taqiqlanadi
    const suspended = await service.lookupByStir('208888888');
    assert(
      suspended.data?.status === 'suspended',
      'Faoliyati to‘xtatilgan tashkilot aniqlanishi va kabinet faollashtirilmasligi shart'
    );

    // Qoida 3: API ishlamasa xato xabari qaytadi, kabinet faollashtirilmaydi
    const apiDown = await service.lookupByStir('200000000');
    assert(
      apiDown.success === false && apiDown.errorCode === 'UPSTREAM_ERROR',
      'API ishlamaganda aniq xato xabari qaytariladi va kabinet faollashtirilmaydi'
    );
  }

  console.log('\n======================================================');
  console.log(`📊 TEST NATIJALARI: Jami: ${passedCount + failedCount} | Muvaffaqiyatli: ${passedCount} | Xatolar: ${failedCount}`);
  console.log('======================================================\n');

  if (failedCount > 0) {
    throw new Error(`${failedCount} ta test muvaffaqiyatsiz tugadi!`);
  }
}
