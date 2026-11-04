import React, { useState, useEffect } from 'react';
import {
  Building2,
  Factory,
  ShieldCheck,
  Users,
  ShoppingBag,
  Layers,
  CheckCircle2,
  MapPin
} from 'lucide-react';
import {
  RealTelegramLogo,
  RealInstagramLogo,
  RealYouTubeLogo,
  RealPhoneLogo
} from '../common/SocialLogos';
import { getAdminConfig, AdminConfig } from '../../lib/adminSettings';

export const LogisticsHub: React.FC = () => {
  const [adminConfig, setAdminConfig] = useState<AdminConfig>(() => getAdminConfig());

  useEffect(() => {
    const syncConfig = () => setAdminConfig(getAdminConfig());
    window.addEventListener('bunkerstroy_admin_config_updated', syncConfig);
    window.addEventListener('storage', syncConfig);
    return () => {
      window.removeEventListener('bunkerstroy_admin_config_updated', syncConfig);
      window.removeEventListener('storage', syncConfig);
    };
  }, []);

  const tgUrl = adminConfig.telegram
    ? adminConfig.telegram.startsWith('http')
      ? adminConfig.telegram
      : `https://t.me/${adminConfig.telegram.replace(/^@/, '')}`
    : 'https://t.me/bunkerstroy_uz';

  const igUrl = adminConfig.instagram
    ? adminConfig.instagram.startsWith('http')
      ? adminConfig.instagram
      : `https://instagram.com/${adminConfig.instagram.replace(/^@/, '')}`
    : 'https://instagram.com/bunkerstroy.uz';

  const ytUrl = adminConfig.youtube
    ? adminConfig.youtube.startsWith('http')
      ? adminConfig.youtube
      : `https://youtube.com/${adminConfig.youtube}`
    : 'https://youtube.com/@bunkerstroy';

  const phoneClean = (adminConfig.phone || '+998 (71) 200-00-50').replace(/[^0-9+]/g, '');

  return (
    <div className="max-w-5xl mx-auto mt-2.5 sm:mt-0 space-y-3 sm:space-y-6 pb-8 sm:pb-12 text-white">
      {/* Asosiy sarlavha bloki (Tyomniy Siniy) */}
      <div className="bg-gradient-to-br from-[#0A1931] via-[#0F2547] to-[#071326] p-3.5 sm:p-8 rounded-xl sm:rounded-2xl border-2 border-[#1E3A6D] shadow-xl space-y-2 sm:space-y-4">
        <div className="inline-flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3.5 py-1 sm:py-1.5 rounded-lg bg-[#132C54] border border-[#2E5A9C] text-[#FFB800] text-[10px] sm:text-xs font-black uppercase tracking-wider font-mono">
          <Building2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#FFB800]" />
          <span>Biz Haqimizda • B2B2C Platforma</span>
        </div>

        <h1 className="text-base sm:text-3xl lg:text-4xl font-black text-white leading-tight">
          BunkerStroy: qurilish mahsulotlarining onlayn savdo markazi
        </h1>

        <p className="text-sky-100 text-xs sm:text-base leading-relaxed font-medium max-w-3xl">
          BunkerStroy’da ta’minotchilarni bir savdo maydonida jamladik: narxlarni solishtirasiz, shartlarni ko‘rasiz, buyurtmani bir joydan berasiz.
        </p>
      </div>

      {/* Bu yerda kim bor */}
      <div className="bg-[#0A1931] p-3.5 sm:p-8 rounded-xl sm:rounded-2xl border-2 border-[#1E3A6D] shadow-xl space-y-3.5 sm:space-y-6">
        <div className="space-y-1 sm:space-y-2 border-b border-[#1E3A6D] pb-2.5 sm:pb-4">
          <h2 className="text-sm sm:text-xl font-black text-[#FFB800] flex items-center gap-2 sm:gap-2.5">
            <Layers className="w-4 h-4 sm:w-5 sm:h-5 text-[#FFB800]" />
            <span>Bu yerda kim bor</span>
          </h2>
          <p className="text-sky-100 text-[11px] sm:text-sm leading-relaxed font-semibold">
            BunkerStroy mahsulotni o‘zi sotmaydi. U ta’minotchilarni va ularning mijozlarini uchrashtiradigan savdo maydoni.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 sm:gap-4">
          {/* B2B */}
          <div className="p-3 sm:p-5 rounded-xl bg-[#0F2547] border border-[#254B85] space-y-1.5 sm:space-y-2.5 shadow-md">
            <div className="flex items-center gap-2.5 sm:gap-3">
              <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-[#FFB800] text-black flex items-center justify-center shrink-0 shadow">
                <Factory className="w-4 h-4 sm:w-5 sm:h-5 stroke-[2.2]" />
              </div>
              <div>
                <span className="text-[10px] sm:text-[11px] font-mono font-black uppercase text-[#FFB800] block">
                  Ta’minotchilar • B2B yo‘nalish
                </span>
                <h3 className="text-xs sm:text-base font-black text-white">
                  Ishlab chiqaruvchi zavodlar (B2B)
                </h3>
              </div>
            </div>
            <p className="text-[11px] sm:text-sm text-sky-100 leading-relaxed font-medium">
              Katta hajm, zavod narxi. Pudratchi va tashkilotlar uchun.
            </p>
          </div>

          {/* B2C */}
          <div className="p-3 sm:p-5 rounded-xl bg-[#0F2547] border border-[#254B85] space-y-1.5 sm:space-y-2.5 shadow-md">
            <div className="flex items-center gap-2.5 sm:gap-3">
              <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-[#FFB800] text-black flex items-center justify-center shrink-0 shadow">
                <ShoppingBag className="w-4 h-4 sm:w-5 sm:h-5 stroke-[2.2]" />
              </div>
              <div>
                <span className="text-[10px] sm:text-[11px] font-mono font-black uppercase text-[#FFB800] block">
                  Ta’minotchilar • B2C yo‘nalish
                </span>
                <h3 className="text-xs sm:text-base font-black text-white">
                  Xaridorlarga sotadigan ta’minotchilar (B2C)
                </h3>
              </div>
            </div>
            <p className="text-[11px] sm:text-sm text-sky-100 leading-relaxed font-medium">
              Uyingizdagi ta’mir yoki kichik qurilish uchun kerakli miqdorda.
            </p>
          </div>
        </div>

        {/* Mahsulot kafolati va aniqlik */}
        <div className="p-3 sm:p-5 rounded-xl bg-[#071326] border border-[#FFB800]/50 flex items-start gap-2.5 sm:gap-3.5">
          <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-[#FFB800]/15 border border-[#FFB800]/40 text-[#FFB800] flex items-center justify-center shrink-0 mt-0.5">
            <ShieldCheck className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
          <div className="space-y-0.5 sm:space-y-1">
            <h4 className="text-[11px] sm:text-sm font-black text-[#FFB800] uppercase tracking-wider font-mono">
              Mahsulot kafolati va aniqlik
            </h4>
            <p className="text-[11px] sm:text-sm text-white leading-relaxed font-semibold">
              Mahsulot kafolati va aniqlik ma’lumotlari mahsulot tavsifida kiritilgan va tavsif uchun Ta’minotchi kafolati mavjud.
            </p>
          </div>
        </div>
      </div>

      {/* Ijtimoiy tarmoqlar va pastidan Aloqa uchun (Real logolar bilan) */}
      <div className="bg-[#0A1931] p-3.5 sm:p-8 rounded-xl sm:rounded-2xl border-2 border-[#1E3A6D] shadow-xl space-y-4 sm:space-y-6">
        {/* 1. Ijtimoiy tarmoqlar: Telegram, Instagram, YouTube */}
        <div className="space-y-2 sm:space-y-3">
          <h3 className="text-xs sm:text-base font-black text-[#FFB800] uppercase tracking-wider font-mono">
            Ijtimoiy tarmoqlar
          </h3>
          <div className="flex items-center gap-3 sm:gap-4">
            <a
              href={tgUrl}
              target="_blank"
              rel="noopener noreferrer"
              title="Telegram"
              aria-label="Telegram"
            >
              <RealTelegramLogo className="w-9 h-9 sm:w-12 sm:h-12" />
            </a>

            <a
              href={igUrl}
              target="_blank"
              rel="noopener noreferrer"
              title="Instagram"
              aria-label="Instagram"
            >
              <RealInstagramLogo className="w-9 h-9 sm:w-12 sm:h-12" />
            </a>

            <a
              href={ytUrl}
              target="_blank"
              rel="noopener noreferrer"
              title="YouTube"
              aria-label="YouTube"
            >
              <RealYouTubeLogo className="w-9 h-9 sm:w-12 sm:h-12" />
            </a>
          </div>
        </div>

        {/* 2. Pastidan Aloqa uchun: Telefon va Telegram logosi */}
        <div className="space-y-2 sm:space-y-3 pt-3 sm:pt-5 border-t border-[#1E3A6D]">
          <h3 className="text-xs sm:text-base font-black text-[#FFB800] uppercase tracking-wider font-mono">
            Aloqa uchun
          </h3>
          <div className="flex items-center gap-3 sm:gap-4">
            <a
              href={`tel:${phoneClean}`}
              title={`Telefon: ${adminConfig.phone || '+998 (71) 200-00-50'}`}
              aria-label="Telefon"
            >
              <RealPhoneLogo className="w-9 h-9 sm:w-12 sm:h-12" />
            </a>

            <a
              href={tgUrl}
              target="_blank"
              rel="noopener noreferrer"
              title="Telegram orqali aloqa"
              aria-label="Telegram orqali aloqa"
            >
              <RealTelegramLogo className="w-9 h-9 sm:w-12 sm:h-12" />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};
