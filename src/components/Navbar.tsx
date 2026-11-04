import React, { useState, useRef, useEffect } from 'react';
import { ShoppingCart, User as UserIcon, HardHat, Building, ChevronDown } from 'lucide-react';
import { UserProfile } from '../types';
import { useLanguage, AppLanguage } from '../lib/i18n';

interface NavbarProps {
  activeTab: 'marketplace' | 'logistics' | 'global_bunker' | 'orders' | 'admin' | 'bunker_admin' | 'supplier' | 'cart_bunker';
  setActiveTab: (tab: any) => void;
  cartCount: number;
  onOpenCart: () => void;
  isCartOpen?: boolean;
  user: UserProfile | null;
  onOpenAuth: () => void;
  onLogout: () => void;
  onOpenLogsModal?: () => void;
  logoUrl?: string | null;
  telegram?: string;
  instagram?: string;
  phone?: string;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  cartCount,
  onOpenCart,
  isCartOpen = false,
  user,
  onOpenAuth,
  logoUrl,
}) => {
  const { lang, setLang, t } = useLanguage();
  const [isLangOpen, setIsLangOpen] = useState(false);
  const [cartAnimKey, setCartAnimKey] = useState(0);
  const prevCartCountRef = useRef<number>(cartCount);
  const langMenuRef = useRef<HTMLDivElement | null>(null);
  const isAdmin = user?.role === 'admin' || user?.role === 'bunker_admin';
  const isSupplier = user?.role === 'supplier';

  useEffect(() => {
    if (cartCount > prevCartCountRef.current) {
      setCartAnimKey((prev) => prev + 1);
    }
    prevCartCountRef.current = cartCount;
  }, [cartCount]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (langMenuRef.current && !langMenuRef.current.contains(e.target as Node)) {
        setIsLangOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogoClick = () => {
    setActiveTab('marketplace');
  };

  const getUserInitials = (u: UserProfile | null) => {
    if (!u) return 'BS';
    if (u.role === 'admin') return 'BA';
    const f = (u.firstName || '').trim().charAt(0);
    const l = (u.lastName || '').trim().charAt(0);
    if (f && l) return (f + l).toUpperCase();
    if (f) return f.toUpperCase();
    if (u.displayName) {
      const parts = u.displayName.trim().split(/\s+/);
      if (parts.length >= 2 && parts[0] && parts[1]) {
        return (parts[0][0] + parts[1][0]).toUpperCase();
      }
      return parts[0].slice(0, 2).toUpperCase();
    }
    return 'BS';
  };

  const currentLangLabel = lang === 'ru' ? 'РУ' : lang === 'uz_cyrl' ? 'ЎЗ' : 'O‘Z';
  const showSavatText = cartCount > 0 || isCartOpen || activeTab === 'cart_bunker';

  return (
    <header className="sticky top-0 z-50 w-full bg-8k-navy-header text-white">
      <div className="h-[3px] w-full bg-[#FFB800] opacity-95" />

      <div className="w-full px-2.5 sm:px-6 lg:px-10 pt-2 sm:pt-0">
        <div className="relative flex items-center justify-between h-13 sm:h-16 mt-1 sm:mt-0 gap-2">
          
          {/* Brand Logo: Mobilda va Kompyuterda kattaroq Logo + BUNKER STROY yozuvi */}
          <div className="flex items-center gap-2 sm:gap-3.5 min-w-0">
            <div 
              onClick={handleLogoClick}
              onDoubleClick={(e) => {
                e.stopPropagation();
                onOpenSecretLogs?.();
              }}
              className="flex items-center gap-2 sm:gap-3 cursor-pointer group select-none py-0.5 min-w-0"
              title="BunkerStroy (2 marta bosganda Loglar bo‘limi ochiladi)"
            >
              {logoUrl ? (
                <div className="relative p-1 rounded-xl bg-[#0F2547] border border-[#254B85] group-hover:border-[#FFB800] transition-colors shrink-0 shadow-md">
                  <img
                    src={logoUrl}
                    alt="BunkerStroy Logo"
                    className="w-9 h-9 sm:w-10 sm:h-10 lg:w-11 lg:h-11 object-contain rounded-lg"
                  />
                </div>
              ) : (
                <div className="relative w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-[#0F2547] border border-[#254B85] group-hover:border-[#FFB800] flex items-center justify-center transition-all shadow-md shrink-0">
                  <HardHat className="w-6 h-6 sm:w-6.5 sm:h-6.5 lg:w-7 lg:h-7 text-[#FFB800] stroke-[2.2]" />
                </div>
              )}
              
              <div className="flex flex-col min-w-0">
                <span className="text-base sm:text-2xl lg:text-3xl font-black tracking-wide leading-none truncate">
                  <span className="text-[#FFB800]">BUNKER</span>{' '}
                  <span className="text-white">STROY</span>
                </span>
              </div>
            </div>
          </div>

          {/* Right Action Buttons: Til tanlash (O'Z / ЎЗ / РУ birlashtirilgan tugma) + Kabinetga Kirish */}
          <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">

            {/* Birlashtirilgan Til Tugmasi (Bosilganda O'Z, ЎЗ, РУ tugmalari ko'rinadi) */}
            <div ref={langMenuRef} className="relative">
              <button
                type="button"
                onClick={() => setIsLangOpen((prev) => !prev)}
                className="liquid-glass-btn-navy flex items-center gap-1 px-2.5 sm:px-3 py-1.5 sm:py-1.5 rounded-xl text-[11px] sm:text-xs font-black text-white cursor-pointer"
                title="Tilni tanlash"
              >
                <span className="text-[#FFB800] font-mono">{currentLangLabel}</span>
                <ChevronDown className={`w-3 h-3 text-white transition-transform duration-150 ${isLangOpen ? 'rotate-180' : ''}`} />
              </button>

              {isLangOpen && (
                <div className="absolute right-0 mt-1.5 p-1.5 rounded-xl liquid-glass-settings-window flex items-center gap-1 z-50 shadow-2xl">
                  {(
                    [
                      { code: 'uz' as AppLanguage, label: 'O‘Z' },
                      { code: 'uz_cyrl' as AppLanguage, label: 'ЎЗ' },
                      { code: 'ru' as AppLanguage, label: 'РУ' },
                    ]
                  ).map((item) => (
                    <button
                      key={item.code}
                      type="button"
                      onClick={() => {
                        setLang(item.code);
                        setIsLangOpen(false);
                      }}
                      className={`px-2.5 py-1.5 rounded-lg text-[11px] sm:text-xs font-black font-mono cursor-pointer transition-colors ${
                        lang === item.code
                          ? 'liquid-glass-tab-active'
                          : 'liquid-glass-tab-inactive'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Auth / Profile Button (Mobilda kattaroq "Kirish", kompyuterda "Kabinetga Kirish" - Liquid Glass) */}
            {user && !isAdmin ? (
              <div className="flex items-center gap-1 sm:gap-1.5">
                <button
                  onClick={() => {
                    if (isSupplier) {
                      setActiveTab('supplier');
                    } else {
                      setActiveTab('orders');
                    }
                  }}
                  className={`flex items-center gap-1.5 px-3 sm:px-3.5 py-1.5 sm:py-1.5 rounded-xl text-xs cursor-pointer ${
                    (isSupplier && activeTab === 'supplier') ||
                    (!isSupplier && activeTab === 'orders')
                      ? 'liquid-glass-tab-active font-black'
                      : 'liquid-glass-btn-navy font-bold'
                  }`}
                  title={isSupplier ? t("Ta'minotchi Kabineti", 'Кабинет поставщика') : t("Mijoz Kabineti", 'Кабинет клиента')}
                >
                  <div className="w-4.5 h-4.5 sm:w-5 sm:h-5 rounded bg-[#071326] text-[#FFB800] font-mono font-bold flex items-center justify-center text-[10px] border border-[#2E5A9C]">
                    {getUserInitials(user)}
                  </div>
                  <span className={`max-w-[90px] sm:max-w-[120px] truncate hidden sm:inline font-bold ${
                    (isSupplier && activeTab === 'supplier') || (!isSupplier && activeTab === 'orders')
                      ? 'text-[#071326]'
                      : 'text-white'
                  }`}>
                    {isSupplier ? (user.companyName || t("Ta'minotchi", 'Поставщик')) : (user.firstName || user.displayName || t('Kabinet', 'Кабинет'))}
                  </span>
                </button>
              </div>
            ) : (
              <button
                onClick={onOpenAuth}
                className="liquid-glass-btn-red flex items-center gap-1.5 px-3.5 sm:px-4 py-2 sm:py-2 rounded-xl text-xs sm:text-xs font-black cursor-pointer whitespace-nowrap"
              >
                <UserIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4 stroke-[2.5] text-white shrink-0" />
                <span className="text-white font-black sm:hidden">{t('Kirish', 'Войти')}</span>
                <span className="text-white font-black hidden sm:inline">{t('Kabinetga Kirish', 'Войти в кабинет')}</span>
              </button>
            )}

          </div>
        </div>
      </div>

      {/* Bottom Navigation bar: Oq fonda o'tkir qora yozuv sifatida Mahsulotlar, Zavod Mahsulotlari va Savat Logosi */}
      <div className="w-full bg-white text-[#000000] border-b border-slate-200 px-2.5 sm:px-6 lg:px-10">
        <div className="relative flex items-center justify-center py-2 sm:py-2.5 gap-5 sm:gap-10">
          <button
            type="button"
            onClick={() => setActiveTab('marketplace')}
            className="bg-transparent border-0 p-0 text-xs sm:text-base font-black text-[#000000] opacity-100 tracking-wide whitespace-nowrap cursor-pointer transition-all"
          >
            {t('Mahsulotlar', 'Товары')}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('global_bunker')}
            className="bg-transparent border-0 p-0 text-xs sm:text-base font-black text-[#000000] opacity-100 tracking-wide whitespace-nowrap cursor-pointer transition-all"
          >
            {t('Zavod Mahsulotlari', 'Заводские товары')}
          </button>

          <button
            type="button"
            onClick={onOpenCart}
            className="bg-transparent border-0 p-0 text-xs sm:text-base font-black text-[#000000] opacity-100 tracking-wide whitespace-nowrap cursor-pointer flex items-center transition-all"
            aria-label={t('Savat', 'Корзина')}
            title={t('Savat', 'Корзина')}
          >
            <span
              key={`icon-${cartAnimKey}`}
              className={`inline-flex items-center justify-center ${
                cartAnimKey > 0 ? 'animate-savat-icon-bounce' : ''
              }`}
            >
              <ShoppingCart
                className={`w-5 h-5 sm:w-5.5 sm:h-5.5 stroke-[2.5] transition-colors duration-300 ${
                  cartCount > 0 ? 'text-emerald-600' : 'text-[#000000]'
                }`}
              />
            </span>

            <span
              key={`text-${cartAnimKey}`}
              className={`inline-flex items-center gap-1.5 overflow-hidden transition-all duration-500 ease-out ${
                showSavatText
                  ? 'max-w-[180px] opacity-100 translate-x-0 ml-1.5 animate-savat-text-slide'
                  : 'max-w-0 opacity-0 -translate-x-3 ml-0 pointer-events-none'
              }`}
            >
              <span className="text-[#000000] font-black">{t('Savat', 'Корзина')}</span>
              {cartCount > 0 && (
                <span className="bg-emerald-600 text-white text-[10px] sm:text-xs font-black font-mono px-1.5 py-0.5 rounded-md min-w-[20px] text-center border border-emerald-500 shadow-sm">
                  {cartCount}
                </span>
              )}
            </span>
          </button>

          {isSupplier && (
            <button
              type="button"
              onClick={() => setActiveTab('supplier')}
              className="bg-transparent border-0 p-0 text-xs sm:text-base font-black text-[#000000] opacity-100 flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <Building className="w-4 h-4 text-[#FFB800]" />
              <span>{t("Ta'minotchi", 'Поставщик')}</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};


