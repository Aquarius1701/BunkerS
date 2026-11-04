import React, { useState } from 'react';
import {
  Trash2,
  Plus,
  Minus,
  MapPin,
  CheckCircle,
  AlertCircle,
  HardHat,
  Package,
  ShoppingCart,
  ArrowLeft,
  Check,
  ChevronRight,
  X,
} from 'lucide-react';
import { CartItem, UserProfile } from '../../types';
import { db, handleFirestoreError, OperationType } from '../../lib/firebase';
import { doc, setDoc } from 'firebase/firestore';
import { CheckoutModal } from './CheckoutModal';
import { getColorPaletteItem } from '../../lib/colorPalette';
import { useLanguage } from '../../lib/i18n';

interface CartModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: CartItem[];
  onUpdateQuantity: (productId: string, quantity: number) => void;
  onRemoveItem: (productId: string) => void;
  onClearCart: () => void;
  user: UserProfile | null;
  onOpenAuth: (mode?: 'login' | 'register') => void;
  onOrderSuccess: (orderId: string) => void;
  onUserUpdate?: (updatedUser: UserProfile) => void;
  logoUrl?: string | null;
  onNavigateTab?: (tab: 'marketplace' | 'global_bunker') => void;
}

export const CartModal: React.FC<CartModalProps> = ({
  isOpen,
  onClose,
  items,
  onUpdateQuantity,
  onRemoveItem,
  onClearCart,
  user,
  onOpenAuth,
  onOrderSuccess,
  onUserUpdate,
  logoUrl,
  onNavigateTab,
}) => {
  const { t } = useLanguage();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [fullscreenImage, setFullscreenImage] = useState<string | null>(null);

  if (!isOpen) return null;

  const grandTotal = items.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
  const totalCartCount = items.reduce((sum, item) => sum + item.quantity, 0);

  const formatPrice = (p: number) => new Intl.NumberFormat('uz-UZ').format(p) + ' ' + t("so'm", 'сум');

  const selectedItem = items.find((i) => i.product.id === selectedProductId);
  const otherItems = items.filter((i) => i.product.id !== selectedProductId);

  const handleStartCheckout = () => {
    if (!user) {
      onOpenAuth('register');
      return;
    }
    if (items.length === 0) return;
    setIsCheckoutOpen(true);
  };

  const handleCreateOrder = async () => {
    if (!user) {
      onOpenAuth('register');
      return;
    }

    if (items.length === 0) return;

    // Ombor qoldig'ini tekshirish
    for (const item of items) {
      const avail = typeof item.product.stock === 'number' ? Math.max(0, item.product.stock) : 0;
      if (item.quantity > avail) {
        setError(`«${item.product.title}» — Ombordagi miqdor yetarli emas! (Omborda mavjud: ${avail} ${item.product.unit})`);
        return;
      }
    }

    setLoading(true);
    setError(null);

    const orderId = 'ord-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 6);
    const orderData = {
      id: orderId,
      buyerId: user.id,
      buyerName: user.displayName || 'Mijoz',
      buyerPhone: user.phone || 'Kelishilgan',
      items: items.map((i) => ({
        productId: i.product.id,
        title: i.product.title,
        quantity: i.quantity,
        unit: i.product.unit,
        price: i.product.price,
        supplierId: i.product.supplierId,
        supplierInn: i.product.supplierInn,
        supplierName: i.product.supplierName,
      })),
      totalAmount: grandTotal,
      status: 'pending',
      deliveryAddress: user.region
        ? `${user.region}${user.district ? ', ' + user.district : ''}`
        : 'Bunker orqali rasmiylashtirilgan',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    try {
      await setDoc(doc(db, 'orders', orderId), orderData);

      // Real ma'lumotlar bilan ishlash: mahalliy xotirada ham buyurtma va moliyaviy operatsiya saqlanadi
      try {
        const savedOrders = localStorage.getItem('bunkerstroy_orders');
        const ordersList = savedOrders ? JSON.parse(savedOrders) : [];
        ordersList.unshift(orderData);
        localStorage.setItem('bunkerstroy_orders', JSON.stringify(ordersList));

        // Sotilgan mahsulotlarni ombor qoldig'idan ayirish
        const savedProds = localStorage.getItem('bunkerstroy_products');
        if (savedProds) {
          const prodsList = JSON.parse(savedProds);
          if (Array.isArray(prodsList)) {
            const updatedProds = prodsList.map((p: any) => {
              const orderedItem = items.find((it) => it.product.id === p.id);
              if (!orderedItem) return p;
              const nextSales = (Number(p.salesCount) || 0) + orderedItem.quantity;
              const nextStock = Math.max(0, (Number(p.stock) || 0) - orderedItem.quantity);
              setDoc(doc(db, 'products', p.id), { stock: nextStock, salesCount: nextSales }, { merge: true }).catch(() => {});
              return {
                ...p,
                salesCount: nextSales,
                stock: nextStock,
              };
            });
            localStorage.setItem('bunkerstroy_products', JSON.stringify(updatedProds));
            window.dispatchEvent(new CustomEvent('bunkerstroy_products_updated'));
          }
        }

        // Moliyaviy kirim operatsiyasi yaratish
        const savedTx = localStorage.getItem('bunkerstroy_transactions');
        const txList = savedTx ? JSON.parse(savedTx) : [];
        const newTx = {
          id: 'tx-' + Date.now().toString(36),
          type: 'income',
          category: 'Mahsulotlar savdosi',
          sourceOrDestination: `«${user.displayName || 'Mijoz'}» buyurtmasi (#${orderId.slice(-6).toUpperCase()})`,
          amount: grandTotal,
          paymentMethod: 'Bank hisob raqami (Perechisleniye)',
          date: new Date().toISOString().replace('T', ' ').slice(0, 16),
          status: 'completed',
        };
        txList.unshift(newTx);
        localStorage.setItem('bunkerstroy_transactions', JSON.stringify(txList));

        // Tizim logini yozish
        const savedLogs = localStorage.getItem('bunkerstroy_logs');
        const logsList = savedLogs ? JSON.parse(savedLogs) : [];
        const newLog = {
          id: `log-${Date.now()}`,
          action: 'Yangi buyurtma qabul qilindi',
          actor: user.displayName || 'Xaridor',
          category: 'order',
          details: `Buyurtma #${orderId.slice(-6).toUpperCase()} rasmiylashtirildi. Jami summa: ${new Intl.NumberFormat('uz-UZ').format(grandTotal)} so'm. Manzil: ${orderData.deliveryAddress}`,
          timestamp: new Date().toISOString(),
          ip: '195.158.12.84',
          level: 'success'
        };
        logsList.unshift(newLog);
        localStorage.setItem('bunkerstroy_logs', JSON.stringify(logsList));

        // Admin va boshqa oynalar uchun event yuborish
        window.dispatchEvent(new CustomEvent('bunkerstroy_finance_updated'));
      } catch (locErr) {
        console.warn('Local storage sync warning:', locErr);
      }

      onClearCart();
      onClose();
      onOrderSuccess(orderId);
    } catch (err: any) {
      console.error('Order creation error:', err);
      try {
        handleFirestoreError(err, OperationType.CREATE, 'orders');
      } catch (e: any) {
        setError("Buyurtmani saqlashda xatolik yuz berdi. Iltimos qayta urinib ko'ring.");
      }
    } finally {
      setLoading(false);
    }
  };

  const getSupplierAddress = (item: CartItem) => {
    if (item.product.region) {
      return `${item.product.region}${item.product.district ? ', ' + item.product.district : ''}`;
    }
    const sup = (item.product.supplierName || '').toLowerCase();
    if (sup.includes('navoiy')) return 'Navoiy viloyati, Karmana';
    if (sup.includes('bekobod') || sup.includes('metallurgiya')) return 'Toshkent vil., Bekobod sh.';
    if (sup.includes('ohangaron')) return 'Toshkent vil., Ohangaron t.';
    if (sup.includes('quvasoy')) return "Farg'ona vil., Quvasoy sh.";
    if (sup.includes('knauf')) return 'Buxoro vil., Kogon t.';
    return 'Toshkent sh., Bosh omborxona';
  };

  return (
    <div className="fixed inset-0 z-50 w-screen h-screen bg-white flex flex-col overflow-hidden text-[#0A1931] anim-part-12">
      {/* To'liq ekranni (Full Screen White) egallovchi Buyurtma Berish Savati */}
      <div className="w-full h-full flex flex-col overflow-hidden bg-white text-[#0A1931]">
        
        {/* Header: Kattaroq Logo + BUNKER STROY yozuvi + Oq fondagi Bo'limlar qatori */}
        <header className="w-full bg-8k-navy-header text-white shrink-0">
          <div className="h-[3px] w-full bg-[#FFB800] opacity-95" />
          <div className="w-full px-3 sm:px-6 lg:px-10 pt-2 sm:pt-0">
            <div className="flex items-center justify-between h-13 sm:h-16 gap-2">
              {/* Chap taraf: Kattaroq Logo va BUNKER STROY yozuvi */}
              <div
                onClick={onClose}
                className="flex items-center gap-2 sm:gap-3.5 cursor-pointer group select-none min-w-0"
                title="BunkerStroy (Asosiy sahifaga qaytish)"
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

                <span className="hidden md:inline-block h-6 w-px bg-white/20 mx-1" />

                <span className="hidden sm:inline text-xs sm:text-base lg:text-lg font-extrabold text-sky-200 truncate">
                  {t('Bunkerdagi Materiallar', 'Материалы в Бункере')}
                </span>
              </div>

              {/* O'ng taraf: Faqat Yopish (X) tugmasi (yonidagi ortiqcha 2-savat olib tashlandi) */}
              <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                <button
                  onClick={onClose}
                  className="liquid-glass-btn-navy p-2 sm:p-2.5 rounded-xl transition-all cursor-pointer shrink-0"
                  title={t('Yopish', 'Закрыть')}
                >
                  <X className="w-4 h-4 sm:w-5 sm:h-5" />
                </button>
              </div>
            </div>
          </div>

          {/* Bo'limlar qatori: Oq fonda o'tkir qora yozuv sifatida Mahsulotlar | Zavod Mahsulotlari | Savat */}
          <div className="w-full bg-white text-[#000000] border-b border-slate-200 px-3 sm:px-6 lg:px-10">
            <div className="relative flex items-center justify-center py-2 sm:py-2.5 gap-5 sm:gap-10">
              <button
                type="button"
                onClick={() => {
                  if (onNavigateTab) {
                    onNavigateTab('marketplace');
                  } else {
                    onClose();
                  }
                }}
                className="bg-transparent border-0 p-0 text-xs sm:text-base font-black text-[#000000] opacity-100 tracking-wide whitespace-nowrap cursor-pointer transition-all"
              >
                {t('Mahsulotlar', 'Товары')}
              </button>

              <button
                type="button"
                onClick={() => {
                  if (onNavigateTab) {
                    onNavigateTab('global_bunker');
                  } else {
                    onClose();
                  }
                }}
                className="bg-transparent border-0 p-0 text-xs sm:text-base font-black text-[#000000] opacity-100 tracking-wide whitespace-nowrap cursor-pointer transition-all"
              >
                {t('Zavod Mahsulotlari', 'Заводские товары')}
              </button>

              <button
                type="button"
                className="bg-transparent border-0 p-0 text-xs sm:text-base font-black text-[#000000] opacity-100 tracking-wide whitespace-nowrap cursor-pointer flex items-center gap-1.5"
              >
                <ShoppingCart className="w-5 h-5 sm:w-5.5 sm:h-5.5 text-[#000000] stroke-[2.5]" />
                <span className="text-[#000000] font-black animate-savat-text-slide">{t('Savat', 'Корзина')}</span>
                {totalCartCount > 0 && (
                  <span className="bg-emerald-600 text-white text-[10px] sm:text-xs font-black font-mono px-1.5 py-0.5 rounded-md min-w-[20px] text-center border border-emerald-500">
                    {totalCartCount}
                  </span>
                )}
              </button>
            </div>
          </div>
        </header>

        {/* Content: Full-Screen White (Oq) Fon */}
        <div className="p-3 sm:p-6 lg:p-8 overflow-y-auto space-y-4 flex-1 bg-white text-[#0A1931] flex flex-col">
          {/* Savatda turganimizni ko'rsatuvchi yuqori sarlavha va Savat logosi */}
          <div className="w-full max-w-[1440px] mx-auto flex items-center justify-between gap-3 pb-3 border-b border-slate-200">
            <div className="flex items-center gap-2.5 sm:gap-3.5">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-[#0A1931] border border-[#1E3A6D] flex items-center justify-center text-[#FFB800] shadow-sm shrink-0">
                <ShoppingCart className="w-5 h-5 sm:w-6 sm:h-6 stroke-[2.2]" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base sm:text-xl lg:text-2xl font-black text-[#0A1931] leading-tight">
                    {t('Savat', 'Корзина')}
                  </h2>
                  <span className="text-xs sm:text-sm font-bold text-slate-500">
                    • {t('Bunkerdagi Materiallar', 'Материалы в Бункере')}
                  </span>
                </div>
                <p className="text-[11px] sm:text-sm text-slate-600 font-semibold">
                  {t('Tanlangan qurilish mahsulotlari va tezkor buyurtma oynasi', 'Выбранные стройматериалы и окно быстрого заказа')}
                </p>
              </div>
            </div>
          </div>

          {items.length === 0 ? (
            <div className="text-center py-12 sm:py-20 lg:py-28 space-y-4 sm:space-y-6 w-full max-w-4xl mx-auto p-6 sm:p-14 lg:p-20 bg-white text-[#0A1931] my-auto flex-1 flex flex-col items-center justify-center">
              <div className="w-16 h-16 sm:w-24 sm:h-24 lg:w-28 lg:h-28 rounded-2xl sm:rounded-3xl liquid-glass-filter-card flex items-center justify-center mx-auto text-[#FFB800] shadow-lg">
                <ShoppingCart className="w-8 h-8 sm:w-12 sm:h-12 lg:w-14 lg:h-14 stroke-[2]" />
              </div>
              <div className="space-y-2 sm:space-y-3">
                <h3 className="text-lg sm:text-2xl lg:text-3xl font-black text-[#0A1931]">
                  {t("Savatingiz hozircha bo‘sh", 'Ваша корзина пока пуста')}
                </h3>
                <p className="text-xs sm:text-base lg:text-lg text-slate-600 font-semibold max-w-xl mx-auto leading-relaxed">
                  {t(
                    "Bunker katalogidan kerakli qurilish mahsulotlarini tanlab savatga qo‘shing.",
                    'Выберите нужные стройматериалы из каталога Bunker и добавьте их в корзину.'
                  )}
                </p>
              </div>
              <button
                onClick={onClose}
                className="liquid-glass-btn-amber px-6 py-2.5 sm:px-9 sm:py-4 rounded-xl sm:rounded-2xl text-xs sm:text-base lg:text-lg font-black cursor-pointer inline-block shadow-md"
              >
                {t('Bunker Katalogiga O‘tish', 'Перейти в каталог Bunker')}
              </button>
            </div>
          ) : selectedItem ? (
            /* ============================================================ */
            /* 1-REJIM: TANLANGAN MAHSULOTNING BATAFSIL MA'LUMOTLARI        */
            /* YON TARAFIDAN ESA QOLGAN SAVATDAGI MAHSULOTLAR RO'YXATI      */
            /* ============================================================ */
            <div className="space-y-5 animate-fadeIn">
              {/* Yuqori boshqaruv navigatsiyasi */}
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <button
                  type="button"
                  onClick={() => setSelectedProductId(null)}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs sm:text-sm font-bold liquid-glass-btn-navy cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4 text-[#FFB800]" />
                  <span>Tanlangan Qurilish Mahsulotlari jadvaliga qaytish</span>
                </button>

                <div className="flex items-center gap-3">
                  <span className="text-xs text-white font-mono font-bold liquid-glass-filter-card px-3.5 py-2 rounded-lg">
                    Jami savatda: {items.length} xil mahsulot
                  </span>
                </div>
              </div>

              {/* 2 Ustunli Kengaytirilgan Split View */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                
                {/* Asosiy (Chap) Blok: Tanlangan Mahsulotning Barcha Ma'lumotlari */}
                <div className="lg:col-span-7 xl:col-span-8 liquid-glass-settings-window rounded-xl p-5 sm:p-7 text-white space-y-6">
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                    
                    {/* Rasm va Galereya */}
                    <div className="space-y-3">
                      <div
                        onDoubleClick={() =>
                          setFullscreenImage(
                            selectedItem.product.images && selectedItem.product.images.length > 0
                              ? selectedItem.product.images[activeImageIndex] || selectedItem.product.image
                              : selectedItem.product.image
                          )
                        }
                        className="relative rounded-lg overflow-hidden liquid-glass-card-image border border-white/20 aspect-square flex items-center justify-center shadow-md cursor-zoom-in"
                        title="Katta ekranda ko‘rish uchun ikki marta bosing"
                      >
                        <img
                          src={
                            selectedItem.product.images && selectedItem.product.images.length > 0
                              ? selectedItem.product.images[activeImageIndex] || selectedItem.product.image
                              : selectedItem.product.image
                          }
                          alt={selectedItem.product.title}
                          className="w-full h-full object-contain p-2"
                        />
                        <div className="absolute top-3 left-3 flex flex-col gap-1.5">
                          <span className="px-2.5 py-1 rounded liquid-glass-filter-card text-xs font-bold text-[#FFB800] font-mono">
                            {selectedItem.product.category}
                          </span>
                        </div>
                      </div>

                      {/* Agar 12 tagacha surat yuklangan bo'lsa */}
                      {selectedItem.product.images && selectedItem.product.images.length > 1 && (
                        <div className="space-y-1.5">
                          <div className="text-[11px] font-bold text-sky-200">
                            Mahsulot suratlari ({selectedItem.product.images.length} ta):
                          </div>
                          <div className="flex items-center gap-2 overflow-x-auto pb-1">
                            {selectedItem.product.images.map((img, i) => (
                              <button
                                key={i}
                                type="button"
                                onClick={() => setActiveImageIndex(i)}
                                onDoubleClick={() => setFullscreenImage(img)}
                                className={`w-12 h-12 rounded-lg overflow-hidden border shrink-0 transition-all cursor-pointer ${
                                  activeImageIndex === i
                                    ? 'border-[#FFB800] ring-1 ring-[#FFB800]'
                                    : 'border-white/20 opacity-60 hover:opacity-100'
                                }`}
                              >
                                <img src={img} alt={`${i + 1}-rasm`} className="w-full h-full object-cover" />
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Mahsulot ma'lumotlari, ta'minotchi va narx */}
                    <div className="space-y-4 flex flex-col justify-between">
                      <div className="space-y-3.5">
                        <div>
                          <h3 className="text-xl sm:text-2xl font-bold text-[#F5F5F2] leading-tight">
                            {selectedItem.product.title}
                          </h3>
                          <span className="inline-block mt-1 text-xs text-[#FFB800] font-mono font-bold">
                            Kategoriya: {selectedItem.product.category}
                          </span>
                        </div>

                        {/* Narxi */}
                        <div className="p-3.5 rounded-lg liquid-glass-settings-card space-y-1">
                          <div className="text-xs text-sky-200 font-bold uppercase tracking-wider">Narxi:</div>
                          <div className="text-2xl sm:text-3xl font-bold text-[#FFB800] font-mono-numbers">
                            {formatPrice(selectedItem.product.price)}
                          </div>
                          <div className="text-xs text-sky-200 font-mono">
                            1 {selectedItem.product.unit} uchun belgilangan narx
                          </div>
                        </div>

                        {/* Ta'minotchi va Manzil */}
                        <div className="p-3.5 rounded-lg liquid-glass-settings-card space-y-1.5">
                          <div className="text-xs text-sky-200 font-bold uppercase tracking-wider">
                            Ta'minotchi Manzili:
                          </div>
                          <div className="font-bold text-[#F5F5F2] text-sm">
                            {selectedItem.product.supplierName || "Rasmiy Qurilish Ta'minotchisi"}
                          </div>
                          <div className="flex items-start gap-1.5 text-xs text-sky-200">
                            <MapPin className="w-4 h-4 text-[#FFB800] shrink-0 mt-0.5" />
                            <span>{getSupplierAddress(selectedItem)}</span>
                          </div>
                        </div>

                        {/* Yetkazib berish xizmati */}
                        <div className="flex items-center gap-2.5">
                          <span className="text-xs text-sky-200 font-bold">Yetkazib berish:</span>
                          {selectedItem.product.hasDelivery !== false ? (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold liquid-glass-filter-card text-emerald-400">
                              <Check className="w-4 h-4 stroke-[3]" />
                              <span>✓ Mavjud</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold liquid-glass-filter-card text-rose-400">
                              <span>✕ Mavjud emas</span>
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Buyurtma miqdorini boshqarish */}
                      <div className="p-4 rounded-lg liquid-glass-settings-card space-y-3 mt-2">
                        <div className="flex items-center justify-between text-xs font-bold">
                          <span className="text-sky-200 uppercase tracking-wider">Buyurtma Miqdori:</span>
                          <span className="text-[#FFB800] font-mono text-sm">
                            Jami: {formatPrice(selectedItem.product.price * selectedItem.quantity)}
                          </span>
                        </div>

                        <div className="flex items-center justify-between gap-3">
                          <div className="inline-flex items-center gap-3 liquid-glass-filter-card px-3.5 py-1.5 rounded-lg">
                            <button
                              type="button"
                              disabled={selectedItem.quantity <= Math.max(1, Number(selectedItem.product.minOrder) || 1)}
                              onClick={(e) => {
                                e.stopPropagation();
                                const minQty = Math.max(1, Number(selectedItem.product.minOrder) || 1);
                                if (selectedItem.quantity <= minQty) return;
                                onUpdateQuantity(selectedItem.product.id, Math.max(minQty, selectedItem.quantity - 1));
                              }}
                              className={`p-1 rounded transition-colors ${
                                selectedItem.quantity <= Math.max(1, Number(selectedItem.product.minOrder) || 1)
                                  ? 'text-slate-500 opacity-40 cursor-not-allowed'
                                  : 'text-sky-200 hover:text-white cursor-pointer'
                              }`}
                              title="Kamaytirish"
                            >
                              <Minus className="w-4 h-4" />
                            </button>
                            <span className="text-base sm:text-lg font-bold text-[#F5F5F2] px-2 min-w-[36px] text-center font-mono">
                              {selectedItem.quantity}
                            </span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onUpdateQuantity(selectedItem.product.id, selectedItem.quantity + 1);
                              }}
                              className="p-1 text-sky-200 hover:text-white rounded transition-colors cursor-pointer"
                              title="Oshirish"
                            >
                              <Plus className="w-4 h-4" />
                            </button>
                          </div>

                          <div className="text-right">
                            <div className="text-xs text-sky-200 font-bold font-mono">
                              {selectedItem.quantity} {selectedItem.product.unit}
                            </div>
                          </div>
                        </div>
                      </div>

                    </div>
                  </div>

                  {/* Qo'shimcha parametrlar (Ranglar, O'lchov, Og'irlik, Uzunlik) */}
                  {((selectedItem.product.colors && selectedItem.product.colors.length > 0) ||
                    (selectedItem.product.sizes && selectedItem.product.sizes.length > 0) ||
                    (selectedItem.product.weights && selectedItem.product.weights.length > 0) ||
                    (selectedItem.product.lengths && selectedItem.product.lengths.length > 0)) && (
                    <div className="p-4 rounded-lg liquid-glass-settings-card grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                      {selectedItem.product.colors && selectedItem.product.colors.length > 0 && (
                        <div className="space-y-1.5">
                          <div className="text-xs text-sky-200 font-bold uppercase tracking-wider">Ranglar:</div>
                          <div className="flex flex-wrap gap-1.5">
                            {selectedItem.product.colors.map((c, i) => {
                              const colStyle = getColorPaletteItem(c);
                              return (
                                <span
                                  key={i}
                                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold border border-white/30 shadow-sm"
                                  style={{ backgroundColor: colStyle.bg, color: colStyle.text }}
                                >
                                  <span
                                    className="w-3 h-3 rounded-full border border-current/40 shrink-0"
                                    style={{ backgroundColor: colStyle.bg }}
                                  />
                                  <span>{c}</span>
                                </span>
                              );
                            })}
                          </div>
                        </div>
                      )}
                      {selectedItem.product.sizes && selectedItem.product.sizes.length > 0 && (
                        <div className="space-y-1.5">
                          <div className="text-xs text-sky-200 font-bold uppercase tracking-wider">O'lchov:</div>
                          <div className="flex flex-wrap gap-1.5">
                            {selectedItem.product.sizes.map((s, i) => (
                              <span
                                key={i}
                                className="px-2.5 py-1 rounded text-xs font-bold liquid-glass-filter-card text-[#FFB800] font-mono"
                              >
                                {s}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {selectedItem.product.weights && selectedItem.product.weights.length > 0 && (
                        <div className="space-y-1.5">
                          <div className="text-xs text-sky-200 font-bold uppercase tracking-wider">Og'irlik:</div>
                          <div className="flex flex-wrap gap-1.5">
                            {selectedItem.product.weights.map((w, i) => (
                              <span
                                key={i}
                                className="px-2.5 py-1 rounded text-xs font-bold liquid-glass-filter-card text-[#FFB800] font-mono"
                              >
                                {w}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {selectedItem.product.lengths && selectedItem.product.lengths.length > 0 && (
                        <div className="space-y-1.5">
                          <div className="text-xs text-sky-200 font-bold uppercase tracking-wider">Uzunlik:</div>
                          <div className="flex flex-wrap gap-1.5">
                            {selectedItem.product.lengths.map((l, i) => (
                              <span
                                key={i}
                                className="px-2.5 py-1 rounded text-xs font-bold liquid-glass-filter-card text-[#FFB800] font-mono"
                              >
                                {l}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Izoh va Tavsif (300 tagacha harf) */}
                  {selectedItem.product.description && (
                    <div className="p-4 rounded-lg liquid-glass-settings-card space-y-1.5">
                      <div className="text-xs text-sky-200 font-bold uppercase tracking-wider">
                        Mahsulot Izohi va Tavsifi:
                      </div>
                      <p className="text-xs sm:text-sm text-[#F5F5F2] leading-relaxed">
                        {selectedItem.product.description}
                      </p>
                    </div>
                  )}

                </div>

                {/* Yon (O'ng) Blok: Savatdagi Qolgan Mahsulotlar */}
                <div className="lg:col-span-5 xl:col-span-4 liquid-glass-settings-window rounded-xl p-5 sm:p-6 text-white space-y-4">
                  <div className="flex items-center justify-between border-b border-white/15 pb-3.5">
                    <div>
                      <h4 className="text-sm font-bold text-white uppercase tracking-wider">
                        Savatdagi Qolgan Mahsulotlar
                      </h4>
                      <p className="text-xs text-sky-200 mt-0.5">
                        Ma'lumotlarini ko'rish uchun tanlang
                      </p>
                    </div>
                    <span className="text-xs font-mono font-bold liquid-glass-filter-card px-3 py-1 rounded-lg text-[#FFB800]">
                      {otherItems.length} ta
                    </span>
                  </div>

                  {otherItems.length === 0 ? (
                    <div className="py-12 text-center space-y-3">
                      <Package className="w-12 h-12 text-sky-300/50 mx-auto" />
                      <p className="text-xs text-sky-200 max-w-[240px] mx-auto">
                        Savatda boshqa mahsulot yo'q. Faqat ushbu tanlangan mahsulot mavjud.
                      </p>
                      <button
                        type="button"
                        onClick={() => setSelectedProductId(null)}
                        className="liquid-glass-btn-navy px-4 py-2 rounded-lg text-xs font-bold cursor-pointer"
                      >
                        Jadval ko'rinishiga qaytish
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-3 max-h-[580px] overflow-y-auto pr-1">
                      {otherItems.map((other) => (
                        <div
                          key={other.product.id}
                          onClick={() => {
                            setSelectedProductId(other.product.id);
                            setActiveImageIndex(0);
                          }}
                          className="p-3.5 rounded-lg liquid-glass-filter-card transition-all cursor-pointer flex items-center justify-between gap-3 group"
                          title="Ushbu mahsulot tafsilotlarini ko'rish"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <img
                              src={other.product.image}
                              alt={other.product.title}
                              className="w-12 h-12 rounded-lg object-cover shrink-0 bg-[#071326] border border-white/20"
                            />
                            <div className="min-w-0 space-y-1">
                              <h5 className="text-xs sm:text-sm font-bold text-white truncate group-hover:text-[#FFB800] transition-colors">
                                {other.product.title}
                              </h5>
                              <div className="text-[11px] text-sky-200">
                                {other.quantity} {other.product.unit} •{' '}
                                <span className="font-mono text-[#FFB800] font-bold">
                                  {formatPrice(other.product.price * other.quantity)}
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="shrink-0 flex items-center gap-1 text-xs text-[#FFB800] font-bold">
                            <span>Ko'rish</span>
                            <ChevronRight className="w-4 h-4" />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

              </div>
            </div>
          ) : (
            /* ============================================================ */
            /* 2-REJIM: MOBILDA 4 USTUN (CHO'ZILMASDAN), KOMPYUTERDA KATTAROQ */
            /* ============================================================ */
            <div className="space-y-4 max-w-[1440px] mx-auto w-full">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <h3 className="text-xs sm:text-base font-black uppercase tracking-wider text-[#0A1931] flex items-center gap-2">
                  <ShoppingCart className="w-4 h-4 sm:w-5 sm:h-5 text-[#0A1931]" />
                  <span>Tanlangan Qurilish Mahsulotlari</span>
                </h3>
                <span className="text-[11px] sm:text-sm text-white font-mono font-bold liquid-glass-filter-card px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg">
                  Jami: {items.length} xil mahsulot
                </span>
              </div>

              {/* Jadval: Mobilda ketma-ket 4 ta ustun yon tarafga cho'zilmasdan, Kompyuterda kattaroq 5 ustun */}
              <div className="w-full overflow-hidden sm:overflow-x-auto rounded-2xl liquid-glass-settings-window text-white">
                <table className="w-full text-left border-collapse table-fixed sm:table-auto">
                  <thead>
                    <tr className="bg-[#071326]/70 border-b border-white/15 text-[8.5px] sm:text-sm font-black uppercase tracking-tight sm:tracking-wider text-sky-200">
                      <th className="hidden sm:table-cell sm:py-4 sm:px-5 text-center sm:w-14 border-r border-white/15">
                        №
                      </th>
                      <th className="py-2.5 px-1.5 sm:py-4 sm:px-5 w-[29%] sm:w-auto border-r border-white/15">
                        <span className="sm:hidden">№ / Mahsulot</span>
                        <span className="hidden sm:inline">Mahsulot Nomi</span>
                      </th>
                      <th className="py-2.5 px-1.5 sm:py-4 sm:px-5 w-[31%] sm:w-auto border-r border-white/15">
                        Ta&apos;minotchi Manzili
                      </th>
                      <th className="py-2.5 px-1 sm:py-4 sm:px-5 w-[19%] sm:w-auto text-right border-r border-white/15">
                        Narxi
                      </th>
                      <th className="py-2.5 px-1 sm:py-4 sm:px-5 w-[21%] sm:w-auto text-center">
                        Miqdori
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/15 text-[9px] sm:text-base bg-transparent">
                    {items.map((item, idx) => {
                      const supplierAddr = getSupplierAddress(item);
                      const cleanSupplierName = String(item.product.supplierName || "Rasmiy Ta'minotchi")
                        .replace(/mas['’`]?uliyati\s+cheklangan\s+jamiyati/gi, '')
                        .replace(/\bMCHJ\b/gi, '')
                        .trim();

                      return (
                        <tr
                          key={item.product.id}
                          onClick={() => {
                            setSelectedProductId(item.product.id);
                            setActiveImageIndex(0);
                          }}
                          className="hover:bg-[#132C54]/75 transition-colors cursor-pointer group"
                          title="Batafsil ma'lumotlarini ko'rish uchun bosing"
                        >
                          {/* Desktopda alohida № ustuni */}
                          <td className="hidden sm:table-cell sm:py-4 sm:px-5 text-center text-[#FFB800] font-mono font-black sm:text-base align-middle border-r border-white/15">
                            {idx + 1}
                          </td>

                          {/* 1-ustun (Mobilda № + Mahsulot Nomi) */}
                          <td className="py-2.5 px-1.5 sm:py-4 sm:px-5 align-middle border-r border-white/15">
                            <div className="flex items-start sm:items-center gap-1 sm:gap-3.5">
                              <img
                                src={item.product.image}
                                alt=""
                                className="w-6 h-6 sm:w-14 sm:h-14 rounded sm:rounded-xl object-cover shrink-0 bg-[#071326] border border-white/20 mt-0.5 sm:mt-0"
                              />
                              <div className="min-w-0 flex-1">
                                <div className="font-black text-white text-[9px] sm:text-base leading-tight break-words group-hover:text-[#FFB800] transition-colors">
                                  <span className="sm:hidden text-[#FFB800] font-mono mr-0.5">
                                    {idx + 1}.
                                  </span>
                                  {item.product.title}
                                </div>
                                <span className="text-[7.5px] sm:text-xs text-[#FFB800] font-mono font-bold block leading-tight mt-0.5 break-words">
                                  {item.product.category}
                                </span>
                              </div>
                            </div>
                          </td>

                          {/* 2-ustun: Ta'minotchi Manzili */}
                          <td className="py-2.5 px-1.5 sm:py-4 sm:px-5 align-middle border-r border-white/15">
                            <div className="space-y-0.5 sm:space-y-1">
                              <div className="font-bold text-white text-[8.5px] sm:text-sm leading-tight break-words">
                                {cleanSupplierName}
                              </div>
                              <div className="flex items-start gap-0.5 sm:gap-1.5 text-[8px] sm:text-xs text-sky-200 leading-tight">
                                <MapPin className="w-2.5 h-2.5 sm:w-4 sm:h-4 text-[#FFB800] shrink-0 mt-0.5" />
                                <span className="break-words">{supplierAddr}</span>
                              </div>
                            </div>
                          </td>

                          {/* 3-ustun: Narxi */}
                          <td className="py-2.5 px-1 sm:py-4 sm:px-5 text-right align-middle border-r border-white/15">
                            <div className="font-black text-[#FFB800] text-[8.5px] sm:text-base font-mono leading-tight break-words">
                              {formatPrice(item.product.price)}
                            </div>
                            <div className="text-[7.5px] sm:text-xs text-sky-200 font-mono leading-tight mt-0.5">
                              1 {item.product.unit}
                            </div>
                          </td>

                          {/* 4-ustun: Miqdori */}
                          <td
                            className="py-2.5 px-1 sm:py-4 sm:px-5 text-center align-middle"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="inline-flex items-center justify-center gap-0.5 sm:gap-2 liquid-glass-filter-card px-1 py-0.5 sm:px-3 sm:py-1.5 rounded-lg">
                              <button
                                type="button"
                                disabled={item.quantity <= Math.max(1, Number(item.product.minOrder) || 1)}
                                onClick={() => {
                                  const minQty = Math.max(1, Number(item.product.minOrder) || 1);
                                  if (item.quantity <= minQty) return;
                                  onUpdateQuantity(item.product.id, Math.max(minQty, item.quantity - 1));
                                }}
                                className={`p-0.5 sm:p-1 rounded ${
                                  item.quantity <= Math.max(1, Number(item.product.minOrder) || 1)
                                    ? 'text-slate-500 opacity-40 cursor-not-allowed'
                                    : 'text-sky-200 hover:text-white cursor-pointer'
                                }`}
                                title="Kamaytirish"
                              >
                                <Minus className="w-2.5 h-2.5 sm:w-4 sm:h-4" />
                              </button>
                              <span className="text-[9px] sm:text-base font-black text-[#FFB800] px-0.5 sm:px-2.5 min-w-[16px] sm:min-w-[32px] text-center font-mono">
                                {item.quantity}
                              </span>
                              <button
                                type="button"
                                onClick={() => onUpdateQuantity(item.product.id, item.quantity + 1)}
                                className="p-0.5 sm:p-1 text-sky-200 hover:text-white rounded cursor-pointer"
                                title="Oshirish"
                              >
                                <Plus className="w-2.5 h-2.5 sm:w-4 sm:h-4" />
                              </button>
                            </div>
                            <div className="text-[7.5px] sm:text-xs text-sky-200 mt-1 font-mono leading-tight">
                              {item.quantity} {item.product.unit}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>

                  {/* Jadval Tagidagi Umumiy Narx Qatori */}
                  <tfoot className="bg-[#071326]/70 border-t border-white/15 font-bold">
                    <tr>
                      <td className="hidden sm:table-cell sm:py-4 sm:px-5 border-r border-white/15" />
                      <td
                        colSpan={2}
                        className="py-2.5 px-1.5 sm:py-4 sm:px-5 text-left text-sky-200 uppercase tracking-tight sm:tracking-wider text-[8.5px] sm:text-sm font-bold border-r border-white/15"
                      >
                        Jami: {items.reduce((s, i) => s + i.quantity, 0)} ta birlik | {items.length} xil
                      </td>
                      <td className="py-2.5 px-1 sm:py-4 sm:px-5 text-right text-[#FFB800] uppercase tracking-tight sm:tracking-wider font-black text-[8.5px] sm:text-sm border-r border-white/15">
                        Umumiy:
                      </td>
                      <td className="py-2.5 px-1 sm:py-4 sm:px-5 text-right text-[9px] sm:text-lg text-[#FFB800] font-mono font-black break-words">
                        {formatPrice(grandTotal)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 p-2.5 rounded-lg bg-red-500/15 text-red-400 border border-red-500/40 text-xs font-black animate-fadeIn">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Footer actions: Liquid Glass */}
        {items.length > 0 && (
          <div className="px-4 sm:px-7 py-3.5 sm:py-4 border-t border-white/15 liquid-glass-search-bar text-white flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-baseline gap-2.5">
              <span className="text-xs sm:text-sm text-sky-200 font-extrabold uppercase tracking-wider">
                Jami Summa:
              </span>
              <span className="text-base sm:text-2xl font-black text-[#FFB800] font-mono tracking-tight">
                {formatPrice(grandTotal)}
              </span>
            </div>

            <div className="flex items-center gap-2.5 sm:gap-3">
              <button
                type="button"
                onClick={onClose}
                className="liquid-glass-btn-navy px-4 sm:px-5 py-2.5 sm:py-3 rounded-xl text-xs sm:text-sm font-extrabold cursor-pointer"
              >
                Bekor qilish
              </button>

              <button
                type="button"
                onClick={handleStartCheckout}
                disabled={loading}
                className="liquid-glass-btn-amber flex items-center gap-2 px-5 sm:px-6 py-2.5 sm:py-3 rounded-xl font-black text-xs sm:text-sm disabled:opacity-50 cursor-pointer shadow-lg"
              >
                <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5 stroke-[2.5]" />
                <span>Buyurtma berish</span>
              </button>
            </div>
          </div>
        )}

      </div>

      {/* 4-bosqichli Jismoniy shaxs buyurtma berish darchasi */}
      {isCheckoutOpen && (
        <CheckoutModal
          isOpen={isCheckoutOpen}
          onClose={() => setIsCheckoutOpen(false)}
          items={items}
          user={user}
          onUserUpdate={onUserUpdate}
          onUpdateQuantity={onUpdateQuantity}
          onRemoveItem={onRemoveItem}
          onClearCart={onClearCart}
          onOrderCompleted={(order) => {
            setIsCheckoutOpen(false);
            onClose();
            onOrderSuccess(order.id);
          }}
          onOpenAuth={onOpenAuth}
        />
      )}

      {/* Katta ekran (Full Screen) rasm ko'rish modali */}
      {fullscreenImage && (
        <div
          className="fixed inset-0 z-[100] w-screen h-screen bg-black/95 backdrop-blur-md flex flex-col items-center justify-center p-4 animate-fadeIn"
          onClick={() => setFullscreenImage(null)}
        >
          <button
            type="button"
            onClick={() => setFullscreenImage(null)}
            className="absolute top-4 right-4 px-4 py-2.5 rounded-xl bg-[#222528] hover:bg-red-600 text-[#F5F5F2] border border-[#51504A] font-bold text-xs sm:text-sm flex items-center gap-2 cursor-pointer shadow-2xl"
          >
            <X className="w-5 h-5" />
            <span>Yopish</span>
          </button>
          <img
            src={fullscreenImage}
            alt="Katta ekran"
            onClick={(e) => e.stopPropagation()}
            className="max-w-[95vw] max-h-[90vh] object-contain rounded-xl border border-[#51504A] shadow-2xl"
          />
        </div>
      )}
    </div>
  );
};
