import assert from 'node:assert/strict';

const BASE_URL = process.env.TEST_BASE_URL || 'http://127.0.0.1:3000';

async function postJson(path: string, body: any, extraHeaders: Record<string, string> = {}) {
  const resp = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-bunkerstroy-test-suite': '1',
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  });
  const data: any = await resp.json().catch(() => ({}));
  const setCookie = resp.headers.get('set-cookie') || '';
  return { status: resp.status, ok: resp.ok, data, setCookie };
}

async function getJson(path: string, cookie = '') {
  const resp = await fetch(`${BASE_URL}${path}`, {
    method: 'GET',
    headers: cookie ? { Cookie: cookie } : {},
  });
  const data: any = await resp.json().catch(() => ({}));
  return { status: resp.status, ok: resp.ok, data };
}

export async function runAuthSecurityMigrationTests() {
  console.log('\n============================================================');
  console.log('🔐 BUNKERSTROY AUTHENTICATION, OTP & MIGRATION TEST SUITE');
  console.log('============================================================\n');

  await postJson('/api/auth/logout', { resetTestRateLimits: true });

  // 1. To‘g‘ri OTP (Firebase Test Phone Number +998 90 000 00 01 -> 123456)
  {
    const sendRes = await postJson('/api/sms/send', {
      phone: '+998 90 000 00 01',
      purpose: 'migration',
    });
    assert.equal(sendRes.status, 200, 'Valid phone OTP send should return 200');
    assert.equal(sendRes.data.success, true);
    assert.equal(
      sendRes.data.code,
      undefined,
      'CRITICAL SECURITY: /api/sms/send must NEVER return OTP code in response!'
    );

    const verifyRes = await postJson('/api/sms/verify', {
      phone: '+998 90 000 00 01',
      code: '123456',
      purpose: 'migration',
    });
    assert.equal(verifyRes.status, 200, 'Correct OTP should return 200');
    assert.equal(verifyRes.data.verified, true);
    assert.ok(verifyRes.data.verificationToken, 'Verification token must be issued');
    console.log('✅ [Test 1/11] To‘g‘ri OTP (Firebase Test Phone +998900000001) — PASS');
  }

  // 2. Noto‘g‘ri OTP
  {
    await postJson('/api/sms/send', {
      phone: '+998 90 000 00 02',
      purpose: 'migration',
    });
    const wrongVerify = await postJson('/api/sms/verify', {
      phone: '+998 90 000 00 02',
      code: '000000',
      purpose: 'migration',
    });
    assert.equal(wrongVerify.status, 400, 'Wrong OTP should return 400');
    assert.equal(wrongVerify.data.verified, false);
    assert.equal(wrongVerify.data.verificationToken, undefined);
    console.log('✅ [Test 2/11] Noto‘g‘ri OTP rad etilishi — PASS');
  }

  // 3. Muddati tugagan OTP (Expired OTP)
  {
    await postJson('/api/sms/send', {
      phone: '+998 90 000 00 03',
      purpose: 'migration',
      testTtlMs: 20, // 20ms TTL for test
    });
    await new Promise((r) => setTimeout(r, 45));
    const expiredVerify = await postJson('/api/sms/verify', {
      phone: '+998 90 000 00 03',
      code: '111222',
      purpose: 'migration',
    });
    assert.equal(expiredVerify.status, 400, 'Expired OTP should return 400');
    assert.equal(expiredVerify.data.verified, false);
    assert.equal(expiredVerify.data.expired, true);
    console.log('✅ [Test 3/11] Muddati tugagan OTP rad etilishi — PASS');
  }

  // 4. SMS qayta yuborish (Resend SMS)
  {
    // Resend to +998 90 000 00 02 after previous wrong attempt
    const resendRes = await postJson('/api/sms/send', {
      phone: '+998 90 000 00 02',
      purpose: 'migration',
    });
    assert.equal(resendRes.status, 200);
    assert.equal(resendRes.data.success, true);

    const verifyAfterResend = await postJson('/api/sms/verify', {
      phone: '+998 90 000 00 02',
      code: '654321',
      purpose: 'migration',
    });
    assert.equal(verifyAfterResend.status, 200);
    assert.equal(verifyAfterResend.data.verified, true);
    console.log('✅ [Test 4/11] SMS qayta yuborish va yangi kod bilan tasdiqlash — PASS');
  }

  // 5. Noto‘g‘ri telefon raqami
  {
    const badPhoneRes = await postJson('/api/sms/send', {
      phone: '+998 12 34',
      purpose: 'signup',
    });
    assert.equal(badPhoneRes.status, 400);
    assert.equal(badPhoneRes.data.invalidPhone, true);
    console.log('✅ [Test 5/11] Noto‘g‘ri telefon raqami formati rad etilishi — PASS');
  }

  // 6. Boshqa foydalanuvchining telefon raqami
  {
    const mismatchRes = await postJson('/api/sms/send', {
      phone: '+998 90 000 00 02',
      expectedAccountPhone: '+998 90 000 00 01',
      userId: 'usr-legacy-1',
      purpose: 'migration',
    });
    assert.equal(mismatchRes.status, 403);
    assert.equal(mismatchRes.data.phoneMismatch, true);
    console.log('✅ [Test 6/11] Boshqa foydalanuvchining telefon raqami rad etilishi (403) — PASS');
  }

  // 7. Telefon raqami mavjud bo‘lmagan hisob
  {
    const noPhoneVerify = await postJson('/api/auth/verify-account', {
      login: 'eski_mijoz_raqamsiz',
      password: 'oldPlainPassword',
      accountRecord: {
        id: 'usr-no-phone-01',
        login: 'eski_mijoz_raqamsiz',
        password: 'oldPlainPassword',
        phone: '',
        role: 'individual',
      },
    });
    assert.equal(noPhoneVerify.status, 400);
    assert.equal(noPhoneVerify.data.requiresMigration, true);
    assert.equal(noPhoneVerify.data.missingPhone, true);
    console.log('✅ [Test 7/11] Telefon raqami mavjud bo‘lmagan hisob bloklanishi — PASS');
  }

  // 8. Eski foydalanuvchi migratsiyasi (Backup -> Rollback -> Migration -> Yangi parol bilan login)
  {
    const legacyCustomer = {
      id: 'usr-legacy-101',
      login: 'rustam_stroy',
      password: 'eski_ochiq_parol_123',
      phone: '+998 90 000 00 01',
      role: 'individual',
      displayName: 'Rustam Quruvchi',
    };

    // 8a. Migratsiyadan oldin Backup yaratish
    const backupRes = await postJson('/api/auth/migration-backup', {
      userId: legacyCustomer.id,
      login: legacyCustomer.login,
      role: legacyCustomer.role,
      accountSnapshot: legacyCustomer,
    });
    assert.equal(backupRes.status, 200);
    assert.equal(backupRes.data.success, true);
    assert.ok(backupRes.data.backupId);

    // 8b. Rollback mexanizmini tekshirish
    const rollbackRes = await postJson('/api/auth/migration-rollback', {
      backupId: backupRes.data.backupId,
    });
    assert.equal(rollbackRes.status, 200);
    assert.equal(rollbackRes.data.success, true);
    assert.equal(rollbackRes.data.restoredAccount.login, 'rustam_stroy');
    assert.equal(rollbackRes.data.restoredAccount.password, 'eski_ochiq_parol_123');

    // 8c. Eski akkaunt login qilganda requiresMigration qaytishi
    const checkLegacy = await postJson('/api/auth/verify-account', {
      login: legacyCustomer.login,
      password: legacyCustomer.password,
      accountRecord: legacyCustomer,
    });
    assert.equal(checkLegacy.status, 200);
    assert.equal(checkLegacy.data.requiresMigration, true);

    // 8d. OTP yuborish va tasdiqlash
    await postJson('/api/sms/send', {
      phone: legacyCustomer.phone,
      expectedAccountPhone: legacyCustomer.phone,
      userId: legacyCustomer.id,
      purpose: 'migration',
    });
    const otpVerify = await postJson('/api/sms/verify', {
      phone: legacyCustomer.phone,
      expectedAccountPhone: legacyCustomer.phone,
      code: '123456',
      purpose: 'migration',
    });
    assert.equal(otpVerify.data.verified, true);

    // 8e. Yangi kuchli parol o'rnatib migratsiyani yakunlash
    const migRes = await postJson('/api/auth/complete-migration', {
      userId: legacyCustomer.id,
      login: legacyCustomer.login,
      role: legacyCustomer.role,
      phone: legacyCustomer.phone,
      expectedAccountPhone: legacyCustomer.phone,
      newPassword: 'YangiKuchliParol#2026',
      verificationToken: otpVerify.data.verificationToken,
      preMigrationSnapshot: legacyCustomer,
    });
    assert.equal(migRes.status, 200);
    assert.equal(migRes.data.success, true);
    assert.equal(migRes.data.passwordMigrated, true);
    assert.ok(String(migRes.data.passwordHash).startsWith('$argon2id$'));

    const migratedAccount = {
      id: legacyCustomer.id,
      login: legacyCustomer.login,
      phone: legacyCustomer.phone,
      role: legacyCustomer.role,
      passwordHash: migRes.data.passwordHash,
      passwordMigrated: true,
    };

    // 8f. Eski parol bilan kirish rad etilishi
    const loginOldPass = await postJson('/api/auth/verify-account', {
      login: migratedAccount.login,
      password: 'eski_ochiq_parol_123',
      accountRecord: migratedAccount,
    });
    assert.equal(loginOldPass.data.success, false);
    assert.equal(loginOldPass.data.invalidCredentials, true);

    // 8g. Yangi parol bilan muvaffaqiyatli login
    const loginNewPass = await postJson('/api/auth/verify-account', {
      login: migratedAccount.login,
      password: 'YangiKuchliParol#2026',
      accountRecord: migratedAccount,
    });
    assert.equal(loginNewPass.status, 200);
    assert.equal(loginNewPass.data.success, true);
    assert.equal(loginNewPass.data.requiresMigration, false);
    assert.equal(loginNewPass.data.verifiedRole, 'individual');
    assert.ok(loginNewPass.setCookie.includes('bs_httponly_token='));
    console.log('✅ [Test 8/11] Backup + Rollback + Migratsiya + Yangi parol bilan login — PASS');
  }

  // 9. Admin hisobining migratsiyasi
  {
    const legacyAdmin = {
      login: 'ADMIN.',
      password: 'ADMIN.',
      phone: '+998 90 000 00 03',
    };

    const adminCheck = await postJson('/api/auth/verify-account', {
      login: 'ADMIN.',
      password: 'ADMIN.',
      adminRecord: legacyAdmin,
      requireAdminMigration: true,
    });
    assert.equal(adminCheck.status, 200);
    assert.equal(adminCheck.data.requiresMigration, true);
    assert.equal(adminCheck.data.role, 'admin');

    await postJson('/api/sms/send', {
      phone: legacyAdmin.phone,
      expectedAccountPhone: legacyAdmin.phone,
      userId: 'admin-master',
      purpose: 'migration',
    });
    const adminOtp = await postJson('/api/sms/verify', {
      phone: legacyAdmin.phone,
      expectedAccountPhone: legacyAdmin.phone,
      code: '111222',
      purpose: 'migration',
    });
    assert.equal(adminOtp.data.verified, true);

    const adminMig = await postJson('/api/auth/complete-migration', {
      userId: 'admin-master',
      login: 'ADMIN.',
      role: 'admin',
      phone: legacyAdmin.phone,
      expectedAccountPhone: legacyAdmin.phone,
      newPassword: 'AdminStrongPassword!2026',
      verificationToken: adminOtp.data.verificationToken,
      preMigrationSnapshot: legacyAdmin,
    });
    assert.equal(adminMig.status, 200);
    assert.equal(adminMig.data.success, true);
    assert.equal(adminMig.data.verifiedRole, 'admin');
    assert.ok(String(adminMig.data.passwordHash).startsWith('$argon2id$'));

    const cookiePair = adminMig.setCookie.split(';')[0];
    const sessionCheck = await getJson('/api/auth/session', cookiePair);
    assert.equal(sessionCheck.data.authenticated, true);
    assert.equal(sessionCheck.data.role, 'admin');
    console.log('✅ [Test 9/11] Admin hisobining migratsiyasi va server session tekshiruvi — PASS');
  }

  // 10. Rate limiting (OTP brute-force >5 urinish + SMS flood >5 yuborish)
  {
    const rateTestPhone = '+998 91 777 88 99';
    // 1st send
    const s1 = await postJson('/api/sms/send', { phone: rateTestPhone, purpose: 'confirm' });
    assert.equal(s1.status, 200);

    // 6 wrong OTP verification attempts -> 6th must return 429
    for (let i = 1; i <= 5; i++) {
      const v = await postJson('/api/sms/verify', { phone: rateTestPhone, code: '000000' });
      assert.equal(v.status, 400);
    }
    const v6 = await postJson('/api/sms/verify', { phone: rateTestPhone, code: '000000' });
    assert.equal(v6.status, 429, '6th wrong OTP attempt must return HTTP 429');
    assert.equal(v6.data.rateLimited, true);

    // Send 4 more times (total 5 in window), then 6th send must return HTTP 429
    for (let i = 2; i <= 5; i++) {
      const s = await postJson('/api/sms/send', { phone: rateTestPhone, purpose: 'confirm' });
      assert.equal(s.status, 200);
    }
    const s6 = await postJson('/api/sms/send', { phone: rateTestPhone, purpose: 'confirm' });
    assert.equal(s6.status, 429, '6th SMS send within 15m window must return HTTP 429');
    assert.equal(s6.data.rateLimited, true);
    console.log('✅ [Test 10/11] Rate limiting (OTP brute-force 429 va SMS flood 429) — PASS');
  }

  // 11. Mavjud funksiyalar va Haqiqiy SMS Gateway ishlashda davom etishi
  {
    const smsStatus = await getJson('/api/sms/status');
    assert.equal(smsStatus.status, 200);
    assert.equal(smsStatus.data.provider, 'firebase_phone_auth');

    // Real SMS Gateway path test with a non-test phone number
    const realGatewaySend = await postJson('/api/sms/send', {
      phone: '+998 97 123 45 67',
      purpose: 'confirm',
    });
    assert.equal(realGatewaySend.status, 200);
    assert.equal(realGatewaySend.data.success, true);
    assert.equal(realGatewaySend.data.mode, 'real_sms');
    assert.equal(realGatewaySend.data.code, undefined);

    const lockStatus = await postJson('/api/security/cabinet-lock/check', {
      login: 'rustam_stroy',
      userId: 'usr-legacy-101',
      deviceSessionId: 'dev-test-1',
    });
    assert.equal(lockStatus.status, 200);
    assert.equal(lockStatus.data.locked, false);

    const backupsList = await getJson('/api/auth/migration-backups');
    assert.equal(backupsList.status, 200);
    assert.ok(backupsList.data.total >= 2);
    console.log('✅ [Test 11/11] Haqiqiy SMS Gateway va mavjud funksiyalar ishlashi — PASS');
  }

  console.log('\n🎉 BARCHA 11 TA XAVFSIZLIK, OTP VA MIGRATSIYA TESTLARI 100% MUVAFFAQIYATLI O‘TDI!\n');
}
