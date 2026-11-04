import React, { useState, useEffect, useMemo, useRef } from 'react';
import { protobufFetch as fetch } from '../lib/protobufClient';
import { 
  Building, 
  Package, 
  ShoppingBag, 
  Plus, 
  LogOut, 
  Phone, 
  Mail, 
  MapPin, 
  Check, 
  X, 
  TrendingUp, 
  Clock, 
  Edit3, 
  Trash2, 
  KeyRound, 
  Eye, 
  EyeOff, 
  Save, 
  CheckCircle2, 
  Sparkles,
  Layers,
  Truck,
  ShieldCheck,
  ChevronRight,
  Upload,
  Image as ImageIcon,
  AlertCircle,
  User as UserIcon,
  Lock,
  BarChart3,
  Settings,
  Palette,
  Ruler,
  Scale,
  Box,
  Download,
  FileText,
  Users,
  PanelLeftClose,
  PanelLeftOpen,
  Menu,
  Calculator,
  Search,
  CheckSquare,
  Square,
  Minus,
  Printer,
  Copy,
  Globe,
  RefreshCw,
  Store,
  ShoppingCart,
  Send,
  CreditCard,
  ChevronLeft,
  Play,
  Maximize2,
  Sun,
  Moon,
  HardHat
} from 'lucide-react';
import { UserProfile, Product, ProductVariant, SupplierPartner, Order, CompanyInfo, B2BOrderItem, B2BOrderRequest, CrmDebtRecord } from '../types';
import { INITIAL_SUPPLIERS } from '../data/suppliersData';
import { getProductTypes, addProductType, ProductTypeItem, getManufacturers, addManufacturer, isCabinetCompanyName } from '../data/productTypes';
import { getSupplierReport, SupplierDetailedReport, isOrderAfterReset, isOnlinePlatformOrder, pickMoreAdvancedOrder, saveOrdersToStorageSafe } from '../data/supplierReportsData';
import { downloadMonitoringPdfFile, downloadB2bManifestPdfFile, downloadCustomerOrderPdfFile } from '../lib/pdfDownload';
import {
  db,
  deleteField,
  sendSecurePhoneOtp,
  verifySecurePhoneOtp,
  hashPasswordServerSide,
  verifyPasswordServerSide,
  syncFirebaseAccountWithEmail,
} from '../lib/firebase';
import { doc, setDoc, deleteDoc, collection, onSnapshot } from 'firebase/firestore';
import {
  getLoginConflictError,
  isLoginRejectedError,
  computePasswordSignature,
  validateLoginAndPasswordAsync,
} from '../lib/adminSettings';
import { useLanguage } from '../lib/i18n';
import { recordCabinetLog, getLocalCabinetLogs, detectDeviceInfo, CabinetLogItem } from '../lib/cabinetLogs';
import { getCrmDebtsApi, createCrmDebtApi, recordCrmDebtPaymentApi } from '../lib/api';

interface SupplierCabinetProps {
  currentUser: UserProfile;
  products: Product[];
  onAddProduct: (product: Product) => void;
  onDeleteProduct?: (productId: string) => void;
  onGoToShop: () => void;
  onLogout: () => void;
}

interface DraftProductVariant {
  id: string;
  unit: string;
  unitValues?: Record<string, string>;
  colors: string[];
  specification: string;
  price: number | '';
  originalPrice: number | '';
  minOrder: number | '';
  isColorOpen?: boolean;
  isCollapsed?: boolean;
  isSaved?: boolean;
}

interface CrmCartBasket {
  id: string;
  name: string;
  selectedIds: string[];
  quantities: Record<string, number>;
  customPrices?: Record<string, number>;
  clientName: string;
  clientPhone: string;
}

interface B2BCartEntry {
  key: string;
  product: Product;
  unit: string;
  color?: string;
  specification?: string;
  price: number;
  quantity: number;
}

type UnitCategory = 'uzunlik' | 'massa' | 'yuza' | 'hajm';

interface UnitCategoryConfig {
  id: UnitCategory;
  label: string;
  units: string[];
}

const UNIT_CATEGORIES: UnitCategoryConfig[] = [
  {
    id: 'uzunlik',
    label: 'Uzunlik',
    units: ['metr', 'sm', 'mm', 'km', 'rulon']
  },
  {
    id: 'massa',
    label: 'Massa',
    units: ['kg', 'qop', 'dona', 'gramm', 'tonna']
  },
  {
    id: 'yuza',
    label: 'Yuza',
    units: ['m²', 'sm²', 'gektar']
  },
  {
    id: 'hajm',
    label: 'Hajm',
    units: ['m³', 'litr', 'kanistra', 'blok']
  }
];

import { PALETTE_32_COLORS, getColorPaletteItem } from '../lib/colorPalette';
export { PALETTE_32_COLORS, getColorPaletteItem };

export const SupplierCabinet: React.FC<SupplierCabinetProps> = ({
  currentUser,
  products,
  onAddProduct,
  onDeleteProduct,
  onGoToShop,
  onLogout
}) => {
  const { lang, setLang } = useLanguage();
  const resolveMatchingSupplierFromList = (list: SupplierPartner[], userObj: UserProfile): SupplierPartner | undefined => {
    if (!Array.isArray(list) || list.length === 0) return undefined;
    // 1. Strict ID match first (so B2B and B2C cabinets of the same company/STIR never collide!)
    if (userObj?.id) {
      const byId = list.find((s) => s && s.id === userObj.id);
      if (byId) return byId;
    }
    // 2. Strict login / email prefix match
    const loginPrefix = (userObj?.firstName || userObj?.email?.split('@')[0] || '').trim().toLowerCase();
    if (loginPrefix) {
      const byLogin = list.find(
        (s) =>
          s?.login &&
          (s.login.trim().toLowerCase() === loginPrefix ||
            (userObj?.email && s.login.trim().toLowerCase() === userObj.email.trim().toLowerCase()))
      );
      if (byLogin) return byLogin;
    }
    // 3. Match by companyName + cabinetType if cabinetType is known on userObj
    const compLower = (userObj?.companyName || '').trim().toLowerCase();
    if (compLower && userObj?.cabinetType) {
      const byCompAndType = list.find(
        (s) =>
          (s?.companyName || '').trim().toLowerCase() === compLower &&
          (s?.cabinetType || 'partner') === userObj.cabinetType
      );
      if (byCompAndType) return byCompAndType;
    }
    // 4. Last fallback: companyName
    if (compLower) {
      return list.find((s) => (s?.companyName || '').trim().toLowerCase() === compLower);
    }
    return undefined;
  };

  // Find or create supplier profile
  const [supplierData, setSupplierData] = useState<SupplierPartner>(() => {
    try {
      const saved = localStorage.getItem('bunkerstroy_suppliers');
      if (saved) {
        const list: SupplierPartner[] = JSON.parse(saved);
        const found = resolveMatchingSupplierFromList(list, currentUser);
        if (found) return found;
      }
    } catch {}

    const initialMatch = INITIAL_SUPPLIERS.find((s) => 
      (s?.companyName || '').toLowerCase() === (currentUser?.companyName || '').toLowerCase()
    );
    if (initialMatch) return initialMatch;

    return {
      id: currentUser.id,
      cabinetType: currentUser.cabinetType || 'partner',
      inn: currentUser.inn,
      name: currentUser.displayName || 'Mas’ul shaxs',
      companyName: currentUser.companyName || 'Hamkor',
      phone: currentUser.phone || '',
      email: currentUser.email,
      login: currentUser.firstName || currentUser.email.split('@')[0] || 'hamkor',
      password: 'user123',
      region: currentUser.region || '',
      category: 'Qurilish mollari',
      status: 'active',
      productsCount: 0,
      totalSalesSum: 0,
      rating: 5.0,
      contractNumber: currentUser.contractNumber || '',
      createdAt: currentUser.createdAt,
    };
  });

  const [activeTab, setActiveTab] = useState<'reports' | 'products' | 'customers' | 'crm' | 'qarz_daftari' | 'b2b_manufacturers' | 'b2b_orders' | 'settings' | 'logs'>('reports');
  const [cabinetTheme, setCabinetTheme] = useState<'dark' | 'light'>(() => {
    try {
      const saved = localStorage.getItem(`bunkerstroy_supplier_theme_${currentUser.id || 'default'}`);
      return saved === 'light' ? 'light' : 'dark';
    } catch {
      return 'dark';
    }
  });
  const handleSelectCabinetTheme = (mode: 'dark' | 'light') => {
    setCabinetTheme(mode);
    try {
      localStorage.setItem(`bunkerstroy_supplier_theme_${currentUser.id || 'default'}`, mode);
    } catch {}
  };
  const [prevNonCrmTab, setPrevNonCrmTab] = useState<'reports' | 'products' | 'customers' | 'b2b_manufacturers' | 'b2b_orders' | 'settings' | 'logs'>('reports');
  const [productsSubTab, setProductsSubTab] = useState<'online' | 'offline'>('online');
  const [reportsSubTab, setReportsSubTab] = useState<'online' | 'offline' | 'general' | 'kirim_chiqim' | 'pending_debts'>('general');
  const [reportTimeRange, setReportTimeRange] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  const [selectedReportDay, setSelectedReportDay] = useState<string>('all_days');
  const [selectedReportMonth, setSelectedReportMonth] = useState<number | 'all_months'>('all_months');

  const isAdminSession = Boolean(currentUser.impersonatedByBunkerAdmin || currentUser.impersonatedByAdmin);
  const adminActorName =
    currentUser.impersonatorAdminProfile?.displayName ||
    currentUser.impersonatorAdminProfile?.firstName ||
    (currentUser.impersonatedByBunkerAdmin ? 'Bunker Admin' : 'Admin');

  const maskPrimaryPhoneForSms = (rawPhone?: string): string => {
    const digits = String(rawPhone || '').replace(/\D/g, '');
    const last4 = digits.slice(-4) || '0000';
    return `+998 ** *** ${last4.slice(0, 2)} ${last4.slice(2, 4)}`;
  };

  const [cabinetLogsList, setCabinetLogsList] = useState<CabinetLogItem[]>(() =>
    getLocalCabinetLogs(supplierData.id || currentUser.id)
  );
  const [cabinetLogsFilter, setCabinetLogsFilter] = useState<'all' | 'login' | 'password_change' | 'admin'>('all');

  useEffect(() => {
    const cabId = supplierData.id || currentUser.id;
    const refreshLogs = () => {
      setCabinetLogsList(getLocalCabinetLogs(cabId));
    };
    refreshLogs();
    window.addEventListener('bunkerstroy_cabinet_logs_updated', refreshLogs);
    return () => window.removeEventListener('bunkerstroy_cabinet_logs_updated', refreshLogs);
  }, [supplierData.id, currentUser.id]);

  // Record cabinet login when supplier opens their own cabinet (Admin kirganda hech qanday log yozilmaydi)
  const loginLoggedRef = useRef(false);
  useEffect(() => {
    if (loginLoggedRef.current) return;
    loginLoggedRef.current = true;
    const cabId = supplierData.id || currentUser.id;
    if (!cabId || isAdminSession) return;
    const devInfo = detectDeviceInfo();
    recordCabinetLog({
      cabinetId: cabId,
      cabinetName: supplierData.companyName || currentUser.displayName || 'Ta’minotchi Kabineti',
      cabinetRole: supplierData.cabinetType === 'manufacturer' ? 'B2B Kabinet' : 'B2C Kabinet',
      actionType: 'login',
      title: 'Kabinetga kirish bajarildi',
      details: `Qurilma: ${devInfo.device} (${devInfo.browser} • ${devInfo.os}) orqali kabinetga kirildi.`,
    });
  }, [supplierData.id, currentUser.id, isAdminSession]);

  const REPORT_MONTHS_LIST = [
    { id: 0, number: 1, label: 'Yanvar' },
    { id: 1, number: 2, label: 'Fevral' },
    { id: 2, number: 3, label: 'Mart' },
    { id: 3, number: 4, label: 'Aprel' },
    { id: 4, number: 5, label: 'May' },
    { id: 5, number: 6, label: 'Iyun' },
    { id: 6, number: 7, label: 'Iyul' },
    { id: 7, number: 8, label: 'Avgust' },
    { id: 8, number: 9, label: 'Sentabr' },
    { id: 9, number: 10, label: 'Oktabr' },
    { id: 10, number: 11, label: 'Noyabr' },
    { id: 11, number: 12, label: 'Dekabr' },
  ];
  const [customersSubTab, setCustomersSubTab] = useState<'regular' | 'b2b_suppliers'>('regular');
  const [customersStatusFilter, setCustomersStatusFilter] = useState<'all' | 'in_progress'>('all');
  const [crmStockWarning, setCrmStockWarning] = useState<string | null>(null);

  useEffect(() => {
    if (activeTab !== 'crm' && activeTab !== 'qarz_daftari') {
      setPrevNonCrmTab(activeTab);
    }
  }, [activeTab]);

  const handleLogoClick = (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    setActiveTab('settings');
  };

  const handleLogoDoubleClick = (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    setActiveTab('logs');
  };

  const [isAddProductOpen, setIsAddProductOpen] = useState(false);
  const [isMavjudlikSectionCollapsed, setIsMavjudlikSectionCollapsed] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [addProductSource, setAddProductSource] = useState<'products' | 'crm'>('products');
  const [addProductChannel, setAddProductChannel] = useState<'online' | 'offline'>('online');

  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  // B2B Ishlab chiqaruvchilar bo'limi uchun qidiruv, filtr, savat va so'rovlar
  const [b2bSearchQuery, setB2bSearchQuery] = useState('');
  const [b2bCategoryFilter, setB2bCategoryFilter] = useState('all');
  const [selectedB2bProduct, setSelectedB2bProduct] = useState<Product | null>(null);
  const [b2bDetailImgIdx, setB2bDetailImgIdx] = useState(0);
  const [b2bZoomedImage, setB2bZoomedImage] = useState<string | null>(null);
  const [b2bVideoModalProduct, setB2bVideoModalProduct] = useState<Product | null>(null);
  const [showOutOfStockList, setShowOutOfStockList] = useState(false);
  const [b2bCart, setB2bCart] = useState<B2BCartEntry[]>([]);
  const [b2bQtyInputs, setB2bQtyInputs] = useState<Record<string, number>>({});
  const [b2bVariantIdxInputs, setB2bVariantIdxInputs] = useState<Record<string, number>>({});
  const [b2bColorInputs, setB2bColorInputs] = useState<Record<string, string>>({});
  const [b2bOrders, setB2bOrders] = useState<B2BOrderRequest[]>(() => {
    try {
      const saved = localStorage.getItem('bunkerstroy_b2b_orders');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [previewB2bManifest, setPreviewB2bManifest] = useState<B2BOrderRequest | null>(null);
  const [b2bNoticeMessage, setB2bNoticeMessage] = useState<string | null>(null);
  const [isB2bMyOrdersOpen, setIsB2bMyOrdersOpen] = useState(false);
  const [b2bMyOrdersTab, setB2bMyOrdersTab] = useState<'all' | 'buying' | 'bought'>('all');
  const [b2bBankAccountInputs, setB2bBankAccountInputs] = useState<Record<string, string>>({});
  const [b2bBankAccountErrors, setB2bBankAccountErrors] = useState<Record<string, string>>({});
  const [copiedBankOrderId, setCopiedBankOrderId] = useState<string | null>(null);
  const [expandedCrmVariantIds, setExpandedCrmVariantIds] = useState<Record<string, boolean>>({});
  const [crmVariantSelection, setCrmVariantSelection] = useState<Record<string, number>>({});
  const [crmColorSelection, setCrmColorSelection] = useState<Record<string, string>>({});
  const [expandedProductVariantIds, setExpandedProductVariantIds] = useState<Record<string, boolean>>({});

  // CRM State: 2 va undan ortiq savdo savati shakllantirish imkoni (chiqib ketilganda ham o'chmaydi)
  const crmStorageKey = `bunkerstroy_crm_baskets_${supplierData.id || 'default'}`;
  const normalizeCrmBaskets = (list: CrmCartBasket[]): CrmCartBasket[] =>
    list.map((b, idx) => ({
      ...b,
      name: `Savat #${idx + 1}`,
      selectedIds: Array.isArray(b.selectedIds) ? Array.from(new Set(b.selectedIds)) : [],
      quantities: b.quantities || {},
      customPrices: b.customPrices || {},
      clientName: b.clientName || '',
      clientPhone: b.clientPhone || '',
    }));

  const [crmSearchQuery, setCrmSearchQuery] = useState('');
  const [crmCategoryFilter, setCrmCategoryFilter] = useState('all');
  const [crmBaskets, setCrmBaskets] = useState<CrmCartBasket[]>(() => {
    try {
      const saved = localStorage.getItem(crmStorageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return normalizeCrmBaskets(parsed);
      }
    } catch {}
    return [
      { id: 'basket-1', name: 'Savat #1', selectedIds: [], quantities: {}, customPrices: {}, clientName: '', clientPhone: '' },
      { id: 'basket-2', name: 'Savat #2', selectedIds: [], quantities: {}, customPrices: {}, clientName: '', clientPhone: '' },
    ];
  });
  const [activeCrmBasketId, setActiveCrmBasketId] = useState<string>('basket-1');
  const [crmDiscountPercent, setCrmDiscountPercent] = useState<number>(0);
  const [crmCopySuccess, setCrmCopySuccess] = useState(false);
  const [crmSaleSuccessNotice, setCrmSaleSuccessNotice] = useState<string | null>(null);
  const [selectedCustomerProductsModal, setSelectedCustomerProductsModal] = useState<any | null>(null);

  // Qarz (Debt) modal state in CRM & Password-protected Qarz daftari state
  const [crmDebts, setCrmDebts] = useState<CrmDebtRecord[]>(() => {
    try {
      const saved = localStorage.getItem('bunkerstroy_crm_debts');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [isCrmDebtModalOpen, setIsCrmDebtModalOpen] = useState(false);
  const [debtCustomerName, setDebtCustomerName] = useState('');
  const [debtCustomerPhone, setDebtCustomerPhone] = useState('+998 ');
  const [showDebtorSuggestions, setShowDebtorSuggestions] = useState(false);
  const [debtAmountInput, setDebtAmountInput] = useState<number | ''>('');
  const [debtNoteInput, setDebtNoteInput] = useState('');
  const [debtFormError, setDebtFormError] = useState<string | null>(null);

  // Qarz daftari password modal state
  const [isQarzPasswordModalOpen, setIsQarzPasswordModalOpen] = useState(false);
  const [qarzPasswordInput, setQarzPasswordInput] = useState('');
  const [qarzPasswordError, setQarzPasswordError] = useState<string | null>(null);
  const [showQarzPassword, setShowQarzPassword] = useState(false);

  // Qarz so'ndirish (payment) state inside Qarz daftari
  const [payingDebtRecord, setPayingDebtRecord] = useState<CrmDebtRecord | null>(null);
  const [payDebtAmountInput, setPayDebtAmountInput] = useState<number | ''>('');
  const [payDebtError, setPayDebtError] = useState<string | null>(null);

  useEffect(() => {
    // 1. Initial load from PostgreSQL backend
    if (supplierData?.id) {
      getCrmDebtsApi(supplierData.id)
        .then((dbDebts) => {
          if (Array.isArray(dbDebts) && dbDebts.length > 0) {
            setCrmDebts((prev) => {
              const dbIds = new Set(dbDebts.map((d: any) => d.id));
              const localOnly = prev.filter((p) => p && !dbIds.has(p.id));
              const merged = [...localOnly, ...dbDebts];
              try {
                localStorage.setItem('bunkerstroy_crm_debts', JSON.stringify(merged));
              } catch {}
              return merged;
            });
          }
        })
        .catch(() => {});
    }

    const syncDebts = () => {
      try {
        const saved = localStorage.getItem('bunkerstroy_crm_debts');
        if (saved) setCrmDebts(JSON.parse(saved));
      } catch {}
    };
    window.addEventListener('storage', syncDebts);
    window.addEventListener('bunkerstroy_debts_updated', syncDebts);
    return () => {
      window.removeEventListener('storage', syncDebts);
      window.removeEventListener('bunkerstroy_debts_updated', syncDebts);
    };
  }, [supplierData?.id]);

  const saveCrmDebtsList = (nextList: CrmDebtRecord[], changedRecord?: CrmDebtRecord) => {
    setCrmDebts(nextList);
    try {
      localStorage.setItem('bunkerstroy_crm_debts', JSON.stringify(nextList));
    } catch {}
    if (changedRecord) {
      try {
        setDoc(doc(db, 'crm_debts', changedRecord.id), changedRecord, { merge: true }).catch(() => {});
        // Also persist to PostgreSQL backend
        createCrmDebtApi({
          supplierId: changedRecord.supplierId || supplierData.id,
          customerName: changedRecord.customerName,
          customerPhone: changedRecord.customerPhone,
          totalOrderAmount: changedRecord.totalOrderAmount,
          initialPaidAmount: changedRecord.initialPaidAmount || 0,
          debtAmount: changedRecord.debtAmount,
          items: changedRecord.items || [],
          note: changedRecord.note,
        }).catch(() => {});
      } catch {}
    }
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('bunkerstroy_debts_updated'));
      window.dispatchEvent(new Event('storage'));
    }, 0);
  };

  const myCrmDebts = useMemo(() => {
    const myComp = (supplierData.companyName || '').trim().toLowerCase();
    return crmDebts.filter((d) => {
      if (d.supplierId && supplierData.id) {
        return d.supplierId === supplierData.id;
      }
      if (d.supplierInn && supplierData.inn && d.supplierInn === supplierData.inn) return true;
      const dComp = (d.supplierCompanyName || '').trim().toLowerCase();
      return Boolean(myComp && dComp && (dComp === myComp || dComp.includes(myComp) || myComp.includes(dComp)));
    });
  }, [crmDebts, supplierData]);

  const pendingMyCrmDebts = useMemo(
    () => myCrmDebts.filter((d) => d.status === 'pending' && d.remainingDebtAmount > 0),
    [myCrmDebts]
  );

  const totalPendingDebtSum = useMemo(
    () => pendingMyCrmDebts.reduce((sum, d) => sum + (Number(d.remainingDebtAmount) || 0), 0),
    [pendingMyCrmDebts]
  );

  const totalPaidDebtSum = useMemo(
    () => myCrmDebts.reduce((sum, d) => sum + (Number(d.paidDebtAmount) || 0), 0),
    [myCrmDebts]
  );

  useEffect(() => {
    try {
      localStorage.setItem(crmStorageKey, JSON.stringify(crmBaskets));
    } catch {}
  }, [crmBaskets, crmStorageKey]);

  const activeCrmBasket = useMemo(() => {
    return crmBaskets.find((b) => b.id === activeCrmBasketId) || crmBaskets[0];
  }, [crmBaskets, activeCrmBasketId]);

  const crmSelectedIds = activeCrmBasket?.selectedIds || [];
  const crmQuantities = activeCrmBasket?.quantities || {};
  const crmCustomPrices = activeCrmBasket?.customPrices || {};
  const crmClientName = activeCrmBasket?.clientName || '';
  const crmClientPhone = activeCrmBasket?.clientPhone || '';

  const setCrmSelectedIds = (updater: string[] | ((prev: string[]) => string[])) => {
    setCrmBaskets((prev) =>
      prev.map((b) => {
        if (b.id !== activeCrmBasket.id) return b;
        const nextIds = typeof updater === 'function' ? updater(b.selectedIds) : updater;
        return { ...b, selectedIds: Array.from(new Set(nextIds)) };
      })
    );
  };

  const setCrmQuantities = (updater: Record<string, number> | ((prev: Record<string, number>) => Record<string, number>)) => {
    setCrmBaskets((prev) =>
      prev.map((b) => {
        if (b.id !== activeCrmBasket.id) return b;
        const nextQ = typeof updater === 'function' ? updater(b.quantities) : updater;
        return { ...b, quantities: nextQ };
      })
    );
  };

  const setCrmCustomPrice = (entryKey: string, val: number) => {
    setCrmBaskets((prev) =>
      prev.map((b) => {
        if (b.id !== activeCrmBasket.id) return b;
        return {
          ...b,
          customPrices: {
            ...(b.customPrices || {}),
            [entryKey]: Math.max(0, Math.floor(val || 0)),
          },
        };
      })
    );
  };

  const setCrmClientName = (val: string) => {
    setCrmBaskets((prev) => prev.map((b) => (b.id === activeCrmBasket.id ? { ...b, clientName: val } : b)));
  };

  const setCrmClientPhone = (val: string) => {
    setCrmBaskets((prev) => prev.map((b) => (b.id === activeCrmBasket.id ? { ...b, clientPhone: val } : b)));
  };

  const handleAddNewCrmBasket = () => {
    const newId = `basket-${Date.now()}`;
    setCrmBaskets((prev) =>
      normalizeCrmBaskets([
        ...prev,
        { id: newId, name: `Savat #${prev.length + 1}`, selectedIds: [], quantities: {}, customPrices: {}, clientName: '', clientPhone: '' },
      ])
    );
    setActiveCrmBasketId(newId);
  };

  const handleRemoveCrmBasket = (basketId: string) => {
    if (crmBaskets.length <= 1) return;
    const filtered = normalizeCrmBaskets(crmBaskets.filter((b) => b.id !== basketId));
    setCrmBaskets(filtered);
    if (activeCrmBasketId === basketId && filtered[0]) {
      setActiveCrmBasketId(filtered[0].id);
    }
  };

  // Barcha kabinetlar ro'yxati (Ishlab chiqaruvchilarni aniqlash uchun)
  const [allSuppliersList, setAllSuppliersList] = useState<SupplierPartner[]>(() => {
    try {
      const saved = localStorage.getItem('bunkerstroy_suppliers');
      if (saved) return JSON.parse(saved);
    } catch {}
    return INITIAL_SUPPLIERS;
  });

  // Keep supplierData synced with bunkerstroy_suppliers in localStorage (strictly prioritizing supplier id / login)
  useEffect(() => {
    const syncSupplier = () => {
      try {
        const saved = localStorage.getItem('bunkerstroy_suppliers');
        if (saved) {
          const list: SupplierPartner[] = JSON.parse(saved);
          setAllSuppliersList(list);
          const found = resolveMatchingSupplierFromList(list, currentUser);
          if (found) setSupplierData(found);
        }
      } catch {}
    };
    syncSupplier();
    window.addEventListener('storage', syncSupplier);
    window.addEventListener('bunkerstroy_suppliers_updated', syncSupplier);
    return () => {
      window.removeEventListener('storage', syncSupplier);
      window.removeEventListener('bunkerstroy_suppliers_updated', syncSupplier);
    };
  }, [currentUser, isAddProductOpen]);

  // Supplier's products — B2B va B2C kabinetlar mahsulotlari alohida saqlanadi va bir-biriga aralashmaydi
  const companyProducts = products.filter((p) => {
    if (!p) return false;
    const myType = supplierData?.cabinetType === 'manufacturer' ? 'manufacturer' : 'partner';
    if (p.supplierCabinetType && p.supplierCabinetType !== myType) {
      return false;
    }
    if (p.supplierId && supplierData?.id) {
      return p.supplierId === supplierData.id;
    }
    if (p?.supplierInn && supplierData?.inn && p.supplierInn === supplierData.inn) return true;
    const pSupp = (p?.supplierName || '').toLowerCase();
    const sComp = (supplierData?.companyName || '').toLowerCase();
    if (
      (supplierData?.inn === '313086503' || sComp.includes('national ai technology') || sComp.includes('insonlar uchun milliy ai')) &&
      (pSupp.includes('national ai technology') || pSupp.includes('insonlar uchun milliy ai'))
    ) {
      return true;
    }
    return pSupp === sComp || (sComp.length > 0 && pSupp.includes(sComp.slice(0, 10)));
  });

  // Faqat Ishlab chiqaruvchilar (Zavodlar) yuklagan mahsulotlar
  const manufacturerProducts = useMemo(() => {
    const manufacturerNames = new Set(
      allSuppliersList
        .filter((s) => s.cabinetType === 'manufacturer')
        .map((s) => (s.companyName || '').trim().toLowerCase())
        .filter(Boolean)
    );

    return products.filter((p) => {
      if (p.supplierCabinetType === 'manufacturer') return true;
      if (p.supplierCabinetType === 'partner') return false;
      const pSupp = (p.supplierName || '').trim().toLowerCase();
      if (!pSupp) return false;
      for (const mName of manufacturerNames) {
        if (pSupp === mName || (mName.length >= 4 && pSupp.includes(mName))) {
          return true;
        }
      }
      return false;
    });
  }, [products, allSuppliersList]);

  const filteredManufacturerProducts = useMemo(() => {
    return manufacturerProducts.filter((p) => {
      const matchesCat = b2bCategoryFilter === 'all' || p.category === b2bCategoryFilter;
      const q = b2bSearchQuery.trim().toLowerCase();
      const matchesSearch =
        !q ||
        (p.title || '').toLowerCase().includes(q) ||
        (p.category || '').toLowerCase().includes(q) ||
        (p.supplierName || '').toLowerCase().includes(q) ||
        (p.region || '').toLowerCase().includes(q);
      return matchesCat && matchesSearch;
    });
  }, [manufacturerProducts, b2bCategoryFilter, b2bSearchQuery]);

  const b2bCategories = useMemo(() => {
    const set = new Set<string>();
    manufacturerProducts.forEach((p) => {
      if (p.category) set.add(p.category);
    });
    return Array.from(set);
  }, [manufacturerProducts]);

  const [ordersRefreshTick, setOrdersRefreshTick] = useState(0);
  const [selectedMobileProductDetail, setSelectedMobileProductDetail] = useState<Product | null>(null);
  const [mobileProductDetailImgIdx, setMobileProductDetailImgIdx] = useState(0);
  const [selectedMapCustomer, setSelectedMapCustomer] = useState<{
    name: string;
    phone: string;
    address: string;
    coords: { lat: number; lng: number } | null;
  } | null>(null);
  const [supplierMapType, setSupplierMapType] = useState<'m' | 'k'>('m');
  const [localOrderOverrides, setLocalOrderOverrides] = useState<Record<string, Partial<Order>>>({});

  useEffect(() => {
    const handleOrdersSync = () => {
      setOrdersRefreshTick((t) => t + 1);
    };
    window.addEventListener('storage', handleOrdersSync);
    window.addEventListener('bunkerstroy_orders_updated', handleOrdersSync);
    window.addEventListener('bunkerstroy-orders-updated', handleOrdersSync);
    window.addEventListener('bunkerstroy_finance_updated', handleOrdersSync);

    let unsubscribeFs: (() => void) | undefined;
    try {
      const q = collection(db, 'orders');
      unsubscribeFs = onSnapshot(
        q,
        (snapshot) => {
          const fsOrders: Order[] = [];
          snapshot.forEach((d) => {
            const ord = d.data() as Order;
            if (!isOrderAfterReset(ord)) {
              deleteDoc(doc(db, 'orders', d.id)).catch(() => {});
            } else {
              fsOrders.push(ord);
            }
          });
          try {
            const saved = localStorage.getItem('bunkerstroy_orders');
            const localOrders: Order[] = saved ? JSON.parse(saved) : [];
            const mergedMap = new Map<string, Order>();
            fsOrders.forEach((fo) => {
              if (fo && fo.id && isOrderAfterReset(fo)) mergedMap.set(fo.id, fo);
            });
            if (Array.isArray(localOrders)) {
              localOrders.forEach((lo) => {
                if (!lo || !lo.id || !isOrderAfterReset(lo)) return;
                const existing = mergedMap.get(lo.id);
                if (!existing) {
                  mergedMap.set(lo.id, lo);
                } else {
                  mergedMap.set(lo.id, pickMoreAdvancedOrder(lo, existing));
                }
              });
            }
            saveOrdersToStorageSafe(Array.from(mergedMap.values()));
          } catch {}
          setOrdersRefreshTick((t) => t + 1);
        },
        () => {}
      );
    } catch {}

    return () => {
      window.removeEventListener('storage', handleOrdersSync);
      window.removeEventListener('bunkerstroy_orders_updated', handleOrdersSync);
      window.removeEventListener('bunkerstroy-orders-updated', handleOrdersSync);
      window.removeEventListener('bunkerstroy_finance_updated', handleOrdersSync);
      if (unsubscribeFs) unsubscribeFs();
    };
  }, []);

  const extractCoordsFromAddress = (addr: string): { lat: number; lng: number } | null => {
    if (!addr) return null;
    const match = addr.match(/\[(?:Google Maps|Koordinata):\s*([-+]?\d*\.?\d+)\s*,\s*([-+]?\d*\.?\d+)\]/i);
    if (match && match[1] && match[2]) {
      const lat = parseFloat(match[1]);
      const lng = parseFloat(match[2]);
      if (!isNaN(lat) && !isNaN(lng)) {
        return { lat, lng };
      }
    }
    return null;
  };

  // Manzilni faqat "Viloyat, Tuman yoki shahar" ko'rinishida qisqartirib ko'rsatish
  const formatRegionAndDistrictOnly = (addr: string): string => {
    if (!addr) return 'Toshkent sh.';
    const cleaned = addr.replace(/\[(?:Google Maps|Koordinata):.*?\]/gi, '').trim();
    const parts = cleaned
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[0]}, ${parts[1]}`;
    }
    return cleaned || 'Toshkent sh.';
  };

  const formatCleanFullAddress = (addr: string): string => {
    if (!addr) return 'Toshkent sh.';
    return addr.replace(/\[(?:Google Maps|Koordinata):.*?\]/gi, '').trim() || 'Toshkent sh.';
  };

  // Supplier Detailed Report
  const supplierReport = useMemo(() => {
    return getSupplierReport(
      supplierData.companyName,
      supplierData.name,
      supplierData.region,
      supplierData.phone,
      supplierData.contractNumber || '',
      supplierData.commissionRate || 5,
      supplierData.commissionBasis || 'total',
      'all',
      undefined,
      supplierData.id,
      supplierData.inn
    );
  }, [supplierData, products, ordersRefreshTick]);

  // Yetkazib beruvchi telefon raqami input holatlari (har bir buyurtma qatori uchun)
  const [driverPhoneInputs, setDriverPhoneInputs] = useState<Record<string, string>>({});
  const [driverPhoneErrors, setDriverPhoneErrors] = useState<Record<string, string>>({});

  const formatUzPhoneInput = (val: string) => {
    const digits = val.replace(/\D/g, '');
    const local = digits.startsWith('998') ? digits.slice(3, 12) : digits.slice(0, 9);
    if (local.length === 0) return '+998 ';
    if (local.length <= 2) return `+998 ${local}`;
    if (local.length <= 5) return `+998 ${local.slice(0, 2)} ${local.slice(2)}`;
    if (local.length <= 7) return `+998 ${local.slice(0, 2)} ${local.slice(2, 5)} ${local.slice(5)}`;
    return `+998 ${local.slice(0, 2)} ${local.slice(2, 5)} ${local.slice(5, 7)} ${local.slice(7, 9)}`;
  };

  // Mijozlar ro'yxati (platforma foydalanuvchilaridan kelgan so'rovlar — B2B/B2C kabinet so'rovlari 2-bo'limda alohida ko'rinadi)
  const supplierCustomers = useMemo(() => {
    const isManufacturerCabinet = supplierData.cabinetType === 'manufacturer';
    const map = new Map<
      string,
      {
        id: string;
        orderIds: string[];
        status: Order['status'];
        paymentStatus?: Order['paymentStatus'];
        requiresB2bApproval?: boolean;
        driverPhone?: string;
        name: string;
        phone: string;
        address: string;
        coords: { lat: number; lng: number } | null;
        ordersCount: number;
        totalQty: number;
        totalSpent: number;
        lastOrderDate: string;
        productsBought: string[];
        itemsList: { title: string; quantity: number; unit: string; price: number; totalSum: number }[];
      }
    >();

    // Read real orders from localStorage to link order IDs and real-time order statuses
    let rawOrders: Order[] = [];
    try {
      const savedOrders = localStorage.getItem('bunkerstroy_orders');
      rawOrders = savedOrders ? JSON.parse(savedOrders) : [];
    } catch {}

    const normalizedComp = (supplierData.companyName || '').trim().toLowerCase();
    const isStir313 =
      supplierData.inn === '313086503' ||
      normalizedComp.includes('national ai technology') ||
      normalizedComp.includes('insonlar uchun milliy ai');

    const supplierCabinetIds = new Set(allSuppliersList.map((s) => s.id).filter(Boolean));

    if (Array.isArray(rawOrders) && (normalizedComp || supplierData.id || supplierData.inn)) {
      rawOrders.forEach((rawOrd, oIdx) => {
        if (!rawOrd || !Array.isArray(rawOrd.items) || !isOrderAfterReset(rawOrd)) return;
        const override = rawOrd.id ? localOrderOverrides[rawOrd.id] : undefined;
        const order: Order = override ? pickMoreAdvancedOrder({ ...rawOrd, ...override } as Order, rawOrd) : rawOrd;

        if (order.status === 'cancelled') return;
        // DIQQAT: CRM da olib borilgan oflayn savdolar alohida tizimda ishlaydi va B2B Mijozlar (Onlayn so'rovlar) bo'limiga kirmaydi!
        if (!isOnlinePlatformOrder(order)) return;
        // B2B / B2C kabinetlardan kelgan buyurtmalar B2B mijoz so'rovlari bo'limida ko'rinadi
        if (
          String(order.id || '').startsWith('B2B-') ||
          String(order.buyerName || '').includes('(B2B Hamkor)') ||
          (order.buyerId && supplierCabinetIds.has(order.buyerId))
        ) {
          return;
        }

        const myCabinetType = supplierData.cabinetType === 'manufacturer' ? 'manufacturer' : 'partner';
        const matchingItems = order.items.filter((item: any) => {
          const matchedProd = products.find((p) => p && p.id === (item.productId || item?.product?.id));
          if (matchedProd?.supplierCabinetType && matchedProd.supplierCabinetType !== myCabinetType) {
            return false;
          }
          const itemSuppId = item.supplierId || matchedProd?.supplierId;
          if (supplierData.id && itemSuppId) {
            return itemSuppId === supplierData.id;
          }
          if (supplierData.inn && (item.supplierInn === supplierData.inn || matchedProd?.supplierInn === supplierData.inn)) {
            return true;
          }
          const rawSupp = item.supplierName || item?.product?.supplierName || matchedProd?.supplierName || '';
          const itemSupp = rawSupp.trim().toLowerCase();
          if (
            isStir313 &&
            (itemSupp.includes('national ai technology') || itemSupp.includes('insonlar uchun milliy ai'))
          ) {
            return true;
          }
          if (
            itemSupp &&
            (itemSupp === normalizedComp ||
              itemSupp.includes(normalizedComp) ||
              normalizedComp.includes(itemSupp))
          ) {
            return true;
          }
          if (allSuppliersList.length === 1) {
            return true;
          }
          return false;
        });

        if (matchingItems.length === 0) return;

        // Zavod (B2B) kabinetida sotib oluvchi shaxsiy ma'lumotlari va telefon raqami ko'rsatilmaydi — "Mijoz" deb yuritiladi
        const buyerName = isManufacturerCabinet ? 'Mijoz' : order.recipientName || order.buyerName || 'Mijoz';
        const buyerPhone = isManufacturerCabinet ? 'Mijoz (Shaxsiy ma’lumot yashirin)' : order.recipientPhone || order.buyerPhone || '—';
        const addr = order.deliveryAddress || 'Toshkent sh.';
        const dateStr = order.createdAt
          ? new Date(order.createdAt).toISOString().replace('T', ' ').slice(0, 16)
          : '—';

        const key = `${order.id}-${oIdx}`;
        let orderQty = 0;
        let orderSum = 0;
        const prodsList: string[] = [];
        const itemsDetailed: { title: string; quantity: number; unit: string; price: number; totalSum: number }[] = [];

        matchingItems.forEach((it: any) => {
          const q = Number(it.quantity) || 0;
          const pr = Number(it.price) || Number(it?.product?.price) || 0;
          const t = it.title || it?.product?.title || 'Mahsulot';
          const u = it.unit || it?.product?.unit || 'dona';
          orderQty += q;
          orderSum += q * pr;
          const labelWithQty = `${t} (${q} ${u})`;
          if (t && !prodsList.includes(labelWithQty)) prodsList.push(labelWithQty);
          itemsDetailed.push({
            title: t,
            quantity: q,
            unit: u,
            price: pr,
            totalSum: q * pr,
          });
        });

        map.set(key, {
          id: `supp-order-${order.id}`,
          orderIds: [order.id],
          status: order.status || 'pending',
          paymentStatus: order.paymentStatus || 'paid',
          requiresB2bApproval: Boolean(order.requiresB2bApproval),
          driverPhone: order.driverPhone || '',
          name: buyerName,
          phone: buyerPhone,
          address: addr,
          coords: extractCoordsFromAddress(addr),
          ordersCount: 1,
          totalQty: orderQty,
          totalSpent: orderSum,
          lastOrderDate: dateStr,
          productsBought: prodsList,
          itemsList: itemsDetailed,
        });
      });
    }

    // Fallback to online sales from supplierReport.sales if map is empty
    if (map.size === 0) {
      supplierReport.sales
        .filter(
          (sale) =>
            sale.orderChannel !== 'offline' &&
            !String(sale.orderId || '').startsWith('B2B-') &&
            !String(sale.buyerName || '').includes('(B2B Hamkor)')
        )
        .forEach((sale, idx) => {
          const key = `sale-cust-${idx}`;
          const routeMatch = supplierReport.routes[idx];
          const addr = sale.deliveryAddress || routeMatch?.toLocation || 'Toshkent sh.';
          const saleOrderId =
            sale.orderId ||
            (sale.id.startsWith('sale-')
              ? sale.id.replace(/^sale-/, '').replace(/-\d+$/, '')
              : sale.id);
          const itemObj = {
            title: sale.productTitle || 'Mahsulot',
            quantity: Number(sale.quantity) || 1,
            unit: sale.unit || 'dona',
            price: Number(sale.price) || 0,
            totalSum: Number(sale.totalSum) || 0,
          };
          map.set(key, {
            id: `supp-cust-${idx}`,
            orderIds: [saleOrderId],
            status: sale.status || 'pending',
            paymentStatus: 'paid',
            driverPhone: sale.driverPhone || '',
            name: isManufacturerCabinet ? 'Mijoz' : sale.buyerName || 'Mijoz',
            phone: isManufacturerCabinet ? 'Mijoz (Shaxsiy ma’lumot yashirin)' : sale.buyerPhone || '—',
            address: addr,
            coords: extractCoordsFromAddress(addr),
            ordersCount: 1,
            totalQty: Number(sale.quantity) || 0,
            totalSpent: Number(sale.totalSum) || 0,
            lastOrderDate: sale.date || '—',
            productsBought: sale.productTitle ? [`${sale.productTitle} (${sale.quantity} ${sale.unit || 'dona'})`] : [],
            itemsList: [itemObj],
          });
        });
    }

    return Array.from(map.values());
  }, [supplierReport, supplierData, products, allSuppliersList, ordersRefreshTick, localOrderOverrides]);

  // Bildirishnoma (Alert) hisoblagichlari — qaysi bo'limda bildirishnoma bo'lsa shu bo'lim rangi tovlanadi
  const pendingCustomersCount = useMemo(
    () => supplierCustomers.filter((c) => c.status === 'pending' || c.status === 'confirmed').length,
    [supplierCustomers]
  );
  const loadingCustomersCount = useMemo(
    () => supplierCustomers.filter((c) => c.status === 'assigned').length,
    [supplierCustomers]
  );
  const hasCustomersAlert = pendingCustomersCount > 0 || loadingCustomersCount > 0;
  const hasReportsAlert = supplierReport.sales.length > 0 && hasCustomersAlert;

  // Ta'minotchi buyurtma holatini o'zgartirishi:
  // 1) Buyurtmani qabul qilish -> 'assigned' (Yuklash jarayonida)
  // 2) Tasdiqlash (Yetkazib beruvchi telefon raqami bilan) -> 'in_transit' (Manzilga yuborildi va raqam mijozga ham ko'rinadi)
  // 3) Yetkazildi -> 'delivered'
  const handleUpdateCustomerOrderStatus = (
    orderIds: string[],
    nextStatus: Order['status'],
    driverPhoneValue?: string
  ) => {
    const nowIso = new Date().toISOString();
    const cleanDriverPhone = driverPhoneValue ? driverPhoneValue.trim() : undefined;
    let affectedBuyerName = 'Mijoz';
    let affectedAddress = '';
    const updatedOrdersForFs: Order[] = [];

    setLocalOrderOverrides((prev) => {
      const next = { ...prev };
      orderIds.forEach((oid) => {
        if (!oid) return;
        next[oid] = {
          ...(next[oid] || {}),
          status: nextStatus,
          ...(cleanDriverPhone ? { driverPhone: cleanDriverPhone } : {}),
          updatedAt: nowIso,
        };
      });
      return next;
    });

    try {
      const savedOrders = localStorage.getItem('bunkerstroy_orders');
      const ordersList: Order[] = savedOrders ? JSON.parse(savedOrders) : [];
      if (Array.isArray(ordersList)) {
        const updatedList = ordersList.map((ord) => {
          if (ord && orderIds.includes(ord.id)) {
            affectedBuyerName = ord.recipientName || ord.buyerName || affectedBuyerName;
            affectedAddress = ord.deliveryAddress || affectedAddress;
            const nextOrd: Order = {
              ...ord,
              status: nextStatus,
              ...(cleanDriverPhone ? { driverPhone: cleanDriverPhone } : {}),
              updatedAt: nowIso,
            };
            updatedOrdersForFs.push(nextOrd);
            return nextOrd;
          }
          return ord;
        });
        saveOrdersToStorageSafe(updatedList);
      }
    } catch {}

    // Admin kabinetiga real vaqtda holat haqida log/hisobot yozish (agar Admin impersonatsiya qilmagan bo'lsa)
    if (!isAdminSession) {
      try {
        const statusLabel =
          nextStatus === 'assigned'
            ? 'Buyurtma qabul qilindi — Yuklash jarayonida'
            : nextStatus === 'in_transit'
            ? `Tasdiqlandi — Manzilga yuborildi (Yetkazib beruvchi tel: ${cleanDriverPhone || 'kiritilgan'})`
            : nextStatus === 'delivered'
            ? 'Buyurtma manzilga yetkazildi'
            : `Buyurtma holati: ${nextStatus}`;

        const savedLogs = localStorage.getItem('bunkerstroy_logs');
        const logsList = savedLogs ? JSON.parse(savedLogs) : [];
        logsList.unshift({
          id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          action: statusLabel,
          actor: `${supplierData.companyName} (${supplierData.name})`,
          category: 'orders_sales',
          details: `Mijoz: ${affectedBuyerName} • Manzil: ${formatRegionAndDistrictOnly(affectedAddress)}${
            cleanDriverPhone ? ` • Yetkazib beruvchi tel: ${cleanDriverPhone}` : ''
          }`,
          timestamp: nowIso,
          ip: '195.158.12.84',
          level: 'success',
        });
        localStorage.setItem('bunkerstroy_logs', JSON.stringify(logsList.slice(0, 250)));
      } catch {}
    }

    orderIds.forEach((oid) => {
      if (!oid) return;
      const fullOrd = updatedOrdersForFs.find((o) => o.id === oid);
      try {
        setDoc(
          doc(db, 'orders', oid),
          fullOrd
            ? fullOrd
            : {
                id: oid,
                status: nextStatus,
                ...(cleanDriverPhone ? { driverPhone: cleanDriverPhone } : {}),
                updatedAt: nowIso,
              },
          { merge: true }
        ).catch(() => {});
      } catch {}
    });

    window.dispatchEvent(new CustomEvent('bunkerstroy_orders_updated'));
    window.dispatchEvent(new CustomEvent('bunkerstroy-orders-updated'));
    window.dispatchEvent(new CustomEvent('bunkerstroy_finance_updated'));
    window.dispatchEvent(new Event('storage'));
    setOrdersRefreshTick((t) => t + 1);
  };

  // Zavod (B2B) kabinetida "Mijoz"dan kelgan mahsulot so'rovini tasdiqlash -> Mijoz shundan keyingina to'lov qiladi
  const handleApproveCustomerB2bOrder = (orderIds: string[]) => {
    const nowIso = new Date().toISOString();
    const updatedOrdersForFs: Order[] = [];

    setLocalOrderOverrides((prev) => {
      const next = { ...prev };
      orderIds.forEach((oid) => {
        if (!oid) return;
        next[oid] = {
          ...(next[oid] || {}),
          status: 'confirmed',
          paymentStatus: 'b2b_approved_unpaid',
          updatedAt: nowIso,
        };
      });
      return next;
    });

    try {
      const savedOrders = localStorage.getItem('bunkerstroy_orders');
      const ordersList: Order[] = savedOrders ? JSON.parse(savedOrders) : [];
      if (Array.isArray(ordersList)) {
        const updatedList = ordersList.map((ord) => {
          if (ord && orderIds.includes(ord.id)) {
            const nextOrd: Order = {
              ...ord,
              status: 'confirmed',
              paymentStatus: 'b2b_approved_unpaid',
              updatedAt: nowIso,
            };
            updatedOrdersForFs.push(nextOrd);
            return nextOrd;
          }
          return ord;
        });
        saveOrdersToStorageSafe(updatedList);
      }
    } catch {}

    orderIds.forEach((oid) => {
      if (!oid) return;
      const fullOrd = updatedOrdersForFs.find((o) => o.id === oid);
      try {
        setDoc(
          doc(db, 'orders', oid),
          fullOrd
            ? fullOrd
            : {
                id: oid,
                status: 'confirmed',
                paymentStatus: 'b2b_approved_unpaid',
                updatedAt: nowIso,
              },
          { merge: true }
        ).catch(() => {});
      } catch {}
    });

    window.dispatchEvent(new CustomEvent('bunkerstroy_orders_updated'));
    window.dispatchEvent(new CustomEvent('bunkerstroy-orders-updated'));
    window.dispatchEvent(new Event('storage'));
    setOrdersRefreshTick((t) => t + 1);
  };

  const handleConfirmWithDriverPhone = (custId: string, orderIds: string[], existingPhone?: string) => {
    const rawVal = driverPhoneInputs[custId] !== undefined ? driverPhoneInputs[custId] : existingPhone || '';
    const digits = rawVal.replace(/\D/g, '');
    const localDigits = digits.startsWith('998') ? digits.slice(3) : digits;
    if (localDigits.length < 9) {
      setDriverPhoneErrors((prev) => ({
        ...prev,
        [custId]: 'Yetkazib beruvchi telefon raqamini to‘liq kiriting!',
      }));
      return;
    }
    setDriverPhoneErrors((prev) => {
      const next = { ...prev };
      delete next[custId];
      return next;
    });
    const formattedPhone = formatUzPhoneInput(rawVal);
    handleUpdateCustomerOrderStatus(orderIds, 'in_transit', formattedPhone);
  };

  // Product Types registry
  const [productTypes, setProductTypes] = useState<ProductTypeItem[]>(() => getProductTypes());

  useEffect(() => {
    const handleUpdate = () => {
      setProductTypes(getProductTypes());
    };
    window.addEventListener('bunkerstroy_product_types_updated', handleUpdate);
    return () => window.removeEventListener('bunkerstroy_product_types_updated', handleUpdate);
  }, []);

  // Admin Kabinetida kiritilgan mahsulot toifalari + platformadagi mavjud mahsulot turlari tavsiya ro'yxati
  const adminCategories = useMemo(() => {
    return productTypes.map((pt) => pt.label);
  }, [productTypes]);

  const allPlatformCategorySuggestions = useMemo(() => {
    const baseLabels = productTypes.map((pt) => pt.label);
    const fromProducts = products.map((p) => (p.category || '').trim()).filter(Boolean);
    const fromTitles = products.map((p) => (p.title || '').trim()).filter(Boolean);
    return Array.from(new Set([...baseLabels, ...fromProducts, ...fromTitles]));
  }, [productTypes, products]);

  // Add / Edit Product Modal State
  const [newTitle, setNewTitle] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [showCategorySuggestions, setShowCategorySuggestions] = useState(false);
  const [manufacturersList, setManufacturersList] = useState<string[]>(() => getManufacturers());
  const [newManufacturer, setNewManufacturer] = useState('');
  const [manufacturerMode, setManufacturerMode] = useState<'list' | 'manual'>('manual');
  const [showManufacturerSuggestions, setShowManufacturerSuggestions] = useState(false);
  const [newPrice, setNewPrice] = useState<number | ''>('');
  const [newOriginalPrice, setNewOriginalPrice] = useState<number | ''>('');
  const [newCostPrice, setNewCostPrice] = useState<number | ''>('');
  const [newStock, setNewStock] = useState<number | ''>(100);
  const [newUnlimitedStock, setNewUnlimitedStock] = useState<boolean>(false);
  const [newUnit, setNewUnit] = useState('kg');
  const [newMinOrder, setNewMinOrder] = useState<number | ''>(1);
  const [newDesc, setNewDesc] = useState('');

  useEffect(() => {
    const syncMfg = () => {
      const base = getManufacturers();
      const fromProds = products
        .map((p) => (p.manufacturerName || '').trim())
        .filter((val) => val && !isCabinetCompanyName(val));
      const merged = Array.from(new Set([...base, ...fromProds]));
      setManufacturersList(merged);
    };
    syncMfg();
    window.addEventListener('bunkerstroy_manufacturers_updated', syncMfg);
    return () => window.removeEventListener('bunkerstroy_manufacturers_updated', syncMfg);
  }, [products]);

  // Mavjudligi (Variants): har bir mavjudlikda O'lchov birligi va Rang tanlanadi
  const [draftVariants, setDraftVariants] = useState<DraftProductVariant[]>([
    {
      id: 'var-1',
      unit: 'kg',
      colors: [],
      specification: '',
      price: '',
      originalPrice: '',
      minOrder: 1,
      isColorOpen: false,
    },
  ]);

  // Up to 12 product photos & product video
  const [newImages, setNewImages] = useState<string[]>([]);
  const [newVideoUrl, setNewVideoUrl] = useState<string>('');

  // Mahsulot haqida: 4 tagacha surat va izoh bloklari
  const [detailBlocks, setDetailBlocks] = useState<{ image: string; text: string }[]>([]);

  // Variations: Colors (up to 12)
  const [selectedColors, setSelectedColors] = useState<string[]>([]);
  const [isColorPaletteOpen, setIsColorPaletteOpen] = useState(false);

  // Parol orqali tasdiqlash (Yangi mahsulotni Bunkerga chiqarish tugmasi bosilganda parol so'raydi)
  const [prodPassPromptOpen, setProdPassPromptOpen] = useState(false);
  const [prodPassInput, setProdPassInput] = useState('');
  const [showProdPass, setShowProdPass] = useState(false);
  const [prodSmsPhoneChoice, setProdSmsPhoneChoice] = useState<'primary' | 'secondary'>('primary');
  const [prodSmsPhone, setProdSmsPhone] = useState(supplierData.phone || '+998 ');
  const [prodSmsSent, setProdSmsSent] = useState(false);
  const [prodSmsCode, setProdSmsCode] = useState('');
  const [prodSmsInput, setProdSmsInput] = useState('');
  const [prodSmsNotice, setProdSmsNotice] = useState<string | null>(null);
  const [productConfirmError, setProductConfirmError] = useState<string | null>(null);

  useEffect(() => {
    if (prodSmsPhoneChoice === 'secondary' && supplierData.secondaryPhone) {
      setProdSmsPhone(supplierData.secondaryPhone);
    } else {
      setProdSmsPhone(supplierData.phone || '+998 ');
    }
  }, [prodSmsPhoneChoice, supplierData.phone, supplierData.secondaryPhone]);

  // Parol asosida mahsulotni o'chirish modali holatlari
  const [productToDelete, setProductToDelete] = useState<Product | null>(null);
  const [deleteProductPassword, setDeleteProductPassword] = useState('');
  const [deleteProductPasswordError, setDeleteProductPasswordError] = useState<string | null>(null);
  const [showDeleteProductPass, setShowDeleteProductPass] = useState(false);

  const handleOpenDeleteProductModal = (prod: Product) => {
    setProductToDelete(prod);
    setDeleteProductPassword('');
    setDeleteProductPasswordError(null);
    setShowDeleteProductPass(false);
  };

  const handleConfirmDeleteProductWithPassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (!productToDelete || !onDeleteProduct) return;
    const expectedPassword = (supplierData.password || 'user123').trim();
    if (!deleteProductPassword.trim()) {
      setDeleteProductPasswordError('Mahsulotni o‘chirish uchun kabinet parolini kiriting!');
      return;
    }
    if (deleteProductPassword.trim() !== expectedPassword) {
      setDeleteProductPasswordError('Kiritilgan parol noto‘g‘ri! Iltimos, kabinet parolini to‘g‘ri kiriting.');
      return;
    }
    onDeleteProduct(productToDelete.id);
    setProductToDelete(null);
    setDeleteProductPassword('');
    setDeleteProductPasswordError(null);
  };

  const handleOpenAddProductModal = (source: 'products' | 'crm', defaultChannel: 'online' | 'offline' = 'online') => {
    setEditingProduct(null);
    setIsMavjudlikSectionCollapsed(false);
    setAddProductSource(source);
    setAddProductChannel(defaultChannel);
    setNewTitle('');
    setNewCategory('');
    setNewManufacturer('');
    setNewUnit('kg');
    setNewPrice('');
    setNewOriginalPrice('');
    setNewCostPrice('');
    setNewStock(100);
    setNewUnlimitedStock(false);
    setNewMinOrder(1);
    setNewDesc('');
    setDraftVariants([
      {
        id: 'var-1',
        unit: 'kg',
        unitValues: { Kv: '', metr: '', kg: '', dona: '' },
        colors: [],
        specification: '',
        price: '',
        originalPrice: '',
        minOrder: 1,
        isColorOpen: false,
        isCollapsed: false,
      },
    ]);
    setNewImages([]);
    setNewVideoUrl('');
    setDetailBlocks([]);
    setSelectedColors([]);
    setProdPassPromptOpen(false);
    setProdPassInput('');
    setShowProdPass(false);
    setProdSmsPhoneChoice('primary');
    setProdSmsPhone(supplierData.phone || '+998 ');
    setProdSmsSent(false);
    setProdSmsCode('');
    setProdSmsInput('');
    setProdSmsNotice(null);
    setProductConfirmError(null);
    setIsAddProductOpen(true);
  };

  const handleOpenEditProductModal = (prod: Product) => {
    setEditingProduct(prod);
    setIsMavjudlikSectionCollapsed(false);
    setAddProductSource('products');
    setAddProductChannel(prod.saleChannel === 'offline' ? 'offline' : 'online');
    setNewTitle(prod.title || '');
    setNewCategory(prod.category || '');
    setNewManufacturer(prod.manufacturerName || '');
    setNewUnit(prod.unit || 'kg');
    setNewPrice(prod.price || '');
    setNewOriginalPrice(prod.originalPrice || prod.price || '');
    setNewCostPrice(prod.costPrice || '');
    const isUnlim = Boolean(prod.unlimitedStock) || (typeof prod.stock === 'number' && prod.stock >= 999999999);
    setNewUnlimitedStock(isUnlim);
    setNewStock(isUnlim ? 1000 : typeof prod.stock === 'number' ? prod.stock : 0);
    setNewMinOrder(prod.minOrder || 1);
    setNewDesc(prod.description || '');
    if (prod.variants && prod.variants.length > 0) {
      setDraftVariants(
        prod.variants.map((v, idx) => {
          const u = v.unit || prod.unit || 'kg';
          const numMatch = (v.specification || '').match(/^(\d+(?:[.,]\d+)?)/);
          const extractedNum = numMatch ? numMatch[1] : '';
          return {
            id: v.id || `var-${idx + 1}`,
            unit: u,
            unitValues: { Kv: '', metr: '', kg: '', dona: '', [u]: extractedNum },
            colors: v.colors || [],
            specification: v.specification || '',
            price: v.price || prod.price || '',
            originalPrice: v.originalPrice || prod.originalPrice || prod.price || '',
            minOrder: v.minOrder || prod.minOrder || 1,
            isColorOpen: false,
            isCollapsed: true,
            isSaved: true,
          };
        })
      );
    } else {
      const u = prod.unit || 'kg';
      setDraftVariants([
        {
          id: 'var-1',
          unit: u,
          unitValues: { Kv: '', metr: '', kg: '', dona: '' },
          colors: prod.colors || [],
          specification: '',
          price: prod.price || '',
          originalPrice: prod.originalPrice || prod.price || '',
          minOrder: prod.minOrder || 1,
          isColorOpen: false,
          isCollapsed: false,
          isSaved: false,
        },
      ]);
    }
    setNewImages(prod.images && prod.images.length > 0 ? prod.images : prod.image ? [prod.image] : []);
    setNewVideoUrl(prod.videoUrl || '');
    setDetailBlocks(prod.detailBlocks || []);
    setSelectedColors(prod.colors || []);
    setProdPassPromptOpen(false);
    setProdPassInput('');
    setShowProdPass(false);
    setProdSmsPhoneChoice('primary');
    setProdSmsPhone(supplierData.phone || '+998 ');
    setProdSmsSent(false);
    setProdSmsCode('');
    setProdSmsInput('');
    setProdSmsNotice(null);
    setProductConfirmError(null);
    setIsAddProductOpen(true);
  };

  const handleAddDraftVariant = () => {
    setIsMavjudlikSectionCollapsed(false);
    setDraftVariants((prev) => [
      ...prev.map((v) => ({ ...v, isCollapsed: true, isSaved: true })),
      {
        id: `var-${Date.now()}-${prev.length + 1}`,
        unit: prev[prev.length - 1]?.unit || 'kg',
        unitValues: { Kv: '', metr: '', kg: '', dona: '' },
        colors: [],
        specification: '',
        price: newPrice || '',
        originalPrice: newOriginalPrice || '',
        minOrder: newMinOrder || 1,
        isColorOpen: false,
        isCollapsed: false,
        isSaved: false,
      },
    ]);
  };

  const handleRemoveDraftVariant = (varId: string) => {
    if (draftVariants.length <= 1) return;
    setDraftVariants((prev) => prev.filter((v) => v.id !== varId));
  };

  const handleUpdateDraftVariant = (varId: string, patch: Partial<DraftProductVariant>) => {
    setDraftVariants((prev) => prev.map((v) => (v.id === varId ? { ...v, ...patch } : v)));
  };

  const handleSaveSingleDraftVariant = (varId: string) => {
    setProductConfirmError(null);
    setDraftVariants((prev) =>
      prev.map((v, idx) => {
        if (v.id !== varId) return v;
        const u = v.unit || 'kg';
        const uNum = v.unitValues?.[u]?.trim() || '';
        const spec = uNum ? `${uNum} ${u}` : v.specification || `1 ${u}`;
        const savedPrice = v.price !== '' && Number(v.price) > 0 ? Number(v.price) : newPrice || '';
        if (idx === 0 && savedPrice && !newPrice) {
          setNewPrice(savedPrice);
        }
        return {
          ...v,
          specification: spec,
          price: savedPrice,
          isSaved: true,
          isCollapsed: true,
          isColorOpen: false,
        };
      })
    );
  };

  const handleToggleVariantColor = (varId: string, colorName: string) => {
    setDraftVariants((prev) =>
      prev.map((v) => {
        if (v.id !== varId) return v;
        const exists = v.colors.includes(colorName);
        if (exists) {
          return { ...v, colors: v.colors.filter((c) => c !== colorName) };
        }
        if (v.colors.length >= 12) return v;
        return { ...v, colors: [...v.colors, colorName] };
      })
    );
  };

  // B2B Orders sync with localStorage & Firestore
  useEffect(() => {
    const syncB2b = () => {
      try {
        const saved = localStorage.getItem('bunkerstroy_b2b_orders');
        if (saved) setB2bOrders(JSON.parse(saved));
      } catch {}
    };
    window.addEventListener('storage', syncB2b);
    window.addEventListener('bunkerstroy_b2b_updated', syncB2b);

    let unsubB2b: (() => void) | undefined;
    try {
      const q = collection(db, 'b2b_orders');
      unsubB2b = onSnapshot(
        q,
        (snap) => {
          const fsList: B2BOrderRequest[] = [];
          snap.forEach((d) => {
            const data = d.data() as B2BOrderRequest;
            if (data && data.id) fsList.push(data);
          });
          if (fsList.length > 0) {
            try {
              const saved = localStorage.getItem('bunkerstroy_b2b_orders');
              const localList: B2BOrderRequest[] = saved ? JSON.parse(saved) : [];
              const merged = new Map<string, B2BOrderRequest>();
              localList.forEach((o) => o && o.id && merged.set(o.id, o));
              fsList.forEach((fo) => merged.set(fo.id, fo));
              const arr = Array.from(merged.values()).sort(
                (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
              );
              localStorage.setItem('bunkerstroy_b2b_orders', JSON.stringify(arr));
              setB2bOrders(arr);
            } catch {}
          }
        },
        () => {}
      );
    } catch {}

    return () => {
      window.removeEventListener('storage', syncB2b);
      window.removeEventListener('bunkerstroy_b2b_updated', syncB2b);
      if (unsubB2b) unsubB2b();
    };
  }, []);

  const saveB2bOrdersList = (nextList: B2BOrderRequest[], changedOrder?: B2BOrderRequest) => {
    setB2bOrders(nextList);
    try {
      localStorage.setItem('bunkerstroy_b2b_orders', JSON.stringify(nextList));
    } catch {}
    if (changedOrder) {
      try {
        setDoc(doc(db, 'b2b_orders', changedOrder.id), changedOrder, { merge: true }).catch(() => {});
      } catch {}
    }
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('bunkerstroy_b2b_updated'));
      window.dispatchEvent(new Event('storage'));
    }, 0);
  };

  // Online vs Offline filtered products for Mahsulotlar tab
  const onlineCompanyProducts = useMemo(
    () => companyProducts.filter((p) => p.saleChannel !== 'offline'),
    [companyProducts]
  );
  const offlineCompanyProducts = useMemo(
    () => companyProducts.filter((p) => p.saleChannel === 'offline'),
    [companyProducts]
  );
  const displayedCompanyProducts =
    productsSubTab === 'online' ? onlineCompanyProducts : offlineCompanyProducts;

  // Helper: extract YYYY-MM-DD from sale.date
  const extractSaleDay = (dateStr?: string): string => {
    if (!dateStr) return new Date().toISOString().slice(0, 10);
    const trimmed = String(dateStr).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
      return trimmed.slice(0, 10);
    }
    const parsed = new Date(trimmed);
    if (!isNaN(parsed.getTime())) {
      return parsed.toISOString().slice(0, 10);
    }
    return trimmed.slice(0, 10);
  };

  const formatBuyerDisplayName = (rawName?: string): string => {
    if (!rawName) return 'Mijoz';
    if (
      supplierData.cabinetType === 'manufacturer' &&
      !rawName.includes('(B2B Hamkor)') &&
      !rawName.toLowerCase().includes('crm') &&
      !rawName.toLowerCase().includes('oflayn')
    ) {
      return 'Mijoz';
    }
    return rawName
      .replace(/Oflayn Xaridor/gi, 'CRM Xaridor')
      .replace(/Oflayn savdo/gi, 'CRM savdo');
  };

  const availableSaleDays = useMemo(() => {
    const daysSet = new Set<string>();
    supplierReport.sales.forEach((s) => {
      daysSet.add(extractSaleDay(s.date));
    });
    return Array.from(daysSet).sort((a, b) => (a < b ? 1 : -1));
  }, [supplierReport.sales]);

  const timeFilteredAllSales = useMemo(() => {
    const all = supplierReport.sales;
    if (all.length === 0) return [];

    // Reference anchor date (latest sale date or today)
    const anchorDayStr = availableSaleDays[0] || new Date().toISOString().slice(0, 10);
    const anchorMs = new Date(`${anchorDayStr}T23:59:59`).getTime();

    return all.filter((s) => {
      const sDay = extractSaleDay(s.date);
      if (reportTimeRange === 'daily') {
        if (selectedReportDay !== 'all_days') {
          return sDay === selectedReportDay;
        }
        return true;
      }
      const sMs = new Date(`${sDay}T12:00:00`).getTime();
      if (isNaN(sMs) || isNaN(anchorMs)) return true;
      const diffDays = (anchorMs - sMs) / (1000 * 60 * 60 * 24);
      if (reportTimeRange === 'weekly') {
        return diffDays <= 7;
      }
      if (reportTimeRange === 'monthly') {
        if (selectedReportMonth !== 'all_months') {
          const saleMonthIdx = parseInt(sDay.slice(5, 7), 10) - 1;
          return saleMonthIdx === selectedReportMonth;
        }
        return true;
      }
      return true;
    });
  }, [supplierReport.sales, availableSaleDays, reportTimeRange, selectedReportDay, selectedReportMonth]);

  // Online, Offline (CRM), and General sales for Hisobot, monitoring tab (3 sub-tabs)
  // ALGORITM: Onlayndagi savdo ma'lumotlari bilan Oflayn (CRM) alohida tizimda ishlaydi.
  // CRM da olib borilgan savdolar Admin hisob-kitobi va Bunker uchun ajratiladigan ulush EMAS!
  const onlineReportSales = useMemo(
    () => timeFilteredAllSales.filter((s) => s.orderChannel !== 'offline'),
    [timeFilteredAllSales]
  );
  const offlineReportSales = useMemo(
    () => timeFilteredAllSales.filter((s) => s.orderChannel === 'offline'),
    [timeFilteredAllSales]
  );
  const generalReportSales = timeFilteredAllSales;
  const displayedReportSales = useMemo(() => {
    if (reportsSubTab === 'online') return onlineReportSales;
    if (reportsSubTab === 'offline') return offlineReportSales;
    return generalReportSales;
  }, [reportsSubTab, onlineReportSales, offlineReportSales, generalReportSales]);

  const onlineSalesTotalSum = useMemo(
    () => onlineReportSales.reduce((acc, s) => acc + (Number(s.totalSum) || 0), 0),
    [onlineReportSales]
  );
  const offlineCrmSalesTotalSum = useMemo(
    () => offlineReportSales.reduce((acc, s) => acc + (Number(s.totalSum) || 0), 0),
    [offlineReportSales]
  );
  const generalSalesTotalSum = onlineSalesTotalSum + offlineCrmSalesTotalSum;

  // Bunker Stroy ulushi FAQAT Onlayn savdolardan hisoblanadi (CRM savdolaridan 0 so'm!)
  const onlineBunkerCommissionSum = useMemo(() => {
    const rate = Math.min(100, Math.max(0.1, Number(supplierReport.commissionRate) || 1));
    const basis = supplierReport.commissionBasis === 'profit' ? 'profit' : 'total';
    const onlineProfit = onlineReportSales.reduce(
      (acc, s) => acc + (Number(s.profitSum) || Math.round((Number(s.totalSum) || 0) * 0.2)),
      0
    );
    const baseSum = basis === 'profit' ? onlineProfit : onlineSalesTotalSum;
    return Math.round((baseSum * rate) / 100);
  }, [onlineReportSales, onlineSalesTotalSum, supplierReport.commissionRate, supplierReport.commissionBasis]);

  const onlineSupplierNetSum = Math.max(0, onlineSalesTotalSum - onlineBunkerCommissionSum);
  const generalSupplierNetSum = onlineSupplierNetSum + offlineCrmSalesTotalSum;

  const getSaleItemBunkerCommission = (sale: typeof supplierReport.sales[number]): number => {
    if (sale.orderChannel === 'offline') return 0;
    const rate = Math.min(100, Math.max(0.1, Number(supplierReport.commissionRate) || 1));
    const basis = supplierReport.commissionBasis === 'profit' ? 'profit' : 'total';
    const itemProfit = Number(sale.profitSum) || Math.round((Number(sale.totalSum) || 0) * 0.2);
    const base = basis === 'profit' ? itemProfit : Number(sale.totalSum) || 0;
    return Math.round((base * rate) / 100);
  };

  // Har bir hisobot kunlik ajralib turishi uchun kunlar bo'yicha guruhlash
  const dailyGroupedReportSales = useMemo(() => {
    const groupsMap = new Map<
      string,
      {
        day: string;
        items: typeof displayedReportSales;
        totalSum: number;
        onlineSum: number;
        crmSum: number;
        commissionSum: number;
        netSum: number;
      }
    >();

    displayedReportSales.forEach((sale) => {
      const dayKey = extractSaleDay(sale.date);
      const isOff = sale.orderChannel === 'offline';
      const sSum = Number(sale.totalSum) || 0;
      const comm = getSaleItemBunkerCommission(sale);
      const net = Math.max(0, sSum - comm);
      const existing = groupsMap.get(dayKey);
      if (existing) {
        existing.items.push(sale);
        existing.totalSum += sSum;
        if (isOff) existing.crmSum += sSum;
        else existing.onlineSum += sSum;
        existing.commissionSum += comm;
        existing.netSum += net;
      } else {
        groupsMap.set(dayKey, {
          day: dayKey,
          items: [sale],
          totalSum: sSum,
          onlineSum: isOff ? 0 : sSum,
          crmSum: isOff ? sSum : 0,
          commissionSum: comm,
          netSum: net,
        });
      }
    });

    return Array.from(groupsMap.values()).sort((a, b) => (a.day < b.day ? 1 : -1));
  }, [displayedReportSales, supplierReport.commissionRate, supplierReport.commissionBasis]);

  // Monitoring hisobotini haqiqiy PDF fayl (.pdf) sifatida yuklab olish
  const handleDownloadMonitoringPdf = () => {
    const reportTitle =
      reportsSubTab === 'general'
        ? '1. Umumiy Monitoring Hisoboti (Onlayn + CRM)'
        : reportsSubTab === 'online'
        ? '2. Onlayn Savdo Monitoringi Hisoboti'
        : reportsSubTab === 'offline'
        ? '3. CRM Monitoringi Hisoboti (CRM savdo)'
        : '4. Kirim-Chiqim Monitoringi Hisoboti';
    const selectedMonthObj =
      selectedReportMonth !== 'all_months'
        ? REPORT_MONTHS_LIST.find((m) => m.id === selectedReportMonth)
        : undefined;
    const periodLabel =
      reportTimeRange === 'daily'
        ? selectedReportDay === 'all_days'
          ? 'Kunlik (Barcha kunlar kesimida)'
          : `Kunlik (${selectedReportDay})`
        : reportTimeRange === 'weekly'
        ? 'Haftalik'
        : selectedMonthObj
        ? `Oylik (${selectedMonthObj.label})`
        : 'Oylik (Barcha oylar)';
    const nowFormatted = new Date().toLocaleString('uz-UZ');

    downloadMonitoringPdfFile({
      reportTitle,
      companyName: supplierData.companyName,
      inn: supplierData.inn,
      region: supplierData.region,
      phone: supplierData.phone,
      periodLabel,
      subTab: reportsSubTab === 'pending_debts' ? 'general' : reportsSubTab,
      commissionRate: supplierData.commissionRate || 0,
      onlineBunkerCommissionSum,
      nowFormatted,
      generalSalesTotalSum,
      generalSalesCount: generalReportSales.length,
      onlineSalesTotalSum,
      offlineCrmSalesTotalSum,
      generalSupplierNetSum,
      showCommissionColumn: reportsSubTab !== 'offline',
      dailyGroups: dailyGroupedReportSales.map((g) => ({
        ...g,
        items: g.items.map((sale) => {
          const comm = getSaleItemBunkerCommission(sale);
          const net = Math.max(0, (Number(sale.totalSum) || 0) - comm);
          return {
            ...sale,
            commission: comm,
            net,
          };
        }),
      })),
      getSaleItemBunkerCommission,
      formatBuyerDisplayName,
    });
  };

  // B2B Orders for current Supplier (outgoing requests made by B2C supplier) vs Manufacturer (incoming requests to B2B manufacturer)
  const myOutgoingB2bOrders = useMemo(() => {
    if (supplierData.cabinetType === 'manufacturer') return [];
    const myComp = (supplierData.companyName || '').trim().toLowerCase();
    return b2bOrders.filter((o) => {
      if (o.buyerSupplierId && supplierData.id) {
        return o.buyerSupplierId === supplierData.id;
      }
      if (o.buyerInn && supplierData.inn && o.buyerInn === supplierData.inn) return true;
      return (o.buyerCompanyName || '').trim().toLowerCase() === myComp;
    });
  }, [b2bOrders, supplierData]);

  const incomingManufacturerB2bOrders = useMemo(() => {
    if (supplierData.cabinetType !== 'manufacturer') return [];
    const myComp = (supplierData.companyName || '').trim().toLowerCase();
    return b2bOrders.filter((o) => {
      if (o.manufacturerId && supplierData.id) {
        return o.manufacturerId === supplierData.id;
      }
      if (o.manufacturerInn && supplierData.inn && o.manufacturerInn === supplierData.inn) return true;
      const mComp = (o.manufacturerCompanyName || '').trim().toLowerCase();
      if (mComp && myComp && (mComp === myComp || mComp.includes(myComp) || myComp.includes(mComp))) return true;
      return false;
    });
  }, [b2bOrders, supplierData]);

  const awaitingPaymentB2bCount = useMemo(
    () => myOutgoingB2bOrders.filter((o) => o.status === 'approved_awaiting_payment').length,
    [myOutgoingB2bOrders]
  );

  const pendingIncomingB2bCount = useMemo(
    () =>
      incomingManufacturerB2bOrders.filter(
        (o) =>
          o.status === 'requested' ||
          o.status === 'approved_awaiting_payment' ||
          o.status === 'paid' ||
          o.status === 'preparing'
      ).length,
    [incomingManufacturerB2bOrders]
  );

  const getDefaultB2bBankAccountText = (ord?: B2BOrderRequest) => {
    const comp = ord?.manufacturerCompanyName || supplierData.companyName || 'B2B Ta\'minotchi';
    const inn = ord?.manufacturerInn || supplierData.inn || '309123456';
    return `H/R: 2020 8000 9054 1234 5001 | MFO: 00401 | STIR: ${inn} | Bank: Milliy Bank AJ | Korxona: «${comp}»`;
  };

  // Add item to B2B Cart
  const handleAddToB2bCart = (product: Product) => {
    const varIdx = b2bVariantIdxInputs[product.id] ?? 0;
    const chosenVar = product.variants && product.variants.length > 0 ? product.variants[varIdx] || product.variants[0] : undefined;
    const unit = chosenVar?.unit || product.unit || 'dona';
    const price = chosenVar ? chosenVar.originalPrice || chosenVar.price : product.originalPrice || product.price;
    const spec = chosenVar?.specification || '';
    const availableColors = chosenVar?.colors && chosenVar.colors.length > 0 ? chosenVar.colors : product.colors || [];
    const color = b2bColorInputs[product.id] || availableColors[0] || '';
    const varMinOrder = Math.max(1, Number(chosenVar?.minOrder || product.minOrder || 1));
    const qty = Math.max(varMinOrder, Number(b2bQtyInputs[product.id]) || varMinOrder);
    const key = `${product.id}-${unit}-${spec}-${color}`;

    setB2bCart((prev) => {
      const existing = prev.find((it) => it.key === key);
      if (existing) {
        return prev.map((it) => (it.key === key ? { ...it, quantity: it.quantity + qty } : it));
      }
      return [
        ...prev,
        {
          key,
          product,
          unit,
          color: color || undefined,
          specification: spec || undefined,
          price,
          quantity: qty,
        },
      ];
    });
    setB2bNoticeMessage(`«${product.title}» (${qty} ${unit}) B2B savatga yuklandi!`);
    setTimeout(() => setB2bNoticeMessage(null), 2500);
  };

  // Build preview B2BOrderRequest from current B2B cart (for PDF preview before sending)
  const buildDraftB2bManifestFromCart = (): B2BOrderRequest | null => {
    if (b2bCart.length === 0) return null;
    const firstProd = b2bCart[0].product;
    const matchedManuf = allSuppliersList.find(
      (s) =>
        s.id === firstProd.supplierId ||
        (s.companyName || '').toLowerCase() === (firstProd.supplierName || '').toLowerCase()
    );
    const items: B2BOrderItem[] = b2bCart.map((c) => ({
      productId: c.product.id,
      title: c.product.title,
      category: c.product.category,
      unit: c.unit,
      specification: c.specification,
      color: c.color,
      quantity: c.quantity,
      price: c.price,
      totalSum: c.price * c.quantity,
      image: c.product.image,
      manufacturerId: c.product.supplierId || matchedManuf?.id,
      manufacturerInn: c.product.supplierInn || matchedManuf?.inn,
      manufacturerName: c.product.supplierName,
    }));
    const totalAmount = items.reduce((s, i) => s + i.totalSum, 0);
    return {
      id: `B2B-${Date.now().toString().slice(-6)}`,
      buyerSupplierId: supplierData.id,
      buyerCompanyName: supplierData.companyName,
      buyerInn: supplierData.inn || supplierData.companyInfo?.inn || '313086503',
      buyerDirector:
        supplierData.companyInfo?.director ||
        [supplierData.surname, supplierData.name].filter(Boolean).join(' ') ||
        supplierData.name,
      buyerPhone: supplierData.phone,
      buyerRegion: supplierData.region,
      buyerAddress: supplierData.companyInfo?.address || supplierData.companyInfo?.locality || supplierData.region,
      buyerContractNumber: supplierData.contractNumber || '№ B2B-101',
      buyerCompanyInfo: supplierData.companyInfo,
      manufacturerId: firstProd.supplierId || matchedManuf?.id,
      manufacturerInn: firstProd.supplierInn || matchedManuf?.inn,
      manufacturerCompanyName: firstProd.supplierName,
      manufacturerPhone: matchedManuf?.phone || '',
      manufacturerRegion: firstProd.region || matchedManuf?.region || '',
      items,
      totalAmount,
      status: 'requested',
      createdAt: new Date().toISOString(),
    };
  };

  // Send B2B Request from B2C Cabinet to B2B Cabinet
  const handleSendB2bRequest = () => {
    const manifest = buildDraftB2bManifestFromCart();
    if (!manifest) return;
    const nextList = [manifest, ...b2bOrders];
    saveB2bOrdersList(nextList, manifest);
    setB2bCart([]);
    setPreviewB2bManifest(manifest);
    setB2bNoticeMessage(
      `B2B so‘rov (#${manifest.id}) «${manifest.manufacturerCompanyName}» B2B kabinetiga muvaffaqiyatli yuborildi!`
    );
    setTimeout(() => setB2bNoticeMessage(null), 4000);
  };

  // Step 1 (B2B Cabinet): Accept incoming B2C request & send Bank Account Details ("Hisob raqam ma'lumotlari") to B2C Cabinet
  const handleAcceptB2bRequestAndSendBankDetails = (orderId: string) => {
    const targetOrd = b2bOrders.find((o) => o.id === orderId);
    const rawBank =
      b2bBankAccountInputs[orderId] !== undefined
        ? b2bBankAccountInputs[orderId]
        : targetOrd?.bankAccountDetails || getDefaultB2bBankAccountText(targetOrd);
    const cleanedBank = rawBank.trim();
    if (!cleanedBank) {
      setB2bBankAccountErrors((prev) => ({
        ...prev,
        [orderId]: "B2C kabinetga jo‘natish uchun hisob raqam ma'lumotlarini kiriting!",
      }));
      return;
    }
    setB2bBankAccountErrors((prev) => {
      const next = { ...prev };
      delete next[orderId];
      return next;
    });

    const nowIso = new Date().toISOString();
    let updatedOrder: B2BOrderRequest | undefined;
    const nextList = b2bOrders.map((o) => {
      if (o.id === orderId) {
        updatedOrder = {
          ...o,
          status: 'approved_awaiting_payment',
          bankAccountDetails: cleanedBank,
          approvedAt: nowIso,
        };
        return updatedOrder;
      }
      return o;
    });
    saveB2bOrdersList(nextList, updatedOrder);
  };

  // Step 2 (B2C Cabinet): B2C sees acceptance notification & Bank Account Details, and sends payment ("To'lovni jo'natish")
  // Once payment is sent, the process continues in B2B Cabinet ("To'lov jo'natilgach jarayon davom etadi")
  const handleSendB2bPaymentFromB2c = (orderId: string) => {
    const nowIso = new Date().toISOString();
    let updatedOrder: B2BOrderRequest | undefined;
    const nextList = b2bOrders.map((o) => {
      if (o.id === orderId) {
        updatedOrder = {
          ...o,
          status: 'paid',
          paidAt: nowIso,
        };
        return updatedOrder;
      }
      return o;
    });
    saveB2bOrdersList(nextList, updatedOrder);

    if (updatedOrder) {
      try {
        const savedOrders = localStorage.getItem('bunkerstroy_orders');
        const list: Order[] = savedOrders ? JSON.parse(savedOrders) : [];
        const existingIdx = list.findIndex((ord) => ord.id === updatedOrder!.id);
        const syncedOrder: Order = {
          id: updatedOrder.id,
          orderChannel: 'online',
          buyerId: updatedOrder.buyerSupplierId,
          buyerName: `${updatedOrder.buyerCompanyName} (B2C Kabinet)`,
          buyerPhone: updatedOrder.buyerPhone,
          items: updatedOrder.items.map((it) => ({
            productId: it.productId,
            title: `${it.title}${it.specification ? ` [${it.specification}]` : ''}${it.color ? ` (${it.color})` : ''}`,
            quantity: it.quantity,
            unit: it.unit,
            price: it.price,
            category: it.category,
            supplierId: it.manufacturerId,
            supplierInn: it.manufacturerInn,
            supplierName: it.manufacturerName,
          })),
          totalAmount: updatedOrder.totalAmount,
          status: 'confirmed',
          deliveryAddress: updatedOrder.buyerAddress || updatedOrder.buyerRegion || 'Toshkent sh.',
          recipientName: updatedOrder.buyerCompanyName,
          recipientPhone: updatedOrder.buyerPhone,
          paymentMethod: 'card',
          paymentStatus: 'paid',
          paidAt: nowIso,
          vehicleType: 'B2B Maxsus Yuk Transporti',
          createdAt: updatedOrder.createdAt || nowIso,
          updatedAt: nowIso,
        };
        const nextOrders =
          existingIdx >= 0
            ? list.map((ord, idx) => (idx === existingIdx ? syncedOrder : ord))
            : [syncedOrder, ...list];
        localStorage.setItem('bunkerstroy_orders', JSON.stringify(nextOrders));
        setDoc(doc(db, 'orders', syncedOrder.id), syncedOrder, { merge: true }).catch(() => {});
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('bunkerstroy_orders_updated'));
          window.dispatchEvent(new CustomEvent('bunkerstroy_finance_updated'));
        }, 0);
        setOrdersRefreshTick((t) => t + 1);
      } catch {}
    }

    setB2bNoticeMessage(
      `To‘lov (#${orderId}) B2B kabinet hisob raqamiga muvaffaqiyatli jo‘natildi! Endi B2B kabinet mahsulotlarni tayyorlash va manzilga yuborish jarayonini davom ettiradi.`
    );
    setTimeout(() => setB2bNoticeMessage(null), 5000);
  };

  // Step 3 (B2B Cabinet after payment is sent): "Mahsulotlarni tayyorlash jarayoni" -> sets status to 'preparing' ("Mahsulot yuklash jarayonida" in B2C Buyurtmalarim)
  const handleStartPreparingB2bOrder = (orderId: string) => {
    const nowIso = new Date().toISOString();
    let updatedOrder: B2BOrderRequest | undefined;
    const nextList = b2bOrders.map((o) => {
      if (o.id === orderId) {
        updatedOrder = {
          ...o,
          status: 'preparing',
          approvedAt: o.approvedAt || nowIso,
        };
        return updatedOrder;
      }
      return o;
    });
    saveB2bOrdersList(nextList, updatedOrder);

    if (updatedOrder) {
      try {
        const savedOrders = localStorage.getItem('bunkerstroy_orders');
        const list: Order[] = savedOrders ? JSON.parse(savedOrders) : [];
        const existingIdx = list.findIndex((ord) => ord.id === updatedOrder!.id);
        const syncedOrder: Order = {
          id: updatedOrder.id,
          orderChannel: 'online',
          buyerId: updatedOrder.buyerSupplierId,
          buyerName: `${updatedOrder.buyerCompanyName} (B2C Kabinet)`,
          buyerPhone: updatedOrder.buyerPhone,
          items: updatedOrder.items.map((it) => ({
            productId: it.productId,
            title: `${it.title}${it.specification ? ` [${it.specification}]` : ''}${it.color ? ` (${it.color})` : ''}`,
            quantity: it.quantity,
            unit: it.unit,
            price: it.price,
            category: it.category,
            supplierId: it.manufacturerId,
            supplierInn: it.manufacturerInn,
            supplierName: it.manufacturerName,
          })),
          totalAmount: updatedOrder.totalAmount,
          status: 'assigned',
          deliveryAddress: updatedOrder.buyerAddress || updatedOrder.buyerRegion || 'Toshkent sh.',
          recipientName: updatedOrder.buyerCompanyName,
          recipientPhone: updatedOrder.buyerPhone,
          paymentMethod: 'card',
          paymentStatus: 'paid',
          paidAt: updatedOrder.paidAt || nowIso,
          vehicleType: 'B2B Maxsus Yuk Transporti',
          createdAt: updatedOrder.createdAt || nowIso,
          updatedAt: nowIso,
        };
        const nextOrders =
          existingIdx >= 0
            ? list.map((ord, idx) => (idx === existingIdx ? syncedOrder : ord))
            : [syncedOrder, ...list];
        localStorage.setItem('bunkerstroy_orders', JSON.stringify(nextOrders));
        setDoc(doc(db, 'orders', syncedOrder.id), syncedOrder, { merge: true }).catch(() => {});
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('bunkerstroy_orders_updated'));
        }, 0);
        setOrdersRefreshTick((t) => t + 1);
      } catch {}
    }
  };

  // Step 4 (B2B Cabinet): "Mahsulotni manzilga yuborish" with Yetkazib beruvchi nomeri -> sets status to 'in_transit' ("Yetkazilmoqda")
  const handleShipB2bOrderWithDriverPhone = (orderId: string, fallbackPhone?: string) => {
    const rawPhone = driverPhoneInputs[orderId] !== undefined ? driverPhoneInputs[orderId] : fallbackPhone || '';
    const cleaned = rawPhone.trim();
    const digitsOnly = cleaned.replace(/\D/g, '');
    if (digitsOnly.length < 9) {
      setDriverPhoneErrors((prev) => ({
        ...prev,
        [orderId]: 'Yetkazib beruvchi nomerini to‘liq kiriting! (Masalan: +998 90 123 45 67)',
      }));
      return;
    }
    setDriverPhoneErrors((prev) => {
      const next = { ...prev };
      delete next[orderId];
      return next;
    });

    const nowIso = new Date().toISOString();
    let updatedOrder: B2BOrderRequest | undefined;
    const nextList = b2bOrders.map((o) => {
      if (o.id === orderId) {
        updatedOrder = {
          ...o,
          status: 'in_transit',
          driverPhone: cleaned,
          shippedAt: nowIso,
        };
        return updatedOrder;
      }
      return o;
    });
    saveB2bOrdersList(nextList, updatedOrder);

    if (updatedOrder) {
      try {
        const savedOrders = localStorage.getItem('bunkerstroy_orders');
        const list: Order[] = savedOrders ? JSON.parse(savedOrders) : [];
        const existingIdx = list.findIndex((ord) => ord.id === updatedOrder!.id);
        const syncedOrder: Order = {
          id: updatedOrder.id,
          orderChannel: 'online',
          buyerId: updatedOrder.buyerSupplierId,
          buyerName: `${updatedOrder.buyerCompanyName} (B2C Kabinet)`,
          buyerPhone: updatedOrder.buyerPhone,
          items: updatedOrder.items.map((it) => ({
            productId: it.productId,
            title: `${it.title}${it.specification ? ` [${it.specification}]` : ''}${it.color ? ` (${it.color})` : ''}`,
            quantity: it.quantity,
            unit: it.unit,
            price: it.price,
            category: it.category,
            supplierId: it.manufacturerId,
            supplierInn: it.manufacturerInn,
            supplierName: it.manufacturerName,
          })),
          totalAmount: updatedOrder.totalAmount,
          status: 'in_transit',
          driverPhone: cleaned,
          deliveryAddress: updatedOrder.buyerAddress || updatedOrder.buyerRegion || 'Toshkent sh.',
          recipientName: updatedOrder.buyerCompanyName,
          recipientPhone: updatedOrder.buyerPhone,
          paymentMethod: 'card',
          paymentStatus: 'paid',
          paidAt: updatedOrder.paidAt || nowIso,
          vehicleType: 'B2B Maxsus Yuk Transporti',
          createdAt: updatedOrder.createdAt || nowIso,
          updatedAt: nowIso,
        };
        const nextOrders =
          existingIdx >= 0
            ? list.map((ord, idx) => (idx === existingIdx ? syncedOrder : ord))
            : [syncedOrder, ...list];
        localStorage.setItem('bunkerstroy_orders', JSON.stringify(nextOrders));
        setDoc(doc(db, 'orders', syncedOrder.id), syncedOrder, { merge: true }).catch(() => {});
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('bunkerstroy_orders_updated'));
          window.dispatchEvent(new CustomEvent('bunkerstroy_finance_updated'));
        }, 0);
        setOrdersRefreshTick((t) => t + 1);
      } catch {}
    }
  };

  // Step 5: Mark B2B order as delivered ("Sotib olingan")
  const handleMarkB2bOrderDelivered = (orderId: string) => {
    const nowIso = new Date().toISOString();
    let updatedOrder: B2BOrderRequest | undefined;
    const nextList = b2bOrders.map((o) => {
      if (o.id === orderId) {
        updatedOrder = {
          ...o,
          status: 'delivered',
        };
        return updatedOrder;
      }
      return o;
    });
    saveB2bOrdersList(nextList, updatedOrder);

    if (updatedOrder) {
      try {
        const savedOrders = localStorage.getItem('bunkerstroy_orders');
        const list: Order[] = savedOrders ? JSON.parse(savedOrders) : [];
        const nextOrders = list.map((ord) =>
          ord.id === updatedOrder!.id ? { ...ord, status: 'delivered' as const, updatedAt: nowIso } : ord
        );
        localStorage.setItem('bunkerstroy_orders', JSON.stringify(nextOrders));
        setDoc(doc(db, 'orders', updatedOrder.id), { status: 'delivered', updatedAt: nowIso }, { merge: true }).catch(() => {});
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('bunkerstroy_orders_updated'));
          window.dispatchEvent(new CustomEvent('bunkerstroy_finance_updated'));
        }, 0);
        setOrdersRefreshTick((t) => t + 1);
      } catch {}
    }
  };

  const handleApproveB2bOrder = (orderId: string) => {
    handleAcceptB2bRequestAndSendBankDetails(orderId);
  };

  const handlePayAndShipB2bOrder = (orderId: string) => {
    handleSendB2bPaymentFromB2c(orderId);
  };

  // Generate & Download PDF for Platform Customer Order Request ("Mijozlar so'rovi")
  const handlePrintOrDownloadCustomerOrderPdf = (cust: (typeof supplierCustomers)[0]) => {
    const statusText =
      cust.status === 'pending' || cust.status === 'confirmed'
        ? "Yangi mahsulot so'rovi"
        : cust.status === 'assigned'
        ? 'Mahsulot yuklash jarayonida'
        : cust.status === 'in_transit'
        ? `Yetkazilmoqda${cust.driverPhone ? ` (Bog'lanish uchun tel: ${cust.driverPhone})` : ''}`
        : 'Yetkazilgan';

    downloadCustomerOrderPdfFile(
      {
        orderIds: cust.orderIds,
        lastOrderDate: cust.lastOrderDate,
        status: statusText,
        statusText,
        companyName: supplierData.companyName,
        supplierInn: supplierData.inn,
        supplierPhone: supplierData.phone,
        supplierRegion: supplierData.region,
        customerName: cust.name,
        name: cust.name,
        phone: cust.phone,
        address: cust.address,
        customerPhone: cust.phone,
        customerAddress: cust.address,
        driverPhone: cust.driverPhone,
        itemsList: cust.itemsList || [],
        totalSpent: cust.totalSpent,
      },
      {
        companyName: supplierData.companyName,
        inn: supplierData.inn,
        phone: supplierData.phone,
        region: supplierData.region,
      }
    );
  };

  // Generate & Download PDF Cargo Manifest & Supplier Company Info (.pdf)
  const handlePrintOrDownloadB2bPdf = (manifest: B2BOrderRequest) => {
    downloadB2bManifestPdfFile(manifest);
  };

  // Complete CRM Sale from active CRM Basket -> records into CRM Sales Report, General Report & deducts from Stock
  const handleCompleteCrmOfflineSale = () => {
    if (selectedCrmEntries.length === 0) return;

    // Ombor qoldig'ini tekshirish (har bir mahsulotning barcha tanlangan variantlari bo'yicha jami miqdor)
    const qtyByProdId = new Map<string, { prod: Product; totalQty: number }>();
    for (const entry of selectedCrmEntries) {
      const q = getCrmEntryQty(entry.entryKey, entry.prod);
      const prev = qtyByProdId.get(entry.prod.id);
      qtyByProdId.set(entry.prod.id, {
        prod: entry.prod,
        totalQty: (prev?.totalQty || 0) + q,
      });
    }

    for (const { prod, totalQty } of qtyByProdId.values()) {
      const isUnlim = Boolean(prod.unlimitedStock) || (typeof prod.stock === 'number' && prod.stock >= 999999999);
      if (isUnlim) continue;
      const avail = typeof prod.stock === 'number' ? Math.max(0, prod.stock) : 0;
      if (avail <= 0 || totalQty > avail) {
        setCrmStockWarning(
          `«${prod.title}» — Ombordagi miqdor yetarli emas! (Omborda mavjud: ${avail} ${prod.unit})`
        );
        setTimeout(() => setCrmStockWarning(null), 4000);
        return;
      }
    }

    const nowIso = new Date().toISOString();
    const newOrderId = `CRM-${Date.now().toString().slice(-6)}`;
    const items = selectedCrmEntries.map((entry) => {
      const q = getCrmEntryQty(entry.entryKey, entry.prod);
      return {
        productId: entry.prod.id,
        title: entry.displayTitle,
        quantity: q,
        unit: entry.unitSpec,
        price: entry.crmPrice,
        totalSum: entry.crmPrice * q,
        category: entry.prod.category,
        supplierId: supplierData.id,
        supplierInn: supplierData.inn,
        supplierName: supplierData.companyName,
      };
    });

    const newOfflineOrder: Order = {
      id: newOrderId,
      orderChannel: 'offline',
      buyerId: `crm-client-${Date.now()}`,
      buyerName: crmClientName.trim() || `CRM savdo (${activeCrmBasket.name})`,
      buyerPhone: crmClientPhone.trim() || supplierData.phone || '+998 —',
      items,
      totalAmount: crmCalculation.finalSum,
      status: 'delivered',
      deliveryAddress: `${supplierData.region || 'Toshkent'} (CRM savdo)`,
      recipientName: crmClientName.trim() || `CRM savdo (${activeCrmBasket.name})`,
      recipientPhone: crmClientPhone.trim() || '—',
      paymentMethod: 'cash',
      paymentStatus: 'paid',
      paidAt: nowIso,
      vehicleType: 'CRM savdo',
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    try {
      const saved = localStorage.getItem('bunkerstroy_orders');
      const list: Order[] = saved ? JSON.parse(saved) : [];
      localStorage.setItem('bunkerstroy_orders', JSON.stringify([newOfflineOrder, ...list]));
      setDoc(doc(db, 'orders', newOfflineOrder.id), newOfflineOrder, { merge: true }).catch(() => {});
    } catch {}

    // Ombordagi mahsulot miqdoridan sotilgan CRM hajmni chegirish
    try {
      const savedProds = localStorage.getItem('bunkerstroy_products');
      const prodList: Product[] = savedProds ? JSON.parse(savedProds) : [];
      const updatedMap = new Map<string, Product>();

      qtyByProdId.forEach(({ prod, totalQty }) => {
        const isUnlim = Boolean(prod.unlimitedStock) || (typeof prod.stock === 'number' && prod.stock >= 999999999);
        const nextStock = isUnlim ? 999999999 : Math.max(0, (Number(prod.stock) || 0) - totalQty);
        const nextSales = (Number(prod.salesCount) || 0) + totalQty;
        const updatedProd: Product = {
          ...prod,
          stock: nextStock,
          ...(isUnlim ? { unlimitedStock: true } : {}),
          salesCount: nextSales,
        };
        updatedMap.set(prod.id, updatedProd);
        try {
          onAddProduct(updatedProd);
        } catch {}
        try {
          setDoc(doc(db, 'products', prod.id), { stock: nextStock, salesCount: nextSales }, { merge: true }).catch(() => {});
        } catch {}
      });

      if (Array.isArray(prodList) && prodList.length > 0) {
        const nextList = prodList.map((p) => (p && updatedMap.has(p.id) ? { ...p, ...updatedMap.get(p.id)! } : p));
        localStorage.setItem('bunkerstroy_products', JSON.stringify(nextList));
      }
      window.dispatchEvent(new CustomEvent('bunkerstroy_products_updated'));
    } catch {}

    setCrmSelectedIds([]);
    setCrmStockWarning(null);
    setCrmSaleSuccessNotice(
      `${activeCrmBasket.name} bo‘yicha ${formatPrice(crmCalculation.finalSum)} miqdoridagi CRM savdo tasdiqlandi va ombor qoldig‘idan chegirildi!`
    );
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('bunkerstroy_orders_updated'));
      window.dispatchEvent(new CustomEvent('bunkerstroy_finance_updated'));
    }, 0);
    setOrdersRefreshTick((t) => t + 1);
    setTimeout(() => setCrmSaleSuccessNotice(null), 4000);
  };

  // Open CRM Debt Modal ("Qarz" tugmasi bosilganda)
  const handleOpenCrmDebtModal = () => {
    if (selectedCrmEntries.length === 0) return;
    setDebtFormError(null);
    setDebtCustomerName('');
    setDebtCustomerPhone('+998 ');
    setDebtAmountInput(crmCalculation.finalSum);
    setDebtNoteInput('');
    setIsCrmDebtModalOpen(true);
  };

  // Confirm CRM Debt Sale (Qarz faqat oflayn savdoda ishlaydi: to'liq qarz bo'lsa 0 so'm tushumga kiradi, qisman qarz bo'lsa qarz miqdori oflayn savdoda hisoblanmaydi)
  const handleConfirmCrmDebtSale = (e: React.FormEvent) => {
    e.preventDefault();
    setDebtFormError(null);

    if (selectedCrmEntries.length === 0) {
      setIsCrmDebtModalOpen(false);
      return;
    }

    const cartTotal = crmCalculation.finalSum;
    const rawDebt = Number(debtAmountInput) || 0;
    if (rawDebt <= 0) {
      setDebtFormError('Qarz miqdorini kiriting!');
      return;
    }
    if (rawDebt > cartTotal) {
      setDebtFormError(`Qarz miqdori savatdagi jami summadan (${formatPrice(cartTotal)}) oshmasligi kerak!`);
      return;
    }

    const cleanName = debtCustomerName.trim() || 'Qarzdor Xaridor';
    const cleanPhone = debtCustomerPhone.trim() || '+998 —';

    // Ombor qoldig'ini tekshirish
    const qtyByProdId = new Map<string, { prod: Product; totalQty: number }>();
    for (const entry of selectedCrmEntries) {
      const q = getCrmEntryQty(entry.entryKey, entry.prod);
      const prev = qtyByProdId.get(entry.prod.id);
      qtyByProdId.set(entry.prod.id, {
        prod: entry.prod,
        totalQty: (prev?.totalQty || 0) + q,
      });
    }

    for (const { prod, totalQty } of qtyByProdId.values()) {
      const isUnlim = Boolean(prod.unlimitedStock) || (typeof prod.stock === 'number' && prod.stock >= 999999999);
      if (isUnlim) continue;
      const avail = typeof prod.stock === 'number' ? Math.max(0, prod.stock) : 0;
      if (avail <= 0 || totalQty > avail) {
        setDebtFormError(
          `«${prod.title}» — Ombordagi miqdor yetarli emas! (Omborda mavjud: ${avail} ${prod.unit})`
        );
        return;
      }
    }

    const nowIso = new Date().toISOString();
    const debtAmount = Math.min(cartTotal, Math.max(1, Math.round(rawDebt)));
    const paidAmount = Math.max(0, cartTotal - debtAmount); // Qarz miqdori oflayn savdoda hisoblanmaydi!

    const debtItems = selectedCrmEntries.map((entry) => {
      const q = getCrmEntryQty(entry.entryKey, entry.prod);
      return {
        productId: entry.prod.id,
        title: entry.displayTitle,
        quantity: q,
        unit: entry.unitSpec,
        price: entry.crmPrice,
        totalSum: entry.crmPrice * q,
        category: entry.prod.category,
      };
    });

    const newDebtRecord: CrmDebtRecord = {
      id: `DEBT-${Date.now().toString().slice(-6)}`,
      supplierId: supplierData.id,
      supplierInn: supplierData.inn,
      supplierCompanyName: supplierData.companyName,
      basketName: activeCrmBasket.name,
      customerName: cleanName,
      customerPhone: cleanPhone,
      items: debtItems,
      totalOrderAmount: cartTotal,
      initialPaidAmount: paidAmount,
      debtAmount,
      paidDebtAmount: 0,
      remainingDebtAmount: debtAmount,
      status: 'pending',
      note: debtNoteInput.trim() || undefined,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    saveCrmDebtsList([newDebtRecord, ...crmDebts], newDebtRecord);

    // Agar qarz savatdagi summadan kam bo'lsa (qisman to'lov bo'lsa), faqat to'langan qismi (paidAmount) oflayn savdoga kiradi;
    // to'liq qarz bo'lsa (paidAmount === 0) oflayn savdoga 0 so'm kiradi (hisoblanmaydi).
    if (paidAmount > 0 && cartTotal > 0) {
      const paidRatio = paidAmount / cartTotal;
      const newOrderId = `CRM-PART-${Date.now().toString().slice(-6)}`;
      let allocatedSum = 0;
      const orderItems = selectedCrmEntries.map((entry, idx) => {
        const q = getCrmEntryQty(entry.entryKey, entry.prod);
        const rawLine = entry.crmPrice * q;
        const scaledLine =
          idx === selectedCrmEntries.length - 1
            ? Math.max(0, paidAmount - allocatedSum)
            : Math.round(rawLine * paidRatio);
        allocatedSum += scaledLine;
        return {
          productId: entry.prod.id,
          title: `${entry.displayTitle} (Qisman to‘lov — Qarz: ${formatPrice(debtAmount)})`,
          quantity: q,
          unit: entry.unitSpec,
          price: entry.crmPrice,
          totalSum: scaledLine,
          category: entry.prod.category,
          supplierId: supplierData.id,
          supplierInn: supplierData.inn,
          supplierName: supplierData.companyName,
        };
      });

      const partialOfflineOrder: Order = {
        id: newOrderId,
        orderChannel: 'offline',
        buyerId: `crm-debt-client-${Date.now()}`,
        buyerName: `${cleanName} (Qisman to‘lov • CRM)`,
        buyerPhone: cleanPhone,
        items: orderItems,
        totalAmount: paidAmount,
        status: 'delivered',
        deliveryAddress: `${supplierData.region || 'Toshkent'} (CRM savdo)`,
        recipientName: cleanName,
        recipientPhone: cleanPhone,
        paymentMethod: 'cash',
        paymentStatus: 'paid',
        paidAt: nowIso,
        vehicleType: 'CRM savdo',
        createdAt: nowIso,
        updatedAt: nowIso,
      };

      try {
        const saved = localStorage.getItem('bunkerstroy_orders');
        const list: Order[] = saved ? JSON.parse(saved) : [];
        localStorage.setItem('bunkerstroy_orders', JSON.stringify([partialOfflineOrder, ...list]));
        setDoc(doc(db, 'orders', partialOfflineOrder.id), partialOfflineOrder, { merge: true }).catch(() => {});
      } catch {}
    }

    // Ombordagi mahsulot miqdoridan chegirish
    try {
      const savedProds = localStorage.getItem('bunkerstroy_products');
      const prodList: Product[] = savedProds ? JSON.parse(savedProds) : [];
      const updatedMap = new Map<string, Product>();

      qtyByProdId.forEach(({ prod, totalQty }) => {
        const isUnlim = Boolean(prod.unlimitedStock) || (typeof prod.stock === 'number' && prod.stock >= 999999999);
        const nextStock = isUnlim ? 999999999 : Math.max(0, (Number(prod.stock) || 0) - totalQty);
        const nextSales = (Number(prod.salesCount) || 0) + totalQty;
        const updatedProd: Product = {
          ...prod,
          stock: nextStock,
          ...(isUnlim ? { unlimitedStock: true } : {}),
          salesCount: nextSales,
        };
        updatedMap.set(prod.id, updatedProd);
        try {
          onAddProduct(updatedProd);
        } catch {}
        try {
          setDoc(doc(db, 'products', prod.id), { stock: nextStock, salesCount: nextSales }, { merge: true }).catch(() => {});
        } catch {}
      });

      if (Array.isArray(prodList) && prodList.length > 0) {
        const nextList = prodList.map((p) => (p && updatedMap.has(p.id) ? { ...p, ...updatedMap.get(p.id)! } : p));
        localStorage.setItem('bunkerstroy_products', JSON.stringify(nextList));
      }
      window.dispatchEvent(new CustomEvent('bunkerstroy_products_updated'));
    } catch {}

    setCrmSelectedIds([]);
    setIsCrmDebtModalOpen(false);
    setCrmStockWarning(null);
    setCrmSaleSuccessNotice(
      paidAmount > 0
        ? `Qarz saqlandi! Qarz miqdori: ${formatPrice(debtAmount)} (Oflayn savdoda hisoblanmadi, Kutilayotgan qarzlarga tushdi). To‘langan qismi (${formatPrice(paidAmount)}) CRM savdoga qo‘shildi.`
        : `To‘liq qarz (${formatPrice(debtAmount)}) Qarz daftariga va Kutilayotgan qarzlarga saqlandi! (Oflayn savdoda hisoblanmadi).`
    );
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('bunkerstroy_orders_updated'));
      window.dispatchEvent(new CustomEvent('bunkerstroy_finance_updated'));
    }, 0);
    setOrdersRefreshTick((t) => t + 1);
    setTimeout(() => setCrmSaleSuccessNotice(null), 5000);
  };

  // Verify cabinet password before opening Qarz daftari
  const handleVerifyQarzPasswordAndEnter = (e: React.FormEvent) => {
    e.preventDefault();
    setQarzPasswordError(null);
    const expectedPass = (supplierData.password || 'user123').trim();
    if (!qarzPasswordInput.trim()) {
      setQarzPasswordError('Qarz daftariga kirish uchun kabinet parolini kiriting!');
      return;
    }
    if (qarzPasswordInput.trim() !== expectedPass) {
      setQarzPasswordError('Kiritilgan parol noto‘g‘ri! Iltimos, kabinet parolini to‘g‘ri kiriting.');
      return;
    }
    setIsQarzPasswordModalOpen(false);
    setQarzPasswordInput('');
    setQarzPasswordError(null);
    setActiveTab('qarz_daftari');
  };

  // Pay off full or partial debt in Qarz daftari -> adds paid amount to offline CRM sales revenue
  const handlePayOffCrmDebt = (e: React.FormEvent) => {
    e.preventDefault();
    if (!payingDebtRecord) return;
    setPayDebtError(null);

    const payAmt = Math.round(Number(payDebtAmountInput) || 0);
    if (payAmt <= 0) {
      setPayDebtError('To‘lanayotgan summani kiriting!');
      return;
    }
    if (payAmt > payingDebtRecord.remainingDebtAmount) {
      setPayDebtError(`To‘lov summasi qolgan qarzdan (${formatPrice(payingDebtRecord.remainingDebtAmount)}) oshmasligi kerak!`);
      return;
    }

    const nowIso = new Date().toISOString();
    const nextRemaining = Math.max(0, payingDebtRecord.remainingDebtAmount - payAmt);
    const nextPaid = (Number(payingDebtRecord.paidDebtAmount) || 0) + payAmt;
    const updatedRecord: CrmDebtRecord = {
      ...payingDebtRecord,
      paidDebtAmount: nextPaid,
      remainingDebtAmount: nextRemaining,
      status: nextRemaining === 0 ? 'paid' : 'pending',
      updatedAt: nowIso,
      ...(nextRemaining === 0 ? { paidAt: nowIso } : {}),
    };

    const nextList = crmDebts.map((d) => (d.id === updatedRecord.id ? updatedRecord : d));
    saveCrmDebtsList(nextList, updatedRecord);

    // To'langan qarz summasini CRM oflayn savdo tushumiga qo'shish
    const firstItem = payingDebtRecord.items[0];
    const repaymentOrder: Order = {
      id: `CRM-DEBT-PAY-${Date.now().toString().slice(-6)}`,
      orderChannel: 'offline',
      buyerId: `crm-debt-pay-${payingDebtRecord.id}`,
      buyerName: `${payingDebtRecord.customerName} (Qarz to‘lovi #${payingDebtRecord.id})`,
      buyerPhone: payingDebtRecord.customerPhone,
      items: [
        {
          productId: firstItem?.productId || 'debt-pay',
          title: `${payingDebtRecord.items.map((i) => i.title).join(', ')} (Qarz to‘lovi)`,
          quantity: 1,
          unit: firstItem?.unit || 'to‘lov',
          price: payAmt,
          totalSum: payAmt,
          category: firstItem?.category || 'CRM Qarz to‘lovi',
          supplierId: supplierData.id,
          supplierInn: supplierData.inn,
          supplierName: supplierData.companyName,
        },
      ],
      totalAmount: payAmt,
      status: 'delivered',
      deliveryAddress: `${supplierData.region || 'Toshkent'} (CRM Qarz to‘lovi)`,
      recipientName: payingDebtRecord.customerName,
      recipientPhone: payingDebtRecord.customerPhone,
      paymentMethod: 'cash',
      paymentStatus: 'paid',
      paidAt: nowIso,
      vehicleType: 'CRM savdo',
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    try {
      const saved = localStorage.getItem('bunkerstroy_orders');
      const list: Order[] = saved ? JSON.parse(saved) : [];
      localStorage.setItem('bunkerstroy_orders', JSON.stringify([repaymentOrder, ...list]));
      setDoc(doc(db, 'orders', repaymentOrder.id), repaymentOrder, { merge: true }).catch(() => {});
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('bunkerstroy_orders_updated'));
        window.dispatchEvent(new CustomEvent('bunkerstroy_finance_updated'));
      }, 0);
      setOrdersRefreshTick((t) => t + 1);
    } catch {}

    setPayingDebtRecord(null);
    setPayDebtAmountInput('');
    setPayDebtError(null);
  };

  // Helper to compress uploaded images so they never exceed localStorage / Firestore limits
  const compressImageFile = (file: File, callback: (dataUrl: string) => void) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      if (!result) return;
      const img = new Image();
      img.onload = () => {
        try {
          const maxDim = 900;
          let { width, height } = img;
          if (width > maxDim || height > maxDim) {
            if (width > height) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            } else {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, width, height);
            const compressed = canvas.toDataURL('image/jpeg', 0.75);
            callback(compressed);
            return;
          }
        } catch {}
        callback(result);
      };
      img.onerror = () => callback(result);
      img.src = result;
    };
    reader.readAsDataURL(file);
  };

  // Multi-image upload handler (up to 12 images)
  const handleMultiImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const remainingSlots = 12 - newImages.length;
    if (remainingSlots <= 0) {
      return;
    }

    const filesToProcess = Array.from(files).slice(0, remainingSlots);
    filesToProcess.forEach((file) => {
      if (!file.type.startsWith('image/')) return;
      compressImageFile(file, (dataUrl) => {
        setNewImages((prev) => {
          if (prev.length >= 12) return prev;
          return [...prev, dataUrl];
        });
      });
    });
  };

  const handleRemoveImage = (indexToRemove: number) => {
    setNewImages((prev) => prev.filter((_, idx) => idx !== indexToRemove));
  };

  // Detail blocks (up to 4 images with description)
  const handleAddDetailBlockImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const remaining = 4 - detailBlocks.length;
    if (remaining <= 0) return;

    Array.from(files).slice(0, remaining).forEach((file) => {
      if (!file.type.startsWith('image/')) return;
      compressImageFile(file, (dataUrl) => {
        setDetailBlocks((prev) => {
          if (prev.length >= 4) return prev;
          return [...prev, { image: dataUrl, text: '' }];
        });
      });
    });
  };

  const handleUpdateDetailBlockText = (idx: number, text: string) => {
    setDetailBlocks((prev) => prev.map((b, i) => (i === idx ? { ...b, text } : b)));
  };

  const handleReplaceDetailBlockImage = (idx: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    compressImageFile(file, (dataUrl) => {
      setDetailBlocks((prev) => prev.map((b, i) => (i === idx ? { ...b, image: dataUrl } : b)));
    });
  };

  const handleRemoveDetailBlock = (idx: number) => {
    setDetailBlocks((prev) => prev.filter((_, i) => i !== idx));
  };

  // Toggle color selection (maksimal 12 ta)
  const toggleColor = (colorName: string) => {
    setSelectedColors((prev) => {
      if (prev.includes(colorName)) {
        return prev.filter((c) => c !== colorName);
      }
      if (prev.length >= 12) {
        return prev;
      }
      return [...prev, colorName];
    });
  };

  const handleRemoveColor = (colorName: string) => {
    setSelectedColors((prev) => prev.filter((c) => c !== colorName));
  };

  // Sozlamalar (Login, Password & Company Profile edit) State + SMS Verification + STIR (orginfo.uz / stat.uz) Lookup
  const [isStirInfoCollapsed, setIsStirInfoCollapsed] = useState(false);
  const [settingsLogin, setSettingsLogin] = useState(supplierData.login || '');
  const [settingsPassword, setSettingsPassword] = useState('');
  const [settingsPasswordConfirm, setSettingsPasswordConfirm] = useState('');
  const [settingsStir, setSettingsStir] = useState(supplierData.inn || '');
  const [settingsStirLoading, setSettingsStirLoading] = useState(false);
  const [settingsStirError, setSettingsStirError] = useState<string | null>(null);
  const [settingsStirVerified, setSettingsStirVerified] = useState(false);
  const [settingsCompanyInfo, setSettingsCompanyInfo] = useState<CompanyInfo | null>(supplierData.companyInfo || null);
  const [settingsCompanyName, setSettingsCompanyName] = useState(supplierData.companyName || '');
  const [settingsName, setSettingsName] = useState(supplierData.name || '');
  const [settingsSurname, setSettingsSurname] = useState(supplierData.surname || '');
  const [settingsPhone, setSettingsPhone] = useState(supplierData.phone || '');
  const [settingsSecondaryPhone, setSettingsSecondaryPhone] = useState(supplierData.secondaryPhone || '+998 ');
  const [settingsRegion, setSettingsRegion] = useState(supplierData.region || '');
  const [settingsContractNumber, setSettingsContractNumber] = useState(supplierData.contractNumber || '');
  const [showSettingsPass, setShowSettingsPass] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [settingsSuccess, setSettingsSuccess] = useState(false);

  // SMS state for Settings (Primary Phone) + Confirmation Password step on Save
  const [settingsSmsSent, setSettingsSmsSent] = useState(false);
  const [settingsSmsCode, setSettingsSmsCode] = useState('');
  const [settingsSmsInput, setSettingsSmsInput] = useState('');
  const [settingsSmsNotice, setSettingsSmsNotice] = useState<string | null>(null);
  const [showSettingsVerifyPasswordStep, setShowSettingsVerifyPasswordStep] = useState(false);
  const [settingsVerifyPasswordInput, setSettingsVerifyPasswordInput] = useState('');
  const [showSettingsVerifyPass, setShowSettingsVerifyPass] = useState(false);

  // SMS state for Secondary Phone addition/update (verified via Primary Phone)
  const [secondaryPhoneSmsSent, setSecondaryPhoneSmsSent] = useState(false);
  const [secondaryPhoneSmsCode, setSecondaryPhoneSmsCode] = useState('');
  const [secondaryPhoneSmsInput, setSecondaryPhoneSmsInput] = useState('');
  const [secondaryPhoneSmsNotice, setSecondaryPhoneSmsNotice] = useState<string | null>(null);
  const [secondaryPhoneError, setSecondaryPhoneError] = useState<string | null>(null);
  const [secondaryPhoneSuccess, setSecondaryPhoneSuccess] = useState(false);

  useEffect(() => {
    setSettingsLogin(supplierData.login || '');
    setSettingsStir(supplierData.inn || '');
    setSettingsCompanyInfo(supplierData.companyInfo || null);
    setSettingsCompanyName(supplierData.companyName || '');
    setSettingsName(supplierData.name || '');
    setSettingsSurname(supplierData.surname || '');
    setSettingsPhone(supplierData.phone || '+998 ');
    setSettingsSecondaryPhone(supplierData.secondaryPhone || '+998 ');
    setSettingsRegion(supplierData.region || '');
    setSettingsContractNumber(supplierData.contractNumber || '');
    setProdSmsPhone(supplierData.phone || '+998 ');
    if (supplierData.inn && supplierData.inn.replace(/\D/g, '').length === 9 && !supplierData.companyInfo) {
      handleSettingsStirLookup(supplierData.inn);
    }
  }, [supplierData.id, supplierData.companyName, supplierData.phone, supplierData.secondaryPhone, supplierData.inn]);

  const handleSettingsStirLookup = async (rawValue: string) => {
    const cleanStir = rawValue.replace(/\D/g, '').slice(0, 9);
    setSettingsStir(cleanStir);
    setSettingsStirError(null);

    if (cleanStir.length < 9) {
      setSettingsStirVerified(false);
      setSettingsCompanyInfo(null);
      return;
    }

    setSettingsStirLoading(true);
    try {
      const resp = await fetch(`/api/company/lookup?inn=${cleanStir}&t=${Date.now()}`, {
        cache: 'no-store',
      });
      const resJson = await resp.json();

      if (!resp.ok || !resJson.success || !resJson.data) {
        setSettingsStirError(
          resJson.error || "Ushbu STIR raqami bo‘yicha orginfo.uz va stat.uz reyestridan MChJ topilmadi."
        );
        setSettingsStirVerified(false);
        setSettingsCompanyInfo(null);
        return;
      }

      const comp: CompanyInfo = resJson.data;
      setSettingsCompanyInfo(comp);

      if (comp.status === 'liquidated') {
        setSettingsStirError(`«${comp.companyName}» faoliyati tugatilgan (Likvidatsiya).`);
        setSettingsStirVerified(false);
        return;
      }

      if (comp.companyName) {
        const cleanedCompName = comp.companyName
          .replace(/mas['`‘’ʻʼ]?uliyati\s+cheklangan\s+jamiyati/gi, '')
          .replace(/mas['`‘’ʻʼ]?uliyati\s+cheklangan\s+jamiyat/gi, '')
          .replace(/aksiyadorlik\s+jamiyati/gi, '')
          .replace(/[«»""]/g, '')
          .replace(/\s+/g, ' ')
          .trim();
        setSettingsCompanyName(cleanedCompName || comp.companyName);
      }

      if (comp.director) {
        const cleaned = String(comp.director).replace(/\s+/g, ' ').trim();
        const parts = cleaned.split(' ');
        if (parts.length >= 2) {
          setSettingsSurname(parts[0]);
          setSettingsName(parts[1]);
        } else if (parts.length === 1 && parts[0]) {
          setSettingsName(parts[0]);
        }
      }

      if (comp.phone) {
        const digits = String(comp.phone).replace(/\D/g, '');
        if (digits.length >= 9) {
          const d9 = digits.slice(-9);
          setSettingsPhone(`+998 ${d9.slice(0, 2)} ${d9.slice(2, 5)} ${d9.slice(5, 7)} ${d9.slice(7, 9)}`);
        }
      }

      const regionStr = comp.locality || [comp.region, comp.district].filter(Boolean).join(', ');
      if (regionStr) {
        setSettingsRegion(regionStr);
      }

      setSettingsStirVerified(true);
    } catch {
      setSettingsStirError("STIR ma'lumotlarini orginfo.uz va stat.uz serverlaridan olishda xatolik yuz berdi.");
      setSettingsStirVerified(false);
    } finally {
      setSettingsStirLoading(false);
    }
  };

  const handleSendSecondaryPhoneSms = () => {
    setSecondaryPhoneError(null);
    const cleanSec = (settingsSecondaryPhone || '').replace(/\D/g, '');
    const localSec = cleanSec.startsWith('998') ? cleanSec.slice(3) : cleanSec;
    if (localSec.length !== 9) {
      setSecondaryPhoneError("Qo‘shimcha telefon raqamini to‘liq 9 ta raqam bilan kiriting!");
      return;
    }
    const primaryPhone = (supplierData.phone || settingsPhone || '').trim();
    const maskedPrimary = maskPrimaryPhoneForSms(primaryPhone);
    setSecondaryPhoneSmsCode('');
    setSecondaryPhoneSmsInput('');
    setSecondaryPhoneSmsNotice(
      `Asosiy telefon raqamingizga (${maskedPrimary}) SMS kod yuborilmoqda...`
    );
    sendSecurePhoneOtp(primaryPhone, 'confirm')
      .then((res) => {
        if (!res.success) {
          setSecondaryPhoneError(res.error || 'SMS yuborishda xatolik yuz berdi.');
          setSecondaryPhoneSmsNotice(null);
          return;
        }
        setSecondaryPhoneSmsSent(true);
        setSecondaryPhoneSmsCode(res.code || '');
        setSecondaryPhoneSmsNotice(
          res.code
            ? `📲 Asosiy telefon raqamingizga (${maskedPrimary}) SMS kod yuborildi. Kod: ${res.code}`
            : `📲 Asosiy telefon raqamingizga (${maskedPrimary}) qo‘shimcha raqamni tasdiqlash uchun SMS kod yuborildi.`
        );
      })
      .catch(() => {
        setSecondaryPhoneError('SMS xizmati bilan aloqa o‘rnatilmadi.');
      });
  };

  const handleSaveSecondaryPhone = async () => {
    setSecondaryPhoneError(null);
    if (!secondaryPhoneSmsSent) {
      setSecondaryPhoneError("Avval asosiy raqamingizga SMS tasdiqlash kodini yuboring!");
      return;
    }
    const primaryPhone = (supplierData.phone || settingsPhone || '').trim();
    const check = await verifySecurePhoneOtp({
      phone: primaryPhone,
      code: secondaryPhoneSmsInput.trim(),
      purpose: 'confirm',
    });
    if (!check.verified) {
      setSecondaryPhoneError(check.error || "SMS tasdiqlash kodi noto‘g‘ri kiritildi!");
      return;
    }
    const formattedSec = settingsSecondaryPhone.trim();
    const updatedSupplier: SupplierPartner = {
      ...supplierData,
      secondaryPhone: formattedSec,
    };
    setSupplierData(updatedSupplier);
    try {
      const saved = localStorage.getItem('bunkerstroy_suppliers');
      const list: SupplierPartner[] = saved ? JSON.parse(saved) : [];
      const nextList = list.map((s) => (s.id === supplierData.id ? updatedSupplier : s));
      localStorage.setItem('bunkerstroy_suppliers', JSON.stringify(nextList));
      window.dispatchEvent(new CustomEvent('bunkerstroy_suppliers_updated'));
      setDoc(doc(db, 'users', updatedSupplier.id), { secondaryPhone: formattedSec }, { merge: true }).catch(() => {});
    } catch {}
    setSecondaryPhoneSuccess(true);
    setSecondaryPhoneSmsSent(false);
    setSecondaryPhoneSmsCode('');
    setSecondaryPhoneSmsInput('');
    setSecondaryPhoneSmsNotice(null);
    setTimeout(() => setSecondaryPhoneSuccess(false), 3000);
  };

  const handleSendSettingsSms = () => {
    setSettingsError(null);
    const tLogin = settingsLogin.trim();
    if (!tLogin || tLogin.length < 5) {
      setSettingsError("Login kamida 5 ta belgidan iborat bo‘lishi kerak!");
      return;
    }
    const smsLoginConflict = getLoginConflictError(tLogin, supplierData.id, settingsPassword, {
      currentAccount: supplierData,
    });
    if (smsLoginConflict) {
      if (isLoginRejectedError(smsLoginConflict)) {
        setSettingsLogin('');
      }
      setSettingsError(smsLoginConflict);
      return;
    }
    const primaryPhone = (supplierData.phone || settingsPhone || '').trim();
    const cleanPhone = primaryPhone.replace(/\D/g, '');
    if (cleanPhone.length < 7) {
      setSettingsError("Asosiy telefon raqami mavjud emas!");
      return;
    }
    if (settingsPassword && settingsPassword !== settingsPasswordConfirm) {
      setSettingsError("Parolni tasdiqlash mos kelmadi.");
      return;
    }
    const maskedPrimary = maskPrimaryPhoneForSms(primaryPhone);
    setSettingsSmsCode('');
    setSettingsSmsInput('');
    setShowSettingsVerifyPasswordStep(false);
    setSettingsVerifyPasswordInput('');
    setSettingsSmsNotice(`Asosiy telefon raqamingizga (${maskedPrimary}) SMS tasdiqlash kodi yuborilmoqda...`);
    sendSecurePhoneOtp(primaryPhone, 'confirm')
      .then((res) => {
        if (!res.success) {
          setSettingsError(res.error || 'SMS yuborishda xatolik yuz berdi.');
          setSettingsSmsNotice(null);
          return;
        }
        setSettingsSmsSent(true);
        setSettingsSmsCode(res.code || '');
        setSettingsSmsNotice(
          res.code
            ? `📲 Asosiy telefon raqamingizga (${maskedPrimary}) SMS tasdiqlash kodi yuborildi. Kod: ${res.code}`
            : `📲 Asosiy telefon raqamingizga (${maskedPrimary}) SMS tasdiqlash kodi yuborildi.`
        );
      })
      .catch(() => {
        setSettingsError('SMS xizmati bilan aloqa o‘rnatilmadi.');
      });
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSettingsError(null);

    const tLogin = settingsLogin.trim();
    if (!tLogin || tLogin.length < 5) {
      setSettingsError("Login kamida 5 ta belgidan iborat bo‘lishi kerak!");
      return;
    }

    const saveValidation = await validateLoginAndPasswordAsync(tLogin, settingsPassword, supplierData.id, {
      currentAccount: supplierData,
    });
    if (saveValidation.error) {
      if (saveValidation.clearLogin) {
        setSettingsLogin('');
      }
      setSettingsError(saveValidation.error);
      return;
    }

    if (settingsPassword && settingsPassword !== settingsPasswordConfirm) {
      setSettingsError("Parolni tasdiqlash mos kelmadi.");
      return;
    }

    if (settingsPassword.trim()) {
      if (!settingsSmsSent) {
        handleSendSettingsSms();
        return;
      }

      if (!showSettingsVerifyPasswordStep) {
        const primaryPhone = (supplierData.phone || settingsPhone || '').trim();
        const smsCheck = await verifySecurePhoneOtp({
          phone: primaryPhone,
          code: settingsSmsInput.trim(),
          purpose: 'confirm',
        });

        if (!smsCheck.verified) {
          setSettingsError(smsCheck.error || "SMS tasdiqlash kodi noto‘g‘ri kiritildi!");
          return;
        }

        setShowSettingsVerifyPasswordStep(true);
        setSettingsVerifyPasswordInput('');
        return;
      }

      const verifyPass = settingsVerifyPasswordInput.trim();
      if (!verifyPass) {
        setSettingsError("Tasdiqlash parolini kiriting!");
        return;
      }

      const validCurrent = await verifyPasswordServerSide(
        verifyPass,
        (supplierData as any).passwordHash,
        supplierData.password || 'user123'
      );
      const newPassCandidate = settingsPassword.trim();
      if (!validCurrent && (!newPassCandidate || verifyPass !== newPassCandidate)) {
        setSettingsError("Tasdiqlash paroli noto‘g‘ri kiritildi!");
        return;
      }
    }

    let nextPasswordHash = (supplierData as any).passwordHash;
    let nextPasswordSignature = (supplierData as any).passwordSignature;
    let nextFirebaseUid = (supplierData as any).firebaseUid;
    if (settingsPassword && settingsPassword.trim()) {
      const [fbRes, hRes] = await Promise.all([
        syncFirebaseAccountWithEmail(tLogin, settingsPassword.trim()),
        hashPasswordServerSide(settingsPassword.trim()),
      ]);
      if (hRes) nextPasswordHash = hRes;
      nextPasswordSignature = computePasswordSignature(settingsPassword.trim());
      if (fbRes.firebaseUid) nextFirebaseUid = fbRes.firebaseUid;
    }

    const updatedSupplier: any = {
      ...supplierData,
      inn: settingsStir.trim() || supplierData.inn,
      companyInfo: settingsCompanyInfo || supplierData.companyInfo,
      login: tLogin,
      email: tLogin.includes('@') ? tLogin : `${tLogin}@bunkerstroy.uz`,
      passwordHash: nextPasswordHash,
      passwordSignature: nextPasswordSignature,
      passwordMigrated: true,
      firebaseUid: nextFirebaseUid,
      companyName: settingsCompanyName.trim() || supplierData.companyName,
      name: settingsName.trim() || supplierData.name,
      surname: settingsSurname.trim() || supplierData.surname,
      phone: supplierData.phone || settingsPhone.trim(),
      secondaryPhone: supplierData.secondaryPhone,
      region: settingsRegion.trim() || supplierData.region,
      contractNumber: settingsContractNumber.trim() || supplierData.contractNumber,
    };
    delete updatedSupplier.password;
    delete updatedSupplier.emergencyPassword;
    setSupplierData(updatedSupplier);

    try {
      const saved = localStorage.getItem('bunkerstroy_suppliers');
      const list: SupplierPartner[] = saved ? JSON.parse(saved) : [];
      const exists = list.some((s) => s.id === supplierData.id);
      const nextList = exists
        ? list.map((s) => (s.id === supplierData.id ? updatedSupplier : s))
        : [updatedSupplier, ...list];
      try {
        localStorage.setItem('bunkerstroy_suppliers', JSON.stringify(nextList));
      } catch {
        const lightList = nextList.map((s) => ({ ...s, contractPdfData: undefined }));
        localStorage.setItem('bunkerstroy_suppliers', JSON.stringify(lightList));
      }
      window.dispatchEvent(new CustomEvent('bunkerstroy_suppliers_updated'));

      // Sync updated credentials to Firestore users collection without plaintext password
      setDoc(
        doc(db, 'users', updatedSupplier.id),
        {
          id: updatedSupplier.id,
          email: updatedSupplier.email || `${tLogin}@bunkerstroy.uz`,
          displayName: (updatedSupplier.companyName || updatedSupplier.name || 'Hamkor').slice(0, 120),
          role: 'supplier',
          login: tLogin,
          passwordHash: updatedSupplier.passwordHash || null,
          passwordMigrated: true,
          firebaseUid: updatedSupplier.firebaseUid || null,
          password: deleteField(),
          emergencyPassword: deleteField(),
          companyName: updatedSupplier.companyName,
          phone: updatedSupplier.phone,
          ...(updatedSupplier.secondaryPhone ? { secondaryPhone: updatedSupplier.secondaryPhone } : {}),
          region: updatedSupplier.region,
          contractNumber: updatedSupplier.contractNumber || '',
        },
        { merge: true }
      ).catch(() => {});

      const savedLogs = localStorage.getItem('bunkerstroy_logs');
      const logsList = savedLogs ? JSON.parse(savedLogs) : [];
      logsList.unshift({
        id: `log-${Date.now()}`,
        action: 'Kabinet sozlamalari SMS orqali yangilandi',
        actor: `${tLogin} (${updatedSupplier.companyName})`,
        category: 'auth_access',
        details: `«${updatedSupplier.companyName}» sozlamalari SMS tasdiqlash orqali muvaffaqiyatli yangilandi.`,
        timestamp: new Date().toISOString(),
        ip: '195.158.12.84',
        level: 'success',
      });
      localStorage.setItem('bunkerstroy_logs', JSON.stringify(logsList.slice(0, 100)));

      if (settingsPassword && settingsPassword.trim()) {
        recordCabinetLog({
          cabinetId: updatedSupplier.id || currentUser.id,
          cabinetName: updatedSupplier.companyName,
          cabinetRole: updatedSupplier.cabinetType === 'manufacturer' ? 'B2B Kabinet' : 'B2C Kabinet',
          actionType: 'password_change',
          title: 'Kabinet kirish paroli yangilandi',
          details: `Login (${tLogin}) uchun kirish paroli SMS va parol tasdig‘i orqali o‘zgartirildi.`,
          isAdminSession,
          adminActor: isAdminSession ? adminActorName : undefined,
        });
      }
    } catch {}

    setSettingsSuccess(true);
    setSettingsSmsSent(false);
    setSettingsSmsCode('');
    setSettingsSmsInput('');
    setSettingsSmsNotice(null);
    setShowSettingsVerifyPasswordStep(false);
    setSettingsVerifyPasswordInput('');
    setTimeout(() => {
      setSettingsSuccess(false);
      setSettingsPassword('');
      setSettingsPasswordConfirm('');
    }, 2500);
  };

  const getSelectedProductSmsPhone = () => {
    if (prodSmsPhoneChoice === 'secondary' && supplierData.secondaryPhone && supplierData.secondaryPhone.trim()) {
      return supplierData.secondaryPhone.trim();
    }
    return (supplierData.phone || prodSmsPhone || '+998').trim();
  };

  const handleSendProductSms = () => {
    setProductConfirmError(null);
    const phoneToUse = getSelectedProductSmsPhone();
    const maskedPhone = maskPrimaryPhoneForSms(phoneToUse);
    setProdSmsCode('');
    setProdSmsInput('');
    setProdSmsNotice(`Kabinet raqamiga (${maskedPhone}) SMS tasdiqlash kodi yuborilmoqda...`);
    sendSecurePhoneOtp(phoneToUse, 'confirm')
      .then((res) => {
        if (!res.success) {
          setProductConfirmError(res.error || 'SMS yuborishda xatolik yuz berdi.');
          setProdSmsNotice(null);
          return;
        }
        setProdSmsSent(true);
        setProdSmsCode(res.code || '');
        setProdSmsNotice(
          res.code
            ? `📲 Kabinet raqamiga (${maskedPhone}) SMS tasdiqlash kodi yuborildi. Kod: ${res.code}`
            : `📲 Kabinet raqamiga (${maskedPhone}) SMS tasdiqlash kodi yuborildi.`
        );
      })
      .catch(() => {
        setProductConfirmError('SMS xizmati bilan aloqa o‘rnatilmadi.');
      });
  };

  // Handle Add / Edit Product Submit (supports multiple Mavjudligi variants & Online/Offline channel)
  const handleCreateProduct = async (e: React.FormEvent, forcedChannel?: 'online' | 'offline') => {
    e.preventDefault();
    setProductConfirmError(null);

    const targetChannel = forcedChannel || addProductChannel || 'online';

    if (!newTitle.trim()) {
      setProductConfirmError("Mahsulot nomini kiriting!");
      return;
    }

    if (!newCategory.trim()) {
      setProductConfirmError("Mahsulot turini kiriting!");
      return;
    }

    if (newImages.length === 0) {
      setProductConfirmError("Mahsulot yuklaganda rasm kiritish majburiy! Iltimos, kamida 1 ta mahsulot suratini yuklang.");
      return;
    }

    const topBunkerPrice = Number(newPrice) || Number(newOriginalPrice) || 0;
    const topCrmPrice =
      supplierData.cabinetType === 'manufacturer'
        ? topBunkerPrice
        : Number(newOriginalPrice) || topBunkerPrice || 0;
    const topMinOrder = Math.max(1, Number(newMinOrder) || 1);

    const cleanedVariants: ProductVariant[] = draftVariants
      .map((dv, idx) => {
        const u = (dv.unit || newUnit || 'kg').trim();
        const uNum = dv.unitValues?.[u]?.trim() || '';
        const specStr = uNum ? `${uNum} ${u}` : (dv.specification || '').trim();
        const pBunker = Number(dv.price) || topBunkerPrice || Number(dv.originalPrice) || 0;
        const pOrig =
          supplierData.cabinetType === 'manufacturer'
            ? pBunker
            : Number(dv.originalPrice) || topCrmPrice || pBunker || 0;
        return {
          id: dv.id || `var-${idx + 1}`,
          unit: u,
          colors: dv.colors && dv.colors.length > 0 ? dv.colors : selectedColors,
          specification: specStr,
          price: pBunker,
          originalPrice: pOrig,
          minOrder: topMinOrder || Math.max(1, Number(dv.minOrder) || 1),
        };
      })
      .filter((v) => v.unit && (v.price > 0 || v.originalPrice > 0));

    if (cleanedVariants.length === 0) {
      setProductConfirmError(
        "Mahsulot narxini hamda kamida 1 ta o‘lchov birligini kiriting!"
      );
      return;
    }

    if (supplierData.cabinetType === 'manufacturer' && !newUnlimitedStock) {
      const enteredStock =
        newStock !== '' && !isNaN(Number(newStock)) ? Math.floor(Number(newStock)) : 0;
      if (newStock === '' || enteredStock <= topMinOrder) {
        setProductConfirmError(
          `Ombordagi miqdori (${enteredStock}) minimal buyurtma miqdoridan (${topMinOrder}) baland bo‘lishi kerak!`
        );
        return;
      }
    }

    // SMS tasdiqlash kodi va kabinet paroli yangi mahsulotni Bunkerga chiqarishda hamda mahsulotni tahrirlaganda talab qilinadi
    const requiresPasswordToPublish = Boolean(editingProduct) || targetChannel === 'online';

    if (requiresPasswordToPublish) {
      if (!prodPassPromptOpen) {
        setProdPassPromptOpen(true);
        setProdPassInput('');
        setShowProdPass(false);
        if (!prodSmsSent) {
          handleSendProductSms();
        }
        return;
      }

      if (!prodSmsInput.trim() || prodSmsInput.trim().length < 6) {
        setProductConfirmError("6 xonali SMS tasdiqlash kodini kiriting!");
        return;
      }

      const phoneToVerify = getSelectedProductSmsPhone();
      const smsVerify = await verifySecurePhoneOtp({
        phone: phoneToVerify,
        code: prodSmsInput.trim(),
        purpose: 'confirm',
      });
      if (!smsVerify.verified && (!prodSmsCode || prodSmsInput.trim() !== prodSmsCode)) {
        setProductConfirmError(smsVerify.error || "SMS tasdiqlash kodi noto‘g‘ri kiritildi!");
        return;
      }

      if (!prodPassInput.trim()) {
        setProductConfirmError(
          editingProduct
            ? "Mahsulot o‘zgarishlarini saqlash uchun kabinet parolini kiriting!"
            : "Mahsulotni Bunkerga chiqarish uchun kabinet parolini kiriting!"
        );
        return;
      }

      const validCabPass = await verifyPasswordServerSide(
        prodPassInput.trim(),
        (supplierData as any).passwordHash,
        supplierData.password || 'user123'
      );
      if (!validCabPass) {
        setProductConfirmError("Kabinet paroli noto‘g‘ri kiritildi!");
        return;
      }
    }

    const primaryVariant = cleanedVariants[0];
    const allMergedColors = Array.from(
      new Set([...selectedColors, ...cleanedVariants.flatMap((v) => v.colors || [])])
    );

    const mainImage = newImages[0];
    const isB2BCabinet = supplierData.cabinetType === 'manufacturer';
    const parsedStock = newUnlimitedStock
      ? 999999999
      : newStock !== '' && !isNaN(Number(newStock))
      ? Math.max(0, Math.floor(Number(newStock)))
      : editingProduct?.stock ?? 100;
    const parsedCostPrice = Number(newCostPrice) || editingProduct?.costPrice || 0;
    const prevInitialStock = editingProduct?.initialStock ?? editingProduct?.stock ?? parsedStock;
    const computedInitialStock = newUnlimitedStock
      ? 999999999
      : editingProduct
      ? Math.max(prevInitialStock, parsedStock)
      : parsedStock;

    const created: Product = {
      id: editingProduct ? editingProduct.id : `prod-${Date.now()}`,
      title: newTitle.trim(),
      category: newCategory.trim() || 'Sement',
      price: primaryVariant.price,
      originalPrice: primaryVariant.originalPrice,
      costPrice: parsedCostPrice,
      initialStock: computedInitialStock,
      unit: primaryVariant.unit,
      saleChannel: targetChannel,
      variants: cleanedVariants.map((v) => ({
        ...v,
        costPrice: parsedCostPrice,
        minOrder: isB2BCabinet ? v.minOrder || 1 : 1,
      })),
      supplierId: supplierData.id,
      supplierInn: supplierData.inn,
      supplierName: supplierData.companyName,
      ...(!isB2BCabinet && newManufacturer.trim() && !isCabinetCompanyName(newManufacturer.trim())
        ? { manufacturerName: newManufacturer.trim() }
        : { manufacturerName: 'O‘zbekiston' }),
      supplierCabinetType: supplierData.cabinetType || 'partner',
      stock: parsedStock,
      unlimitedStock: newUnlimitedStock,
      minOrder: isB2BCabinet ? primaryVariant.minOrder || 1 : 1,
      image: mainImage,
      ...(newImages.length > 0 ? { images: newImages } : {}),
      ...((isB2BCabinet || supplierData.allowPromoVideo) && newVideoUrl.trim()
        ? { videoUrl: newVideoUrl.trim() }
        : {}),
      videoViews: editingProduct?.videoViews ?? 0,
      viewsCount: editingProduct?.viewsCount ?? 0,
      description: newDesc.trim(),
      region: supplierData.region || 'Toshkent shahri',
      ...(supplierData.district ? { district: supplierData.district } : {}),
      salesCount: editingProduct?.salesCount ?? 0,
      isEscoCertified: true,
      energyEfficiencyRating: 'A',
      repairType: 'universal',
      ...(allMergedColors.length > 0 ? { colors: allMergedColors } : {}),
      ...(detailBlocks.length > 0 ? { detailBlocks } : {}),
    };

    try {
      addProductType(created.category);
      if (!isB2BCabinet && newManufacturer.trim()) {
        setManufacturersList(addManufacturer(newManufacturer.trim()));
      }
      onAddProduct(created);
      setProductsSubTab(targetChannel);
    } catch (err) {
      console.error('Error saving product:', err);
    }

    // Saqlash bosilganda Mahsulot qo'shish/tahrirlash oynasi darhol yopilsin
    setIsAddProductOpen(false);
    setEditingProduct(null);
    setNewTitle('');
    setNewManufacturer('');
    setNewUnit('kg');
    setNewPrice('');
    setNewOriginalPrice('');
    setNewCostPrice('');
    setNewStock(100);
    setNewUnlimitedStock(false);
    setNewMinOrder(1);
    setNewDesc('');
    setDraftVariants([
      {
        id: 'var-1',
        unit: 'kg',
        unitValues: { Kv: '', metr: '', kg: '', dona: '' },
        colors: [],
        specification: '',
        price: '',
        originalPrice: '',
        minOrder: 1,
        isColorOpen: false,
        isCollapsed: false,
      },
    ]);
    setNewImages([]);
    setNewVideoUrl('');
    setDetailBlocks([]);
    setSelectedColors([]);
    setIsColorPaletteOpen(false);
    setProdPassPromptOpen(false);
    setProdPassInput('');
    setShowProdPass(false);
    setProdSmsSent(false);
    setProdSmsCode('');
    setProdSmsInput('');
    setProdSmsNotice(null);
    setProductConfirmError(null);
  };

  // CRM Helpers (Variant-aware / Mavjudlikdagi mahsulotlar uchun ham)
  const getProductCrmPrice = (prod: Product) => {
    return typeof prod.originalPrice === 'number' && prod.originalPrice > 0 ? prod.originalPrice : prod.price;
  };

  const getProductVariantsList = (prod: Product): ProductVariant[] => {
    if (prod.variants && prod.variants.length > 0) return prod.variants;
    return [
      {
        id: 'default',
        unit: prod.unit || 'dona',
        colors: prod.colors || [],
        specification: `1 ${prod.unit || 'dona'}`,
        price: prod.price,
        originalPrice: getProductCrmPrice(prod),
        minOrder: prod.minOrder || 1,
      },
    ];
  };

  const resolveCrmBasketEntry = (entryKey: string) => {
    const [prodId, varIdxStr, colorStr] = String(entryKey).split('::');
    const prod = companyProducts.find((p) => p.id === prodId);
    if (!prod) return null;
    const variantsList = getProductVariantsList(prod);
    const vIdx = varIdxStr !== undefined && varIdxStr !== '' ? Number(varIdxStr) : 0;
    const chosenVariant = variantsList[vIdx] || variantsList[0];
    const unitSpec = chosenVariant?.specification
      ? chosenVariant.specification
      : `1 ${chosenVariant?.unit || prod.unit}`;
    const unitOnly = chosenVariant?.unit || prod.unit;
    const defaultCrmPrice = chosenVariant
      ? typeof chosenVariant.originalPrice === 'number' && chosenVariant.originalPrice > 0
        ? chosenVariant.originalPrice
        : chosenVariant.price || getProductCrmPrice(prod)
      : getProductCrmPrice(prod);
    const customUnitPrice = crmCustomPrices[entryKey];
    const crmPrice =
      typeof customUnitPrice === 'number' && !isNaN(customUnitPrice) && customUnitPrice >= 0
        ? customUnitPrice
        : defaultCrmPrice;
    const bunkerPrice = chosenVariant?.price || prod.price;
    const chosenColor =
      colorStr ||
      (chosenVariant?.colors && chosenVariant.colors.length > 0
        ? chosenVariant.colors[0]
        : prod.colors && prod.colors.length > 0
        ? prod.colors[0]
        : '');
    const showVariantTag =
      (prod.variants && prod.variants.length > 1) ||
      Boolean(chosenVariant?.specification) ||
      Boolean(chosenColor);
    const variantLabel = showVariantTag
      ? [chosenVariant?.specification || chosenVariant?.unit, chosenColor].filter(Boolean).join(' • ')
      : '';
    const displayTitle = variantLabel ? `${prod.title} (${variantLabel})` : prod.title;

    return {
      entryKey,
      prod,
      vIdx,
      chosenVariant,
      unitSpec,
      unitOnly,
      defaultCrmPrice,
      crmPrice,
      bunkerPrice,
      chosenColor,
      variantLabel,
      displayTitle,
    };
  };

  const getCrmEntryQty = (entryKey: string, prod?: Product) => {
    const q = crmQuantities[entryKey];
    if (typeof q === 'number' && q > 0) return q;
    return prod?.minOrder && prod.minOrder > 0 ? prod.minOrder : 1;
  };

  const getCrmQty = (prod: Product) => {
    return getCrmEntryQty(prod.id, prod);
  };

  const handleSetCrmQty = (entryKey: string, val: number) => {
    const [prodId] = String(entryKey).split('::');
    const matchedProd = companyProducts.find((p) => p.id === prodId);
    const isUnlim = Boolean(matchedProd?.unlimitedStock) || (typeof matchedProd?.stock === 'number' && matchedProd.stock >= 999999999);
    const maxAvail = isUnlim ? 999999999 : matchedProd ? Math.max(0, Number(matchedProd.stock) || 0) : 999999;
    const requestedVal = Math.max(1, Math.floor(val || 1));

    // Calculate sum of other variant entries of the same product in this basket
    const otherEntriesQty = crmSelectedIds
      .filter((k) => k !== entryKey && String(k).split('::')[0] === prodId)
      .reduce((sum, k) => sum + (crmQuantities[k] || 1), 0);

    if (matchedProd && !isUnlim && requestedVal + otherEntriesQty > maxAvail) {
      setCrmStockWarning(
        `«${matchedProd.title}» — Ombordagi miqdor yetarli emas! (Omborda mavjud: ${maxAvail} ${matchedProd.unit})`
      );
      setTimeout(() => setCrmStockWarning(null), 4000);
      const allowedForThis = Math.max(1, maxAvail - otherEntriesQty);
      setCrmQuantities((prev) => ({ ...prev, [entryKey]: allowedForThis }));
      return;
    }
    setCrmStockWarning(null);
    setCrmQuantities((prev) => ({ ...prev, [entryKey]: requestedVal }));
  };

  const handleAddVariantToCrmCart = (prod: Product, vIdx: number, colorOverride?: string) => {
    const isUnlim = Boolean(prod.unlimitedStock) || (typeof prod.stock === 'number' && prod.stock >= 999999999);
    const availStock = isUnlim ? 999999999 : prod.stock !== undefined && prod.stock !== null ? Number(prod.stock) : 999999;
    if (!isUnlim && availStock <= 0) {
      setCrmStockWarning(`«${prod.title}» — Ombordagi miqdor yetarli emas! (Omborda mavjud: 0 ${prod.unit})`);
      setTimeout(() => setCrmStockWarning(null), 4000);
      return;
    }

    const variantsList = getProductVariantsList(prod);
    const chosenVar = variantsList[vIdx] || variantsList[0];
    const availColors =
      chosenVar.colors && chosenVar.colors.length > 0 ? chosenVar.colors : prod.colors || [];
    const chosenColor = colorOverride ?? crmColorSelection[prod.id] ?? (availColors[0] || '');
    const entryKey =
      variantsList.length > 1 || chosenColor || chosenVar.specification
        ? `${prod.id}::${vIdx}${chosenColor ? `::${chosenColor}` : ''}`
        : prod.id;

    // Total currently in basket for this product
    const currentProdTotalInCart = crmSelectedIds
      .filter((k) => String(k).split('::')[0] === prod.id)
      .reduce((sum, k) => sum + (crmQuantities[k] || 1), 0);

    if (!crmSelectedIds.includes(entryKey)) {
      if (!isUnlim && currentProdTotalInCart + 1 > availStock) {
        setCrmStockWarning(
          `«${prod.title}» — Ombordagi miqdor yetarli emas! (Omborda mavjud: ${availStock} ${prod.unit})`
        );
        setTimeout(() => setCrmStockWarning(null), 4000);
        return;
      }
      setCrmSelectedIds((prev) => [...prev, entryKey]);
      setCrmQuantities((prev) => ({
        ...prev,
        [entryKey]: prev[entryKey] || 1,
      }));
    } else {
      handleSetCrmQty(entryKey, (crmQuantities[entryKey] || 1) + 1);
    }
  };

  const toggleCrmSelectProduct = (prod: Product) => {
    const selVIdx = crmVariantSelection[prod.id] ?? 0;
    handleAddVariantToCrmCart(prod, selVIdx);
  };

  const filteredCrmProducts = useMemo(() => {
    return companyProducts.filter((p) => {
      const matchesCat = crmCategoryFilter === 'all' || p.category === crmCategoryFilter;
      const q = crmSearchQuery.trim().toLowerCase();
      if (!q) return matchesCat;
      const inTitle = (p.title || '').toLowerCase().includes(q);
      const inCat = (p.category || '').toLowerCase().includes(q);
      const inUnit = (p.unit || '').toLowerCase().includes(q);
      const inDesc = (p.description || '').toLowerCase().includes(q);
      const inColors = (p.colors || []).some((c) => c.toLowerCase().includes(q));
      const inVariants = (p.variants || []).some(
        (v) =>
          (v.unit || '').toLowerCase().includes(q) ||
          (v.specification || '').toLowerCase().includes(q) ||
          (v.colors || []).some((c) => c.toLowerCase().includes(q))
      );
      return matchesCat && (inTitle || inCat || inUnit || inDesc || inColors || inVariants);
    });
  }, [companyProducts, crmSearchQuery, crmCategoryFilter]);

  const selectedCrmEntries = useMemo(() => {
    return crmSelectedIds
      .map((entryKey) => resolveCrmBasketEntry(entryKey))
      .filter((x): x is NonNullable<ReturnType<typeof resolveCrmBasketEntry>> => x !== null);
  }, [companyProducts, crmSelectedIds, crmCustomPrices]);

  const selectedCrmProducts = useMemo(() => {
    return selectedCrmEntries.map((e) => e.prod);
  }, [selectedCrmEntries]);

  const crmCalculation = useMemo(() => {
    let totalOriginalSum = 0;
    let totalBunkerSum = 0;
    let totalUnits = 0;

    selectedCrmEntries.forEach((entry) => {
      const qty = getCrmEntryQty(entry.entryKey, entry.prod);
      totalOriginalSum += entry.crmPrice * qty;
      totalBunkerSum += entry.bunkerPrice * qty;
      totalUnits += qty;
    });

    const discountAmount = Math.round((totalOriginalSum * Math.min(100, Math.max(0, crmDiscountPercent))) / 100);
    const finalSum = Math.max(0, totalOriginalSum - discountAmount);

    return {
      totalOriginalSum,
      totalBunkerSum,
      totalUnits,
      discountAmount,
      finalSum,
    };
  }, [selectedCrmEntries, crmQuantities, crmCustomPrices, crmDiscountPercent]);

  const handleCopyCrmSummary = () => {
    if (selectedCrmEntries.length === 0) return;
    const lines = [
      `HISOB-KITOB SMETASI (${supplierData.companyName} — ${activeCrmBasket.name})`,
      crmClientName ? `Mijoz: ${crmClientName} ${crmClientPhone ? `(${crmClientPhone})` : ''}` : null,
      `Sana: ${new Date().toLocaleDateString('uz-UZ')}`,
      `----------------------------------------`,
      ...selectedCrmEntries.map((entry, i) => {
        const qty = getCrmEntryQty(entry.entryKey, entry.prod);
        return `${i + 1}. ${entry.displayTitle} — ${qty} ${entry.unitSpec} x ${new Intl.NumberFormat('uz-UZ').format(entry.crmPrice)} so'm = ${new Intl.NumberFormat('uz-UZ').format(qty * entry.crmPrice)} so'm`;
      }),
      `----------------------------------------`,
      `Jami (Asl narxda): ${new Intl.NumberFormat('uz-UZ').format(crmCalculation.totalOriginalSum)} so'm`,
      crmDiscountPercent > 0 ? `Chegirma (${crmDiscountPercent}%): -${new Intl.NumberFormat('uz-UZ').format(crmCalculation.discountAmount)} so'm` : null,
      `YAKUNIY TO'LOV SUMMASI: ${new Intl.NumberFormat('uz-UZ').format(crmCalculation.finalSum)} so'm`,
    ].filter(Boolean).join('\n');

    navigator.clipboard?.writeText(lines);
    setCrmCopySuccess(true);
    setTimeout(() => setCrmCopySuccess(false), 2500);
  };

  const formatPrice = (p: number) => {
    return new Intl.NumberFormat('uz-UZ').format(p) + " so'm";
  };

  const formatCleanCompanyName = (rawName?: string): string => {
    if (!rawName) return 'Hamkor';
    const cleaned = rawName
      .replace(/mas['`‘’ʻʼ]?uliyati\s+cheklangan\s+jamiyati/gi, '')
      .replace(/mas['`‘’ʻʼ]?uliyati\s+cheklangan\s+jamiyat/gi, '')
      .replace(/aksiyadorlik\s+jamiyati/gi, '')
      .replace(/[«»""]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    return cleaned || rawName;
  };

  return (
    <div className={`min-h-screen w-full bg-[#071326] text-white flex flex-col font-sans selection:bg-[#FFB800] selection:text-slate-950 ${cabinetTheme === 'light' ? 'supplier-cabinet-light' : ''}`}>
      {/* Header — BUNKER STROY doim ko'rinib turadi; Logotip ustiga bosilganda Sozlamalar ochiladi (Chiqish faqat Sozlamalar bo'limida) */}
      <header className="sticky top-0 z-40 border-b-2 border-[#1E3A6D] bg-[#0A1931] px-2 sm:px-8 pt-2.5 pb-1.5 sm:py-0 min-h-[3.75rem] sm:h-24 flex items-center justify-between gap-1.5 sm:gap-4 shadow-2xl">
        <div className="flex items-center gap-1.5 sm:gap-3.5 mt-1.5 sm:mt-0 select-none min-w-0 flex-1">
          <button
            type="button"
            onClick={(e) => handleLogoClick(e)}
            onDoubleClick={(e) => handleLogoDoubleClick(e)}
            title="Sozlamalar (2 marta bosilsa Loglar bo‘limi ochiladi)"
            className="relative w-8 h-8 sm:w-12 sm:h-12 rounded-lg sm:rounded-2xl bg-[#FFB800] text-slate-950 border-2 border-[#FFB800] hover:bg-[#FFC928] transition-colors flex items-center justify-center font-black shadow-lg cursor-pointer shrink-0"
          >
            <HardHat className="w-4 h-4 sm:w-6 sm:h-6 pointer-events-none stroke-[2.3]" />
            <span
              className="absolute -bottom-1 -right-1 w-3.5 h-3.5 sm:w-5 sm:h-5 rounded-full bg-[#0A1931] text-[#FFB800] border border-[#FFB800] flex items-center justify-center shadow pointer-events-none"
            >
              <Settings className="w-2 h-2 sm:w-3 sm:h-3" />
            </span>
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 sm:gap-2.5 flex-wrap">
              <span
                onClick={(e) => handleLogoClick(e)}
                onDoubleClick={(e) => handleLogoDoubleClick(e)}
                className="text-xs sm:text-xl font-black tracking-wider leading-none shrink-0 cursor-pointer"
              >
                <span className="text-[#FFB800]">BUNKER</span>{' '}
                <span className="text-white">STROY</span>
              </span>
              <span className="text-sky-400/50 font-black text-xs sm:text-base">•</span>
              <h1 className="text-[11px] sm:text-lg font-black text-white leading-tight break-words">
                {formatCleanCompanyName(supplierData.companyName)}
              </h1>
              <span className={`hidden sm:inline-flex px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border ${
                supplierData.cabinetType === 'manufacturer'
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                  : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
              }`}>
                {supplierData.cabinetType === 'manufacturer' ? 'B2B Kabineti' : 'B2C Kabineti'}
              </span>
            </div>
            <p className="text-[9px] sm:text-xs text-sky-200/80 leading-tight break-words mt-0.5">
              {supplierData.cabinetType === 'manufacturer' ? 'B2B Kabineti' : 'B2C Kabineti'} • {supplierData.region}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 sm:gap-2.5 shrink-0">
          {/* Qarz daftari tugmasi — CRM tugmasi yonida, kirish parol asosida ishlaydi */}
          <button
            type="button"
            onClick={() => {
              if (activeTab === 'qarz_daftari') {
                setActiveTab(prevNonCrmTab || 'reports');
              } else {
                setQarzPasswordInput('');
                setQarzPasswordError(null);
                setShowQarzPassword(false);
                setIsQarzPasswordModalOpen(true);
              }
            }}
            className={`flex items-center gap-1 sm:gap-2 px-1.5 sm:px-4 py-1 sm:py-2.5 rounded-md sm:rounded-xl font-black text-[9px] sm:text-xs transition-colors cursor-pointer border shadow-lg ${
              activeTab === 'qarz_daftari'
                ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 border-emerald-300 shadow-md'
                : 'bg-[#071326] hover:bg-amber-500 text-[#FFB800] hover:text-slate-950 border-[#FFB800]/60 hover:border-[#FFB800]'
            }`}
          >
            <FileText className="w-3 h-3 sm:w-4 sm:h-4 shrink-0" />
            <span className="whitespace-nowrap">{activeTab === 'qarz_daftari' ? 'Qarz Chiqish' : 'Qarz daftari'}</span>
            <span
              className={`px-1 sm:px-1.5 py-0.2 rounded-full text-[8px] sm:text-[10px] font-mono font-black ${
                activeTab === 'qarz_daftari'
                  ? 'bg-[#071326] text-emerald-400'
                  : pendingMyCrmDebts.length > 0
                  ? 'bg-red-600 text-white'
                  : 'bg-[#0A1931] text-[#FFB800]'
              }`}
            >
              {pendingMyCrmDebts.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              if (activeTab === 'crm') {
                setActiveTab(prevNonCrmTab || 'reports');
              } else {
                setActiveTab('crm');
              }
            }}
            className={`flex items-center gap-1 sm:gap-2 px-1.5 sm:px-5 py-1 sm:py-2.5 rounded-md sm:rounded-xl font-black text-[9px] sm:text-xs transition-colors cursor-pointer border shadow-lg ${
              activeTab === 'crm'
                ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 border-emerald-300 shadow-md'
                : 'bg-[#FFB800] hover:bg-[#FFC928] text-[#0A1931] border-[#E5A600]'
            }`}
          >
            <Calculator className="w-3 h-3 sm:w-4 sm:h-4 shrink-0" />
            <span className="whitespace-nowrap">{activeTab === 'crm' ? 'CRM Chiqish' : 'CRM'}</span>
            <span
              className={`px-1 sm:px-1.5 py-0.2 rounded-full text-[8px] sm:text-[10px] font-mono font-black ${
                activeTab === 'crm' ? 'bg-[#071326] text-emerald-400' : 'bg-[#0A1931] text-[#FFB800]'
              }`}
            >
              {crmBaskets.length}
            </span>
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 w-full flex flex-col">
        <div className="flex-1 flex flex-col lg:flex-row items-stretch min-h-[calc(100vh-5rem)] sm:min-h-[calc(100vh-6rem)]">

          {/* Mobile Backdrop & Slide Drawer */}
          {isMobileSidebarOpen && (
            <div
              className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 lg:hidden flex"
              onClick={() => setIsMobileSidebarOpen(false)}
            >
              <div
                className="w-72 max-w-[85vw] h-[100dvh] min-h-screen bg-[#0A1931] border-r-2 border-[#1E3A6D] p-4 flex flex-col justify-between shadow-2xl animate-fadeIn overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="space-y-4">
                  <div className="pb-3 border-b border-[#1E3A6D] flex items-center justify-between">
                    <h3 className="text-sm font-black text-[#FFB800] tracking-wider uppercase font-mono flex items-center gap-2">
                      <Layers className="w-4 h-4 text-[#FFB800]" />
                      <span>{supplierData.cabinetType === 'manufacturer' ? 'B2B Bo‘limlar' : 'B2C Bo‘limlar'}</span>
                    </h3>
                    <button
                      type="button"
                      onClick={() => setIsMobileSidebarOpen(false)}
                      className="p-1.5 rounded-lg bg-[#071326] text-sky-200 hover:text-white border border-[#1E3A6D] cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {supplierData.cabinetType === 'manufacturer' ? (
                    /* B2B Kabineti uchun bo'limlar ketma-ketligi: 1. Hisobot, monitoring, 2. Mahsulotlar, 3. B2B Mijozlar, 4. Sozlamalar (LIQUID GLASS) */
                    <nav className="flex flex-col gap-2.5">
                      {/* 1. Hisobot, monitoring */}
                      <button
                        type="button"
                        onClick={() => { setActiveTab('reports'); setIsMobileSidebarOpen(false); }}
                        className={`w-full flex items-center justify-between p-3.5 rounded-2xl text-xs sm:text-sm font-black transition-all text-left cursor-pointer border ${
                          activeTab === 'reports'
                            ? 'liquid-glass-tab-active text-white'
                            : hasReportsAlert
                            ? 'bg-gradient-to-r from-amber-500/30 via-emerald-500/25 to-amber-500/30 text-amber-200 border-amber-400 shadow-[0_0_20px_rgba(255,184,0,0.55)] ring-1 ring-amber-400/50 animate-pulse'
                            : 'liquid-glass-tab-inactive text-sky-100 hover:text-white'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <BarChart3 className={`w-4 h-4 shrink-0 ${activeTab === 'reports' ? 'text-white' : 'text-[#FFB800]'}`} />
                          <span>Hisobot, monitoring</span>
                        </div>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                          activeTab === 'reports'
                            ? 'bg-white text-blue-700 font-black'
                            : hasReportsAlert
                            ? 'bg-[#FFB800] text-slate-950 font-black shadow-[0_0_10px_rgba(255,184,0,0.8)]'
                            : 'bg-[#0F2547] text-sky-200'
                        }`}>
                          {supplierReport.sales.length}
                        </span>
                      </button>

                      {/* 2. Mahsulotlar */}
                      <button
                        type="button"
                        onClick={() => { setActiveTab('products'); setIsMobileSidebarOpen(false); }}
                        className={`w-full flex items-center justify-between p-3.5 rounded-2xl text-xs sm:text-sm font-black transition-all text-left cursor-pointer border ${
                          activeTab === 'products'
                            ? 'liquid-glass-tab-active text-white'
                            : 'liquid-glass-tab-inactive text-sky-100 hover:text-white'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <Package className={`w-4 h-4 shrink-0 ${activeTab === 'products' ? 'text-white' : 'text-[#FFB800]'}`} />
                          <span>Mahsulotlar</span>
                        </div>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                          activeTab === 'products' ? 'bg-white text-blue-700 font-black' : 'bg-[#0F2547] text-sky-200'
                        }`}>
                          {companyProducts.length}
                        </span>
                      </button>

                      {/* 3. B2B Mijozlar */}
                      <button
                        type="button"
                        onClick={() => { setActiveTab('customers'); setIsMobileSidebarOpen(false); }}
                        className={`w-full flex items-center justify-between p-3.5 rounded-2xl text-xs sm:text-sm font-black transition-all text-left cursor-pointer border ${
                          activeTab === 'customers'
                            ? 'liquid-glass-tab-active text-white'
                            : hasCustomersAlert || pendingIncomingB2bCount > 0
                            ? 'bg-red-600 text-white border-red-400 shadow-[0_0_24px_rgba(220,38,38,0.85)] ring-2 ring-red-400/70 animate-pulse'
                            : 'liquid-glass-tab-inactive text-sky-100 hover:text-white'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <Users className={`w-4 h-4 shrink-0 ${
                            activeTab === 'customers' || hasCustomersAlert || pendingIncomingB2bCount > 0
                              ? 'text-white'
                              : 'text-[#FFB800]'
                          }`} />
                          <span>B2B Mijozlar</span>
                        </div>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                          activeTab === 'customers'
                            ? 'bg-white text-blue-700 font-black'
                            : hasCustomersAlert || pendingIncomingB2bCount > 0
                            ? 'bg-white text-red-700 font-black shadow-[0_0_12px_rgba(255,255,255,0.9)]'
                            : 'bg-[#0F2547] text-sky-200'
                        }`}>
                          {supplierCustomers.length + incomingManufacturerB2bOrders.length}
                        </span>
                      </button>

                      {/* 4. Sozlamalar */}
                      <button
                        type="button"
                        onClick={() => { setActiveTab('settings'); setIsMobileSidebarOpen(false); }}
                        className={`w-full flex items-center justify-between p-3.5 rounded-2xl text-xs sm:text-sm font-black transition-all text-left cursor-pointer border ${
                          activeTab === 'settings'
                            ? 'liquid-glass-tab-active text-white'
                            : 'liquid-glass-tab-inactive text-sky-100 hover:text-white'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <Settings className={`w-4 h-4 shrink-0 ${activeTab === 'settings' ? 'text-white' : 'text-[#FFB800]'}`} />
                          <span>Sozlamalar</span>
                        </div>
                      </button>
                    </nav>
                  ) : (
                    /* B2C Kabinetidagi Bo'limlar: 1. Monitoring hisobot, 2. Mahsulot, 3. B2B Mahsulotlar, 4. Onlayn Mijozlar, 5. Sozlamalar (LIQUID GLASS) */
                    <nav className="flex flex-col gap-2.5">
                      {/* 1. Monitoring hisobot */}
                      <button
                        type="button"
                        onClick={() => { setActiveTab('reports'); setIsMobileSidebarOpen(false); }}
                        className={`w-full flex items-center justify-between p-3.5 rounded-2xl text-xs sm:text-sm font-black transition-all text-left cursor-pointer border ${
                          activeTab === 'reports'
                            ? 'liquid-glass-tab-active text-white'
                            : hasReportsAlert
                            ? 'bg-gradient-to-r from-amber-500/30 via-emerald-500/25 to-amber-500/30 text-amber-200 border-amber-400 shadow-[0_0_20px_rgba(255,184,0,0.55)] ring-1 ring-amber-400/50 animate-pulse'
                            : 'liquid-glass-tab-inactive text-sky-100 hover:text-white'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <BarChart3 className={`w-4 h-4 shrink-0 ${activeTab === 'reports' ? 'text-white' : 'text-[#FFB800]'}`} />
                          <span>Monitoring hisobot</span>
                        </div>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                          activeTab === 'reports'
                            ? 'bg-white text-blue-700 font-black'
                            : hasReportsAlert
                            ? 'bg-[#FFB800] text-slate-950 font-black shadow-[0_0_10px_rgba(255,184,0,0.8)]'
                            : 'bg-[#0F2547] text-sky-200'
                        }`}>
                          {supplierReport.sales.length}
                        </span>
                      </button>

                      {/* 2. Mahsulot */}
                      <button
                        type="button"
                        onClick={() => { setActiveTab('products'); setIsMobileSidebarOpen(false); }}
                        className={`w-full flex items-center justify-between p-3.5 rounded-2xl text-xs sm:text-sm font-black transition-all text-left cursor-pointer border ${
                          activeTab === 'products'
                            ? 'liquid-glass-tab-active text-white'
                            : companyProducts.some((p) => (p.stock ?? 0) <= 0)
                            ? 'bg-[#133268] text-white border-sky-400 shadow-[0_0_16px_rgba(56,189,248,0.5)] animate-pulse'
                            : 'liquid-glass-tab-inactive text-sky-100 hover:text-white'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <Package className={`w-4 h-4 shrink-0 ${activeTab === 'products' ? 'text-white' : 'text-[#FFB800]'}`} />
                          <span>Mahsulot</span>
                        </div>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                          activeTab === 'products' ? 'bg-white text-blue-700 font-black' : 'bg-[#0F2547] text-sky-200'
                        }`}>
                          {companyProducts.length}
                        </span>
                      </button>

                      {/* 3. B2B Mahsulotlar */}
                      <button
                        type="button"
                        onClick={() => { setActiveTab('b2b_manufacturers'); setIsMobileSidebarOpen(false); }}
                        className={`w-full flex items-center justify-between p-3.5 rounded-2xl text-xs sm:text-sm font-black transition-all text-left cursor-pointer border ${
                          activeTab === 'b2b_manufacturers'
                            ? 'liquid-glass-tab-active text-white'
                            : awaitingPaymentB2bCount > 0
                            ? 'bg-gradient-to-r from-amber-500/35 via-emerald-500/35 to-amber-500/35 text-white border-amber-400 shadow-[0_0_24px_rgba(255,184,0,0.75)] ring-2 ring-amber-400/60 animate-pulse'
                            : 'liquid-glass-tab-inactive text-sky-100 hover:text-white'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <Building className={`w-4 h-4 shrink-0 ${activeTab === 'b2b_manufacturers' ? 'text-white' : 'text-amber-400'}`} />
                          <span>B2B Mahsulotlar</span>
                        </div>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                          activeTab === 'b2b_manufacturers'
                            ? 'bg-white text-blue-700 font-black'
                            : awaitingPaymentB2bCount > 0
                            ? 'bg-emerald-400 text-slate-950 font-black'
                            : 'bg-amber-500/20 text-amber-400'
                        }`}>
                          {awaitingPaymentB2bCount > 0 ? `! ${awaitingPaymentB2bCount}` : manufacturerProducts.length}
                        </span>
                      </button>

                      {/* 4. Onlayn Mijozlar */}
                      <button
                        type="button"
                        onClick={() => { setActiveTab('customers'); setIsMobileSidebarOpen(false); }}
                        className={`w-full flex items-center justify-between p-3.5 rounded-2xl text-xs sm:text-sm font-black transition-all text-left cursor-pointer border ${
                          activeTab === 'customers'
                            ? 'liquid-glass-tab-active text-white'
                            : hasCustomersAlert
                            ? 'bg-red-600 text-white border-red-400 shadow-[0_0_24px_rgba(220,38,38,0.85)] ring-2 ring-red-400/70 animate-pulse'
                            : 'liquid-glass-tab-inactive text-sky-100 hover:text-white'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <Users className={`w-4 h-4 shrink-0 ${
                            activeTab === 'customers' || hasCustomersAlert ? 'text-white' : 'text-[#FFB800]'
                          }`} />
                          <span>Onlayn Mijozlar</span>
                        </div>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                          activeTab === 'customers'
                            ? 'bg-white text-blue-700 font-black'
                            : hasCustomersAlert
                            ? 'bg-white text-red-700 font-black shadow-[0_0_12px_rgba(255,255,255,0.9)]'
                            : 'bg-[#0F2547] text-sky-200'
                        }`}>
                          {supplierCustomers.length}
                        </span>
                      </button>

                      {/* 5. Sozlamalar */}
                      <button
                        type="button"
                        onClick={() => { setActiveTab('settings'); setIsMobileSidebarOpen(false); }}
                        className={`w-full flex items-center justify-between p-3.5 rounded-2xl text-xs sm:text-sm font-black transition-all text-left cursor-pointer border ${
                          activeTab === 'settings'
                            ? 'liquid-glass-tab-active text-white'
                            : 'liquid-glass-tab-inactive text-sky-100 hover:text-white'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <Settings className={`w-4 h-4 shrink-0 ${activeTab === 'settings' ? 'text-white' : 'text-[#FFB800]'}`} />
                          <span>Sozlamalar</span>
                        </div>
                      </button>
                    </nav>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* =========================================================================
              YON TARAFI: BO'LIMLARNI YIG'ILADIGAN (COLLAPSIBLE) YON MENYUSI — EKRAN YON TARAFIDAN TO'LIQ, PASTKI QISMIDA BO'SH JOY QOLMAYDI
              ========================================================================= */}
          {activeTab !== 'crm' && activeTab !== 'qarz_daftari' && (
          <aside className={`hidden lg:flex flex-col shrink-0 bg-[#0A1931] border-r-2 border-[#1E3A6D] shadow-2xl transition-all duration-300 self-stretch min-h-[calc(100vh-5rem)] sm:min-h-[calc(100vh-6rem)] z-10 ${isSidebarCollapsed ? 'w-20' : 'w-72'}`}>
            <div className="sticky top-20 sm:top-24 flex-1 flex flex-col p-3.5 sm:p-4 space-y-3">
              {/* Yon menyuni yig'ish va ochish sarlavhasi */}
              <div
                onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
                className="pb-3 border-b border-[#1E3A6D] flex items-center justify-between cursor-pointer group select-none hover:opacity-90 transition-opacity"
                title={isSidebarCollapsed ? "Bo‘limlarni kengaytirish" : "Bo‘limlarni yon tarafga yig‘ish"}
              >
                {!isSidebarCollapsed && (
                  <h3 className="text-xs sm:text-sm font-black text-[#FFB800] tracking-wider uppercase font-mono flex items-center gap-2">
                    <Layers className="w-4 h-4 text-[#FFB800]" />
                    <span>{supplierData.cabinetType === 'manufacturer' ? 'B2B Bo‘limlari' : 'B2C Bo‘limlari'}</span>
                  </h3>
                )}
                <div className={`p-2 rounded-xl bg-[#071326] group-hover:bg-[#0F2547] text-[#FFB800] border border-[#1E3A6D] group-hover:border-[#FFB800] transition-colors ${isSidebarCollapsed ? 'mx-auto' : 'ml-auto'}`}>
                  {isSidebarCollapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
                </div>
              </div>

              {supplierData.cabinetType === 'manufacturer' ? (
                /* B2B Kabineti uchun bo'limlar ketma-ketligi: 1. Hisobot, monitoring, 2. Mahsulotlar, 3. B2B Mijozlar, 4. Sozlamalar (LIQUID GLASS) */
                <nav className="flex flex-col gap-2.5">
                  {/* 1. Hisobot, monitoring */}
                  <button
                    type="button"
                    onClick={() => setActiveTab('reports')}
                    title="Hisobot, monitoring"
                    className={`w-full flex items-center ${isSidebarCollapsed ? 'justify-center p-3.5' : 'justify-between px-4 py-3.5'} rounded-2xl text-xs sm:text-sm font-black transition-all cursor-pointer border ${
                      activeTab === 'reports'
                        ? 'liquid-glass-tab-active text-white'
                        : hasReportsAlert
                        ? 'bg-gradient-to-r from-amber-500/30 via-emerald-500/25 to-amber-500/30 text-amber-200 border-amber-400 shadow-[0_0_20px_rgba(255,184,0,0.55)] ring-1 ring-amber-400/50 animate-pulse'
                        : 'liquid-glass-tab-inactive text-sky-100 hover:text-white'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <BarChart3 className={`w-4 h-4 shrink-0 ${activeTab === 'reports' ? 'text-white' : 'text-[#FFB800]'}`} />
                      {!isSidebarCollapsed && <span>Hisobot, monitoring</span>}
                    </div>
                    {!isSidebarCollapsed && (
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                        activeTab === 'reports'
                          ? 'bg-white text-blue-700 font-black'
                          : hasReportsAlert
                          ? 'bg-[#FFB800] text-slate-950 font-black shadow-[0_0_10px_rgba(255,184,0,0.8)]'
                          : 'bg-[#0F2547] text-sky-200'
                      }`}>
                        {supplierReport.sales.length}
                      </span>
                    )}
                  </button>

                  {/* 2. Mahsulotlar */}
                  <button
                    type="button"
                    onClick={() => setActiveTab('products')}
                    title="Mahsulotlar"
                    className={`w-full flex items-center ${isSidebarCollapsed ? 'justify-center p-3.5' : 'justify-between px-4 py-3.5'} rounded-2xl text-xs sm:text-sm font-black transition-all cursor-pointer border ${
                      activeTab === 'products'
                        ? 'liquid-glass-tab-active text-white'
                        : companyProducts.some((p) => (p.stock ?? 0) <= 0)
                        ? 'bg-[#133268] text-white border-sky-400 shadow-[0_0_16px_rgba(56,189,248,0.5)] animate-pulse'
                        : 'liquid-glass-tab-inactive text-sky-100 hover:text-white'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Package className={`w-4 h-4 shrink-0 ${activeTab === 'products' ? 'text-white' : 'text-[#FFB800]'}`} />
                      {!isSidebarCollapsed && <span>Mahsulotlar</span>}
                    </div>
                    {!isSidebarCollapsed && (
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                        activeTab === 'products' ? 'bg-white text-blue-700 font-black' : 'bg-[#0F2547] text-sky-200'
                      }`}>
                        {companyProducts.length}
                      </span>
                    )}
                  </button>

                  {/* 3. B2B Mijozlar */}
                  <button
                    type="button"
                    onClick={() => setActiveTab('customers')}
                    title="B2B Mijozlar"
                    className={`w-full flex items-center ${isSidebarCollapsed ? 'justify-center p-3.5' : 'justify-between px-4 py-3.5'} rounded-2xl text-xs sm:text-sm font-black transition-all cursor-pointer border ${
                      activeTab === 'customers'
                        ? 'liquid-glass-tab-active text-white'
                        : hasCustomersAlert || pendingIncomingB2bCount > 0
                        ? 'bg-red-600 text-white border-red-400 shadow-[0_0_24px_rgba(220,38,38,0.85)] ring-2 ring-red-400/70 animate-pulse'
                        : 'liquid-glass-tab-inactive text-sky-100 hover:text-white'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Users className={`w-4 h-4 shrink-0 ${
                        activeTab === 'customers' || hasCustomersAlert || pendingIncomingB2bCount > 0
                          ? 'text-white'
                          : 'text-[#FFB800]'
                      }`} />
                      {!isSidebarCollapsed && <span>B2B Mijozlar</span>}
                    </div>
                    {!isSidebarCollapsed && (
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                        activeTab === 'customers'
                          ? 'bg-white text-blue-700 font-black'
                          : hasCustomersAlert || pendingIncomingB2bCount > 0
                          ? 'bg-white text-red-700 font-black shadow-[0_0_12px_rgba(255,255,255,0.9)]'
                          : 'bg-[#0F2547] text-sky-200'
                      }`}>
                        {supplierCustomers.length + incomingManufacturerB2bOrders.length}
                      </span>
                    )}
                  </button>

                  {/* 4. Sozlamalar */}
                  <button
                    type="button"
                    onClick={() => setActiveTab('settings')}
                    title="Sozlamalar"
                    className={`w-full flex items-center ${isSidebarCollapsed ? 'justify-center p-3.5' : 'justify-between px-4 py-3.5'} rounded-2xl text-xs sm:text-sm font-black transition-all cursor-pointer border ${
                      activeTab === 'settings'
                        ? 'liquid-glass-tab-active text-white'
                        : 'liquid-glass-tab-inactive text-sky-100 hover:text-white'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Settings className={`w-4 h-4 shrink-0 ${activeTab === 'settings' ? 'text-white' : 'text-[#FFB800]'}`} />
                      {!isSidebarCollapsed && <span>Sozlamalar</span>}
                    </div>
                  </button>
                </nav>
              ) : (
                /* B2C Kabinetidagi Bo'limlar: 1. Monitoring hisobot, 2. Mahsulot, 3. B2B Mahsulotlar, 4. Onlayn Mijozlar, 5. Sozlamalar (LIQUID GLASS) */
                <nav className="flex flex-col gap-2.5">
                  {/* 1. Monitoring hisobot */}
                  <button
                    type="button"
                    onClick={() => setActiveTab('reports')}
                    title="Monitoring hisobot"
                    className={`w-full flex items-center ${isSidebarCollapsed ? 'justify-center p-3.5' : 'justify-between px-4 py-3.5'} rounded-2xl text-xs sm:text-sm font-black transition-all cursor-pointer border ${
                      activeTab === 'reports'
                        ? 'liquid-glass-tab-active text-white'
                        : hasReportsAlert
                        ? 'bg-gradient-to-r from-amber-500/30 via-emerald-500/25 to-amber-500/30 text-amber-200 border-amber-400 shadow-[0_0_20px_rgba(255,184,0,0.55)] ring-1 ring-amber-400/50 animate-pulse'
                        : 'liquid-glass-tab-inactive text-sky-100 hover:text-white'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <BarChart3 className={`w-4 h-4 shrink-0 ${activeTab === 'reports' ? 'text-white' : 'text-[#FFB800]'}`} />
                      {!isSidebarCollapsed && <span>Hisobot, monitoring</span>}
                    </div>
                    {!isSidebarCollapsed && (
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                        activeTab === 'reports'
                          ? 'bg-white text-blue-700 font-black'
                          : hasReportsAlert
                          ? 'bg-[#FFB800] text-slate-950 font-black shadow-[0_0_10px_rgba(255,184,0,0.8)]'
                          : 'bg-[#0F2547] text-sky-200'
                      }`}>
                        {supplierReport.sales.length}
                      </span>
                    )}
                  </button>

                  {/* 2. Mahsulot */}
                  <button
                    type="button"
                    onClick={() => setActiveTab('products')}
                    title="Mahsulotlar"
                    className={`w-full flex items-center ${isSidebarCollapsed ? 'justify-center p-3.5' : 'justify-between px-4 py-3.5'} rounded-2xl text-xs sm:text-sm font-black transition-all cursor-pointer border ${
                      activeTab === 'products'
                        ? 'liquid-glass-tab-active text-white'
                        : companyProducts.some((p) => (p.stock ?? 0) <= 0)
                        ? 'bg-[#133268] text-white border-sky-400 shadow-[0_0_16px_rgba(56,189,248,0.5)] animate-pulse'
                        : 'liquid-glass-tab-inactive text-sky-100 hover:text-white'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Package className={`w-4 h-4 shrink-0 ${activeTab === 'products' ? 'text-white' : 'text-[#FFB800]'}`} />
                      {!isSidebarCollapsed && <span>Mahsulotlar</span>}
                    </div>
                    {!isSidebarCollapsed && (
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                        activeTab === 'products' ? 'bg-white text-blue-700 font-black' : 'bg-[#0F2547] text-sky-200'
                      }`}>
                        {companyProducts.length}
                      </span>
                    )}
                  </button>

                  {/* 3. B2B Mahsulotlar */}
                  <button
                    type="button"
                    onClick={() => setActiveTab('b2b_manufacturers')}
                    title="B2B Mahsulotlar — Zavodlar bilan savdo"
                    className={`w-full flex items-center ${isSidebarCollapsed ? 'justify-center p-3.5' : 'justify-between px-4 py-3.5'} rounded-2xl text-xs sm:text-sm font-black transition-all cursor-pointer border ${
                      activeTab === 'b2b_manufacturers'
                        ? 'liquid-glass-tab-active text-white'
                        : awaitingPaymentB2bCount > 0
                        ? 'bg-gradient-to-r from-amber-500/35 via-emerald-500/35 to-amber-500/35 text-white border-amber-400 shadow-[0_0_24px_rgba(255,184,0,0.75)] ring-2 ring-amber-400/60 animate-pulse'
                        : 'liquid-glass-tab-inactive text-sky-100 hover:text-white'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Building className={`w-4 h-4 shrink-0 ${activeTab === 'b2b_manufacturers' ? 'text-white' : 'text-amber-400'}`} />
                      {!isSidebarCollapsed && <span className="text-left leading-tight">B2B Mahsulotlar</span>}
                    </div>
                    {!isSidebarCollapsed && (
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                        activeTab === 'b2b_manufacturers'
                          ? 'bg-white text-blue-700 font-black'
                          : awaitingPaymentB2bCount > 0
                          ? 'bg-emerald-400 text-slate-950 font-black'
                          : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                      }`}>
                        {awaitingPaymentB2bCount > 0 ? `! ${awaitingPaymentB2bCount}` : manufacturerProducts.length}
                      </span>
                    )}
                  </button>

                  {/* 4. Onlayn Mijozlar */}
                  <button
                    type="button"
                    onClick={() => setActiveTab('customers')}
                    title="Onlayn Mijozlar"
                    className={`w-full flex items-center ${isSidebarCollapsed ? 'justify-center p-3.5' : 'justify-between px-4 py-3.5'} rounded-2xl text-xs sm:text-sm font-black transition-all cursor-pointer border ${
                      activeTab === 'customers'
                        ? 'liquid-glass-tab-active text-white'
                        : hasCustomersAlert
                        ? 'bg-red-600 text-white border-red-400 shadow-[0_0_24px_rgba(220,38,38,0.85)] ring-2 ring-red-400/70 animate-pulse'
                        : 'liquid-glass-tab-inactive text-sky-100 hover:text-white'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Users className={`w-4 h-4 shrink-0 ${
                        activeTab === 'customers' || hasCustomersAlert ? 'text-white' : 'text-[#FFB800]'
                      }`} />
                      {!isSidebarCollapsed && <span className="text-left leading-tight">Onlayn Mijozlar</span>}
                    </div>
                    {!isSidebarCollapsed && (
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                        activeTab === 'customers'
                          ? 'bg-white text-blue-700 font-black'
                          : hasCustomersAlert
                          ? 'bg-white text-red-700 font-black shadow-[0_0_12px_rgba(255,255,255,0.9)]'
                          : 'bg-[#0F2547] text-sky-200'
                      }`}>
                        {supplierCustomers.length}
                      </span>
                    )}
                  </button>

                  {/* 5. Sozlamalar */}
                  <button
                    type="button"
                    onClick={() => setActiveTab('settings')}
                    title="Sozlamalar"
                    className={`w-full flex items-center ${isSidebarCollapsed ? 'justify-center p-3.5' : 'justify-between px-4 py-3.5'} rounded-2xl text-xs sm:text-sm font-black transition-all cursor-pointer border ${
                      activeTab === 'settings'
                        ? 'liquid-glass-tab-active text-white'
                        : 'liquid-glass-tab-inactive text-sky-100 hover:text-white'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Settings className={`w-4 h-4 shrink-0 ${activeTab === 'settings' ? 'text-white' : 'text-[#FFB800]'}`} />
                      {!isSidebarCollapsed && <span className="text-left leading-tight">Sozlamalar</span>}
                    </div>
                  </button>
                </nav>
              )}
            </div>
          </aside>
          )}

          {/* O'NG TARAF: ASOSIY ISHCHI OYNA */}
          <div className="flex-1 min-w-0 w-full mt-1.5 sm:mt-0 bg-[#071326] px-2 sm:px-6 lg:px-8 py-2 sm:py-6 space-y-2.5 sm:space-y-5">

            {/* MOBIL EKRANDA BO'LIMLAR YON TARAFDAN CHIQADIGAN TUGMA */}
            {activeTab !== 'crm' && activeTab !== 'qarz_daftari' && (
              <div className="lg:hidden flex items-center justify-between gap-2 bg-[#0A1931] border border-[#1E3A6D] rounded-xl px-2.5 py-1.5 shadow-md">
                <button
                  type="button"
                  onClick={() => setIsMobileSidebarOpen(true)}
                  className="liquid-glass-tab-active px-3 py-1.5 rounded-xl font-black text-[11px] text-white flex items-center gap-2 cursor-pointer"
                >
                  <PanelLeftOpen className="w-3.5 h-3.5 text-[#FFB800] shrink-0" />
                  <span>Bo‘limlar</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsMobileSidebarOpen(true)}
                  className="text-[11px] font-black text-sky-200 flex items-center gap-1.5 truncate cursor-pointer"
                >
                  <span className="truncate">
                    {activeTab === 'reports'
                      ? 'Hisobot, monitoring'
                      : activeTab === 'products'
                      ? 'Mahsulotlar'
                      : activeTab === 'customers'
                      ? supplierData.cabinetType === 'manufacturer'
                        ? 'B2B Mijozlar'
                        : 'Onlayn Mijozlar'
                      : activeTab === 'b2b_manufacturers'
                      ? 'B2B Mahsulotlar'
                      : activeTab === 'settings'
                      ? 'Sozlamalar'
                      : 'Loglar'}
                  </span>
                </button>
              </div>
            )}

            {/* BILDIRISHNOMA ALERT BANNERI (Onlayn savdo So'rovi — faqat B2B kabinetda) */}
            {supplierData.cabinetType === 'manufacturer' && hasCustomersAlert && (
              <div className="p-4 sm:p-5 rounded-3xl bg-gradient-to-r from-emerald-950/90 via-slate-950 to-amber-950/90 border-2 border-emerald-400 shadow-[0_0_28px_rgba(16,185,129,0.45)] flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-fadeIn">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-emerald-500/25 border border-emerald-400 flex items-center justify-center text-emerald-300 shrink-0 animate-bounce">
                    <AlertCircle className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-xs sm:text-sm font-black text-white flex items-center gap-2 flex-wrap">
                      <span className="px-2.5 py-0.5 rounded-full bg-emerald-400 text-slate-950 text-[10px] font-mono uppercase">
                        Onlayn savdo So‘rovi
                      </span>
                      <span>
                        {pendingCustomersCount > 0
                          ? `B2B Mijozlar bo‘limida ${pendingCustomersCount} ta yangi onlayn savdo so‘rovi qabul qilishni kutmoqda!`
                          : `${loadingCustomersCount} ta buyurtma yuklash jarayonida — yetkazib beruvchi telefon raqamini tasdiqlang!`}
                      </span>
                    </div>
                    <p className="text-[11px] text-emerald-200/90 mt-0.5">
                      Buyurtmani qabul qilib, tasdiqlash orqali yetkazib beruvchi telefon raqamini kiriting — raqam mijoz kabinetida ham darhol ko‘rinadi.
                    </p>
                  </div>
                </div>
                {activeTab !== 'customers' && (
                  <button
                    type="button"
                    onClick={() => setActiveTab('customers')}
                    className="px-4 py-2.5 rounded-xl bg-emerald-400 hover:bg-emerald-300 text-slate-950 font-black text-xs cursor-pointer shrink-0 shadow-lg active:scale-95 transition-all"
                  >
                    Onlayn savdo So‘rovini ko‘rish →
                  </button>
                )}
              </div>
            )}

            {/* B2C KABINETIDAN B2B KABINETGA KELGAN YANGI SO'ROV BANNERI -> B2B buyurtmalar bo'limiga o'tkazadi */}
            {supplierData.cabinetType === 'manufacturer' && pendingIncomingB2bCount > 0 && (
              <div className="p-4 sm:p-5 rounded-3xl bg-gradient-to-r from-amber-950/90 via-slate-950 to-emerald-950/90 border-2 border-[#FFB800] shadow-[0_0_28px_rgba(255,184,0,0.45)] flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-fadeIn">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-[#FFB800]/25 border border-[#FFB800] flex items-center justify-center text-[#FFB800] shrink-0 animate-bounce">
                    <Building className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-xs sm:text-sm font-black text-white flex items-center gap-2 flex-wrap">
                      <span className="px-2 py-0.5 rounded-full bg-[#FFB800] text-slate-950 text-[10px] font-mono uppercase">
                        Yangi B2B So‘rov
                      </span>
                      <span>
                        B2C kabinetidan {pendingIncomingB2bCount} ta yangi ulgurji buyurtma so‘rovi «B2B buyurtmalar» bo‘limiga kelib tushdi!
                      </span>
                    </div>
                    <p className="text-[11px] text-amber-200/90 mt-0.5">
                      «B2B buyurtmalar» bo‘limiga o‘tib, ta'minotchi korxona ma'lumotlari va yuk ro‘yxati PDF hujjatini ko‘rib tasdiqlang.
                    </p>
                  </div>
                </div>
                {activeTab !== 'b2b_orders' && (
                  <button
                    type="button"
                    onClick={() => setActiveTab('b2b_orders')}
                    className="px-4 py-2.5 rounded-xl bg-[#FFB800] hover:bg-[#FFC928] text-slate-950 font-black text-xs cursor-pointer shrink-0 shadow-lg active:scale-95 transition-all"
                  >
                    B2B buyurtmalar bo‘limiga o‘tish →
                  </button>
                )}
              </div>
            )}

            {/* B2B TO'LOV BILDIRISHNOMASI BANNERI (Zavod tasdiqlaganda sotib olayotgan B2C ta'minotchiga keladi) */}
            {supplierData.cabinetType !== 'manufacturer' && awaitingPaymentB2bCount > 0 && (
              <div className="p-4 sm:p-5 rounded-3xl bg-gradient-to-r from-amber-950/90 via-slate-950 to-emerald-950/90 border-2 border-[#FFB800] shadow-[0_0_28px_rgba(255,184,0,0.45)] flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-fadeIn">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-[#FFB800]/25 border border-[#FFB800] flex items-center justify-center text-[#FFB800] shrink-0 animate-bounce">
                    <Building className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-xs sm:text-sm font-black text-white flex items-center gap-2 flex-wrap">
                      <span className="px-2 py-0.5 rounded-full bg-[#FFB800] text-slate-950 text-[10px] font-mono uppercase">
                        B2B Zavod Tasdig‘i
                      </span>
                      <span>
                        Sizning {awaitingPaymentB2bCount} ta B2B so‘rovingiz Zavod tomonidan tasdiqlandi! Pulni hisobga o‘tkazishingiz so‘raladi.
                      </span>
                    </div>
                    <p className="text-[11px] text-amber-200/90 mt-0.5">
                      B2B bo‘limida «Pulni hisobga o‘tkazish» tugmasini bosing — to‘lov zavod hisobiga o‘tkaziladi va yuk manzilingizga jo‘natiladi.
                    </p>
                  </div>
                </div>
                {activeTab !== 'b2b_manufacturers' && (
                  <button
                    type="button"
                    onClick={() => setActiveTab('b2b_manufacturers')}
                    className="px-4 py-2.5 rounded-xl bg-[#FFB800] hover:bg-[#FFC928] text-slate-950 font-black text-xs cursor-pointer shrink-0 shadow-lg active:scale-95 transition-all"
                  >
                    B2B Bo‘limiga o‘tish →
                  </button>
                )}
              </div>
            )}

        {/* Tab 2: Mahsulotlar (Products) — Ixcham sarlavha + bitta mobil ekranda 5 ta mahsulot + ustiga bosganda to'liq ma'lumot */}
        {activeTab === 'products' && (
          <div className="space-y-2 sm:space-y-4 mt-1.5 sm:mt-0 animate-fadeIn">
            <div className="bg-[#0A1931] border-2 border-[#1E3A6D] rounded-xl sm:rounded-3xl p-2 sm:p-4 space-y-1.5 sm:space-y-3 shadow-2xl">
              {/* Ixcham sarlavha + Yangi mahsulot qo'shish */}
              <div className="flex items-center justify-between gap-2">
                <div
                  onClick={() => setIsMobileSidebarOpen(true)}
                  className="flex items-center gap-1.5 sm:gap-2.5 min-w-0 cursor-pointer lg:cursor-default"
                >
                  <div className="p-1.5 sm:p-2 rounded-lg sm:rounded-xl bg-[#FFB800]/20 text-[#FFB800] border border-[#FFB800]/40 shrink-0">
                    <Package className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  </div>
                  <h3 className="text-xs sm:text-base font-black text-white tracking-wide truncate">
                    Korxona Mahsulotlari Katalogi
                  </h3>
                </div>

                <button
                  type="button"
                  onClick={() => handleOpenAddProductModal('products', productsSubTab)}
                  className="flex items-center justify-center gap-1 px-2.5 py-1.5 sm:px-4 sm:py-2 rounded-lg sm:rounded-xl bg-[#FFB800] hover:bg-[#FFC928] text-[#0A1931] border border-[#E5A600] font-black text-[10px] sm:text-xs shadow cursor-pointer active:scale-95 transition-all shrink-0"
                >
                  <Plus className="w-3 h-3 sm:w-4 sm:h-4 stroke-[3]" />
                  <span>Yangi Mahsulot Qo‘shish</span>
                </button>
              </div>

              {/* ONLAYN BUNKER VA OFLAYN MAHSULOTLAR YONMA-YON IXCHAM */}
              <div className="grid grid-cols-2 gap-1.5 sm:gap-2.5 pt-1.5 border-t border-[#1E3A6D]">
                <button
                  type="button"
                  onClick={() => setProductsSubTab('online')}
                  className={`py-1.5 px-2 sm:p-2.5 rounded-lg sm:rounded-xl border font-black text-[10px] sm:text-xs flex items-center justify-between gap-1 cursor-pointer transition-colors ${
                    productsSubTab === 'online'
                      ? 'bg-[#FFB800] text-[#0A1931] border-[#E5A600] shadow-sm'
                      : 'bg-[#071326] hover:bg-[#0F2547] text-white border-[#1E3A6D]'
                  }`}
                >
                  <div className="flex items-center gap-1 sm:gap-1.5 min-w-0 text-left">
                    <Globe className={`w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0 ${productsSubTab === 'online' ? 'text-[#0A1931]' : 'text-[#FFB800]'}`} />
                    <span className="truncate">1. Onlayn Bunker</span>
                  </div>
                  <span className={`px-1.5 py-0.2 rounded-full text-[9px] sm:text-[11px] font-mono font-black shrink-0 ${
                    productsSubTab === 'online' ? 'bg-[#0A1931] text-[#FFB800]' : 'bg-[#0F2547] text-amber-400'
                  }`}>
                    {onlineCompanyProducts.length} ta
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setProductsSubTab('offline')}
                  className={`py-1.5 px-2 sm:p-2.5 rounded-lg sm:rounded-xl border font-black text-[10px] sm:text-xs flex items-center justify-between gap-1 cursor-pointer transition-colors ${
                    productsSubTab === 'offline'
                      ? 'bg-[#FFB800] text-[#0A1931] border-[#E5A600] shadow-sm'
                      : 'bg-[#071326] hover:bg-[#0F2547] text-white border-[#1E3A6D]'
                  }`}
                >
                  <div className="flex items-center gap-1 sm:gap-1.5 min-w-0 text-left">
                    <Store className={`w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0 ${productsSubTab === 'offline' ? 'text-[#0A1931]' : 'text-emerald-400'}`} />
                    <span className="truncate">2. Oflayn mahsulotlar</span>
                  </div>
                  <span className={`px-1.5 py-0.2 rounded-full text-[9px] sm:text-[11px] font-mono font-black shrink-0 ${
                    productsSubTab === 'offline' ? 'bg-[#0A1931] text-[#FFB800]' : 'bg-[#0F2547] text-emerald-400'
                  }`}>
                    {offlineCompanyProducts.length} ta
                  </span>
                </button>
              </div>
            </div>

            {/* MOBIL 2 USTUNLI IXCHAM GRID VA DESKTOP JADVAL — Mobilda 2 ustunli ixcham kartochkalar (Nomi va Narxi asosiy), bosilganda bitta ekranda to'liq ma'lumotli modal oynasi ochiladi */}
            {displayedCompanyProducts.length > 0 && (
              <>
                {/* MOBIL KO'RINISH: 2 ta ustunli ixcham grid */}
                <div className="grid grid-cols-2 gap-2 sm:hidden">
                  {displayedCompanyProducts.map((prod, idx) => {
                    const isUnlimited = Boolean(prod.unlimitedStock || (prod.stock !== undefined && Number(prod.stock) >= 999999999));
                    const stockQty = isUnlimited ? 999999999 : (prod.stock !== undefined && prod.stock !== null ? Number(prod.stock) : 999999);
                    const isOutOfStock = !isUnlimited && stockQty <= 0;
                    const variantsCount = getProductVariantsList(prod).length;

                    return (
                      <div
                        key={prod.id}
                        onClick={() => {
                          setSelectedMobileProductDetail(prod);
                          setMobileProductDetailImgIdx(0);
                        }}
                        className={`rounded-xl border-2 p-2 flex flex-col justify-between transition-all cursor-pointer active:scale-[0.98] shadow-md ${
                          isOutOfStock
                            ? 'bg-[#133268] border-rose-500/60 animate-pulse'
                            : 'bg-[#0A1931] border-[#1E3A6D] hover:border-[#FFB800]/70'
                        }`}
                      >
                        <div>
                          {/* Yuqori qism: Rasm + № + Variant soni */}
                          <div className="flex items-center gap-2 mb-1.5">
                            <div className="relative w-11 h-11 rounded-lg bg-[#071326] border border-[#1E3A6D] overflow-hidden shrink-0">
                              <img
                                src={prod.image}
                                alt={prod.title}
                                className="w-full h-full object-cover"
                              />
                              <span className="absolute top-0 left-0 bg-[#071326]/90 text-[#FFB800] font-mono font-black text-[8px] px-1 py-0.2 rounded-br">
                                #{idx + 1}
                              </span>
                            </div>
                            <div className="min-w-0 flex-1">
                              <span className="inline-block text-[8px] font-mono font-bold text-amber-400 uppercase truncate max-w-full">
                                {prod.category}
                              </span>
                              <div className="flex flex-wrap items-center gap-1 mt-0.5">
                                <span className="px-1 py-0.5 rounded bg-[#071326] border border-[#FFB800]/40 font-mono font-black text-[#FFB800] text-[8px]">
                                  Variant ({variantsCount})
                                </span>
                                <span className="text-[8px] font-mono font-bold text-sky-200 truncate">
                                  {isOutOfStock
                                    ? `0 ${prod.unit}`
                                    : isUnlimited
                                    ? 'Cheksiz'
                                    : `${prod.stock ?? 0} ${prod.unit}`}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Asosiy: Mahsulot nomi */}
                          <h4 className="font-black text-[11px] text-white leading-tight line-clamp-1 mb-1">
                            {prod.title}
                          </h4>
                        </div>

                        {/* Asosiy: Mahsulot narxi va Tahrirlash tugmasi */}
                        <div className="pt-1.5 border-t border-[#1E3A6D]/80 flex items-center justify-between gap-1">
                          <div className="min-w-0">
                            <span className="block text-[7.5px] text-sky-300 font-bold uppercase leading-none">
                              Narxi:
                            </span>
                            <div className="font-mono font-black text-[11px] text-[#FFB800] truncate mt-0.5">
                              {new Intl.NumberFormat('uz-UZ').format(prod.price)}{' '}
                              <span className="text-[8px] text-sky-200 font-normal">so‘m</span>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenEditProductModal(prod);
                            }}
                            className="px-2 py-1 rounded-lg bg-[#FFB800] hover:bg-[#FFC928] text-slate-950 font-black text-[8.5px] inline-flex items-center gap-0.5 shrink-0 cursor-pointer shadow active:scale-95"
                          >
                            <Settings className="w-2.5 h-2.5 shrink-0" />
                            <span>Tahrir</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* DESKTOP KO'RINISH: To'liq jadval */}
                <div className="hidden sm:block bg-[#0A1931] border-2 border-[#1E3A6D] rounded-3xl overflow-hidden shadow-[0_14px_35px_rgba(10,25,49,0.35)]">
                  <div className="w-full overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs text-white">
                      <thead className="bg-[#071326] text-[#FFB800] uppercase text-[11px] font-mono tracking-wider border-b-2 border-[#1E3A6D]">
                        <tr>
                          <th className="py-3.5 px-4 font-black w-12 text-center border-r border-[#1E3A6D]">№</th>
                          <th className="py-3.5 px-4 font-black border-r border-[#1E3A6D]">Mahsulot nomi</th>
                          <th className="py-3.5 px-4 font-black border-r border-[#1E3A6D]">Variantlar</th>
                          <th className="py-3.5 px-4 font-black border-r border-[#1E3A6D]">Xususiyatlari</th>
                          <th className="py-3.5 px-4 font-black border-r border-[#1E3A6D]">Narxi</th>
                          {supplierData.cabinetType !== 'manufacturer' && (
                            <th className="py-3.5 px-4 font-black border-r border-[#1E3A6D]">
                              CRM narxi
                            </th>
                          )}
                          <th className="py-3.5 px-4 font-black text-center">Tahrirlash</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#1E3A6D]">
                        {displayedCompanyProducts.map((prod, idx) => {
                          const crmPrice = getProductCrmPrice(prod);
                          const isUnlimited = Boolean(prod.unlimitedStock || (prod.stock !== undefined && Number(prod.stock) >= 999999999));
                          const stockQty = isUnlimited ? 999999999 : (prod.stock !== undefined && prod.stock !== null ? Number(prod.stock) : 999999);
                          const isOutOfStock = !isUnlimited && stockQty <= 0;
                          const variantsCount = getProductVariantsList(prod).length;
                          return (
                            <tr
                              key={prod.id}
                              onClick={() => {
                                setSelectedMobileProductDetail(prod);
                                setMobileProductDetailImgIdx(0);
                              }}
                              className={`${
                                isOutOfStock
                                  ? 'bg-[#133268] animate-pulse'
                                  : idx % 2 === 0
                                  ? 'bg-[#0A1931]'
                                  : 'bg-[#0D2142]'
                              } hover:bg-[#132C54] transition-colors cursor-pointer`}
                            >
                              <td className="py-3.5 px-4 font-mono font-black text-sm text-[#FFB800] text-center border-r border-[#1E3A6D]">
                                {idx + 1}
                              </td>
                              <td className="py-3.5 px-4 border-r border-[#1E3A6D]">
                                <div className="flex items-center gap-3 min-w-0">
                                  <div className="relative w-12 h-12 rounded-xl bg-[#071326] border border-[#1E3A6D] overflow-hidden shrink-0 shadow">
                                    <img
                                      src={prod.image}
                                      alt={prod.title}
                                      className="w-full h-full object-cover"
                                    />
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <div className="font-black text-sm text-white leading-tight truncate">
                                      {prod.title}
                                    </div>
                                    <div className="text-[10px] text-amber-400 font-mono truncate">
                                      {prod.category}
                                    </div>
                                  </div>
                                </div>
                              </td>
                              <td className="py-3.5 px-4 border-r border-[#1E3A6D]">
                                <div className="space-y-1">
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#071326] border border-[#FFB800]/50 font-mono font-black text-[#FFB800] text-xs">
                                    Variant ({variantsCount})
                                  </span>
                                  <div className="font-mono font-bold text-xs text-sky-200 truncate">
                                    {isOutOfStock
                                      ? `0 ${prod.unit}`
                                      : isUnlimited
                                      ? 'Cheklanmagan'
                                      : `${prod.stock ?? 0} ${prod.unit}`}
                                  </div>
                                </div>
                              </td>
                              <td className="py-3.5 px-4 border-r border-[#1E3A6D] max-w-[220px]">
                                <div className="space-y-1 text-xs text-sky-100 leading-tight">
                                  {supplierData.cabinetType === 'manufacturer' ? (
                                    <div>
                                      <span className="text-sky-300 font-bold">Min:</span>{' '}
                                      <span className="font-mono font-black text-white">
                                        {prod.minOrder || 1} {prod.unit}
                                      </span>
                                    </div>
                                  ) : (
                                    <div>
                                      <span className="text-sky-300 font-bold">Asl:</span>{' '}
                                      <span className="font-mono font-black text-amber-300">
                                        {prod.costPrice ? formatPrice(prod.costPrice) : '-'}
                                      </span>
                                    </div>
                                  )}
                                  {prod.description && (
                                    <p className="text-[11px] text-sky-200/90 line-clamp-1">
                                      {prod.description}
                                    </p>
                                  )}
                                </div>
                              </td>
                              <td className="py-3.5 px-4 border-r border-[#1E3A6D]">
                                <div className="font-mono font-black text-sm text-[#FFB800] leading-tight">
                                  {new Intl.NumberFormat('uz-UZ').format(prod.price)}
                                  <span className="text-xs text-sky-200 font-normal ml-1">
                                    so‘m
                                  </span>
                                </div>
                              </td>
                              {supplierData.cabinetType !== 'manufacturer' && (
                                <td className="py-3.5 px-4 border-r border-[#1E3A6D] whitespace-nowrap">
                                  <div className="font-mono font-black text-sm text-emerald-300">
                                    {formatPrice(crmPrice)}
                                  </div>
                                </td>
                              )}
                              <td
                                className="py-3.5 px-4 text-center"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <button
                                  type="button"
                                  onClick={() => handleOpenEditProductModal(prod)}
                                  className="px-3.5 py-2 rounded-xl bg-[#FFB800] hover:bg-[#FFC928] text-slate-950 font-black text-xs inline-flex items-center justify-center gap-1 cursor-pointer shadow active:scale-95 transition-all"
                                >
                                  <Settings className="w-3.5 h-3.5 shrink-0" />
                                  <span>Tahrirlash</span>
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}

            {/* MAHSULOT USTIGA BOSGANDA BITTA EKRANDA BARCHA MA'LUMOTLARINI KO'RSATUVCHI MODAL */}
            {selectedMobileProductDetail && (() => {
              const p = selectedMobileProductDetail;
              const pImages = p.images && p.images.length > 0 ? p.images : [p.image];
              const pVariants = getProductVariantsList(p);
              const isUnlim = Boolean(p.unlimitedStock || (p.stock !== undefined && Number(p.stock) >= 999999999));
              return (
                <div
                  className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 animate-fadeIn"
                  onClick={() => setSelectedMobileProductDetail(null)}
                >
                  <div
                    className="w-full max-w-lg max-h-[90dvh] bg-[#0A1931] border-2 border-[#FFB800] rounded-2xl sm:rounded-3xl overflow-y-auto p-3 sm:p-5 space-y-2.5 shadow-2xl"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {/* Yuqori sarlavha va Rasm bitta ixcham blokda */}
                    <div className="flex items-start gap-2.5 pb-2 border-b border-[#1E3A6D]">
                      <div className="relative w-20 h-20 sm:w-28 sm:h-28 rounded-xl overflow-hidden bg-[#071326] border border-[#1E3A6D] shrink-0">
                        <img
                          src={pImages[mobileProductDetailImgIdx] || p.image}
                          alt={p.title}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-[9px] sm:text-[10px] font-mono font-black uppercase px-2 py-0.5 rounded bg-[#FFB800]/20 text-[#FFB800] border border-[#FFB800]/40 truncate">
                            {p.category}
                          </span>
                          <button
                            type="button"
                            onClick={() => setSelectedMobileProductDetail(null)}
                            className="p-1 rounded-lg bg-[#071326] text-sky-200 hover:text-white border border-[#1E3A6D] cursor-pointer shrink-0"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                        <h3 className="text-sm sm:text-lg font-black text-white mt-1 leading-tight break-words">
                          {p.title}
                        </h3>
                        <div className="mt-1 font-mono font-black text-sm sm:text-base text-[#FFB800]">
                          {formatPrice(p.price)} <span className="text-[10px] text-sky-200 font-normal">/ {p.unit}</span>
                        </div>
                      </div>
                    </div>

                    {pImages.length > 1 && (
                      <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
                        {pImages.map((imgUrl, i) => (
                          <button
                            key={i}
                            type="button"
                            onClick={() => setMobileProductDetailImgIdx(i)}
                            className={`w-10 h-10 rounded-lg overflow-hidden border-2 shrink-0 cursor-pointer ${
                              mobileProductDetailImgIdx === i ? 'border-[#FFB800]' : 'border-[#1E3A6D] opacity-70'
                            }`}
                          >
                            <img src={imgUrl} alt="" className="w-full h-full object-cover" />
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Asosiy ko'rsatkichlar bitta ekranda */}
                    <div className="grid grid-cols-2 gap-1.5 text-xs">
                      <div className="p-2 rounded-xl bg-[#071326] border border-[#1E3A6D]">
                        <span className="text-[9px] text-sky-300 font-bold block">Omborda mavjud:</span>
                        <span className="font-mono font-black text-xs sm:text-sm text-white">
                          {isUnlim ? 'Cheklanmagan' : `${p.stock ?? 0} ${p.unit}`}
                        </span>
                      </div>
                      {supplierData.cabinetType === 'manufacturer' ? (
                        <div className="p-2 rounded-xl bg-[#071326] border border-[#1E3A6D]">
                          <span className="text-[9px] text-sky-300 font-bold block">Minimal buyurtma:</span>
                          <span className="font-mono font-black text-xs sm:text-sm text-[#FFB800]">
                            {p.minOrder || 1} {p.unit}
                          </span>
                        </div>
                      ) : (
                        <div className="p-2 rounded-xl bg-[#071326] border border-emerald-500/40">
                          <span className="text-[9px] text-emerald-300 font-bold block">CRM narxi:</span>
                          <span className="font-mono font-black text-xs sm:text-sm text-emerald-400">
                            {formatPrice(getProductCrmPrice(p))}
                          </span>
                        </div>
                      )}
                      {supplierData.cabinetType !== 'manufacturer' && (
                        <div className="p-2 rounded-xl bg-[#071326] border border-[#1E3A6D] col-span-2 flex items-center justify-between">
                          <span className="text-[9px] text-sky-300 font-bold">Asl (keltirilgan) narxi:</span>
                          <span className="font-mono font-black text-xs text-amber-300">
                            {p.costPrice ? formatPrice(p.costPrice) : '—'}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Variantlar va ranglar */}
                    <div className="p-2 rounded-xl bg-[#071326] border border-[#1E3A6D] space-y-1">
                      <span className="text-[9px] font-black text-[#FFB800] uppercase block">
                        Variantlar ({pVariants.length} ta):
                      </span>
                      <div className="space-y-1 max-h-24 overflow-y-auto">
                        {pVariants.map((v, vIdx) => (
                          <div
                            key={v.id || vIdx}
                            className="px-2 py-1 rounded-lg bg-[#0A1931] border border-[#1E3A6D] flex items-center justify-between gap-2 text-[10px]"
                          >
                            <span className="font-mono font-bold text-white truncate">
                              #{vIdx + 1}: {v.specification || `1 ${v.unit}`}
                            </span>
                            <span className="font-mono font-black text-emerald-400 shrink-0">
                              {formatPrice(v.price || p.price)}
                            </span>
                          </div>
                        ))}
                      </div>
                      {p.colors && p.colors.length > 0 && (
                        <div className="flex flex-wrap gap-1 pt-0.5">
                          {p.colors.map((c) => {
                            const colStyle = getColorPaletteItem(c);
                            return (
                              <span
                                key={c}
                                className="text-[8.5px] font-bold px-1.5 py-0.5 rounded border border-white/25"
                                style={{ backgroundColor: colStyle.bg, color: colStyle.text }}
                              >
                                {c}
                              </span>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Video havola */}
                    {p.videoUrl && (
                      <div className="p-1.5 rounded-xl bg-[#071326] border border-[#1E3A6D] flex items-center justify-between gap-2 text-xs">
                        <span className="text-sky-200 font-bold text-[10px]">Video:</span>
                        <a
                          href={p.videoUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[#FFB800] underline font-mono text-[10px] truncate max-w-[200px]"
                        >
                          {p.videoUrl}
                        </a>
                      </div>
                    )}

                    {/* Tavsif */}
                    {p.description && (
                      <div className="p-2 rounded-xl bg-[#071326] border border-[#1E3A6D] space-y-0.5">
                        <span className="text-[9px] font-black text-sky-300 uppercase block">
                          Mahsulot haqida ma'lumot:
                        </span>
                        <p className="text-[10.5px] text-sky-100 leading-snug whitespace-pre-line max-h-24 overflow-y-auto">
                          {p.description}
                        </p>
                      </div>
                    )}

                    <div className="flex items-center justify-end gap-2 pt-0.5">
                      <button
                        type="button"
                        onClick={() => {
                          const target = p;
                          setSelectedMobileProductDetail(null);
                          handleOpenEditProductModal(target);
                        }}
                        className="flex-1 py-2 px-3 rounded-xl bg-[#FFB800] hover:bg-[#FFC928] text-slate-950 font-black text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow"
                      >
                        <Settings className="w-3.5 h-3.5" />
                        <span>Mahsulotni Tahrirlash</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedMobileProductDetail(null)}
                        className="py-2 px-3.5 rounded-xl bg-[#071326] hover:bg-[#0F2547] text-white border border-[#1E3A6D] font-black text-xs cursor-pointer"
                      >
                        Yopish
                      </button>
                    </div>
                  </div>
                </div>
              );
            })()}

            {displayedCompanyProducts.length === 0 && (
              <div className="text-center py-16 bg-[#0A1931] rounded-3xl border-2 border-dashed border-[#1E3A6D] p-8 space-y-3">
                <Package className="w-12 h-12 text-[#FFB800] mx-auto" />
                <p className="text-sky-200 text-sm font-bold">
                  {supplierData.cabinetType === 'manufacturer'
                    ? 'Hozircha korxona mahsulotlari kiritilmagan.'
                    : productsSubTab === 'online'
                    ? 'Hozircha Onlayn savdo mahsulotlari kiritilmagan.'
                    : 'Hozircha Oflayn mahsulotlar kiritilmagan.'}
                </p>
                <button
                  type="button"
                  onClick={() =>
                    handleOpenAddProductModal(
                      'products',
                      supplierData.cabinetType === 'manufacturer' ? 'online' : productsSubTab
                    )
                  }
                  className="px-5 py-2.5 rounded-xl bg-[#FFB800] text-slate-950 font-black text-xs cursor-pointer"
                >
                  Yangi Mahsulot Qo‘shish
                </button>
              </div>
            )}
          </div>
        )}

        {/* Tab: CRM — 2 VA UNDAN ORTIQ SAVDO SAVATI SHAKLLANTIRISH IMKONI BILAN (Mobilda 2x kichraytirilgan va Savatlar ketma-ket 3 ta sig'adigan darajada tepada) */}
        {activeTab === 'crm' && (
          <div className="space-y-2.5 sm:space-y-6 mt-2.5 sm:mt-0 animate-fadeIn bg-[#071326]">
            {/* CRM Header + Savdo Savatlari (ketma-ket 3 ta sig'adigan darajada) */}
            <div className="bg-[#0A1931] border-2 border-[#1E3A6D] rounded-2xl sm:rounded-3xl p-2.5 sm:p-6 space-y-2.5 sm:space-y-4 shadow-2xl">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2 sm:gap-3.5 min-w-0">
                  <div className="p-1.5 sm:p-3 rounded-xl sm:rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shrink-0">
                    <Calculator className="w-4 h-4 sm:w-6 sm:h-6" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-xs sm:text-xl font-black text-white leading-tight">
                      CRM — Ko‘p Savatli Savdo Tizimi
                    </h2>
                    <span className="text-[10px] sm:text-xs font-bold text-emerald-400 block">
                      Savdo Savatlari ({crmBaskets.length} ta)
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleAddNewCrmBasket}
                  className="px-2.5 py-1.5 sm:px-3.5 sm:py-2 rounded-xl bg-[#FFB800] hover:bg-[#FFC928] text-slate-950 font-black text-[10px] sm:text-xs cursor-pointer flex items-center gap-1 shadow-sm shrink-0"
                >
                  <Plus className="w-3 h-3 sm:w-3.5 sm:h-3.5 stroke-[3]" />
                  <span>Yana savat qo‘shish</span>
                </button>
              </div>

              {/* Savatlar ketma-ket 3 ta sig'adigan darajada (grid-cols-3) */}
              <div className="grid grid-cols-3 gap-1.5 sm:gap-2.5 pt-2 border-t border-[#1E3A6D]">
                {crmBaskets.map((basket) => {
                  const isActive = basket.id === activeCrmBasket.id;
                  const count = basket.selectedIds.length;
                  return (
                    <div
                      key={basket.id}
                      onClick={() => setActiveCrmBasketId(basket.id)}
                      className={`flex items-center justify-between gap-1 px-2 py-1.5 sm:px-3.5 sm:py-2 rounded-xl border font-black text-[10px] sm:text-xs cursor-pointer transition-colors min-w-0 ${
                        isActive
                          ? 'bg-emerald-500 text-slate-950 border-emerald-300 shadow-md'
                          : 'bg-[#071326] hover:bg-[#0F2547] text-sky-100 border-[#1E3A6D]'
                      }`}
                    >
                      <div className="flex items-center gap-1 min-w-0">
                        <ShoppingBag className="w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0" />
                        <span className="leading-tight break-words">{basket.name}</span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <span className="px-1.5 py-0.2 rounded-full text-[9px] sm:text-[10px] font-mono bg-[#071326] text-emerald-400">
                          {count} xil
                        </span>
                        {crmBaskets.length > 1 && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRemoveCrmBasket(basket.id);
                            }}
                            className={`p-0.5 rounded ${
                              isActive ? 'hover:bg-[#071326]/20 text-slate-950' : 'hover:bg-red-500/20 text-red-400'
                            }`}
                            title="Savatni o‘chirish"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* B2B Kabineti uchun B2B Amaliyotlar ko'rsatkichi */}
            {supplierData.cabinetType === 'manufacturer' && incomingManufacturerB2bOrders.length > 0 && (
              <div className="bg-[#0A1931] border-2 border-[#1E3A6D] rounded-2xl sm:rounded-3xl p-2.5 sm:p-5 space-y-2 sm:space-y-3 shadow-xl">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-[10px] sm:text-xs font-black uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                    <Building className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    <span>B2B Savdo va To‘lov Amaliyotlari ({incomingManufacturerB2bOrders.length} ta)</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setActiveTab('b2b_orders')}
                    className="text-[10px] sm:text-xs font-black text-[#FFB800] hover:underline cursor-pointer"
                  >
                    B2B buyurtmalarni boshqarish →
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-1.5 sm:gap-3 text-[10px] sm:text-xs">
                  <div className="p-2 sm:p-3 rounded-xl sm:rounded-2xl bg-[#071326] border border-[#1E3A6D]">
                    <span className="text-sky-200 block">Jami B2B So‘rovlar:</span>
                    <strong className="text-white text-xs sm:text-base font-mono font-black">{incomingManufacturerB2bOrders.length} ta</strong>
                  </div>
                  <div className="p-2 sm:p-3 rounded-xl sm:rounded-2xl bg-[#071326] border border-[#1E3A6D]">
                    <span className="text-sky-200 block">Tasdiqlash kutilmoqda:</span>
                    <strong className="text-amber-400 text-xs sm:text-base font-mono font-black">
                      {incomingManufacturerB2bOrders.filter((o) => o.status !== 'paid_shipped').length} ta
                    </strong>
                  </div>
                  <div className="p-2 sm:p-3 rounded-xl sm:rounded-2xl bg-[#071326] border border-[#1E3A6D]">
                    <span className="text-sky-200 block">B2B tushum:</span>
                    <strong className="text-emerald-400 text-xs sm:text-base font-mono font-black">
                      {formatPrice(
                        incomingManufacturerB2bOrders
                          .filter((o) => o.status === 'paid_shipped')
                          .reduce((s, o) => s + o.totalAmount, 0)
                      )}
                    </strong>
                  </div>
                </div>
              </div>
            )}

            {crmSaleSuccessNotice && (
              <div className="p-2.5 sm:p-4 rounded-xl sm:rounded-2xl bg-emerald-500/20 border-2 border-emerald-400 text-emerald-200 text-[11px] sm:text-sm font-black flex items-center gap-2 animate-fadeIn">
                <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-400 shrink-0" />
                <span>{crmSaleSuccessNotice}</span>
              </div>
            )}

            {crmStockWarning && (
              <div className="p-2.5 sm:p-4 rounded-xl sm:rounded-2xl bg-[#0A1931] border-2 border-red-500 text-red-500 text-[11px] sm:text-sm font-black flex items-center gap-2 animate-fadeIn shadow-[0_0_20px_rgba(239,68,68,0.4)]">
                <AlertCircle className="w-4 h-4 sm:w-5 sm:h-5 text-red-500 shrink-0" />
                <span className="text-red-500 font-black">{crmStockWarning}</span>
              </div>
            )}

            {/* Asosiy CRM Ishchi Maydoni (Mobilda 2x kichraytirilgan) */}
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-2.5 sm:gap-6 items-start">
              {/* CHAP TARAF: QIDIRUV VA MAHSULOTLAR RO'YXATI */}
              <div className="xl:col-span-7 space-y-2.5 sm:space-y-4">
                {/* Qidiruv */}
                <div className="bg-[#0A1931] border-2 border-[#1E3A6D] rounded-2xl sm:rounded-3xl p-2 sm:p-5 shadow-xl">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-400 absolute left-3 sm:left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      value={crmSearchQuery}
                      onChange={(e) => setCrmSearchQuery(e.target.value)}
                      placeholder="Mahsulot qidiruvi..."
                      className="w-full pl-8 sm:pl-11 pr-8 sm:pr-10 py-1.5 sm:py-3 bg-[#071326] border border-[#1E3A6D] focus:border-emerald-400 rounded-xl sm:rounded-2xl text-white placeholder-sky-300/60 text-[11px] sm:text-sm focus:outline-none"
                    />
                    {crmSearchQuery && (
                      <button
                        type="button"
                        onClick={() => setCrmSearchQuery('')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-sky-300 hover:text-white cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="bg-[#0A1931] border-2 border-[#1E3A6D] rounded-2xl sm:rounded-3xl overflow-hidden shadow-2xl">
                  <div className="grid grid-cols-12 gap-1.5 sm:gap-3 px-2.5 sm:px-5 py-2 sm:py-3.5 bg-[#071326] border-b border-[#1E3A6D] text-[9px] sm:text-[11px] font-black uppercase tracking-wider text-sky-200">
                    <div className="col-span-6">Mahsulot Nomi / Ombor</div>
                    <div className="col-span-3">Narxi</div>
                    <div className="col-span-3 text-right">{activeCrmBasket.name} ga yuklash</div>
                  </div>

                  {filteredCrmProducts.length === 0 ? (
                    <div className="p-6 sm:p-10 text-center space-y-2 bg-[#0A1931]">
                      <Package className="w-8 h-8 sm:w-10 sm:h-10 text-[#FFB800] mx-auto" />
                      <p className="text-xs sm:text-sm text-sky-200">
                        {companyProducts.length === 0
                          ? "Hozircha mahsulotlar kiritilmagan."
                          : "Qidiruv bo‘yicha mahsulot topilmadi."}
                      </p>
                    </div>
                  ) : (
                    <div className="divide-y divide-[#1E3A6D]">
                      {filteredCrmProducts.map((prod, idx) => {
                        const variantsList = getProductVariantsList(prod);
                        const selectedVIdx = crmVariantSelection[prod.id] ?? 0;
                        const activeVariant = variantsList[selectedVIdx] || variantsList[0];
                        const activeSpecLabel = activeVariant.specification
                          ? activeVariant.specification
                          : `1 ${activeVariant.unit || prod.unit}`;
                        const activeVariantCrmPrice =
                          typeof activeVariant.originalPrice === 'number' && activeVariant.originalPrice > 0
                            ? activeVariant.originalPrice
                            : activeVariant.price || getProductCrmPrice(prod);
                        const activeColors =
                          activeVariant.colors && activeVariant.colors.length > 0
                            ? activeVariant.colors
                            : prod.colors || [];
                        const selectedColor = crmColorSelection[prod.id] ?? (activeColors[0] || '');
                        const activeEntryKey =
                          variantsList.length > 1 || selectedColor || activeVariant.specification
                            ? `${prod.id}::${selectedVIdx}${selectedColor ? `::${selectedColor}` : ''}`
                            : prod.id;
                        const isInCrmCart = crmSelectedIds.some(
                          (k) => k === activeEntryKey || String(k).split('::')[0] === prod.id
                        );
                        const qtyInCart = crmSelectedIds
                          .filter((k) => String(k).split('::')[0] === prod.id)
                          .reduce((sum, k) => sum + (crmQuantities[k] || 1), 0);
                        const isUnlimited = Boolean(prod.unlimitedStock || (prod.stock !== undefined && Number(prod.stock) >= 999999999));
                        const availStock = isUnlimited ? 999999999 : (prod.stock !== undefined && prod.stock !== null ? Number(prod.stock) : 999999);
                        const isOutOfStock = !isUnlimited && availStock <= 0;
                        const isVariantsExpanded = Boolean(expandedCrmVariantIds[prod.id]);

                        return (
                          <div
                            key={prod.id}
                            className={`px-2 sm:px-5 py-2 sm:py-3.5 transition-colors ${
                              isInCrmCart ? 'bg-[#0F2547]' : 'bg-[#0A1931] hover:bg-[#0F2547]/70'
                            }`}
                          >
                            <div className="grid grid-cols-12 gap-1.5 sm:gap-3 items-center">
                              {/* Nomi */}
                              <div className="col-span-6 flex items-center gap-1.5 sm:gap-3 min-w-0">
                                <span className="w-4 h-4 sm:w-6 sm:h-6 rounded bg-[#071326] border border-[#1E3A6D] text-[#FFB800] font-mono text-[9px] sm:text-[11px] font-bold flex items-center justify-center shrink-0">
                                  {idx + 1}
                                </span>
                                <img
                                  src={prod.image}
                                  alt={prod.title}
                                  className="w-8 h-8 sm:w-11 sm:h-11 rounded-lg sm:rounded-xl object-cover border border-[#1E3A6D] shrink-0 bg-[#071326]"
                                />
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-1 flex-wrap">
                                    <h4 className="font-black text-[10px] sm:text-sm text-white leading-tight break-words">
                                      {prod.title}
                                    </h4>
                                    <span className={`text-[8px] sm:text-[9px] font-bold px-1 py-0.2 rounded ${
                                      prod.saleChannel === 'offline'
                                        ? 'bg-emerald-500/20 text-emerald-300'
                                        : 'bg-sky-500/20 text-sky-300'
                                    }`}>
                                      {prod.saleChannel === 'offline' ? 'Oflayn' : 'Onlayn'}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setExpandedCrmVariantIds((prev) => ({
                                          ...prev,
                                          [prod.id]: !prev[prod.id],
                                        }))
                                      }
                                      className="px-1.5 py-0.5 rounded bg-[#071326] hover:bg-[#0F2547] border border-amber-500/50 text-[#FFB800] text-[9px] sm:text-[11px] font-mono font-black flex items-center gap-1 cursor-pointer transition-colors"
                                      title="Mavjud variantlarni ko‘rish va tanlash"
                                    >
                                      <span>{activeSpecLabel}</span>
                                      {selectedColor && (
                                        <span className="text-sky-300">• {selectedColor}</span>
                                      )}
                                      <span className="text-[8px] sm:text-[10px] text-amber-300">
                                        ({variantsList.length}) {isVariantsExpanded ? '▲' : '▼'}
                                      </span>
                                    </button>
                                    {isOutOfStock ? (
                                      <span className="text-[8px] sm:text-[10px] font-black px-1.5 py-0.2 rounded bg-red-500/20 text-red-400 border border-red-500/30">
                                        Tugagan (0 {prod.unit})
                                      </span>
                                    ) : (
                                      <span className="text-[8px] sm:text-[10px] font-mono font-bold px-1.5 py-0.2 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                                        {isUnlimited ? 'Cheklanmagan' : `${prod.stock ?? 0} ${prod.unit}`}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>

                              {/* Narxi (bosilganda ham mavjud variantlar ko'rsatiladi) */}
                              <div className="col-span-3">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setExpandedCrmVariantIds((prev) => ({
                                      ...prev,
                                      [prod.id]: !prev[prod.id],
                                    }))
                                  }
                                  className="text-left group cursor-pointer"
                                >
                                  <span className="font-mono font-black text-[10px] sm:text-sm text-emerald-400 group-hover:text-[#FFB800] transition-colors block">
                                    {formatPrice(activeVariantCrmPrice)}
                                  </span>
                                  <span className="text-[8px] sm:text-[10px] text-amber-400/90 font-bold underline block">
                                    Variantlar {isVariantsExpanded ? '▲' : '▼'}
                                  </span>
                                </button>
                              </div>

                              {/* + Qo'shish tugmasi */}
                              <div className="col-span-3 flex items-center justify-end">
                                <button
                                  type="button"
                                  disabled={isOutOfStock}
                                  onClick={() => handleAddVariantToCrmCart(prod, selectedVIdx, selectedColor)}
                                  className={`px-2 py-1.5 sm:px-3.5 sm:py-2 rounded-lg sm:rounded-xl font-black text-[10px] sm:text-xs flex items-center gap-1 transition-colors shadow ${
                                    isOutOfStock
                                      ? 'bg-red-500/20 text-red-300 border border-red-500/30 cursor-not-allowed'
                                      : isInCrmCart
                                      ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 cursor-pointer'
                                      : 'bg-[#FFB800] hover:bg-[#FFC928] text-slate-950 cursor-pointer'
                                  }`}
                                >
                                  <Plus className="w-3 h-3 sm:w-3.5 sm:h-3.5 stroke-[3]" />
                                  <span>{isOutOfStock ? 'Tugagan' : `Yuklash ${isInCrmCart ? `(${qtyInCart})` : ''}`}</span>
                                </button>
                              </div>
                            </div>

                            {/* Bosilganda ochiladigan Mavjud variantlar */}
                            {isVariantsExpanded && (
                              <div className="mt-2 pt-2 border-t border-[#1E3A6D] space-y-2 animate-fadeIn">
                                <div className="flex items-center justify-between">
                                  <span className="text-[10px] sm:text-[11px] font-black uppercase tracking-wider text-[#FFB800]">
                                    Mavjud variantlar ({variantsList.length} ta):
                                  </span>
                                  <span className="text-[9px] sm:text-[10px] text-sky-200">
                                    Variantni tanlang yoki savatga yuklang
                                  </span>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 sm:gap-2">
                                  {variantsList.map((v, vIdx) => {
                                    const isSelVar = selectedVIdx === vIdx;
                                    const vSpec = v.specification ? v.specification : `1 ${v.unit || prod.unit}`;
                                    const vPrice =
                                      typeof v.originalPrice === 'number' && v.originalPrice > 0
                                        ? v.originalPrice
                                        : v.price || getProductCrmPrice(prod);
                                    const vColors =
                                      v.colors && v.colors.length > 0 ? v.colors : prod.colors || [];

                                    return (
                                      <div
                                        key={v.id || vIdx}
                                        onClick={() => {
                                          setCrmVariantSelection((prev) => ({
                                            ...prev,
                                            [prod.id]: vIdx,
                                          }));
                                          if (vColors.length > 0 && !vColors.includes(selectedColor)) {
                                            setCrmColorSelection((prev) => ({
                                              ...prev,
                                              [prod.id]: vColors[0],
                                            }));
                                          }
                                        }}
                                        className={`p-2 sm:p-2.5 rounded-xl border transition-colors cursor-pointer space-y-1.5 ${
                                          isSelVar
                                            ? 'bg-[#071326] border-[#FFB800] shadow-md'
                                            : 'bg-[#071326]/80 border-[#1E3A6D] hover:border-sky-400/50'
                                        }`}
                                      >
                                        <div className="flex items-center justify-between gap-2">
                                          <div>
                                            <span className="font-mono font-black text-[10px] sm:text-xs text-white block">
                                              #{vIdx + 1}: <span className="text-[#FFB800]">{vSpec}</span>
                                            </span>
                                            <span className="font-mono font-black text-[10px] sm:text-xs text-emerald-400 block">
                                              {formatPrice(vPrice)}
                                            </span>
                                          </div>
                                          <button
                                            type="button"
                                            disabled={isOutOfStock}
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              setCrmVariantSelection((prev) => ({
                                                ...prev,
                                                [prod.id]: vIdx,
                                              }));
                                              const colToUse =
                                                vColors.length > 0
                                                  ? vColors.includes(selectedColor)
                                                    ? selectedColor
                                                    : vColors[0]
                                                  : '';
                                              handleAddVariantToCrmCart(prod, vIdx, colToUse);
                                            }}
                                            className="px-2 py-1 sm:px-2.5 sm:py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-slate-950 font-black text-[10px] sm:text-[11px] flex items-center gap-1 cursor-pointer shrink-0"
                                          >
                                            <Plus className="w-3 h-3 stroke-[3]" />
                                            <span>Savatga</span>
                                          </button>
                                        </div>

                                        {vColors.length > 0 && (
                                          <div className="flex flex-wrap gap-1 pt-1 border-t border-[#1E3A6D]">
                                            {vColors.map((col) => {
                                              const colStyle = getColorPaletteItem(col);
                                              const isColSelected = isSelVar && selectedColor === col;
                                              return (
                                                <button
                                                  key={col}
                                                  type="button"
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    setCrmVariantSelection((prev) => ({
                                                      ...prev,
                                                      [prod.id]: vIdx,
                                                    }));
                                                    setCrmColorSelection((prev) => ({
                                                      ...prev,
                                                      [prod.id]: col,
                                                    }));
                                                  }}
                                                  className={`px-1.5 py-0.5 rounded text-[9px] sm:text-[10px] font-bold border transition-colors cursor-pointer ${
                                                    isColSelected
                                                      ? 'ring-2 ring-[#FFB800] font-black'
                                                      : 'opacity-80 hover:opacity-100'
                                                  }`}
                                                  style={{ backgroundColor: colStyle.bg, color: colStyle.text }}
                                                >
                                                  {col}
                                                </button>
                                              );
                                            })}
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* O'NG TARAF: FAOL SAVAT (Mobilda 2x ixcham) */}
              <div className="xl:col-span-5 xl:sticky xl:top-6">
                <div className="bg-[#0A1931] border-2 border-[#1E3A6D] rounded-2xl sm:rounded-3xl p-2.5 sm:p-6 space-y-2.5 sm:space-y-4 shadow-2xl">
                  <div className="flex items-center justify-between pb-2 sm:pb-3 border-b border-[#1E3A6D]">
                    <div className="flex items-center gap-2">
                      <ShoppingBag className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-400" />
                      <div>
                        <h3 className="text-xs sm:text-base font-black text-white">{activeCrmBasket.name}</h3>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 sm:gap-2">
                      <span className="px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-lg sm:rounded-xl bg-emerald-500/20 text-emerald-300 font-mono text-[10px] sm:text-xs font-black border border-emerald-500/30">
                        {selectedCrmEntries.length} xil mahsulot
                      </span>
                      {selectedCrmEntries.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setCrmSelectedIds([])}
                          className="px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-lg sm:rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 border border-amber-300 text-[10px] sm:text-[11px] font-black cursor-pointer"
                        >
                          Tozalash
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Savatga qo'shilgan mahsulotlar ro'yxati */}
                  {selectedCrmEntries.length === 0 ? (
                    <div className="p-4 sm:p-8 rounded-xl sm:rounded-2xl bg-[#071326] border border-dashed border-[#1E3A6D] text-center space-y-1.5">
                      <ShoppingBag className="w-6 h-6 sm:w-8 sm:h-8 text-[#FFB800] mx-auto" />
                      <p className="text-[10px] sm:text-xs text-sky-200">
                        {activeCrmBasket.name} bo‘sh. Ro‘yxatdan mahsulot yonidagi «+ Yuklash» tugmasini bosing.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-1.5 sm:space-y-2.5 max-h-72 sm:max-h-96 overflow-y-auto pr-1">
                      {selectedCrmEntries.map((entry, i) => {
                        const q = getCrmEntryQty(entry.entryKey, entry.prod);
                        const origP = entry.crmPrice;
                        const sum = q * origP;
                        return (
                          <div
                            key={entry.entryKey}
                            className="p-2 sm:p-3 rounded-xl sm:rounded-2xl bg-[#071326] border border-[#1E3A6D] flex flex-wrap items-center justify-between gap-1.5 sm:gap-2 text-[10px] sm:text-xs"
                          >
                            {/* 1. Mahsulot nomi */}
                            <div className="font-black text-white text-[11px] sm:text-sm min-w-[120px] flex-1 break-words">
                              {i + 1}. {entry.displayTitle}
                            </div>

                            {/* Yonidan ketma-ket: Miqdori va o'lchov birligi -> Narxi -> Jami -> O'chirish */}
                            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 shrink-0">
                              <div className="flex items-center bg-[#0A1931] border border-[#1E3A6D] rounded-lg sm:rounded-xl p-0.5">
                                <button
                                  type="button"
                                  onClick={() => handleSetCrmQty(entry.entryKey, q - 1)}
                                  className="w-5 h-5 sm:w-6 sm:h-6 rounded bg-[#0F2547] hover:bg-[#16335F] text-white flex items-center justify-center cursor-pointer"
                                >
                                  <Minus className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                                </button>
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  value={q}
                                  onChange={(e) => {
                                    const cleanDigits = e.target.value.replace(/\D/g, '');
                                    handleSetCrmQty(entry.entryKey, cleanDigits ? Number(cleanDigits) : 1);
                                  }}
                                  className="w-8 sm:w-11 text-center bg-transparent text-white font-mono font-black text-[10px] sm:text-xs focus:outline-none"
                                />
                                <button
                                  type="button"
                                  onClick={() => handleSetCrmQty(entry.entryKey, q + 1)}
                                  className="w-5 h-5 sm:w-6 sm:h-6 rounded bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 flex items-center justify-center cursor-pointer"
                                >
                                  <Plus className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                                </button>
                                <span className="px-1 text-[9px] sm:text-[11px] font-mono font-bold text-[#FFB800]">
                                  {entry.prod.unit || entry.unitSpec}
                                </span>
                              </div>

                              <div className="flex items-center gap-0.5 bg-[#0A1931] border border-emerald-500/50 focus-within:border-[#FFB800] rounded-lg sm:rounded-xl px-1.5 py-0.5 sm:px-2 sm:py-1">
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  value={origP}
                                  onChange={(e) => {
                                    const cleanDigits = e.target.value.replace(/\D/g, '');
                                    setCrmCustomPrice(
                                      entry.entryKey,
                                      cleanDigits !== '' ? Number(cleanDigits) : 0
                                    );
                                  }}
                                  className="w-16 sm:w-20 bg-transparent text-emerald-400 font-mono font-black text-[10px] sm:text-xs focus:outline-none text-right"
                                  title="Narxni o‘zgartirish"
                                />
                                <span className="text-[9px] sm:text-[10px] text-sky-300 font-bold">so‘m</span>
                              </div>

                              <span className="font-mono font-black text-[10px] sm:text-sm text-[#FFB800] whitespace-nowrap">
                                = {formatPrice(sum)}
                              </span>

                              <button
                                type="button"
                                onClick={() =>
                                  setCrmSelectedIds((prev) => prev.filter((id) => id !== entry.entryKey))
                                }
                                className="text-sky-300 hover:text-red-400 p-1 rounded bg-[#0A1931] border border-[#1E3A6D] cursor-pointer"
                                title="Savatdan o‘chirish"
                              >
                                <X className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Jami Hisob va CRM Savdoni Tasdiqlash + Qarz tugmasi */}
                  <div className="p-2.5 sm:p-4 rounded-xl sm:rounded-2xl bg-[#071326] border border-[#1E3A6D] space-y-2 sm:space-y-3 text-[10px] sm:text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-sky-200">Savatdagi mahsulotlar:</span>
                      <span className="font-mono font-bold text-white">
                        {selectedCrmEntries.length} xil ({crmCalculation.totalUnits} ta mahsulot)
                      </span>
                    </div>

                    <div className="pt-2 border-t border-[#1E3A6D] flex items-center justify-between">
                      <span className="text-xs sm:text-sm font-black text-white uppercase">
                        Jami Summa:
                      </span>
                      <span className="text-sm sm:text-xl font-black text-emerald-400 font-mono">
                        {formatPrice(crmCalculation.totalOriginalSum)}
                      </span>
                    </div>

                    {selectedCrmEntries.length > 0 && (
                      <div className="grid grid-cols-12 gap-1.5 sm:gap-2.5 pt-1">
                        <button
                          type="button"
                          onClick={handleCompleteCrmOfflineSale}
                          className="col-span-8 py-2 sm:py-3 px-2.5 sm:px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-[10px] sm:text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer shadow-lg"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 stroke-[2.5] shrink-0" />
                          <span>CRM savdoni tasdiqlash ({activeCrmBasket.name})</span>
                        </button>
                        <button
                          type="button"
                          onClick={handleOpenCrmDebtModal}
                          className="col-span-4 py-2 sm:py-3 px-2.5 sm:px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-[10px] sm:text-xs uppercase tracking-wider flex items-center justify-center gap-1 cursor-pointer shadow-lg"
                        >
                          <FileText className="w-3.5 h-3.5 sm:w-4 sm:h-4 stroke-[2.5] shrink-0" />
                          <span>Qarz</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab: QARZ DAFTARI — Parol orqali kiriladigan oflayn qarzlar boshqaruvi */}
        {activeTab === 'qarz_daftari' && (
          <div className="space-y-6 mt-2.5 sm:mt-0 animate-fadeIn bg-[#071326]">
            <div className="bg-[#0A1931] border-2 border-[#1E3A6D] rounded-3xl p-5 sm:p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4 shadow-2xl">
              <div className="flex items-center gap-3.5">
                <div className="p-3 rounded-2xl bg-amber-500/20 text-[#FFB800] border border-amber-500/40 shrink-0">
                  <FileText className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-lg sm:text-xl font-black text-white">
                    Qarz Daftari — Oflayn (CRM) Qarzlar Tizimi
                  </h2>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab('crm')}
                className="px-4 py-2.5 rounded-xl bg-[#FFB800] hover:bg-[#FFC928] text-slate-950 font-black text-xs flex items-center gap-2 cursor-pointer self-start lg:self-auto"
              >
                <Calculator className="w-4 h-4" />
                <span>CRM Savdoga qaytish</span>
              </button>
            </div>

            {/* Qarz ko'rsatkichlari */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-[#0A1931] border-2 border-red-500/50 p-4 rounded-2xl shadow-lg">
                <span className="text-xs text-white block font-bold">1. Kutilayotgan Jami Qarz Summasi:</span>
                <span className="text-xl font-black text-red-400 font-mono block mt-1">
                  {formatPrice(totalPendingDebtSum)}
                </span>
                <span className="text-[11px] text-sky-200 block mt-1">
                  {pendingMyCrmDebts.length} ta yopilmagan qarz
                </span>
              </div>

              <div className="bg-[#0A1931] border-2 border-[#1E3A6D] p-4 rounded-2xl shadow-lg">
                <span className="text-xs text-white block font-bold">2. Jami Qarz Yozuvlari:</span>
                <span className="text-xl font-black text-[#FFB800] font-mono block mt-1">
                  {myCrmDebts.length} ta
                </span>
                <span className="text-[11px] text-sky-200 block mt-1">
                  Faol: {pendingMyCrmDebts.length} ta • Yopilgan: {myCrmDebts.filter((d) => d.status === 'paid').length} ta
                </span>
              </div>
            </div>

            {/* Qarzlar Jadvali */}
            <div className="bg-[#0A1931] border-2 border-[#1E3A6D] rounded-3xl overflow-hidden shadow-2xl">
              <div className="p-4 sm:p-5 border-b border-[#1E3A6D] flex items-center justify-between">
                <h3 className="font-black text-white text-sm flex items-center gap-2">
                  <FileText className="w-4 h-4 text-[#FFB800]" />
                  <span>Qarzdorlar Ro‘yxati ({myCrmDebts.length} ta)</span>
                </h3>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-white">
                  <thead className="bg-[#071326] text-[#FFB800] uppercase text-[10px] tracking-wider border-b border-[#1E3A6D]">
                    <tr>
                      <th className="py-3.5 px-4 font-black">№</th>
                      <th className="py-3.5 px-4 font-black">Sana</th>
                      <th className="py-3.5 px-4 font-black">Qarzdor Ismi va Telefoni</th>
                      <th className="py-3.5 px-4 font-black">Olingan Mahsulotlar</th>
                      <th className="py-3.5 px-4 font-black">Jami Savdo</th>
                      <th className="py-3.5 px-4 font-black">Darhol To‘langan</th>
                      <th className="py-3.5 px-4 font-black">Kutilayotgan Qarz</th>
                      <th className="py-3.5 px-4 font-black text-center">Holat / Amal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1E3A6D]/70 bg-[#0A1931]">
                    {myCrmDebts.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="py-12 text-center text-sky-200/70 text-xs">
                          Qarz daftarida hozircha qarz yozuvlari yo‘q.
                        </td>
                      </tr>
                    ) : (
                      myCrmDebts.map((debt, idx) => (
                        <tr key={debt.id} className="hover:bg-[#0F2547]/70 transition-colors">
                          <td className="py-3.5 px-4 font-mono font-black text-[#FFB800]">{idx + 1}</td>
                          <td className="py-3.5 px-4 font-mono text-sky-200 whitespace-nowrap">{debt.createdAt.slice(0, 10)}</td>
                          <td className="py-3.5 px-4">
                            <div className="font-black text-white text-sm">{debt.customerName}</div>
                            <div className="font-mono text-xs text-amber-300">{debt.customerPhone}</div>
                            {debt.note && <div className="text-[11px] text-sky-300 mt-0.5">{debt.note}</div>}
                          </td>
                          <td className="py-3.5 px-4">
                            <div className="space-y-1">
                              {debt.items.map((it, i) => (
                                <div key={i} className="text-xs text-sky-100">
                                  • <span className="font-bold text-white">{it.title}</span> — {it.quantity} {it.unit} × {formatPrice(it.price)}
                                </div>
                              ))}
                            </div>
                          </td>
                          <td className="py-3.5 px-4 font-mono font-bold text-white whitespace-nowrap">
                            {formatPrice(debt.totalOrderAmount)}
                          </td>
                          <td className="py-3.5 px-4 font-mono font-bold text-emerald-400 whitespace-nowrap">
                            {formatPrice((Number(debt.initialPaidAmount) || 0) + (Number(debt.paidDebtAmount) || 0))}
                          </td>
                          <td className="py-3.5 px-4 font-mono font-black text-red-400 whitespace-nowrap">
                            {debt.status === 'paid' ? '0 so‘m' : formatPrice(debt.remainingDebtAmount)}
                          </td>
                          <td className="py-3.5 px-4 text-center whitespace-nowrap">
                            {debt.status === 'paid' ? (
                              <span className="px-3 py-1 rounded-xl bg-emerald-500/20 border border-emerald-400/50 text-emerald-300 font-black text-[11px]">
                                To‘langan ({(debt.paidAt || '').slice(0, 10)})
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  setPayingDebtRecord(debt);
                                  setPayDebtAmountInput(debt.remainingDebtAmount);
                                  setPayDebtError(null);
                                }}
                                className="px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs cursor-pointer shadow active:scale-95 transition-all"
                              >
                                Qarzni so‘ndirish
                              </button>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Tab 1: Hisobot, monitoring — MOBILGA TO'LIQ MOSLASHTIRILGAN */}
        {activeTab === 'reports' && (
          <div className="space-y-3 sm:space-y-5 mt-2.5 sm:mt-0 animate-fadeIn">
            
            {/* Hisobot Header Card + Hisobot davri bitta qatorda + 4 ta Sub-tabs bitta qatorda (Ombor holati olib tashlandi) */}
            <div className="bg-[#0A1931] border-2 border-[#1E3A6D] p-2.5 sm:p-5 rounded-2xl sm:rounded-3xl space-y-2.5 sm:space-y-4 shadow-2xl">
              {/* TEPADA BITTA QATORDA: Hisobot va Monitoring Tizimi + Hisobot davri (Kunlik | Haftalik | Oylik) + PDF yuklab olish */}
              <div className="flex flex-wrap items-center justify-between gap-1.5 sm:gap-3">
                <div
                  onClick={() => setIsMobileSidebarOpen(true)}
                  className="cursor-pointer lg:cursor-default min-w-0"
                >
                  <div className="flex items-center gap-1 text-[#FFB800] font-bold text-[9px] sm:text-xs uppercase tracking-wider">
                    <BarChart3 className="w-3 h-3 sm:w-4 sm:h-4 shrink-0" />
                    <span>Hisobot va Monitoring Tizimi</span>
                  </div>
                  <h2 className="text-xs sm:text-xl font-black text-white leading-tight break-words">
                    «{formatCleanCompanyName(supplierData.companyName)}» Savdo Monitoringi
                  </h2>
                </div>

                {/* Hisobot davri: Kunlik | Haftalik | Oylik — Tepada Hisobot va Monitoring Tizimi bilan bitta qatorda */}
                <div className="flex flex-wrap items-center gap-1 sm:gap-2">
                  <span className="text-[9px] sm:text-xs font-black text-slate-300 uppercase tracking-wider flex items-center gap-1">
                    <Clock className="w-3 h-3 text-[#FFB800] shrink-0" />
                    <span>Hisobot davri:</span>
                  </span>
                  {[
                    { id: 'daily', label: 'Kunlik' },
                    { id: 'weekly', label: 'Haftalik' },
                    { id: 'monthly', label: 'Oylik' },
                  ].map((period) => {
                    const isSel = reportTimeRange === period.id;
                    return (
                      <button
                        key={period.id}
                        type="button"
                        onClick={() => {
                          setReportTimeRange(period.id as 'daily' | 'weekly' | 'monthly');
                          setSelectedReportDay('all_days');
                        }}
                        className={`px-2 py-1 sm:px-3.5 sm:py-1.5 rounded-lg sm:rounded-xl font-black text-[10px] sm:text-xs transition-colors cursor-pointer border ${
                          isSel
                            ? 'bg-[#FFB800] text-[#0A1931] border-[#E5A600] shadow-sm'
                            : 'bg-[#071326] hover:bg-[#0F2547] text-slate-200 border-[#1E3A6D]'
                        }`}
                      >
                        {period.label}
                      </button>
                    );
                  })}

                  <button
                    type="button"
                    onClick={handleDownloadMonitoringPdf}
                    className="px-2 py-1 sm:px-4 sm:py-2 rounded-lg sm:rounded-xl bg-[#FFB800] hover:bg-[#FFC928] text-slate-950 font-black text-[10px] sm:text-xs flex items-center gap-1 cursor-pointer shadow-md shrink-0"
                  >
                    <Download className="w-3 h-3 sm:w-4 sm:h-4 stroke-[2.5]" />
                    <span>PDF yuklab olish</span>
                  </button>
                </div>
              </div>

              {/* Kunlar yoki Oylar tanlovi */}
              {reportTimeRange === 'daily' && availableSaleDays.length > 0 && (
                <div className="flex items-center gap-1.5 overflow-x-auto pt-1.5 border-t border-[#1E3A6D] pb-0.5">
                  <button
                    type="button"
                    onClick={() => setSelectedReportDay('all_days')}
                    className={`px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-lg font-mono font-bold text-[9px] sm:text-[11px] border cursor-pointer shrink-0 transition-colors ${
                      selectedReportDay === 'all_days'
                        ? 'bg-[#FFB800] text-slate-950 border-amber-300 font-black'
                        : 'bg-[#071326] text-slate-200 border-[#1E3A6D] hover:border-amber-400/50'
                    }`}
                  >
                    Barcha kunlar ({availableSaleDays.length} kun)
                  </button>
                  {availableSaleDays.map((dayStr) => (
                    <button
                      key={dayStr}
                      type="button"
                      onClick={() => setSelectedReportDay(dayStr)}
                      className={`px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-lg font-mono font-bold text-[9px] sm:text-[11px] border cursor-pointer shrink-0 transition-colors ${
                        selectedReportDay === dayStr
                          ? 'bg-[#FFB800] text-slate-950 border-amber-300 font-black'
                          : 'bg-[#071326] text-slate-200 border-[#1E3A6D] hover:border-amber-400/50'
                      }`}
                    >
                      {dayStr}
                    </button>
                  ))}
                </div>
              )}

              {/* Oylik rejimda 12 oy ro'yxati chiqadi va oyni belgilash imkoni bo'ladi */}
              {reportTimeRange === 'monthly' && (
                <div className="p-2 sm:p-3.5 rounded-xl bg-[#071326] border border-[#1E3A6D] space-y-2 animate-fadeIn">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[10px] sm:text-[11px] font-black text-[#FFB800] uppercase tracking-wider">
                      Oyni belgilang (12 oy):
                    </span>
                    <button
                      type="button"
                      onClick={() => setSelectedReportMonth('all_months')}
                      className={`px-2.5 py-0.5 sm:px-3 sm:py-1 rounded-lg font-black text-[10px] sm:text-[11px] border cursor-pointer transition-colors ${
                        selectedReportMonth === 'all_months'
                          ? 'bg-[#FFB800] text-[#0A1931] border-amber-300'
                          : 'bg-[#0A1931] text-slate-200 border-[#1E3A6D]'
                      }`}
                    >
                      Barcha oylar
                    </button>
                  </div>
                  <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-12 gap-1">
                    {REPORT_MONTHS_LIST.map((m) => {
                      const isMonthSelected = selectedReportMonth === m.id;
                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => setSelectedReportMonth(m.id)}
                          className={`px-1.5 py-1 rounded-lg font-black text-[10px] border cursor-pointer transition-colors text-center flex flex-col items-center justify-center ${
                            isMonthSelected
                              ? 'bg-[#FFB800] text-[#0A1931] border-amber-300'
                              : 'bg-[#0A1931] hover:bg-[#0F2547] text-slate-200 border-[#1E3A6D]'
                          }`}
                        >
                          <span className={`text-[8px] font-mono ${isMonthSelected ? 'text-[#0A1931]' : 'text-amber-400'}`}>
                            {m.number}-oy
                          </span>
                          <span>{m.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* SUB-TABS: 4 TA BO'LIM BITTA QATORDA (YOZUVLARI HAM SIG'ADI) */}
              <div className={`grid ${supplierData.cabinetType === 'manufacturer' ? 'grid-cols-4' : 'grid-cols-4 lg:grid-cols-5'} gap-1 sm:gap-2.5 pt-2 border-t border-[#1E3A6D]`}>
                <button
                  type="button"
                  onClick={() => setReportsSubTab('general')}
                  className={`p-1.5 sm:p-3 rounded-lg sm:rounded-xl border font-black text-[8.5px] sm:text-xs flex flex-col sm:flex-row items-center justify-between gap-0.5 sm:gap-1 cursor-pointer transition-colors text-center sm:text-left ${
                    reportsSubTab === 'general'
                      ? 'bg-[#FFB800] text-[#0A1931] border-[#E5A600] shadow-md'
                      : 'bg-[#071326] hover:bg-[#0F2547] text-white border-[#1E3A6D]'
                  }`}
                >
                  <span className="leading-tight break-words">1. Umumiy monitoring</span>
                  <span className={`px-1.5 py-0.2 rounded-full text-[8.5px] sm:text-[10px] font-mono font-black shrink-0 ${
                    reportsSubTab === 'general' ? 'bg-[#0A1931] text-[#FFB800]' : 'bg-[#0F2547] text-[#FFB800]'
                  }`}>
                    {generalReportSales.length}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setReportsSubTab('online')}
                  className={`p-1.5 sm:p-3 rounded-lg sm:rounded-xl border font-black text-[8.5px] sm:text-xs flex flex-col sm:flex-row items-center justify-between gap-0.5 sm:gap-1 cursor-pointer transition-colors text-center sm:text-left ${
                    reportsSubTab === 'online'
                      ? 'bg-[#FFB800] text-[#0A1931] border-[#E5A600] shadow-md'
                      : 'bg-[#071326] hover:bg-[#0F2547] text-white border-[#1E3A6D]'
                  }`}
                >
                  <span className="leading-tight break-words">2. Onlayn savdo monitoringi</span>
                  <span className={`px-1.5 py-0.2 rounded-full text-[8.5px] sm:text-[10px] font-mono font-black shrink-0 ${
                    reportsSubTab === 'online' ? 'bg-[#0A1931] text-[#FFB800]' : 'bg-[#0F2547] text-amber-400'
                  }`}>
                    {onlineReportSales.length}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setReportsSubTab('offline')}
                  className={`p-1.5 sm:p-3 rounded-lg sm:rounded-xl border font-black text-[8.5px] sm:text-xs flex flex-col sm:flex-row items-center justify-between gap-0.5 sm:gap-1 cursor-pointer transition-colors text-center sm:text-left ${
                    reportsSubTab === 'offline'
                      ? 'bg-[#FFB800] text-[#0A1931] border-[#E5A600] shadow-md'
                      : 'bg-[#071326] hover:bg-[#0F2547] text-white border-[#1E3A6D]'
                  }`}
                >
                  <span className="leading-tight break-words">3. CRM monitoringi</span>
                  <span className={`px-1.5 py-0.2 rounded-full text-[8.5px] sm:text-[10px] font-mono font-black shrink-0 ${
                    reportsSubTab === 'offline' ? 'bg-[#0A1931] text-[#FFB800]' : 'bg-[#0F2547] text-emerald-400'
                  }`}>
                    {offlineReportSales.length}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setReportsSubTab('pending_debts')}
                  className={`p-1.5 sm:p-3 rounded-lg sm:rounded-xl border font-black text-[8.5px] sm:text-xs flex flex-col sm:flex-row items-center justify-between gap-0.5 sm:gap-1 cursor-pointer transition-colors text-center sm:text-left ${
                    reportsSubTab === 'pending_debts'
                      ? 'bg-[#FFB800] text-[#0A1931] border-[#E5A600] shadow-md'
                      : 'bg-[#071326] hover:bg-[#0F2547] text-white border-[#1E3A6D]'
                  }`}
                >
                  <span className="leading-tight break-words">4. Kutilayotgan qarzlar</span>
                  <span className={`px-1.5 py-0.2 rounded-full text-[8.5px] sm:text-[10px] font-mono font-black shrink-0 ${
                    reportsSubTab === 'pending_debts' ? 'bg-[#0A1931] text-[#FFB800]' : 'bg-[#0F2547] text-amber-300'
                  }`}>
                    {pendingMyCrmDebts.length}
                  </span>
                </button>

                {supplierData.cabinetType !== 'manufacturer' && (
                  <button
                    type="button"
                    onClick={() => setReportsSubTab('kirim_chiqim')}
                    className={`hidden lg:flex p-1.5 sm:p-3 rounded-lg sm:rounded-xl border font-black text-[8.5px] sm:text-xs items-center justify-between gap-1 cursor-pointer transition-colors ${
                      reportsSubTab === 'kirim_chiqim'
                        ? 'bg-[#FFB800] text-[#0A1931] border-[#E5A600] shadow-md'
                        : 'bg-[#071326] hover:bg-[#0F2547] text-white border-[#1E3A6D]'
                    }`}
                  >
                    <span className="leading-tight">5. Kirim-chiqim</span>
                    <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono font-black shrink-0 ${
                      reportsSubTab === 'kirim_chiqim' ? 'bg-[#0A1931] text-[#FFB800]' : 'bg-[#0F2547] text-amber-300'
                    }`}>
                      {companyProducts.length}
                    </span>
                  </button>
                )}
              </div>
            </div>

            {/* Hisobot Ko'rsatkichlari — MOBILDA 2 USTUN (IXCHAM KARTALAR) */}
            {reportsSubTab === 'general' && (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3">
                <div className="bg-[#0A1931] border border-[#1E3A6D] p-2.5 sm:p-4 rounded-xl sm:rounded-2xl shadow-lg">
                  <span className="text-[10px] sm:text-xs text-slate-300 block font-bold">1. Jami Umumiy Savdo:</span>
                  <span className="text-sm sm:text-xl font-black text-[#FFB800] font-mono block mt-0.5">
                    {formatPrice(generalSalesTotalSum)}
                  </span>
                  <span className="text-[10px] sm:text-[11px] text-slate-300 block mt-0.5">
                    Jami {generalReportSales.length} ta savdo
                  </span>
                </div>

                <div className="bg-[#0A1931] border border-[#1E3A6D] p-2.5 sm:p-4 rounded-xl sm:rounded-2xl shadow-lg">
                  <span className="text-[10px] sm:text-xs text-slate-300 block font-bold">2. Onlayn Bunker Savdosi:</span>
                  <span className="text-sm sm:text-xl font-black text-white font-mono block mt-0.5">
                    {formatPrice(onlineSalesTotalSum)}
                  </span>
                  <span className="text-[10px] sm:text-[11px] text-emerald-400 font-bold block mt-0.5">
                    Bunker ulushi ({supplierReport.commissionRate}%): {formatPrice(onlineBunkerCommissionSum)}
                  </span>
                </div>

                <div className="bg-[#0A1931] border border-[#1E3A6D] p-2.5 sm:p-4 rounded-xl sm:rounded-2xl shadow-lg">
                  <span className="text-[10px] sm:text-xs text-slate-300 block font-bold">3. CRM Savdo (Naqd / To‘langan):</span>
                  <span className="text-sm sm:text-xl font-black text-amber-300 font-mono block mt-0.5">
                    {formatPrice(offlineCrmSalesTotalSum)}
                  </span>
                  <span className="text-[10px] sm:text-[11px] text-red-400 font-mono font-black block mt-0.5">
                    +{new Intl.NumberFormat('uz-UZ').format(totalPendingDebtSum)} qarz
                  </span>
                </div>

                <div className="bg-[#0A1931] border border-emerald-500/50 p-2.5 sm:p-4 rounded-xl sm:rounded-2xl shadow-lg">
                  <span className="text-[10px] sm:text-xs text-emerald-300 block font-bold">4. Korxona Jami Daromadi:</span>
                  <span className="text-sm sm:text-xl font-black text-emerald-400 font-mono block mt-0.5">
                    {formatPrice(generalSupplierNetSum)}
                  </span>
                  <span className="text-[10px] sm:text-[11px] text-emerald-200 block mt-0.5">
                    Onlayn ({formatPrice(onlineSupplierNetSum)}) + 100% CRM
                  </span>
                </div>

                <div
                  onClick={() => setReportsSubTab('pending_debts')}
                  className="col-span-2 sm:col-span-1 bg-[#0A1931] border border-red-500/50 hover:border-red-400 p-2.5 sm:p-4 rounded-xl sm:rounded-2xl shadow-lg cursor-pointer transition-all"
                >
                  <span className="text-[10px] sm:text-xs text-white block font-bold">5. Kutilayotgan Qarzlar (CRM):</span>
                  <span className="text-sm sm:text-xl font-black text-red-400 font-mono block mt-0.5">
                    {formatPrice(totalPendingDebtSum)}
                  </span>
                </div>
              </div>
            )}

            {reportsSubTab === 'online' && (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4">
                <div className="bg-[#0A1931] border border-[#1E3A6D] p-2.5 sm:p-4 rounded-xl sm:rounded-2xl shadow-lg">
                  <span className="text-[10px] sm:text-xs text-sky-200 block font-bold">Jami Onlayn Savdo:</span>
                  <span className="text-sm sm:text-xl font-black text-[#FFB800] font-mono block mt-0.5">
                    {formatPrice(onlineSalesTotalSum)}
                  </span>
                  <span className="text-[9.5px] sm:text-[11px] text-sky-300 block mt-0.5">
                    {onlineReportSales.length} ta buyurtma
                  </span>
                </div>

                <div className="bg-[#0A1931] border border-emerald-500/50 p-2.5 sm:p-4 rounded-xl sm:rounded-2xl shadow-lg">
                  <span className="text-[10px] sm:text-xs text-emerald-300 block font-bold">
                    Bunker Ulushi ({supplierReport.commissionRate}%):
                  </span>
                  <span className="text-sm sm:text-xl font-black text-emerald-400 font-mono block mt-0.5">
                    {formatPrice(onlineBunkerCommissionSum)}
                  </span>
                  <span className="text-[9.5px] sm:text-[11px] text-emerald-200 block mt-0.5">
                    Onlayn savdodan
                  </span>
                </div>

                <div className="bg-[#0A1931] border border-[#1E3A6D] p-2.5 sm:p-4 rounded-xl sm:rounded-2xl shadow-lg">
                  <span className="text-[10px] sm:text-xs text-sky-200 block font-bold">Korxona Daromadi:</span>
                  <span className="text-sm sm:text-xl font-black text-white font-mono block mt-0.5">
                    {formatPrice(onlineSupplierNetSum)}
                  </span>
                  <span className="text-[9.5px] sm:text-[11px] text-sky-300 block mt-0.5">
                    Sof tushum
                  </span>
                </div>

                <div className="bg-[#0A1931] border border-[#1E3A6D] p-2.5 sm:p-4 rounded-xl sm:rounded-2xl shadow-lg">
                  <span className="text-[10px] sm:text-xs text-sky-200 block font-bold">Sotilgan Hajm:</span>
                  <span className="text-sm sm:text-xl font-black text-amber-300 font-mono block mt-0.5">
                    {onlineReportSales.reduce((acc, curr) => acc + curr.quantity, 0)} ta
                  </span>
                  <span className="text-[9.5px] sm:text-[11px] text-sky-300 block mt-0.5">
                    {new Set(onlineReportSales.map((s) => (s.productTitle || '').trim().toLowerCase())).size || onlineReportSales.length} xil mahsulot
                  </span>
                </div>
              </div>
            )}

            {reportsSubTab === 'offline' && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-4">
                <div className="bg-[#0A1931] border border-[#1E3A6D] p-2.5 sm:p-4 rounded-xl sm:rounded-2xl shadow-lg">
                  <span className="text-[10px] sm:text-xs text-sky-200 block font-bold">CRM Savdo (To‘langan):</span>
                  <span className="text-sm sm:text-xl font-black text-[#FFB800] font-mono block mt-0.5">
                    {formatPrice(offlineCrmSalesTotalSum)}
                  </span>
                  <span className="text-[9.5px] sm:text-[11px] text-red-400 font-mono font-black block mt-0.5">
                    +{new Intl.NumberFormat('uz-UZ').format(totalPendingDebtSum)} qarz
                  </span>
                </div>

                <div className="bg-[#0A1931] border border-[#1E3A6D] p-2.5 sm:p-4 rounded-xl sm:rounded-2xl shadow-lg">
                  <span className="text-[10px] sm:text-xs text-sky-200 block font-bold">CRM Sotilgan Hajm:</span>
                  <span className="text-sm sm:text-xl font-black text-white font-mono block mt-0.5">
                    {offlineReportSales.reduce((acc, curr) => acc + curr.quantity, 0)} ta
                  </span>
                  <span className="text-[9.5px] sm:text-[11px] text-sky-300 block mt-0.5">
                    {new Set(offlineReportSales.map((s) => (s.productTitle || '').trim().toLowerCase())).size || offlineReportSales.length} xil mahsulot
                  </span>
                </div>

                <div
                  onClick={() => setReportsSubTab('pending_debts')}
                  className="col-span-2 sm:col-span-1 bg-[#0A1931] border border-red-500/50 hover:border-red-400 p-2.5 sm:p-4 rounded-xl sm:rounded-2xl shadow-lg cursor-pointer transition-all"
                >
                  <span className="text-[10px] sm:text-xs text-white block font-bold">Kutilayotgan Qarzlar (CRM):</span>
                  <span className="text-sm sm:text-xl font-black text-red-400 font-mono block mt-0.5">
                    {formatPrice(totalPendingDebtSum)}
                  </span>
                </div>
              </div>
            )}

            {/* 4. KIRIM-CHIQIM BO'LIMI: Har bir mahsulotning keltirilgan (asl) narxi, sotilayotgan narxi, ombordagi miqdori va foydasi */}
            {reportsSubTab === 'kirim_chiqim' && (() => {
              const rows = companyProducts.map((prod) => {
                const costP = Number(prod.costPrice) || 0;
                const bunkerP = Number(prod.price) || 0;
                const crmP = getProductCrmPrice(prod);
                const prodSales = generalReportSales.filter(
                  (s) =>
                    String(s.productId || '') === String(prod.id) ||
                    (s.productTitle || '').trim().toLowerCase() === (prod.title || '').trim().toLowerCase()
                );
                const soldQty = prodSales.reduce((acc, s) => acc + (Number(s.quantity) || 0), 0);
                const soldRevenue = prodSales.reduce((acc, s) => acc + (Number(s.totalSum) || 0), 0);
                const isUnlimited = Boolean(prod.unlimitedStock || (prod.stock !== undefined && Number(prod.stock) >= 999999999));
                const remainStock = isUnlimited ? 0 : Math.max(0, Number(prod.stock) || 0);
                const totalInitialQty = isUnlimited
                  ? soldQty
                  : prod.initialStock && prod.initialStock >= remainStock + soldQty
                  ? Number(prod.initialStock)
                  : remainStock + soldQty;
                const unitProfitOnline = bunkerP - costP;
                const unitProfitCrm = crmP - costP;
                const totalCostOfSold = soldQty * costP;
                const totalNetProfit = soldRevenue - totalCostOfSold;
                const totalStockCostValue = isUnlimited ? 0 : remainStock * costP;
                return {
                  prod,
                  isUnlimited,
                  costP,
                  bunkerP,
                  crmP,
                  soldQty,
                  soldRevenue,
                  remainStock,
                  totalInitialQty,
                  unitProfitOnline,
                  unitProfitCrm,
                  totalCostOfSold,
                  totalNetProfit,
                  totalStockCostValue,
                };
              });

              const grandTotalStockCost = rows.reduce((a, r) => a + r.totalStockCostValue, 0);
              const grandTotalSoldRevenue = rows.reduce((a, r) => a + r.soldRevenue, 0);
              const grandTotalSoldCost = rows.reduce((a, r) => a + r.totalCostOfSold, 0);
              const grandTotalNetProfit = rows.reduce((a, r) => a + r.totalNetProfit, 0);

              return (
                <div className="space-y-5 animate-fadeIn">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="bg-[#0A1931] border-2 border-[#1E3A6D] p-4 rounded-2xl shadow-lg text-white">
                      <span className="text-xs text-white block font-bold">1. Ombordagi Qoldiq Tan Narxi (Kirim):</span>
                      <span className="text-xl font-black text-white font-mono block mt-1">
                        {formatPrice(grandTotalStockCost)}
                      </span>
                      <span className="text-[11px] text-white block mt-1">
                        {companyProducts.length} xil mahsulot bo‘yicha
                      </span>
                    </div>

                    <div className="bg-[#0A1931] border-2 border-[#1E3A6D] p-4 rounded-2xl shadow-lg text-white">
                      <span className="text-xs text-white block font-bold">2. Sotilgan Mahsulotlar Tan Narxi:</span>
                      <span className="text-xl font-black text-white font-mono block mt-1">
                        {formatPrice(grandTotalSoldCost)}
                      </span>
                      <span className="text-[11px] text-white block mt-1">
                        Keltirilgan (asl) narxda hisoblangan
                      </span>
                    </div>

                    <div className="bg-[#0A1931] border-2 border-[#1E3A6D] p-4 rounded-2xl shadow-lg text-white">
                      <span className="text-xs text-white block font-bold">3. Sotilgan Mahsulotlar Tushumi (Chiqim):</span>
                      <span className="text-xl font-black text-white font-mono block mt-1">
                        {formatPrice(grandTotalSoldRevenue)}
                      </span>
                      <span className="text-[11px] text-white block mt-1">
                        Onlayn + CRM savdolar jami
                      </span>
                    </div>

                    <div className="bg-[#0A1931] border-2 border-emerald-500/50 p-4 rounded-2xl shadow-lg">
                      <span className="text-xs text-emerald-300 block font-bold">4. Jami Sof Foyda (Sotuv - Asl narx):</span>
                      <span className="text-xl font-black text-emerald-400 font-mono block mt-1">
                        {formatPrice(grandTotalNetProfit)}
                      </span>
                      <span className="text-[11px] text-emerald-200 block mt-1">
                        Sotilgan mahsulotlardan qolgan sof foyda
                      </span>
                    </div>
                  </div>

                  <div className="bg-[#0A1931] border-2 border-[#1E3A6D] rounded-3xl overflow-hidden shadow-2xl">
                    <div className="p-4 sm:p-5 border-b border-[#1E3A6D] flex flex-wrap items-center justify-between gap-3">
                      <h3 className="font-black text-white text-sm flex items-center gap-2">
                        <Calculator className="w-4 h-4 text-[#FFB800]" />
                        <span>4. Kirim-Chiqim Jadvali (Keltirilgan narx, Sotilayotgan narx va Sof Foyda tahlili)</span>
                      </h3>
                      <span className="text-xs text-sky-200 font-mono">
                        {rows.length} xil mahsulot
                      </span>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs text-slate-200">
                        <thead className="bg-[#071326] text-[#FFB800] uppercase text-[10px] tracking-wider border-b border-[#1E3A6D]">
                          <tr>
                            <th className="py-3.5 px-4 font-black">№</th>
                            <th className="py-3.5 px-4 font-black">Mahsulot nomi</th>
                            <th className="py-3.5 px-4 font-black">Asl (Keltirilgan) Narxi</th>
                            <th className="py-3.5 px-4 font-black">Sotilayotgan Narxi</th>
                            <th className="py-3.5 px-4 font-black">1 Birlikdan Foyda</th>
                            <th className="py-3.5 px-4 font-black">Ombordagi Mavjudligi</th>
                            <th className="py-3.5 px-4 font-black">Sotilgan Miqdor</th>
                            <th className="py-3.5 px-4 font-black">Jami Sotuv Summasi</th>
                            <th className="py-3.5 px-4 font-black">Jami Sof Foyda</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#1E3A6D]/70 bg-[#0A1931] font-medium">
                          {rows.length === 0 ? (
                            <tr>
                              <td colSpan={9} className="py-12 text-center text-sky-200/70 text-xs">
                                Hozircha mahsulotlar kiritilmagan.
                              </td>
                            </tr>
                          ) : (
                            rows.map((r, i) => (
                              <tr key={r.prod.id} className="hover:bg-[#0F2547]/70 transition-colors">
                                <td className="py-3.5 px-4 font-mono font-black text-[#FFB800]">{i + 1}</td>
                                <td className="py-3.5 px-4">
                                  <div className="font-black text-white text-xs sm:text-sm">{r.prod.title}</div>
                                  <div className="text-[10px] text-amber-400 font-mono">{r.prod.category} • {r.prod.unit}</div>
                                </td>
                                <td className="py-3.5 px-4 font-mono whitespace-nowrap">
                                  <span className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-700 text-amber-300 font-black">
                                    {formatPrice(r.costP)} (1 {r.prod.unit})
                                  </span>
                                </td>
                                <td className="py-3.5 px-4 font-mono whitespace-nowrap space-y-1">
                                  <div className="text-white font-bold">
                                    Onlayn: <span className="text-[#FFB800] font-black">{formatPrice(r.bunkerP)}</span>
                                  </div>
                                  <div className="text-sky-200 text-[11px]">
                                    CRM: <span className="text-emerald-300 font-black">{formatPrice(r.crmP)}</span>
                                  </div>
                                </td>
                                <td className="py-3.5 px-4 font-mono whitespace-nowrap space-y-1">
                                  <div className={r.unitProfitOnline >= 0 ? 'text-emerald-400 font-black' : 'text-red-400 font-black'}>
                                    Onlayn: {r.unitProfitOnline >= 0 ? '+' : ''}{formatPrice(r.unitProfitOnline)}
                                  </div>
                                  <div className="text-[11px] text-emerald-300 font-bold">
                                    CRM: {r.unitProfitCrm >= 0 ? '+' : ''}{formatPrice(r.unitProfitCrm)}
                                  </div>
                                </td>
                                <td className="py-3.5 px-4 whitespace-nowrap">
                                  {r.isUnlimited ? (
                                    <span className="px-2.5 py-1 rounded-xl bg-emerald-500/20 border border-emerald-400 text-emerald-300 font-black text-[11px]">
                                      Cheklanmagan
                                    </span>
                                  ) : r.remainStock <= 0 ? (
                                    <span className="px-2.5 py-1 rounded-xl bg-red-500/20 border border-red-400 text-red-300 font-black text-[11px]">
                                      Vaqtincha tugagan (0 {r.prod.unit})
                                    </span>
                                  ) : (
                                    <div className="space-y-0.5 font-mono">
                                      <span className="px-2.5 py-0.5 rounded-lg bg-emerald-500/20 border border-emerald-400/50 text-emerald-300 font-black text-xs inline-block">
                                        Qoldiq: {r.remainStock} {r.prod.unit}
                                      </span>
                                      <div className="text-[10px] text-sky-300">
                                        Kirim: {r.totalInitialQty} {r.prod.unit}
                                      </div>
                                    </div>
                                  )}
                                </td>
                                <td className="py-3.5 px-4 font-mono font-bold text-white whitespace-nowrap">
                                  {r.soldQty} {r.prod.unit}
                                </td>
                                <td className="py-3.5 px-4 font-mono font-black text-[#FFB800] whitespace-nowrap">
                                  {formatPrice(r.soldRevenue)}
                                </td>
                                <td className="py-3.5 px-4 font-mono font-black whitespace-nowrap">
                                  <span className={`px-2.5 py-1 rounded-xl border ${
                                    r.totalNetProfit >= 0
                                      ? 'bg-emerald-500/20 border-emerald-400/50 text-emerald-300'
                                      : 'bg-red-500/20 border-red-400/50 text-red-300'
                                  }`}>
                                    {r.totalNetProfit >= 0 ? '+' : ''}{formatPrice(r.totalNetProfit)}
                                  </span>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* 5. KUTILAYOTGAN QARZLAR BO'LIMI — Bitta mobil ekranga to'liq sig'adigan ixcham jadval */}
            {reportsSubTab === 'pending_debts' && (
              <div className="space-y-2.5 sm:space-y-4 animate-fadeIn">
                <div className="grid grid-cols-2 gap-2 sm:gap-4">
                  <div className="bg-[#0A1931] border border-red-500/50 p-2.5 sm:p-4 rounded-xl sm:rounded-2xl shadow-lg text-white">
                    <span className="text-[10px] sm:text-xs text-white block font-bold">1. Kutilayotgan Qarzlar:</span>
                    <span className="text-sm sm:text-xl font-black text-red-400 font-mono block mt-0.5">
                      {formatPrice(totalPendingDebtSum)}
                    </span>
                    <span className="text-[9.5px] sm:text-[11px] text-sky-200 block mt-0.5">
                      {pendingMyCrmDebts.length} ta faol qarz
                    </span>
                  </div>

                  <div className="bg-[#0A1931] border border-[#1E3A6D] p-2.5 sm:p-4 rounded-xl sm:rounded-2xl shadow-lg text-white flex flex-col justify-between">
                    <div>
                      <span className="text-[10px] sm:text-xs text-white block font-bold">2. Qarz Daftari:</span>
                      <span className="text-xs sm:text-sm font-black text-[#FFB800] block mt-0.5">
                        Jami {myCrmDebts.length} ta yozuv
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setQarzPasswordInput('');
                        setQarzPasswordError(null);
                        setShowQarzPassword(false);
                        setIsQarzPasswordModalOpen(true);
                      }}
                      className="mt-1.5 px-2.5 py-1.5 sm:px-3.5 sm:py-2 rounded-lg sm:rounded-xl bg-[#FFB800] hover:bg-[#FFC928] text-slate-950 font-black text-[9.5px] sm:text-xs cursor-pointer self-start"
                    >
                      Qarz daftarini ochish →
                    </button>
                  </div>
                </div>

                <div className="bg-[#0A1931] border-2 border-[#1E3A6D] rounded-2xl sm:rounded-3xl overflow-hidden shadow-2xl">
                  <div className="p-2.5 sm:p-4 border-b border-[#1E3A6D] flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-black text-white text-[11px] sm:text-sm flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-red-400 shrink-0" />
                      <span>5. Kutilayotgan Qarzlar Monitoringi ({pendingMyCrmDebts.length} ta faol qarz)</span>
                    </h3>
                  </div>

                  <div className="w-full overflow-x-hidden sm:overflow-x-auto">
                    <table className="w-full text-left text-[9px] sm:text-xs text-white table-fixed sm:table-auto">
                      <thead className="bg-[#071326] text-[#FFB800] uppercase text-[8px] sm:text-[10px] tracking-tight sm:tracking-wider border-b border-[#1E3A6D]">
                        <tr>
                          <th className="py-1.5 px-1 sm:py-3 sm:px-4 font-black w-6 sm:w-10 text-center">№</th>
                          <th className="hidden sm:table-cell py-3 px-4 font-black">Sana</th>
                          <th className="py-1.5 px-1.5 sm:py-3 sm:px-4 font-black">Qarzdor Mijoz</th>
                          <th className="py-1.5 px-1.5 sm:py-3 sm:px-4 font-black">Mahsulotlar</th>
                          <th className="hidden sm:table-cell py-3 px-4 font-black">Savat Jami Summasi</th>
                          <th className="hidden sm:table-cell py-3 px-4 font-black">Oflayn Savdoda To‘langan</th>
                          <th className="py-1.5 px-1.5 sm:py-3 sm:px-4 font-black w-[24%] sm:w-auto">Kutilayotgan Qarz</th>
                          <th className="py-1.5 px-1 sm:py-3 sm:px-4 font-black w-[18%] sm:w-auto text-center">Holat</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#1E3A6D]/70 bg-[#0A1931]">
                        {pendingMyCrmDebts.length === 0 ? (
                          <tr>
                            <td colSpan={8} className="py-8 sm:py-12 text-center text-sky-200/70 text-[10px] sm:text-xs">
                              Hozircha kutilayotgan qarzlar mavjud emas.
                            </td>
                          </tr>
                        ) : (
                          pendingMyCrmDebts.map((debt, idx) => (
                            <tr key={debt.id} className="hover:bg-[#0F2547]/70 transition-colors">
                              <td className="py-1.5 px-1 sm:py-3 sm:px-4 font-mono font-black text-[#FFB800] text-center">{idx + 1}</td>
                              <td className="hidden sm:table-cell py-3 px-4 font-mono text-sky-200 whitespace-nowrap">{debt.createdAt.slice(0, 10)}</td>
                              <td className="py-1.5 px-1.5 sm:py-3 sm:px-4">
                                <div className="font-black text-white text-[9.5px] sm:text-sm leading-tight truncate">{debt.customerName}</div>
                                <div className="font-mono text-[8.5px] sm:text-xs text-amber-300 truncate">{debt.customerPhone}</div>
                                <div className="sm:hidden font-mono text-[7.5px] text-sky-300">{debt.createdAt.slice(0, 10)}</div>
                              </td>
                              <td className="py-1.5 px-1.5 sm:py-3 sm:px-4">
                                <div className="space-y-0.5 max-h-14 overflow-y-auto">
                                  {debt.items.map((it, i) => (
                                    <div key={i} className="text-[8.5px] sm:text-xs text-white leading-tight truncate">
                                      • {it.title} ({it.quantity} {it.unit})
                                    </div>
                                  ))}
                                </div>
                              </td>
                              <td className="hidden sm:table-cell py-3 px-4 font-mono font-bold text-white whitespace-nowrap">
                                {formatPrice(debt.totalOrderAmount)}
                              </td>
                              <td className="hidden sm:table-cell py-3 px-4 font-mono font-bold text-emerald-400 whitespace-nowrap">
                                {formatPrice((Number(debt.initialPaidAmount) || 0) + (Number(debt.paidDebtAmount) || 0))}
                              </td>
                              <td className="py-1.5 px-1.5 sm:py-3 sm:px-4 font-mono font-black text-red-400">
                                <div className="leading-tight">{formatPrice(debt.remainingDebtAmount)}</div>
                                <div className="sm:hidden text-[7.5px] text-emerald-300 font-normal">
                                  To‘landi: {new Intl.NumberFormat('uz-UZ').format((Number(debt.initialPaidAmount) || 0) + (Number(debt.paidDebtAmount) || 0))}
                                </div>
                              </td>
                              <td className="py-1.5 px-1 sm:py-3 sm:px-4 text-center">
                                <span className="px-1.5 py-0.5 sm:px-2.5 sm:py-1 rounded-full bg-red-500/20 border border-red-400/50 text-red-300 font-black text-[7.5px] sm:text-[10px] uppercase inline-block">
                                  Kutilmoqda
                                </span>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* Savdolar Jadvali — Bitta mobil ekranga sig'adigan ixcham ko'rinish */}
            {reportsSubTab !== 'kirim_chiqim' && reportsSubTab !== 'pending_debts' && (
            <div className="bg-[#0A1931] border-2 border-[#1E3A6D] rounded-2xl sm:rounded-3xl overflow-hidden shadow-2xl">
              <div className="p-2 sm:p-4 border-b border-[#1E3A6D] flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-black text-white text-[11px] sm:text-sm flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#FFB800]" />
                  <span>
                    {reportsSubTab === 'general'
                      ? '1. Umumiy Monitoring Jadvali'
                      : reportsSubTab === 'online'
                      ? '2. Onlayn Savdo Monitoringi Jadvali'
                      : '3. CRM Monitoringi Jadvali (CRM savdo)'}
                  </span>
                </h3>
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <span className="text-[9px] sm:text-xs text-slate-300 font-mono">
                    {displayedReportSales.length} ta yozuv ({dailyGroupedReportSales.length} kun)
                  </span>
                  <button
                    type="button"
                    onClick={handleDownloadMonitoringPdf}
                    className="px-2 py-0.5 sm:px-3.5 sm:py-1.5 rounded-lg sm:rounded-xl bg-[#FFB800] hover:bg-[#FFC928] text-slate-950 font-black text-[9px] sm:text-xs flex items-center gap-1 cursor-pointer shadow"
                  >
                    <Download className="w-2.5 h-2.5 sm:w-3.5 sm:h-3.5 stroke-[2.5]" />
                    <span>PDF yuklab olish</span>
                  </button>
                </div>
              </div>

              <div className="w-full overflow-x-hidden sm:overflow-x-auto">
                <table className="w-full text-left text-[9px] sm:text-xs text-slate-200 leading-tight table-fixed sm:table-auto">
                  <thead className="bg-[#071326] text-[#FFB800] uppercase text-[8px] sm:text-[10px] tracking-tight sm:tracking-wider border-b border-[#1E3A6D]">
                    <tr>
                      <th className="py-1.5 px-1 sm:py-3 sm:px-4 font-black w-[16%] sm:w-auto">Sana</th>
                      <th className="hidden sm:table-cell py-3 px-4 font-black">Tizim / Kanal</th>
                      <th className="py-1.5 px-1.5 sm:py-3 sm:px-4 font-black">Mahsulot Nomi</th>
                      <th className="py-1.5 px-1 sm:py-3 sm:px-4 font-black w-[14%] sm:w-auto">Miqdor</th>
                      <th className="hidden sm:table-cell py-3 px-4 font-black">Birlik Narxi</th>
                      <th className="py-1.5 px-1.5 sm:py-3 sm:px-4 font-black w-[22%] sm:w-auto">Jami Summa</th>
                      {reportsSubTab !== 'offline' && (
                        <th className="hidden sm:table-cell py-3 px-4 font-black">Bunker Ulushi</th>
                      )}
                      <th className="hidden sm:table-cell py-3 px-4 font-black">Korxona Tushumi</th>
                      <th className="py-1.5 px-1.5 sm:py-3 sm:px-4 font-black w-[22%] sm:w-auto">Xaridor</th>
                      <th className="hidden sm:table-cell py-3 px-4 font-black text-center">Holat</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1E3A6D]/70 bg-[#0A1931] font-medium">
                    {dailyGroupedReportSales.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="py-6 sm:py-10 text-center text-slate-300 text-[10px] sm:text-xs">
                          Tanlangan monitoring bo‘limida hozircha savdo qayd etilmagan.
                        </td>
                      </tr>
                    ) : (
                      dailyGroupedReportSales.map((dayGroup) => (
                        <React.Fragment key={dayGroup.day}>
                          {/* Kunlik Ajratuvchi Sarlavha Qatori */}
                          <tr className="bg-[#071326] border-y border-[#FFB800]/50">
                            <td colSpan={reportsSubTab !== 'offline' ? 10 : 9} className="py-1 px-1.5 sm:py-2 sm:px-4">
                              <div className="flex flex-wrap items-center justify-between gap-1 sm:gap-2">
                                <div className="flex items-center gap-1.5">
                                  <span className="px-1.5 py-0.2 rounded bg-[#FFB800] text-slate-950 font-mono font-black text-[8.5px] sm:text-[11px] shadow">
                                    {dayGroup.day}
                                  </span>
                                  <span className="text-[8.5px] sm:text-[11px] font-black text-white uppercase tracking-wider">
                                    ({dayGroup.items.length} ta savdo)
                                  </span>
                                </div>
                                <div className="flex flex-wrap items-center gap-1.5 sm:gap-2.5 text-[8.5px] sm:text-[11px] font-mono">
                                  <span className="text-slate-200">
                                    Jami: <strong className="text-[#FFB800] font-black">{formatPrice(dayGroup.totalSum)}</strong>
                                  </span>
                                  <span className="text-white">
                                    Tushum: <strong className="text-emerald-400 font-black">{formatPrice(dayGroup.netSum)}</strong>
                                  </span>
                                </div>
                              </div>
                            </td>
                          </tr>

                          {/* Shu kunga tegishli savdolar */}
                          {dayGroup.items.map((sale) => {
                            const isOfflineSale = sale.orderChannel === 'offline';
                            const itemCommission = getSaleItemBunkerCommission(sale);
                            const itemNet = Math.max(0, (Number(sale.totalSum) || 0) - itemCommission);
                            return (
                              <tr key={sale.id} className="hover:bg-[#0F2547]/70 transition-colors">
                                <td className="py-1.5 px-1 sm:py-3 sm:px-4 text-slate-200 font-mono text-[8px] sm:text-[11px]">
                                  <div className="truncate">{sale.date}</div>
                                  <span className={`sm:hidden inline-block mt-0.5 px-1 py-0.2 rounded text-[7px] font-black uppercase ${
                                    isOfflineSale ? 'bg-amber-500/20 text-amber-300' : 'bg-emerald-500/20 text-emerald-300'
                                  }`}>
                                    {isOfflineSale ? 'CRM' : 'Onlayn'}
                                  </span>
                                </td>
                                <td className="hidden sm:table-cell py-3 px-4 whitespace-nowrap">
                                  <span className={`px-1.5 py-0.2 rounded text-[10px] font-black uppercase border ${
                                    isOfflineSale
                                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                                      : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                                  }`}>
                                    {isOfflineSale ? 'CRM savdo' : 'Onlayn Bunker'}
                                  </span>
                                </td>
                                <td className="py-1.5 px-1.5 sm:py-3 sm:px-4 text-white font-bold">
                                  <div className="leading-tight truncate">{sale.productTitle}</div>
                                  <div className="text-[7.5px] sm:text-[10px] text-amber-400 font-mono leading-tight truncate">{sale.category}</div>
                                </td>
                                <td className="py-1.5 px-1 sm:py-3 sm:px-4 font-mono font-bold text-white">
                                  {sale.quantity} {sale.unit}
                                </td>
                                <td className="hidden sm:table-cell py-3 px-4 font-mono text-slate-300 whitespace-nowrap">
                                  {formatPrice(sale.price)}
                                </td>
                                <td className="py-1.5 px-1.5 sm:py-3 sm:px-4 font-mono font-black text-[#FFB800]">
                                  <div className="leading-tight">{formatPrice(sale.totalSum)}</div>
                                </td>
                                {reportsSubTab !== 'offline' && (
                                  <td className="hidden sm:table-cell py-3 px-4 font-mono whitespace-nowrap">
                                    {isOfflineSale ? (
                                      <span className="text-[11px] text-slate-400 font-bold">
                                        0 so‘m (CRM)
                                      </span>
                                    ) : (
                                      <span className="text-emerald-400 font-black">
                                        {formatPrice(itemCommission)}
                                      </span>
                                    )}
                                  </td>
                                )}
                                <td className="hidden sm:table-cell py-3 px-4 font-mono font-black text-emerald-300 whitespace-nowrap">
                                  {formatPrice(itemNet)}
                                </td>
                                <td className="py-1.5 px-1.5 sm:py-3 sm:px-4">
                                  <span className="text-white font-bold block leading-tight truncate">{formatBuyerDisplayName(sale.buyerName)}</span>
                                  <span className="text-[7.5px] sm:text-[10px] text-slate-300 font-mono block leading-tight truncate">{sale.buyerPhone}</span>
                                </td>
                                <td className="hidden sm:table-cell py-3 px-4 text-center whitespace-nowrap">
                                  {sale.status === 'assigned' ? (
                                    <span className="px-1.5 py-0.2 rounded-full text-[10px] font-black uppercase bg-amber-500/25 text-amber-300 border border-amber-400/50">
                                      Yuklash jarayonida
                                    </span>
                                  ) : sale.status === 'in_transit' ? (
                                    <span className="px-1.5 py-0.2 rounded-full text-[10px] font-black uppercase bg-emerald-500/25 text-emerald-300 border border-emerald-400/50">
                                      Yetkazilmoqda
                                    </span>
                                  ) : sale.status === 'pending' ? (
                                    <span className="px-1.5 py-0.2 rounded-full text-[10px] font-black uppercase bg-amber-500/15 text-amber-300 border border-amber-500/30">
                                      Buyurtma berildi
                                    </span>
                                  ) : (
                                    <span className="px-1.5 py-0.2 rounded-full text-[10px] font-black uppercase bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                                      Yetkazilgan
                                    </span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </React.Fragment>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            )}

            {/* Yetkazib Berish Marshrutlari — Faqat Onlayn savdo monitoringi bo'limida ko'rsatiladi */}
            {reportsSubTab === 'online' && (
              <div className="bg-[#0A1931] border-2 border-[#1E3A6D] rounded-3xl overflow-hidden shadow-xl">
                <div className="p-4 sm:p-5 border-b border-[#1E3A6D]">
                  <h3 className="font-black text-white text-sm flex items-center gap-2">
                    <Truck className="w-4 h-4 text-emerald-400" />
                    <span>Logistika va Yetkazib Berish Yo‘nalishlari (Onlayn buyurtmalar)</span>
                  </h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-slate-300">
                    <thead className="bg-[#071326] text-sky-200 uppercase text-[10px] tracking-wider border-b border-[#1E3A6D]">
                      <tr>
                        <th className="py-3 px-4 font-black">Jo‘natilgan Manzil</th>
                        <th className="py-3 px-4 font-black">Qabul Ob'ekti (Viloyat / Tuman)</th>
                        <th className="py-3 px-4 font-black">Yuk Hajmi</th>
                        <th className="py-3 px-4 font-black">Haydovchi / Mashina</th>
                        <th className="py-3 px-4 font-black text-center">Holat</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#1E3A6D]/70 bg-[#0A1931]">
                      {supplierReport.routes
                        .filter((rt) => !String(rt.toLocation || '').toLowerCase().includes('crm oflayn savdo'))
                        .map((rt) => (
                          <tr key={rt.id} className="hover:bg-[#0F2547]/70 transition-colors">
                            <td className="py-3 px-4 text-slate-300">
                              {rt.fromLocation}
                            </td>
                            <td className="py-3 px-4 text-white font-bold">
                              <div className="flex items-center gap-2">
                                <span>{formatRegionAndDistrictOnly(rt.toLocation)}</span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setSelectedMapCustomer({
                                      name: rt.productTitle,
                                      phone: rt.driverPhone,
                                      address: rt.toLocation,
                                      coords: extractCoordsFromAddress(rt.toLocation),
                                    })
                                  }
                                  title="Xaritadan ko‘rish"
                                  className="p-1.5 rounded-lg bg-amber-500/20 hover:bg-[#FFB800] text-[#FFB800] hover:text-slate-950 border border-amber-500/40 transition-colors cursor-pointer shrink-0"
                                >
                                  <MapPin className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                            <td className="py-3 px-4 font-mono text-amber-300">
                              {rt.quantityText}
                            </td>
                            <td className="py-3 px-4">
                              <span className="text-white block font-medium">{rt.driverName} ({rt.vehicle})</span>
                              <span className="text-[10px] text-emerald-400 font-mono font-bold">{rt.driverPhone}</span>
                            </td>
                            <td className="py-3 px-4 text-center">
                              {rt.status === 'assigned' ? (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-amber-500/25 text-amber-300 border border-amber-400/50 animate-pulse">
                                  Yuklash jarayonida
                                </span>
                              ) : rt.status === 'in_transit' ? (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-sky-500/20 text-sky-300 border border-sky-400/40">
                                  Yetkazilmoqda
                                </span>
                              ) : rt.status === 'pending' ? (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-amber-500/15 text-amber-300 border border-amber-500/30">
                                  Buyurtma berildi
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                                  Yetkazildi
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

          </div>
        )}

        {/* Tab 3: Mijozlar — 1. Mijozlar so'rovi va 2. B2B mijoz so'rovlari TEPADA YONMA-YON + JARAYONDAGILAR TUGMASI + BITTA EKRANDA 5 TA MIJOZ */}
        {activeTab === 'customers' && (
          <div className="space-y-2.5 sm:space-y-5 mt-2.5 sm:mt-0 animate-fadeIn">
            <div className="bg-[#0A1931] border-2 border-[#1E3A6D] p-2.5 sm:p-5 rounded-2xl sm:rounded-3xl space-y-2 sm:space-y-4 shadow-2xl">
              <div
                onClick={() => setIsMobileSidebarOpen(true)}
                className="flex flex-wrap items-center justify-between gap-2 cursor-pointer lg:cursor-default"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-1 text-[#FFB800] font-bold text-[9px] sm:text-xs uppercase tracking-wider">
                    <Users className="w-3 h-3 sm:w-4 sm:h-4 shrink-0" />
                    <span>
                      {supplierData.cabinetType === 'manufacturer'
                        ? 'B2B Mijozlar va Hamkor So‘rovlari'
                        : 'Onlayn Mijozlar va Buyurtma So‘rovlari'}
                    </span>
                  </div>
                  <h2 className="text-xs sm:text-xl font-black text-white leading-tight break-words">
                    «{formatCleanCompanyName(supplierData.companyName)}» —{' '}
                    {supplierData.cabinetType === 'manufacturer' ? 'B2B Mijozlar' : 'Onlayn Mijozlar'}
                  </h2>
                </div>

                {/* Jami so'rovlar + Jarayondagilar filtri */}
                <div className="flex flex-wrap items-center gap-1.5 sm:gap-2" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    onClick={() => setCustomersStatusFilter('all')}
                    className={`px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-lg sm:rounded-xl text-[10px] sm:text-xs font-mono font-black border cursor-pointer transition-colors ${
                      customersStatusFilter === 'all'
                        ? 'bg-[#FFB800] text-[#0A1931] border-[#E5A600] shadow-sm'
                        : 'bg-[#071326] text-[#FFB800] border-[#FFB800]/40 hover:bg-[#0F2547]'
                    }`}
                  >
                    Jami so‘rovlar:{' '}
                    {supplierData.cabinetType === 'manufacturer'
                      ? supplierCustomers.length + incomingManufacturerB2bOrders.length
                      : supplierCustomers.length}{' '}
                    ta
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setCustomersStatusFilter((prev) => (prev === 'in_progress' ? 'all' : 'in_progress'))
                    }
                    className={`px-2.5 py-1 sm:px-3.5 sm:py-1.5 rounded-lg sm:rounded-xl text-[10px] sm:text-xs font-black border cursor-pointer transition-colors flex items-center gap-1 ${
                      customersStatusFilter === 'in_progress'
                        ? 'bg-emerald-500 text-slate-950 border-emerald-300 shadow-md'
                        : 'bg-[#071326] text-emerald-400 border-emerald-500/50 hover:bg-[#0F2547]'
                    }`}
                  >
                    <Clock className="w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0" />
                    <span>
                      Jarayondagilar (
                      {
                        supplierCustomers.filter(
                          (c) =>
                            c.status === 'pending' ||
                            c.status === 'confirmed' ||
                            c.status === 'assigned' ||
                            c.status === 'in_transit'
                        ).length
                      }{' '}
                      ta)
                    </span>
                  </button>
                </div>
              </div>

              {/* B2B Kabinetida 2 TA SUB-TAB TEPADA YONMA-YON */}
              {supplierData.cabinetType === 'manufacturer' && (
                <div className="grid grid-cols-2 gap-1.5 sm:gap-3 pt-2 border-t border-[#1E3A6D]">
                  <button
                    type="button"
                    onClick={() => setCustomersSubTab('regular')}
                    className={`p-2 sm:p-3 rounded-xl sm:rounded-2xl border font-black text-[10px] sm:text-sm flex items-center justify-between gap-1 cursor-pointer transition-colors ${
                      customersSubTab === 'regular'
                        ? 'bg-[#FFB800] text-[#0A1931] border-[#E5A600] shadow-md'
                        : 'bg-[#071326] hover:bg-[#0F2547] text-white border-[#1E3A6D]'
                    }`}
                  >
                    <div className="flex items-center gap-1 sm:gap-2 text-left min-w-0">
                      <Users className={`w-3 h-3 sm:w-4 sm:h-4 shrink-0 ${customersSubTab === 'regular' ? 'text-[#0A1931]' : 'text-[#FFB800]'}`} />
                      <span className="leading-tight break-words">1. Mijozlar so‘rovi</span>
                    </div>
                    <span className={`px-1.5 sm:px-2.5 py-0.5 rounded-full text-[9px] sm:text-xs font-mono font-black shrink-0 ${
                      customersSubTab === 'regular' ? 'bg-[#0A1931] text-[#FFB800]' : 'bg-[#0F2547] text-amber-400'
                    }`}>
                      {supplierCustomers.length} ta
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setCustomersSubTab('b2b_suppliers')}
                    className={`p-2 sm:p-3 rounded-xl sm:rounded-2xl border font-black text-[10px] sm:text-sm flex items-center justify-between gap-1 cursor-pointer transition-colors ${
                      customersSubTab === 'b2b_suppliers'
                        ? 'bg-[#FFB800] text-[#0A1931] border-[#E5A600] shadow-md'
                        : pendingIncomingB2bCount > 0
                        ? 'bg-emerald-500 text-slate-950 border-emerald-300 shadow-md'
                        : 'bg-[#071326] hover:bg-[#0F2547] text-white border-[#1E3A6D]'
                    }`}
                  >
                    <div className="flex items-center gap-1 sm:gap-2 text-left min-w-0">
                      <Building className={`w-3 h-3 sm:w-4 sm:h-4 shrink-0 ${customersSubTab === 'b2b_suppliers' ? 'text-[#0A1931]' : 'text-emerald-400'}`} />
                      <span className="leading-tight break-words">2. B2B mijoz so‘rovlari</span>
                    </div>
                    <span className={`px-1.5 sm:px-2.5 py-0.5 rounded-full text-[9px] sm:text-xs font-mono font-black shrink-0 ${
                      customersSubTab === 'b2b_suppliers' ? 'bg-[#0A1931] text-[#FFB800]' : 'bg-[#0F2547] text-emerald-400'
                    }`}>
                      {incomingManufacturerB2bOrders.length} ta
                    </span>
                  </button>
                </div>
              )}
            </div>

            {/* SUB-TAB 1: MIJOZLAR SO'ROVI (Bitta mobil ekranda 5 ta mijoz holati to'liq ko'rinadi) */}
            {(supplierData.cabinetType !== 'manufacturer' || customersSubTab === 'regular') && (() => {
              const filteredCustList =
                customersStatusFilter === 'in_progress'
                  ? supplierCustomers.filter(
                      (c) =>
                        c.status === 'pending' ||
                        c.status === 'confirmed' ||
                        c.status === 'assigned' ||
                        c.status === 'in_transit'
                    )
                  : supplierCustomers;

              return filteredCustList.length === 0 ? (
                <div className="text-center py-8 sm:py-16 bg-[#0A1931] rounded-2xl sm:rounded-3xl border-2 border-[#1E3A6D] p-5 sm:p-8 space-y-2 shadow-2xl">
                  <Users className="w-8 h-8 sm:w-12 sm:h-12 text-[#FFB800] mx-auto" />
                  <p className="text-white font-bold text-xs sm:text-sm">
                    {customersStatusFilter === 'in_progress'
                      ? 'Hozircha jarayondagi mijoz buyurtmalari yo‘q.'
                      : 'Hozircha platforma foydalanuvchilaridan so‘rovlar kelib tushmagan.'}
                  </p>
                  <p className="text-sky-200 text-[10px] sm:text-xs">
                    Platforma foydalanuvchilari mahsulotlaringizga buyurtma berganda shu yerda aks etadi.
                  </p>
                </div>
              ) : (
                <div className="bg-[#0A1931] border-2 border-[#1E3A6D] rounded-2xl sm:rounded-3xl overflow-hidden shadow-2xl">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-[9px] sm:text-xs text-slate-200 leading-tight">
                      <thead className="bg-[#071326] text-[#FFB800] uppercase text-[8px] sm:text-[10px] tracking-wider border-b border-[#1E3A6D]">
                        <tr>
                          <th className="py-1.5 px-1.5 sm:py-3.5 sm:px-4 font-black">#</th>
                          <th className="py-1.5 px-1.5 sm:py-3.5 sm:px-4 font-black">
                            {supplierData.cabinetType === 'manufacturer' ? 'Xaridor' : 'Mijoz Ism-Familiyasi'}
                          </th>
                          {supplierData.cabinetType !== 'manufacturer' && (
                            <th className="py-1.5 px-1.5 sm:py-3.5 sm:px-4 font-black">Telefon Raqami</th>
                          )}
                          <th className="py-1.5 px-1.5 sm:py-3.5 sm:px-4 font-black">Yetkazish Manzili (Qayergaligi)</th>
                          <th className="py-1.5 px-1.5 sm:py-3.5 sm:px-4 font-black">Buyurtma va Miqdori</th>
                          <th className="py-1.5 px-1.5 sm:py-3.5 sm:px-4 font-black">Jami Miqdor</th>
                          <th className="py-1.5 px-1.5 sm:py-3.5 sm:px-4 font-black">Jami Xarid Summasi</th>
                          <th className="py-1.5 px-1.5 sm:py-3.5 sm:px-4 font-black">Sana</th>
                          <th className="py-1.5 px-1.5 sm:py-3.5 sm:px-4 font-black text-center">Holat va Boshqaruv</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#1E3A6D]/80 bg-[#0A1931] font-medium">
                        {filteredCustList.map((cust, index) => (
                          <tr key={cust.id} className="hover:bg-[#0F2547]/70 transition-colors">
                            <td className="py-1.5 px-1.5 sm:py-3.5 sm:px-4 font-mono font-bold text-[#FFB800]">
                              {index + 1}
                            </td>
                            <td className="py-1.5 px-1.5 sm:py-3.5 sm:px-4 text-white font-bold whitespace-nowrap">
                              {supplierData.cabinetType === 'manufacturer' ? 'Mijoz' : cust.name}
                            </td>
                            {supplierData.cabinetType !== 'manufacturer' && (
                              <td className="py-1.5 px-1.5 sm:py-3.5 sm:px-4 font-mono text-emerald-400 font-bold whitespace-nowrap">
                                {cust.phone}
                              </td>
                            )}
                            <td className="py-1.5 px-1.5 sm:py-3.5 sm:px-4 text-slate-300 min-w-[130px] sm:min-w-[200px]">
                              <div className="flex items-center justify-between gap-1.5 bg-[#071326] border border-[#1E3A6D] px-2 py-1 sm:px-3 sm:py-2 rounded-lg sm:rounded-xl">
                                <span className="text-[9px] sm:text-xs text-white font-bold leading-snug">
                                  {formatRegionAndDistrictOnly(cust.address)}
                                </span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setSelectedMapCustomer({
                                      name: supplierData.cabinetType === 'manufacturer' ? 'Mijoz' : cust.name,
                                      phone: supplierData.cabinetType === 'manufacturer' ? '' : cust.phone,
                                      address: cust.address,
                                      coords: cust.coords,
                                    })
                                  }
                                  title="Xaritadan ko‘rish"
                                  className="p-1 sm:p-2 rounded-lg bg-[#FFB800]/20 hover:bg-[#FFB800] text-[#FFB800] hover:text-slate-950 border border-[#FFB800]/50 cursor-pointer transition-colors shrink-0"
                                >
                                  <MapPin className="w-3 h-3 sm:w-4 sm:h-4 stroke-[2.3]" />
                                </button>
                              </div>
                            </td>
                            <td className="py-1.5 px-1.5 sm:py-3.5 sm:px-4 text-slate-200">
                              <div className="flex flex-col gap-1">
                                <span className="text-[9px] sm:text-xs font-bold text-amber-300 line-clamp-2">
                                  {(cust.itemsList || [])
                                    .map((it) => `${it.title} — ${it.quantity} ${it.unit}`)
                                    .join(', ') || cust.productsBought.join(', ')}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => setSelectedCustomerProductsModal(cust)}
                                  className="self-start px-2 py-1 sm:px-3 sm:py-1 rounded-lg bg-amber-500/20 hover:bg-[#FFB800] hover:text-slate-950 text-[#FFB800] border border-amber-500/40 font-black text-[8.5px] sm:text-[10px] inline-flex items-center gap-1 cursor-pointer transition-colors shadow-sm"
                                >
                                  <Eye className="w-3 h-3" />
                                  <span>Ro‘yxatni ko‘rish</span>
                                </button>
                              </div>
                            </td>
                            <td className="py-1.5 px-1.5 sm:py-3.5 sm:px-4 font-mono font-bold text-white whitespace-nowrap">
                              {cust.totalQty} birlik
                            </td>
                            <td className="py-1.5 px-1.5 sm:py-3.5 sm:px-4 font-mono font-black text-[#FFB800] whitespace-nowrap">
                              {formatPrice(cust.totalSpent)}
                            </td>
                            <td className="py-1.5 px-1.5 sm:py-3.5 sm:px-4 font-mono text-sky-200 text-[8.5px] sm:text-[11px] whitespace-nowrap">
                              {cust.lastOrderDate}
                            </td>
                            <td className="py-1.5 px-1.5 sm:py-3.5 sm:px-4 text-center whitespace-nowrap">
                              {(cust.status === 'pending' || cust.status === 'confirmed') && (
                                <div className="flex flex-col items-center gap-1">
                                  {cust.paymentStatus === 'awaiting_b2b_approval' ? (
                                    <>
                                      <span className="px-2 py-0.5 rounded-full text-[8px] sm:text-[10px] font-black uppercase bg-amber-500 text-slate-950 border border-amber-300 animate-pulse">
                                        🔔 Yangi Mijoz so‘rovi!
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() => handleApproveCustomerB2bOrder(cust.orderIds)}
                                        className="px-2.5 py-1.5 sm:px-3.5 sm:py-2 rounded-lg sm:rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-[9px] sm:text-xs inline-flex items-center gap-1 cursor-pointer shadow-lg"
                                      >
                                        <CheckCircle2 className="w-3 h-3 sm:w-3.5 sm:h-3.5 stroke-[2.5]" />
                                        <span>So‘rovni tasdiqlash (To‘lovga ruxsat berish)</span>
                                      </button>
                                    </>
                                  ) : cust.paymentStatus === 'b2b_approved_unpaid' ? (
                                    <div className="px-2.5 py-1.5 rounded-xl bg-amber-500/15 border border-amber-400/50 text-amber-300 font-black text-[8.5px] sm:text-[10px] space-y-0.5">
                                      <div>⏳ So‘rov tasdiqlandi</div>
                                      <div className="text-sky-200 font-bold">Mijoz to‘lovi kutilmoqda...</div>
                                    </div>
                                  ) : (
                                    <>
                                      <span className="px-2 py-0.5 rounded-full text-[8px] sm:text-[10px] font-black uppercase bg-red-600 text-white border border-red-400">
                                        🔔 To‘lov qilingan — Mahsulot kutmoqda!
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() => handleUpdateCustomerOrderStatus(cust.orderIds, 'assigned')}
                                        className="px-2.5 py-1 sm:px-3.5 sm:py-2 rounded-lg sm:rounded-xl bg-[#FFB800] hover:bg-[#FFC928] text-slate-950 font-black text-[9px] sm:text-xs inline-flex items-center gap-1 cursor-pointer shadow"
                                      >
                                        <Package className="w-3 h-3 sm:w-3.5 sm:h-3.5 stroke-[2.5]" />
                                        <span>Mahsulotlarni tayyorlash jarayoni</span>
                                      </button>
                                    </>
                                  )}
                                </div>
                              )}

                              {cust.status === 'assigned' && (
                                <div className="flex flex-col items-center gap-1 min-w-[180px] sm:min-w-[240px] p-1.5 sm:p-2.5 rounded-xl sm:rounded-2xl bg-[#071326] border border-amber-500/40">
                                  <span className="px-2 py-0.5 rounded-full text-[8px] sm:text-[10px] font-black uppercase bg-amber-500/20 text-amber-300 border border-amber-400/50">
                                    Mahsulot yuklash jarayonida
                                  </span>
                                  <div className="w-full space-y-0.5 text-left">
                                    <label className="text-[8px] sm:text-[10px] font-bold text-sky-200 block">
                                      Yetkazib beruvchi nomeri:
                                    </label>
                                    <input
                                      type="text"
                                      value={
                                        driverPhoneInputs[cust.id] !== undefined
                                          ? driverPhoneInputs[cust.id]
                                          : cust.driverPhone || '+998 '
                                      }
                                      onChange={(e) => {
                                        setDriverPhoneInputs((prev) => ({
                                          ...prev,
                                          [cust.id]: formatUzPhoneInput(e.target.value),
                                        }));
                                        if (driverPhoneErrors[cust.id]) {
                                          setDriverPhoneErrors((prev) => {
                                            const n = { ...prev };
                                            delete n[cust.id];
                                            return n;
                                          });
                                        }
                                      }}
                                      placeholder="+998 90 123 45 67"
                                      className="w-full px-2 py-1 sm:px-2.5 sm:py-1.5 rounded-lg sm:rounded-xl bg-[#0A1931] border border-amber-500/50 focus:border-emerald-400 text-white font-mono text-[9px] sm:text-xs focus:outline-none"
                                    />
                                    {driverPhoneErrors[cust.id] && (
                                      <span className="text-[8px] sm:text-[10px] text-red-400 font-bold block">
                                        {driverPhoneErrors[cust.id]}
                                      </span>
                                    )}
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleConfirmWithDriverPhone(cust.id, cust.orderIds, cust.driverPhone)
                                    }
                                    className="w-full px-2.5 py-1 sm:px-3.5 sm:py-2 rounded-lg sm:rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-[9px] sm:text-xs inline-flex items-center justify-center gap-1 cursor-pointer shadow"
                                  >
                                    <Truck className="w-3 h-3 sm:w-3.5 sm:h-3.5 stroke-[2.5]" />
                                    <span>Mahsulotni manzilga yuborish</span>
                                  </button>
                                </div>
                              )}

                              {cust.status === 'in_transit' && (
                                <div className="flex flex-col items-center gap-1 min-w-[170px] sm:min-w-[220px] p-1.5 sm:p-2.5 rounded-xl sm:rounded-2xl bg-[#071326] border border-emerald-500/40">
                                  <span className="px-2 py-0.5 rounded-full text-[8px] sm:text-[10px] font-black uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-400/40 inline-flex items-center gap-1">
                                    <Truck className="w-2.5 h-2.5 sm:w-3 sm:h-3" /> Yetkazilmoqda
                                  </span>
                                  {cust.driverPhone && (
                                    <div className="w-full px-2 py-1 rounded-lg bg-[#0A1931] border border-emerald-500/40 text-left">
                                      <span className="text-[8px] sm:text-[9px] text-sky-200 uppercase font-bold block">
                                        Bog‘lanish uchun tel:
                                      </span>
                                      <span className="font-mono font-black text-[9px] sm:text-xs text-emerald-400 block">
                                        {cust.driverPhone}
                                      </span>
                                    </div>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => handleUpdateCustomerOrderStatus(cust.orderIds, 'delivered')}
                                    className="w-full px-2 py-1 sm:px-3 sm:py-1.5 rounded-lg sm:rounded-xl bg-emerald-500/20 hover:bg-emerald-500 hover:text-slate-950 text-emerald-300 border border-emerald-500/40 font-bold text-[8.5px] sm:text-[10px] cursor-pointer transition-colors"
                                  >
                                    ✓ Yetkazildi deb belgilash
                                  </button>
                                </div>
                              )}

                              {cust.status === 'delivered' && (
                                <div className="flex flex-col items-center gap-0.5">
                                  <span className="px-2 py-0.5 sm:px-3 sm:py-1 rounded-full text-[8.5px] sm:text-[11px] font-black uppercase bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 inline-flex items-center gap-1">
                                    <CheckCircle2 className="w-3 h-3 sm:w-3.5 sm:h-3.5" /> Yetkazilgan
                                  </span>
                                  {cust.driverPhone && (
                                    <span className="text-[8px] sm:text-[10px] font-mono font-bold text-emerald-300">
                                      Tel: {cust.driverPhone}
                                    </span>
                                  )}
                                </div>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })()}

            {/* SUB-TAB 2: B2B MIJOZ SO'ROVLARI (Faqat B2B Ishlab chiqaruvchi kabinetida ko'rinadi) */}
            {supplierData.cabinetType === 'manufacturer' && customersSubTab === 'b2b_suppliers' && (
              incomingManufacturerB2bOrders.length === 0 ? (
                <div className="text-center py-16 bg-[#0A1931] rounded-3xl border-2 border-[#1E3A6D] p-8 space-y-3 shadow-2xl">
                  <Building className="w-12 h-12 text-emerald-400 mx-auto" />
                  <p className="text-white font-bold text-sm">
                    Hozircha B2B va B2C kabinetlardan mahsulot so‘rovlari kelib tushmagan.
                  </p>
                  <p className="text-sky-200 text-xs max-w-md mx-auto">
                    B2B va B2C kabinetlar mahsulotlaringizni savatga yuklab «So‘rov yuborish» tugmasini bosganda, so‘rovlar korxona ma'lumotlari va PDF ro‘yxati bilan shu yerda ko‘rinadi.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {incomingManufacturerB2bOrders.map((b2bOrd) => (
                    <div
                      key={b2bOrd.id}
                      className="bg-[#0A1931] border-2 border-[#1E3A6D] hover:border-amber-500/50 rounded-3xl p-5 sm:p-6 space-y-4 shadow-2xl transition-all"
                    >
                      {/* Top Header: Buying B2C/B2B Cabinet Details + Status + Actions */}
                      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4 pb-4 border-b border-[#1E3A6D]">
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="px-2.5 py-0.5 rounded-lg bg-amber-500/20 text-[#FFB800] border border-amber-500/40 font-mono font-black text-xs">
                              #{b2bOrd.id}
                            </span>
                            <span className="text-xs text-sky-200 font-mono">
                              {new Date(b2bOrd.createdAt).toLocaleString('uz-UZ')}
                            </span>
                            {b2bOrd.status === 'requested' && (
                              <span className="px-3 py-0.5 rounded-full text-[10px] font-black uppercase bg-amber-500 text-slate-950 animate-pulse">
                                🔔 Yangi B2C So‘rov (Qabul qilish kutilmoqda)
                              </span>
                            )}
                            {b2bOrd.status === 'approved_awaiting_payment' && (
                              <span className="px-3 py-0.5 rounded-full text-[10px] font-black uppercase bg-amber-500/20 text-amber-300 border border-amber-400/50 animate-pulse">
                                ⏳ So‘rov qabul qilindi — B2C to‘lovi kutilmoqda
                              </span>
                            )}
                            {b2bOrd.status === 'paid' && (
                              <span className="px-3 py-0.5 rounded-full text-[10px] font-black uppercase bg-emerald-500 text-slate-950 animate-pulse">
                                💳 To‘lov qilindi — Tayyorlashni boshlang!
                              </span>
                            )}
                            {b2bOrd.status === 'preparing' && (
                              <span className="px-3 py-0.5 rounded-full text-[10px] font-black uppercase bg-amber-500/20 text-amber-300 border border-amber-400/50 animate-pulse">
                                📦 Mahsulot yuklash jarayonida
                              </span>
                            )}
                            {(b2bOrd.status === 'in_transit' || b2bOrd.status === 'paid_shipped') && (
                              <span className="px-3 py-0.5 rounded-full text-[10px] font-black uppercase bg-sky-500/20 text-sky-300 border border-sky-400/40">
                                🚚 Yetkazilmoqda
                              </span>
                            )}
                            {b2bOrd.status === 'delivered' && (
                              <span className="px-3 py-0.5 rounded-full text-[10px] font-black uppercase bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
                                ✅ Yetkazilgan (Yakunlangan)
                              </span>
                            )}
                          </div>

                          <h3 className="text-base sm:text-lg font-black text-white flex items-center gap-2">
                            <Building className="w-5 h-5 text-[#FFB800] shrink-0" />
                            <span>So‘rov yuborgan B2C kabinet: «{b2bOrd.buyerCompanyName}»</span>
                          </h3>

                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-sky-100">
                            <span>STIR: <strong className="text-[#FFB800] font-mono">{b2bOrd.buyerInn || '—'}</strong></span>
                            <span>Rahbar: <strong className="text-white">{b2bOrd.buyerDirector || '—'}</strong></span>
                            <span>Tel: <strong className="text-emerald-400 font-mono">{b2bOrd.buyerPhone}</strong></span>
                            <span>Manzil: <strong className="text-sky-300">{b2bOrd.buyerAddress || b2bOrd.buyerRegion}</strong></span>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => setPreviewB2bManifest(b2bOrd)}
                            className="px-3.5 py-2.5 rounded-xl bg-[#071326] hover:bg-[#0F2547] text-amber-300 border border-amber-500/40 font-black text-xs flex items-center gap-1.5 cursor-pointer"
                          >
                            <Eye className="w-4 h-4" />
                            <span>Hujjatni ko‘rish</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handlePrintOrDownloadB2bPdf(b2bOrd)}
                            className="px-4 py-2.5 rounded-xl bg-sky-500/20 hover:bg-sky-500 hover:text-slate-950 text-sky-300 border border-sky-500/40 font-black text-xs flex items-center gap-1.5 cursor-pointer transition-all"
                          >
                            <Download className="w-4 h-4" />
                            <span>Ro‘yxatni PDF chiqarib olish</span>
                          </button>

                          {/* 1-BOSQICH: So'rov kelganda qabul qilish va B2C kabinetga Hisob raqam ma'lumotlarini jo'natish */}
                          {b2bOrd.status === 'requested' && (
                            <div className="w-full sm:w-auto flex flex-col gap-2 p-3 rounded-2xl bg-[#071326] border-2 border-amber-500/60 min-w-[290px]">
                              <label className="text-[10px] font-black text-amber-300 uppercase">
                                B2C kabinetga Hisob raqam ma'lumotlarini jo‘natish:
                              </label>
                              <input
                                type="text"
                                value={
                                  b2bBankAccountInputs[b2bOrd.id] !== undefined
                                    ? b2bBankAccountInputs[b2bOrd.id]
                                    : b2bOrd.bankAccountDetails || getDefaultB2bBankAccountText(b2bOrd)
                                }
                                onChange={(e) => {
                                  setB2bBankAccountInputs((prev) => ({
                                    ...prev,
                                    [b2bOrd.id]: e.target.value,
                                  }));
                                  if (b2bBankAccountErrors[b2bOrd.id]) {
                                    setB2bBankAccountErrors((prev) => {
                                      const n = { ...prev };
                                      delete n[b2bOrd.id];
                                      return n;
                                    });
                                  }
                                }}
                                placeholder="H/R: 2020 8000 ... | MFO: ... | Bank nomi..."
                                className="w-full px-3 py-2 rounded-xl bg-[#0A1931] border border-amber-500/50 focus:border-emerald-400 text-white font-mono text-xs focus:outline-none"
                              />
                              {b2bBankAccountErrors[b2bOrd.id] && (
                                <span className="text-[10px] text-red-400 font-bold block">
                                  {b2bBankAccountErrors[b2bOrd.id]}
                                </span>
                              )}
                              <button
                                type="button"
                                onClick={() => handleAcceptB2bRequestAndSendBankDetails(b2bOrd.id)}
                                className="w-full px-4 py-2.5 rounded-xl bg-[#FFB800] hover:bg-[#FFC928] text-slate-950 font-black text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow-lg shadow-amber-500/30 active:scale-95 transition-all"
                              >
                                <CheckCircle2 className="w-4 h-4 stroke-[2.5]" />
                                <span>So‘rovni qabul qilish va Hisob raqam jo‘natish</span>
                              </button>
                            </div>
                          )}

                          {/* 2-BOSQICH: So'rov qabul qilindi va Hisob raqam jo'natildi -> B2C to'lovi kutilmoqda */}
                          {b2bOrd.status === 'approved_awaiting_payment' && (
                            <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/40 text-xs space-y-1 max-w-md">
                              <div className="text-amber-300 font-black flex items-center gap-1.5">
                                <Clock className="w-3.5 h-3.5 shrink-0" />
                                <span>So‘rov qabul qilindi — B2C kabinet to‘lovi kutilmoqda</span>
                              </div>
                              {b2bOrd.bankAccountDetails && (
                                <div className="text-[11px] font-mono text-emerald-300 bg-[#071326] px-2.5 py-1.5 rounded-lg border border-[#1E3A6D]">
                                  Jo‘natilgan hisob raqam: {b2bOrd.bankAccountDetails}
                                </div>
                              )}
                              <div className="text-[10px] text-sky-200">
                                B2C kabinet to‘lovni jo‘natgach, tayyorlash va manzilga yuborish jarayoni davom etadi.
                              </div>
                            </div>
                          )}

                          {/* 3-BOSQICH: B2C kabinet to'lovni jo'natdi -> Jarayon davom etadi ("Mahsulotlarni tayyorlash jarayoni") */}
                          {b2bOrd.status === 'paid' && (
                            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 p-3 rounded-2xl bg-emerald-500/15 border-2 border-emerald-400">
                              <div className="text-xs">
                                <span className="text-emerald-300 font-black block">
                                  💳 B2C kabinet to‘lovni jo‘natdi!
                                </span>
                                <span className="text-[11px] text-sky-100 block">
                                  Endi mahsulotlarni tayyorlash jarayonini boshlang:
                                </span>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleStartPreparingB2bOrder(b2bOrd.id)}
                                className="px-5 py-2.5 rounded-xl bg-[#FFB800] hover:bg-[#FFC928] text-slate-950 font-black text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow-lg shadow-amber-500/30 active:scale-95 transition-all"
                              >
                                <Package className="w-4 h-4 stroke-[2.5]" />
                                <span>Mahsulotlarni tayyorlash jarayoni</span>
                              </button>
                            </div>
                          )}

                          {/* 4-BOSQICH: Tayyorlash jarayonida -> Yetkazib beruvchi nomerini kiritib Manzilga yuborish */}
                          {b2bOrd.status === 'preparing' && (
                            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 p-2.5 rounded-2xl bg-[#071326] border border-amber-500/40">
                              <div className="space-y-1">
                                <label className="text-[10px] font-bold text-amber-300 block">
                                  Yetkazib beruvchi nomeri:
                                </label>
                                <input
                                  type="text"
                                  value={
                                    driverPhoneInputs[b2bOrd.id] !== undefined
                                      ? driverPhoneInputs[b2bOrd.id]
                                      : b2bOrd.driverPhone || '+998 '
                                  }
                                  onChange={(e) => {
                                    setDriverPhoneInputs((prev) => ({
                                      ...prev,
                                      [b2bOrd.id]: formatUzPhoneInput(e.target.value),
                                    }));
                                    if (driverPhoneErrors[b2bOrd.id]) {
                                      setDriverPhoneErrors((prev) => {
                                        const n = { ...prev };
                                        delete n[b2bOrd.id];
                                        return n;
                                      });
                                    }
                                  }}
                                  placeholder="+998 90 123 45 67"
                                  className="px-3 py-1.5 rounded-xl bg-[#0A1931] border border-amber-500/50 focus:border-emerald-400 text-white font-mono text-xs focus:outline-none"
                                />
                                {driverPhoneErrors[b2bOrd.id] && (
                                  <span className="text-[10px] text-red-400 font-bold block">
                                    {driverPhoneErrors[b2bOrd.id]}
                                  </span>
                                )}
                              </div>
                              <button
                                type="button"
                                onClick={() => handleShipB2bOrderWithDriverPhone(b2bOrd.id, b2bOrd.driverPhone)}
                                className="px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow-lg active:scale-95 transition-all"
                              >
                                <Truck className="w-4 h-4 stroke-[2.5]" />
                                <span>Mahsulotni manzilga yuborish</span>
                              </button>
                            </div>
                          )}

                          {/* 5-BOSQICH: Yetkazilmoqda */}
                          {(b2bOrd.status === 'in_transit' || b2bOrd.status === 'paid_shipped') && (
                            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 px-3.5 py-2 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-xs">
                              <div>
                                <span className="text-sky-300 font-black block">🚚 Yetkazilmoqda</span>
                                {b2bOrd.driverPhone && (
                                  <span className="text-emerald-400 font-mono font-black block">
                                    Bog‘lanish uchun tel nomer: {b2bOrd.driverPhone}
                                  </span>
                                )}
                              </div>
                              <button
                                type="button"
                                onClick={() => handleMarkB2bOrderDelivered(b2bOrd.id)}
                                className="px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-[11px] cursor-pointer transition-colors"
                              >
                                ✓ Yetkazildi deb belgilash
                              </button>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Olinayotgan yuklar jadvali */}
                      <div className="overflow-x-auto rounded-2xl border border-[#1E3A6D]">
                        <table className="w-full text-left text-xs text-slate-200">
                          <thead className="bg-[#071326] text-sky-200 uppercase text-[10px]">
                            <tr>
                              <th className="py-2.5 px-3 font-black">№</th>
                              <th className="py-2.5 px-3 font-black">Olinayotgan Yuk (Mahsulot)</th>
                              <th className="py-2.5 px-3 font-black">Xususiyat / Rang</th>
                              <th className="py-2.5 px-3 font-black">Miqdori</th>
                              <th className="py-2.5 px-3 font-black">Narxi</th>
                              <th className="py-2.5 px-3 font-black text-right">Jami Summa</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#1E3A6D]/70 bg-[#0A1931]">
                            {b2bOrd.items.map((item, idx) => (
                              <tr key={`${b2bOrd.id}-${idx}`}>
                                <td className="py-2.5 px-3 font-mono font-bold text-amber-400">{idx + 1}</td>
                                <td className="py-2.5 px-3 font-bold text-white">{item.title}</td>
                                <td className="py-2.5 px-3 text-sky-100">
                                  {[item.specification, item.color].filter(Boolean).join(' • ') || 'Standart'}
                                </td>
                                <td className="py-2.5 px-3 font-mono font-black text-amber-300">
                                  {item.quantity} {item.unit}
                                </td>
                                <td className="py-2.5 px-3 font-mono">{formatPrice(item.price)}</td>
                                <td className="py-2.5 px-3 font-mono font-black text-emerald-400 text-right">
                                  {formatPrice(item.totalSum)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      <div className="flex items-center justify-between pt-2 text-xs">
                        <span className="text-sky-200">
                          Jami yuk turlari: <strong className="text-white">{b2bOrd.items.length} xil</strong>
                        </span>
                        <div className="text-sm sm:text-base font-black text-white">
                          Jami B2B Hisob Summasi:{' '}
                          <span className="text-emerald-400 font-mono">{formatPrice(b2bOrd.totalAmount)}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )
            )}
          </div>
        )}

        {/* Tab: B2B buyurtmalar (B2B Kabineti uchun) */}
        {activeTab === 'b2b_orders' && (
          <div className="space-y-6 mt-2.5 sm:mt-0 animate-fadeIn">
            <div className="bg-[#0A1931] border-2 border-[#1E3A6D] rounded-3xl p-5 sm:p-6 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 shadow-2xl">
              <div className="flex items-center gap-3.5">
                <div className="p-3 rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
                  <Building className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-lg sm:text-xl font-black text-white">B2B mijoz so‘rovlari</h2>
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-amber-500/20 text-amber-300 border border-amber-500/40">
                      B2B va B2C kabinetlardan
                    </span>
                  </div>
                  <p className="text-xs text-sky-200 mt-0.5">
                    B2B va B2C kabinetlardan kelgan mahsulot so‘rovlari, hisob raqam jo‘natish, tayyorlash jarayoni va manzilga yuborish ({incomingManufacturerB2bOrders.length} ta)
                  </p>
                </div>
              </div>
              <div className="px-4 py-2 rounded-2xl bg-[#FFB800]/15 border border-[#FFB800]/40 text-[#FFB800] text-xs font-mono font-black shrink-0 self-start sm:self-auto">
                Jami B2B so‘rovlar: {incomingManufacturerB2bOrders.length} ta
              </div>
            </div>

            {incomingManufacturerB2bOrders.length === 0 ? (
              <div className="text-center py-16 bg-[#0A1931] rounded-3xl border-2 border-[#1E3A6D] p-8 space-y-3 shadow-2xl">
                <Building className="w-12 h-12 text-amber-400 mx-auto" />
                <p className="text-white font-bold text-sm">
                  Hozircha B2B va B2C kabinetlardan so‘rovlar kelib tushmagan.
                </p>
                <p className="text-sky-200 text-xs max-w-md mx-auto">
                  B2C kabinetlar sizning mahsulotlaringizni savatga yuklab «So‘rov yuborish» tugmasini bosganda, buyurtmalar korxona ma'lumotlari va PDF ro‘yxati bilan shu yerda ko‘rinadi.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {incomingManufacturerB2bOrders.map((b2bOrd) => (
                  <div
                    key={b2bOrd.id}
                    className="bg-[#0A1931] border-2 border-[#1E3A6D] hover:border-amber-500/50 rounded-3xl p-5 sm:p-6 space-y-4 shadow-2xl transition-all"
                  >
                    <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4 pb-4 border-b border-[#1E3A6D]">
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="px-2.5 py-0.5 rounded-lg bg-amber-500/20 text-[#FFB800] border border-amber-500/40 font-mono font-black text-xs">
                            #{b2bOrd.id}
                          </span>
                          <span className="text-xs text-sky-200 font-mono">
                            {new Date(b2bOrd.createdAt).toLocaleString('uz-UZ')}
                          </span>
                          {b2bOrd.status === 'requested' && (
                            <span className="px-3 py-0.5 rounded-full text-[10px] font-black uppercase bg-amber-500 text-slate-950 animate-pulse">
                              🔔 Yangi B2C So‘rov (Qabul qilish kutilmoqda)
                            </span>
                          )}
                          {b2bOrd.status === 'approved_awaiting_payment' && (
                            <span className="px-3 py-0.5 rounded-full text-[10px] font-black uppercase bg-amber-500/20 text-amber-300 border border-amber-400/50 animate-pulse">
                              ⏳ So‘rov qabul qilindi — B2C to‘lovi kutilmoqda
                            </span>
                          )}
                          {b2bOrd.status === 'paid' && (
                            <span className="px-3 py-0.5 rounded-full text-[10px] font-black uppercase bg-emerald-500 text-slate-950 animate-pulse">
                              💳 To‘lov qilindi — Tayyorlashni boshlang!
                            </span>
                          )}
                          {b2bOrd.status === 'preparing' && (
                            <span className="px-3 py-0.5 rounded-full text-[10px] font-black uppercase bg-amber-500/20 text-amber-300 border border-amber-400/50 animate-pulse">
                              📦 Mahsulot yuklash jarayonida
                            </span>
                          )}
                          {(b2bOrd.status === 'in_transit' || b2bOrd.status === 'paid_shipped') && (
                            <span className="px-3 py-0.5 rounded-full text-[10px] font-black uppercase bg-sky-500/20 text-sky-300 border border-sky-400/40">
                              🚚 Yetkazilmoqda
                            </span>
                          )}
                          {b2bOrd.status === 'delivered' && (
                            <span className="px-3 py-0.5 rounded-full text-[10px] font-black uppercase bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
                              ✅ Yetkazilgan (Yakunlangan)
                            </span>
                          )}
                        </div>

                        <h3 className="text-base sm:text-lg font-black text-white flex items-center gap-2">
                          <Building className="w-5 h-5 text-[#FFB800] shrink-0" />
                          <span>So‘rov yuborgan B2C kabinet: «{b2bOrd.buyerCompanyName}»</span>
                        </h3>

                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-sky-100">
                          <span>STIR: <strong className="text-[#FFB800] font-mono">{b2bOrd.buyerInn || '—'}</strong></span>
                          <span>Rahbar: <strong className="text-white">{b2bOrd.buyerDirector || '—'}</strong></span>
                          <span>Tel: <strong className="text-emerald-400 font-mono">{b2bOrd.buyerPhone}</strong></span>
                          <span>Manzil: <strong className="text-sky-300">{b2bOrd.buyerAddress || b2bOrd.buyerRegion}</strong></span>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => setPreviewB2bManifest(b2bOrd)}
                          className="px-3.5 py-2.5 rounded-xl bg-[#071326] hover:bg-[#0F2547] text-amber-300 border border-amber-500/40 font-black text-xs flex items-center gap-1.5 cursor-pointer"
                        >
                          <Eye className="w-4 h-4" />
                          <span>Hujjatni ko‘rish</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handlePrintOrDownloadB2bPdf(b2bOrd)}
                          className="px-4 py-2.5 rounded-xl bg-sky-500/20 hover:bg-sky-500 hover:text-slate-950 text-sky-300 border border-sky-500/40 font-black text-xs flex items-center gap-1.5 cursor-pointer transition-all"
                        >
                          <Download className="w-4 h-4" />
                          <span>Ro‘yxatni PDF chiqarib olish</span>
                        </button>

                        {b2bOrd.status === 'requested' && (
                          <div className="w-full sm:w-auto flex flex-col gap-2 p-3 rounded-2xl bg-[#071326] border-2 border-amber-500/60 min-w-[290px]">
                            <label className="text-[10px] font-black text-amber-300 uppercase">
                              B2C kabinetga Hisob raqam ma'lumotlarini jo‘natish:
                            </label>
                            <input
                              type="text"
                              value={
                                b2bBankAccountInputs[b2bOrd.id] !== undefined
                                  ? b2bBankAccountInputs[b2bOrd.id]
                                  : b2bOrd.bankAccountDetails || getDefaultB2bBankAccountText(b2bOrd)
                              }
                              onChange={(e) => {
                                setB2bBankAccountInputs((prev) => ({
                                  ...prev,
                                  [b2bOrd.id]: e.target.value,
                                }));
                                if (b2bBankAccountErrors[b2bOrd.id]) {
                                  setB2bBankAccountErrors((prev) => {
                                    const n = { ...prev };
                                    delete n[b2bOrd.id];
                                    return n;
                                  });
                                }
                              }}
                              placeholder="H/R: 2020 8000 ... | MFO: ... | Bank nomi..."
                              className="w-full px-3 py-2 rounded-xl bg-[#0A1931] border border-amber-500/50 focus:border-emerald-400 text-white font-mono text-xs focus:outline-none"
                            />
                            {b2bBankAccountErrors[b2bOrd.id] && (
                              <span className="text-[10px] text-red-400 font-bold block">
                                {b2bBankAccountErrors[b2bOrd.id]}
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={() => handleAcceptB2bRequestAndSendBankDetails(b2bOrd.id)}
                              className="w-full px-4 py-2.5 rounded-xl bg-[#FFB800] hover:bg-[#FFC928] text-slate-950 font-black text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow-lg shadow-amber-500/30 active:scale-95 transition-all"
                            >
                              <CheckCircle2 className="w-4 h-4 stroke-[2.5]" />
                              <span>So‘rovni qabul qilish va Hisob raqam jo‘natish</span>
                            </button>
                          </div>
                        )}

                        {b2bOrd.status === 'approved_awaiting_payment' && (
                          <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/40 text-xs space-y-1 max-w-md">
                            <div className="text-amber-300 font-black flex items-center gap-1.5">
                              <Clock className="w-3.5 h-3.5 shrink-0" />
                              <span>So‘rov qabul qilindi — B2C kabinet to‘lovi kutilmoqda</span>
                            </div>
                            {b2bOrd.bankAccountDetails && (
                              <div className="text-[11px] font-mono text-emerald-300 bg-[#071326] px-2.5 py-1.5 rounded-lg border border-[#1E3A6D]">
                                Jo‘natilgan hisob raqam: {b2bOrd.bankAccountDetails}
                              </div>
                            )}
                          </div>
                        )}

                        {b2bOrd.status === 'paid' && (
                          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 p-3 rounded-2xl bg-emerald-500/15 border-2 border-emerald-400">
                            <div className="text-xs">
                              <span className="text-emerald-300 font-black block">
                                💳 B2C kabinet to‘lovni jo‘natdi!
                              </span>
                              <span className="text-[11px] text-sky-100 block">
                                Endi mahsulotlarni tayyorlash jarayonini boshlang:
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleStartPreparingB2bOrder(b2bOrd.id)}
                              className="px-5 py-2.5 rounded-xl bg-[#FFB800] hover:bg-[#FFC928] text-slate-950 font-black text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow-lg shadow-amber-500/30 active:scale-95 transition-all"
                            >
                              <Package className="w-4 h-4 stroke-[2.5]" />
                              <span>Mahsulotlarni tayyorlash jarayoni</span>
                            </button>
                          </div>
                        )}

                        {b2bOrd.status === 'preparing' && (
                          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 p-2.5 rounded-2xl bg-[#071326] border border-amber-500/40">
                            <div className="space-y-1">
                              <label className="text-[10px] font-bold text-amber-300 block">
                                Yetkazib beruvchi nomeri:
                              </label>
                              <input
                                type="text"
                                value={
                                  driverPhoneInputs[b2bOrd.id] !== undefined
                                    ? driverPhoneInputs[b2bOrd.id]
                                    : b2bOrd.driverPhone || '+998 '
                                }
                                onChange={(e) => {
                                  setDriverPhoneInputs((prev) => ({
                                    ...prev,
                                    [b2bOrd.id]: formatUzPhoneInput(e.target.value),
                                  }));
                                  if (driverPhoneErrors[b2bOrd.id]) {
                                    setDriverPhoneErrors((prev) => {
                                      const n = { ...prev };
                                      delete n[b2bOrd.id];
                                      return n;
                                    });
                                  }
                                }}
                                placeholder="+998 90 123 45 67"
                                className="px-3 py-1.5 rounded-xl bg-[#0A1931] border border-amber-500/50 focus:border-emerald-400 text-white font-mono text-xs focus:outline-none"
                              />
                              {driverPhoneErrors[b2bOrd.id] && (
                                <span className="text-[10px] text-red-400 font-bold block">
                                  {driverPhoneErrors[b2bOrd.id]}
                                </span>
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={() => handleShipB2bOrderWithDriverPhone(b2bOrd.id, b2bOrd.driverPhone)}
                              className="px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow-lg active:scale-95 transition-all"
                            >
                              <Truck className="w-4 h-4 stroke-[2.5]" />
                              <span>Mahsulotni manzilga yuborish</span>
                            </button>
                          </div>
                        )}

                        {(b2bOrd.status === 'in_transit' || b2bOrd.status === 'paid_shipped') && (
                          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 px-3.5 py-2 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-xs">
                            <div>
                              <span className="text-sky-300 font-black block">🚚 Yetkazilmoqda</span>
                              {b2bOrd.driverPhone && (
                                <span className="text-emerald-400 font-mono font-black block">
                                  Bog‘lanish uchun tel nomer: {b2bOrd.driverPhone}
                                </span>
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={() => handleMarkB2bOrderDelivered(b2bOrd.id)}
                              className="px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-[11px] cursor-pointer transition-colors"
                            >
                              ✓ Yetkazildi deb belgilash
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="overflow-x-auto rounded-2xl border border-[#1E3A6D]">
                      <table className="w-full text-left text-xs text-slate-200">
                        <thead className="bg-[#071326] text-sky-200 uppercase text-[10px]">
                          <tr>
                            <th className="py-2.5 px-3 font-black">№</th>
                            <th className="py-2.5 px-3 font-black">Olinayotgan Yuk (Mahsulot)</th>
                            <th className="py-2.5 px-3 font-black">Xususiyat / Rang</th>
                            <th className="py-2.5 px-3 font-black">Miqdori</th>
                            <th className="py-2.5 px-3 font-black">Narxi</th>
                            <th className="py-2.5 px-3 font-black text-right">Jami Summa</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#1E3A6D]/70 bg-[#0A1931]">
                          {b2bOrd.items.map((item, idx) => (
                            <tr key={`${b2bOrd.id}-${idx}`}>
                              <td className="py-2.5 px-3 font-mono font-bold text-amber-400">{idx + 1}</td>
                              <td className="py-2.5 px-3 font-bold text-white">{item.title}</td>
                              <td className="py-2.5 px-3 text-sky-100">
                                {[item.specification, item.color].filter(Boolean).join(' • ') || 'Standart'}
                              </td>
                              <td className="py-2.5 px-3 font-mono font-black text-amber-300">
                                {item.quantity} {item.unit}
                              </td>
                              <td className="py-2.5 px-3 font-mono">{formatPrice(item.price)}</td>
                              <td className="py-2.5 px-3 font-mono font-black text-emerald-400 text-right">
                                {formatPrice(item.totalSum)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div className="flex items-center justify-between pt-2 text-xs">
                      <span className="text-sky-200">
                        Jami yuk turlari: <strong className="text-white">{b2bOrd.items.length} xil</strong>
                      </span>
                      <div className="text-sm sm:text-base font-black text-white">
                        Jami B2B Hisob Summasi:{' '}
                        <span className="text-emerald-400 font-mono">{formatPrice(b2bOrd.totalAmount)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab 5: B2B Mahsulotlar (B2C Kabinetida B2B kabinetlardan ulgurji xarid qilish bo'limi) */}
        {activeTab === 'b2b_manufacturers' && (
          <div className="space-y-6 mt-2.5 sm:mt-0 animate-fadeIn">
            {/* Header banner with Buyurtmalarim button */}
            <div className="bg-[#0A1931] border-2 border-[#1E3A6D] rounded-3xl p-5 sm:p-6 space-y-5 shadow-2xl">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3.5">
                  <div className="p-3 rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
                    <Building className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-lg sm:text-xl font-black text-white">B2B ta'minotchilar</h2>
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-amber-500/20 text-amber-300 border border-amber-500/40">
                        B2C ↔ B2B Savdo
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Mahsulot tanlang → B2B Savatga yuklang → B2B ta'minotchiga so‘rov yuboring → Tasdiqlangach pulni hisobga o‘tkazing va yuk manzilingizga yuboriladi ({manufacturerProducts.length} ta B2B mahsulot)
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => setIsB2bMyOrdersOpen((prev) => !prev)}
                    className={`flex items-center justify-center gap-2 px-5 py-3.5 rounded-2xl font-black text-xs cursor-pointer transition-all border shadow-lg ${
                      isB2bMyOrdersOpen
                        ? 'bg-[#FFB800] text-slate-950 border-amber-300 shadow-amber-500/30'
                        : awaitingPaymentB2bCount > 0
                        ? 'bg-gradient-to-r from-amber-500 via-emerald-500 to-amber-500 text-slate-950 border-amber-300 shadow-[0_0_20px_rgba(255,184,0,0.5)] animate-pulse'
                        : b2bCart.length > 0 || myOutgoingB2bOrders.length > 0
                        ? 'bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-400 shadow-emerald-500/25'
                        : 'bg-[#0F2547] hover:bg-[#16335F] text-white border-[#1E3A6D]'
                    }`}
                  >
                    <ShoppingCart className="w-4 h-4" />
                    <span>Buyurtmalarim</span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-black ${
                        isB2bMyOrdersOpen
                          ? 'bg-slate-950 text-[#FFB800]'
                          : 'bg-slate-950/80 text-amber-300'
                      }`}
                    >
                      {myOutgoingB2bOrders.length + (b2bCart.length > 0 ? 1 : 0)}
                    </span>
                  </button>
                </div>
              </div>

              {/* Buyurtmalarim Paneli: Sotib olinayotgan va Sotib olingan mahsulotlar holati + B2B Savat */}
              {isB2bMyOrdersOpen && (() => {
                const buyingOrders = myOutgoingB2bOrders.filter(
                  (o) =>
                    o.status === 'requested' ||
                    o.status === 'approved_awaiting_payment' ||
                    o.status === 'paid' ||
                    o.status === 'preparing' ||
                    o.status === 'in_transit'
                );
                const boughtOrders = myOutgoingB2bOrders.filter(
                  (o) => o.status === 'paid_shipped' || o.status === 'delivered'
                );
                const displayedB2bOrders =
                  b2bMyOrdersTab === 'buying'
                    ? buyingOrders
                    : b2bMyOrdersTab === 'bought'
                    ? boughtOrders
                    : myOutgoingB2bOrders;

                return (
                  <div className="pt-4 border-t border-slate-800 space-y-5 animate-fadeIn">
                    {/* B2B Savatda yuborishga tayyor mahsulotlar bo'lsa ko'rsatiladi */}
                    {b2bCart.length > 0 && (
                      <div className="p-4 sm:p-5 rounded-2xl bg-slate-900 border-2 border-amber-500/50 space-y-4">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-800">
                          <div className="flex items-center gap-2.5">
                            <ShoppingCart className="w-5 h-5 text-[#FFB800]" />
                            <div>
                              <h4 className="text-sm sm:text-base font-black text-white">
                                B2B Savat — So‘rov yuborishga tayyor mahsulotlar ({b2bCart.length} xil)
                              </h4>
                              <p className="text-[11px] text-slate-400">
                                B2B ta'minotchiga so‘rov yuborish uchun quyidagi tugmani bosing
                              </p>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => setB2bCart([])}
                            className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white border border-blue-400 font-bold text-xs cursor-pointer self-start sm:self-auto"
                          >
                            Savatni tozalash
                          </button>
                        </div>

                        <div className="overflow-x-auto rounded-xl border border-slate-800">
                          <table className="w-full text-left text-xs text-slate-200">
                            <thead className="bg-slate-950 text-slate-400 uppercase text-[10px]">
                              <tr>
                                <th className="py-2 px-3 font-black">№</th>
                                <th className="py-2 px-3 font-black">Mahsulot</th>
                                <th className="py-2 px-3 font-black">B2B Ta'minotchi</th>
                                <th className="py-2 px-3 font-black">Variant / Rang</th>
                                <th className="py-2 px-3 font-black">Miqdori</th>
                                <th className="py-2 px-3 font-black">Narxi</th>
                                <th className="py-2 px-3 font-black text-right">Jami</th>
                                <th className="py-2 px-3 font-black text-right">Amal</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800 bg-slate-900">
                              {b2bCart.map((item, i) => (
                                <tr key={item.key}>
                                  <td className="py-2 px-3 font-mono font-bold text-amber-400">{i + 1}</td>
                                  <td className="py-2 px-3 font-bold text-white">{item.product.title}</td>
                                  <td className="py-2 px-3 text-amber-300 font-bold">{item.product.supplierName}</td>
                                  <td className="py-2 px-3 text-slate-300">
                                    {[item.specification, item.color].filter(Boolean).join(' • ') || item.unit}
                                  </td>
                                  <td className="py-2 px-3 font-mono font-black text-amber-400">
                                    <div className="inline-flex items-center gap-1 bg-slate-950 border border-slate-700 rounded-lg px-1.5 py-0.5">
                                      <button
                                        type="button"
                                        disabled={item.quantity <= Math.max(1, Number(item.product.minOrder) || 1)}
                                        onClick={() => {
                                          const minQ = Math.max(1, Number(item.product.minOrder) || 1);
                                          setB2bCart((prev) =>
                                            prev.map((x) =>
                                              x.key === item.key ? { ...x, quantity: Math.max(minQ, x.quantity - 1) } : x
                                            )
                                          );
                                        }}
                                        className="px-1 text-slate-300 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                                      >
                                        -
                                      </button>
                                      <span>
                                        {item.quantity} {item.unit}
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setB2bCart((prev) =>
                                            prev.map((x) => (x.key === item.key ? { ...x, quantity: x.quantity + 1 } : x))
                                          )
                                        }
                                        className="px-1 text-emerald-400 hover:text-emerald-300 cursor-pointer"
                                      >
                                        +
                                      </button>
                                    </div>
                                  </td>
                                  <td className="py-2 px-3 font-mono">{formatPrice(item.price)}</td>
                                  <td className="py-2 px-3 font-mono font-black text-emerald-400 text-right">
                                    {formatPrice(item.price * item.quantity)}
                                  </td>
                                  <td className="py-2 px-3 text-right">
                                    <button
                                      type="button"
                                      onClick={() => setB2bCart((prev) => prev.filter((x) => x.key !== item.key))}
                                      className="text-red-400 hover:text-red-300 p-1 cursor-pointer"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>

                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
                          <div className="text-sm font-black text-white">
                            B2B Savat Jami:{' '}
                            <span className="text-emerald-400 font-mono">
                              {formatPrice(b2bCart.reduce((s, it) => s + it.price * it.quantity, 0))}
                            </span>
                          </div>
                          <div className="flex flex-wrap items-center gap-2.5">
                            <button
                              type="button"
                              onClick={() => {
                                const draft = buildDraftB2bManifestFromCart();
                                if (draft) handlePrintOrDownloadB2bPdf(draft);
                              }}
                              className="px-4 py-2.5 rounded-xl bg-sky-500/20 hover:bg-sky-500 hover:text-slate-950 text-sky-300 border border-sky-500/40 font-black text-xs flex items-center gap-1.5 cursor-pointer transition-all"
                            >
                              <Download className="w-4 h-4" />
                              <span>Ro‘yxatni PDF chiqarib olish</span>
                            </button>
                            <button
                              type="button"
                              onClick={handleSendB2bRequest}
                              className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs flex items-center gap-1.5 cursor-pointer shadow-lg shadow-emerald-500/25 active:scale-95 transition-all"
                            >
                              <Send className="w-4 h-4" />
                              <span>B2B ta'minotchiga so‘rov yuborish</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Filter tabs: Barchasi | Sotib olinayotgan mahsulotlar | Sotib olingan mahsulotlar */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setB2bMyOrdersTab('all')}
                          className={`px-4 py-2 rounded-xl text-xs font-black cursor-pointer transition-all border ${
                            b2bMyOrdersTab === 'all'
                              ? 'bg-[#FFB800] text-slate-950 border-amber-300'
                              : 'bg-slate-900 text-slate-300 border-slate-800 hover:border-slate-700'
                          }`}
                        >
                          Barchasi ({myOutgoingB2bOrders.length})
                        </button>
                        <button
                          type="button"
                          onClick={() => setB2bMyOrdersTab('buying')}
                          className={`px-4 py-2 rounded-xl text-xs font-black cursor-pointer transition-all border ${
                            b2bMyOrdersTab === 'buying'
                              ? 'bg-amber-500 text-slate-950 border-amber-300'
                              : 'bg-slate-900 text-amber-300 border-amber-500/30 hover:border-amber-400'
                          }`}
                        >
                          Sotib olinayotgan mahsulotlar ({buyingOrders.length})
                        </button>
                        <button
                          type="button"
                          onClick={() => setB2bMyOrdersTab('bought')}
                          className={`px-4 py-2 rounded-xl text-xs font-black cursor-pointer transition-all border ${
                            b2bMyOrdersTab === 'bought'
                              ? 'bg-emerald-500 text-slate-950 border-emerald-300'
                              : 'bg-slate-900 text-emerald-300 border-emerald-500/30 hover:border-emerald-400'
                          }`}
                        >
                          Sotib olingan mahsulotlar ({boughtOrders.length})
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => setIsB2bMyOrdersOpen(false)}
                        className="text-xs font-bold text-slate-400 hover:text-white cursor-pointer self-end sm:self-auto"
                      >
                        Yopish ▲
                      </button>
                    </div>

                    {displayedB2bOrders.length === 0 ? (
                      <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 text-center text-xs text-slate-400">
                        {b2bMyOrdersTab === 'buying'
                          ? 'Hozircha sotib olinayotgan jarayondagi mahsulotlar yo‘q.'
                          : b2bMyOrdersTab === 'bought'
                          ? 'Hozircha sotib olingan (yakunlangan) mahsulotlar yo‘q.'
                          : 'Siz tomoningizdan yuborilgan mahsulot so‘rovlari hozircha yo‘q.'}
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {displayedB2bOrders.map((ord) => {
                          const isCompleted = ord.status === 'paid_shipped' || ord.status === 'delivered';
                          const bankInfoText = ord.bankAccountDetails || getDefaultB2bBankAccountText(ord);
                          return (
                            <div
                              key={ord.id}
                              className={`p-4 rounded-2xl border-2 space-y-3 transition-all ${
                                ord.status === 'approved_awaiting_payment'
                                  ? 'bg-amber-500/15 border-amber-400 shadow-[0_0_24px_rgba(255,184,0,0.35)]'
                                  : ord.status === 'paid' || ord.status === 'preparing'
                                  ? 'bg-amber-500/10 border-amber-400/70 shadow-[0_0_16px_rgba(255,184,0,0.2)]'
                                  : ord.status === 'in_transit'
                                  ? 'bg-sky-500/10 border-sky-400/60 shadow-[0_0_20px_rgba(56,189,248,0.2)]'
                                  : isCompleted
                                  ? 'bg-emerald-500/10 border-emerald-500/50'
                                  : 'bg-slate-900/80 border-slate-800'
                              }`}
                            >
                              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                                <div className="space-y-2 flex-1">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="px-2.5 py-1 rounded-lg bg-slate-950 text-[#FFB800] font-mono font-black text-xs border border-amber-500/40">
                                      #{ord.id}
                                    </span>
                                    <span className="font-black text-white text-sm">
                                      B2B Ta'minotchi: «{ord.manufacturerCompanyName}»
                                    </span>
                                    <span
                                      className={`px-3 py-1 rounded-full text-[11px] font-black uppercase border ${
                                        ord.status === 'requested'
                                          ? 'bg-sky-500/20 text-sky-300 border-sky-500/40'
                                          : ord.status === 'approved_awaiting_payment'
                                          ? 'bg-amber-500 text-slate-950 border-amber-300 animate-pulse'
                                          : ord.status === 'paid'
                                          ? 'bg-emerald-500/25 text-emerald-300 border-emerald-400'
                                          : ord.status === 'preparing'
                                          ? 'bg-amber-500 text-slate-950 border-amber-300 animate-pulse'
                                          : ord.status === 'in_transit'
                                          ? 'bg-sky-500 text-slate-950 border-sky-300'
                                          : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                                      }`}
                                    >
                                      {ord.status === 'requested'
                                        ? 'Sotib olinmoqda — So‘rov yuborilgan (B2B javobi kutilmoqda)'
                                        : ord.status === 'approved_awaiting_payment'
                                        ? '🔔 So‘rov qabul qilindi — To‘lov kutilmoqda!'
                                        : ord.status === 'paid'
                                        ? '💳 To‘lov jo‘natildi — B2B tayyorlashni boshlamoqda'
                                        : ord.status === 'preparing'
                                        ? '📦 Sotib olinmoqda — Mahsulot yuklash jarayonida'
                                        : ord.status === 'in_transit'
                                        ? '🚚 Sotib olinmoqda — Yetkazilmoqda'
                                        : '✅ Sotib olingan (Yetkazilgan)'}
                                    </span>
                                  </div>

                                  <div className="text-xs text-slate-300">
                                    Sana: {new Date(ord.createdAt).toLocaleString('uz-UZ')} • Mahsulotlar:{' '}
                                    <strong className="text-white">
                                      {ord.items.map((it) => `${it.title} (${it.quantity} ${it.unit})`).join(', ')}
                                    </strong>{' '}
                                    • Jami summa:{' '}
                                    <strong className="text-emerald-400 font-mono">{formatPrice(ord.totalAmount)}</strong>
                                  </div>

                                  {/* B2B Kabinet so'rovni qabul qilganda jo'natgan Hisob raqam ma'lumotlari va To'lov tugmasi */}
                                  {ord.status === 'approved_awaiting_payment' && (
                                    <div className="p-3.5 rounded-2xl bg-slate-950 border-2 border-amber-400/80 space-y-2.5">
                                      <div className="flex items-center gap-2 text-amber-300 font-black text-xs">
                                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                                        <span>
                                          Xabar: «{ord.manufacturerCompanyName}» (B2B kabinet) so‘rovingizni qabul qildi va to‘lov uchun Hisob raqam ma'lumotlarini jo‘natdi!
                                        </span>
                                      </div>
                                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                                        <div className="space-y-0.5">
                                          <span className="text-[10px] font-bold uppercase text-slate-400 block">
                                            B2B Kabinet Hisob Raqam Ma'lumotlari:
                                          </span>
                                          <span className="font-mono font-black text-xs sm:text-sm text-emerald-400 block break-all">
                                            {bankInfoText}
                                          </span>
                                        </div>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            navigator.clipboard?.writeText(bankInfoText);
                                            setCopiedBankOrderId(ord.id);
                                            setTimeout(() => setCopiedBankOrderId(null), 2000);
                                          }}
                                          className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/30 font-bold text-[11px] flex items-center gap-1.5 cursor-pointer shrink-0 self-start sm:self-center"
                                        >
                                          <Copy className="w-3.5 h-3.5" />
                                          <span>{copiedBankOrderId === ord.id ? 'Nusxalandi ✓' : 'Hisob raqamni nusxalash'}</span>
                                        </button>
                                      </div>
                                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1">
                                        <span className="text-[11px] text-slate-300">
                                          To‘lov jo‘natilgach, B2B kabinetda yuklash va manzilga yuborish jarayoni davom etadi.
                                        </span>
                                        <button
                                          type="button"
                                          onClick={() => handleSendB2bPaymentFromB2c(ord.id)}
                                          className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-emerald-500/30 active:scale-95 transition-all shrink-0"
                                        >
                                          <CreditCard className="w-4 h-4 stroke-[2.5]" />
                                          <span>To‘lov qilish (To‘lovni jo‘natish) — {formatPrice(ord.totalAmount)}</span>
                                        </button>
                                      </div>
                                    </div>
                                  )}

                                  {/* To'lov qilingandan keyin ham Hisob raqam ma'lumotlari ko'rinib turadi */}
                                  {ord.status !== 'requested' && ord.status !== 'approved_awaiting_payment' && ord.bankAccountDetails && (
                                    <div className="text-[11px] font-mono text-slate-300 bg-slate-950/80 px-3 py-1.5 rounded-xl border border-slate-800">
                                      <span className="text-emerald-400 font-bold">To‘lov o‘tkazilgan B2B hisob raqam:</span> {ord.bankAccountDetails}
                                    </div>
                                  )}

                                  {(ord.status === 'in_transit' || ord.status === 'paid_shipped') && ord.driverPhone && (
                                    <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-emerald-500/20 border border-emerald-400 text-emerald-300 font-black text-xs">
                                      <Phone className="w-3.5 h-3.5 text-emerald-400" />
                                      <span>Bog‘lanish uchun tel nomer:</span>
                                      <a
                                        href={`tel:${ord.driverPhone}`}
                                        className="font-mono text-white underline hover:text-[#FFB800]"
                                      >
                                        {ord.driverPhone}
                                      </a>
                                    </div>
                                  )}
                                </div>

                                <div className="flex flex-wrap items-center gap-2 shrink-0">
                                  {ord.status === 'in_transit' && (
                                    <button
                                      type="button"
                                      onClick={() => handleMarkB2bOrderDelivered(ord.id)}
                                      className="px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs flex items-center gap-1.5 cursor-pointer shadow-md"
                                    >
                                      <CheckCircle2 className="w-3.5 h-3.5" />
                                      <span>Qabul qilindi (Sotib olindi)</span>
                                    </button>
                                  )}

                                  <button
                                    type="button"
                                    onClick={() => setPreviewB2bManifest(ord)}
                                    className="px-3.5 py-2 rounded-xl bg-slate-950 hover:bg-slate-800 text-amber-300 border border-amber-500/40 font-bold text-xs flex items-center gap-1.5 cursor-pointer"
                                  >
                                    <Eye className="w-3.5 h-3.5" />
                                    <span>Hujjatni ko‘rish</span>
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => handlePrintOrDownloadB2bPdf(ord)}
                                    className="px-3.5 py-2 rounded-xl bg-sky-500/20 hover:bg-sky-500 hover:text-slate-950 text-sky-300 border border-sky-500/40 font-black text-xs flex items-center gap-1.5 cursor-pointer transition-all"
                                  >
                                    <Download className="w-3.5 h-3.5" />
                                    <span>Ro‘yxatni PDF chiqarib olish</span>
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>

            {/* B2B Notice Toast */}
            {b2bNoticeMessage && (
              <div className="p-4 rounded-2xl bg-emerald-500/20 border-2 border-emerald-400 text-emerald-200 text-xs sm:text-sm font-black flex items-center justify-between gap-3 shadow-lg animate-fadeIn">
                <div className="flex items-center gap-2.5">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                  <span>{b2bNoticeMessage}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setB2bNoticeMessage(null)}
                  className="text-emerald-300 hover:text-white p-1 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* B2C Kabinet Bildirishnomasi: B2B kabinet so'rovni qabul qilganda va Hisob raqam ma'lumotlarini jo'natganda chiqadi */}
            {awaitingPaymentB2bCount > 0 && (
              <div className="p-5 rounded-3xl bg-[#0A1931] border-2 border-amber-400 shadow-[0_0_25px_rgba(255,184,0,0.35)] space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-amber-300 font-black text-sm sm:text-base">
                      <AlertCircle className="w-5 h-5 text-[#FFB800] shrink-0 animate-bounce" />
                      <span>
                        🔔 XABAR: B2B kabinet sizning {awaitingPaymentB2bCount} ta mahsulot so‘rovingizni qabul qildi va Hisob raqam ma'lumotlarini jo‘natdi!
                      </span>
                    </div>
                    <p className="text-xs text-sky-200">
                      B2B kabinet yuborgan hisob raqam ma'lumotlari asosida to‘lovni jo‘nating. To‘lov jo‘natilgach mahsulotni tayyorlash va manzilga yetkazish jarayoni davom etadi.
                    </p>
                  </div>
                  {!isB2bMyOrdersOpen && (
                    <button
                      type="button"
                      onClick={() => {
                        setIsB2bMyOrdersOpen(true);
                        setB2bMyOrdersTab('buying');
                      }}
                      className="px-4 py-2.5 rounded-xl bg-[#FFB800] hover:bg-[#FFC928] text-slate-950 font-black text-xs cursor-pointer shrink-0 self-start sm:self-center"
                    >
                      Buyurtmalarimni ochish
                    </button>
                  )}
                </div>

                <div className="space-y-3">
                  {myOutgoingB2bOrders
                    .filter((o) => o.status === 'approved_awaiting_payment')
                    .map((ord) => {
                      const bankInfo = ord.bankAccountDetails || getDefaultB2bBankAccountText(ord);
                      return (
                        <div
                          key={ord.id}
                          className="p-4 rounded-2xl bg-[#071326] border border-amber-500/50 flex flex-col lg:flex-row lg:items-center justify-between gap-3"
                        >
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 flex-wrap text-xs">
                              <span className="px-2 py-0.5 rounded-lg bg-amber-500/20 text-[#FFB800] font-mono font-black border border-amber-500/40">
                                #{ord.id}
                              </span>
                              <span className="font-black text-white">
                                B2B Kabinet: «{ord.manufacturerCompanyName}»
                              </span>
                              <span className="text-emerald-400 font-mono font-black">
                                Summa: {formatPrice(ord.totalAmount)}
                              </span>
                            </div>
                            <div className="text-xs font-mono text-emerald-300 bg-[#0A1931] px-3 py-2 rounded-xl border border-[#1E3A6D] break-all">
                              <strong className="text-amber-300">Hisob raqam ma'lumotlari:</strong> {bankInfo}
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-2 shrink-0">
                            <button
                              type="button"
                              onClick={() => {
                                navigator.clipboard?.writeText(bankInfo);
                                setCopiedBankOrderId(ord.id);
                                setTimeout(() => setCopiedBankOrderId(null), 2000);
                              }}
                              className="px-3.5 py-2.5 rounded-xl bg-[#0A1931] hover:bg-[#0F2547] text-amber-300 border border-amber-500/40 font-bold text-xs flex items-center gap-1.5 cursor-pointer"
                            >
                              <Copy className="w-3.5 h-3.5" />
                              <span>{copiedBankOrderId === ord.id ? 'Nusxalandi ✓' : 'Nusxalash'}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSendB2bPaymentFromB2c(ord.id)}
                              className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs flex items-center gap-1.5 cursor-pointer shadow-lg shadow-emerald-500/25 active:scale-95 transition-all"
                            >
                              <CreditCard className="w-4 h-4 stroke-[2.5]" />
                              <span>To‘lov qilish (To‘lovni jo‘natish)</span>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}

            {/* Search and Category Filter */}
            <div className="bg-[#0A1931] border-2 border-[#1E3A6D] rounded-3xl p-4 sm:p-5 space-y-3 shadow-xl">
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-sky-300 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={b2bSearchQuery}
                    onChange={(e) => setB2bSearchQuery(e.target.value)}
                    placeholder="Ishlab chiqaruvchi zavod nomi, mahsulot nomi yoki hudud bo‘yicha qidirish..."
                    className="w-full pl-10 pr-4 py-3 bg-[#071326] border border-[#1E3A6D] focus:border-amber-500 rounded-2xl text-white placeholder-sky-300/60 text-xs focus:outline-none"
                  />
                </div>
                <select
                  value={b2bCategoryFilter}
                  onChange={(e) => setB2bCategoryFilter(e.target.value)}
                  className="px-4 py-3 bg-[#071326] border border-[#1E3A6D] focus:border-amber-500 rounded-2xl text-white text-xs font-bold focus:outline-none cursor-pointer"
                >
                  <option value="all">Barcha mahsulot turlari ({manufacturerProducts.length})</option>
                  {b2bCategories.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* B2B Mahsulotlar — Bosh paneldagi kabi Katalog va Mahsulot ustiga bosilganda Batafsil oyna (Yon tarafda shu ta'minotchi yuklagan mahsulotlar, pastda boshqa B2B mahsulotlar) */}
            {selectedB2bProduct ? (
              (() => {
                const detailGalleryImages =
                  selectedB2bProduct.images && selectedB2bProduct.images.length > 0
                    ? selectedB2bProduct.images
                    : [selectedB2bProduct.image];
                const safeImgIdx = b2bDetailImgIdx < detailGalleryImages.length ? b2bDetailImgIdx : 0;
                const variantsList =
                  selectedB2bProduct.variants && selectedB2bProduct.variants.length > 0
                    ? selectedB2bProduct.variants
                    : [
                        {
                          id: 'default',
                          unit: selectedB2bProduct.unit,
                          colors: selectedB2bProduct.colors || [],
                          specification: '',
                          price: selectedB2bProduct.price,
                          originalPrice: selectedB2bProduct.originalPrice || selectedB2bProduct.price,
                          minOrder: selectedB2bProduct.minOrder || 1,
                        },
                      ];
                const selectedVarIdx = b2bVariantIdxInputs[selectedB2bProduct.id] ?? 0;
                const activeVar = variantsList[selectedVarIdx] || variantsList[0];
                const varColors =
                  activeVar.colors && activeVar.colors.length > 0
                    ? activeVar.colors
                    : selectedB2bProduct.colors || [];
                const selectedColor = b2bColorInputs[selectedB2bProduct.id] ?? (varColors[0] || '');
                const unitPrice =
                  activeVar.originalPrice || activeVar.price || selectedB2bProduct.originalPrice || selectedB2bProduct.price;
                const minOrd = activeVar.minOrder || selectedB2bProduct.minOrder || 1;
                const currentQty = Math.max(
                  1,
                  b2bQtyInputs[selectedB2bProduct.id] ?? minOrd
                );
                const availStock =
                  selectedB2bProduct.stock !== undefined && selectedB2bProduct.stock !== null
                    ? Number(selectedB2bProduct.stock)
                    : 1000;

                // Yon tarafdan: Korayotgan mahsulotni ishlab chiqarayotgan ta'minotchi yuklagan mahsulotlar ko'rinadi
                const sameSupplierProducts = manufacturerProducts.filter((item) => {
                  const sameId =
                    item.supplierId &&
                    selectedB2bProduct.supplierId &&
                    item.supplierId === selectedB2bProduct.supplierId;
                  const sameInn =
                    item.supplierInn &&
                    selectedB2bProduct.supplierInn &&
                    item.supplierInn === selectedB2bProduct.supplierInn;
                  const sameName =
                    (item.supplierName || '').trim().toLowerCase() ===
                    (selectedB2bProduct.supplierName || '').trim().toLowerCase();
                  return sameId || sameInn || sameName;
                });
                const sidebarSupplierProducts =
                  sameSupplierProducts.filter((item) => item.id !== selectedB2bProduct.id).length > 0
                    ? sameSupplierProducts.filter((item) => item.id !== selectedB2bProduct.id)
                    : sameSupplierProducts;

                // Pastki qismdan: Platformadagi boshqa B2B mahsulotlari
                const bottomOtherB2bProducts = manufacturerProducts.filter(
                  (item) => item.id !== selectedB2bProduct.id
                );

                return (
                  <div className="space-y-6 animate-fadeIn">
                    <div className="bg-[#0A1931] border-2 border-[#1E3A6D] rounded-3xl overflow-hidden shadow-2xl">
                      {/* Top Header */}
                      <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 border-b border-[#1E3A6D] bg-[#071326]">
                        <div className="flex items-center gap-2 text-xs sm:text-sm font-black text-white">
                          <Building className="w-4 h-4 text-[#FFB800] shrink-0" />
                          <span>Ta'minotchi: {selectedB2bProduct.supplierName}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setSelectedB2bProduct(null)}
                          className="px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white border border-blue-400 font-black text-xs flex items-center gap-1.5 cursor-pointer transition-colors"
                        >
                          <X className="w-4 h-4" />
                          <span>Yopish</span>
                        </button>
                      </div>

                      <div className="p-4 sm:p-6">
                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                          {/* LEFT COLUMN (9 cols): Gallery + Order Box + Description */}
                          <div className="lg:col-span-9 space-y-5">
                            <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-stretch">
                              {/* Image Gallery (5 cols) */}
                              <div className="md:col-span-5 flex flex-col gap-2.5">
                                <div className="relative h-64 sm:h-72 rounded-2xl overflow-hidden bg-[#071326] border-2 border-[#1E3A6D] group">
                                  <img
                                    src={detailGalleryImages[safeImgIdx]}
                                    alt={selectedB2bProduct.title}
                                    onClick={() => setB2bZoomedImage(detailGalleryImages[safeImgIdx])}
                                    className="w-full h-full object-cover cursor-zoom-in transition-transform duration-300 group-hover:scale-105"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => setB2bZoomedImage(detailGalleryImages[safeImgIdx])}
                                    className="absolute bottom-2.5 right-2.5 px-2.5 py-1.5 rounded-lg bg-[#071326]/90 hover:bg-[#FFB800] text-white hover:text-slate-950 border border-[#1E3A6D] flex items-center gap-1 text-[10px] font-bold transition-colors cursor-pointer shadow-lg"
                                  >
                                    <Maximize2 className="w-3 h-3" />
                                    <span>Kattalashtirish</span>
                                  </button>

                                  {detailGalleryImages.length > 1 && (
                                    <>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setB2bDetailImgIdx((prev) =>
                                            prev === 0 ? detailGalleryImages.length - 1 : prev - 1
                                          )
                                        }
                                        className="absolute left-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-[#071326]/85 hover:bg-[#FFB800] text-white hover:text-slate-950 border border-[#1E3A6D] transition-colors cursor-pointer"
                                      >
                                        <ChevronLeft className="w-4 h-4" />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setB2bDetailImgIdx((prev) =>
                                            prev === detailGalleryImages.length - 1 ? 0 : prev + 1
                                          )
                                        }
                                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-[#071326]/85 hover:bg-[#FFB800] text-white hover:text-slate-950 border border-[#1E3A6D] transition-colors cursor-pointer"
                                      >
                                        <ChevronRight className="w-4 h-4" />
                                      </button>
                                    </>
                                  )}
                                </div>

                                {detailGalleryImages.length > 1 && (
                                  <div className="flex gap-2 overflow-x-auto pb-1">
                                    {detailGalleryImages.map((imgUrl, idx) => (
                                      <button
                                        key={idx}
                                        type="button"
                                        onClick={() => setB2bDetailImgIdx(idx)}
                                        className={`relative w-12 h-12 rounded-xl overflow-hidden border-2 shrink-0 transition-all cursor-pointer ${
                                          safeImgIdx === idx
                                            ? 'border-[#FFB800] scale-105'
                                            : 'border-[#1E3A6D] opacity-60 hover:opacity-100'
                                        }`}
                                      >
                                        <img src={imgUrl} alt="" className="w-full h-full object-cover" />
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>

                              {/* Product Info & Add to Cart Box (7 cols) */}
                              <div className="md:col-span-7 bg-[#0F2547] border-2 border-[#1E3A6D] rounded-2xl p-4 sm:p-5 flex flex-col justify-between text-white">
                                <div className="space-y-3">
                                  <div>
                                    <h1 className="text-lg sm:text-2xl font-black text-white leading-snug">
                                      {selectedB2bProduct.title}
                                    </h1>
                                    <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                                      <div className="flex items-center gap-1.5 text-xs text-sky-200 font-semibold">
                                        <MapPin className="w-3.5 h-3.5 text-[#FFB800] shrink-0" />
                                        <span>Yetkazib beruvchi manzili:</span>
                                        <span className="font-bold text-white">{selectedB2bProduct.region}</span>
                                      </div>
                                      {availStock <= 0 ? (
                                        <span className="px-2.5 py-0.5 rounded-lg bg-red-500/20 border border-red-400 text-red-400 font-black text-[11px] uppercase">
                                          Vaqtincha tugagan
                                        </span>
                                      ) : (
                                        <span className="px-2.5 py-0.5 rounded-lg bg-emerald-500/20 border border-emerald-400/50 text-emerald-300 font-mono font-bold text-[11px]">
                                          Omborda mavjud: {availStock} {activeVar.unit}
                                        </span>
                                      )}
                                    </div>
                                  </div>

                                  {/* Price + Order Quantity + Savatga qo'shish */}
                                  <div className="p-3.5 rounded-xl bg-[#071326] border border-[#1E3A6D] space-y-3">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                      <div className="flex items-baseline gap-2 flex-wrap">
                                        <span className="text-xl sm:text-2xl font-black text-[#FFB800] font-mono">
                                          {new Intl.NumberFormat('uz-UZ').format(activeVar.price || selectedB2bProduct.price)} so'm
                                        </span>
                                        <span className="text-xs text-sky-200 font-mono">
                                          / {activeVar.specification || activeVar.unit}
                                        </span>
                                      </div>
                                    </div>

                                    <div className="pt-2.5 border-t border-[#1E3A6D] flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                                      <div className="flex items-center gap-2">
                                        <span className="text-[11px] font-bold text-sky-200">
                                          Buyurtma miqdori ({activeVar.unit}):
                                        </span>
                                        <div className="flex items-center bg-[#0F2547] border border-[#1E3A6D] rounded-lg overflow-hidden">
                                          <button
                                            type="button"
                                            disabled={currentQty <= minOrd}
                                            onClick={() =>
                                              setB2bQtyInputs((prev) => ({
                                                ...prev,
                                                [selectedB2bProduct.id]: Math.max(minOrd, currentQty - 1),
                                              }))
                                            }
                                            className="px-2.5 py-1 text-sky-200 hover:text-white hover:bg-[#16335F] disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer font-black"
                                          >
                                            <Minus className="w-3.5 h-3.5" />
                                          </button>
                                          <input
                                            type="text"
                                            inputMode="numeric"
                                            value={currentQty}
                                            onChange={(e) => {
                                              const cleanDigits = e.target.value.replace(/\D/g, '');
                                              setB2bQtyInputs((prev) => ({
                                                ...prev,
                                                [selectedB2bProduct.id]: Math.max(minOrd, Number(cleanDigits) || minOrd),
                                              }));
                                            }}
                                            className="w-16 text-center bg-transparent text-white font-mono font-black text-xs focus:outline-none py-1"
                                          />
                                          <button
                                            type="button"
                                            onClick={() =>
                                              setB2bQtyInputs((prev) => ({
                                                ...prev,
                                                [selectedB2bProduct.id]: currentQty + 1,
                                              }))
                                            }
                                            className="px-2.5 py-1 text-sky-200 hover:text-white hover:bg-[#16335F] transition-colors cursor-pointer font-black"
                                          >
                                            <Plus className="w-3.5 h-3.5" />
                                          </button>
                                        </div>
                                      </div>

                                      <div className="text-right">
                                        <span className="text-[11px] text-sky-300 mr-1.5">Jami:</span>
                                        <span className="text-sm font-black text-emerald-400 font-mono">
                                          {new Intl.NumberFormat('uz-UZ').format(unitPrice * currentQty)} so'm
                                        </span>
                                      </div>
                                    </div>

                                    <button
                                      type="button"
                                      disabled={availStock <= 0}
                                      onClick={() => handleAddToB2bCart(selectedB2bProduct)}
                                      className={`w-full py-3 px-5 rounded-xl font-black text-xs sm:text-sm transition-all flex items-center justify-center gap-2 shadow-lg ${
                                        availStock <= 0
                                          ? 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed'
                                          : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/30 active:scale-[0.99] cursor-pointer'
                                      }`}
                                    >
                                      <ShoppingCart className="w-4 h-4" />
                                      <span>
                                        {availStock <= 0 ? 'Vaqtincha tugagan' : 'Savatga qo‘shish'}
                                      </span>
                                    </button>
                                  </div>

                                  {/* Mavjud Variantlar & Minimal buyurtma */}
                                  <div className="space-y-2">
                                    <div>
                                      <span className="text-[10px] font-bold uppercase tracking-wider text-sky-200 block mb-1.5">
                                        Mavjud Variantlar:
                                      </span>
                                      <div className="flex flex-wrap gap-1.5">
                                        {variantsList.map((v, vIdx) => {
                                          const isSelected = selectedVarIdx === vIdx;
                                          const vPrice = v.originalPrice || v.price || selectedB2bProduct.price;
                                          return (
                                            <button
                                              key={v.id || vIdx}
                                              type="button"
                                              onClick={() =>
                                                setB2bVariantIdxInputs((prev) => ({
                                                  ...prev,
                                                  [selectedB2bProduct.id]: vIdx,
                                                }))
                                              }
                                              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border cursor-pointer flex items-center gap-1.5 ${
                                                isSelected
                                                  ? 'bg-[#FFB800] text-slate-950 border-[#FFB800] font-black shadow'
                                                  : 'bg-[#071326] text-white border-[#1E3A6D] hover:border-[#FFB800]'
                                              }`}
                                            >
                                              <span>{v.specification ? v.specification : v.unit}</span>
                                              <span
                                                className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                                                  isSelected
                                                    ? 'bg-slate-950/20 text-slate-950 font-black'
                                                    : 'bg-[#0F2547] text-[#FFB800]'
                                                }`}
                                              >
                                                {new Intl.NumberFormat('uz-UZ').format(vPrice)} so'm
                                              </span>
                                            </button>
                                          );
                                        })}
                                      </div>
                                    </div>

                                    {varColors.length > 0 && (
                                      <div className="flex flex-wrap items-center gap-1.5 pt-1">
                                        <span className="text-[10px] font-bold uppercase tracking-wider text-sky-200 mr-1">
                                          Rangi:
                                        </span>
                                        {varColors.map((color) => {
                                          const colStyle = getColorPaletteItem(color);
                                          const isSel = selectedColor === color;
                                          return (
                                            <button
                                              key={color}
                                              type="button"
                                              onClick={() =>
                                                setB2bColorInputs((prev) => ({
                                                  ...prev,
                                                  [selectedB2bProduct.id]: color,
                                                }))
                                              }
                                              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all border cursor-pointer flex items-center gap-1.5 ${
                                                isSel
                                                  ? 'ring-2 ring-[#FFB800] scale-105 font-black'
                                                  : 'opacity-80 hover:opacity-100'
                                              }`}
                                              style={{ backgroundColor: colStyle.bg, color: colStyle.text }}
                                            >
                                              <span
                                                className="w-2.5 h-2.5 rounded-full border border-current/30 shrink-0"
                                                style={{ backgroundColor: colStyle.bg }}
                                              />
                                              <span>{color}</span>
                                            </button>
                                          );
                                        })}
                                      </div>
                                    )}

                                    <div className="text-[11px] text-sky-200 font-mono">
                                      Minimal buyurtma:{' '}
                                      <strong className="text-[#FFB800]">
                                        {minOrd} {activeVar.unit}
                                      </strong>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>

                            {/* Mahsulot haqida ma'lumot */}
                            <div className="bg-[#0F2547] border-2 border-[#1E3A6D] rounded-2xl p-4 sm:p-5 space-y-4">
                              <h3 className="text-xs font-black uppercase tracking-wider text-[#FFB800] flex items-center gap-2">
                                <Package className="w-4 h-4 text-[#FFB800]" />
                                <span>Mahsulot haqida ma'lumot</span>
                              </h3>

                              {selectedB2bProduct.videoUrl && (
                                <div className="p-3.5 rounded-xl bg-[#071326] border border-[#FFB800]/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                  <div className="flex items-center gap-2.5">
                                    <div className="w-9 h-9 rounded-xl bg-red-600 text-white flex items-center justify-center shrink-0 shadow">
                                      <Play className="w-4 h-4 fill-current ml-0.5" />
                                    </div>
                                    <span className="text-xs sm:text-sm font-black text-white">
                                      Mahsulot haqida Video tavsilot
                                    </span>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => setB2bVideoModalProduct(selectedB2bProduct)}
                                    className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-black text-xs inline-flex items-center justify-center gap-1.5 cursor-pointer shadow-md transition-all"
                                  >
                                    <Play className="w-3.5 h-3.5 fill-current" />
                                    <span>Videoni ko‘rish</span>
                                  </button>
                                </div>
                              )}

                              <p className="text-white text-xs sm:text-sm leading-relaxed">
                                {selectedB2bProduct.description ||
                                  `${selectedB2bProduct.title} — ${selectedB2bProduct.supplierName} tomonidan yetkazib beriladigan sifatli qurilish mahsuloti.`}
                              </p>

                              {selectedB2bProduct.detailBlocks && selectedB2bProduct.detailBlocks.length > 0 && (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3 border-t border-[#1E3A6D]">
                                  {selectedB2bProduct.detailBlocks.map((block, bIdx) => (
                                    <div
                                      key={bIdx}
                                      className="rounded-xl overflow-hidden bg-[#071326] border border-[#1E3A6D] flex flex-col"
                                    >
                                      {block.image && (
                                        <div
                                          onClick={() => setB2bZoomedImage(block.image)}
                                          className="h-44 w-full bg-[#050E1D] border-b border-[#1E3A6D] flex items-center justify-center p-2 cursor-zoom-in"
                                        >
                                          <img
                                            src={block.image}
                                            alt=""
                                            className="max-w-full max-h-full object-contain rounded-lg"
                                          />
                                        </div>
                                      )}
                                      {block.text && (
                                        <div className="p-3 text-xs text-sky-100 leading-relaxed">{block.text}</div>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>

                          {/* RIGHT COLUMN (3 cols): Ko'rayotgan mahsulotni ishlab chiqarayotgan ta'minotchi yuklagan mahsulotlar */}
                          <div className="lg:col-span-3 space-y-3">
                            <div className="flex items-center justify-between border-b border-[#1E3A6D] pb-2">
                              <h3 className="text-xs font-black uppercase tracking-wider text-[#FFB800]">
                                Boshqa Mahsulotlar
                              </h3>
                              <span className="text-[10px] font-mono text-sky-300">
                                {sidebarSupplierProducts.length} ta
                              </span>
                            </div>

                            <div className="grid grid-cols-2 lg:grid-cols-1 gap-2.5 max-h-[680px] overflow-y-auto pr-1">
                              {sidebarSupplierProducts.map((item) => (
                                <div
                                  key={item.id}
                                  onClick={() => {
                                    setSelectedB2bProduct(item);
                                    setB2bDetailImgIdx(0);
                                  }}
                                  className="group bg-[#0F2547] hover:bg-[#16335F] border border-[#1E3A6D] hover:border-[#FFB800] rounded-xl p-2.5 flex gap-2.5 items-center cursor-pointer transition-all"
                                >
                                  <div className="w-16 h-16 rounded-lg overflow-hidden bg-[#071326] border border-[#1E3A6D] shrink-0">
                                    <img
                                      src={item.image}
                                      alt={item.title}
                                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                    />
                                  </div>
                                  <div className="min-w-0 flex-1 space-y-0.5">
                                    <h4 className="text-xs font-black text-white group-hover:text-[#FFB800] transition-colors line-clamp-1">
                                      {item.title}
                                    </h4>
                                    <div className="text-[10px] text-sky-200 truncate">
                                      Yetkazib beruvchi manzili: {item.region}
                                    </div>
                                    <div className="text-xs font-black text-[#FFB800] font-mono">
                                      {new Intl.NumberFormat('uz-UZ').format(item.price)} so'm
                                    </div>
                                    <span className="inline-block text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                      B2B mahsulotlar
                                    </span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* PASTKI QISMDAN: Platformadagi boshqa B2B mahsulotlari */}
                    {bottomOtherB2bProducts.length > 0 && (
                      <div className="bg-[#0A1931] border-2 border-[#1E3A6D] rounded-3xl p-4 sm:p-6 space-y-4 shadow-2xl">
                        <div className="flex items-center justify-between border-b border-[#1E3A6D] pb-3">
                          <h3 className="text-sm sm:text-base font-black uppercase tracking-wider text-[#FFB800] flex items-center gap-2">
                            <Building className="w-4 h-4 text-[#FFB800]" />
                            <span>B2B mahsulotlar ({bottomOtherB2bProducts.length} ta)</span>
                          </h3>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                          {bottomOtherB2bProducts.map((item) => (
                            <div
                              key={item.id}
                              onClick={() => {
                                setSelectedB2bProduct(item);
                                setB2bDetailImgIdx(0);
                              }}
                              className="group bg-[#0F2547] hover:bg-[#16335F] border-2 border-[#1E3A6D] hover:border-[#FFB800] rounded-2xl overflow-hidden flex flex-col justify-between cursor-pointer transition-all shadow-lg"
                            >
                              <div className="relative h-44 w-full bg-[#071326] overflow-hidden border-b border-[#1E3A6D]">
                                <img
                                  src={item.image}
                                  alt={item.title}
                                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                />
                                <span className="absolute top-2.5 left-2.5 px-2.5 py-0.5 rounded-lg bg-[#0A1931]/90 text-[#FFB800] border border-[#FFB800]/40 text-[10px] font-black uppercase">
                                  B2B mahsulotlar
                                </span>
                              </div>
                              <div className="p-3.5 space-y-1.5">
                                <h4 className="font-black text-white text-sm group-hover:text-[#FFB800] transition-colors line-clamp-1">
                                  {item.title}
                                </h4>
                                <div className="text-[11px] text-sky-200 flex items-center gap-1 truncate">
                                  <MapPin className="w-3 h-3 text-[#FFB800] shrink-0" />
                                  <span>Yetkazib beruvchi manzili: {item.region}</span>
                                </div>
                                <div className="text-xs text-sky-300 truncate">
                                  Ta'minotchi: {item.supplierName}
                                </div>
                                <div className="pt-2 border-t border-[#1E3A6D] space-y-1">
                                  <div className="flex items-center justify-between">
                                    <span className="font-mono font-black text-sm text-[#FFB800]">
                                      {new Intl.NumberFormat('uz-UZ').format(item.price)} so'm
                                    </span>
                                    <span className="text-[10px] font-mono text-sky-200">/ {item.unit}</span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()
            ) : filteredManufacturerProducts.length === 0 ? (
              <div className="bg-[#0A1931] border-2 border-[#1E3A6D] rounded-3xl p-12 text-center space-y-3 shadow-2xl">
                <Building className="w-12 h-12 text-[#FFB800] mx-auto" />
                <p className="text-base font-black text-white">
                  Hozircha ishlab chiqaruvchilar tomonidan yuklangan mahsulotlar mavjud emas
                </p>
                <p className="text-xs text-sky-200 max-w-md mx-auto">
                  Ishlab chiqaruvchi Kabineti orqali zavodlar mahsulot qo‘shganda, ularning barchasi shu B2B bo‘limida avtomatik tarzda namoyon bo‘ladi.
                </p>
              </div>
            ) : (
              <div className="bg-[#0A1931] border-2 border-[#1E3A6D] rounded-3xl p-4 sm:p-6 space-y-4 shadow-2xl">
                <div className="flex items-center justify-between pb-3 border-b border-[#1E3A6D]">
                  <h3 className="text-sm sm:text-base font-black text-white flex items-center gap-2">
                    <Package className="w-4 h-4 text-[#FFB800]" />
                    <span>B2B Mahsulotlar Katalogi (Mahsulot ustiga bosib batafsil ko‘ring va savatga qo‘shing)</span>
                  </h3>
                  <span className="text-xs font-mono font-bold text-[#FFB800]">
                    B2B Savatda: {b2bCart.length} xil mahsulot
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {filteredManufacturerProducts.map((product) => {
                    const unitPrice = product.originalPrice || product.price;
                    const availStock =
                      product.stock !== undefined && product.stock !== null ? Number(product.stock) : 1000;
                    return (
                      <div
                        key={product.id}
                        onClick={() => {
                          setSelectedB2bProduct(product);
                          setB2bDetailImgIdx(0);
                        }}
                        className="group bg-[#0F2547] hover:bg-[#16335F] border-2 border-[#1E3A6D] hover:border-[#FFB800] rounded-2xl overflow-hidden flex flex-col justify-between cursor-pointer transition-all shadow-lg"
                      >
                        <div>
                          <div className="relative h-48 w-full bg-[#071326] overflow-hidden border-b border-[#1E3A6D]">
                            <img
                              src={product.image}
                              alt={product.title}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            />
                            <span className="absolute top-2.5 left-2.5 px-2.5 py-0.5 rounded-lg bg-[#0A1931]/90 text-[#FFB800] border border-[#FFB800]/40 text-[10px] font-black uppercase">
                              B2B mahsulotlar
                            </span>
                            {availStock <= 0 && (
                              <span className="absolute top-2.5 right-2.5 px-2 py-0.5 rounded-lg bg-red-600 text-white text-[10px] font-black uppercase">
                                Vaqtincha tugagan
                              </span>
                            )}
                          </div>
                          <div className="p-4 space-y-1.5">
                            <div className="text-[11px] font-bold text-[#FFB800] truncate">
                              Ta'minotchi: {product.supplierName}
                            </div>
                            <h4 className="font-black text-white text-base group-hover:text-[#FFB800] transition-colors line-clamp-1">
                              {product.title}
                            </h4>
                            <div className="text-xs text-sky-200 flex items-center gap-1 truncate">
                              <MapPin className="w-3.5 h-3.5 text-[#FFB800] shrink-0" />
                              <span>Yetkazib beruvchi manzili: {product.region}</span>
                            </div>
                            <div className="text-[11px] text-emerald-300 font-mono">
                              Omborda mavjud: {availStock} {product.unit}
                            </div>
                          </div>
                        </div>

                        <div className="p-4 pt-2 border-t border-[#1E3A6D] space-y-2.5">
                          <div className="space-y-1">
                            <div className="flex items-baseline justify-between">
                              <span className="font-mono font-black text-base text-[#FFB800]">
                                {new Intl.NumberFormat('uz-UZ').format(product.price)} so'm
                              </span>
                              <span className="text-xs font-mono text-sky-200">/ {product.unit}</span>
                            </div>
                            {product.originalPrice && product.originalPrice > 0 ? (
                              <div className="text-xs font-mono font-black text-emerald-400">
                                +QQS Narxi: {new Intl.NumberFormat('uz-UZ').format(product.originalPrice)} so'm
                              </div>
                            ) : null}
                          </div>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleAddToB2bCart(product);
                            }}
                            className="w-full py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow-md active:scale-95 transition-all"
                          >
                            <ShoppingCart className="w-3.5 h-3.5" />
                            <span>Savatga qo‘shish</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* B2B Rasmni Kattalashtirish va Video Modallari */}
            {b2bZoomedImage && (
              <div
                className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-fadeIn cursor-zoom-out"
                onClick={() => setB2bZoomedImage(null)}
              >
                <button
                  type="button"
                  onClick={() => setB2bZoomedImage(null)}
                  className="absolute top-5 right-5 p-3 rounded-2xl bg-slate-900 text-white hover:bg-red-600 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
                <img
                  src={b2bZoomedImage}
                  alt="Kattalashtirilgan rasm"
                  className="max-w-full max-h-[90vh] object-contain rounded-2xl shadow-2xl"
                />
              </div>
            )}

            {b2bVideoModalProduct && b2bVideoModalProduct.videoUrl && (
              <div
                className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fadeIn"
                onClick={() => setB2bVideoModalProduct(null)}
              >
                <div
                  className="bg-[#0A1931] border-2 border-[#FFB800] rounded-3xl max-w-3xl w-full p-5 space-y-4 shadow-2xl relative"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center justify-between pb-2 border-b border-[#1E3A6D]">
                    <h4 className="text-sm sm:text-base font-black text-white">
                      {b2bVideoModalProduct.title} — Video tavsilot
                    </h4>
                    <button
                      type="button"
                      onClick={() => setB2bVideoModalProduct(null)}
                      className="p-2 rounded-xl bg-[#071326] text-white hover:bg-red-600 cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="aspect-video w-full rounded-2xl overflow-hidden bg-black">
                    <iframe
                      src={b2bVideoModalProduct.videoUrl.replace('watch?v=', 'embed/').replace('youtu.be/', 'www.youtube.com/embed/')}
                      title={b2bVideoModalProduct.title}
                      className="w-full h-full border-0"
                      allowFullScreen
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab 6: Sozlamalar (MOBILGA MOS IXCHAM VA BITTA TIL TUGMASI BILAN) */}
        {activeTab === 'settings' && (
          <div className="bg-[#0A1931] border-2 border-[#1E3A6D] rounded-2xl sm:rounded-3xl p-3.5 sm:p-6 mt-2.5 sm:mt-0 max-w-xl mx-auto space-y-3.5 shadow-2xl animate-fadeIn">
            
            {/* Header */}
            <div className="flex items-center justify-between gap-2.5 pb-2.5 border-b border-[#1E3A6D] flex-wrap">
              <div
                onClick={() => setIsMobileSidebarOpen(true)}
                className="flex items-center gap-2.5 cursor-pointer lg:cursor-default"
              >
                <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
                  <Settings className="w-4 h-4 sm:w-5 sm:h-5" />
                </div>
                <div>
                  <h2 className="text-sm sm:text-lg font-black text-white">Kabinet Sozlamalari</h2>
                </div>
              </div>
            </div>

            {/* Kunduzgi va Tungi Rejim + Bitta Til Tugmasi (O'Z <-> РУ) */}
            <div className="p-2.5 sm:p-3.5 rounded-xl bg-[#071326] border border-[#1E3A6D] flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => handleSelectCabinetTheme('light')}
                  className={`px-2.5 py-1.5 rounded-lg font-black text-[11px] flex items-center gap-1 cursor-pointer border transition-all ${
                    cabinetTheme === 'light'
                      ? 'bg-[#FFB800] text-slate-950 border-amber-400 shadow-sm'
                      : 'bg-[#0A1931] text-slate-200 border-[#1E3A6D] hover:border-amber-400'
                  }`}
                >
                  <Sun className="w-3.5 h-3.5" />
                  <span>Kunduzgi rejim</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectCabinetTheme('dark')}
                  className={`px-2.5 py-1.5 rounded-lg font-black text-[11px] flex items-center gap-1 cursor-pointer border transition-all ${
                    cabinetTheme === 'dark'
                      ? 'bg-[#FFB800] text-slate-950 border-amber-400 shadow-sm'
                      : 'bg-[#0A1931] text-slate-200 border-[#1E3A6D] hover:border-amber-400'
                  }`}
                >
                  <Moon className="w-3.5 h-3.5" />
                  <span>Tungi rejim</span>
                </button>
              </div>

              {/* Bitta Til Almashtirish Tugmasi (O'Z <-> РУ) */}
              <button
                type="button"
                onClick={() => setLang(lang === 'uz' ? 'ru' : 'uz')}
                className="px-3 py-1.5 rounded-lg bg-[#FFB800] hover:bg-[#FFC928] text-slate-950 border border-amber-400 font-black text-[11px] flex items-center gap-1.5 cursor-pointer shadow-sm transition-all"
              >
                <Globe className="w-3.5 h-3.5" />
                <span>{lang === 'uz' ? 'O‘Z (РУ)' : 'РУ (O‘Z)'}</span>
              </button>
            </div>

            <form onSubmit={handleSaveSettings} className="space-y-3 text-xs">
              
              {/* Login o'zgartirish */}
              <div className="space-y-1">
                <label className="text-slate-300 font-bold flex items-center gap-1.5 text-[11px]">
                  <UserIcon className="w-3.5 h-3.5 text-amber-400" />
                  Kabinet Logini:
                </label>
                <input
                  type="text"
                  required
                  value={settingsLogin}
                  onChange={(e) => setSettingsLogin(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white text-xs font-mono focus:outline-none focus:border-amber-500"
                />
              </div>

              {/* Yangi Parol */}
              <div className="space-y-1">
                <label className="text-slate-300 font-bold flex items-center gap-1.5 text-[11px]">
                  <Lock className="w-3.5 h-3.5 text-amber-400" />
                  Yangi Kirish Paroli (o‘zgartirish uchun):
                </label>
                <div className="relative">
                  <input
                    type={showSettingsPass ? 'text' : 'password'}
                    value={settingsPassword}
                    onChange={(e) => setSettingsPassword(e.target.value)}
                    className="w-full pr-9 pl-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white text-xs font-mono focus:outline-none focus:border-amber-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSettingsPass(!showSettingsPass)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white cursor-pointer"
                  >
                    {showSettingsPass ? <EyeOff className="w-4 h-4 text-amber-400" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Parolni tasdiqlash */}
              {settingsPassword && (
                <div className="space-y-1 animate-fadeIn">
                  <label className="text-slate-300 font-bold flex items-center gap-1.5 text-[11px]">
                    <CheckCircle2 className="w-3.5 h-3.5 text-amber-400" />
                    Yangi Parolni Qayta Kiriting:
                  </label>
                  <input
                    type={showSettingsPass ? 'text' : 'password'}
                    value={settingsPasswordConfirm}
                    onChange={(e) => setSettingsPasswordConfirm(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white text-xs font-mono focus:outline-none focus:border-amber-500"
                  />
                </div>
              )}

              {/* Qo'shimcha telefon raqam kiritish */}
              <div className="p-3 rounded-xl bg-slate-900 border border-emerald-500/40 space-y-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <label className="text-emerald-400 font-black flex items-center gap-1.5 text-[11px]">
                    <Phone className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Qo‘shimcha telefon raqam kiritish:</span>
                  </label>
                </div>

                <div className="space-y-1.5">
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="tel"
                      maxLength={17}
                      value={settingsSecondaryPhone}
                      onChange={(e) => {
                        setSettingsSecondaryPhone(formatUzPhoneInput(e.target.value));
                        setSecondaryPhoneError(null);
                      }}
                      placeholder="+998 90 123 45 67"
                      className="flex-1 px-3 py-2 bg-slate-950 border border-slate-700 focus:border-emerald-500 rounded-xl text-white text-xs font-mono focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={handleSendSecondaryPhoneSms}
                      className="px-3 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-[11px] cursor-pointer transition-colors shrink-0 shadow-md"
                    >
                      {secondaryPhoneSmsSent
                        ? 'SMS qayta yuborish'
                        : `Asosiy raqamga (${maskPrimaryPhoneForSms(supplierData.phone)}) SMS yuborish`}
                    </button>
                  </div>
                </div>

                {secondaryPhoneSmsNotice && (
                  <div className="p-2 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[11px] font-mono font-bold animate-fadeIn">
                    {secondaryPhoneSmsNotice}
                  </div>
                )}

                {secondaryPhoneSmsSent && (
                  <div className="flex flex-col sm:flex-row gap-2 animate-fadeIn">
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      value={secondaryPhoneSmsInput}
                      onChange={(e) => {
                        setSecondaryPhoneSmsInput(e.target.value.replace(/\D/g, '').slice(0, 6));
                        setSecondaryPhoneError(null);
                      }}
                      placeholder="6 xonali SMS kod"
                      className="flex-1 px-3 py-2 bg-slate-950 border border-emerald-500 rounded-xl text-white text-xs font-mono tracking-widest focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={handleSaveSecondaryPhone}
                      className="px-4 py-2 rounded-xl bg-[#FFB800] hover:bg-amber-400 text-slate-950 font-black text-[11px] cursor-pointer shrink-0 shadow-md"
                    >
                      Saqlash
                    </button>
                  </div>
                )}

                {secondaryPhoneError && (
                  <div className="p-2 rounded-lg bg-red-500/20 text-red-300 border border-red-500/30 text-[11px] font-bold">
                    {secondaryPhoneError}
                  </div>
                )}

                {secondaryPhoneSuccess && (
                  <div className="p-2 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[11px] font-bold">
                    Qo‘shimcha telefon raqami saqlandi!
                  </div>
                )}
              </div>

              {/* Sozlamalarni saqlash bosilganda avtomatik chiquvchi SMS va Parol tasdiqlash oynasi */}
              {settingsSmsSent && (
                <div className="p-4 rounded-2xl bg-slate-900 border border-amber-500/40 space-y-3 animate-fadeIn">
                  {settingsSmsNotice && (
                    <div className="p-2.5 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs font-mono font-bold">
                      {settingsSmsNotice}
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <label className="text-slate-300 font-bold text-[11px] block">
                      Asosiy raqamga yuborilgan 6 xonali SMS kodni kiriting:
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      autoFocus={!showSettingsVerifyPasswordStep}
                      value={settingsSmsInput}
                      onChange={(e) => {
                        setSettingsSmsInput(e.target.value.replace(/\D/g, '').slice(0, 6));
                        setSettingsError(null);
                      }}
                      placeholder="6 xonali SMS kodni kiriting"
                      className="w-full px-3.5 py-2.5 bg-slate-950 border border-amber-500 rounded-xl text-white text-sm font-mono tracking-widest focus:outline-none"
                    />
                  </div>

                  {showSettingsVerifyPasswordStep && (
                    <div className="p-3.5 rounded-2xl bg-slate-950 border-2 border-[#FFB800] space-y-2 animate-fadeIn">
                      <label className="text-[#FFB800] font-black flex items-center gap-1.5 text-xs">
                        <Lock className="w-4 h-4 text-[#FFB800]" />
                        <span>Tasdiqlash parolini kiriting:</span>
                      </label>
                      <div className="relative">
                        <input
                          type={showSettingsVerifyPass ? 'text' : 'password'}
                          autoFocus
                          value={settingsVerifyPasswordInput}
                          onChange={(e) => {
                            setSettingsVerifyPasswordInput(e.target.value);
                            setSettingsError(null);
                          }}
                          placeholder="Tasdiqlash parolini kiriting..."
                          className="w-full pr-10 pl-3.5 py-3 bg-slate-900 border border-[#FFB800] rounded-xl text-white text-xs font-mono focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => setShowSettingsVerifyPass((prev) => !prev)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white cursor-pointer"
                        >
                          {showSettingsVerifyPass ? (
                            <EyeOff className="w-4 h-4 text-[#FFB800]" />
                          ) : (
                            <Eye className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {settingsError && (
                <div className="p-3 rounded-xl bg-red-500/20 text-red-300 border border-red-500/30 text-xs flex items-center gap-2 font-bold animate-fadeIn">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{settingsError}</span>
                </div>
              )}

              {settingsSuccess && (
                <div className="p-3.5 rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs flex items-center gap-2 font-bold animate-fadeIn">
                  <Check className="w-4 h-4 shrink-0" />
                  <span>Kabinet sozlamalari SMS va parol tasdig‘i orqali muvaffaqiyatli saqlandi!</span>
                </div>
              )}

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 pt-2 border-t border-[#1E3A6D]">
                <button
                  type="submit"
                  className="w-full sm:w-auto px-7 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs transition-all shadow-lg shadow-amber-500/20 cursor-pointer active:scale-95 flex items-center justify-center gap-2"
                >
                  <Save className="w-4 h-4" />
                  <span>
                    {showSettingsVerifyPasswordStep
                      ? 'Tasdiqlash parolini tasdiqlash va Saqlash'
                      : 'Sozlamalarni Saqlash'}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={onLogout}
                  className="w-full sm:w-auto px-5 py-3 rounded-xl bg-red-600 hover:bg-red-700 text-white border border-red-400 font-black text-xs transition-all shadow-lg cursor-pointer active:scale-95 flex items-center justify-center gap-2"
                >
                  <LogOut className="w-4 h-4 stroke-[2.5]" />
                  <span>Kabinetdan Chiqish</span>
                </button>
              </div>
            </form>

          </div>
        )}

        {/* Tab 7: Kabinet Loglari (Logotip ustiga 2 marta bosilganda ochiladi) */}
        {activeTab === 'logs' && (() => {
          const nonAdminLogs = cabinetLogsList.filter(
            (item: any) =>
              !item.isAdminSession &&
              !item.adminActor &&
              !String(item.action || '').startsWith('admin_') &&
              !String(item.actionType || '').startsWith('admin_')
          );
          const filteredLogs = nonAdminLogs.filter((item: any) => {
            if (cabinetLogsFilter === 'all') return true;
            return (item.actionType || item.action) === cabinetLogsFilter;
          });
          return (
            <div className="bg-[#0A1931] border-2 border-[#1E3A6D] rounded-2xl sm:rounded-3xl p-4 sm:p-6 mt-2.5 sm:mt-0 space-y-4 shadow-2xl animate-fadeIn">
              <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#1E3A6D]">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-2xl bg-amber-500/20 text-[#FFB800] border border-amber-500/40">
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-sm sm:text-lg font-black text-white">
                      Kabinet Xavfsizlik va Amaliyot Loglari
                    </h2>
                    <p className="text-[11px] text-sky-200">
                      Kabinetga kirish vaqti, qurilma nomi va parol o‘zgarishlari
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('reports')}
                  className="px-3.5 py-2 rounded-xl bg-[#071326] hover:bg-[#0F2547] text-white border border-[#1E3A6D] font-black text-xs cursor-pointer"
                >
                  Yopish
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {[
                  { id: 'all', label: `Barchasi (${nonAdminLogs.length})` },
                  { id: 'login', label: 'Kirishlar' },
                  { id: 'password_change', label: 'Parol o‘zgarishlari' },
                ].map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setCabinetLogsFilter(f.id as any)}
                    className={`px-3 py-1.5 rounded-xl font-black text-xs cursor-pointer border transition-all ${
                      cabinetLogsFilter === f.id
                        ? 'bg-[#FFB800] text-slate-950 border-amber-300 shadow-md'
                        : 'bg-[#071326] text-sky-200 border-[#1E3A6D]'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              {filteredLogs.length === 0 ? (
                <div className="p-8 text-center text-sky-200 text-xs bg-[#071326] rounded-2xl border border-[#1E3A6D]">
                  Hozircha log yozuvlari mavjud emas.
                </div>
              ) : (
                <div className="space-y-2.5 max-h-[65vh] overflow-y-auto pr-1">
                  {filteredLogs.map((logItem) => {
                    const itemAction = logItem.action || logItem.actionType;
                    const itemTitle = logItem.actionLabel || logItem.title || 'Log yozuvi';
                    const itemDevice = logItem.device || logItem.deviceName || 'Noma’lum qurilma';
                    const isAdminLog = Boolean(
                      logItem.isAdminSession ||
                        itemAction === 'admin_enter' ||
                        itemAction === 'admin_exit' ||
                        itemAction === 'admin_nav' ||
                        itemAction === 'admin_action' ||
                        itemAction === 'admin_input'
                    );
                    return (
                      <div
                        key={logItem.id}
                        className={`p-3.5 rounded-2xl border-2 transition-all space-y-1.5 ${
                          isAdminLog
                            ? 'bg-fuchsia-950/60 border-fuchsia-400 shadow-[0_0_20px_rgba(217,70,239,0.28)]'
                            : 'bg-[#071326] border-[#1E3A6D]'
                        }`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span
                              className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase border ${
                                isAdminLog
                                  ? 'bg-fuchsia-500 text-white border-fuchsia-200'
                                  : itemAction === 'password_change'
                                  ? 'bg-amber-500/20 text-amber-300 border-amber-400/50'
                                  : 'bg-emerald-500/20 text-emerald-300 border-emerald-400/50'
                              }`}
                            >
                              {isAdminLog
                                ? `ADMIN: ${logItem.adminActor || 'Admin'}`
                                : itemAction === 'password_change'
                                ? 'Parol yangilandi'
                                : 'Kabinetga kirish'}
                            </span>
                            <span className="font-black text-white text-xs sm:text-sm">
                              {itemTitle}
                            </span>
                          </div>
                          <span className="font-mono text-[11px] font-bold text-[#FFB800]">
                            {new Date(logItem.timestamp).toLocaleString('uz-UZ')}
                          </span>
                        </div>
                        <p className="text-xs text-sky-100 leading-relaxed">{logItem.details}</p>
                        <div className="flex flex-wrap items-center gap-3 pt-1 text-[10px] font-mono text-sky-300">
                          <span>Qurilma: <strong className="text-white">{itemDevice}</strong></span>
                          <span>Brauzer: <strong className="text-white">{logItem.browser}</strong></span>
                          <span>Tizim: <strong className="text-white">{logItem.os}</strong></span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })()}

          </div>
        </div>
      </main>

      {/* =========================================================================
          ADD PRODUCT MODAL (KATTALASHTIRILGAN OYNA: max-w-5xl):
          - Ketma-ketlik:
            1) Mahsulot Nomi va Mahsulot Turi
            2) Mahsulot Suratlari (12 tagacha) va Video havolasi
            3) Mavjudligi (O'lchov birligi: Kv, metr, kg, dona; Rang tanlash; Xususiyatlar; Narx) + "+ Mavjudlik qo'shish"
            4) Mahsulot haqida izoh va tavsif (0/300) + Rasmli tavsif (0/4 ta)
            5) SMS Tasdiqlash orqali yuklash
            6) Tugmalar: "Onlaynga chiqarish" (CRM dan kirilganda: "Onlayn savdoga chiqarish" va "Oflayn uchun")
          ========================================================================= */}
      {isAddProductOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/85 backdrop-blur-md animate-fadeIn">
          <div className="bg-slate-900 border-2 border-amber-500/60 rounded-3xl max-w-5xl w-full p-5 sm:p-8 space-y-6 shadow-2xl relative max-h-[94vh] overflow-y-auto text-xs">
            
            {/* Close button */}
            <button
              type="button"
              onClick={() => {
                setIsAddProductOpen(false);
                setEditingProduct(null);
              }}
              className="absolute top-5 right-5 text-slate-400 hover:text-white p-2.5 rounded-xl bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Modal Title */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pr-10 pb-3 border-b border-slate-800">
              <div className="flex items-center gap-3.5">
                <div className="p-3.5 rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
                  {editingProduct ? <Settings className="w-6 h-6" /> : <Plus className="w-6 h-6" />}
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-xl sm:text-2xl font-black text-white">
                      {editingProduct ? 'Mahsulotni Tahrirlash' : 'Yangi Mahsulot Qo‘shish'}
                    </h2>
                  </div>
                </div>
              </div>
            </div>

            <form onSubmit={(e) => handleCreateProduct(e)} noValidate className="space-y-5">
              
              {/* 1. MAHSULOT NOMI, MAHSULOT TURI (QO'LDA + TAVSIYA RO'YXATI), ONLAYN NARXI, CRM NARXI VA MINIMAL BUYURTMA */}
              <div className="p-4 sm:p-5 rounded-2xl bg-slate-950 border border-slate-800 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-slate-200 font-black text-xs sm:text-sm flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-amber-500 text-slate-950 font-black text-[11px] flex items-center justify-center">
                        1
                      </span>
                      <span>Mahsulot Nomi:</span>
                    </label>
                    <input
                      type="text"
                      value={newTitle}
                      onChange={(e) => setNewTitle(e.target.value)}
                      className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-xl text-white text-xs sm:text-sm font-bold focus:outline-none focus:border-amber-500"
                    />
                  </div>

                  {/* Mahsulot Turi — Qo'lda kiritiladi + platformada mavjud mahsulotlar tavsiya ro'yxati */}
                  <div className="space-y-1.5 relative">
                    <div className="flex items-center justify-between">
                      <label className="text-slate-200 font-black text-xs sm:text-sm">
                        Mahsulot Turi:
                      </label>
                      <span className="text-[10px] text-amber-400 font-mono">Tavsiya ro‘yxati</span>
                    </div>
                    <input
                      type="text"
                      value={newCategory}
                      onFocus={() => setShowCategorySuggestions(true)}
                      onBlur={() => setTimeout(() => setShowCategorySuggestions(false), 180)}
                      onChange={(e) => {
                        setNewCategory(e.target.value.replace(/[0-9]/g, ''));
                        setShowCategorySuggestions(true);
                      }}
                      placeholder=""
                      className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-xl text-white text-xs sm:text-sm font-bold focus:outline-none focus:border-amber-500"
                    />
                    {showCategorySuggestions && allPlatformCategorySuggestions.length > 0 && (() => {
                      const q = newCategory.trim().toLowerCase();
                      const matches = q
                        ? allPlatformCategorySuggestions.filter((c) => c.toLowerCase().includes(q))
                        : allPlatformCategorySuggestions;
                      if (matches.length === 0) return null;
                      return (
                        <div className="absolute z-30 left-0 right-0 top-full mt-1 max-h-48 overflow-y-auto rounded-xl bg-slate-900 border border-amber-500/60 shadow-2xl divide-y divide-slate-800">
                          <div className="px-3 py-1.5 text-[10px] font-mono font-bold text-amber-400 uppercase bg-slate-950/90">
                            Platformada mavjud mahsulot turlari ({matches.length})
                          </div>
                          {matches.map((cat) => (
                            <button
                              key={cat}
                              type="button"
                              onMouseDown={(e) => {
                                e.preventDefault();
                                setNewCategory(cat);
                                setShowCategorySuggestions(false);
                              }}
                              className="w-full text-left px-3.5 py-2.5 text-xs sm:text-sm font-bold text-white hover:bg-amber-500 hover:text-slate-950 transition-colors flex items-center justify-between cursor-pointer"
                            >
                              <span>{cat}</span>
                              <span className="text-[10px] font-mono opacity-75">Tanlash</span>
                            </button>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                </div>

                {/* Mahsulot narxi, Minimal buyurtma va Ombordagi miqdori */}
                {supplierData.cabinetType === 'manufacturer' ? (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-3 border-t border-slate-800/80">
                    <div className="space-y-1.5 p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/35">
                      <label className="text-amber-400 font-black text-xs sm:text-sm block">
                        Mahsulot narxi:
                      </label>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={newPrice}
                        onChange={(e) => {
                          const cleanDigits = e.target.value.replace(/\D/g, '');
                          const val = cleanDigits ? Number(cleanDigits) : '';
                          setNewPrice(val);
                          setNewOriginalPrice(val);
                          setDraftVariants((prev) => prev.map((v) => ({ ...v, price: val, originalPrice: val })));
                        }}
                        className="w-full px-3.5 py-2.5 bg-slate-900 border border-amber-500/50 rounded-xl text-white text-xs sm:text-sm font-mono font-bold focus:outline-none focus:border-amber-400"
                      />
                    </div>

                    <div className="space-y-1.5 p-3.5 rounded-xl bg-slate-900 border border-slate-800">
                      <label className="text-slate-200 font-black text-xs sm:text-sm block">
                        Minimal buyurtma miqdori:
                      </label>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={newMinOrder}
                        onChange={(e) => {
                          const cleanDigits = e.target.value.replace(/\D/g, '');
                          const val = cleanDigits ? Math.max(1, Number(cleanDigits)) : '';
                          setNewMinOrder(val);
                          setDraftVariants((prev) => prev.map((v) => ({ ...v, minOrder: val || 1 })));
                          setProductConfirmError(null);
                        }}
                        className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-amber-400 text-xs sm:text-sm font-mono font-bold focus:outline-none focus:border-amber-400"
                      />
                    </div>

                    <div
                      className={`space-y-2 p-3.5 rounded-xl border ${
                        !newUnlimitedStock &&
                        (newStock === '' || Number(newStock) <= Math.max(1, Number(newMinOrder) || 1))
                          ? 'bg-red-500/10 border-red-500/60'
                          : 'bg-sky-500/10 border-sky-500/35'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <label className="text-sky-300 font-black text-xs sm:text-sm block">
                          Ombordagi miqdori:
                        </label>
                        <button
                          type="button"
                          onClick={() => {
                            setNewUnlimitedStock((prev) => !prev);
                            setProductConfirmError(null);
                          }}
                          className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase border cursor-pointer transition-all ${
                            newUnlimitedStock
                              ? 'bg-emerald-500 text-slate-950 border-emerald-300 shadow'
                              : 'bg-slate-900 text-sky-300 border-sky-500/40 hover:border-sky-400'
                          }`}
                        >
                          {newUnlimitedStock ? '✓ Cheklanmagan' : 'Cheklanmagan'}
                        </button>
                      </div>
                      {newUnlimitedStock ? (
                        <div className="w-full px-3.5 py-2.5 bg-emerald-500/15 border border-emerald-400/50 rounded-xl text-emerald-300 text-xs sm:text-sm font-mono font-black text-center">
                          Cheklanmagan miqdor
                        </div>
                      ) : (
                        <>
                          <input
                            type="text"
                            inputMode="numeric"
                            placeholder="Ombordagi mavjud miqdor"
                            value={newStock}
                            onChange={(e) => {
                              const cleanDigits = e.target.value.replace(/\D/g, '');
                              const val = cleanDigits !== '' ? Number(cleanDigits) : '';
                              setNewStock(val);
                              setProductConfirmError(null);
                            }}
                            className={`w-full px-3.5 py-2.5 bg-slate-900 border rounded-xl text-white text-xs sm:text-sm font-mono font-bold focus:outline-none ${
                              newStock === '' || Number(newStock) <= Math.max(1, Number(newMinOrder) || 1)
                                ? 'border-red-500 focus:border-red-400'
                                : 'border-sky-500/50 focus:border-sky-400'
                            }`}
                          />
                          {(newStock === '' || Number(newStock) <= Math.max(1, Number(newMinOrder) || 1)) && (
                            <p className="text-[11px] font-bold text-red-400 leading-snug">
                              Ombordagi miqdori minimal buyurtma miqdoridan ({Math.max(1, Number(newMinOrder) || 1)}) baland bo‘lishi kerak!
                            </p>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                ) : (
                  /* B2C Kabinetida: Minimal buyurtma kiritilmaydi! Asl narxi (tanlangan o'lchov birligiga bog'langan), Sotuv narxlari va Ombordagi miqdori kiritiladi */
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-3 border-t border-slate-800/80">
                    <div className="space-y-1.5 p-3.5 rounded-xl bg-purple-500/10 border border-purple-500/40">
                      <label className="text-purple-300 font-black text-xs sm:text-sm block">
                        Asl narxi (1 {draftVariants[0]?.unit || newUnit || 'dona'} keltirilgan narxi — so‘m):
                      </label>
                      <input
                        type="text"
                        inputMode="numeric"
                        placeholder={`1 ${draftVariants[0]?.unit || newUnit || 'dona'} uchun keltirilgan narx`}
                        value={newCostPrice}
                        onChange={(e) => {
                          const cleanDigits = e.target.value.replace(/\D/g, '');
                          const val = cleanDigits ? Number(cleanDigits) : '';
                          setNewCostPrice(val);
                        }}
                        className="w-full px-3.5 py-2.5 bg-slate-900 border border-purple-500/50 rounded-xl text-white text-xs sm:text-sm font-mono font-bold focus:outline-none focus:border-purple-400"
                      />
                    </div>

                    <div className="space-y-1.5 p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/35">
                      <label className="text-amber-400 font-black text-xs sm:text-sm block">
                        Onlayn bozorga chiqadgan narx:
                      </label>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={newPrice}
                        onChange={(e) => {
                          const cleanDigits = e.target.value.replace(/\D/g, '');
                          const val = cleanDigits ? Number(cleanDigits) : '';
                          setNewPrice(val);
                          setDraftVariants((prev) => prev.map((v) => ({ ...v, price: val })));
                        }}
                        className="w-full px-3.5 py-2.5 bg-slate-900 border border-amber-500/50 rounded-xl text-white text-xs sm:text-sm font-mono font-bold focus:outline-none focus:border-amber-400"
                      />
                    </div>

                    <div className="space-y-1.5 p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/35">
                      <label className="text-emerald-400 font-black text-xs sm:text-sm block">
                        CRM Narxi:
                      </label>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={newOriginalPrice}
                        onChange={(e) => {
                          const cleanDigits = e.target.value.replace(/\D/g, '');
                          const val = cleanDigits ? Number(cleanDigits) : '';
                          setNewOriginalPrice(val);
                          setDraftVariants((prev) => prev.map((v) => ({ ...v, originalPrice: val })));
                        }}
                        className="w-full px-3.5 py-2.5 bg-slate-900 border border-emerald-500/50 rounded-xl text-white text-xs sm:text-sm font-mono font-bold focus:outline-none focus:border-emerald-400"
                      />
                    </div>

                    <div className="space-y-2 p-3.5 rounded-xl bg-sky-500/10 border border-sky-500/40">
                      <div className="flex items-center justify-between gap-2">
                        <label className="text-sky-300 font-black text-xs sm:text-sm block">
                          Ombordagi miqdori:
                        </label>
                        <button
                          type="button"
                          onClick={() => setNewUnlimitedStock((prev) => !prev)}
                          className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase border cursor-pointer transition-all ${
                            newUnlimitedStock
                              ? 'bg-emerald-500 text-slate-950 border-emerald-300 shadow'
                              : 'bg-slate-900 text-sky-300 border-sky-500/40 hover:border-sky-400'
                          }`}
                        >
                          {newUnlimitedStock ? '✓ Cheklanmagan' : 'Cheklanmagan'}
                        </button>
                      </div>
                      {newUnlimitedStock ? (
                        <div className="w-full px-3.5 py-2.5 bg-emerald-500/15 border border-emerald-400/50 rounded-xl text-emerald-300 text-xs sm:text-sm font-mono font-black text-center">
                          Cheklanmagan miqdor
                        </div>
                      ) : (
                        <input
                          type="text"
                          inputMode="numeric"
                          placeholder="Omborda mavjud miqdor"
                          value={newStock}
                          onChange={(e) => {
                            const cleanDigits = e.target.value.replace(/\D/g, '');
                            const val = cleanDigits !== '' ? Number(cleanDigits) : '';
                            setNewStock(val);
                          }}
                          className="w-full px-3.5 py-2.5 bg-slate-900 border border-sky-500/50 rounded-xl text-white text-xs sm:text-sm font-mono font-bold focus:outline-none focus:border-sky-400"
                        />
                      )}
                    </div>
                  </div>
                )}

                {/* Ishlab chiqarilgan davlat — Faqat B2C kabinetida ko'rinadi (B2B da kerak emas) */}
                {supplierData.cabinetType !== 'manufacturer' && (
                  <div className="pt-3 border-t border-slate-800/80 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <label className="text-slate-200 font-black text-xs sm:text-sm flex items-center gap-2">
                        <Globe className="w-4 h-4 text-amber-400" />
                        <span>Ishlab chiqarilgan davlat:</span>
                      </label>
                    </div>
                    <input
                      type="text"
                      value={newManufacturer}
                      onChange={(e) => setNewManufacturer(e.target.value.replace(/[0-9]/g, ''))}
                      placeholder=""
                      className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-xl text-white text-xs sm:text-sm font-bold focus:outline-none focus:border-amber-500"
                    />
                  </div>
                )}
              </div>

              {/* 2. MAHSULOT SURATLARI (Majburiy — 12 tagacha) VA MAHSULOTNING VIDEO TAVSIFI */}
              <div className="space-y-3 p-4 sm:p-5 rounded-2xl bg-slate-950 border border-slate-800">
                <div className="flex items-center justify-between">
                  <label className="text-slate-200 font-black text-xs sm:text-sm flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-amber-500 text-slate-950 font-black text-[11px] flex items-center justify-center">
                      2
                    </span>
                    <ImageIcon className="w-4 h-4 text-amber-400" />
                    <span>Mahsulot Suratlari:</span>
                    <span className="px-2 py-0.5 rounded-md bg-red-500/20 text-red-300 border border-red-500/40 text-[10px] font-black uppercase">
                      Majburiy
                    </span>
                  </label>
                  <span
                    className={`text-xs font-mono font-bold ${
                      newImages.length === 0
                        ? 'text-red-400'
                        : newImages.length >= 12
                        ? 'text-amber-400'
                        : 'text-emerald-400'
                    }`}
                  >
                    {newImages.length} / 12 ta yuklandi
                  </span>
                </div>

                {newImages.length < 12 && (
                  <label className="flex items-center justify-center gap-3 p-4 bg-slate-900/60 hover:bg-slate-900 border-2 border-dashed border-amber-500/50 hover:border-amber-400 rounded-2xl text-slate-300 transition-all cursor-pointer group">
                    <div className="p-2 rounded-xl bg-amber-500/15 text-amber-400 border border-amber-500/30 group-hover:scale-110 transition-transform">
                      <Upload className="w-5 h-5" />
                    </div>
                    <span className="text-xs sm:text-sm font-bold text-white">Surat yuklash</span>
                    <input
                      type="file"
                      multiple
                      accept="image/*"
                      onChange={handleMultiImageUpload}
                      className="hidden"
                    />
                  </label>
                )}

                {newImages.length > 0 && (
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-2.5 pt-1">
                    {newImages.map((img, idx) => (
                      <div
                        key={idx}
                        className="relative rounded-xl overflow-hidden border border-slate-800 aspect-square group bg-slate-900"
                      >
                        <img src={img} alt={`Rasm ${idx + 1}`} className="w-full h-full object-cover" />
                        {idx === 0 && (
                          <span className="absolute top-1 left-1 bg-amber-500 text-slate-950 font-black text-[9px] px-1.5 py-0.5 rounded shadow">
                            Asosiy
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => handleRemoveImage(idx)}
                          className="absolute top-1 right-1 p-1 rounded-md bg-red-600/90 hover:bg-red-500 text-white transition-opacity cursor-pointer shadow"
                          title="O‘chirish"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Mahsulotning video tavsifi */}
                <div className="pt-3 border-t border-slate-800/80 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-200 font-black text-xs sm:text-sm">
                      Mahsulotning video tavsifi (YouTube video havolasi):
                    </span>
                    {newVideoUrl && (
                      <button
                        type="button"
                        onClick={() => setNewVideoUrl('')}
                        className="text-[11px] text-red-400 hover:underline cursor-pointer"
                      >
                        Havolani o‘chirish
                      </button>
                    )}
                  </div>
                  <input
                    type="text"
                    placeholder="Mahsulot video tavsifi havolasini kiriting"
                    value={newVideoUrl.startsWith('data:') ? '' : newVideoUrl}
                    onChange={(e) => setNewVideoUrl(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-900 border border-emerald-500/50 rounded-xl text-white text-xs font-mono focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              {/* 3. MAVJUDLIGI: O'lchov birligi (har birining pastidan raqam kiritish bilan) va Rang tanlash */}
              <div className="space-y-4 p-4 sm:p-6 rounded-2xl bg-slate-950 border-2 border-amber-500/40">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
                  <div
                    onClick={() => setIsMavjudlikSectionCollapsed((prev) => !prev)}
                    className="cursor-pointer select-none"
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-amber-500 text-slate-950 font-black text-[11px] flex items-center justify-center">
                        3
                      </span>
                      <Layers className="w-4 h-4 text-amber-400" />
                      <span className="text-sm sm:text-base font-black text-amber-400 uppercase tracking-wider">
                        Mavjudligi (O‘lchov birligi va Rang tanlash):
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
                    <button
                      type="button"
                      onClick={() => setIsMavjudlikSectionCollapsed((prev) => !prev)}
                      className="px-3.5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-amber-400 border border-amber-500/40 font-mono font-black text-xs cursor-pointer transition-colors"
                    >
                      {isMavjudlikSectionCollapsed ? 'Ochish ▼' : 'Yig‘ish ▲'}
                    </button>
                  </div>
                </div>

                {!isMavjudlikSectionCollapsed && (
                  <div className="space-y-4 animate-fadeIn">
                    {draftVariants.slice(0, 1).map((variant, vIdx) => {
                      const currentUnitNum = variant.unitValues?.[variant.unit]?.trim() || '';
                      const displaySpecLabel = currentUnitNum
                        ? `${currentUnitNum} ${variant.unit}`
                        : variant.specification || `1 ${variant.unit}`;

                      return (
                        <div
                          key={variant.id}
                          className="p-4 sm:p-5 rounded-2xl border bg-slate-900 border-slate-700 space-y-4 relative transition-all"
                        >
                          {/* A) O'lchov birligi tanlash va har bir o'lchov birligida pastidan raqam kiritish */}
                          <div className="space-y-2.5">
                            <div className="flex items-center justify-between">
                              <label className="text-slate-200 font-bold flex items-center gap-1.5 text-xs sm:text-sm">
                                <Scale className="w-3.5 h-3.5 text-amber-400" />
                                <span>O‘lchov Birligi (pastidan raqam kiriting):</span>
                              </label>
                              <span className="text-[11px] text-amber-400 font-mono font-bold">
                                Tanlangan: {displaySpecLabel}
                              </span>
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                              {['Kv', 'metr', 'kg', 'dona'].map((u) => {
                                const isUnitSelected = variant.unit === u;
                                const unitNumVal = variant.unitValues?.[u] ?? '';
                                return (
                                  <div
                                    key={u}
                                    className={`p-2.5 rounded-xl border transition-all space-y-2 ${
                                      isUnitSelected
                                        ? 'bg-amber-500/15 border-amber-400 shadow-md'
                                        : 'bg-slate-950 border-slate-800 hover:border-amber-400/50'
                                    }`}
                                  >
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const currentNum = variant.unitValues?.[u] || '';
                                        handleUpdateDraftVariant(variant.id, {
                                          unit: u,
                                          specification: currentNum ? `${currentNum} ${u}` : '',
                                          isSaved: false,
                                        });
                                        if (vIdx === 0) setNewUnit(u);
                                      }}
                                      className={`w-full py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                                        isUnitSelected
                                          ? 'bg-amber-500 text-slate-950 font-black shadow'
                                          : 'bg-slate-900 text-slate-300 hover:text-white'
                                      }`}
                                    >
                                      <span>{u}</span>
                                      {isUnitSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                                    </button>

                                    <input
                                      type="text"
                                      inputMode="decimal"
                                      placeholder=""
                                      value={unitNumVal}
                                      onFocus={() => {
                                        if (variant.unit !== u) {
                                          const currentNum = variant.unitValues?.[u] || '';
                                          handleUpdateDraftVariant(variant.id, {
                                            unit: u,
                                            specification: currentNum ? `${currentNum} ${u}` : '',
                                          });
                                          if (vIdx === 0) setNewUnit(u);
                                        }
                                      }}
                                      onChange={(e) => {
                                        const rawVal = e.target.value.replace(/[^0-9.]/g, '');
                                        const nextUnitValues = {
                                          ...(variant.unitValues || { Kv: '', metr: '', kg: '', dona: '' }),
                                          [u]: rawVal,
                                        };
                                        handleUpdateDraftVariant(variant.id, {
                                          unit: u,
                                          unitValues: nextUnitValues,
                                          specification: rawVal ? `${rawVal} ${u}` : '',
                                          isSaved: false,
                                        });
                                        if (vIdx === 0) setNewUnit(u);
                                      }}
                                      className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 focus:border-amber-400 rounded-lg text-white text-xs font-mono font-bold text-center focus:outline-none"
                                    />
                                  </div>
                                );
                              })}
                            </div>
                          </div>

                          {/* B) Rang tanlash imkoni (32 xil asosiy rang palitrasi) */}
                          <div className="space-y-2 pt-2 border-t border-slate-800/80">
                            <div className="flex items-center justify-between">
                              <label className="text-slate-200 font-bold flex items-center gap-1.5 text-xs sm:text-sm">
                                <Palette className="w-3.5 h-3.5 text-amber-400" />
                                <span>Rang tanlash ({displaySpecLabel} uchun):</span>
                              </label>
                              <span className="text-[11px] font-mono font-bold text-emerald-400">
                                {variant.colors.length} / 12 ta rang tanlandi
                              </span>
                            </div>

                            <button
                              type="button"
                              onClick={() =>
                                handleUpdateDraftVariant(variant.id, { isColorOpen: !variant.isColorOpen })
                              }
                              className={`w-full flex items-center justify-between px-4 py-2.5 rounded-xl border font-bold text-xs transition-all cursor-pointer ${
                                variant.isColorOpen
                                  ? 'bg-amber-500 text-slate-950 border-amber-400 font-black'
                                  : 'bg-slate-950 text-slate-200 border-slate-800 hover:border-amber-500/50'
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                <Palette className="w-4 h-4 text-amber-400" />
                                <span>Ranglar palitrasi (32 xil asosiy rangdan tanlash)</span>
                              </div>
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-900 text-amber-400 font-mono font-black">
                                {variant.isColorOpen ? 'Yopish ▲' : 'Ochish ▼'}
                              </span>
                            </button>

                            {variant.isColorOpen && (
                              <div className="p-3 bg-slate-950 border border-slate-800 rounded-2xl max-h-52 overflow-y-auto">
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                                  {PALETTE_32_COLORS.map((col) => {
                                    const isSel = variant.colors.includes(col.name);
                                    return (
                                      <button
                                        key={col.name}
                                        type="button"
                                        onClick={() => handleToggleVariantColor(variant.id, col.name)}
                                        className={`p-2 rounded-xl border text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                                          isSel
                                            ? 'bg-amber-500 text-slate-950 border-amber-300 font-black shadow-md'
                                            : 'bg-slate-900 text-slate-300 border-slate-800 hover:border-amber-400/50'
                                        }`}
                                      >
                                        <span
                                          className="w-3.5 h-3.5 rounded-full border border-slate-600 shrink-0"
                                          style={{ backgroundColor: col.bg }}
                                        />
                                        <span className="truncate text-[11px]">{col.name}</span>
                                        {isSel && <Check className="w-3 h-3 stroke-[3] ml-auto shrink-0" />}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            )}

                            {variant.colors.length > 0 && (
                              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                                {variant.colors.map((colName) => {
                                  const colObj = PALETTE_32_COLORS.find((c) => c.name === colName);
                                  return (
                                    <span
                                      key={colName}
                                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-slate-950 border border-slate-700 text-white text-xs font-medium"
                                    >
                                      {colObj && (
                                        <span
                                          className="w-2.5 h-2.5 rounded-full border border-slate-500"
                                          style={{ backgroundColor: colObj.bg }}
                                        />
                                      )}
                                      <span>{colName}</span>
                                      <button
                                        type="button"
                                        onClick={() => handleToggleVariantColor(variant.id, colName)}
                                        className="text-slate-400 hover:text-white p-0.5 rounded cursor-pointer"
                                      >
                                        <X className="w-3 h-3" />
                                      </button>
                                    </span>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* 4. MAHSULOT HAQIDA IZOH VA RASMLI TAVSIF */}
              <div className="space-y-4 p-4 sm:p-5 rounded-2xl bg-slate-950 border border-slate-800">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-slate-200 font-black text-xs sm:text-sm flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-amber-500 text-slate-950 font-black text-[11px] flex items-center justify-center">
                        4
                      </span>
                      <span>Mahsulot haqida izoh va tavsif:</span>
                    </label>
                    <span
                      className={`text-[10px] font-mono ${
                        newDesc.length >= 300
                          ? 'text-red-400 font-bold'
                          : newDesc.length >= 250
                          ? 'text-amber-400 font-bold'
                          : 'text-slate-500'
                      }`}
                    >
                      {newDesc.length} / 300
                    </span>
                  </div>
                  <textarea
                    rows={3}
                    maxLength={300}
                    value={newDesc}
                    onChange={(e) => setNewDesc(e.target.value.slice(0, 300))}
                    placeholder="Mahsulot sifati, qo‘llanilishi va afzalliklari haqida qisqacha ma’lumot..."
                    className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-white text-xs focus:outline-none focus:border-amber-500 resize-none"
                  />
                </div>

                <div className="space-y-3 pt-3 border-t border-slate-800/70">
                  <div className="flex items-center justify-between">
                    <label className="text-slate-200 font-black text-xs sm:text-sm flex items-center gap-1.5">
                      <ImageIcon className="w-4 h-4 text-amber-400" />
                      <span>Mahsulot haqida rasmli tavsif:</span>
                    </label>
                    <span className="text-xs font-mono font-black text-amber-400">
                      {detailBlocks.length} / 4 ta
                    </span>
                  </div>

                  {detailBlocks.length < 4 && (
                    <label className="flex items-center justify-center gap-2 p-3 bg-slate-900 hover:bg-slate-800 border-2 border-dashed border-amber-500/50 rounded-xl text-amber-400 font-black text-xs cursor-pointer transition-colors">
                      <Upload className="w-4 h-4" />
                      <span>Tavsif uchun rasm qo‘shish ({4 - detailBlocks.length} ta joy qoldi)</span>
                      <input
                        type="file"
                        multiple
                        accept="image/*"
                        onChange={handleAddDetailBlockImage}
                        className="hidden"
                      />
                    </label>
                  )}

                  {detailBlocks.length > 0 && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-1">
                      {detailBlocks.map((block, bIdx) => (
                        <div
                          key={bIdx}
                          className="flex flex-col rounded-2xl bg-slate-900 border border-slate-700 overflow-hidden shadow-md"
                        >
                          <div className="px-3.5 py-2 bg-slate-950 border-b border-slate-800 flex items-center justify-between gap-2">
                            <span className="text-xs font-mono text-amber-400 font-black">
                              Mahsulot haqida ma'lumot #{bIdx + 1}
                            </span>
                            <div className="flex items-center gap-2">
                              <label className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-sky-300 text-[11px] font-bold cursor-pointer transition-colors">
                                Rasmni almashtirish
                                <input
                                  type="file"
                                  accept="image/*"
                                  onChange={(e) => handleReplaceDetailBlockImage(bIdx, e)}
                                  className="hidden"
                                />
                              </label>
                              <button
                                type="button"
                                onClick={() => handleRemoveDetailBlock(bIdx)}
                                className="px-2 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                              >
                                <X className="w-3.5 h-3.5" />
                                <span>O‘chirish</span>
                              </button>
                            </div>
                          </div>

                          {/* Yuklangan rasm kichik bo'lsa ham to'liq ko'rinishi uchun object-contain */}
                          <div className="relative h-44 w-full bg-slate-950 border-b border-slate-800 flex items-center justify-center p-2">
                            <img
                              src={block.image}
                              alt={`Tavsif ${bIdx + 1}`}
                              className="max-w-full max-h-full w-auto h-auto object-contain rounded-lg"
                            />
                          </div>

                          <div className="p-3 space-y-1.5">
                            <label className="text-xs font-mono text-amber-400 font-bold block">
                              #{bIdx + 1} Rasm izohi:
                            </label>
                            <textarea
                              rows={3}
                              value={block.text}
                              onChange={(e) => handleUpdateDetailBlockText(bIdx, e.target.value)}
                              placeholder="Ushbu rasm bo‘yicha mahsulot tavsifini yozing..."
                              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 focus:border-amber-400 rounded-xl text-white text-xs focus:outline-none resize-none"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* 5. SMS TASDIQLASH VA PAROL TASDIQLASH ORQALI BUNKERGA CHIQARISH / TAHRIRLASH */}
              {(editingProduct || addProductChannel === 'online') && prodPassPromptOpen ? (
                <div className="space-y-3.5 bg-slate-950 p-4 sm:p-5 rounded-2xl border border-amber-500/50 shadow-lg shadow-amber-500/10 animate-fadeIn">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <label className="text-amber-400 font-black flex items-center gap-2 text-xs sm:text-sm">
                      <span className="w-5 h-5 rounded-full bg-amber-500 text-slate-950 font-black text-[11px] flex items-center justify-center">
                        5
                      </span>
                      <Lock className="w-3.5 h-3.5 text-amber-400" />
                      <span>SMS tasdiqlash va Kabinet paroli:</span>
                    </label>
                    <button
                      type="button"
                      onClick={handleSendProductSms}
                      className="px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-[11px] cursor-pointer"
                    >
                      {prodSmsSent ? 'SMS kodni qayta yuborish' : 'SMS kod yuborish'}
                    </button>
                  </div>

                  {prodSmsNotice && (
                    <div className="p-2.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-mono font-bold">
                      {prodSmsNotice}
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-slate-300 font-bold text-xs block">
                        6 xonali SMS tasdiqlash kodi:
                      </label>
                      <input
                        type="text"
                        inputMode="numeric"
                        maxLength={6}
                        autoFocus
                        value={prodSmsInput}
                        onChange={(e) => {
                          setProdSmsInput(e.target.value.replace(/\D/g, '').slice(0, 6));
                          setProductConfirmError(null);
                        }}
                        placeholder="6 xonali SMS kod..."
                        className="w-full px-3.5 py-2.5 bg-slate-900 border border-emerald-500/60 rounded-xl text-white text-sm focus:outline-none focus:border-emerald-400 font-mono tracking-widest"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-slate-300 font-bold text-xs block">
                        {editingProduct
                          ? "Kabinet paroli (saqlash uchun):"
                          : "Kabinet paroli (Bunkerga chiqarish uchun):"}
                      </label>
                      <div className="relative">
                        <input
                          type={showProdPass ? 'text' : 'password'}
                          value={prodPassInput}
                          onChange={(e) => {
                            setProdPassInput(e.target.value);
                            setProductConfirmError(null);
                          }}
                          placeholder="Kabinet parolini kiriting..."
                          className="w-full px-3.5 py-2.5 pr-11 bg-slate-900 border border-amber-500/60 rounded-xl text-white text-sm focus:outline-none focus:border-amber-400 font-mono"
                        />
                        <button
                          type="button"
                          onClick={() => setShowProdPass((prev) => !prev)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-amber-400 transition-colors cursor-pointer"
                        >
                          {showProdPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                  </div>

                  {productConfirmError && (
                    <p className="text-red-400 text-xs font-bold">{productConfirmError}</p>
                  )}
                </div>
              ) : (
                productConfirmError && (
                  <div className="p-3 rounded-xl bg-red-500/15 border border-red-500/40">
                    <p className="text-red-400 text-xs font-bold">{productConfirmError}</p>
                  </div>
                )
              )}

              {/* 6. TASDIQLASH VA BUNKERGA CHIQARISH / O'ZGARISHLARNI SAQLASH TUGMASI */}
              <div className="flex flex-wrap items-center justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setIsAddProductOpen(false);
                    setEditingProduct(null);
                    setProdPassPromptOpen(false);
                    setProdPassInput('');
                  }}
                  className="px-5 py-3 rounded-xl bg-slate-800 text-slate-300 font-bold cursor-pointer hover:bg-slate-700 transition-colors"
                >
                  Bekor qilish
                </button>

                <button
                  type="submit"
                  className="flex items-center gap-2 px-7 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs sm:text-sm shadow-lg shadow-amber-500/25 active:scale-95 transition-all cursor-pointer"
                >
                  {prodPassPromptOpen && (editingProduct || addProductChannel === 'online') ? (
                    <Lock className="w-4 h-4" />
                  ) : (
                    <Globe className="w-4 h-4" />
                  )}
                  <span>
                    {editingProduct
                      ? !prodPassPromptOpen
                        ? 'O‘zgarishlarni saqlash'
                        : 'Tasdiqlash va O‘zgarishlarni saqlash'
                      : addProductChannel === 'offline'
                      ? 'Oflayn mahsulotlarga saqlash'
                      : !prodPassPromptOpen
                      ? 'Bunkerga chiqarish'
                      : 'Tasdiqlash va Bunkerga chiqarish'}
                  </span>
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* B2B Yuk Xati va Ta'minotchi Korxona Ma'lumotlari Modali (PDF chiqarib olish bilan) */}
      {previewB2bManifest && (
        <div
          className="fixed inset-0 z-[75] flex items-center justify-center p-3 sm:p-5 bg-black/85 backdrop-blur-md animate-fadeIn"
          onClick={() => setPreviewB2bManifest(null)}
        >
          <div
            className="bg-slate-950 border-2 border-amber-500/60 rounded-3xl max-w-4xl w-full p-5 sm:p-7 space-y-5 shadow-2xl relative max-h-[92vh] overflow-y-auto text-xs"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-2xl bg-amber-500/20 text-[#FFB800] border border-amber-500/40">
                  <FileText className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-base sm:text-xl font-black text-white">
                      B2B Yuk Ro‘yxati va Ta’minotchi Ma’lumotlari (#{previewB2bManifest.id})
                    </h3>
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-amber-500/20 text-amber-300 border border-amber-500/40">
                      Rasmiy B2B Hujjat
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Sana: {new Date(previewB2bManifest.createdAt).toLocaleString('uz-UZ')}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handlePrintOrDownloadB2bPdf(previewB2bManifest)}
                  className="px-4 py-2.5 rounded-xl bg-[#FFB800] hover:bg-[#FFC928] text-slate-950 font-black text-xs flex items-center gap-1.5 cursor-pointer shadow-lg"
                >
                  <Download className="w-4 h-4" />
                  <span>Yuk ro‘yxati PDF chiqarib olish</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewB2bManifest(null)}
                  className="p-2.5 rounded-xl bg-slate-900 hover:bg-red-600 text-slate-300 hover:text-white border border-slate-800 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-1.5">
                <div className="text-amber-400 font-black uppercase text-[11px] pb-1 border-b border-slate-800">
                  1. Sotib Oluvchi Ta’minotchi Korxona Ma’lumotlari
                </div>
                <div>Korxona: <strong className="text-white">{previewB2bManifest.buyerCompanyName}</strong></div>
                <div>STIR (INN): <strong className="text-[#FFB800] font-mono">{previewB2bManifest.buyerInn || '—'}</strong></div>
                <div>Rahbar (Direktor): <strong className="text-white">{previewB2bManifest.buyerDirector || '—'}</strong></div>
                <div>Telefon: <strong className="text-emerald-400 font-mono">{previewB2bManifest.buyerPhone}</strong></div>
                <div>Manzil: <strong className="text-sky-300">{previewB2bManifest.buyerAddress || previewB2bManifest.buyerRegion}</strong></div>
                <div>Shartnoma: <strong className="text-amber-300 font-mono">{previewB2bManifest.buyerContractNumber || '—'}</strong></div>
              </div>

              <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-1.5">
                <div className="text-emerald-400 font-black uppercase text-[11px] pb-1 border-b border-slate-800">
                  2. Yetkazib Beruvchi B2B Ta’minotchi Ma’lumotlari
                </div>
                <div>B2B Korxona: <strong className="text-white">{previewB2bManifest.manufacturerCompanyName}</strong></div>
                <div>STIR: <strong className="text-[#FFB800] font-mono">{previewB2bManifest.manufacturerInn || '—'}</strong></div>
                <div>Telefon: <strong className="text-emerald-400 font-mono">{previewB2bManifest.manufacturerPhone || '—'}</strong></div>
                <div>Hudud: <strong className="text-white">{previewB2bManifest.manufacturerRegion || '—'}</strong></div>
                {previewB2bManifest.bankAccountDetails && (
                  <div>
                    Hisob raqam: <strong className="text-emerald-400 font-mono">{previewB2bManifest.bankAccountDetails}</strong>
                  </div>
                )}
                <div>
                  Holati:{' '}
                  <strong className="text-amber-300">
                    {previewB2bManifest.status === 'requested'
                      ? 'So‘rov yuborilgan (B2B tasdiqlashi kutilmoqda)'
                      : previewB2bManifest.status === 'approved_awaiting_payment'
                      ? 'So‘rov qabul qilingan — Hisob raqam jo‘natildi (To‘lov kutilmoqda)'
                      : previewB2bManifest.status === 'paid'
                      ? 'To‘lov jo‘natildi — Tayyorlash kutilmoqda'
                      : previewB2bManifest.status === 'preparing'
                      ? 'Mahsulot yuklash jarayonida'
                      : previewB2bManifest.status === 'in_transit'
                      ? 'Yetkazilmoqda'
                      : 'Yetkazilgan (Yakunlangan)'}
                  </strong>
                </div>
              </div>
            </div>

            <div className="overflow-x-auto rounded-2xl border border-slate-800">
              <table className="w-full text-left text-xs text-slate-200">
                <thead className="bg-slate-900 text-slate-400 uppercase text-[10px]">
                  <tr>
                    <th className="py-2.5 px-3 font-black">№</th>
                    <th className="py-2.5 px-3 font-black">Olinayotgan Yuk (Mahsulot)</th>
                    <th className="py-2.5 px-3 font-black">Xususiyat / Rang</th>
                    <th className="py-2.5 px-3 font-black">Miqdori</th>
                    <th className="py-2.5 px-3 font-black">Narxi</th>
                    <th className="py-2.5 px-3 font-black text-right">Jami Summa</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 bg-slate-950">
                  {previewB2bManifest.items.map((it, idx) => (
                    <tr key={idx}>
                      <td className="py-2.5 px-3 font-mono font-bold text-amber-400">{idx + 1}</td>
                      <td className="py-2.5 px-3 font-bold text-white">{it.title}</td>
                      <td className="py-2.5 px-3 text-slate-300">
                        {[it.specification, it.color].filter(Boolean).join(' • ') || 'Standart'}
                      </td>
                      <td className="py-2.5 px-3 font-mono font-black text-amber-300">
                        {it.quantity} {it.unit}
                      </td>
                      <td className="py-2.5 px-3 font-mono">{formatPrice(it.price)}</td>
                      <td className="py-2.5 px-3 font-mono font-black text-emerald-400 text-right">
                        {formatPrice(it.totalSum)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between pt-2">
              <span className="text-slate-400">
                Jami mahsulot turlari: <strong className="text-white">{previewB2bManifest.items.length} xil</strong>
              </span>
              <div className="text-base sm:text-lg font-black text-white">
                Jami To‘lov Summasi:{' '}
                <span className="text-emerald-400 font-mono">{formatPrice(previewB2bManifest.totalAmount)}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Mijoz olgan mahsulotlar ro'yxatini ko'rish modali */}
      {selectedCustomerProductsModal && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-5 bg-black/85 backdrop-blur-md animate-fadeIn"
          onClick={() => setSelectedCustomerProductsModal(null)}
        >
          <div
            className="bg-slate-950 border-2 border-amber-500/60 rounded-3xl max-w-lg w-full p-5 sm:p-6 space-y-4 shadow-2xl relative text-xs"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-800">
              <div>
                <h3 className="text-base sm:text-lg font-black text-white">
                  Olingan Mahsulotlar Ro‘yxati
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  {supplierData.cabinetType === 'manufacturer' ? (
                    <span className="text-amber-300 font-bold">Xaridor: Mijoz</span>
                  ) : (
                    <>
                      {selectedCustomerProductsModal.name} •{' '}
                      <span className="text-emerald-400 font-mono">{selectedCustomerProductsModal.phone}</span>
                    </>
                  )}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedCustomerProductsModal(null)}
                className="p-2 rounded-xl bg-slate-900 hover:bg-red-600 text-slate-300 hover:text-white border border-slate-800 cursor-pointer transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="max-h-72 overflow-y-auto space-y-2 pr-1">
              {(selectedCustomerProductsModal.productsBought || selectedCustomerProductsModal.products || []).map((prod: string, idx: number) => (
                <div
                  key={idx}
                  className="p-3 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between gap-2 text-slate-200 font-bold"
                >
                  <span>{idx + 1}. {prod}</span>
                </div>
              ))}
            </div>

            <div className="pt-3 border-t border-slate-800 flex items-center justify-between gap-3">
              <div>
                <span className="text-[11px] text-slate-400 block">Jami xarid summasi:</span>
                <span className="text-sm font-black text-[#FFB800]">
                  {formatPrice(selectedCustomerProductsModal.totalSpent || 0)}
                </span>
              </div>
              <button
                type="button"
                onClick={() => handlePrintOrDownloadCustomerOrderPdf(selectedCustomerProductsModal)}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#FFB800] hover:bg-amber-400 text-slate-950 font-black text-xs transition-all cursor-pointer shadow-md"
              >
                <Download className="w-4 h-4" />
                <span>Ro‘yxatni PDF chiqarib olish</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mijoz manzili va lokatsiyasini xaritadan ko'rish modali (Google Maps) */}
      {selectedMapCustomer && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-5 bg-black/85 backdrop-blur-md animate-fadeIn"
          onClick={() => setSelectedMapCustomer(null)}
        >
          <div
            className="bg-slate-950 border-2 border-amber-500/60 rounded-3xl max-w-3xl w-full p-5 sm:p-6 space-y-4 shadow-2xl relative text-xs"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-2xl bg-amber-500/20 text-[#FFB800] border border-amber-500/40">
                  <MapPin className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-black text-white">
                    Mijoz Yetkazish Manzili va Lokatsiyasi
                  </h3>
                  <p className="text-xs text-slate-400">
                    {supplierData.cabinetType === 'manufacturer' ? (
                      <span className="text-amber-300 font-bold">Xaridor: Mijoz</span>
                    ) : (
                      <>
                        {selectedMapCustomer.name}
                        {selectedMapCustomer.phone && (
                          <>
                            {' • '}
                            <span className="text-emerald-400 font-mono">{selectedMapCustomer.phone}</span>
                          </>
                        )}
                      </>
                    )}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSupplierMapType(supplierMapType === 'm' ? 'k' : 'm')}
                  className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-[#FFB800] border border-slate-700 font-bold text-xs cursor-pointer flex items-center gap-1.5"
                >
                  <Globe className="w-3.5 h-3.5" />
                  <span>{supplierMapType === 'm' ? "Sun'iy yo'ldosh" : 'Xarita'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedMapCustomer(null)}
                  className="p-2 rounded-xl bg-slate-900 hover:bg-red-600 text-slate-300 hover:text-white border border-slate-800 cursor-pointer transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-start gap-2">
                <MapPin className="w-4 h-4 text-[#FFB800] shrink-0 mt-0.5" />
                <div>
                  <span className="text-[#FFB800] font-black text-xs sm:text-sm block">
                    {formatRegionAndDistrictOnly(selectedMapCustomer.address)}
                  </span>
                  <span className="text-slate-300 font-medium text-xs block mt-0.5">
                    {formatCleanFullAddress(selectedMapCustomer.address)}
                  </span>
                </div>
              </div>
              {selectedMapCustomer.coords && (
                <span className="px-2.5 py-1 rounded-lg bg-slate-950 border border-amber-500/40 text-[#FFB800] font-mono font-bold text-[11px] shrink-0">
                  {selectedMapCustomer.coords.lat.toFixed(5)}, {selectedMapCustomer.coords.lng.toFixed(5)}
                </span>
              )}
            </div>

            <div className="relative w-full h-80 sm:h-96 rounded-2xl overflow-hidden border-2 border-slate-800 bg-slate-900">
              <iframe
                title="Mijoz Yetkazish Lokatsiyasi"
                width="100%"
                height="100%"
                style={{ border: 0 }}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                src={`https://maps.google.com/maps?q=${encodeURIComponent(
                  selectedMapCustomer.coords
                    ? `${selectedMapCustomer.coords.lat},${selectedMapCustomer.coords.lng}`
                    : `${selectedMapCustomer.address.replace(/\[Google Maps:.*?\]/gi, '').trim()}, Uzbekistan`
                )}&hl=uz&z=16&t=${supplierMapType}&output=embed`}
              />
            </div>

            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={() => setSelectedMapCustomer(null)}
                className="px-5 py-2.5 rounded-xl bg-[#FFB800] hover:bg-[#FFC928] text-slate-950 font-black text-xs cursor-pointer"
              >
                Yopish
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PAROL ASOSIDA MAHSULOTNI O'CHIRISHNI TASDIQLASH MODALI */}
      {productToDelete && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center p-3 sm:p-5 bg-black/85 backdrop-blur-md animate-fadeIn"
          onClick={() => setProductToDelete(null)}
        >
          <div
            className="bg-[#1C1915] border-2 border-[#FFB800]/60 rounded-3xl max-w-md w-full p-5 sm:p-6 space-y-4 shadow-2xl relative text-xs"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 pb-3 border-b border-[#4A4030]">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-2xl bg-red-500/20 text-red-400 border border-red-500/40">
                  <Lock className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-[#FFF8E7]">
                    Mahsulotni Parol Orqali O‘chirish
                  </h3>
                  <p className="text-[11px] text-[#D4C5A9]">
                    Xavfsizlik uchun kabinet parolini kiriting
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setProductToDelete(null)}
                className="p-2 rounded-xl bg-[#2B251D] hover:bg-red-600 text-slate-300 hover:text-white border border-[#5C503A] cursor-pointer transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3.5 rounded-2xl bg-[#14120E] border border-[#5C503A] flex items-center gap-3">
              <img
                src={productToDelete.image}
                alt={productToDelete.title}
                className="w-12 h-12 rounded-xl object-cover border border-[#5C503A] shrink-0"
              />
              <div className="min-w-0">
                <div className="text-[10px] font-mono text-[#FFB800] font-bold">
                  {productToDelete.category} • 1 {productToDelete.unit}
                </div>
                <div className="text-sm font-black text-white truncate">
                  {productToDelete.title}
                </div>
                <div className="text-xs font-mono text-emerald-400 font-bold">
                  {formatPrice(productToDelete.price)}
                </div>
              </div>
            </div>

            <form onSubmit={handleConfirmDeleteProductWithPassword} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[#FFF8E7] font-bold flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-[#FFB800]" />
                  <span>Kabinet Kirish Parolini Kiriting:</span>
                </label>
                <div className="relative">
                  <input
                    type={showDeleteProductPass ? 'text' : 'password'}
                    autoFocus
                    value={deleteProductPassword}
                    onChange={(e) => {
                      setDeleteProductPassword(e.target.value);
                      setDeleteProductPasswordError(null);
                    }}
                    placeholder="Kabinet parolini kiriting..."
                    className="w-full pr-10 pl-3.5 py-3 bg-[#14120E] border border-[#6B5B40] focus:border-[#FFB800] rounded-xl text-white text-xs font-mono focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowDeleteProductPass(!showDeleteProductPass)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white cursor-pointer"
                  >
                    {showDeleteProductPass ? (
                      <EyeOff className="w-4 h-4 text-[#FFB800]" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              {deleteProductPasswordError && (
                <div className="p-3 rounded-xl bg-red-500/20 border border-red-500/40 text-red-300 font-bold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{deleteProductPasswordError}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setProductToDelete(null)}
                  className="px-4 py-2.5 rounded-xl bg-[#2B251D] hover:bg-[#3A3227] text-[#E6DCC8] font-bold text-xs cursor-pointer"
                >
                  Bekor qilish
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-black text-xs flex items-center gap-1.5 cursor-pointer shadow-lg active:scale-95 transition-all"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Tasdiqlash va O‘chirish</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          CRM QARZGA YOZISH MODALI (Faqat oflayn CRM savdoda ishlaydi)
          ========================================================================= */}
      {isCrmDebtModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fadeIn"
          onClick={() => setIsCrmDebtModalOpen(false)}
        >
          <div
            className="bg-[#0A1931] border-2 border-[#FFB800] rounded-3xl max-w-lg w-full p-5 sm:p-6 space-y-4 shadow-2xl text-xs text-white"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 pb-3 border-b border-[#1E3A6D]">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-2xl bg-amber-500/20 text-[#FFB800] border border-amber-500/40">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-white">
                    Qarzga Rasmiylashtirish ({activeCrmBasket.name})
                  </h3>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsCrmDebtModalOpen(false)}
                className="p-2 rounded-xl bg-[#071326] hover:bg-blue-600 text-sky-200 hover:text-white border border-[#1E3A6D] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleConfirmCrmDebtSale} className="space-y-4">
              <div className="p-3.5 rounded-2xl bg-[#071326] border border-[#1E3A6D] space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sky-200 font-bold">Savat Jami Summasi:</span>
                  <span className="font-mono font-black text-base text-[#FFB800]">
                    {formatPrice(crmCalculation.totalOriginalSum)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sky-200 font-bold">Kiritilgan Qarz Miqdori:</span>
                  <span className="font-mono font-black text-sm text-red-400">
                    {formatPrice(Math.min(crmCalculation.totalOriginalSum, Math.max(0, Number(debtAmountInput) || 0)))}
                  </span>
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-[#1E3A6D]">
                  <span className="text-emerald-300 font-bold">Oflayn savdoda hisoblanadigan to‘lov:</span>
                  <span className="font-mono font-black text-sm text-emerald-400">
                    {formatPrice(
                      Math.max(
                        0,
                        crmCalculation.totalOriginalSum -
                          Math.min(crmCalculation.totalOriginalSum, Math.max(0, Number(debtAmountInput) || 0))
                      )
                    )}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5 relative">
                  <label className="text-white font-bold block">Qarzdor Ismi va Familiyasi:</label>
                  <input
                    type="text"
                    required
                    value={debtCustomerName}
                    onFocus={() => setShowDebtorSuggestions(true)}
                    onBlur={() => setTimeout(() => setShowDebtorSuggestions(false), 180)}
                    onChange={(e) => {
                      setDebtCustomerName(e.target.value);
                      setShowDebtorSuggestions(true);
                      setDebtFormError(null);
                    }}
                    placeholder=""
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#071326] border border-[#1E3A6D] focus:border-[#FFB800] text-white text-xs font-bold focus:outline-none"
                  />
                  {showDebtorSuggestions && (() => {
                    const seen = new Set<string>();
                    const candidates: Array<{ name: string; phone: string }> = [];
                    myCrmDebts.forEach((d) => {
                      const n = (d.customerName || '').trim();
                      const p = (d.customerPhone || '').trim();
                      if (!n) return;
                      const key = `${n.toLowerCase()}|${p}`;
                      if (!seen.has(key)) {
                        seen.add(key);
                        candidates.push({ name: n, phone: p });
                      }
                    });
                    supplierCustomers.forEach((c) => {
                      const n = (c.name || '').trim();
                      const p = (c.phone || '').trim();
                      if (!n) return;
                      const key = `${n.toLowerCase()}|${p}`;
                      if (!seen.has(key)) {
                        seen.add(key);
                        candidates.push({ name: n, phone: p });
                      }
                    });
                    const q = debtCustomerName.trim().toLowerCase();
                    const matches = candidates.filter(
                      (c) => !q || c.name.toLowerCase().includes(q) || c.phone.toLowerCase().includes(q)
                    );
                    if (matches.length === 0) return null;
                    return (
                      <div className="absolute left-0 right-0 top-full mt-1 z-30 max-h-44 overflow-y-auto rounded-xl bg-[#071326] border-2 border-[#FFB800] shadow-2xl divide-y divide-[#1E3A6D]">
                        {matches.map((item, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              setDebtCustomerName(item.name);
                              if (item.phone) {
                                setDebtCustomerPhone(formatUzPhoneInput(item.phone));
                              }
                              setShowDebtorSuggestions(false);
                              setDebtFormError(null);
                            }}
                            className="w-full px-3 py-2 text-left hover:bg-[#0F2547] transition-colors flex items-center justify-between gap-2 text-xs cursor-pointer"
                          >
                            <span className="font-black text-white truncate">{item.name}</span>
                            <span className="font-mono font-bold text-[#FFB800] shrink-0">{item.phone}</span>
                          </button>
                        ))}
                      </div>
                    );
                  })()}
                </div>
                <div className="space-y-1.5">
                  <label className="text-white font-bold block">Telefon raqami:</label>
                  <input
                    type="tel"
                    required
                    maxLength={17}
                    value={debtCustomerPhone}
                    onChange={(e) => {
                      setDebtCustomerPhone(formatUzPhoneInput(e.target.value));
                      setDebtFormError(null);
                    }}
                    placeholder="+998 "
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#071326] border border-[#1E3A6D] focus:border-[#FFB800] text-white text-xs font-mono font-bold focus:outline-none"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-white font-bold block">Qarz Summasi (so‘m):</label>
                  <button
                    type="button"
                    onClick={() => setDebtAmountInput(crmCalculation.totalOriginalSum)}
                    className="text-[11px] font-black text-[#FFB800] hover:underline cursor-pointer"
                  >
                    To‘liq savat summasi ({formatPrice(crmCalculation.totalOriginalSum)})
                  </button>
                </div>
                <input
                  type="text"
                  inputMode="numeric"
                  required
                  value={debtAmountInput}
                  onChange={(e) => {
                    const cleanDigits = e.target.value.replace(/\D/g, '');
                    const num = cleanDigits !== '' ? Number(cleanDigits) : '';
                    setDebtAmountInput(
                      typeof num === 'number' ? Math.min(crmCalculation.totalOriginalSum, num) : ''
                    );
                    setDebtFormError(null);
                  }}
                  placeholder="Qarz miqdorini kiriting..."
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#071326] border border-amber-500/60 focus:border-[#FFB800] text-[#FFB800] text-sm font-mono font-black focus:outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-white font-bold block">Izoh (ixtiyoriy):</label>
                <input
                  type="text"
                  value={debtNoteInput}
                  onChange={(e) => setDebtNoteInput(e.target.value)}
                  placeholder="Qaytarish muddati yoki qo‘shimcha izoh..."
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#071326] border border-[#1E3A6D] focus:border-[#FFB800] text-white text-xs focus:outline-none"
                />
              </div>

              {debtFormError && (
                <div className="p-3 rounded-xl bg-red-500/20 border border-red-500/40 text-red-300 font-bold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{debtFormError}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCrmDebtModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl bg-[#071326] hover:bg-[#0F2547] text-sky-200 font-bold text-xs border border-[#1E3A6D] cursor-pointer"
                >
                  Bekor qilish
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs flex items-center gap-1.5 cursor-pointer shadow-lg active:scale-95 transition-all"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Qarz daftariga saqlash</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          QARZ DAFTARIGA PAROL ORQALI KIRISH MODALI
          ========================================================================= */}
      {isQarzPasswordModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fadeIn"
          onClick={() => setIsQarzPasswordModalOpen(false)}
        >
          <div
            className="bg-[#0A1931] border-2 border-[#FFB800] rounded-3xl max-w-md w-full p-5 sm:p-6 space-y-4 shadow-2xl text-xs text-white"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 pb-3 border-b border-[#1E3A6D]">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-2xl bg-amber-500/20 text-[#FFB800] border border-amber-500/40">
                  <Lock className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-white">Qarz Daftariga Kirish</h3>
                  <p className="text-[11px] text-sky-200">
                    Xavfsizlik uchun kabinet parolini kiriting
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsQarzPasswordModalOpen(false)}
                className="p-2 rounded-xl bg-[#071326] hover:bg-red-600 text-sky-200 hover:text-white border border-[#1E3A6D] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleVerifyQarzPasswordAndEnter} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-white font-bold flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-[#FFB800]" />
                  <span>Kabinet Paroli:</span>
                </label>
                <div className="relative">
                  <input
                    type={showQarzPassword ? 'text' : 'password'}
                    autoFocus
                    value={qarzPasswordInput}
                    onChange={(e) => {
                      setQarzPasswordInput(e.target.value);
                      setQarzPasswordError(null);
                    }}
                    placeholder="Kabinet parolini kiriting..."
                    className="w-full pr-10 pl-3.5 py-3 bg-[#071326] border border-[#1E3A6D] focus:border-[#FFB800] rounded-xl text-white text-xs font-mono focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowQarzPassword((prev) => !prev)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-sky-300 hover:text-white cursor-pointer"
                  >
                    {showQarzPassword ? (
                      <EyeOff className="w-4 h-4 text-[#FFB800]" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              {qarzPasswordError && (
                <div className="p-3 rounded-xl bg-red-500/20 border border-red-500/40 text-red-300 font-bold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{qarzPasswordError}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setIsQarzPasswordModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl bg-[#071326] hover:bg-[#0F2547] text-sky-200 font-bold text-xs border border-[#1E3A6D] cursor-pointer"
                >
                  Bekor qilish
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-[#FFB800] hover:bg-[#FFC928] text-slate-950 font-black text-xs flex items-center gap-1.5 cursor-pointer shadow-lg active:scale-95 transition-all"
                >
                  <Check className="w-4 h-4" />
                  <span>Tasdiqlash va Kirish</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          QARZNI SO'NDIRISH (TO'LASH) MODALI
          ========================================================================= */}
      {payingDebtRecord && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fadeIn"
          onClick={() => setPayingDebtRecord(null)}
        >
          <div
            className="bg-[#0A1931] border-2 border-emerald-400 rounded-3xl max-w-md w-full p-5 sm:p-6 space-y-4 shadow-2xl text-xs text-white"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 pb-3 border-b border-[#1E3A6D]">
              <div>
                <h3 className="text-base font-black text-white">Qarzni So‘ndirish</h3>
                <p className="text-[11px] text-sky-200">
                  {payingDebtRecord.customerName} ({payingDebtRecord.customerPhone})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPayingDebtRecord(null)}
                className="p-2 rounded-xl bg-[#071326] hover:bg-red-600 text-sky-200 hover:text-white border border-[#1E3A6D] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handlePayOffCrmDebt} className="space-y-4">
              <div className="p-3.5 rounded-2xl bg-[#071326] border border-[#1E3A6D] flex items-center justify-between">
                <span className="text-sky-200 font-bold">Qolgan qarz miqdori:</span>
                <span className="font-mono font-black text-sm text-red-400">
                  {formatPrice(payingDebtRecord.remainingDebtAmount)}
                </span>
              </div>

              <div className="space-y-1.5">
                <label className="text-white font-bold block">To‘lanayotgan summa (so‘m):</label>
                <input
                  type="text"
                  inputMode="numeric"
                  required
                  value={payDebtAmountInput}
                  onChange={(e) => {
                    const cleanDigits = e.target.value.replace(/\D/g, '');
                    const num = cleanDigits !== '' ? Number(cleanDigits) : '';
                    setPayDebtAmountInput(
                      typeof num === 'number' ? Math.min(payingDebtRecord.remainingDebtAmount, num) : ''
                    );
                    setPayDebtError(null);
                  }}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#071326] border border-emerald-500/60 focus:border-emerald-400 text-emerald-400 text-sm font-mono font-black focus:outline-none"
                />
              </div>

              {payDebtError && (
                <div className="p-3 rounded-xl bg-red-500/20 border border-red-500/40 text-red-300 font-bold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{payDebtError}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setPayingDebtRecord(null)}
                  className="px-4 py-2.5 rounded-xl bg-[#071326] hover:bg-[#0F2547] text-sky-200 font-bold text-xs border border-[#1E3A6D] cursor-pointer"
                >
                  Bekor qilish
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs flex items-center gap-1.5 cursor-pointer shadow-lg active:scale-95 transition-all"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>To‘lovni tasdiqlash</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
