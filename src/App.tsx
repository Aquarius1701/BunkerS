import React, { useState, useEffect } from 'react';
import { protobufFetch as fetch } from './lib/protobufClient';
import { Navbar } from './components/Navbar';
import { Marketplace } from './components/Marketplace';
import { LogisticsHub } from './components/LogisticsHub';
import { OrdersView } from './components/OrdersView';
import { CartModal } from './components/CartModal';
import { AuthModal } from './components/AuthModal';
import { OrderSuccessModal } from './components/OrderSuccessModal';
import { AdminCabinet } from './components/AdminCabinet';
import { BunkerAdminCabinet } from './components/BunkerAdminCabinet';
import { SupplierCabinet } from './components/SupplierCabinet';
import { CabinetLogsModal } from './components/CabinetLogsModal';
import { GlobalBunkerHub } from './components/GlobalBunkerHub';
import { Product, CartItem, UserProfile, Order, LogisticsVehicle, SubAdminCabinetAccount, SupplierPartner } from './types';
import { INITIAL_PRODUCTS, INITIAL_VEHICLES, MOCK_FAKE_PRODUCT_IDS, MOCK_FAKE_SUPPLIER_IDS } from './data/mockData';
import { isOrderAfterReset, DEFAULT_STATS_RESET_CUTOFF_MS, pickMoreAdvancedOrder, saveOrdersToStorageSafe } from './data/supplierReportsData';
import { auth, db, testConnection, logoutUser } from './lib/firebase';
import { recordCabinetLog } from './lib/cabinetLogs';
import { doc, setDoc, deleteDoc, collection, onSnapshot } from 'firebase/firestore';
import { HardHat, ShieldCheck, Truck, Phone, Mail, MapPin, ShieldAlert, ArrowLeft } from 'lucide-react';
import { getAdminConfig, AdminConfig, getSubAdmins, BUNKER_ADMIN_CREDENTIALS, getBunkerAdminCredentials } from './lib/adminSettings';
import { sendCabinetDeviceHeartbeat, releaseCabinetDeviceLock } from './lib/securityGuard';
import { RealTelegramLogo, RealInstagramLogo, RealYouTubeLogo, RealPhoneLogo } from './components/SocialLogos';
import { initDomLanguageTranslator, useLanguage, hasUserSelectedLanguage, AppLanguage } from './lib/i18n';

// Platformani to'liq 0 holatga keltirish (barcha mahsulotlar, kabinetlar, buyurtmalar, loglar va qoldiqlar 0 holatdan boshlanadi)
try {
  if (typeof window !== 'undefined' && localStorage.getItem('bunkerstroy_platform_zero_reset_v10') !== 'done') {
    localStorage.setItem('bunkerstroy_products', JSON.stringify([]));
    localStorage.setItem('bunkerstroy_suppliers', JSON.stringify([]));
    localStorage.setItem('bunkerstroy_sub_admins_v1', JSON.stringify([]));
    localStorage.setItem('bunkerstroy_vehicles', JSON.stringify([]));
    localStorage.setItem('bunkerstroy_global_partners', JSON.stringify([]));
    localStorage.setItem('bunkerstroy_customers', JSON.stringify([]));
    localStorage.setItem('bunkerstroy_orders', JSON.stringify([]));
    localStorage.setItem('bunkerstroy_b2b_orders', JSON.stringify([]));
    localStorage.setItem('bunkerstroy_transactions', JSON.stringify([]));
    localStorage.setItem('bunkerstroy_logs', JSON.stringify([]));
    localStorage.setItem('bunkerstroy_cabinet_logs', JSON.stringify([]));
    localStorage.setItem('bunkerstroy_search_queries', JSON.stringify([]));
    localStorage.setItem('bunkerstroy_ack_req_problems', JSON.stringify([]));
    localStorage.setItem('bunkerstroy_product_types', JSON.stringify([]));
    localStorage.removeItem('bunkerstroy_cart');
    localStorage.removeItem('bunkerstroy_supplier_seen_orders');
    localStorage.removeItem('bunkerstroy_admin_locked');
    localStorage.removeItem('bunkerstroy_single_admin_config_v2');
    localStorage.removeItem('bunkerstroy_bunker_admin_creds_v1');
    localStorage.removeItem('bunkerstroy_active_user');
    localStorage.setItem('bunkerstroy_active_tab', 'marketplace');
    localStorage.setItem('bunkerstroy_stats_cutoff_ms', String(Date.now()));
    localStorage.setItem('bunkerstroy_platform_zero_reset_v10', 'done');
  }
  // Hozirgi mavjud foydalanuvchi (mijoz) kabinetlarni o'chirish
  if (typeof window !== 'undefined' && localStorage.getItem('bunkerstroy_purge_customers_v12') !== 'done') {
    localStorage.setItem('bunkerstroy_customers', JSON.stringify([]));
    try {
      const rawActive = localStorage.getItem('bunkerstroy_active_user');
      if (rawActive) {
        const parsedActive = JSON.parse(rawActive);
        if (parsedActive && parsedActive.role !== 'bunker_admin' && parsedActive.role !== 'admin' && parsedActive.role !== 'supplier') {
          localStorage.removeItem('bunkerstroy_active_user');
          localStorage.setItem('bunkerstroy_active_tab', 'marketplace');
        }
      }
    } catch {}
    localStorage.setItem('bunkerstroy_purge_customers_v12', 'done');
  }
} catch {}

