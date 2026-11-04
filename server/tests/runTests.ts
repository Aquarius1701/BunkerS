import { runAllTests as runCompanyLookupTests } from './companyLookup.test';
import { runEImzoTests } from './eimzo.test';
import { runAuthSecurityMigrationTests } from './authSecurityMigration.test';

async function main() {
  try {
    await runCompanyLookupTests();
    await runEImzoTests();
    await runAuthSecurityMigrationTests();
    console.log('🎉 BARCHA TESTLAR (STIR Lookup + E-IMZO + Auth/OTP/Migration Security) MUVAFFAQIYATLI O\'TDI!\n');
    process.exit(0);
  } catch (err) {
    console.error('Testlar xatosi:', err);
    process.exit(1);
  }
}

main();
