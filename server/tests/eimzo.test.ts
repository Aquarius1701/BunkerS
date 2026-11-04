import { EImzoService, CHALLENGE_TTL_MS } from '../services/eimzo/EImzoService';

export async function runEImzoTests() {
  console.log('\n========================================');
  console.log('🧪 E-IMZO TASDIQLASH TESTLARI BOSHLANDI');
  console.log('========================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`  ✅ [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] ${testName}`);
      if (detail) console.error(`     Sabab: ${detail}`);
      failed++;
    }
  }

  const eimzoService = new EImzoService();

  // Test 1: Challenge yaratish va 5 daqiqalik muddat tekshiruvi
  try {
    const ch = eimzoService.createChallenge('201122334');
    assert(
      !!ch.challengeId && ch.challengeId.startsWith('ch_'),
      "1. Challenge ID unikal formatda yaratildi",
      `ID: ${ch.challengeId}`
    );
    assert(
      !!ch.challengeText && ch.challengeText.includes('201122334'),
      "2. Challenge tasodifiy matni va STIR kiritildi",
      ch.challengeText
    );
    const ttlDiff = ch.expiresAt - ch.createdAt;
    assert(
      ttlDiff === CHALLENGE_TTL_MS,
      "3. Challenge amal qilish muddati aynan 5 daqiqa (300 000 ms)",
      `TTL ms: ${ttlDiff}`
    );
    assert(
      ch.isConsumed === false,
      "4. Yangi yaratilgan challenge dastlab ishlatilmagan (isConsumed: false)"
    );
  } catch (err: any) {
    assert(false, "Challenge yaratishda xatolik", err.message);
  }

  // Test 2: STIR mos kelganda kabinet statusi 'verified' bo'lishi
  try {
    const targetInn = '201122334';
    const ch = eimzoService.createChallenge(targetInn);

    const result = eimzoService.verifySignature({
      challengeId: ch.challengeId,
      inn: targetInn,
      signature: 'MIAGCSqGSIb3DQEHAqCAMIACAQExDzANBglghkgBZQMEAgEFADCA...',
      certificate: {
        inn: targetInn, // Mos keluvchi STIR
        companyName: '«BUNKER STROY INVEST» MChJ',
        directorName: 'Alimov Rustam Shavkatovich',
        serialNumber: '5B7A890123CD45EF',
      },
    });

    assert(
      result.success === true,
      "5. Mos keluvchi STIR bilan E-IMZO muvaffaqiyatli tekshirildi (success: true)"
    );
    assert(
      result.status === 'verified',
      "6. Sertifikatdagi STIR mos kelganda status 'verified' bo'ldi",
      `Status: ${result.status}`
    );
    assert(
      result.stirMatched === true,
      "7. STIR mosligi tasdiqlandi (stirMatched: true)"
    );
  } catch (err: any) {
    assert(false, "E-IMZO mos STIR tekshiruvida xatolik", err.message);
  }

  // Test 3: Sertifikatdagi STIR kiritilgan STIR bilan mos KELMAGANDA kabinet statusi 'rejected' bo'lishi
  try {
    const targetInn = '201122334'; // Kiritilgan STIR
    const wrongCertInn = '305566778'; // Begona sertifikatdagi STIR
    const ch = eimzoService.createChallenge(targetInn);

    const result = eimzoService.verifySignature({
      challengeId: ch.challengeId,
      inn: targetInn,
      signature: 'MIAGCSqGSIb3DQEHAqCAMIACAQExDzANBglghkgBZQMEAgEFADCA...',
      certificate: {
        inn: wrongCertInn, // Noto'g'ri / boshqa korxona STIR'i
        companyName: '«TOSHKENT G\'ISHT SERVIS» MChJ',
        directorName: 'Begona Rahbar',
        serialNumber: '99AA123456BC78DE',
      },
    });

    assert(
      result.success === false,
      "8. Boshqa korxona STIR'i bilan imzolanganda natija muvaffaqiyatsiz (success: false)"
    );
    assert(
      result.status === 'rejected',
      "9. Sertifikatdagi STIR mos kelmaganda status 'rejected' bo'ldi",
      `Status: ${result.status}`
    );
    assert(
      result.errorCode === 'STIR_MISMATCH',
      "10. Xato kodi STIR_MISMATCH deb qaytarildi",
      `ErrorCode: ${result.errorCode}`
    );
    assert(
      result.stirMatched === false,
      "11. STIR mos emasligi belgilandi (stirMatched: false)"
    );
  } catch (err: any) {
    assert(false, "STIR mos kelmaslik tekshiruvida xatolik", err.message);
  }

  // Test 4: Challenge bir martalik (bir marta ishlatilgach, qayta ishlatilsa 'rejected')
  try {
    const targetInn = '123456789';
    const ch = eimzoService.createChallenge(targetInn);

    // 1-marta ishlatish
    const res1 = eimzoService.verifySignature({
      challengeId: ch.challengeId,
      inn: targetInn,
      signature: 'MIAGCSqGSIb3DQEHAqCAMIACAQExDzANBglghkgBZQMEAgEFADCA...',
      certificate: { inn: targetInn },
    });
    assert(res1.status === 'verified', "12. Challenge 1-marta muvaffaqiyatli qabul qilindi");

    // 2-marta xuddi shu challengeni ishlatishga urinish
    const res2 = eimzoService.verifySignature({
      challengeId: ch.challengeId,
      inn: targetInn,
      signature: 'MIAGCSqGSIb3DQEHAqCAMIACAQExDzANBglghkgBZQMEAgEFADCA...',
      certificate: { inn: targetInn },
    });

    assert(
      res2.status === 'rejected',
      "13. Bir martalik challenge qayta ishlatilganda status 'rejected' bo'ldi",
      `Status: ${res2.status}`
    );
    assert(
      res2.errorCode === 'CHALLENGE_ALREADY_USED',
      "14. Xato kodi CHALLENGE_ALREADY_USED qaytdi",
      `ErrorCode: ${res2.errorCode}`
    );
  } catch (err: any) {
    assert(false, "Bir martalik challenge tekshiruvida xatolik", err.message);
  }

  // Test 5: 5 daqiqalik muddat o'tgan (expired) challenge tekshiruvi
  try {
    const ch = eimzoService.createChallenge('201122334');
    // Muddati 6 daqiqa oldin o'tgan deb simulyatsiya qilamiz
    ch.expiresAt = Date.now() - 60 * 1000;

    const resExpired = eimzoService.verifySignature({
      challengeId: ch.challengeId,
      inn: '201122334',
      signature: 'MIAGCSqGSIb3DQEHAqCAMIACAQExDzANBglghkgBZQMEAgEFADCA...',
      certificate: { inn: '201122334' },
    });

    assert(
      resExpired.status === 'rejected',
      "15. Muddati o'tgan (>5 daqiqa) challenge bilan status 'rejected' bo'ldi",
      `Status: ${resExpired.status}`
    );
    assert(
      resExpired.errorCode === 'CHALLENGE_EXPIRED',
      "16. Xato kodi CHALLENGE_EXPIRED qaytdi",
      `ErrorCode: ${resExpired.errorCode}`
    );
  } catch (err: any) {
    assert(false, "Muddati o'tgan challenge tekshiruvida xatolik", err.message);
  }

  // Test 6: Yaroqsiz yoki soxta imzo
  try {
    const ch = eimzoService.createChallenge('201122334');
    const resInvalidSig = eimzoService.verifySignature({
      challengeId: ch.challengeId,
      inn: '201122334',
      signature: 'short', // 10 belgidan kam, soxta imzo
      certificate: { inn: '201122334' },
    });

    assert(
      resInvalidSig.status === 'rejected',
      "17. Soxta / qisqa imzo bilan status 'rejected' bo'ldi"
    );
    assert(
      resInvalidSig.errorCode === 'INVALID_SIGNATURE',
      "18. Xato kodi INVALID_SIGNATURE qaytdi"
    );
  } catch (err: any) {
    assert(false, "Soxta imzo tekshiruvida xatolik", err.message);
  }

  // Test 7: Mavjud bo'lmagan challengeId
  try {
    const resNotFound = eimzoService.verifySignature({
      challengeId: 'ch_not_found_123',
      inn: '201122334',
      signature: 'MIAGCSqGSIb3DQEHAqCAMIACAQExDzANBglghkgBZQMEAgEFADCA...',
      certificate: { inn: '201122334' },
    });

    assert(
      resNotFound.status === 'rejected',
      "19. Mavjud bo'lmagan challenge bilan status 'rejected' bo'ldi"
    );
    assert(
      resNotFound.errorCode === 'CHALLENGE_NOT_FOUND',
      "20. Xato kodi CHALLENGE_NOT_FOUND qaytdi"
    );
  } catch (err: any) {
    assert(false, "Challenge topilmadi tekshiruvida xatolik", err.message);
  }

  console.log('\n----------------------------------------');
  console.log(`📊 E-IMZO NATIJALARI: Jami: ${passed + failed} | O'tdi: ${passed} | Xato: ${failed}`);
  console.log('----------------------------------------\n');

  if (failed > 0) {
    throw new Error(`E-IMZO testlarida ${failed} ta xatolik aniqlandi.`);
  }
}