export default function App() {
  const { lang, setLang } = useLanguage();
  const [isLangPickerOpen, setIsLangPickerOpen] = useState<boolean>(() => !hasUserSelectedLanguage());

  useEffect(() => {
    initDomLanguageTranslator();
  }, []);

  const [user, setUser] = useState<UserProfile | null>(() => {
    try {
      // Tozalash: mijozlar ro'yxatida admin yoki Yelenabe / aaaa qolib ketgan bo'lsa olib tashlash
      const rawCusts = localStorage.getItem('bunkerstroy_customers');
      if (rawCusts) {
        const parsedCusts = JSON.parse(rawCusts);
        if (Array.isArray(parsedCusts)) {
          const cleanedCusts = parsedCusts.filter(
            (c: any) =>
              c &&
              c.role !== 'admin' &&
              c.role !== 'bunker_admin' &&
              c.id !== 'admin-master' &&
              c.id !== 'bunker-admin-master' &&
              c.id !== 'super-admin-master' &&
              String(c.login || '').trim().toLowerCase() !== 'yelenabe' &&
              String(c.login || '').trim().toLowerCase() !== 'aaaa'
          );
          if (cleanedCusts.length !== parsedCusts.length) {
            localStorage.setItem('bunkerstroy_customers', JSON.stringify(cleanedCusts));
          }
        }
      }

      const savedUser = localStorage.getItem('bunkerstroy_active_user');
      if (savedUser) {
        const parsed = JSON.parse(savedUser);
        if (parsed) {
          if (parsed.role === 'bunker_admin') {
            const bunkerCreds = getBunkerAdminCredentials();
            if (parsed.id === 'bunker-admin-master' && parsed.firstName === bunkerCreds.login) {
              return parsed;
            }
            localStorage.removeItem('bunkerstroy_active_user');
            localStorage.setItem('bunkerstroy_active_tab', 'marketplace');
            return null;
          }
          if (parsed.role === 'admin') {
            if (parsed.isSubAdmin) {
              const subAdmins = getSubAdmins();
              const matchedSub = subAdmins.find((sa) => sa.id === parsed.id && sa.status !== 'blocked');
              if (matchedSub) {
                return {
                  ...parsed,
                  displayName: matchedSub.cabinetName,
                  firstName: matchedSub.login,
                  companyName: matchedSub.cabinetName,
                  subAdminPermissions: matchedSub.permissions || [],
                };
              }
              localStorage.removeItem('bunkerstroy_active_user');
              localStorage.setItem('bunkerstroy_active_tab', 'marketplace');
              return null;
            }
            const currentCfg = getAdminConfig();
            const expectedAdminLogin = (currentCfg.login || 'ADMIN.').trim();
            if (
              parsed.id === 'admin-master' &&
              parsed.firstName === expectedAdminLogin
            ) {
              return parsed;
            }
            localStorage.removeItem('bunkerstroy_active_user');
            localStorage.setItem('bunkerstroy_active_tab', 'marketplace');
            return null;
          }
          if (parsed.role === 'supplier') {
            if (parsed.impersonatedByBunkerAdmin || parsed.impersonatedByAdmin) {
              return parsed;
            }
            const savedSupps = localStorage.getItem('bunkerstroy_suppliers');
            const suppList = savedSupps ? JSON.parse(savedSupps) : [];
            const exists = Array.isArray(suppList) && suppList.some((s: any) => s && s.id === parsed.id && !MOCK_FAKE_SUPPLIER_IDS.includes(s.id));
            return exists ? parsed : null;
          }
          const savedCusts = localStorage.getItem('bunkerstroy_customers');
          const custList = savedCusts ? JSON.parse(savedCusts) : [];
          const custExists = Array.isArray(custList) && custList.some((c: any) => c && c.id === parsed.id);
          return custExists ? parsed : null;
        }
      }
    } catch {}
    return null;
  });

  const [customerTheme, setCustomerTheme] = useState<'night' | 'light'>(() => {
    try {
      const saved = localStorage.getItem('bunkerstroy_customer_theme_v2');
      if (saved === 'light' || saved === 'night') return saved;
    } catch {}
    return 'light';
  });

  useEffect(() => {
    const syncTheme = () => {
      try {
        const saved = localStorage.getItem('bunkerstroy_customer_theme_v2');
        if (saved === 'light' || saved === 'night') {
          setCustomerTheme(saved);
        }
      } catch {}
    };
    window.addEventListener('storage', syncTheme);
    window.addEventListener('bunkerstroy-theme-change', syncTheme);
    return () => {
      window.removeEventListener('storage', syncTheme);
      window.removeEventListener('bunkerstroy-theme-change', syncTheme);
    };
  }, []);

  const [activeTab, setActiveTab] = useState<'marketplace' | 'logistics' | 'orders' | 'admin' | 'bunker_admin' | 'supplier' | 'global_bunker'>(() => {
    try {
      const savedTab = localStorage.getItem('bunkerstroy_active_tab');
      if (savedTab === 'bunker_admin') {
        const savedUser = localStorage.getItem('bunkerstroy_active_user');
        if (!savedUser) return 'marketplace';
        const parsed = JSON.parse(savedUser);
        if (!parsed || parsed.role !== 'bunker_admin' || parsed.id !== 'bunker-admin-master') {
          return 'marketplace';
        }
        return 'bunker_admin';
      }
      if (savedTab === 'admin') {
        const savedUser = localStorage.getItem('bunkerstroy_active_user');
        if (!savedUser) return 'marketplace';
        const parsed = JSON.parse(savedUser);
        if (!parsed || parsed.role !== 'admin') return 'marketplace';
        if (parsed.isSubAdmin) {
          const subAdmins = getSubAdmins();
          const matchedSub = subAdmins.find((sa) => sa.id === parsed.id && sa.status !== 'blocked');
          return matchedSub ? 'admin' : 'marketplace';
        }
        const currentCfg = getAdminConfig();
        if (parsed.id !== 'admin-master' || parsed.firstName !== (currentCfg.login || 'ADMIN.').trim()) {
          return 'marketplace';
        }
        return 'admin';
      }
      if (savedTab && ['marketplace', 'logistics', 'orders', 'admin', 'bunker_admin', 'supplier', 'global_bunker'].includes(savedTab)) {
        return savedTab as any;
      }
    } catch {}
    return 'marketplace';
  });

  // Sync activeTab to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('bunkerstroy_active_tab', activeTab);
    } catch {}
  }, [activeTab]);

  // Sync user to localStorage, verify role on server, & maintain single-device active cabinet session lock
  useEffect(() => {
    try {
      if (user) {
        const safeUser = { ...user } as any;
        delete safeUser.password;
        delete safeUser.emergencyPassword;
        localStorage.setItem('bunkerstroy_active_user', JSON.stringify(safeUser));
      } else {
        localStorage.removeItem('bunkerstroy_active_user');
      }
    } catch {}

    if (!user) return;

    // 7-bosqich: Admin va oddiy foydalanuvchilarning huquqlarini server tomonidan tekshirish
    // Admin yoki Bunker Admin boshqa kabinetga o'tganda (impersonatedByAdmin / impersonatedByBunkerAdmin) chiqarib yuborilmaydi
    if (!user.impersonatedByBunkerAdmin && !user.impersonatedByAdmin) {
      fetch('/api/auth/session', { credentials: 'include' })
        .then((r) => r.json())
        .then((sess) => {
          if (sess && sess.authenticated) {
            const isServerAdmin = sess.role === 'admin' || sess.role === 'bunker_admin';
            if (sess.role && sess.role !== user.role && !isServerAdmin) {
              setUser(null);
              setActiveTab('marketplace');
              localStorage.removeItem('bunkerstroy_active_user');
              localStorage.setItem('bunkerstroy_active_tab', 'marketplace');
            }
          }
        })
        .catch(() => {});
    }

    const loginKey = (user.firstName || user.email?.split('@')[0] || user.displayName || '').trim();
    sendCabinetDeviceHeartbeat(loginKey, user.id);

    const interval = setInterval(() => {
      sendCabinetDeviceHeartbeat(loginKey, user.id);
    }, 10000);

    const handlePageHide = () => {
      releaseCabinetDeviceLock(loginKey, user.id);
    };
    window.addEventListener('beforeunload', handlePageHide);
    window.addEventListener('pagehide', handlePageHide);

    return () => {
      clearInterval(interval);
      window.removeEventListener('beforeunload', handlePageHide);
      window.removeEventListener('pagehide', handlePageHide);
    };
  }, [user]);

  const [adminConfig, setAdminConfig] = useState<AdminConfig>(() => getAdminConfig());
  const [products, setProducts] = useState<Product[]>(() => {
    try {
      const saved = localStorage.getItem('bunkerstroy_products');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed.filter((p: Product) => p && p.id && !MOCK_FAKE_PRODUCT_IDS.includes(p.id));
        }
      }
      return [];
    } catch {
      return [];
    }
  });
  const [vehicles, setVehicles] = useState<LogisticsVehicle[]>(INITIAL_VEHICLES);
  const [orders, setOrders] = useState<Order[]>([]);

  const [cart, setCart] = useState<CartItem[]>(() => {
    try {
      localStorage.removeItem('bunkerstroy_cart');
      return [];
    } catch {
      return [];
    }
  });
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Modals state
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [authInitialMode, setAuthInitialMode] = useState<'login' | 'register'>('login');
  const [lastOrderId, setLastOrderId] = useState<string | null>(null);
  const [isOrderSuccessOpen, setIsOrderSuccessOpen] = useState(false);
  const [isLogsModalOpen, setIsLogsModalOpen] = useState(false);

  // Faqat mavjud ta'minotchi kabinetlarga tegishli mahsulotlarni filtrlash (o'chirilgan kabinet mahsulotlari ko'rinmaydi)
  const activeSupplierProducts = React.useMemo(() => {
    try {
      const savedSupps = localStorage.getItem('bunkerstroy_suppliers');
      const suppList: any[] = savedSupps ? JSON.parse(savedSupps) : [];
      if (!Array.isArray(suppList) || suppList.length === 0) return [];
      return products.filter((p) => {
        if (!p || !p.id) return false;
        return suppList.some(
          (s) =>
            s &&
            ((p.supplierId && s.id === p.supplierId) ||
              (p.supplierInn && s.inn && String(s.inn).replace(/\D/g, '') === String(p.supplierInn).replace(/\D/g, '')) ||
              (p.supplierName &&
                s.companyName &&
                String(s.companyName).trim().toLowerCase() === String(p.supplierName).trim().toLowerCase()))
        );
      });
    } catch {
      return products;
    }
  }, [products]);

  // B2B Bunker uchun B2B ta'minotchilar yuklagan mahsulotlar ro'yxati (faqat B2B Bunkerda ko'rinadi)
  const b2bProducts = React.useMemo(() => {
    try {
      const savedSupps = localStorage.getItem('bunkerstroy_suppliers');
      const suppList: any[] = savedSupps ? JSON.parse(savedSupps) : [];
      const b2bMatched = activeSupplierProducts.filter((p) => {
        if (p.supplierCabinetType === 'manufacturer') return true;
        if (p.supplierCabinetType === 'partner') return false;
        const matchedSup = Array.isArray(suppList)
          ? (p.supplierId ? suppList.find((s) => s && s.id === p.supplierId) : null) ||
            suppList.find(
              (s) =>
                s &&
                ((p.supplierInn && s.inn && s.inn === p.supplierInn) ||
                  (p.supplierName &&
                    s.companyName &&
                    String(s.companyName).trim().toLowerCase() === String(p.supplierName).trim().toLowerCase()))
            )
          : null;
        if (matchedSup) {
          return matchedSup.cabinetType === 'manufacturer';
        }
        return false;
      });
      return b2bMatched;
    } catch {
      return activeSupplierProducts.filter((p) => p.supplierCabinetType === 'manufacturer');
    }
  }, [activeSupplierProducts]);

  // Bosh paneldagi "Mahsulotlar" bo'limi uchun faqat B2C mahsulotlar (B2B Bunker mahsulotlari kirmaydi)
  const b2cProducts = React.useMemo(() => {
    const b2bIds = new Set(b2bProducts.map((p) => p.id));
    return activeSupplierProducts.filter((p) => !b2bIds.has(p.id));
  }, [activeSupplierProducts, b2bProducts]);

  // Fullscreen change listener
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
    };
  }, []);

  // Admin config real-time update listener
  useEffect(() => {
    const handleAdminConfigUpdate = (e: any) => {
      if (e.detail) {
        setAdminConfig(e.detail);
      } else {
        setAdminConfig(getAdminConfig());
      }
    };
    window.addEventListener('bunkerstroy_admin_config_updated', handleAdminConfigUpdate);
    return () => {
      window.removeEventListener('bunkerstroy_admin_config_updated', handleAdminConfigUpdate);
    };
  }, []);

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        if (document.documentElement.requestFullscreen) {
          await document.documentElement.requestFullscreen();
        } else if ((document.documentElement as any).webkitRequestFullscreen) {
          await (document.documentElement as any).webkitRequestFullscreen();
        }
      } else {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        } else if ((document as any).webkitExitFullscreen) {
          await (document as any).webkitExitFullscreen();
        }
      }
    } catch (err) {
      console.warn('Fullscreen request:', err);
    }
  };

  // Sync cart to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('bunkerstroy_cart', JSON.stringify(cart));
    } catch {}
  }, [cart]);

  // Sync products to localStorage (quota-safe so customer & supplier credentials always have space)
  useEffect(() => {
    try {
      const serialized = JSON.stringify(products);
      if (serialized.length < 2200000) {
        localStorage.setItem('bunkerstroy_products', serialized);
      } else {
        const lightProducts = products.map((p) => ({
          ...p,
          images: p.images ? p.images.slice(0, 2) : undefined,
          detailBlocks: undefined,
        }));
        localStorage.setItem('bunkerstroy_products', JSON.stringify(lightProducts));
      }
    } catch {
      try {
        const minimalProducts = products.map((p) => ({
          ...p,
          images: undefined,
          detailBlocks: undefined,
        }));
        localStorage.setItem('bunkerstroy_products', JSON.stringify(minimalProducts));
      } catch {}
    }
  }, [products]);

  // Test Firebase connection & sync real products and orders
  useEffect(() => {
    testConnection();

    // Sync products from localStorage changes (e.g. when Admin deletes a supplier cabinet)
    const handleStorageSync = () => {
      try {
        const saved = localStorage.getItem('bunkerstroy_products');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) {
            setProducts(parsed.filter((p: Product) => p && p.id && !MOCK_FAKE_PRODUCT_IDS.includes(p.id)));
          }
        }
      } catch {}
    };
    window.addEventListener('storage', handleStorageSync);
    window.addEventListener('bunkerstroy_products_updated', handleStorageSync);

    // Sync products from Firestore (filter out and delete any old mock, pre-reset, or deleted-supplier products)
    const unsubscribeProducts = onSnapshot(
      collection(db, 'products'),
      (snapshot) => {
        const needFullZeroReset = localStorage.getItem('bunkerstroy_firestore_zero_v10') !== 'done';
        let currentSupps: any[] = [];
        try {
          const rawSupps = localStorage.getItem('bunkerstroy_suppliers');
          currentSupps = rawSupps ? JSON.parse(rawSupps) : [];
        } catch {}

        const fetched: Product[] = [];
        snapshot.forEach((d) => {
          const data = d.data() as Product;
          const hasOwnerSupplier =
            Array.isArray(currentSupps) &&
            currentSupps.some(
              (s) =>
                s &&
                ((data?.supplierId && s.id === data.supplierId) ||
                  (data?.supplierInn && s.inn && String(s.inn).replace(/\D/g, '') === String(data.supplierInn).replace(/\D/g, '')) ||
                  (data?.supplierName &&
                    s.companyName &&
                    String(s.companyName).trim().toLowerCase() === String(data.supplierName).trim().toLowerCase()))
            );

          if (needFullZeroReset || (data && data.id && MOCK_FAKE_PRODUCT_IDS.includes(data.id)) || !hasOwnerSupplier) {
            deleteDoc(doc(db, 'products', d.id)).catch(() => {});
          } else if (data && data.id) {
            fetched.push(data);
          }
        });
        if (needFullZeroReset) {
          localStorage.setItem('bunkerstroy_firestore_zero_v10', 'done');
        }
        setProducts((prev) => {
          const fetchedIds = new Set(fetched.map((f) => f.id));
          const localOnly = prev.filter((p) => {
            if (!p || !p.id || fetchedIds.has(p.id) || MOCK_FAKE_PRODUCT_IDS.includes(p.id)) return false;
            return (
              Array.isArray(currentSupps) &&
              currentSupps.some(
                (s) =>
                  s &&
                  ((p.supplierId && s.id === p.supplierId) ||
                    (p.supplierInn && s.inn && String(s.inn).replace(/\D/g, '') === String(p.supplierInn).replace(/\D/g, '')) ||
                    (p.supplierName &&
                      s.companyName &&
                      String(s.companyName).trim().toLowerCase() === String(p.supplierName).trim().toLowerCase()))
              )
            );
          });
          return [...localOnly, ...fetched];
        });
      },
      () => {}
    );

    // One-time cleanup of old customer users in Firestore
    if (localStorage.getItem('bunkerstroy_firestore_customers_purge_v12') !== 'done') {
      const unsubUsers = onSnapshot(
        collection(db, 'users'),
        (snap) => {
          snap.forEach((d) => {
            const uData = d.data() as any;
            if (!uData || (uData.role !== 'supplier' && uData.role !== 'admin' && uData.role !== 'bunker_admin')) {
              deleteDoc(doc(db, 'users', d.id)).catch(() => {});
            }
          });
          localStorage.setItem('bunkerstroy_firestore_customers_purge_v12', 'done');
          unsubUsers();
        },
        () => {}
      );
    }

    // Sync all orders for admin view (and purge any pre-reset orders)
    const unsubscribeOrders = onSnapshot(
      collection(db, 'orders'),
      (snapshot) => {
        const fetched: Order[] = [];
        snapshot.forEach((d) => {
          const ord = d.data() as Order;
          if (!isOrderAfterReset(ord)) {
            deleteDoc(doc(db, 'orders', d.id)).catch(() => {});
          } else {
            fetched.push(ord);
          }
        });
        fetched.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        try {
          const savedLocal = localStorage.getItem('bunkerstroy_orders');
          const localList: Order[] = savedLocal ? JSON.parse(savedLocal) : [];
          const map = new Map<string, Order>();
          fetched.forEach((o) => {
            if (o && o.id) map.set(o.id, o);
          });
          if (Array.isArray(localList)) {
            localList.forEach((lo) => {
              if (!lo || !lo.id || !isOrderAfterReset(lo)) return;
              const ex = map.get(lo.id);
              if (!ex) {
                map.set(lo.id, lo);
              } else {
                map.set(lo.id, pickMoreAdvancedOrder(lo, ex));
              }
            });
          }
          const merged = Array.from(map.values()).sort(
            (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          );
          setOrders(merged);
          saveOrdersToStorageSafe(merged);
          window.dispatchEvent(new CustomEvent('bunkerstroy_orders_updated'));
        } catch {
          setOrders(fetched);
        }
      },
      () => {}
    );

    return () => {
      window.removeEventListener('storage', handleStorageSync);
      window.removeEventListener('bunkerstroy_products_updated', handleStorageSync);
      unsubscribeProducts();
      unsubscribeOrders();
    };
  }, []);

  const handleAddToCart = (product: Product, quantity: number = 1) => {
    const isUnlimited = Boolean(product.unlimitedStock) || (typeof product.stock === 'number' && product.stock >= 999999999);
    const maxStock = isUnlimited ? 999999999 : typeof product.stock === 'number' ? Math.max(0, product.stock) : 0;
    if (maxStock <= 0) return;
    const minOrderQty = Math.max(1, Number(product.minOrder) || 1);
    const initialQty = Math.max(minOrderQty, quantity);
    setCart((prev) => {
      const existing = prev.find((i) => i.product.id === product.id);
      if (existing) {
        const nextQty = Math.max(minOrderQty, Math.min(maxStock, existing.quantity + quantity));
        return prev.map((i) =>
          i.product.id === product.id ? { ...i, product, quantity: nextQty } : i
        );
      }
      return [...prev, { product, quantity: Math.min(maxStock, initialQty) }];
    });
  };

  const handleUpdateQuantity = (productId: string, quantity: number) => {
    setCart((prev) =>
      prev.map((i) => {
        if (i.product.id !== productId) return i;
        const latestProd = products.find((p) => p.id === productId) || i.product;
        const isUnlimited = Boolean(latestProd.unlimitedStock) || (typeof latestProd.stock === 'number' && latestProd.stock >= 999999999);
        const maxStock = isUnlimited ? 999999999 : typeof latestProd.stock === 'number' ? Math.max(0, latestProd.stock) : i.quantity;
        const minOrderQty = Math.max(1, Number(latestProd.minOrder) || Number(i.product.minOrder) || 1);
        const safeQty = Math.max(minOrderQty, Math.min(maxStock, quantity));
        return { ...i, product: latestProd, quantity: safeQty };
      })
    );
  };

  const handleRemoveItem = (productId: string) => {
    setCart((prev) => prev.filter((i) => i.product.id !== productId));
  };

  const handleClearCart = () => {
    setCart([]);
    try {
      localStorage.removeItem('bunkerstroy_cart');
    } catch {}
  };

  // Mijoz kabinetiga kirish (yaratilgandan so'ng) va chiqish uchun maxsus Loading Page holati
  const [customerLoadingState, setCustomerLoadingState] = useState<'entering' | 'exiting' | null>(null);

  const handleReturnToBunkerAdmin = () => {
    if (user?.impersonatedByAdmin && user?.impersonatorAdminProfile) {
      setUser(user.impersonatorAdminProfile);
      setActiveTab('admin');
      return;
    }
    const bunkerCreds = getBunkerAdminCredentials();
    const bunkerAdminProfile: UserProfile = {
      id: 'bunker-admin-master',
      email: 'bunker-admin@bunkerstroy.uz',
      displayName: 'Bunker Admin',
      firstName: bunkerCreds.login,
      role: 'bunker_admin',
      phone: '+998 71 200 00 50',
      companyName: 'BunkerStroy Bunker Admin Boshqaruvi',
      createdAt: new Date().toISOString(),
    };
    setUser(bunkerAdminProfile);
    setActiveTab('bunker_admin');
  };

  const handleEnterSupplierCabinetFromAdmin = (sup: SupplierPartner, fromBunkerAdmin: boolean) => {
    const supplierProfile: UserProfile = {
      id: sup.id,
      email: sup.email || `${sup.login}@bunkerstroy.uz`,
      displayName: sup.companyName,
      firstName: sup.login || sup.name,
      role: 'supplier',
      cabinetType: sup.cabinetType || 'partner',
      phone: sup.phone,
      companyName: sup.companyName,
      inn: sup.inn,
      region: sup.region,
      district: sup.district,
      createdAt: sup.createdAt || new Date().toISOString(),
      impersonatedByBunkerAdmin: fromBunkerAdmin,
      impersonatedByAdmin: !fromBunkerAdmin,
      impersonatorAdminProfile: user || undefined,
    };
    setUser(supplierProfile);
    setActiveTab('supplier');
  };

  const handleLogout = async () => {
    const isCustomerUser = Boolean(
      user && user.role !== 'admin' && user.role !== 'bunker_admin' && user.role !== 'supplier'
    );

    if (user) {
      const loginKey = (user.firstName || user.email?.split('@')[0] || user.displayName || '').trim();
      releaseCabinetDeviceLock(loginKey, user.id);
      const isAdminImpersonating = Boolean(user.impersonatedByBunkerAdmin || user.impersonatedByAdmin);
      if (!isAdminImpersonating) {
        recordCabinetLog({
          userId: user.id,
          userLogin: user.firstName || user.email || user.displayName,
          userName: user.companyName || user.displayName,
          action: 'logout',
          actionLabel: 'Kabinetdan chiqildi',
          details: 'Foydalanuvchi shaxsiy kabinetidan chiqdi.',
        });
      }
    }

    if (isCustomerUser) {
      setCustomerLoadingState('exiting');
      setTimeout(async () => {
        await logoutUser();
        setUser(null);
        setActiveTab('marketplace');
        try {
          localStorage.removeItem('bunkerstroy_active_user');
          localStorage.removeItem('bunkerstroy_active_tab');
        } catch {}
        setCustomerLoadingState(null);
      }, 1500);
      return;
    }

    await logoutUser();
    setUser(null);
    setActiveTab('marketplace');
    try {
      localStorage.removeItem('bunkerstroy_active_user');
      localStorage.removeItem('bunkerstroy_active_tab');
    } catch {}
  };

  const totalCartCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  // Faqat mijoz kabineti uchun Loading Page (Kabinet yaratilganda va kabinetdan chiqish bosilganda)
  if (customerLoadingState) {
    return (
      <div className="min-h-screen w-full bg-white text-[#374151] flex items-center justify-center p-4 font-sans">
        <div className="bg-[#F3F4F6] border-2 border-[#D1D5DB] rounded-2xl max-w-md w-full p-8 shadow-xl relative text-center space-y-6 anim-part-12">
          <div className="absolute top-2.5 left-2.5 industrial-rivet" />
          <div className="absolute top-2.5 right-2.5 industrial-rivet" />
          <div className="absolute bottom-2.5 left-2.5 industrial-rivet" />
          <div className="absolute bottom-2.5 right-2.5 industrial-rivet" />

          <div className="relative w-20 h-20 rounded-2xl bg-white border-2 border-[#FFB800] flex items-center justify-center mx-auto shadow-md">
            <HardHat className="w-10 h-10 text-[#FFB800] animate-bounce stroke-[2.2]" />
          </div>

          <div className="space-y-2">
            <h2 className="text-xl sm:text-2xl font-black tracking-wider text-[#374151]">
              <span className="text-[#D97706]">BUNKER</span> STROY
            </h2>
            <p className="text-sm font-bold text-[#D97706] font-mono uppercase tracking-wider">
              {customerLoadingState === 'entering'
                ? 'Shaxsiy Kabinetingiz Ochilmoqda...'
                : 'Kabinetdan Chiqilmoqda...'}
            </p>
            <p className="text-xs text-[#6B7280] max-w-xs mx-auto leading-relaxed">
              {customerLoadingState === 'entering'
                ? 'Bunker, Global Bunker, Savat, Buyurtmalarim va Sozlamalar bo‘limlari tayyorlanmoqda...'
                : 'Mijoz kabineti xavfsiz yopilmoqda, bosh sahifaga qaytilmoqda...'}
            </p>
          </div>

          <div className="w-full h-2.5 bg-white rounded-full overflow-hidden border border-[#D1D5DB] p-0.5">
            <div className="h-full bg-[#FFB800] rounded-full animate-pulse w-full" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full flex flex-col font-sans bg-white text-[#374151] selection:bg-[#FFB800] selection:text-[#374151] transition-colors duration-300">
      
      {activeTab === 'bunker_admin' && user?.role === 'bunker_admin' ? (
        <BunkerAdminCabinet
          currentUser={user}
          onGoToShop={() => setActiveTab('marketplace')}
          onLogout={handleLogout}
          onMainAdminConfigChange={(newCfg) => setAdminConfig(newCfg)}
          onEnterMainAdminCabinet={() => {
            const currentCfg = getAdminConfig();
            const currentAdminLogin = (currentCfg.login || 'ADMIN.').trim();
            const mainAdminProfile: UserProfile = {
              id: 'admin-master',
              email: `${currentAdminLogin.toLowerCase()}@bunkerstroy.uz`,
              displayName: 'Bosh Admin',
              firstName: currentAdminLogin,
              role: 'admin',
              phone: '+998 71 200 00 50',
              companyName: 'BunkerStroy Bosh Boshqarmasi',
              createdAt: new Date().toISOString(),
              isSubAdmin: false,
              impersonatedByBunkerAdmin: true,
            };
            setUser(mainAdminProfile);
            setActiveTab('admin');
          }}
          onEnterSubAdminCabinet={(subAdmin: SubAdminCabinetAccount) => {
            const subAdminProfile: UserProfile = {
              id: subAdmin.id,
              email: `${subAdmin.login.toLowerCase()}@bunkerstroy.uz`,
              displayName: subAdmin.cabinetName,
              firstName: subAdmin.login,
              role: 'admin',
              phone: '+998 71 200 00 50',
              companyName: subAdmin.cabinetName,
              createdAt: subAdmin.createdAt || new Date().toISOString(),
              isSubAdmin: true,
              subAdminId: subAdmin.id,
              subAdminPermissions: subAdmin.permissions || [],
              impersonatedByBunkerAdmin: true,
            };
            setUser(subAdminProfile);
            setActiveTab('admin');
          }}
          onEnterSupplierCabinet={(sup: SupplierPartner) => handleEnterSupplierCabinetFromAdmin(sup, true)}
        />
      ) : activeTab === 'admin' && user?.role === 'admin' ? (
        <AdminCabinet
          currentUser={user}
          onGoToShop={() => setActiveTab('marketplace')}
          onLogout={handleLogout}
          onConfigChange={(newCfg) => {
            setAdminConfig(newCfg);
            setUser((prev) =>
              prev && prev.role === 'admin' && !prev.isSubAdmin
                ? { ...prev, firstName: newCfg.login, email: `${newCfg.login.toLowerCase()}@bunkerstroy.uz` }
                : prev
            );
          }}
          cartCount={totalCartCount}
          onOpenCart={() => setIsCartOpen(true)}
          onOpenAuth={() => setIsAuthOpen(true)}
          onReturnToBunkerAdmin={user.impersonatedByBunkerAdmin ? handleReturnToBunkerAdmin : undefined}
          onEnterSupplierCabinet={(sup: SupplierPartner) => handleEnterSupplierCabinetFromAdmin(sup, false)}
        />
      ) : activeTab === 'supplier' && user ? (
        <div className="flex flex-col min-h-screen bg-[#071326]">
          {(user.impersonatedByBunkerAdmin || user.impersonatedByAdmin) && (
            <div className="bg-[#2e073f] border-b-2 border-fuchsia-400 px-4 py-2 flex items-center justify-between text-white z-50">
              <div className="flex items-center gap-2 text-xs font-bold">
                <ShieldCheck className="w-4 h-4 text-fuchsia-300" />
                <span>
                  Admin ({user.impersonatorAdminProfile?.firstName || 'ADMIN'}) orqali <span className="text-[#FFB800]">{user.companyName || user.displayName}</span> kabinetiga o‘tildi
                </span>
              </div>
              <button
                onClick={handleReturnToBunkerAdmin}
                className="px-3 py-1 rounded-lg bg-[#FFB800] hover:bg-[#FFC928] text-[#071326] text-xs font-black uppercase tracking-wider flex items-center gap-1.5 cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Admin kabinetga qaytish</span>
              </button>
            </div>
          )}
          <SupplierCabinet
            currentUser={user}
            products={products}
            onAddProduct={(newProd) => {
              const cleanProd: Product = JSON.parse(JSON.stringify(newProd));
              setProducts((prev) => {
                const next = [cleanProd, ...prev.filter((p) => p.id !== cleanProd.id)];
                try {
                  localStorage.setItem('bunkerstroy_products', JSON.stringify(next));
                } catch {}
                return next;
              });
              try {
                setDoc(doc(db, 'products', cleanProd.id), cleanProd, { merge: true }).catch(() => {});
              } catch {}
            }}
            onDeleteProduct={(id) => {
              setProducts((prev) => {
                const next = prev.filter((p) => p.id !== id);
                try {
                  localStorage.setItem('bunkerstroy_products', JSON.stringify(next));
                } catch {}
                return next;
              });
              try {
                deleteDoc(doc(db, 'products', id)).catch(() => {});
              } catch {}
            }}
            onGoToShop={() => setActiveTab('marketplace')}
            onLogout={handleLogout}
          />
        </div>
      ) : activeTab === 'orders' && user ? (
        <OrdersView
          user={user}
          products={products}
          onAddToCart={handleAddToCart}
          onOpenAuth={() => setIsAuthOpen(true)}
          onGoToShop={() => setActiveTab('marketplace')}
          onLogout={handleLogout}
          cart={cart}
          onUpdateQuantity={handleUpdateQuantity}
          onRemoveItem={handleRemoveItem}
          onClearCart={handleClearCart}
          onUserUpdate={(updatedUser) => setUser(updatedUser)}
        />
      ) : (
        <>
          {/* Main Navbar */}
          <Navbar
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            cartCount={totalCartCount}
            onOpenCart={() => setIsCartOpen(true)}
            isCartOpen={isCartOpen}
            user={user}
            onOpenAuth={() => {
              setAuthInitialMode('login');
              setIsAuthOpen(true);
            }}
            onLogout={handleLogout}
            onOpenLogsModal={() => setIsLogsModalOpen(true)}
            logoUrl={adminConfig.logoUrl}
            telegram={adminConfig.telegram}
            instagram={adminConfig.instagram}
            phone={adminConfig.phone}
          />

          {/* Main Content Body (Full-Screen White Background) */}
          <main className="flex-1 w-full mt-3 sm:mt-0 px-2 sm:px-6 lg:px-10 pt-2 sm:pt-6 pb-8 sm:pb-12 bg-white text-black transition-colors duration-300">
            {activeTab === 'marketplace' && (
              <Marketplace
                products={b2cProducts}
                onAddToCart={handleAddToCart}
                currentUser={user}
              />
            )}

            {activeTab === 'logistics' && <LogisticsHub />}
            {activeTab === 'global_bunker' && (
              <Marketplace
                products={b2bProducts}
                onAddToCart={handleAddToCart}
                currentUser={user}
              />
            )}

            {activeTab === 'orders' && (
              <OrdersView
                user={user}
                products={products}
                onAddToCart={handleAddToCart}
                onOpenAuth={() => {
                  setAuthInitialMode('login');
                  setIsAuthOpen(true);
                }}
                onGoToShop={() => setActiveTab('marketplace')}
                onLogout={handleLogout}
                cart={cart}
                onUpdateQuantity={handleUpdateQuantity}
                onRemoveItem={handleRemoveItem}
                onClearCart={handleClearCart}
                onUserUpdate={(updatedUser) => setUser(updatedUser)}
              />
            )}
          </main>

          {/* Footer - Bosh panelda Tyomniy Siniy ko'rinishda va Mobilda 'Kirish' tugmasi bilan */}
          {(activeTab === 'marketplace' || activeTab === 'global_bunker') && (
            <footer className="bg-gradient-to-b from-[#0A1931] to-[#071326] border-t border-[#1E3A6D] text-white text-[9px] sm:text-[10px] pt-1.5 pb-14 sm:py-2 mt-auto">
              <div className="w-full px-2.5 sm:px-6 lg:px-10 flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5">
                  <span className="font-bold text-[8px] sm:text-[9px] uppercase tracking-wider text-[#FFB800]">
                    Tezkor Havolalar:
                  </span>
                  <ul className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[9px] sm:text-[10px] text-[#E5E7EB] font-semibold">
                    <li><button onClick={() => setActiveTab('marketplace')} className="hover:text-[#FFB800] cursor-pointer">Mahsulotlar</button></li>
                    <li><button onClick={() => setActiveTab('global_bunker')} className="hover:text-[#FFB800] cursor-pointer">Zavod Mahsulotlari</button></li>
                    <li><button onClick={() => setActiveTab('logistics')} className="hover:text-[#FFB800] cursor-pointer">Biz Haqimizda</button></li>
                    <li><button onClick={() => setActiveTab('logistics')} className="hover:text-[#FFB800] cursor-pointer">Biznes Hamkor Bo‘lish</button></li>
                    <li>
                      <button
                        onClick={() => { setAuthInitialMode('login'); setIsAuthOpen(true); }}
                        className="hover:text-white text-[#FFB800] font-bold cursor-pointer"
                      >
                        <span className="sm:hidden">Kirish</span>
                        <span className="hidden sm:inline">Kabinetga Kirish</span>
                      </button>
                    </li>
                  </ul>
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-[8px] sm:text-[9px] uppercase tracking-wider text-[#FFB800]">
                      Ijtimoiy tarmoqlar:
                    </span>
                    <div className="flex items-center gap-1">
                      <a
                        href={
                          adminConfig.telegram
                            ? adminConfig.telegram.startsWith('http')
                              ? adminConfig.telegram
                              : `https://t.me/${adminConfig.telegram.replace(/^@/, '')}`
                            : 'https://t.me/bunkerstroy_uz'
                        }
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Telegram"
                        aria-label="Telegram"
                      >
                        <RealTelegramLogo className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
                      </a>

                      <a
                        href={
                          adminConfig.instagram
                            ? adminConfig.instagram.startsWith('http')
                              ? adminConfig.instagram
                              : `https://instagram.com/${adminConfig.instagram.replace(/^@/, '')}`
                            : 'https://instagram.com/bunkerstroy.uz'
                        }
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Instagram"
                        aria-label="Instagram"
                      >
                        <RealInstagramLogo className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
                      </a>

                      <a
                        href={
                          adminConfig.youtube
                            ? adminConfig.youtube.startsWith('http')
                              ? adminConfig.youtube
                              : `https://youtube.com/${adminConfig.youtube}`
                            : 'https://youtube.com/@bunkerstroy'
                        }
                        target="_blank"
                        rel="noopener noreferrer"
                        title="YouTube"
                        aria-label="YouTube"
                      >
                        <RealYouTubeLogo className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
                      </a>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 pl-2.5 border-l border-[#1E3A6D]/80">
                    <span className="font-bold text-[8px] sm:text-[9px] uppercase tracking-wider text-[#FFB800]">
                      Aloqa uchun:
                    </span>
                    <div className="flex items-center gap-1">
                      <a
                        href={`tel:${(adminConfig.phone || '+998 (71) 200-00-50').replace(/[^0-9+]/g, '')}`}
                        title={`Telefon: ${adminConfig.phone || '+998 (71) 200-00-50'}`}
                        aria-label="Telefon"
                      >
                        <RealPhoneLogo className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
                      </a>

                      <a
                        href={
                          (adminConfig.telegram2 || adminConfig.telegram)
                            ? (adminConfig.telegram2 || adminConfig.telegram).startsWith('http')
                              ? (adminConfig.telegram2 || adminConfig.telegram)
                              : `https://t.me/${(adminConfig.telegram2 || adminConfig.telegram).replace(/^@/, '')}`
                            : 'https://t.me/bunkerstroy_uz'
                        }
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Telegram orqali aloqa"
                        aria-label="Telegram orqali aloqa"
                      >
                        <RealTelegramLogo className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            </footer>
          )}
        </>
      )}

      {/* Cart Modal */}
      <CartModal
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        items={cart}
        onUpdateQuantity={handleUpdateQuantity}
        onRemoveItem={handleRemoveItem}
        onClearCart={handleClearCart}
        user={user}
        onUserUpdate={setUser}
        logoUrl={adminConfig.logoUrl}
        onNavigateTab={(tab) => {
          setIsCartOpen(false);
          setActiveTab(tab);
        }}
        onOpenAuth={(mode) => {
          setIsCartOpen(false);
          setAuthInitialMode(mode || 'register');
          setIsAuthOpen(true);
        }}
        onOrderSuccess={(orderId) => {
          setLastOrderId(orderId);
          setIsOrderSuccessOpen(true);
        }}
      />

      {/* Auth Modal with Login & Password + Bosh Admin & Bunker Admin Credentials */}
      <AuthModal
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
        user={user}
        initialMode={authInitialMode}
        onUserChange={(updatedUser, isNewCabinet) => {
          setUser(updatedUser);
          if (updatedUser.role === 'bunker_admin') {
            setActiveTab('bunker_admin');
          } else if (updatedUser.role === 'admin') {
            setActiveTab('admin');
          } else if (updatedUser.role === 'supplier') {
            setActiveTab('supplier');
          } else {
            // Mijoz kabineti uchun Loading Page (yaratishdan so'ng kabinetga kirilguncha)
            if (isNewCabinet) {
              setCustomerLoadingState('entering');
              setActiveTab('orders');
              setTimeout(() => {
                setCustomerLoadingState(null);
              }, 1600);
            } else {
              setActiveTab('orders');
            }
          }
        }}
        onAdminLogin={() => {
          setActiveTab('admin');
        }}
        onSupplierLogin={() => {
          setActiveTab('supplier');
        }}
      />

      {/* Order Success Modal */}
      <OrderSuccessModal
        isOpen={isOrderSuccessOpen}
        orderId={lastOrderId}
        onClose={() => setIsOrderSuccessOpen(false)}
        onViewOrders={() => {
          setIsOrderSuccessOpen(false);
          setActiveTab(user?.role === 'admin' ? 'admin' : 'orders');
        }}
      />

      {/* BunkerStroy 3 marta bosilganda ochiladigan Kabinet Xavfsizlik & Faollik Loglari */}
      <CabinetLogsModal
        isOpen={isLogsModalOpen}
        onClose={() => setIsLogsModalOpen(false)}
        currentUser={user}
      />

      {/* Ilk kirishda Til tanlash oynasi (ortiqcha yozuvlarsiz) */}
      {isLangPickerOpen && (
        <div className="fixed inset-0 z-[120] bg-[#071326]/75 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-sm rounded-2xl p-5 liquid-glass-settings-window text-white shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="w-12 h-12 rounded-2xl bg-[#FFB800] text-[#071326] font-black text-xl flex items-center justify-center mx-auto mb-4 shadow-lg">
              BS
            </div>

            <div className="space-y-2.5">
              {(
                [
                  {
                    code: 'uz' as AppLanguage,
                    badge: 'O‘Z',
                    title: 'O‘zbek tili',
                  },
                  {
                    code: 'uz_cyrl' as AppLanguage,
                    badge: 'ЎЗ',
                    title: 'Ўзбек тили (Кирилл)',
                  },
                  {
                    code: 'ru' as AppLanguage,
                    badge: 'РУ',
                    title: 'Русский язык',
                  },
                ]
              ).map((item) => {
                const isSelected = lang === item.code;
                return (
                  <button
                    key={item.code}
                    type="button"
                    onClick={() => {
                      setLang(item.code);
                      setIsLangPickerOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 p-3 sm:p-3.5 rounded-xl cursor-pointer text-left ${
                      isSelected ? 'liquid-glass-tab-active' : 'liquid-glass-tab-inactive'
                    }`}
                  >
                    <span
                      className={`w-9 h-9 rounded-lg font-black text-xs flex items-center justify-center shrink-0 border ${
                        isSelected
                          ? 'bg-[#071326] text-[#FFB800] border-[#071326]/30'
                          : 'bg-[#0A1931]/80 text-[#FFB800] border-white/20'
                      }`}
                    >
                      {item.badge}
                    </span>
                    <div className="text-sm sm:text-base font-black truncate">{item.title}</div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
