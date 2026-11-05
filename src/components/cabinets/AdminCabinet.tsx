import React, { useState, useRef, useEffect } from 'react';
import { protobufFetch as fetch } from '../../lib/protobufClient';
import { 
  LogOut, 
  Settings, 
  Save, 
  Image as ImageIcon, 
  KeyRound, 
  User as UserIcon, 
  X, 
  Check, 
  Upload, 
  Trash2, 
  Lock, 
  Eye, 
  EyeOff,
  UserPlus,
  Users,
  Shield,
  Activity,
  Search,
  Building,
  Phone,
  Mail,
  MapPin,
  CheckCircle2,
  XCircle,
  Clock,
  RefreshCw,
  Plus,
  AlertTriangle,
  FileText,
  ShoppingBag,
  ShoppingCart,
  Pencil,
  Layers,
  FileUp,
  Download,
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  ArrowDownRight,
  BarChart3,
  DollarSign,
  Wallet,
  Truck,
  Package,
  RotateCcw,
  FileSpreadsheet,
  Printer,
  Send,
  Instagram,
  Share2,
  Globe,
  HardHat,
  ShieldAlert,
  ShieldCheck,
  PanelLeftClose,
  PanelLeftOpen,
  Info,
  Menu,
  ArrowLeft,
  ExternalLink
} from 'lucide-react';
import { RealTelegramLogo, RealInstagramLogo, RealPhoneLogo } from '../common/SocialLogos';
import { UserProfile, SupplierPartner, SystemLog, LogCategory, LogisticsVehicle, CompanyInfo, CommissionBasis } from '../../types';
import { getAdminConfig, saveAdminConfig, AdminConfig, isLoginTakenAnywhere, getLoginConflictError, isLoginRejectedError, compressImageFileToDataUrl } from '../../lib/adminSettings';
import {
  SecurityBlockRequest,
  getSecurityBlockRequests,
  acknowledgeSecurityRequest,
  assignOneTimePasswordToCabinet,
  removeSecurityBlockRequest,
} from '../../lib/securityGuard';
import { INITIAL_SUPPLIERS, INITIAL_LOGS } from '../../data/suppliersData';
import { INITIAL_VEHICLES, MOCK_FAKE_VEHICLE_IDS, MOCK_FAKE_GLOBAL_IDS, MOCK_FAKE_SUPPLIER_IDS } from '../../data/mockData';
import { getProductTypes, addProductType, ProductTypeItem } from '../../data/productTypes';
import { REGIONS_AND_DISTRICTS } from '../../data/regionsData';
import { INITIAL_BUNKER_STATS, INITIAL_TRANSACTIONS, FinancialTransaction, BunkerOverallStats } from '../../data/bunkerFinanceData';
import {
  getSupplierReport,
  SupplierDetailedReport,
  SupplierReportPeriod,
  isOrderAfterReset,
  isOnlinePlatformOrder,
  getProductSearchLogs,
  ProductSearchQueryLog,
  pickMoreAdvancedOrder,
  saveOrdersToStorageSafe,
} from '../../data/supplierReportsData';
import { db, sendSecurePhoneOtp, verifySecurePhoneOtp } from '../../lib/firebase';
import { collection, onSnapshot, deleteDoc, doc, setDoc } from 'firebase/firestore';
import { MapsGroundingView } from '../common/MapsGroundingView';
import { BunkerStatsDashboard } from './BunkerStatsDashboard';
import {
  getSuppliersApi,
  createSupplierApi,
  deleteSupplierApi,
  getLogisticsVehiclesApi,
  createVehicleApi,
  updateVehicleApi,
} from '../../lib/api';
import { formatPrice, formatUzPhone, getUzPhoneDigitsCount } from '../../lib/formatters';

// Backward-compatible re-exports from centralized formatters
export { formatUzPhone, getUzPhoneDigitsCount };

export interface GlobalBunkerPartner {
  id: string;
  name: string;
  country: string;
  flag: string;
  category: string;
  productType: string;
  contractStatus: 'active' | 'in_transit' | 'customs';
  annualVolume: string;
  priceTerm: string;
  rating: number;
  contactPerson: string;
  phone: string;
  badge: string;
  deliveryDays: string;
  route: string;
}

const INITIAL_GLOBAL_PARTNERS: GlobalBunkerPartner[] = [];

interface AdminCabinetProps {
  currentUser?: UserProfile | null;
  onGoToShop?: () => void;
  onLogout?: () => void;
  onConfigChange?: (config: AdminConfig) => void;
  onReturnToBunkerAdmin?: () => void;
  onEnterSupplierCabinet?: (supplier: SupplierPartner) => void;
  cartCount?: number;
  onOpenCart?: () => void;
  onOpenAuth?: () => void;
}

export const AdminCabinet: React.FC<AdminCabinetProps> = ({
  currentUser,
  onGoToShop,
  onLogout,
  onConfigChange,
  onReturnToBunkerAdmin,
  onEnterSupplierCabinet,
  cartCount = 0,
  onOpenCart,
  onOpenAuth,
}) => {
  const [config, setConfig] = useState<AdminConfig>(() => getAdminConfig());
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Ta'minotchi kabinetiga o'tish uchun Admin telefon raqamiga SMS tasdiqlash oynasi
  const [pendingEnterSupplier, setPendingEnterSupplier] = useState<SupplierPartner | null>(null);
  const [enterSuppSmsCode, setEnterSuppSmsCode] = useState('');
  const [enterSuppGeneratedCode, setEnterSuppGeneratedCode] = useState('');
  const [enterSuppSmsNotice, setEnterSuppSmsNotice] = useState<string | null>(null);
  const [enterSuppError, setEnterSuppError] = useState<string | null>(null);
  const [enterSuppSending, setEnterSuppSending] = useState(false);

  const handleRequestEnterSupplier = (supp: SupplierPartner) => {
    if (onEnterSupplierCabinet) {
      onEnterSupplierCabinet(supp);
    }
  };

  const handleConfirmEnterSupplier = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingEnterSupplier || !onEnterSupplierCabinet) return;
    const targetSupp = pendingEnterSupplier;
    setPendingEnterSupplier(null);
    setEnterSuppSmsCode('');
    setEnterSuppSmsNotice(null);
    onEnterSupplierCabinet(targetSupp);
  };

  const isSubAdmin = Boolean(currentUser?.isSubAdmin);
  const allowedSubAdminSections = React.useMemo(() => {
    if (isSubAdmin && Array.isArray(currentUser?.subAdminPermissions) && currentUser!.subAdminPermissions.length > 0) {
      return currentUser!.subAdminPermissions;
    }
    return ['reports', 'suppliers', 'requests_customers'] as const;
  }, [isSubAdmin, currentUser]);

  // Lock Screen State (Faqat Admin Kabinetida Qulflash bosilganda faollashadi)
  const [isCabinetLocked, setIsCabinetLocked] = useState<boolean>(() => {
    try {
      return localStorage.getItem('bunkerstroy_admin_locked') === 'true';
    } catch {
      return false;
    }
  });
  const [unlockPasswordInput, setUnlockPasswordInput] = useState('');
  const [showUnlockPass, setShowUnlockPass] = useState(false);
  const [unlockError, setUnlockError] = useState<string | null>(null);

  useEffect(() => {
    const handleLockEvent = () => setIsCabinetLocked(true);
    const handleUnlockEvent = () => {
      setIsCabinetLocked(false);
      try { localStorage.removeItem('bunkerstroy_admin_locked'); } catch {}
    };
    window.addEventListener('bunkerstroy_lock_admin', handleLockEvent);
    window.addEventListener('bunkerstroy_unlock_admin', handleUnlockEvent);
    return () => {
      window.removeEventListener('bunkerstroy_lock_admin', handleLockEvent);
      window.removeEventListener('bunkerstroy_unlock_admin', handleUnlockEvent);
    };
  }, []);

  // Active section tabs:
  // 1. 'reports' (Monitoring, hisobot)
  // 2. 'suppliers' (Ta'minotchi B2B2C Hamkorlar)
  // 3. 'requests_customers' (So'rov va Mijozlar)
  // 4. 'b2b_crm' (B2B CRM)
  // 5. 'b2c_crm' (B2C CRM)
  // 6. 'logs' (Kabinet Loglari — Sozlamalar ichidan parol bilan kiriladi)
  // 7. 'security_requests' (Xavfsizlik So'rovi — Kabinetlar soni diagrammasidan pastda)
  const [activeSection, setActiveSection] = useState<
    'reports' | 'suppliers' | 'requests_customers' | 'b2b_crm' | 'b2c_crm' | 'logs' | 'security_requests'
  >(() => (allowedSubAdminSections[0] as any) || 'reports');

  // Xavfsizlik So'rovi (5 marta xato parol -> 25 daqiqa bloklangan kabinetlar)
  const [securityRequests, setSecurityRequests] = useState<SecurityBlockRequest[]>(() =>
    getSecurityBlockRequests()
  );
  const [selectedSecurityRequestId, setSelectedSecurityRequestId] = useState<string | null>(null);
  const [oneTimePassInputMap, setOneTimePassInputMap] = useState<Record<string, string>>({});
  const [oneTimePassSavedNotice, setOneTimePassSavedNotice] = useState<Record<string, string>>({});
  const [secNowMs, setSecNowMs] = useState<number>(() => Date.now());

  useEffect(() => {
    const refreshSecurity = () => {
      setSecurityRequests(getSecurityBlockRequests());
      setSecNowMs(Date.now());
    };
    window.addEventListener('bunkerstroy_security_updated', refreshSecurity);
    window.addEventListener('storage', refreshSecurity);
    const interval = setInterval(refreshSecurity, 1000);
    return () => {
      window.removeEventListener('bunkerstroy_security_updated', refreshSecurity);
      window.removeEventListener('storage', refreshSecurity);
      clearInterval(interval);
    };
  }, []);

  const hasBlinkingSecurityRequest = React.useMemo(
    () =>
      securityRequests.some(
        (r) => !r.acknowledgedByAdmin && (r.isBlocked || r.attemptsCount >= 5)
      ),
    [securityRequests]
  );

  const blockedOrFlaggedSecurityRequests = React.useMemo(
    () =>
      securityRequests.filter(
        (r) =>
          r.isBlocked ||
          r.attemptsCount >= 5 ||
          Boolean(r.blockedAt) ||
          Boolean(r.oneTimePassword) ||
          (r.failedAttempts && r.failedAttempts.length >= 5)
      ),
    [securityRequests]
  );

  useEffect(() => {
    if (isSubAdmin && allowedSubAdminSections.length > 0) {
      if (activeSection !== 'security_requests' && !allowedSubAdminSections.includes(activeSection as any)) {
        setActiveSection(allowedSubAdminSections[0]);
      }
    }
  }, [isSubAdmin, allowedSubAdminSections, currentUser?.id]);

  // So'rov & Mijozlar uchun real ma'lumotlar
  const [b2bOrders, setB2bOrders] = useState<any[]>(() => {
    try {
      const saved = localStorage.getItem('bunkerstroy_b2b_orders');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [adminProducts, setAdminProducts] = useState<any[]>(() => {
    try {
      const saved = localStorage.getItem('bunkerstroy_products');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const sanitizeCustomerCabinets = (rawList: any[]): UserProfile[] => {
    if (!Array.isArray(rawList)) return [];
    const seenKeys = new Set<string>();
    const validCusts: UserProfile[] = [];
    rawList.forEach((u: any) => {
      if (!u || typeof u !== 'object' || !u.id) return;
      if (u.role === 'admin' || u.role === 'bunker_admin' || u.role === 'sub_admin' || u.role === 'supplier') return;
      const rawName = (u.displayName || `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.name || u.login || '').trim().toLowerCase();
      if (
        rawName === 'adminstrator' ||
        rawName === 'administrator' ||
        rawName === 'superadmin' ||
        rawName === 'bosh admin' ||
        rawName === 'admin'
      ) {
        return;
      }
      const phoneDigits = (u.phone || '').replace(/\D/g, '').slice(-9);
      const uniqueKey = phoneDigits ? `tel:${phoneDigits}` : `name:${rawName || u.id}`;
      if (seenKeys.has(uniqueKey)) return;
      seenKeys.add(uniqueKey);
      validCusts.push(u as UserProfile);
    });
    return validCusts;
  };

  const [registeredCustomers, setRegisteredCustomers] = useState<UserProfile[]>(() => {
    try {
      const saved = localStorage.getItem('bunkerstroy_customers');
      return saved ? sanitizeCustomerCabinets(JSON.parse(saved)) : [];
    } catch {
      return [];
    }
  });
  const [searchLogs, setSearchLogs] = useState<ProductSearchQueryLog[]>(() => getProductSearchLogs());
  const [reqPeriod, setReqPeriod] = useState<'day' | 'month' | 'year' | 'all'>('all');
  const [reqDateStr, setReqDateStr] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [activeReqBarHover, setActiveReqBarHover] = useState<number | null>(null);
  const [customerRequestSearch, setCustomerRequestSearch] = useState('');
  const [customerRequestStatusFilter, setCustomerRequestStatusFilter] = useState<string>('all');
  const [acknowledgedProblemKeys, setAcknowledgedProblemKeys] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('bunkerstroy_ack_req_problems');
      const parsed = saved ? JSON.parse(saved) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });

  // Yon menyuni yig'ish va ochish holatlari (O'ng tarafdan chiqadigan va yig'iladigan)
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  // Ta'minotchi Haqida ma'lumotlar modali
  const [aboutSupplier, setAboutSupplier] = useState<SupplierPartner | null>(null);
  const [isAboutSupplierOpen, setIsAboutSupplierOpen] = useState(false);

  // Global Bunker Hamkorini Tahrirlash holatlari
  const [editingGlobalPartner, setEditingGlobalPartner] = useState<GlobalBunkerPartner | null>(null);
  const [isEditGlobalPartnerOpen, setIsEditGlobalPartnerOpen] = useState(false);
  const [editGpName, setEditGpName] = useState('');
  const [editGpCountry, setEditGpCountry] = useState('');
  const [editGpFlag, setEditGpFlag] = useState('🌐');
  const [editGpCategory, setEditGpCategory] = useState('Metall va Po‘lat');
  const [editGpProductType, setEditGpProductType] = useState('');
  const [editGpVolume, setEditGpVolume] = useState('50,000 tonna');
  const [editGpPriceTerm, setEditGpPriceTerm] = useState('Zavod narxi (FCA/CPT Toshkent)');
  const [editGpContact, setEditGpContact] = useState('');
  const [editGpPhone, setEditGpPhone] = useState('+998 ');
  const [editGpRoute, setEditGpRoute] = useState('');
  const [editGpDeliveryDays, setEditGpDeliveryDays] = useState('3-7 kun');
  const [editGpContractStatus, setEditGpContractStatus] = useState<'active' | 'in_transit' | 'customs'>('active');

  // Logistik Ta'minotchi Tahrirlash holatlari
  const [editingVehicle, setEditingVehicle] = useState<LogisticsVehicle | null>(null);
  const [isEditVehicleOpen, setIsEditVehicleOpen] = useState(false);
  const [editVehName, setEditVehName] = useState('');
  const [editVehType, setEditVehType] = useState<'samosval' | 'mikser' | 'kran_manipulyator' | 'gazel' | 'fura'>('samosval');
  const [editVehCapacity, setEditVehCapacity] = useState('20');
  const [editVehPriceKm, setEditVehPriceKm] = useState('14000');
  const [editVehDriver, setEditVehDriver] = useState('');
  const [editVehPhone, setEditVehPhone] = useState('+998 ');
  const [editVehLocation, setEditVehLocation] = useState('Toshkent, Sergeli ombori');
  const [editVehAvailable, setEditVehAvailable] = useState(true);

  // Logistics Vehicles State (Faqat Admin kiritgan real texnikalar, dastlab 0 ta)
  const [vehicles, setVehicles] = useState<LogisticsVehicle[]>(() => {
    try {
      const saved = localStorage.getItem('bunkerstroy_vehicles');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed.filter((v: LogisticsVehicle) => v && v.id && !MOCK_FAKE_VEHICLE_IDS.includes(v.id));
        }
      }
    } catch {}
    return [];
  });
  const [isAddVehicleOpen, setIsAddVehicleOpen] = useState(false);
  const [newVehName, setNewVehName] = useState('');
  const [newVehType, setNewVehType] = useState<'samosval' | 'mikser' | 'kran_manipulyator' | 'gazel' | 'fura'>('samosval');
  const [newVehCapacity, setNewVehCapacity] = useState('20');
  const [newVehPriceKm, setNewVehPriceKm] = useState('14000');
  const [newVehDriver, setNewVehDriver] = useState('');
  const [newVehPhone, setNewVehPhone] = useState('+998 ');
  const [newVehLocation, setNewVehLocation] = useState('Toshkent, Sergeli ombori');

  // Global Bunker Partners State (Faqat Admin kiritgan real xalqaro hamkorlar, dastlab 0 ta)
  const [globalPartners, setGlobalPartners] = useState<GlobalBunkerPartner[]>(() => {
    try {
      const saved = localStorage.getItem('bunkerstroy_global_partners');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed.filter((g: GlobalBunkerPartner) => g && g.id && !MOCK_FAKE_GLOBAL_IDS.includes(g.id));
        }
      }
    } catch {}
    return [];
  });
  const [isAddGlobalPartnerOpen, setIsAddGlobalPartnerOpen] = useState(false);
  const [newGpName, setNewGpName] = useState('');
  const [newGpCountry, setNewGpCountry] = useState('');
  const [newGpFlag, setNewGpFlag] = useState('🌐');
  const [newGpCategory, setNewGpCategory] = useState('Metall va Po‘lat');
  const [newGpProductType, setNewGpProductType] = useState('');
  const [newGpVolume, setNewGpVolume] = useState('50,000 tonna');
  const [newGpContact, setNewGpContact] = useState('');
  const [newGpPhone, setNewGpPhone] = useState('+998 ');
  const [gpSearch, setGpSearch] = useState('');
  const [vehSearch, setVehSearch] = useState('');

  // Bunker Faoliyati moliyaviy statistika holati (Real ma'lumotlar bilan ishlaydi)
  const [transactions, setTransactions] = useState<FinancialTransaction[]>(() => {
    try {
      const saved = localStorage.getItem('bunkerstroy_transactions');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed.filter((tx) => isOrderAfterReset(tx));
      }
    } catch {}
    return INITIAL_TRANSACTIONS;
  });

  const [orders, setOrders] = useState<any[]>(() => {
    try {
      const saved = localStorage.getItem('bunkerstroy_orders');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed.filter((o) => isOrderAfterReset(o) && isOnlinePlatformOrder(o));
        }
      }
    } catch {}
    return [];
  });

  const countPlatformMatchesGlobal = React.useCallback(
    (rawTerm: string, loggedCount?: number): number => {
      const q = (rawTerm || '').toLowerCase().trim();
      if (!q) return 0;
      if (Array.isArray(adminProducts) && adminProducts.length > 0) {
        return adminProducts.filter((p: any) => {
          if (!p) return false;
          const hay = `${p.title || ''} ${p.category || ''} ${p.subCategory || ''} ${p.description || ''} ${p.brand || ''}`.toLowerCase();
          return hay.includes(q);
        }).length;
      }
      return typeof loggedCount === 'number' && loggedCount >= 0 ? loggedCount : 0;
    },
    [adminProducts]
  );

  const requestProblemsState = React.useMemo(() => {
    const termCountMap = new Map<string, { count: number; matchedCount: number }>();
    searchLogs.forEach((log) => {
      const cleanKey = (log.normalizedTerm || log.term || '').toLowerCase().trim();
      if (!cleanKey) return;
      const matchedCount = countPlatformMatchesGlobal(cleanKey, log.resultsCount);
      const prev = termCountMap.get(cleanKey);
      if (prev) {
        prev.count += 1;
        prev.matchedCount = Math.max(prev.matchedCount, matchedCount);
      } else {
        termCountMap.set(cleanKey, { count: 1, matchedCount });
      }
    });

    const zeroMatchKeys: string[] = [];
    const allSearchKeys: string[] = [];
    const termKeyLookup = new Map<string, string>();

    termCountMap.forEach((val, cleanKey) => {
      const pKey =
        val.matchedCount === 0
          ? `prob_zero:${cleanKey}:${val.count}`
          : `prob_search:${cleanKey}:${val.count}`;
      termKeyLookup.set(cleanKey, pKey);
      allSearchKeys.push(pKey);
      if (val.matchedCount === 0) {
        zeroMatchKeys.push(pKey);
      }
    });

    const orderKeys = orders
      .filter((o) => o && o.id)
      .map((o) => `prob_ord:${o.id}:${o.status || 'new'}`);

    const activeKeys =
      zeroMatchKeys.length > 0
        ? zeroMatchKeys
        : allSearchKeys.length > 0
        ? allSearchKeys
        : orderKeys;

    const allCurrentKeys = Array.from(new Set([...zeroMatchKeys, ...allSearchKeys, ...orderKeys]));
    const unacknowledgedActiveKeys = activeKeys.filter((k) => !acknowledgedProblemKeys.includes(k));

    return {
      activeKeys,
      allCurrentKeys,
      termKeyLookup,
      hasUnacknowledged: unacknowledgedActiveKeys.length > 0,
      unacknowledgedCount: unacknowledgedActiveKeys.length,
    };
  }, [searchLogs, orders, countPlatformMatchesGlobal, acknowledgedProblemKeys]);

  const handleAcknowledgeRequestProblem = React.useCallback(
    (specificTerm?: string) => {
      setAcknowledgedProblemKeys((prev) => {
        const nextSet = new Set(prev);
        requestProblemsState.allCurrentKeys.forEach((k) => nextSet.add(k));
        if (specificTerm) {
          const clean = specificTerm.toLowerCase().trim();
          const mapped = requestProblemsState.termKeyLookup.get(clean);
          if (mapped) nextSet.add(mapped);
        }
        const nextArr = Array.from(nextSet);
        try {
          localStorage.setItem('bunkerstroy_ack_req_problems', JSON.stringify(nextArr));
        } catch {}
        return nextArr;
      });
    },
    [requestProblemsState]
  );

  const [txFilter, setTxFilter] = useState<'all' | 'income' | 'expense'>('all');

  // Modal: Yangi moliyaviy operatsiya kiritish
  const [isAddTxOpen, setIsAddTxOpen] = useState(false);
  const [newTxType, setNewTxType] = useState<'income' | 'expense'>('income');
  const [newTxCategory, setNewTxCategory] = useState('Mahsulotlar savdosi');
  const [newTxSource, setNewTxSource] = useState('');
  const [newTxAmount, setNewTxAmount] = useState('');
  const [newTxPaymentMethod, setNewTxPaymentMethod] = useState('Bank hisob raqami (Perechisleniye)');

  // Hisobotlar (Supplier Reports) modal holati
  const [selectedReportSupplier, setSelectedReportSupplier] = useState<SupplierPartner | null>(null);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [activeReportTab, setActiveReportTab] = useState<'sales' | 'returns' | 'routes'>('sales');
  const [reportPeriod, setReportPeriod] = useState<SupplierReportPeriod>('all');
  const [reportDateStr, setReportDateStr] = useState<string>(() => new Date().toISOString().slice(0, 10));

  // Suppliers state with localStorage persistence (Faqat Admin kiritgan real kabinetlar, dastlab 0 ta)
  const [suppliers, setSuppliers] = useState<SupplierPartner[]>(() => {
    try {
      const saved = localStorage.getItem('bunkerstroy_suppliers');
      if (saved) {
        const list = JSON.parse(saved);
        const filtered = Array.isArray(list)
          ? list.filter(
              (s: SupplierPartner) =>
                s &&
                s.id &&
                !MOCK_FAKE_SUPPLIER_IDS.includes(s.id) &&
                s.companyName !== 'NATH'
            )
          : [];
        return filtered;
      }
    } catch {}
    return [];
  });

  // Logs state with localStorage persistence
  const [logs, setLogs] = useState<SystemLog[]>(() => {
    try {
      const saved = localStorage.getItem('bunkerstroy_logs');
      return saved ? JSON.parse(saved) : INITIAL_LOGS;
    } catch {
      return INITIAL_LOGS;
    }
  });

  const syncSupplierToFirestore = (s: SupplierPartner) => {
    if (!s || !s.id) return;
    try {
      const userDocData = {
        id: s.id,
        email: (s.email || `${s.login || 'hamkor'}@bunkerstroy.uz`).slice(0, 250),
        displayName: (s.companyName || s.name || 'Hamkor').slice(0, 120),
        role: 'supplier',
        login: s.login,
        password: s.password || 'parol123',
        emergencyPassword: s.emergencyPassword || '',
        mustChangeCredentials: Boolean(s.mustChangeCredentials),
        cabinetType: s.cabinetType || 'partner',
        inn: s.inn || '',
        companyName: s.companyName,
        name: s.name,
        surname: s.surname || '',
        phone: s.phone,
        region: s.region,
        district: s.district || '',
        category: s.category,
        contractNumber: s.contractNumber || '',
        allowPromoVideo: Boolean(s.allowPromoVideo),
        commissionRate: Number(s.commissionRate) || 5,
        commissionBasis: s.commissionBasis || 'total',
        status: s.status || 'active',
        createdAt: s.createdAt || new Date().toISOString(),
      };
      setDoc(doc(db, 'users', s.id), userDocData, { merge: true }).catch(() => {});
    } catch {}
  };

  const persistSuppliersSafe = (list: SupplierPartner[]) => {
    try {
      localStorage.setItem('bunkerstroy_suppliers', JSON.stringify(list));
    } catch {
      try {
        // Bo'sh joy ochish: loglarni qisqartirish va og'ir PDF ma'lumotlarni yengillashtirish
        const savedLogs = localStorage.getItem('bunkerstroy_logs');
        if (savedLogs) {
          const parsedLogs = JSON.parse(savedLogs);
          if (Array.isArray(parsedLogs) && parsedLogs.length > 30) {
            localStorage.setItem('bunkerstroy_logs', JSON.stringify(parsedLogs.slice(0, 30)));
          }
        }
        const lightList = list.map((s) => ({
          ...s,
          contractPdfData: undefined,
        }));
        localStorage.setItem('bunkerstroy_suppliers', JSON.stringify(lightList));
      } catch {}
    }
  };

  useEffect(() => {
    persistSuppliersSafe(suppliers);
  }, [suppliers]);

  useEffect(() => {
    try {
      localStorage.setItem('bunkerstroy_logs', JSON.stringify(logs.slice(0, 100)));
    } catch {}
  }, [logs]);

  useEffect(() => {
    try {
      localStorage.setItem('bunkerstroy_transactions', JSON.stringify(transactions));
    } catch {}
  }, [transactions]);

  useEffect(() => {
    try {
      const savedOrd = localStorage.getItem('bunkerstroy_orders');
      const existingAll: any[] = savedOrd ? JSON.parse(savedOrd) : [];
      const combinedMap = new Map<string, any>();
      if (Array.isArray(existingAll)) {
        existingAll.forEach((o) => {
          if (o && o.id && isOrderAfterReset(o)) combinedMap.set(o.id, o);
        });
      }
      orders.forEach((o) => {
        if (o && o.id) {
          const ex = combinedMap.get(o.id);
          combinedMap.set(o.id, ex ? pickMoreAdvancedOrder(o, ex) : o);
        }
      });
      saveOrdersToStorageSafe(Array.from(combinedMap.values()));
    } catch {}
  }, [orders]);

  // Firestore orqali buyurtmalarni real vaqtda kuzatish (lokal buyurtmalar bilan birlashtirib, faqat Onlayn savdolar)
  useEffect(() => {
    try {
      const q = collection(db, 'orders');
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const firestoreOrders: any[] = [];
        snapshot.forEach((d) => {
          const data = d.data();
          if (!isOrderAfterReset(data)) {
            deleteDoc(doc(db, 'orders', d.id)).catch(() => {});
          } else {
            firestoreOrders.push(data);
          }
        });
        try {
          const savedOrd = localStorage.getItem('bunkerstroy_orders');
          const localOrders: any[] = savedOrd ? JSON.parse(savedOrd) : [];
          const mergedMap = new Map<string, any>();
          firestoreOrders.forEach((fo) => {
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
          const mergedList = Array.from(mergedMap.values());
          saveOrdersToStorageSafe(mergedList);
          setOrders(mergedList.filter((o) => isOnlinePlatformOrder(o)));
        } catch {
          setOrders(firestoreOrders.filter((o) => isOnlinePlatformOrder(o)));
        }
      }, (err) => {
        console.warn('Orders snapshot notice:', err);
      });
      return () => unsubscribe();
    } catch (e) {
      console.warn('Firestore orders init notice:', e);
    }
  }, []);

  // Yangi buyurtma yoki moliyaviy operatsiya tushganda real vaqtda sinxronizatsiya
  useEffect(() => {
    const handleFinanceEvent = () => {
      try {
        const savedTx = localStorage.getItem('bunkerstroy_transactions');
        if (savedTx) {
          const parsedTx = JSON.parse(savedTx);
          setTransactions(Array.isArray(parsedTx) ? parsedTx.filter((tx) => isOrderAfterReset(tx)) : []);
        }
        const savedOrd = localStorage.getItem('bunkerstroy_orders');
        if (savedOrd) {
          const parsedOrd = JSON.parse(savedOrd);
          setOrders(
            Array.isArray(parsedOrd)
              ? parsedOrd.filter((o) => isOrderAfterReset(o) && isOnlinePlatformOrder(o))
              : []
          );
        }
        const savedLogs = localStorage.getItem('bunkerstroy_logs');
        if (savedLogs) setLogs(JSON.parse(savedLogs));
        const savedB2b = localStorage.getItem('bunkerstroy_b2b_orders');
        if (savedB2b) setB2bOrders(JSON.parse(savedB2b));
        const savedProds = localStorage.getItem('bunkerstroy_products');
        if (savedProds) setAdminProducts(JSON.parse(savedProds));
        const savedCust = localStorage.getItem('bunkerstroy_customers');
        if (savedCust) setRegisteredCustomers(sanitizeCustomerCabinets(JSON.parse(savedCust)));
        setSearchLogs(getProductSearchLogs());
      } catch {}
    };
    window.addEventListener('bunkerstroy_finance_updated', handleFinanceEvent);
    window.addEventListener('bunkerstroy_orders_updated', handleFinanceEvent);
    window.addEventListener('bunkerstroy_b2b_updated', handleFinanceEvent);
    window.addEventListener('bunkerstroy_suppliers_updated', handleFinanceEvent);
    window.addEventListener('bunkerstroy_search_updated', handleFinanceEvent);
    window.addEventListener('bunkerstroy_logs_updated', handleFinanceEvent);
    window.addEventListener('storage', handleFinanceEvent);
    return () => {
      window.removeEventListener('bunkerstroy_finance_updated', handleFinanceEvent);
      window.removeEventListener('bunkerstroy_orders_updated', handleFinanceEvent);
      window.removeEventListener('bunkerstroy_b2b_updated', handleFinanceEvent);
      window.removeEventListener('bunkerstroy_suppliers_updated', handleFinanceEvent);
      window.removeEventListener('bunkerstroy_search_updated', handleFinanceEvent);
      window.removeEventListener('bunkerstroy_logs_updated', handleFinanceEvent);
      window.removeEventListener('storage', handleFinanceEvent);
    };
  }, []);

  // Bunker Faoliyati statistikasi: Real ma'lumotlar bilan hisoblanadi. Hali mijoz bo'lmasa 0 bo'ladi!
  const bunkerStats: BunkerOverallStats = React.useMemo(() => {
    const ordersSum = orders.reduce((sum, o) => sum + (Number(o.totalAmount) || 0), 0);
    const txIncome = transactions
      .filter((t) => t.type === 'income')
      .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
    const txExpense = transactions
      .filter((t) => t.type === 'expense')
      .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);

    const totalIncome = Math.max(ordersSum, txIncome);
    const totalTurnover = totalIncome;
    const totalExpense = txExpense;
    const netProfit = Math.max(0, totalIncome - totalExpense);

    const cancelledOrders = orders.filter((o) => o.status === 'cancelled' || o.status === 'returned');
    const returnsCount = cancelledOrders.length;
    const returnsSum = cancelledOrders.reduce((sum, o) => sum + (Number(o.totalAmount) || 0), 0);

    const activePartnersCount = suppliers.filter((s) => s.status === 'active').length;

    return {
      totalTurnover,
      totalIncome,
      totalExpense,
      netProfit,
      returnsCount,
      returnsSum,
      ordersCount: orders.length,
      activePartnersCount,
    };
  }, [orders, transactions, suppliers]);

  // Helper to add log
  const addLog = (
    action: string,
    category: LogCategory,
    details: string,
    level: 'info' | 'warning' | 'error' | 'success' = 'info'
  ) => {
    const newLogItem: SystemLog = {
      id: `log-${Date.now()}`,
      action,
      actor: `${config.login} (Bosh Admin)`,
      category,
      details,
      timestamp: new Date().toISOString(),
      ip: '195.158.12.84',
      level,
    };
    setLogs((prev) => {
      const updated = [newLogItem, ...prev];
      try {
        localStorage.setItem('bunkerstroy_logs', JSON.stringify(updated.slice(0, 200)));
      } catch {}
      return updated;
    });
  };

  // Mahsulot turlari
  const [productTypes, setProductTypes] = useState<ProductTypeItem[]>(() => getProductTypes());

  useEffect(() => {
    const handleTypesUpdate = () => {
      setProductTypes(getProductTypes());
    };
    window.addEventListener('bunkerstroy_product_types_updated', handleTypesUpdate);
    return () => {
      window.removeEventListener('bunkerstroy_product_types_updated', handleTypesUpdate);
    };
  }, []);

  // Add Supplier Modal state: STIR orqali avtomatik to'ldiriladi!
  const [isAddSupplierOpen, setIsAddSupplierOpen] = useState(false);
  const [supplierCabinetSubTab, setSupplierCabinetSubTab] = useState<'all' | 'manufacturer' | 'partner'>('manufacturer');
  const [newSuppCabinetType, setNewSuppCabinetType] = useState<'manufacturer' | 'partner'>('manufacturer');
  const [newSuppStir, setNewSuppStir] = useState('');
  const [newSuppStirLoading, setNewSuppStirLoading] = useState(false);
  const [newSuppStirError, setNewSuppStirError] = useState<string | null>(null);
  const [newSuppStirVerified, setNewSuppStirVerified] = useState(false);
  const [newSuppCompanyInfo, setNewSuppCompanyInfo] = useState<CompanyInfo | null>(null);
  const [newSuppName, setNewSuppName] = useState('');
  const [newSuppSurname, setNewSuppSurname] = useState('');
  const [newSuppCompany, setNewSuppCompany] = useState('');
  const [newSuppPhone, setNewSuppPhone] = useState('+998 ');
  const [newSuppEmail, setNewSuppEmail] = useState('');
  const [newSuppLogin, setNewSuppLogin] = useState('');
  const [newSuppPassword, setNewSuppPassword] = useState('');
  const [newSuppRegion, setNewSuppRegion] = useState('');
  const [newSuppDistrict, setNewSuppDistrict] = useState('');
  const [newSuppCategory, setNewSuppCategory] = useState('');
  const [newSuppContractNumber, setNewSuppContractNumber] = useState('');
  const [newSuppContractError, setNewSuppContractError] = useState<string | null>(null);
  const [newSuppPdfName, setNewSuppPdfName] = useState<string | null>(null);
  const [newSuppPdfData, setNewSuppPdfData] = useState<string | null>(null);
  const [newSuppAllowPromoVideo, setNewSuppAllowPromoVideo] = useState<boolean>(false);
  const [newSuppCommission, setNewSuppCommission] = useState<number>(5);
  const [newSuppCommissionBasis, setNewSuppCommissionBasis] = useState<CommissionBasis>('total');
  const [newSuppConfirmPass, setNewSuppConfirmPass] = useState('');
  const [newSuppConfirmError, setNewSuppConfirmError] = useState<string | null>(null);
  const [isCategoryPickerOpen, setIsCategoryPickerOpen] = useState(false);
  const [supplierAddSuccess, setSupplierAddSuccess] = useState(false);
  const [newSuppPhoneError, setNewSuppPhoneError] = useState<string | null>(null);

  // Edit Supplier Modal state
  const [isEditSupplierOpen, setIsEditSupplierOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<SupplierPartner | null>(null);
  const [editSuppCabinetType, setEditSuppCabinetType] = useState<'manufacturer' | 'partner'>('partner');
  const [editSuppStir, setEditSuppStir] = useState('');
  const [editSuppStirLoading, setEditSuppStirLoading] = useState(false);
  const [editSuppStirError, setEditSuppStirError] = useState<string | null>(null);
  const [editSuppCompanyInfo, setEditSuppCompanyInfo] = useState<CompanyInfo | null>(null);
  const [editSuppName, setEditSuppName] = useState('');
  const [editSuppSurname, setEditSuppSurname] = useState('');
  const [editSuppCompany, setEditSuppCompany] = useState('');
  const [editSuppPhone, setEditSuppPhone] = useState('+998 ');
  const [editSuppPhoneError, setEditSuppPhoneError] = useState<string | null>(null);
  const [editSuppEmail, setEditSuppEmail] = useState('');
  const [editSuppLogin, setEditSuppLogin] = useState('');
  const [editSuppPassword, setEditSuppPassword] = useState('');
  const [editSuppEmergencyPass, setEditSuppEmergencyPass] = useState('');
  const [showEditSuppPassword, setShowEditSuppPassword] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [editSuppRegion, setEditSuppRegion] = useState('');
  const [editSuppDistrict, setEditSuppDistrict] = useState('');
  const [editSuppCategory, setEditSuppCategory] = useState('');
  const [editSuppContractNumber, setEditSuppContractNumber] = useState('');
  const [editSuppContractError, setEditSuppContractError] = useState<string | null>(null);
  const [editSuppPdfName, setEditSuppPdfName] = useState<string | null>(null);
  const [editSuppPdfData, setEditSuppPdfData] = useState<string | null>(null);
  const [editSuppAllowPromoVideo, setEditSuppAllowPromoVideo] = useState<boolean>(false);
  const [editSuppCommission, setEditSuppCommission] = useState<number>(5);
  const [editSuppCommissionBasis, setEditSuppCommissionBasis] = useState<CommissionBasis>('total');
  const [isEditCategoryPickerOpen, setIsEditCategoryPickerOpen] = useState(false);
  const [pickerCustomInput, setPickerCustomInput] = useState('');
  const [supplierEditSuccess, setSupplierEditSuccess] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmPass, setDeleteConfirmPass] = useState('');
  const [deleteConfirmError, setDeleteConfirmError] = useState<string | null>(null);
  const [editConfirmPass, setEditConfirmPass] = useState('');
  const [editConfirmError, setEditConfirmError] = useState<string | null>(null);

  // Mavjud MChJ va Zavodlar ro'yxati (STIR bo'yicha tezkor tanlash va tekshirish uchun)
  const [availableMchjRegistry, setAvailableMchjRegistry] = useState<
    { inn: string; name: string; director?: string; region?: string; district?: string; status?: string }[]
  >([
    { inn: '201122334', name: '«BUNKER STROY INVEST» MChJ', director: 'Karimov Jasur Bahromovich', region: 'Toshkent shahri', district: 'Yunusobod tumani', status: 'Faol' },
    { inn: '305566778', name: '«TOSHKENT G\'ISHT SERVIS» MChJ', director: 'Xolmatov Dilshod Rustamovich', region: 'Toshkent viloyati', district: 'Yangiyo‘l tumani', status: 'Faol' },
    { inn: '123456789', name: '«SAMARQAND CEMENT INDUSTRY» QK MChJ', director: 'Mirzayev Ulug‘bek Shavkatovich', region: 'Samarqand viloyati', district: 'Pastdarg‘om tumani', status: 'Faol' },
    { inn: '987654321', name: '«VODIY LOGISTIKA TRANS» MChJ', director: 'Rahimov Alisher Baxtiyorovich', region: 'Farg‘ona viloyati', district: 'Qo‘qon shahri', status: 'Faol' },
    { inn: '200362124', name: '«QIZILQUMSEMENT SANOAT ZAVODI» MChJ', director: 'Nazarov Bekzod Ilhomovich', region: 'Navoiy viloyati', district: 'Navoiy shahri', status: 'Faol' },
    { inn: '200245189', name: '«OHANGARON SEMENT KOMBINATI» MChJ', director: 'Abdullayev Farrux Sobirovich', region: 'Toshkent viloyati', district: 'Ohangaron shahri', status: 'Faol' },
    { inn: '200154872', name: '«BEKOBOD METALL PROKAT ZAVODI» MChJ', director: 'Tursunov Sardor G‘ulomovich', region: 'Toshkent viloyati', district: 'Bekobod shahri', status: 'Faol' },
    { inn: '206123456', name: '«BUXORO GIPS VA QURUQ QORISHMALAR ZAVODI» XK MChJ', director: 'Jo‘rayev Anvar Mahmudovich', region: 'Buxoro viloyati', district: 'Kogon shahri', status: 'Faol' },
    { inn: '304556677', name: '«GRAND STROY SAVDO MARKAZI» MChJ', director: 'Yuldashev Sherzod Akmalovich', region: 'Toshkent shahri', district: 'Sergeli tumani', status: 'Faol' },
    { inn: '308221144', name: '«ANDIJON QURILISH SAVDO TA’MINOT» MChJ', director: 'Qodirov Azizbek O‘ktamovich', region: 'Andijon viloyati', district: 'Andijon shahri', status: 'Faol' },
  ]);

  useEffect(() => {
    fetch('/api/company/test-stirs')
      .then((r) => r.json())
      .then((d) => {
        if (d?.active && Array.isArray(d.active) && d.active.length > 0) {
          setAvailableMchjRegistry(d.active);
        }
      })
      .catch(() => {});
  }, []);

  // Rahbar F.I.Sh satridan Ism va Familiyani ajratib olish (masalan: "Yaxshiboyev Shodiyor Rustam o‘g‘li" -> Ism: "Shodiyor", Familiya: "Yaxshiboyev")
  const parseDirectorFullName = (fullName?: string): { firstName: string; lastName: string } => {
    if (!fullName || !fullName.trim()) return { firstName: '', lastName: '' };
    const formatWord = (w: string) => {
      const clean = w.replace(/`/g, '‘').trim();
      if (!clean) return '';
      return clean.charAt(0).toUpperCase() + clean.slice(1).toLowerCase();
    };
    const parts = fullName.trim().split(/\s+/);
    if (parts.length === 1) {
      return { firstName: formatWord(parts[0]), lastName: '' };
    }
    // O'zbekistonda rasmiy reyestrda (orginfo.uz): 1-so'z Familiya, 2-so'z Ism
    return {
      firstName: formatWord(parts[1]),
      lastName: formatWord(parts[0]),
    };
  };

  // Viloyat nomini REGIONS_AND_DISTRICTS kalitiga moslashtirish
  const resolveRegionKey = (rawRegion?: string, rawAddress?: string): string => {
    const searchStr = `${rawRegion || ''} ${rawAddress || ''}`.replace(/`/g, '‘').replace(/'/g, '‘').toLowerCase();
    if (!searchStr.trim()) return '';
    if ( rawRegion && REGIONS_AND_DISTRICTS[rawRegion] ) return rawRegion;
    if (searchStr.includes('toshkent shahri') || searchStr.includes('toshkent sh.')) return 'Toshkent shahri';
    if (searchStr.includes('toshkent viloyati')) return 'Toshkent viloyati';
    for (const key of Object.keys(REGIONS_AND_DISTRICTS)) {
      const keyClean = key.replace(/\s*(viloyati|res\.|shahri)/i, '').trim().toLowerCase();
      if (keyClean && searchStr.includes(keyClean)) {
        return key;
      }
    }
    return '';
  };

  // Tuman/shahar nomini viloyat ichidagi tumanlar ro'yxatidan moslashtirish
  const resolveDistrictKey = (regionKey: string, rawDistrict?: string, rawAddress?: string): string => {
    if (!regionKey || !REGIONS_AND_DISTRICTS[regionKey]) return '';
    const regionDistricts = REGIONS_AND_DISTRICTS[regionKey];
    if (rawDistrict && regionDistricts.includes(rawDistrict)) return rawDistrict;

    const searchStr = `${rawDistrict || ''} ${rawAddress || ''}`.replace(/`/g, '‘').replace(/'/g, '‘').toLowerCase();
    for (const dist of regionDistricts) {
      const distBase = dist.replace(/\s+(tumani|shahri)$/i, '').trim().toLowerCase();
      if (distBase && searchStr.includes(distBase)) {
        // Agar manzilda "tumani" yoki "shahri" aniq yozilgan bo'lsa to'liq moslikni tekshiramiz
        if (searchStr.includes(dist.toLowerCase())) {
          return dist;
        }
      }
    }
    for (const dist of regionDistricts) {
      const distBase = dist.replace(/\s+(tumani|shahri)$/i, '').trim().toLowerCase();
      if (distBase && searchStr.includes(distBase)) {
        return dist;
      }
    }
    return regionDistricts[0] || '';
  };

  // Bir xil STIR bilan ayni kabinet turida (B2B da yaratilgan bo'lsa B2B da, B2C da yaratilgan bo'lsa B2C da) ikkinchi kabinet yaratmaslik algoritmi
  const isStirTakenInCabinetType = (
    rawStir: string,
    targetType: 'manufacturer' | 'partner',
    excludeSupplierId?: string
  ): boolean => {
    const clean = (rawStir || '').replace(/\D/g, '');
    if (clean.length !== 9) return false;
    return suppliers.some((s) => {
      if (!s || (excludeSupplierId && s.id === excludeSupplierId)) return false;
      const sStir = (s.inn || '').replace(/\D/g, '');
      const sType = s.cabinetType === 'manufacturer' ? 'manufacturer' : 'partner';
      return sStir === clean && sType === targetType;
    });
  };

  // STIR raqami kiritilganda orginfo.uz va bazadan MChJ / Zavod ma'lumotlarini avtomatik to'ldirish
  const handleStirChangeAndLookup = async (
    rawValue: string,
    isEdit = false,
    overrideCabinetType?: 'manufacturer' | 'partner'
  ) => {
    const cleanStir = rawValue.replace(/\D/g, '').slice(0, 9);
    const activeCabinetType = isEdit
      ? overrideCabinetType || editSuppCabinetType
      : overrideCabinetType || newSuppCabinetType;

    if (isEdit) {
      setEditSuppStir(cleanStir);
      setEditSuppStirError(null);
    } else {
      setNewSuppStir(cleanStir);
      setNewSuppStirError(null);
    }

    // Agar 9 ta raqam hali to'liq kiritilmagan bo'lsa
    if (cleanStir.length < 9) {
      if (isEdit) {
        setEditSuppCompanyInfo(null);
      } else {
        setNewSuppStirVerified(false);
        setNewSuppCompanyInfo(null);
        setNewSuppCompany('');
        setNewSuppName('');
        setNewSuppSurname('');
        setNewSuppRegion('');
        setNewSuppDistrict('');
      }
      return;
    }

    // Algoritm: Ayni kabinet turida (B2B da bo'lsa B2B da, B2C da bo'lsa B2C da) bu STIR mavjud bo'lsa bildirishnomasiz bloklanadi
    if (isStirTakenInCabinetType(cleanStir, activeCabinetType, isEdit ? editingSupplier?.id : undefined)) {
      if (isEdit) {
        setEditSuppCompanyInfo(null);
        setEditSuppCompany('');
        setEditSuppStirError(null);
      } else {
        setNewSuppStirVerified(false);
        setNewSuppCompanyInfo(null);
        setNewSuppCompany('');
        setNewSuppName('');
        setNewSuppSurname('');
        setNewSuppRegion('');
        setNewSuppDistrict('');
        setNewSuppStirError(null);
      }
      return;
    }

    // 1. Backend /api/company/lookup (orginfo.uz va stat.uz integratsiyasi) orqali rasmiy STIR ma'lumotlarini olish
    if (isEdit) {
      setEditSuppStirLoading(true);
    } else {
      setNewSuppStirLoading(true);
    }

    try {
      const resp = await fetch(`/api/company/lookup?inn=${cleanStir}&t=${Date.now()}`, {
        cache: 'no-store',
      });
      const resJson = await resp.json();

      if (!resp.ok || !resJson.success || !resJson.data) {
        const errMsg = resJson.error || "Ushbu STIR raqami bo‘yicha orginfo.uz va stat.uz reyestridan MChJ topilmadi.";
        if (isEdit) {
          setEditSuppStirError(errMsg);
          setEditSuppCompanyInfo(null);
        } else {
          setNewSuppStirError(errMsg);
          setNewSuppStirVerified(false);
          setNewSuppCompanyInfo(null);
          setNewSuppCompany('');
          setNewSuppName('');
          setNewSuppSurname('');
          setNewSuppRegion('');
          setNewSuppDistrict('');
        }
        return;
      }

      const comp: CompanyInfo = resJson.data;
      if (comp.status === 'liquidated') {
        const liqMsg = `«${comp.companyName}» faoliyati tugatilgan (Likvidatsiya).`;
        if (isEdit) {
          setEditSuppStirError(liqMsg);
          setEditSuppCompanyInfo(comp);
        } else {
          setNewSuppStirError(liqMsg);
          setNewSuppStirVerified(false);
          setNewSuppCompanyInfo(comp);
        }
        return;
      }

      const { firstName, lastName } = parseDirectorFullName(comp.director);
      const matchedRegion = resolveRegionKey(comp.region, comp.locality || comp.address);
      const matchedDistrict = resolveDistrictKey(matchedRegion, comp.district, comp.locality || comp.address);

      if (isEdit) {
        setEditSuppCompanyInfo(comp);
        setEditSuppCompany(comp.companyName || '');
        if (firstName) setEditSuppName(firstName);
        if (lastName) setEditSuppSurname(lastName);
        if (matchedRegion) setEditSuppRegion(matchedRegion);
        if (matchedDistrict) setEditSuppDistrict(matchedDistrict);
        if (comp.phone) setEditSuppPhone(formatUzPhone(comp.phone));
        if (comp.email) setEditSuppEmail(comp.email);
      } else {
        setNewSuppCompanyInfo(comp);
        setNewSuppCompany(comp.companyName || '');
        setNewSuppName(firstName || comp.director || '');
        setNewSuppSurname(lastName || '');
        setNewSuppRegion(matchedRegion || comp.locality || comp.region || 'O‘zbekiston');
        setNewSuppDistrict(matchedDistrict || comp.district || '');
        if (comp.phone) setNewSuppPhone(formatUzPhone(comp.phone));
        if (comp.email) setNewSuppEmail(comp.email);
        setNewSuppStirVerified(true);
      }
    } catch {
      const errMsg = "orginfo.uz va stat.uz serverlari bilan bog‘lanishda xatolik yuz berdi.";
      if (isEdit) setEditSuppStirError(errMsg);
      else setNewSuppStirError(errMsg);
    } finally {
      if (isEdit) {
        setEditSuppStirLoading(false);
      } else {
        setNewSuppStirLoading(false);
      }
    }
  };

  // STIR aniqlanganda barcha ma'lumotlarni bitta jadval va rasmiy xulosa asosida ko'rsatish
  const renderStirCompanyTable = (comp: CompanyInfo | null) => {
    if (!comp) return null;
    const rawSummary =
      comp.summaryText ||
      `${comp.companyName} (TIN ${comp.inn}) ${
        comp.status === 'active' ? 'faol tashkilotdir' : 'tugatilgan tashkilotdir'
      }. ${comp.registrationDate ? `Ro'yxatdan o'tgan sana: ${comp.registrationDate}. ` : ''}${
        comp.locality || comp.address ? `Viloyat: ${comp.locality || comp.address}. ` : ''
      }${comp.director ? `Direktor: ${comp.director.toUpperCase()}. ` : ''}${
        comp.activityType
          ? `Asosiy faoliyat turi${comp.okedCode ? ` (OKED ${comp.okedCode})` : ''}: ${comp.activityType}. `
          : ''
      }${comp.charterCapital ? `Ustav kapitali: ${comp.charterCapital}. ` : ''}${
        typeof comp.foundersCount === 'number' ? `Ta'sischilar soni: ${comp.foundersCount}.` : ''
      }`.trim();
    const summaryParagraph = rawSummary
      .replace(/\s*\d{2}\.\d{2}\.\d{4}\s+holatiga\s+ko['‘]ra\s+ma['‘]lumotlar.*$/i, '')
      .trim();

    return (
      <div className="mt-3 rounded-2xl bg-[#1C1F22] border-2 border-[#FFB800]/60 overflow-hidden shadow-xl animate-fadeIn">
        {/* Yuqori rasmiy tavsif matni (orginfo.uz / stat.uz formatida) */}
        <div className="p-4 bg-[#151719] border-b border-[#51504A] space-y-2">
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <h4 className="text-sm sm:text-base font-black text-[#FFB800] leading-snug">
              {comp.companyName}
            </h4>
            <span
              className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono font-black uppercase border ${
                comp.status === 'active'
                  ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                  : 'bg-red-500/20 text-red-400 border-red-500/40'
              }`}
            >
              {comp.status === 'active' ? 'Faol tashkilot' : 'Tugatilgan'}
            </span>
          </div>
          <p className="text-xs text-[#F5F5F2] leading-relaxed bg-[#222528] p-3 rounded-xl border border-[#51504A]">
            {summaryParagraph}
          </p>
        </div>

        {/* Barcha ma'lumotlar bitta jadval asosida */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-[#F5F5F2] border-collapse">
            <tbody className="divide-y divide-[#51504A]/60">
              <tr className="hover:bg-[#292C2F]/60">
                <th className="py-2.5 px-3.5 font-bold text-[#B8B8B3] w-2/5 bg-[#151719]/60">
                  Tashkilotning rasmiy nomi
                </th>
                <td className="py-2.5 px-3.5 font-black text-white">{comp.companyName}</td>
              </tr>
              {comp.shortName && (
                <tr className="hover:bg-[#292C2F]/60">
                  <th className="py-2.5 px-3.5 font-bold text-[#B8B8B3] bg-[#151719]/60">
                    Qisqacha nomi
                  </th>
                  <td className="py-2.5 px-3.5 font-bold text-amber-300">{comp.shortName}</td>
                </tr>
              )}
              <tr className="hover:bg-[#292C2F]/60">
                <th className="py-2.5 px-3.5 font-bold text-[#B8B8B3] bg-[#151719]/60">
                  STIR (TIN) / Faollik holati
                </th>
                <td className="py-2.5 px-3.5 font-mono font-black text-[#FFB800]">
                  {comp.inn} —{' '}
                  <span className={comp.status === 'active' ? 'text-emerald-400' : 'text-red-400'}>
                    {comp.status === 'active' ? 'Faol tashkilotdir (Hozirda mavjud)' : comp.statusDescription}
                  </span>
                </td>
              </tr>
              {comp.registrationDate && (
                <tr className="hover:bg-[#292C2F]/60">
                  <th className="py-2.5 px-3.5 font-bold text-[#B8B8B3] bg-[#151719]/60">
                    Ro'yxatdan o'tgan sana
                  </th>
                  <td className="py-2.5 px-3.5 font-mono font-bold text-white">
                    {comp.registrationDate}
                    {comp.registrationOrgan ? ` (${comp.registrationOrgan})` : ''}
                  </td>
                </tr>
              )}
              {(comp.locality || comp.address || comp.region) && (
                <tr className="hover:bg-[#292C2F]/60">
                  <th className="py-2.5 px-3.5 font-bold text-[#B8B8B3] bg-[#151719]/60">
                    Viloyat / Manzil
                  </th>
                  <td className="py-2.5 px-3.5 font-medium text-white">
                    {comp.locality || [comp.region, comp.district].filter(Boolean).join(', ')}
                    {comp.address && comp.address !== comp.locality && (
                      <span className="block text-[11px] text-[#B8B8B3] mt-0.5">{comp.address}</span>
                    )}
                  </td>
                </tr>
              )}
              {comp.director && (
                <tr className="hover:bg-[#292C2F]/60">
                  <th className="py-2.5 px-3.5 font-bold text-[#B8B8B3] bg-[#151719]/60">
                    Direktor (Rahbar)
                  </th>
                  <td className="py-2.5 px-3.5 font-black text-amber-400">
                    {comp.director.toUpperCase()}
                  </td>
                </tr>
              )}
              {comp.activityType && (
                <tr className="hover:bg-[#292C2F]/60">
                  <th className="py-2.5 px-3.5 font-bold text-[#B8B8B3] bg-[#151719]/60">
                    Asosiy faoliyat turi {comp.okedCode ? `(OKED ${comp.okedCode})` : '(IFUT)'}
                  </th>
                  <td className="py-2.5 px-3.5 font-semibold text-white">{comp.activityType}</td>
                </tr>
              )}
              {comp.charterCapital && (
                <tr className="hover:bg-[#292C2F]/60">
                  <th className="py-2.5 px-3.5 font-bold text-[#B8B8B3] bg-[#151719]/60">
                    Ustav kapitali
                  </th>
                  <td className="py-2.5 px-3.5 font-mono font-black text-emerald-400">
                    {comp.charterCapital}
                  </td>
                </tr>
              )}
              <tr className="hover:bg-[#292C2F]/60">
                <th className="py-2.5 px-3.5 font-bold text-[#B8B8B3] bg-[#151719]/60">
                  Ta'sischilar soni
                </th>
                <td className="py-2.5 px-3.5 font-bold text-white">
                  {comp.foundersCount ?? 1}
                  {comp.founders && comp.founders.length > 0 && (
                    <span className="text-[11px] text-[#B8B8B3] font-normal ml-1.5">
                      ({comp.founders.join(', ')})
                    </span>
                  )}
                </td>
              </tr>
              {(comp.phone || comp.email) && (
                <tr className="hover:bg-[#292C2F]/60">
                  <th className="py-2.5 px-3.5 font-bold text-[#B8B8B3] bg-[#151719]/60">
                    Aloqa ma'lumotlari
                  </th>
                  <td className="py-2.5 px-3.5 font-mono text-white">
                    {[comp.phone, comp.email].filter(Boolean).join(' • ')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  // Universal Tasdiqlash Paroli Oynasi (Har bir tasdiqlash talab qiladigan jarayon uchun Aquarius.102 yoki Admin paroli)
  const [confirmModal, setConfirmModal] = useState<{
    title: string;
    description: string;
    onConfirm: () => void;
  } | null>(null);
  const [confirmModalPass, setConfirmModalPass] = useState('');
  const [confirmModalError, setConfirmModalError] = useState<string | null>(null);

  const isValidConfirmPassword = (pass: string): boolean => {
    const trimmed = pass.trim();
    if (!trimmed) return false;
    const currentAdminPass = (config.password || 'ADMIN.').trim();
    return trimmed === currentAdminPass;
  };

  const openConfirmModal = (title: string, description: string, onConfirm: () => void) => {
    setConfirmModalPass('');
    setConfirmModalError(null);
    setConfirmModal({ title, description, onConfirm });
  };

  // Social Links Modal (Linkni almashtirish yoki linkga o'tish)
  const [socialModal, setSocialModal] = useState<{
    type: 'telegram' | 'instagram' | 'phone';
    title: string;
    currentVal: string;
  } | null>(null);
  const [socialEditVal, setSocialEditVal] = useState('');
  const [socialConfirmPass, setSocialConfirmPass] = useState('');
  const [socialConfirmError, setSocialConfirmError] = useState<string | null>(null);
  const [socialSavedNotice, setSocialSavedNotice] = useState(false);

  // Search & Filter states
  const [supplierSearch, setSupplierSearch] = useState('');
  const [supplierFilterStatus, setSupplierFilterStatus] = useState<'all' | 'active' | 'blocked' | 'pending'>('all');
  const [logSearch, setLogSearch] = useState('');
  const [logCategoryFilter, setLogCategoryFilter] = useState<string>('all');

  // Sozlamalar modal holati
  const [newLogin, setNewLogin] = useState(config.login);
  const [newPassword, setNewPassword] = useState(config.password);
  const [oldPassword, setOldPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showOldPassword, setShowOldPassword] = useState(false);
  const [selectedLogo, setSelectedLogo] = useState<string | null>(config.logoUrl || null);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [telegram, setTelegram] = useState(config.telegram || '@bunkerstroy_uz');
  const [instagram, setInstagram] = useState(config.instagram || '@bunkerstroy_official');
  const [phone, setPhone] = useState(config.phone || '+998 (71) 200-00-50');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Sync settings inputs when config changes
  useEffect(() => {
    setNewLogin(config.login);
    setNewPassword(config.password);
    setSelectedLogo(config.logoUrl || null);
    setTelegram(config.telegram || '@bunkerstroy_uz');
    setInstagram(config.instagram || '@bunkerstroy_official');
    setPhone(config.phone || '+998 (71) 200-00-50');
  }, [config, isSettingsOpen]);

  // 3 marta bosilganda sozlamalarni ochish
  const exitClickCountRef = useRef(0);
  const exitTimerRef = useRef<any>(null);

  const handleChiqishClick = () => {
    exitClickCountRef.current += 1;
    if (exitClickCountRef.current === 3) {
      exitClickCountRef.current = 0;
      if (exitTimerRef.current) clearTimeout(exitTimerRef.current);
      setIsSettingsOpen(true);
      return;
    }

    if (exitTimerRef.current) clearTimeout(exitTimerRef.current);
    exitTimerRef.current = setTimeout(() => {
      if (exitClickCountRef.current > 0 && exitClickCountRef.current < 3) {
        exitClickCountRef.current = 0;
        if (onLogout) onLogout();
      }
    }, 400);
  };

  const handlePdfUpload = (e: React.ChangeEvent<HTMLInputElement>, isEdit = false) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const fileName = file.name;
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUri = reader.result as string;
      if (isEdit) {
        setEditSuppPdfName(fileName);
        setEditSuppPdfData(dataUri);
      } else {
        setNewSuppPdfName(fileName);
        setNewSuppPdfData(dataUri);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleDownloadPdf = (dataUri?: string, name?: string) => {
    if (!dataUri) return;
    const link = document.createElement('a');
    link.href = dataUri;
    link.download = name || 'shartnoma_hujjati';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Yangi tur yozib tanlash funksiyasi
  const handleSelectCustomCategory = () => {
    if (!pickerCustomInput.trim()) return;
    const val = pickerCustomInput.trim();
    addProductType(val);
    if (isEditCategoryPickerOpen) {
      setEditSuppCategory(val);
      setIsEditCategoryPickerOpen(false);
    } else {
      setNewSuppCategory(val);
      setIsCategoryPickerOpen(false);
    }
    setPickerCustomInput('');
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setErrorMessage("Iltimos, rasm formatidagi faylni yuklang (PNG, JPG, SVG).");
      return;
    }

    setSelectedFileName(file.name);
    setErrorMessage(null);

    const compressedUrl = await compressImageFileToDataUrl(file, 256, 0.82);
    if (compressedUrl) {
      setSelectedLogo(compressedUrl);
    }
  };

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!newLogin.trim() || newLogin.trim().length < 5) {
      setErrorMessage("Login kamida 5 ta belgidan iborat bo‘lishi kerak!");
      return;
    }

    if (!newPassword.trim() || newPassword.trim().length < 7) {
      setErrorMessage("Parol kamida 7 ta belgidan iborat bo‘lishi kerak!");
      return;
    }

    const adminConflict = getLoginConflictError(newLogin.trim(), 'admin-master', newPassword.trim(), {
      requirePassword: true,
      currentAccount: config,
    });
    if (adminConflict) {
      if (isLoginRejectedError(adminConflict)) {
        setNewLogin('');
      }
      setErrorMessage(adminConflict);
      return;
    }

    openConfirmModal(
      "Sozlamalarni saqlashni tasdiqlash",
      "Admin kabineti sozlamalarini saqlash uchun tasdiqlash parolini kiriting.",
      () => {
        const updatedConfig: AdminConfig = {
          login: newLogin.trim(),
          password: newPassword.trim(),
          logoUrl: selectedLogo || null,
          telegram: telegram.trim(),
          instagram: instagram.trim(),
          phone: phone.trim(),
        };

        saveAdminConfig(updatedConfig);
        setConfig(updatedConfig);
        if (onConfigChange) onConfigChange(updatedConfig);

        setSaveSuccess(true);
        setTimeout(() => {
          setSaveSuccess(false);
          setIsSettingsOpen(false);
          setOldPassword('');
        }, 1200);
      }
    );
  };

  const handleRemoveLogo = () => {
    setSelectedLogo(null);
    setSelectedFileName(null);
  };

  // Ta'minotchi qo'shish (STIR orqali bitta jadval asosida olingan ma'lumotlar + Saqlash bosilganda Tasdiqlash paroli so'raladi)
  const handleAddSupplierSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanStir = newSuppStir.replace(/\D/g, '');
    if (cleanStir.length !== 9) {
      setNewSuppStirError("Iltimos, STIR raqamini kiriting!");
      return;
    }
    if (isStirTakenInCabinetType(cleanStir, newSuppCabinetType)) {
      return;
    }
    if (!newSuppCompany.trim()) {
      setNewSuppStirError("Avval STIR raqamini tekshirib, tashkilot ma'lumotlarini yuklang!");
      return;
    }
    if (!newSuppLogin.trim()) return;
    const loginConflict = getLoginConflictError(newSuppLogin.trim(), undefined, newSuppPassword.trim(), {
      requirePassword: true,
    });
    if (loginConflict) {
      if (isLoginRejectedError(loginConflict)) {
        setNewSuppLogin('');
      }
      setNewSuppContractError(loginConflict);
      return;
    }

    const contractNum = newSuppContractNumber.trim();
    setNewSuppContractError(null);
    setNewSuppConfirmError(null);

    openConfirmModal(
      "Kabinetni saqlashni tasdiqlash",
      `«${newSuppCompany.trim()}» korxonasi kabinetini saqlash uchun tasdiqlash parolini kiriting.`,
      () => {
        const trimmedCategory = newSuppCategory.trim() || "Ichki ta'mir";
        addProductType(trimmedCategory);

        const finalRegion =
          newSuppRegion ||
          newSuppCompanyInfo?.locality ||
          newSuppCompanyInfo?.region ||
          'O‘zbekiston';
        const selectedDistrict =
          newSuppDistrict ||
          newSuppCompanyInfo?.district ||
          (REGIONS_AND_DISTRICTS[finalRegion]?.[0] || '');
        const resolvedPhone =
          getUzPhoneDigitsCount(newSuppPhone) === 9
            ? formatUzPhone(newSuppPhone.trim())
            : newSuppCompanyInfo?.phone
            ? formatUzPhone(newSuppCompanyInfo.phone)
            : '+998 00 000 00 00';

        const newSupplier: SupplierPartner = {
          id: `supp-${Date.now()}`,
          cabinetType: newSuppCabinetType,
          inn: newSuppStir.trim(),
          companyInfo: newSuppCompanyInfo || undefined,
          name: newSuppName.trim() || newSuppCompanyInfo?.director || 'Rahbar',
          surname: newSuppSurname.trim() || undefined,
          companyName: newSuppCompany.trim(),
          phone: resolvedPhone,
          email: newSuppEmail.trim() || newSuppCompanyInfo?.email || `${newSuppLogin.trim()}@bunkerstroy.uz`,
          login: newSuppLogin.trim(),
          password: newSuppPassword.trim() || 'parol123',
          region: finalRegion,
          district: selectedDistrict,
          category: trimmedCategory,
          contractNumber: contractNum,
          contractPdfName: newSuppPdfName || undefined,
          contractPdfData: newSuppPdfData || undefined,
          allowPromoVideo: newSuppAllowPromoVideo,
          commissionRate: Math.min(100, Math.max(0.1, Number(newSuppCommission) || 0.1)),
          commissionBasis: newSuppCommissionBasis,
          status: 'active',
          productsCount: 0,
          totalSalesSum: 0,
          rating: 5.0,
          createdAt: new Date().toISOString(),
        };

        syncSupplierToFirestore(newSupplier);
        createSupplierApi(newSupplier).then((res) => {
          if (res?.data?.id) newSupplier.id = res.data.id;
        }).catch((err) => console.warn('Backend createSupplier notice:', err));

        const updatedSuppliersAfterAdd = [newSupplier, ...suppliers];
        persistSuppliersSafe(updatedSuppliersAfterAdd);
        setSuppliers(updatedSuppliersAfterAdd);
        setTimeout(() => {
          try {
            window.dispatchEvent(new CustomEvent('bunkerstroy_suppliers_updated'));
            window.dispatchEvent(new Event('storage'));
          } catch {}
        }, 0);

        setSupplierCabinetSubTab(newSuppCabinetType);

        addLog(
          newSuppCabinetType === 'manufacturer'
            ? "Yangi Ishlab chiqaruvchi Ta'minot Kabineti qo‘shildi"
            : "Yangi Hamkor Ta’minotchi kabineti qo‘shildi",
          'add_cabinet',
          `«${newSupplier.companyName}» (STIR: ${newSupplier.inn || '-'}, ${newSuppCabinetType === 'manufacturer' ? "Ishlab chiqaruvchi Ta'minot Kabineti" : "Hamkor Ta’minotchi kabineti"}) shakllantirildi. Mas'ul: ${newSupplier.name} ${newSupplier.surname || ''}, Login: ${newSupplier.login}, Shartnoma: ${newSupplier.contractNumber}, Komissiya: ${newSupplier.commissionRate}% (${newSupplier.commissionBasis === 'profit' ? 'Foydadan' : 'Umumiydan'}).`,
          'success'
        );

        setSupplierAddSuccess(true);
        setTimeout(() => {
          setSupplierAddSuccess(false);
          setIsAddSupplierOpen(false);
          setNewSuppStir('');
          setNewSuppStirError(null);
          setNewSuppStirVerified(false);
          setNewSuppCompanyInfo(null);
          setNewSuppName('');
          setNewSuppSurname('');
          setNewSuppCompany('');
          setNewSuppPhone('+998 ');
          setNewSuppPhoneError(null);
          setNewSuppEmail('');
          setNewSuppLogin('');
          setNewSuppPassword('');
          setNewSuppRegion('');
          setNewSuppDistrict('');
          setNewSuppCategory('');
          setNewSuppContractNumber('');
          setNewSuppContractError(null);
          setNewSuppPdfName(null);
          setNewSuppPdfData(null);
          setNewSuppAllowPromoVideo(false);
          setNewSuppCommission(5);
          setNewSuppCommissionBasis('total');
          setNewSuppConfirmPass('');
          setNewSuppConfirmError(null);
          setIsCategoryPickerOpen(false);
        }, 1200);
      }
    );
  };

  // Korxona kabinetini tahrirlash oynasini ochish
  const handleOpenEditSupplier = (supplier: SupplierPartner) => {
    setEditingSupplier(supplier);
    setEditSuppCabinetType(supplier.cabinetType || 'partner');
    setEditSuppStir(supplier.inn || '');
    setEditSuppStirError(null);
    setEditSuppCompanyInfo(supplier.companyInfo || null);
    setEditSuppCompany(supplier.companyName);
    setEditSuppName(supplier.name);
    setEditSuppSurname(supplier.surname || '');
    setEditSuppPhone(formatUzPhone(supplier.phone));
    setEditSuppPhoneError(null);
    setEditSuppLogin(supplier.login);
    setEditSuppPassword(supplier.password || '');
    setEditSuppEmergencyPass('');
    setEditSuppRegion(supplier.region || '');
    setEditSuppDistrict(supplier.district || (supplier.region ? REGIONS_AND_DISTRICTS[supplier.region]?.[0] || '' : ''));
    setEditSuppCategory(supplier.category);
    setEditSuppContractNumber(supplier.contractNumber || '');
    setEditSuppContractError(null);
    setEditSuppPdfName(supplier.contractPdfName || null);
    setEditSuppPdfData(supplier.contractPdfData || null);
    setEditSuppAllowPromoVideo(Boolean(supplier.allowPromoVideo));
    setEditSuppCommission(Math.min(100, Math.max(0.1, Number(supplier.commissionRate) || 0.1)));
    setEditSuppCommissionBasis(supplier.commissionBasis === 'profit' ? 'profit' : 'total');
    setIsEditCategoryPickerOpen(false);
    setShowDeleteConfirm(false);
    setDeleteConfirmPass('');
    setDeleteConfirmError(null);
    setEditConfirmPass('');
    setEditConfirmError(null);
    setIsEditSupplierOpen(true);
    if (supplier.inn && supplier.inn.replace(/\D/g, '').length === 9) {
      handleStirChangeAndLookup(supplier.inn, true);
    }
  };

  // Korxona kabinetini va unga tegishli mahsulotlarni butunlay o'chirish funksiyasi
  const executeDeleteSupplier = (supplier: SupplierPartner) => {
    const updatedAfterDelete = suppliers.filter(
      (s) => s.id !== supplier.id && !(s.companyName === supplier.companyName && s.login === supplier.login)
    );
    persistSuppliersSafe(updatedAfterDelete);
    setSuppliers(updatedAfterDelete);
    deleteSupplierApi(supplier.id).catch((err) => console.warn('Backend deleteSupplier notice:', err));

    // O'chirilgan kabinetga tegishli mahsulotlarni ham o'chirish (boshqa kabinet turidagi korxona mahsulotlariga tegmasdan)
    try {
      const savedProds = localStorage.getItem('bunkerstroy_products');
      if (savedProds) {
        const prodList = JSON.parse(savedProds);
        if (Array.isArray(prodList)) {
          const suppComp = (supplier.companyName || '').toLowerCase();
          const remaining = prodList.filter((p: any) => {
            if (p?.supplierId) {
              const isIdMatch = p.supplierId === supplier.id;
              if (isIdMatch && p?.id) {
                deleteDoc(doc(db, 'products', p.id)).catch(() => {});
              }
              return !isIdMatch;
            }
            const pSupp = (p?.supplierName || '').toLowerCase();
            const sameType = !p?.supplierCabinetType || !supplier.cabinetType || p.supplierCabinetType === supplier.cabinetType;
            const isMatch = pSupp === suppComp && sameType;
            if (isMatch && p?.id) {
              deleteDoc(doc(db, 'products', p.id)).catch(() => {});
            }
            return !isMatch;
          });
          localStorage.setItem('bunkerstroy_products', JSON.stringify(remaining));
        }
      }
    } catch {}

    setTimeout(() => {
      try {
        window.dispatchEvent(new CustomEvent('bunkerstroy_suppliers_updated'));
        window.dispatchEvent(new Event('storage'));
      } catch {}
    }, 0);

    addLog(
      'Ta’minotchi kabineti o‘chirildi',
      'delete_cabinet',
      `«${supplier.companyName}» (Mas'ul: ${supplier.name} ${supplier.surname || ''}, Login: ${supplier.login}) korxonasi kabineti va mahsulotlari tizimdan butunlay o‘chirildi.`,
      'error'
    );

    setShowDeleteConfirm(false);
    setIsEditSupplierOpen(false);
    setIsAboutSupplierOpen(false);
    setIsReportModalOpen(false);
    setSelectedReportSupplier(null);
    setEditingSupplier(null);
  };

  const handleRequestDeleteSupplier = (supplier: SupplierPartner) => {
    openConfirmModal(
      "Korxona kabinetini o‘chirishni tasdiqlash",
      `Diqqat! «${supplier.companyName}» korxonasi kabineti tizimdan butunlay o‘chirib tashlanadi. Davom etish uchun tasdiqlash parolini kiriting.`,
      () => executeDeleteSupplier(supplier)
    );
  };

  // Korxona kabinetini va unga tegishli mahsulotlarni butunlay o'chirish
  const confirmDeleteSupplier = (supplier: SupplierPartner) => {
    if (!isValidConfirmPassword(deleteConfirmPass)) {
      setDeleteConfirmError("Kiritilgan tasdiqlash paroli noto'g'ri!");
      return;
    }
    setDeleteConfirmError(null);
    executeDeleteSupplier(supplier);
  };

  // Korxona kabineti tahririni saqlash (Saqlash tugmasi bosilgandan keyin tasdiqlash paroli so'raladi)
  const handleEditSupplierSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSupplier || !editSuppCompany.trim() || !editSuppLogin.trim()) return;
    const cleanEditStir = editSuppStir.replace(/\D/g, '');
    if (cleanEditStir.length === 9 && isStirTakenInCabinetType(cleanEditStir, editSuppCabinetType, editingSupplier.id)) {
      return;
    }
    const editLoginConflict = getLoginConflictError(editSuppLogin.trim(), editingSupplier.id, editSuppPassword.trim(), {
      currentAccount: editingSupplier,
    });
    if (editLoginConflict) {
      if (isLoginRejectedError(editLoginConflict)) {
        setEditSuppLogin('');
      }
      setEditSuppContractError(editLoginConflict);
      return;
    }

    const contractNum = editSuppContractNumber.trim() || editingSupplier.contractNumber || '';
    setEditSuppContractError(null);
    setEditConfirmError(null);

    openConfirmModal(
      "O‘zgarishlarni saqlashni tasdiqlash",
      `«${editSuppCompany.trim()}» korxonasi ma'lumotlarini saqlash uchun tasdiqlash parolini kiriting.`,
      () => {
        const trimmedCategory = editSuppCategory.trim() || "Ichki ta'mir";
        addProductType(trimmedCategory);

        const finalRegion =
          editSuppRegion ||
          editSuppCompanyInfo?.locality ||
          editSuppCompanyInfo?.region ||
          editingSupplier.region;
        const selectedDistrict =
          editSuppDistrict ||
          editSuppCompanyInfo?.district ||
          (REGIONS_AND_DISTRICTS[finalRegion]?.[0] || '');
        const emergencyPass = editSuppEmergencyPass.trim();
        const resolvedPhone =
          getUzPhoneDigitsCount(editSuppPhone) === 9
            ? formatUzPhone(editSuppPhone.trim())
            : editSuppCompanyInfo?.phone
            ? formatUzPhone(editSuppCompanyInfo.phone)
            : editingSupplier.phone;

        const nextSupp: SupplierPartner = {
          ...editingSupplier,
          cabinetType: editSuppCabinetType,
          inn: editSuppStir.trim() || editingSupplier.inn,
          companyInfo: editSuppCompanyInfo || editingSupplier.companyInfo,
          companyName: editSuppCompany.trim(),
          name: editSuppName.trim() || editSuppCompanyInfo?.director || editingSupplier.name,
          surname: editSuppSurname.trim() || undefined,
          phone: resolvedPhone,
          login: editSuppLogin.trim(),
          password: editSuppPassword.trim() || editingSupplier.password,
          emergencyPassword: emergencyPass || editingSupplier.emergencyPassword,
          mustChangeCredentials: Boolean(emergencyPass) || editingSupplier.mustChangeCredentials,
          region: finalRegion,
          district: selectedDistrict,
          category: trimmedCategory,
          contractNumber: contractNum,
          contractPdfName: editSuppPdfName || undefined,
          contractPdfData: editSuppPdfData || undefined,
          allowPromoVideo: editSuppAllowPromoVideo,
          commissionRate: editingSupplier.commissionRate || 5,
          commissionBasis: editingSupplier.commissionBasis || 'total',
        };

        syncSupplierToFirestore(nextSupp);

        const updatedSuppliersAfterEdit = suppliers.map((s) => (s.id === editingSupplier.id ? nextSupp : s));
        persistSuppliersSafe(updatedSuppliersAfterEdit);
        setSuppliers(updatedSuppliersAfterEdit);
        setTimeout(() => {
          try {
            window.dispatchEvent(new CustomEvent('bunkerstroy_suppliers_updated'));
            window.dispatchEvent(new Event('storage'));
          } catch {}
        }, 0);

        if (selectedReportSupplier?.id === editingSupplier.id) {
          setSelectedReportSupplier(nextSupp);
        }

        addLog(
          'Korxona kabineti ma’lumotlari tahrirlandi',
          'edit_cabinet',
          `«${editSuppCompany.trim()}» korxonasi kabineti yangilandi. Mas'ul: ${editSuppName.trim()} ${editSuppSurname.trim()}, Login: ${editSuppLogin.trim()}, Shartnoma: ${contractNum}, Komissiya: ${editSuppCommission}% (${editSuppCommissionBasis === 'profit' ? 'Foydadan' : 'Umumiydan'}).`,
          'warning'
        );

        if (emergencyPass) {
          addLog(
            '1 martalik favqulodda kirish paroli berildi',
            'emergency_pass',
            `«${editSuppCompany.trim()}» korxonasi uchun 1 martalik favqulodda kirish paroli o‘rnatildi: «${emergencyPass}». Kabinetga kirilganda yangi login va parol o‘rnatish oynasi ochiladi.`,
            'warning'
          );
        }

        setSupplierEditSuccess(true);
        setTimeout(() => {
          setSupplierEditSuccess(false);
          setIsEditSupplierOpen(false);
          setEditingSupplier(null);
        }, 1200);
      }
    );
  };

  // Hamkor hisobotini ochish (Sotilganlar, Qaytarilganlar, Qayerdan-Qayerga marshrutlar va Tahrirlashga o'tish)
  const handleOpenSupplierReport = (supp: SupplierPartner) => {
    setSelectedReportSupplier(supp);
    setActiveReportTab('sales');
    setReportPeriod('all');
    setReportDateStr(new Date().toISOString().slice(0, 10));
    setIsReportModalOpen(true);
  };

  // Loglar toifasi bo'yicha vizual ranglar va yorliqlar
  const getLogCategoryMeta = (cat: LogCategory | string) => {
    switch (cat) {
      case 'add_cabinet':
        return {
          label: "+ Kabinet Qo‘shildi",
          color: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40',
          dot: 'bg-emerald-400',
        };
      case 'edit_cabinet':
        return {
          label: "✎ Tahrirlandi",
          color: 'bg-amber-500/20 text-amber-300 border border-[#FFB800]/50',
          dot: 'bg-amber-400',
        };
      case 'delete_cabinet':
        return {
          label: "🗑 O‘chirildi",
          color: 'bg-rose-500/20 text-rose-300 border border-rose-500/40',
          dot: 'bg-rose-400',
        };
      case 'auth_access':
      case 'auth':
        return {
          label: "👤 Kirish / Chiqish",
          color: 'bg-sky-500/20 text-sky-300 border border-sky-500/40',
          dot: 'bg-sky-400',
        };
      case 'emergency_pass':
        return {
          label: "🔑 1 Martalik Parol",
          color: 'bg-purple-500/20 text-purple-300 border border-purple-500/40',
          dot: 'bg-purple-400',
        };
      case 'orders_sales':
        return {
          label: "📦 Sotuv / Yetkazma",
          color: 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40',
          dot: 'bg-indigo-400',
        };
      case 'supplier':
        return {
          label: "+ Kabinet Qo‘shildi",
          color: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40',
          dot: 'bg-emerald-400',
        };
      case 'cabinet':
        return {
          label: "✎ Tahrirlandi",
          color: 'bg-amber-500/20 text-amber-300 border border-[#FFB800]/50',
          dot: 'bg-amber-400',
        };
      default:
        return {
          label: "⚙ Tizim Amali",
          color: 'bg-slate-800 text-slate-300 border border-slate-700',
          dot: 'bg-slate-400',
        };
    }
  };

  const manufacturersCount = suppliers.filter((s) => s?.cabinetType === 'manufacturer').length;
  const partnersCount = suppliers.filter((s) => (s?.cabinetType || 'partner') === 'partner').length;

  // Filtrlangan ta'minotchilar (Ta'minotchi Kabinetlar, B2B Kabineti yoki B2C Kabineti bo'yicha — Umumiy savdo bo'yicha tartiblangan!)
  const filteredSuppliers = suppliers
    .filter((s) => {
      const sType = s?.cabinetType || 'partner';
      if (supplierCabinetSubTab !== 'all' && sType !== supplierCabinetSubTab) return false;
      const searchTerm = (supplierSearch || '').toLowerCase();
      const fullName = `${s?.name || ''} ${s?.surname || ''}`.toLowerCase();
      const matchesSearch =
        (s?.companyName || '').toLowerCase().includes(searchTerm) ||
        (s?.inn || '').toLowerCase().includes(searchTerm) ||
        fullName.includes(searchTerm) ||
        (s?.login || '').toLowerCase().includes(searchTerm) ||
        (s?.region || '').toLowerCase().includes(searchTerm) ||
        (s?.category || '').toLowerCase().includes(searchTerm);
      const matchesStatus = supplierFilterStatus === 'all' || s?.status === supplierFilterStatus;
      return matchesSearch && matchesStatus;
    })
    .sort((a, b) => {
      const repA = getSupplierReport(
        a.companyName,
        `${a.name} ${a.surname || ''}`.trim(),
        a.region,
        a.phone,
        a.contractNumber || '',
        a.commissionRate || 5,
        a.commissionBasis || 'total',
        'all',
        undefined,
        a.id,
        a.inn,
        true
      );
      const repB = getSupplierReport(
        b.companyName,
        `${b.name} ${b.surname || ''}`.trim(),
        b.region,
        b.phone,
        b.contractNumber || '',
        b.commissionRate || 5,
        b.commissionBasis || 'total',
        'all',
        undefined,
        b.id,
        b.inn,
        true
      );
      return repB.totalSalesSum - repA.totalSalesSum;
    });

  // Filtrlangan loglar
  const filteredLogs = logs.filter((l) => {
    const searchTerm = (logSearch || '').toLowerCase();
    const matchesSearch =
      (l?.action || '').toLowerCase().includes(searchTerm) ||
      (l?.details || '').toLowerCase().includes(searchTerm) ||
      (l?.actor || '').toLowerCase().includes(searchTerm);
    const matchesCat = logCategoryFilter === 'all' || l?.category === logCategoryFilter;
    return matchesSearch && matchesCat;
  });

  // Filtrlangan moliyaviy operatsiyalar
  const filteredTransactions = transactions.filter((t) => {
    if (txFilter === 'all') return true;
    return t.type === txFilter;
  });

  const regionsList = Object.keys(REGIONS_AND_DISTRICTS);

  const formatPriceSum = (amount: number) => formatPrice(amount);

  const handleAddTransactionSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const rawDigits = newTxAmount.replace(/\D/g, '');
    const amountVal = parseInt(rawDigits, 10);
    if (!amountVal || amountVal <= 0) return;
    if (!newTxSource.trim()) return;

    const newTx: FinancialTransaction = {
      id: 'tx-' + Date.now().toString(36),
      type: newTxType,
      category: newTxCategory,
      sourceOrDestination: newTxSource.trim(),
      amount: amountVal,
      paymentMethod: newTxPaymentMethod,
      date: new Date().toISOString().replace('T', ' ').slice(0, 16),
      status: 'completed',
    };

    setTransactions((prev) => [newTx, ...prev]);

    addLog(
      newTxType === 'income' ? 'Moliyaviy kirim qayd etildi' : 'Moliyaviy chiqim qayd etildi',
      'orders_sales',
      `${newTxCategory}: ${newTxSource.trim()}, Summa: ${formatPriceSum(amountVal)} (${newTxPaymentMethod})`,
      newTxType === 'income' ? 'success' : 'warning'
    );

    setIsAddTxOpen(false);
    setNewTxSource('');
    setNewTxAmount('');
  };

  const handleClearAllTransactions = () => {
    openConfirmModal(
      "Moliyaviy ma'lumotlarni tozalashni tasdiqlash",
      "Barcha kirim va chiqim operatsiyalari 0 ga qaytariladi. Davom etish uchun tasdiqlash parolini kiriting.",
      () => {
        setTransactions([]);
        setOrders([]);
        try {
          localStorage.removeItem('bunkerstroy_transactions');
          localStorage.removeItem('bunkerstroy_orders');
        } catch {}
        addLog(
          'Moliyaviy operatsiyalar tozalandi',
          'delete_cabinet',
          'Barcha kirim va chiqim operatsiyalari admin tomonidan tozalandi (0 ga qaytarildi).',
          'error'
        );
      }
    );
  };

  const handleClearAllLogs = () => {
    openConfirmModal(
      "Tizim loglarini tozalashni tasdiqlash",
      "Barcha tizim loglari o‘chiriladi. Davom etish uchun tasdiqlash parolini kiriting.",
      () => {
        setLogs([]);
        try {
          localStorage.removeItem('bunkerstroy_logs');
        } catch {}
      }
    );
  };

  const [selectedAdminMapLocation, setSelectedAdminMapLocation] = useState<{
    title: string;
    subtitle?: string;
    address: string;
    coords: { lat: number; lng: number } | null;
  } | null>(null);
  const [adminMapType, setAdminMapType] = useState<'m' | 'k'>('m');

  const extractCoordsFromAddress = (addr?: string): { lat: number; lng: number } | null => {
    if (!addr) return null;
    const match = addr.match(/\[Google Maps:\s*([-+]?\d*\.?\d+)\s*,\s*([-+]?\d*\.?\d+)\]/i);
    if (match && match[1] && match[2]) {
      const lat = parseFloat(match[1]);
      const lng = parseFloat(match[2]);
      if (!isNaN(lat) && !isNaN(lng)) return { lat, lng };
    }
    return null;
  };

  // Manzilni faqat "Viloyat, Tuman yoki shahar" ko'rinishida qisqartirib ko'rsatish
  const formatRegionAndDistrictOnly = (addr?: string): string => {
    if (!addr) return 'Toshkent sh.';
    const cleaned = addr.replace(/\[Google Maps:.*?\]/gi, '').trim();
    const parts = cleaned
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[0]}, ${parts[1]}`;
    }
    return cleaned || 'Toshkent sh.';
  };

  const formatCleanFullAddress = (addr?: string): string => {
    if (!addr) return 'Toshkent sh.';
    return addr.replace(/\[Google Maps:.*?\]/gi, '').trim() || 'Toshkent sh.';
  };

  // Real vaqtda barcha buyurtma va yetkazish holatlari haqida adminga hisobot bloki
  const renderRealtimeOrderStatusPanel = () => {
    if (!orders || orders.length === 0) return null;
    return (
      <div className="bg-[#222528] border-2 border-[#FFB800]/60 rounded-2xl p-5 shadow-2xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#51504A]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#FFB800]/20 text-[#FFB800] border border-[#FFB800]/50 flex items-center justify-center shrink-0">
              <Truck className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm sm:text-base font-black text-white">
                  Real Vaqtda Buyurtma va Yetkazish Holatlari Hisoboti
                </h3>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-black bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 animate-pulse">
                  ● Jonli ({orders.length} ta buyurtma)
                </span>
              </div>
              <p className="text-[11px] text-[#B8B8B3] mt-0.5">
                Mijoz xaridi, ta'minotchi qabul qilishi (Yuklash jarayonida), yetkazib beruvchi raqami va yetkazish manzili monitoringi
              </p>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-[#51504A]">
          <table className="w-full text-left text-xs text-[#F5F5F2]">
            <thead className="bg-[#292C2F] text-amber-400 uppercase text-[10px] tracking-wider border-b border-[#51504A]">
              <tr>
                <th className="py-3 px-3 font-black">№ / Vaqt</th>
                <th className="py-3 px-4 font-black">Ta'minotchi</th>
                <th className="py-3 px-4 font-black">Mijoz</th>
                <th className="py-3 px-4 font-black">Yetkazish Manzili (Viloyat / Tuman)</th>
                <th className="py-3 px-4 font-black">Mahsulot va Summa</th>
                <th className="py-3 px-4 font-black">Yetkazib Beruvchi Tel</th>
                <th className="py-3 px-4 font-black text-center">Real Vaqt Holati</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-blue-500/20 bg-[#071533]">
              {orders.map((ord: any, idx: number) => {
                const firstItem = Array.isArray(ord.items) && ord.items[0] ? ord.items[0] : null;
                const suppName =
                  firstItem?.supplierName ||
                  firstItem?.product?.supplierName ||
                  suppliers[0]?.companyName ||
                  "Ta'minotchi";
                const prodsText = Array.isArray(ord.items)
                  ? ord.items
                      .map((it: any) => `${it.title || it?.product?.title || 'Mahsulot'} (${it.quantity} ${it.unit || 'dona'})`)
                      .join(', ')
                  : '—';
                const buyerName = ord.recipientName || ord.buyerName || 'Mijoz';
                const buyerPhone = ord.recipientPhone || ord.buyerPhone || '—';
                const addr = ord.deliveryAddress || 'Toshkent sh.';
                const timeStr = ord.updatedAt || ord.createdAt;
                const formattedTime = timeStr
                  ? new Date(timeStr).toISOString().replace('T', ' ').slice(0, 16)
                  : '—';

                return (
                  <tr key={ord.id || idx} className="hover:bg-[#0c265e] transition-colors">
                    <td className="py-3 px-3 font-mono">
                      <span className="text-amber-400 font-black block">
                        #{(ord.id || '').slice(-6).toUpperCase() || idx + 1}
                      </span>
                      <span className="text-[10px] text-[#B8B8B3]">{formattedTime}</span>
                    </td>
                    <td className="py-3 px-4 font-bold text-white">{suppName}</td>
                    <td className="py-3 px-4">
                      <span className="font-bold text-white block">{buyerName}</span>
                      <span className="text-[11px] font-mono text-emerald-400">{buyerPhone}</span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="inline-flex items-center gap-2 bg-[#151719] border border-[#51504A] px-3 py-1.5 rounded-xl">
                        <span className="font-bold text-white text-xs">
                          {formatRegionAndDistrictOnly(addr)}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setSelectedAdminMapLocation({
                              title: `${buyerName} — Yetkazish Manzili`,
                              subtitle: `${buyerPhone} • ${suppName}`,
                              address: addr,
                              coords: extractCoordsFromAddress(addr),
                            })
                          }
                          title="Xaritadan ko‘rish"
                          className="p-1.5 rounded-lg bg-[#FFB800]/20 hover:bg-[#FFB800] text-[#FFB800] hover:text-slate-950 border border-[#FFB800]/50 cursor-pointer transition-all shadow-sm active:scale-95 shrink-0"
                        >
                          <MapPin className="w-3.5 h-3.5 stroke-[2.3]" />
                        </button>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-white font-semibold block max-w-[200px] truncate" title={prodsText}>
                        {prodsText}
                      </span>
                      <span className="font-mono font-black text-[#FFB800] text-xs">
                        {formatPriceSum(Number(ord.totalAmount) || 0)}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-mono">
                      {ord.driverPhone ? (
                        <span className="px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-400/50 font-black text-xs inline-flex items-center gap-1">
                          <Phone className="w-3 h-3 text-emerald-400" />
                          {ord.driverPhone}
                        </span>
                      ) : (
                        <span className="text-[11px] text-[#B8B8B3]">Kutilmoqda...</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-center">
                      {ord.status === 'assigned' ? (
                        <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase bg-amber-500/25 text-amber-300 border border-amber-400/60 animate-pulse inline-block">
                          2. Yuklash jarayonida
                        </span>
                      ) : ord.status === 'in_transit' ? (
                        <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase bg-sky-500/25 text-sky-300 border border-sky-400/60 inline-block">
                          3. Tasdiqlandi • Yetkazilmoqda
                        </span>
                      ) : ord.status === 'delivered' ? (
                        <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase bg-emerald-500/25 text-emerald-300 border border-emerald-400/60 inline-block">
                          4. Yetkazildi
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase bg-amber-500/15 text-amber-200 border border-amber-500/40 animate-pulse inline-block">
                          1. Buyurtma berildi
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  // Detailed report for currently selected supplier (Faqat Onlayn platforma savdosi! Kun / Oy / Yil va Umumiydan / Savdodan bo'yicha)
  const detailedReport: SupplierDetailedReport | null = React.useMemo(() => {
    if (!selectedReportSupplier) return null;
    // Reference `orders` so memo recalculates whenever orders update
    void orders.length;
    return getSupplierReport(
      selectedReportSupplier.companyName,
      `${selectedReportSupplier.name} ${selectedReportSupplier.surname || ''}`.trim(),
      selectedReportSupplier.region,
      selectedReportSupplier.phone,
      selectedReportSupplier.contractNumber || '',
      selectedReportSupplier.commissionRate || 5,
      selectedReportSupplier.commissionBasis || 'total',
      reportPeriod,
      reportDateStr,
      selectedReportSupplier.id,
      selectedReportSupplier.inn,
      true
    );
  }, [selectedReportSupplier, reportPeriod, reportDateStr, orders]);

  // Belgilangan sanadagi Hisobotni yuklab olish (Chop etish tugmasi bosilganda)
  const handleDownloadSupplierReport = () => {
    if (!selectedReportSupplier || !detailedReport) return;

    const periodLabel =
      reportPeriod === 'day'
        ? `Kun hisobida (${reportDateStr})`
        : reportPeriod === 'month'
        ? `Oy hisobida (${reportDateStr.slice(0, 7)})`
        : reportPeriod === 'year'
        ? `Yil hisobida (${reportDateStr.slice(0, 4)}-yil)`
        : 'Barcha davrlar bo‘yicha';

    const basisLabel = detailedReport.commissionBasis === 'profit' ? 'Savdodan' : 'Umumiydan';

    const salesRowsHtml =
      detailedReport.sales.length > 0
        ? detailedReport.sales
            .map((item, i) => {
              const itemBaseSum = (detailedReport.commissionBasis === 'profit' ? item.profitSum : item.totalSum) || 0;
              const itemBunkerShare = Math.round((itemBaseSum * detailedReport.commissionRate) / 100);
              return `
          <tr>
            <td style="padding:8px 12px;border:1px solid #cbd5e1;text-align:center;">${i + 1}</td>
            <td style="padding:8px 12px;border:1px solid #cbd5e1;"><strong>${item.productTitle}</strong><br/><small>${item.category} • ${formatPriceSum(item.price)}</small></td>
            <td style="padding:8px 12px;border:1px solid #cbd5e1;font-weight:bold;">${item.quantity} ${item.unit}<br/><small>${formatPriceSum(item.totalSum)}</small></td>
            <td style="padding:8px 12px;border:1px solid #cbd5e1;">${item.date}</td>
            <td style="padding:8px 12px;border:1px solid #cbd5e1;"><strong>${item.buyerName}</strong> (${item.buyerPhone})<br/><small>Manzil: ${formatCleanFullAddress(item.deliveryAddress)}</small></td>
            <td style="padding:8px 12px;border:1px solid #cbd5e1;font-weight:bold;color:#b45309;">${formatPriceSum(itemBunkerShare)}<br/><small>(${basisLabel} ${detailedReport.commissionRate}%)</small></td>
          </tr>`;
            })
            .join('')
        : `<tr><td colspan="6" style="padding:14px;border:1px solid #cbd5e1;text-align:center;">Tanlangan davr bo‘yicha onlayn sotilgan mahsulotlar mavjud emas.</td></tr>`;

    const htmlContent = `<!DOCTYPE html>
<html lang="uz">
<head>
  <meta charset="UTF-8" />
  <title>${selectedReportSupplier.companyName} - Onlayn Savdo Hisoboti (${periodLabel})</title>
  <style>
    body { font-family: Arial, sans-serif; color: #0f172a; margin: 28px; }
    h1 { font-size: 20px; margin-bottom: 4px; }
    .meta { font-size: 13px; color: #475569; margin-bottom: 16px; }
    .kpi-grid { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 20px; }
    .kpi { border: 1px solid #cbd5e1; border-radius: 10px; padding: 12px 16px; min-width: 190px; background: #f8fafc; }
    .kpi-label { font-size: 11px; color: #64748b; display: block; }
    .kpi-val { font-size: 16px; font-weight: bold; margin-top: 4px; display: block; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 10px; }
    th { background: #1e293b; color: #f8fafc; padding: 10px 12px; border: 1px solid #1e293b; text-align: left; }
  </style>
</head>
<body>
  <h1>«${selectedReportSupplier.companyName}» Onlayn Savdo Hisoboti</h1>
  <div class="meta">
    ${selectedReportSupplier.inn ? `STIR: ${selectedReportSupplier.inn} • ` : ''}Mas'ul: ${selectedReportSupplier.name} ${selectedReportSupplier.surname || ''} • Tel: ${selectedReportSupplier.phone} • Hudud: ${selectedReportSupplier.region} • Toifa: ${selectedReportSupplier.category}<br/>
    <strong>Tanlangan davr:</strong> ${periodLabel}
  </div>
  <div class="kpi-grid">
    <div class="kpi">
      <span class="kpi-label">Umumiy sotilgan mahsulotlar soni:</span>
      <span class="kpi-val">${detailedReport.totalSoldQuantity} ta (${formatPriceSum(detailedReport.totalSalesSum)})</span>
    </div>
    <div class="kpi">
      <span class="kpi-label">Xil mahsulot:</span>
      <span class="kpi-val">${detailedReport.uniqueProductTypesCount} xil mahsulot</span>
    </div>
    <div class="kpi">
      <span class="kpi-label">Bunker Stroy Ulushi (${basisLabel} ${detailedReport.commissionRate}%):</span>
      <span class="kpi-val">${formatPriceSum(detailedReport.totalCommissionSum)}</span>
    </div>
    <div class="kpi">
      <span class="kpi-label">Ta'minotchi Sof Ulushi (Shartnoma № ${selectedReportSupplier.contractNumber || '-'}):</span>
      <span class="kpi-val">${formatPriceSum(detailedReport.netPayoutSum)}</span>
    </div>
  </div>
  <h3>Onlayn Platformada Sotilayotgan Mahsulotlar Ro‘yxati (${detailedReport.sales.length})</h3>
  <table>
    <thead>
      <tr>
        <th>№</th>
        <th>Mahsulot nomlari</th>
        <th>Sotilgan miqdori</th>
        <th>Sana</th>
        <th>Xaridor Ism familiya va manzili</th>
        <th>Bunker Stroy Ulushi</th>
      </tr>
    </thead>
    <tbody>
      ${salesRowsHtml}
    </tbody>
  </table>
</body>
</html>`;

    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const safeName = (selectedReportSupplier.companyName || 'taminotchi')
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .slice(0, 30);
    const dateSuffix = reportPeriod === 'all' ? 'barchasi' : reportDateStr;
    link.href = url;
    link.download = `Hisobot_${safeName}_${dateSuffix}.html`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Lock Screen submit handler (Faqat Bosh Admin kabineti uchun)
  const handleUnlockSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const correctPass = (config.password || 'ADMIN.').trim();
    const trimmed = unlockPasswordInput.trim();
    if (trimmed === correctPass) {
      setIsCabinetLocked(false);
      try {
        localStorage.removeItem('bunkerstroy_admin_locked');
      } catch {}
      setUnlockPasswordInput('');
      setUnlockError(null);
      addLog('Admin kabineti qulfdan chiqarildi', 'auth', 'Bosh admin paroli to‘g‘ri kiritilib, kabinet blokdan chiqarildi.', 'success');
    } else {
      setUnlockError("Noto‘g‘ri parol kiritildi! Qaytadan urinib ko‘ring.");
    }
  };

  // Yangi og'ir texnika qo'shish
  const handleAddVehicleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newVehName.trim() || !newVehDriver.trim()) return;
    const newV: LogisticsVehicle = {
      id: 'veh-' + Date.now().toString(36),
      name: newVehName.trim(),
      type: newVehType,
      capacityTons: parseFloat(newVehCapacity) || 10,
      pricePerKm: parseInt(newVehPriceKm, 10) || 12000,
      basePrice: 300000,
      available: true,
      driverName: newVehDriver.trim(),
      phone: newVehPhone,
      currentLocation: newVehLocation,
      image: 'https://images.unsplash.com/photo-1601584115197-04ecc0da31d7?w=600&auto=format&fit=crop&q=80',
    };
    setVehicles((prev) => {
      const updated = [newV, ...prev];
      try { localStorage.setItem('bunkerstroy_vehicles', JSON.stringify(updated)); } catch {}
      return updated;
    });
    createVehicleApi(newV).then((res) => {
      if (res && res.id) newV.id = res.id;
    }).catch((err) => console.warn('Backend createVehicle notice:', err));
    addLog('Yangi og‘ir yuk transporti qo‘shildi', 'system', `${newV.name} (${newV.driverName}, ${newV.phone}) transport floti ro‘yxatiga kiritildi.`, 'success');
    setIsAddVehicleOpen(false);
    setNewVehName('');
    setNewVehDriver('');
  };

  // Yangi Global hamkor qo'shish
  const handleAddGlobalPartnerSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGpName.trim() || !newGpCountry.trim()) return;
    const newGp: GlobalBunkerPartner = {
      id: 'gp-' + Date.now().toString(36),
      name: newGpName.trim(),
      country: newGpCountry.trim(),
      flag: newGpFlag || '🌐',
      category: newGpCategory,
      productType: newGpProductType.trim() || 'Sanoat qurilish materiallari',
      contractStatus: 'active',
      annualVolume: newGpVolume || '50,000 tonna',
      priceTerm: 'Zavod narxi (FCA/CPT Toshkent)',
      rating: 5.0,
      contactPerson: newGpContact.trim() || 'Bosh vakil',
      phone: newGpPhone,
      badge: 'Xalqaro Hamkor',
      deliveryDays: '3-7 kun',
      route: 'Tranzit koridori orqali',
    };
    setGlobalPartners((prev) => {
      const updated = [newGp, ...prev];
      try { localStorage.setItem('bunkerstroy_global_partners', JSON.stringify(updated)); } catch {}
      return updated;
    });
    addLog('Yangi global hamkor biriktirildi', 'system', `Global Bunker tarmog‘iga ${newGp.name} (${newGp.country}) xalqaro ta’minotchi sifatida qo‘shildi.`, 'success');
    setIsAddGlobalPartnerOpen(false);
    setNewGpName('');
    setNewGpCountry('');
    setNewGpProductType('');
    setNewGpContact('');
  };

  // Ta'minotchi Haqida ma'lumotlarini ochish
  const handleOpenSupplierAbout = (supplier: SupplierPartner) => {
    setAboutSupplier(supplier);
    setIsAboutSupplierOpen(true);
  };

  // Global hamkorni tahrirlash oynasini ochish
  const handleOpenEditGlobalPartner = (partner: GlobalBunkerPartner) => {
    setEditingGlobalPartner(partner);
    setEditGpName(partner.name);
    setEditGpCountry(partner.country);
    setEditGpFlag(partner.flag || '🌐');
    setEditGpCategory(partner.category);
    setEditGpProductType(partner.productType);
    setEditGpVolume(partner.annualVolume);
    setEditGpPriceTerm(partner.priceTerm);
    setEditGpContact(partner.contactPerson);
    setEditGpPhone(partner.phone);
    setEditGpRoute(partner.route);
    setEditGpDeliveryDays(partner.deliveryDays);
    setEditGpContractStatus(partner.contractStatus);
    setEditConfirmPass('');
    setEditConfirmError(null);
    setIsEditGlobalPartnerOpen(true);
  };

  // Global hamkorni tahrirlashni saqlash
  const handleEditGlobalPartnerSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingGlobalPartner || !editGpName.trim() || !editGpCountry.trim()) return;
    openConfirmModal(
      "O‘zgarishlarni saqlashni tasdiqlash",
      `«${editGpName.trim()}» ma'lumotlarini saqlash uchun tasdiqlash parolini kiriting.`,
      () => {
        setGlobalPartners((prev) => {
          const updated = prev.map((p) => {
            if (p.id === editingGlobalPartner.id) {
              return {
                ...p,
                name: editGpName.trim(),
                country: editGpCountry.trim(),
                flag: editGpFlag.trim() || '🌐',
                category: editGpCategory,
                productType: editGpProductType.trim(),
                annualVolume: editGpVolume,
                priceTerm: editGpPriceTerm,
                contactPerson: editGpContact.trim(),
                phone: editGpPhone,
                route: editGpRoute,
                deliveryDays: editGpDeliveryDays,
                contractStatus: editGpContractStatus,
              };
            }
            return p;
          });
          try { localStorage.setItem('bunkerstroy_global_partners', JSON.stringify(updated)); } catch {}
          return updated;
        });
        addLog('Global ta’minotchi tahrirlandi', 'edit_cabinet', `${editGpName} (${editGpCountry}) xalqaro ma’lumotlari muvaffaqiyatli yangilandi.`, 'info');
        setIsEditGlobalPartnerOpen(false);
        setEditingGlobalPartner(null);
      }
    );
  };

  // Logistik ta'minotchini tahrirlash
  const handleOpenEditVehicle = (veh: LogisticsVehicle) => {
    setEditingVehicle(veh);
    setEditVehName(veh.name);
    setEditVehType(veh.type);
    setEditVehCapacity(String(veh.capacityTons));
    setEditVehPriceKm(String(veh.pricePerKm));
    setEditVehDriver(veh.driverName);
    setEditVehPhone(veh.phone);
    setEditVehLocation(veh.currentLocation);
    setEditVehAvailable(veh.available);
    setEditConfirmPass('');
    setEditConfirmError(null);
    setIsEditVehicleOpen(true);
  };

  const handleEditVehicleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingVehicle || !editVehName.trim() || !editVehDriver.trim()) return;
    openConfirmModal(
      "O‘zgarishlarni saqlashni tasdiqlash",
      `«${editVehName.trim()}» ma'lumotlarini saqlash uchun tasdiqlash parolini kiriting.`,
      () => {
        setVehicles((prev) => {
          const updated = prev.map((v) => {
            if (v.id === editingVehicle.id) {
              return {
                ...v,
                name: editVehName.trim(),
                type: editVehType,
                capacityTons: Number(editVehCapacity) || 20,
                pricePerKm: Number(editVehPriceKm) || 14000,
                driverName: editVehDriver.trim(),
                phone: editVehPhone.trim(),
                currentLocation: editVehLocation.trim(),
                available: editVehAvailable,
              };
            }
            return v;
          });
          try { localStorage.setItem('bunkerstroy_vehicles', JSON.stringify(updated)); } catch {}
          return updated;
        });
        addLog('Logistik ta’minotchi tahrirlandi', 'edit_cabinet', `${editVehName} (${editVehDriver}) ma’lumotlari yangilandi.`, 'info');
        setIsEditVehicleOpen(false);
        setEditingVehicle(null);
      }
    );
  };

  // =========================================================================
  // ADMIN KABINETI UCHUN LOCK SCREEN (BLOK HOLATI)
  // =========================================================================
  if (isCabinetLocked) {
    return (
      <div className="min-h-screen w-full bg-[#071326] flex items-center justify-center p-4 text-[#F5F5F2]">
        <div className="bg-[#0A1931] border-2 border-[#1E3A6D] rounded-xl max-w-md w-full p-6 sm:p-8 shadow-2xl relative space-y-6 text-center">
          {/* Industrial Rivets */}
          <div className="absolute top-2.5 left-2.5 industrial-rivet" />
          <div className="absolute top-2.5 right-2.5 industrial-rivet" />
          <div className="absolute bottom-2.5 left-2.5 industrial-rivet" />
          <div className="absolute bottom-2.5 right-2.5 industrial-rivet" />

          <div className="w-16 h-16 rounded-xl bg-[#071326] border border-[#1E3A6D] flex items-center justify-center mx-auto text-[#FFB800] shadow-md">
            <Lock className="w-8 h-8 stroke-[2.2]" />
          </div>

          <div className="space-y-1">
            <h2 className="text-xl sm:text-2xl font-black tracking-wider text-[#F5F5F2]">
              <span className="text-[#FFB800]">BUNKER</span> STROY
            </h2>
          </div>

          <form onSubmit={handleUnlockSubmit} className="space-y-4">
            <div className="relative">
              <KeyRound className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#FFB800]" />
              <input
                type="password"
                value={unlockPasswordInput}
                onChange={(e) => {
                  setUnlockPasswordInput(e.target.value);
                  setUnlockError(null);
                }}
                className="w-full pl-10 pr-4 py-3 rounded-lg bg-[#071326] border border-[#1E3A6D] text-[#F5F5F2] font-mono text-sm focus:border-[#FFB800] focus:outline-none"
                autoFocus
              />
            </div>

            {unlockError && (
              <div className="p-2.5 rounded-lg bg-red-950/40 border border-red-500/40 text-red-400 text-xs font-bold animate-shake">
                {unlockError}
              </div>
            )}

            <button
              type="submit"
              className="btn-industrial-yellow w-full py-3 rounded-lg text-sm font-bold flex items-center justify-center gap-2 cursor-pointer shadow-md"
            >
              <Check className="w-4 h-4 stroke-[2.5]" />
              <span>Qulfdan Chiqarish</span>
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-[#071326] text-[#F5F5F2] flex flex-col font-sans">
      {/* Header: Tyomniy Siniy Header (Savat yo‘q! Tepada qotib turadi) */}
      <header className="brushed-steel-header px-2.5 sm:px-6 lg:px-10 pt-2 pb-1 sm:py-0 h-15 sm:h-20 flex items-center justify-between shadow-xl sticky top-0 z-50">
        
        {/* Brand logo va BUNKER STROY matni - Logoni ustiga bosilganda Sozlamalar ochiladi */}
        <div
          onClick={() => {
            setIsSettingsOpen(true);
          }}
          className="flex items-center gap-2 sm:gap-3 mt-1.5 sm:mt-0 select-none cursor-pointer group min-w-0"
          title="Sozlamalarni ochish uchun bosing"
        >
          {config.logoUrl ? (
            <img
              src={config.logoUrl}
              alt="Logo"
              className="w-8 h-8 sm:w-10 sm:h-10 object-contain rounded-lg border border-[#1E3A6D] group-hover:border-[#FFB800] bg-[#071326] transition-colors shrink-0"
            />
          ) : (
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-[#071326] border border-[#1E3A6D] group-hover:border-[#FFB800] flex items-center justify-center text-[#FFB800] shadow-sm transition-colors shrink-0">
              <HardHat className="w-4 h-4 sm:w-5 sm:h-5 stroke-[2.2]" />
            </div>
          )}
          <div className="flex flex-col min-w-0">
            <span className="text-sm sm:text-2xl font-black tracking-wider leading-none whitespace-nowrap">
              <span className="text-[#FFB800]">BUNKER</span> <span className="text-[#F5F5F2]">STROY</span>
            </span>
            {isSubAdmin && currentUser?.displayName && (
              <span className="text-[9px] sm:text-[10px] font-mono font-bold text-[#FFB800] uppercase mt-0.5 truncate">
                {currentUser.displayName} ({currentUser.firstName})
              </span>
            )}
          </div>
        </div>

        {/* Header Right Buttons with Social Logos, Lock Scren & Settings */}
        <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
          {onReturnToBunkerAdmin && (
            <button
              type="button"
              onClick={onReturnToBunkerAdmin}
              className="px-2 sm:px-4 py-1.5 sm:py-2.5 rounded-lg sm:rounded-xl bg-amber-500 hover:bg-amber-400 text-[#071326] font-black text-[10px] sm:text-sm flex items-center gap-1 sm:gap-1.5 cursor-pointer shadow-lg active:scale-95"
              title="Bunker Admin kabinetiga qaytish"
            >
              <ArrowLeft className="w-3.5 h-3.5 sm:w-4 sm:h-4 stroke-[2.5]" />
              <span className="hidden sm:inline">Bunker Admin</span>
            </button>
          )}

          {/* Ijtimoiy tarmoqlar */}
          <div className="hidden xl:flex items-center gap-2">
            {config.telegram && (
              <button
                type="button"
                onClick={() => {
                  if (isSubAdmin) return;
                  setSocialModal({
                    type: 'telegram',
                    title: 'Telegram Havolasi',
                    currentVal: config.telegram,
                  });
                  setSocialEditVal(config.telegram);
                  setSocialSavedNotice(false);
                }}
                className="w-8 h-8 rounded-lg bg-[#071326] border border-[#1E3A6D] hover:border-[#FFB800] flex items-center justify-center text-sky-200 hover:text-[#FFB800] transition-colors cursor-pointer"
                title="Telegram"
              >
                <RealTelegramLogo className="w-4 h-4" />
              </button>
            )}
            {config.instagram && (
              <button
                type="button"
                onClick={() => {
                  if (isSubAdmin) return;
                  setSocialModal({
                    type: 'instagram',
                    title: 'Instagram Havolasi',
                    currentVal: config.instagram,
                  });
                  setSocialEditVal(config.instagram);
                  setSocialSavedNotice(false);
                }}
                className="w-8 h-8 rounded-lg bg-[#071326] border border-[#1E3A6D] hover:border-[#FFB800] flex items-center justify-center text-sky-200 hover:text-[#FFB800] transition-colors cursor-pointer"
                title="Instagram"
              >
                <RealInstagramLogo className="w-4 h-4" />
              </button>
            )}
            {config.phone && (
              <button
                type="button"
                onClick={() => {
                  if (isSubAdmin) return;
                  setSocialModal({
                    type: 'phone',
                    title: 'Telefon Raqami',
                    currentVal: config.phone,
                  });
                  setSocialEditVal(config.phone);
                  setSocialSavedNotice(false);
                }}
                className="w-8 h-8 rounded-lg bg-[#071326] border border-[#1E3A6D] hover:border-[#FFB800] flex items-center justify-center text-sky-200 hover:text-[#FFB800] transition-colors cursor-pointer"
                title="Telefon"
              >
                <RealPhoneLogo className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* LOCK SCREN TUGMASI (Tepada qotib turadi) */}
          <button
            onClick={() => {
              setIsCabinetLocked(true);
              try { localStorage.setItem('bunkerstroy_admin_locked', 'true'); } catch {}
            }}
            title="Lock Scren (Parol oynasi ochiladi, kabinet qulflanadi)"
            className="flex items-center gap-1.5 sm:gap-3 px-2 sm:px-6 py-1 sm:py-2.5 rounded-lg sm:rounded-xl bg-[#071326] hover:bg-[#0F2547] text-[#FFB800] border-2 border-[#FFB800] hover:border-[#FFC928] transition-all cursor-pointer group shadow-[0_0_16px_rgba(255,184,0,0.3)] active:scale-95"
          >
            <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-md sm:rounded-lg bg-[#0A1931] text-[#FFB800] flex items-center justify-center border border-[#FFB800]/60 group-hover:border-[#FFB800] shadow-inner shrink-0">
              <Lock className="w-3.5 h-3.5 sm:w-4.5 sm:h-4.5 text-[#FFB800] stroke-[2.3]" />
            </div>
            <span className="text-[10px] sm:text-sm px-1.5 sm:px-3 py-0.5 sm:py-1 rounded bg-[#FFB800]/25 text-[#FFB800] border border-[#FFB800]/60 font-mono font-black tracking-wider uppercase whitespace-nowrap">
              Lock Scren
            </span>
          </button>

          {/* SOZLAMALAR TUGMASI (Chiqish faqat Sozlamalar bo'limida) */}
          <button
            type="button"
            onClick={() => setIsSettingsOpen(true)}
            title="Sozlamalar va Chiqish"
            className="p-2 sm:px-4 sm:py-2.5 rounded-lg sm:rounded-xl bg-[#071326] hover:bg-[#0F2547] text-[#FFB800] border border-[#1E3A6D] hover:border-[#FFB800] text-xs sm:text-sm font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-sm active:scale-95"
          >
            <Settings className="w-4 h-4 sm:w-4.5 sm:h-4.5 stroke-[2.2]" />
            <span className="hidden sm:inline">Sozlamalar</span>
          </button>

          {/* Mobil ekranda o'ng tarafdan yon menyuni ochish tugmasi */}
          <button
            type="button"
            onClick={() => setIsMobileSidebarOpen(true)}
            className="lg:hidden p-2 rounded-lg bg-[#071326] text-[#FFB800] border border-[#FFB800]/60 cursor-pointer"
            title="Bo'limlarni ochish"
          >
            <Menu className="w-4.5 h-4.5" />
          </button>
        </div>
      </header>

      {/* Admin Panel Main Content - Asosiy oyna chapda va Bo'limlar Yon menyusi O'NG TARAFDA (Yondan chiqadigan, bo'yiga uzun va chetlarni yopgan holda) */}
      <main className="flex-1 w-full flex flex-col min-h-[calc(100vh-56px)] sm:min-h-[calc(100vh-72px)] bg-[#071326]">
        <div className="flex-1 flex flex-col lg:flex-row items-stretch w-full min-h-[calc(100vh-56px)] sm:min-h-[calc(100vh-72px)] bg-[#071326]">

          {/* =========================================================================
              ASOSIY OYNA (CHAP TARAFDA): TANLANGAN BO'LIM MAZMUNI
              ========================================================================= */}
          <div className="flex-1 min-w-0 w-full mt-3 sm:mt-0 bg-[#071326] px-2 sm:px-6 lg:px-8 py-2 sm:py-5 space-y-2.5 sm:space-y-6 order-2 lg:order-1">

        {/* =========================================================================
            SECTION 1: MONITORING, HISOBOT (BUNKER STATISTIKASI VA OPERATSION TAHLIL)
            ========================================================================= */}
        {activeSection === 'reports' && (
          <div className="space-y-8 mt-2.5 sm:mt-0 animate-fadeIn">
            <BunkerStatsDashboard
              onNavigateToCatalog={onGoToShop || (() => {})}
              onNavigateToLogistics={() => setActiveSection('reports')}
              onNavigateToGlobal={() => setActiveSection('reports')}
              onNavigateToAdmin={() => setActiveSection('reports')}
              onOpenCart={onOpenCart}
              onOpenAuth={onOpenAuth}
              cartCount={cartCount}
            />
          </div>
        )}

        {/* =========================================================================
            SECTION 2: TA'MINOTCHI B2B2C HAMKORLAR (2 GA AJRATILGAN: B2B VA B2C)
            1) B2B (Ishlab chiqaruvchi Ta'minot Kabineti)
            2) B2C (Hamkor Ta'minotchi kabineti)
            ========================================================================= */}
        {activeSection === 'suppliers' && (
          <div className="space-y-1.5 sm:space-y-4 mt-2.5 sm:mt-0 animate-fadeIn">
            {/* Bo'lim sarlavhasi (Mobilda ixcham) */}
            <div className="bg-[#0A1931] border-2 border-[#1E3A6D] rounded-xl sm:rounded-2xl p-2 sm:p-5 flex items-center justify-between gap-2 sm:gap-3 shadow-xl">
              <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                <div className="w-7 h-7 sm:w-11 sm:h-11 rounded-lg sm:rounded-xl bg-[#071326] border border-[#FFB800]/60 text-[#FFB800] flex items-center justify-center shrink-0">
                  <Users className="w-4 h-4 sm:w-5 sm:h-5 stroke-[2.2]" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-xs sm:text-xl font-black text-white truncate">
                    Ta'minotchi B2B2C Hamkorlar
                  </h2>
                  <p className="text-[9px] sm:text-xs text-sky-200 truncate">
                    B2B va B2C ta'minotchi kabinetlarini tahrirlash va shartnoma hisobotlari
                  </p>
                </div>
              </div>
            </div>

            {/* 3 ta Bo'lim Tanlovi: Mobilda 3 ustunli bir qator */}
            <div className="grid grid-cols-3 gap-1.5 sm:gap-3.5">
              {/* 1) B2B Kabineti */}
              <button
                type="button"
                onClick={() => setSupplierCabinetSubTab('manufacturer')}
                className={`p-1.5 sm:p-4 rounded-xl sm:rounded-2xl border-2 text-left transition-all cursor-pointer flex items-center justify-between gap-1 sm:gap-3 ${
                  supplierCabinetSubTab === 'manufacturer'
                    ? 'bg-red-600 border-red-400 text-white shadow-[0_0_22px_rgba(220,38,38,0.5)]'
                    : 'bg-[#071326] border-[#1E3A6D] text-sky-200 hover:border-red-500/60 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-1.5 sm:gap-3 min-w-0">
                  <div
                    className={`hidden sm:flex w-11 h-11 rounded-xl items-center justify-center border shrink-0 ${
                      supplierCabinetSubTab === 'manufacturer'
                        ? 'bg-white text-red-600 border-white'
                        : 'bg-[#0A1931] text-[#FFB800] border-[#1E3A6D]'
                    }`}
                  >
                    <Building className="w-5 h-5 stroke-[2.2]" />
                  </div>
                  <div className="min-w-0">
                    <span className="text-[10px] sm:text-base font-black block text-white truncate">
                      B2B Kabineti
                    </span>
                    <span
                      className={`text-[8px] sm:text-[11px] hidden sm:block truncate ${
                        supplierCabinetSubTab === 'manufacturer' ? 'text-red-100' : 'text-sky-200'
                      }`}
                    >
                      Ishlab chiqaruvchi ta'minot kabineti
                    </span>
                  </div>
                </div>
                <span
                  className={`px-1.5 sm:px-3 py-0.5 sm:py-1 rounded-md sm:rounded-xl font-mono font-black text-[9px] sm:text-xs shrink-0 ${
                    supplierCabinetSubTab === 'manufacturer'
                      ? 'bg-white text-red-600'
                      : 'bg-[#0A1931] text-[#FFB800] border border-[#1E3A6D]'
                  }`}
                >
                  {manufacturersCount}
                </span>
              </button>

              {/* 2) B2C Kabineti */}
              <button
                type="button"
                onClick={() => setSupplierCabinetSubTab('partner')}
                className={`p-1.5 sm:p-4 rounded-xl sm:rounded-2xl border-2 text-left transition-all cursor-pointer flex items-center justify-between gap-1 sm:gap-3 ${
                  supplierCabinetSubTab === 'partner'
                    ? 'bg-red-600 border-red-400 text-white shadow-[0_0_22px_rgba(220,38,38,0.5)]'
                    : 'bg-[#071326] border-[#1E3A6D] text-sky-200 hover:border-red-500/60 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-1.5 sm:gap-3 min-w-0">
                  <div
                    className={`hidden sm:flex w-11 h-11 rounded-xl items-center justify-center border shrink-0 ${
                      supplierCabinetSubTab === 'partner'
                        ? 'bg-white text-red-600 border-white'
                        : 'bg-[#0A1931] text-[#FFB800] border-[#1E3A6D]'
                    }`}
                  >
                    <Users className="w-5 h-5 stroke-[2.2]" />
                  </div>
                  <div className="min-w-0">
                    <span className="text-[10px] sm:text-base font-black block text-white truncate">
                      B2C Kabineti
                    </span>
                    <span
                      className={`text-[8px] sm:text-[11px] hidden sm:block truncate ${
                        supplierCabinetSubTab === 'partner' ? 'text-red-100' : 'text-sky-200'
                      }`}
                    >
                      Hamkor ta'minotchi kabineti
                    </span>
                  </div>
                </div>
                <span
                  className={`px-1.5 sm:px-3 py-0.5 sm:py-1 rounded-md sm:rounded-xl font-mono font-black text-[9px] sm:text-xs shrink-0 ${
                    supplierCabinetSubTab === 'partner'
                      ? 'bg-white text-red-600'
                      : 'bg-[#0A1931] text-[#FFB800] border border-[#1E3A6D]'
                  }`}
                >
                  {partnersCount}
                </span>
              </button>

              {/* 3) Ta'minotchi Kabinetlar (Barchasi) */}
              <button
                type="button"
                onClick={() => setSupplierCabinetSubTab('all')}
                className={`p-1.5 sm:p-4 rounded-xl sm:rounded-2xl border-2 text-left transition-all cursor-pointer flex items-center justify-between gap-1 sm:gap-3 ${
                  supplierCabinetSubTab === 'all'
                    ? 'bg-red-600 border-red-400 text-white shadow-[0_0_22px_rgba(220,38,38,0.5)]'
                    : 'bg-[#071326] border-[#1E3A6D] text-sky-200 hover:border-red-500/60 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-1.5 sm:gap-3 min-w-0">
                  <div
                    className={`hidden sm:flex w-11 h-11 rounded-xl items-center justify-center border shrink-0 ${
                      supplierCabinetSubTab === 'all'
                        ? 'bg-white text-red-600 border-white'
                        : 'bg-[#0A1931] text-[#FFB800] border-[#1E3A6D]'
                    }`}
                  >
                    <Layers className="w-5 h-5 stroke-[2.2]" />
                  </div>
                  <div className="min-w-0">
                    <span className="text-[10px] sm:text-base font-black block text-white truncate">
                      Barchasi
                    </span>
                    <span
                      className={`text-[8px] sm:text-[11px] hidden sm:block truncate ${
                        supplierCabinetSubTab === 'all' ? 'text-red-100' : 'text-sky-200'
                      }`}
                    >
                      Barcha B2B va B2C kabinetlar
                    </span>
                  </div>
                </div>
                <span
                  className={`px-1.5 sm:px-3 py-0.5 sm:py-1 rounded-md sm:rounded-xl font-mono font-black text-[9px] sm:text-xs shrink-0 ${
                    supplierCabinetSubTab === 'all'
                      ? 'bg-white text-red-600'
                      : 'bg-[#0A1931] text-[#FFB800] border border-[#1E3A6D]'
                  }`}
                >
                  {suppliers.length}
                </span>
              </button>
            </div>
            
            {/* Filter Bar (Mobilda bir qator) */}
            <div className="bg-[#0A1931] border-2 border-[#1E3A6D] rounded-xl sm:rounded-2xl p-1.5 sm:p-4 flex flex-row items-center justify-between gap-1.5 sm:gap-3 shadow-lg">
              <div className="relative flex-1 min-w-0">
                <Search className="absolute left-2.5 sm:left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-400" />
                <input
                  type="text"
                  value={supplierSearch}
                  onChange={(e) => setSupplierSearch(e.target.value)}
                  placeholder="Kabinet qidirish..."
                  className="w-full pl-8 sm:pl-10 pr-2.5 sm:pr-4 py-1 sm:py-2.5 bg-[#071326] border border-[#1E3A6D] rounded-lg sm:rounded-xl text-white text-[11px] sm:text-xs placeholder-sky-300/60 focus:outline-none focus:border-[#FFB800]"
                />
              </div>

              <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                <span className="text-xs text-sky-200 font-semibold hidden sm:inline">Holat:</span>
                <select
                  value={supplierFilterStatus}
                  onChange={(e) => setSupplierFilterStatus(e.target.value as any)}
                  className="px-2 sm:px-3 py-1 sm:py-2 bg-[#071326] border border-[#1E3A6D] rounded-lg sm:rounded-xl text-[11px] sm:text-xs text-white focus:outline-none focus:border-[#FFB800] cursor-pointer"
                >
                  <option value="all">Barchasi</option>
                  <option value="active">Faol</option>
                  <option value="pending">Kutilmoqda</option>
                  <option value="blocked">Bloklangan</option>
                </select>
              </div>
            </div>

            {/* Asosiy Ro'yxat va Jadval */}
            <div className="bg-[#0A1931] border-2 border-[#1E3A6D] rounded-xl sm:rounded-2xl p-2 sm:p-5 shadow-2xl space-y-1.5 sm:space-y-3">
              <div className="flex items-center justify-between pb-1.5 sm:pb-2 border-b border-[#1E3A6D]">
                <span className="text-[11px] sm:text-sm font-black text-amber-400 uppercase tracking-wider flex items-center gap-1.5 sm:gap-2">
                  <Users className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  {supplierCabinetSubTab === 'manufacturer'
                    ? `B2B Kabinetlar ro‘yxati (${filteredSuppliers.length})`
                    : supplierCabinetSubTab === 'partner'
                    ? `B2C Kabinetlar ro‘yxati (${filteredSuppliers.length})`
                    : `Ta'minotchi Kabinetlar ro‘yxati (${filteredSuppliers.length})`}
                </span>
              </div>

              {/* MOBIL EKRAN UCHUN: Bitta ekranda 5 ta kabinet sig'adigan va har bir kabinet ma'lumotlari bir qatorda joylashgan ixcham ko'rinish */}
              <div className="sm:hidden space-y-1.5">
                {filteredSuppliers.map((supp, idx) => {
                  const rowRep = getSupplierReport(
                    supp.companyName,
                    `${supp.name} ${supp.surname || ''}`.trim(),
                    supp.region,
                    supp.phone,
                    supp.contractNumber || '',
                    supp.commissionRate || 5,
                    supp.commissionBasis || 'total',
                    'all',
                    undefined,
                    supp.id,
                    supp.inn,
                    true
                  );
                  const suppCatalogProductsCount = adminProducts.filter((p: any) => {
                    if (!p) return false;
                    if (p.supplierId && p.supplierId === supp.id) return true;
                    const pSupp = (p.supplierName || '').toLowerCase().trim();
                    const sComp = (supp.companyName || '').toLowerCase().trim();
                    return Boolean(pSupp && sComp && (pSupp === sComp || pSupp.includes(sComp) || sComp.includes(pSupp)));
                  }).length;
                  const totalUniqueTypes = Math.max(rowRep.uniqueProductTypesCount, suppCatalogProductsCount);
                  const rateVal = supp.commissionRate || 5;
                  const salesCount = rowRep.uniqueProductTypesCount;

                  return (
                    <div
                      key={supp.id}
                      className="bg-[#071326] border border-[#1E3A6D] rounded-lg px-2 py-1.5 space-y-1 shadow-sm"
                    >
                      {/* 1-qator: №, Korxona nomi, B2B/B2C, STIR, Holat va Hisobot tugmasi */}
                      <div className="flex items-center justify-between gap-1.5">
                        <div className="flex items-center gap-1 min-w-0 flex-1 overflow-x-auto no-scrollbar whitespace-nowrap">
                          <span className="w-4 h-4 rounded bg-amber-500/20 text-[#FFB800] border border-[#FFB800]/50 font-mono font-black text-[9px] flex items-center justify-center shrink-0">
                            {idx + 1}
                          </span>
                          <span className="font-black text-white text-[11px] truncate max-w-[125px]">
                            {supp.companyName}
                          </span>
                          <span
                            className={`px-1 py-0.2 rounded text-[8px] font-mono font-black uppercase border shrink-0 ${
                              supp.cabinetType === 'manufacturer'
                                ? 'bg-red-500/20 text-red-300 border-red-500/40'
                                : 'bg-sky-500/20 text-sky-300 border-sky-500/40'
                            }`}
                          >
                            {supp.cabinetType === 'manufacturer' ? 'B2B' : 'B2C'}
                          </span>
                          {supp.inn && (
                            <span className="text-[9px] font-mono font-bold text-amber-400 shrink-0">
                              STIR:{supp.inn}
                            </span>
                          )}
                          <span
                            className={`px-1 py-0.2 rounded text-[8px] font-bold shrink-0 ${
                              supp.status === 'active'
                                ? 'bg-emerald-500/20 text-emerald-400'
                                : supp.status === 'blocked'
                                ? 'bg-red-500/20 text-red-400'
                                : 'bg-amber-500/20 text-amber-400'
                            }`}
                          >
                            {supp.status === 'active' ? 'Faol' : supp.status === 'blocked' ? 'Blok' : 'Kut.'}
                          </span>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          {onEnterSupplierCabinet && (
                            <button
                              type="button"
                              onClick={() => handleRequestEnterSupplier(supp)}
                              className="px-2 py-0.5 rounded-md text-[9px] font-black cursor-pointer flex items-center gap-1 shrink-0 bg-[#FFB800] text-[#071326] border border-amber-300 shadow-sm"
                            >
                              <ExternalLink className="w-2.5 h-2.5" />
                              <span>Kabinetga o‘tish</span>
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleOpenSupplierReport(supp)}
                            className={`px-2 py-0.5 rounded-md text-[9px] font-black cursor-pointer flex items-center gap-1 shrink-0 border ${
                              rowRep.sales.length > 0
                                ? 'bg-[#FFB800] text-slate-950 border-amber-300'
                                : 'bg-blue-600 text-white border-blue-400/40'
                            }`}
                          >
                            <FileSpreadsheet className="w-2.5 h-2.5" />
                            <span>Hisobot</span>
                            {salesCount > 0 && (
                              <span className="px-1 rounded-full text-[8px] font-mono font-black bg-slate-950 text-[#FFB800]">
                                {salesCount}
                              </span>
                            )}
                          </button>
                        </div>
                      </div>

                      {/* 2-qator (Barcha ma'lumotlar bir qatorda): Viloyat • Mas'ul • Tel • Toifa • Foiz • Savdo • Bunker ulushi */}
                      <div className="flex items-center gap-1.5 text-[9px] font-mono text-sky-200 overflow-x-auto no-scrollbar whitespace-nowrap pt-0.5 border-t border-[#1E3A6D]/60">
                        <span className="text-white font-bold">{supp.region.replace(' viloyati', '')}</span>
                        <span className="text-[#1E3A6D]">|</span>
                        <span className="text-sky-100 font-semibold">{supp.name} {supp.surname || ''}</span>
                        <span className="text-[#1E3A6D]">|</span>
                        <span className="text-amber-300 font-bold">{supp.phone}</span>
                        <span className="text-[#1E3A6D]">|</span>
                        <span className="text-amber-200">{supp.category}</span>
                      </div>

                      {/* 3-qator: Moliyaviy ko'rsatkichlar bir qatorda */}
                      <div className="flex items-center justify-between gap-1 text-[9px] font-mono bg-[#0A1931] px-1.5 py-0.5 rounded border border-[#1E3A6D] whitespace-nowrap overflow-x-auto no-scrollbar">
                        <span className="text-emerald-300 font-black">{rateVal}% ({totalUniqueTypes} xil)</span>
                        <span className="text-sky-200">
                          Savdo: <strong className="text-[#FFB800]">{formatPriceSum(rowRep.totalSalesSum)}</strong>
                        </span>
                        <span className="text-emerald-300">
                          Bunker: <strong className="text-emerald-400">{formatPriceSum(rowRep.totalCommissionSum)}</strong>
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* KOMPYUTER EKRANI UCHUN JADVAL (O'zgarishsiz) */}
              <div className="hidden sm:block overflow-x-auto rounded-2xl border-2 border-[#1E3A6D]">
                <table className="w-full text-left text-xs text-[#F5F5F2] border-collapse">
                  <thead className="bg-[#071326] text-amber-400 uppercase text-[11px] tracking-wider border-b-2 border-[#1E3A6D]">
                    <tr className="divide-x divide-[#1E3A6D]">
                      <th className="py-3.5 px-3 font-black text-center w-12">№</th>
                      <th className="py-3.5 px-4 font-black">Ta'minotchi Kabinetlar</th>
                      <th className="py-3.5 px-4 font-black">Viloyat / Hudud</th>
                      <th className="py-3.5 px-4 font-black">Mas'ul shaxs va Tel raqami</th>
                      <th className="py-3.5 px-4 font-black">Toifa</th>
                      <th className="py-3.5 px-4 font-black">Shartnoma / Foiz</th>
                      <th className="py-3.5 px-4 font-black text-center">Amallar</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y-2 divide-[#1E3A6D] bg-[#0A1931]">
                    {filteredSuppliers.map((supp, idx) => (
                      <tr key={supp.id} className="hover:bg-[#132C54] transition-colors divide-x divide-[#1E3A6D]">
                        {/* 1. № */}
                        <td className="py-4 px-3 text-center font-mono font-black text-amber-400 text-sm align-middle">
                          {idx + 1}
                        </td>

                        {/* 2. Ta'minotchi Kabinetlar */}
                        <td className="py-4 px-4 align-middle">
                          <div className="flex items-start gap-2.5">
                            <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 border border-[#FFB800]/40 flex items-center justify-center font-black text-xs shrink-0 mt-0.5">
                              <Building className="w-4 h-4" />
                            </div>
                            <div className="space-y-1">
                              <span className="font-black text-white text-xs sm:text-sm block leading-snug">
                                {supp.companyName}
                              </span>
                              <div className="flex items-center gap-2 flex-wrap">
                                {supp.inn && (
                                  <span className="text-[11px] font-mono font-bold text-amber-400">
                                    STIR: {supp.inn}
                                  </span>
                                )}
                                <span
                                  className={`px-2 py-0.5 rounded text-[10px] font-mono font-black uppercase border ${
                                    supp.cabinetType === 'manufacturer'
                                      ? 'bg-red-500/20 text-red-300 border-red-500/40'
                                      : 'bg-sky-500/20 text-sky-300 border-sky-500/40'
                                  }`}
                                >
                                  {supp.cabinetType === 'manufacturer' ? 'B2B' : 'B2C'}
                                </span>
                                <span
                                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider inline-flex items-center gap-1 ${
                                    supp.status === 'active'
                                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                      : supp.status === 'blocked'
                                      ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                                      : 'bg-amber-500/20 text-amber-400 border border-[#FFB800]/40'
                                  }`}
                                >
                                  <span
                                    className={`w-1.5 h-1.5 rounded-full ${
                                      supp.status === 'active'
                                        ? 'bg-emerald-400 animate-pulse'
                                        : supp.status === 'blocked'
                                        ? 'bg-red-400'
                                        : 'bg-amber-400'
                                    }`}
                                  ></span>
                                  {supp.status === 'active' ? 'Faol' : supp.status === 'blocked' ? 'Bloklangan' : 'Kutilmoqda'}
                                </span>
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* 3. Viloyat / Hudud */}
                        <td className="py-4 px-4 align-middle">
                          <span className="text-white font-bold flex items-center gap-1.5">
                            <MapPin className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                            <span>{supp.region}</span>
                          </span>
                          {supp.district && (
                            <span className="text-[11px] text-sky-200 block mt-0.5 pl-5">
                              {supp.district}
                            </span>
                          )}
                        </td>

                        {/* 4. Mas'ul shaxs va Tel raqami */}
                        <td className="py-4 px-4 align-middle">
                          <div className="space-y-1">
                            <span className="font-black text-white text-xs sm:text-sm block">
                              {supp.name} {supp.surname || ''}
                            </span>
                            <span className="font-mono text-amber-300 font-bold text-xs flex items-center gap-1.5 whitespace-nowrap">
                              <Phone className="w-3 h-3 text-amber-400 shrink-0" />
                              {supp.phone}
                            </span>
                          </div>
                        </td>

                        {/* 5. Toifa */}
                        <td className="py-4 px-4 align-middle">
                          <span className="text-amber-300 font-bold bg-amber-500/15 px-2.5 py-1 rounded-lg border border-amber-500/30 inline-block">
                            {supp.category}
                          </span>
                        </td>

                        {/* 6. Shartnoma / Foiz */}
                        <td className="py-4 px-4 align-middle">
                          {(() => {
                            const rowRep = getSupplierReport(
                              supp.companyName,
                              `${supp.name} ${supp.surname || ''}`.trim(),
                              supp.region,
                              supp.phone,
                              supp.contractNumber || '',
                              supp.commissionRate || 5,
                              supp.commissionBasis || 'total',
                              'all',
                              undefined,
                              supp.id,
                              supp.inn,
                              true
                            );
                            const suppCatalogProductsCount = adminProducts.filter((p: any) => {
                              if (!p) return false;
                              if (p.supplierId && p.supplierId === supp.id) return true;
                              const pSupp = (p.supplierName || '').toLowerCase().trim();
                              const sComp = (supp.companyName || '').toLowerCase().trim();
                              return Boolean(pSupp && sComp && (pSupp === sComp || pSupp.includes(sComp) || sComp.includes(pSupp)));
                            }).length;
                            const totalUniqueTypes = Math.max(rowRep.uniqueProductTypesCount, suppCatalogProductsCount);
                            const basisLabel = supp.commissionBasis === 'profit' ? 'Savdodan' : 'Umumiydan';
                            const rateVal = supp.commissionRate || 5;
                            return (
                              <div className="flex flex-col gap-1.5">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  {supp.contractPdfData && (
                                    <button
                                      type="button"
                                      onClick={() => handleDownloadPdf(supp.contractPdfData, supp.contractPdfName || 'shartnoma_fayli')}
                                      className="p-1 rounded-md bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 transition-colors cursor-pointer"
                                      title="Shartnoma faylini yuklab olish"
                                    >
                                      <FileText className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                  <span className="px-2.5 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-mono font-black text-[11px] w-fit whitespace-nowrap">
                                    {basisLabel} {rateVal}%
                                  </span>
                                </div>
                                <div className="text-[11px] font-mono text-sky-200 flex flex-col gap-1 bg-[#071326] px-2.5 py-2 rounded-lg border border-[#1E3A6D]">
                                  <span>
                                    Umumiy savdo hajmida:{' '}
                                    <strong className="text-white">
                                      {totalUniqueTypes} xil mahsulot
                                    </strong>
                                  </span>
                                  <span>
                                    Foyda (Savdo):{' '}
                                    <strong className="text-[#FFB800]">
                                      {formatPriceSum(rowRep.totalSalesSum)}
                                    </strong>
                                  </span>
                                  <span className="inline-flex items-center gap-1.5 flex-wrap pt-0.5">
                                    <span className="text-emerald-300 font-bold">
                                      Bunker Stroy uchun ajratiladigan {rateVal}%:
                                    </span>
                                    <strong className="px-2 py-0.5 rounded-md bg-emerald-500/25 text-emerald-400 border border-emerald-400/50 font-black">
                                      {formatPriceSum(rowRep.totalCommissionSum)}
                                    </strong>
                                  </span>
                                </div>
                              </div>
                            );
                          })()}
                        </td>

                        {/* 7. Amallar (Hisobot) */}
                        <td className="py-4 px-4 text-center align-middle">
                          <div className="flex items-center justify-center">
                            {(() => {
                              const suppRep = getSupplierReport(
                                supp.companyName,
                                `${supp.name} ${supp.surname || ''}`.trim(),
                                supp.region,
                                supp.phone,
                                supp.contractNumber || '',
                                supp.commissionRate || 5,
                                supp.commissionBasis || 'total',
                                'all',
                                undefined,
                                supp.id,
                                supp.inn,
                                true
                              );
                              const salesCount = suppRep.uniqueProductTypesCount;
                              return (
                                <div className="flex items-center gap-1.5">
                                  {onEnterSupplierCabinet && (
                                    <button
                                      type="button"
                                      onClick={() => handleRequestEnterSupplier(supp)}
                                      className="px-3 py-2 rounded-xl text-xs font-black cursor-pointer transition-all flex items-center gap-1.5 active:scale-95 whitespace-nowrap bg-gradient-to-r from-[#FFB800] to-amber-500 text-[#071326] border border-amber-300 shadow-md"
                                    >
                                      <ExternalLink className="w-3.5 h-3.5 stroke-[2.5]" />
                                      <span>Kabinetga o‘tish</span>
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => handleOpenSupplierReport(supp)}
                                    className={`px-3.5 py-2 rounded-xl text-xs font-black cursor-pointer transition-all flex items-center gap-1.5 active:scale-95 whitespace-nowrap border ${
                                      suppRep.sales.length > 0
                                        ? 'bg-gradient-to-r from-[#FFB800] to-amber-500 text-slate-950 border-amber-300 shadow-[0_0_16px_rgba(255,184,0,0.5)]'
                                        : 'bg-blue-600 hover:bg-blue-500 text-white border-blue-400/40 shadow-md shadow-blue-600/30'
                                    }`}
                                    title="Ta'minotchi onlayn savdosi, Bunker ulushi, kun/oy/yil hisoboti va kabinetni tahrirlash"
                                  >
                                    <FileSpreadsheet className={`w-4 h-4 ${suppRep.sales.length > 0 ? 'text-slate-950' : 'text-amber-400'}`} />
                                    <span>Hisobot</span>
                                    {salesCount > 0 && (
                                      <span className="px-1.5 py-0.5 rounded-full text-[10px] font-mono font-black bg-slate-950 text-[#FFB800]">
                                        {salesCount}
                                      </span>
                                    )}
                                  </button>
                                </div>
                              );
                            })()}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {filteredSuppliers.length === 0 && (
                <div className="text-center py-8 sm:py-12 bg-[#071326] rounded-xl sm:rounded-2xl border border-dashed border-[#1E3A6D] p-4 sm:p-8">
                  <p className="text-sky-200 text-xs sm:text-sm">
                    {supplierCabinetSubTab === 'manufacturer'
                      ? "Hozircha B2B (Ishlab chiqaruvchi) kabinetlari mavjud emas."
                      : supplierCabinetSubTab === 'partner'
                      ? "Hozircha B2C (Hamkor ta’minotchi) kabinetlari mavjud emas."
                      : "Hozircha Ta'minotchi kabinetlari mavjud emas."}
                  </p>
                  <p className="text-[10px] sm:text-xs text-sky-400/70 mt-1">
                    «Kabinet Qo‘shish» tugmasi orqali yangi kabinet qo‘shishingiz mumkin.
                  </p>
                </div>
              )}
            </div>

          </div>
        )}

        {/* =========================================================================
            SECTION 3: SO'ROV VA MIJOZLAR
            1) Yuqori Vaqt Filtri: Kun / Oy / Yil / Barchasi (Umumiy)
            2) Hududlar Miqyosida Kabinetlar Diagrammasi (14 ta hudud)
            3) 14 ta Viloyat Jadvali (Tagma-tag joylashgan) + Har bitta viloyat uchun Eng ko'p sotilgan 7 ta mahsulot
            4) Qidiruv So'rovlar Tahlili — Umumiy Mijoz Qidiruvida Eng Ko'p Qidirilayotgan Mahsulotlar Diagrammasi
            5) Viloyatlararo Mahsulot Qidiruv Statistikasi (Jadval asosida)
            ========================================================================= */}
        {activeSection === 'requests_customers' && (() => {
          const FOURTEEN_REGIONS = [
            { key: 'Toshkent shahri', short: 'Toshkent sh.', match: ['toshkent sh', 'tashkent city', 'toshkent shahri'] },
            { key: 'Toshkent viloyati', short: 'Toshkent', match: ['toshkent vil', 'chirchiq', 'olmaliq', 'angren', 'bekobod', 'qibray', 'zangiota'] },
            { key: 'Samarqand viloyati', short: 'Samarqand', match: ['samarqand', 'urgut', 'kattaqo'] },
            { key: 'Farg‘ona viloyati', short: 'Farg‘ona', match: ['farg', 'qo‘qon', 'qoqon', 'marg‘ilon', 'margilon'] },
            { key: 'Andijon viloyati', short: 'Andijon', match: ['andijon', 'asaka', 'shahrixon'] },
            { key: 'Namangan viloyati', short: 'Namangan', match: ['namangan', 'chust', 'pop'] },
            { key: 'Buxoro viloyati', short: 'Buxoro', match: ['buxoro', 'g‘ijduvon', 'kogon'] },
            { key: 'Qashqadaryo viloyati', short: 'Qashqadaryo', match: ['qashqadaryo', 'qarshi', 'shahrisabz'] },
            { key: 'Surxondaryo viloyati', short: 'Surxondaryo', match: ['surxondaryo', 'termiz', 'denov'] },
            { key: 'Navoiy viloyati', short: 'Navoiy', match: ['navoiy', 'zarafshon', 'karmana'] },
            { key: 'Jizzax viloyati', short: 'Jizzax', match: ['jizzax', 'zomin'] },
            { key: 'Sirdaryo viloyati', short: 'Sirdaryo', match: ['sirdaryo', 'guliston', 'yangiyer'] },
            { key: 'Xorazm viloyati', short: 'Xorazm', match: ['xorazm', 'urganch', 'xiva'] },
            { key: 'Qoraqalpog‘iston Resp.', short: 'Qoraqalpog‘iston', match: ['qoraqalpog', 'nukus', 'qo‘ng‘irot', 'beruniy'] },
          ];

          const normalizeCompanyTitle = (val?: string): string => {
            if (!val) return '';
            return val
              .toLowerCase()
              .replace(/[«»""''`‘’ʻʼ]/g, '')
              .replace(/mas\s*uliyati\s*cheklangan\s*jamiyati/gi, '')
              .replace(/\bmchj\b/gi, '')
              .replace(/\s+/g, ' ')
              .trim();
          };

          const matchRegion14 = (rawRegion?: string, rawExtra?: string): string => {
            const combined = `${rawRegion || ''} ${rawExtra || ''}`.replace(/`/g, '‘').replace(/'/g, '‘').toLowerCase().trim();
            if (!combined) return 'Toshkent shahri';
            for (const reg of FOURTEEN_REGIONS) {
              if (reg.key.toLowerCase() === (rawRegion || '').toLowerCase().trim()) return reg.key;
              if (reg.short.toLowerCase() === (rawRegion || '').toLowerCase().trim()) return reg.key;
              if (reg.match.some((kw) => combined.includes(kw))) return reg.key;
            }
            return 'Toshkent shahri';
          };

          const matchesReqDate = (rawDateStr?: string): boolean => {
            if (reqPeriod === 'all') return true;
            if (!rawDateStr) return false;
            const norm = rawDateStr.slice(0, 10);
            if (reqPeriod === 'day') return norm === reqDateStr.slice(0, 10);
            if (reqPeriod === 'month') return norm.slice(0, 7) === reqDateStr.slice(0, 7);
            if (reqPeriod === 'year') return norm.slice(0, 4) === reqDateStr.slice(0, 4);
            return true;
          };

          // Tanlangan Kun / Oy / Yil bo'yicha filtrlangan onlayn buyurtmalar va B2B buyurtmalar
          const periodOnlineOrders = orders.filter(
            (ord) =>
              isOnlinePlatformOrder(ord) &&
              ord.status !== 'cancelled' &&
              ord.status !== 'returned' &&
              matchesReqDate(ord.createdAt || ord.date || ord.updatedAt)
          );

          const periodB2bOrders = b2bOrders.filter(
            (bo) =>
              bo &&
              bo.status !== 'cancelled' &&
              matchesReqDate(bo.createdAt || bo.date || bo.updatedAt)
          );

          // Tanlangan Kun / Oy / Yil bo'yicha filtrlangan qidiruv so'rovlari
          const periodSearchLogs = searchLogs.filter((sl) =>
            matchesReqDate(sl.createdAt || sl.timestamp)
          );

          // Qidirilgan so'z bo'yicha platformada mavjud mahsulotlar (natijalar) sonini aniq hisoblash
          const countPlatformMatchesForTerm = (rawTerm: string, loggedCount?: number): number => {
            const q = (rawTerm || '').toLowerCase().trim();
            if (!q) return 0;
            if (Array.isArray(adminProducts) && adminProducts.length > 0) {
              const matched = adminProducts.filter((p: any) => {
                if (!p) return false;
                const hay = `${p.title || ''} ${p.category || ''} ${p.subCategory || ''} ${p.description || ''} ${p.brand || ''} ${p.supplierName || ''}`
                  .toLowerCase();
                return hay.includes(q);
              }).length;
              return matched;
            }
            return typeof loggedCount === 'number' && loggedCount >= 0 ? loggedCount : 0;
          };

          // Buyurtma elementidan ta'minotchi va mahsulotni aniq topish funksiyasi
          const resolveItemSupplierAndProduct = (it: any) => {
            const matchedProd = Array.isArray(adminProducts)
              ? adminProducts.find(
                  (p: any) =>
                    p &&
                    ((it?.productId && p.id === it.productId) ||
                      (it?.id && p.id === it.id) ||
                      (p.title && it?.title && p.title.trim().toLowerCase() === it.title.trim().toLowerCase()))
                )
              : undefined;

            const rawSuppName =
              it?.supplierName ||
              it?.product?.supplierName ||
              matchedProd?.supplierName ||
              '';
            const normSuppName = normalizeCompanyTitle(rawSuppName);
            const rawInn = (it?.supplierInn || matchedProd?.supplierInn || '').trim();

            let matchedSupp = suppliers.find((s) => {
              if (s.id && (it?.supplierId === s.id || matchedProd?.supplierId === s.id)) return true;
              if (rawInn && s.inn && s.inn.trim() === rawInn) return true;
              const sClean = normalizeCompanyTitle(s.companyName);
              if (normSuppName && sClean && (normSuppName === sClean || normSuppName.includes(sClean) || sClean.includes(normSuppName))) {
                return true;
              }
              return false;
            });

            if (!matchedSupp && suppliers.length === 1) {
              matchedSupp = suppliers[0];
            }

            const resolvedTitle =
              (it?.title || it?.product?.title || matchedProd?.title || it?.category || matchedProd?.category || 'Qurilish mahsuloti').trim() ||
              'Qurilish mahsuloti';
            const resolvedUnit = (it?.unit || it?.product?.unit || matchedProd?.unit || 'dona').trim() || 'dona';

            return { matchedProd, matchedSupp, resolvedTitle, resolvedUnit };
          };

          // 14 ta viloyat kesimida B2B, B2C, Foydalanuvchi kabinetlar, Savdo aylanmasi va Top 7 sotilgan mahsulot
          const regionalData = FOURTEEN_REGIONS.map((reg) => {
            const b2bList = suppliers.filter(
              (s) => s.cabinetType === 'manufacturer' && matchRegion14(s.region, s.district) === reg.key
            );
            const b2cList = suppliers.filter(
              (s) => (s.cabinetType || 'partner') === 'partner' && matchRegion14(s.region, s.district) === reg.key
            );
            const custList = registeredCustomers.filter(
              (u) =>
                u &&
                u.role !== 'admin' &&
                u.role !== 'bunker_admin' &&
                u.role !== 'sub_admin' &&
                u.role !== 'supplier' &&
                matchRegion14(u.region, `${u.district || ''} ${u.address || ''}`) === reg.key
            );

            let regionTurnover = 0;
            const soldProductMap = new Map<
              string,
              { title: string; unit: string; totalQty: number; totalSum: number; ordersCount: number }
            >();

            periodOnlineOrders.forEach((ord) => {
              const items = Array.isArray(ord.items) ? ord.items : [];
              items.forEach((it: any) => {
                const { matchedProd, matchedSupp, resolvedTitle, resolvedUnit } = resolveItemSupplierAndProduct(it);
                const qty = Math.max(1, Number(it?.quantity) || 1);
                const price = Number(it?.price) || Number(it?.product?.price) || Number(matchedProd?.price) || 0;
                const lineSum = qty * price > 0 ? qty * price : items.length === 1 ? Number(ord.totalAmount) || 0 : 0;

                const itemRegion = matchedSupp
                  ? matchRegion14(matchedSupp.region, matchedSupp.district)
                  : matchRegion14(it?.region || it?.product?.region || matchedProd?.region || (ord as any).deliveryRegion, ord.deliveryAddress);

                if (itemRegion === reg.key) {
                  regionTurnover += lineSum;
                  const keyLower = `${resolvedTitle.toLowerCase()}__${resolvedUnit.toLowerCase()}`;
                  const prev = soldProductMap.get(keyLower);
                  if (prev) {
                    prev.totalQty += qty;
                    prev.totalSum += lineSum;
                    prev.ordersCount += 1;
                  } else {
                    soldProductMap.set(keyLower, {
                      title: resolvedTitle,
                      unit: resolvedUnit,
                      totalQty: qty,
                      totalSum: lineSum,
                      ordersCount: 1,
                    });
                  }
                }
              });
            });

            periodB2bOrders.forEach((bo) => {
              const matchedSupp = suppliers.find(
                (s) =>
                  (bo.manufacturerId && bo.manufacturerId === s.id) ||
                  (bo.manufacturerCompanyName &&
                    normalizeCompanyTitle(bo.manufacturerCompanyName) === normalizeCompanyTitle(s.companyName))
              );
              const boRegion = matchedSupp
                ? matchRegion14(matchedSupp.region, matchedSupp.district)
                : matchRegion14(bo.manufacturerRegion, bo.buyerRegion);

              if (boRegion === reg.key) {
                const amount = Number(bo.totalAmount) || 0;
                const qty = Math.max(1, Number(bo.quantity) || 1);
                const unit = (bo.unit || 'dona').trim();
                const title = (bo.productTitle || bo.title || 'B2B Mahsulot').trim();
                regionTurnover += amount;
                const keyLower = `${title.toLowerCase()}__${unit.toLowerCase()}`;
                const prev = soldProductMap.get(keyLower);
                if (prev) {
                  prev.totalQty += qty;
                  prev.totalSum += amount;
                  prev.ordersCount += 1;
                } else {
                  soldProductMap.set(keyLower, {
                    title,
                    unit,
                    totalQty: qty,
                    totalSum: amount,
                    ordersCount: 1,
                  });
                }
              }
            });

            // Eng ko'p sotilgan 7 ta mahsulot (miqdori va summasi bo'yicha saralangan)
            const top7Products = Array.from(soldProductMap.values())
              .sort((a, b) => b.totalSum - a.totalSum || b.totalQty - a.totalQty)
              .slice(0, 7);

            // Mijoz kabinetlari ham jami kabinetlar soniga qo'shib hisoblanadi
            const totalCabinets = b2bList.length + b2cList.length + custList.length;

            return {
              ...reg,
              b2bCount: b2bList.length,
              b2cCount: b2cList.length,
              userCount: custList.length,
              totalCabinets,
              turnover: regionTurnover,
              top7Products,
            };
          });

          const totalB2B = regionalData.reduce((s, r) => s + r.b2bCount, 0);
          const totalB2C = regionalData.reduce((s, r) => s + r.b2cCount, 0);
          const totalUsers = regionalData.reduce((s, r) => s + r.userCount, 0);
          const totalTurnoverAllRegions = regionalData.reduce((s, r) => s + r.turnover, 0);
          const maxRegionCabinets = Math.max(...regionalData.map((r) => r.totalCabinets), 1);

          // Umumiy mijoz qidiruvida eng ko'p qidirilayotgan mahsulotlar tahlili (7 tadan 19 tagacha eng ko'p qidirilgan mahsulotlar)
          const overallSearchMap = new Map<
            string,
            { term: string; count: number; matchedCount: number; regions: Set<string> }
          >();
          periodSearchLogs.forEach((log) => {
            const cleanKey = (log.normalizedTerm || log.term || '').toLowerCase().trim();
            if (!cleanKey) return;
            const displayTerm = log.term.charAt(0).toUpperCase() + log.term.slice(1);
            const resolvedReg = matchRegion14(log.region);
            const matchedCount = countPlatformMatchesForTerm(cleanKey, log.resultsCount);
            const prev = overallSearchMap.get(cleanKey);
            if (prev) {
              prev.count += 1;
              prev.matchedCount = Math.max(prev.matchedCount, matchedCount);
              prev.regions.add(resolvedReg);
            } else {
              overallSearchMap.set(cleanKey, {
                term: displayTerm,
                count: 1,
                matchedCount,
                regions: new Set([resolvedReg]),
              });
            }
          });

          const overallTopSearched = Array.from(overallSearchMap.values()).sort(
            (a, b) => b.count - a.count || b.matchedCount - a.matchedCount
          );
          const totalSearchRequestsCount = periodSearchLogs.length;
          const maxSearchCount = Math.max(...overallTopSearched.map((item) => item.count), 1);

          // Viloyatlararo mahsulot qidiruv statistikasi — so'rovlar soni eng ko'p bo'lgan viloyat birinchi!
          const regionalSearchStats = FOURTEEN_REGIONS.map((reg) => {
            const regLogs = periodSearchLogs.filter((l) => matchRegion14(l.region) === reg.key);
            const termCounter = new Map<
              string,
              { term: string; count: number; matchedCount: number }
            >();
            regLogs.forEach((l) => {
              const k = (l.normalizedTerm || l.term || '').toLowerCase().trim();
              if (!k) return;
              const disp = l.term.charAt(0).toUpperCase() + l.term.slice(1);
              const matchedCount = countPlatformMatchesForTerm(k, l.resultsCount);
              const existing = termCounter.get(k);
              if (existing) {
                existing.count += 1;
                existing.matchedCount = Math.max(existing.matchedCount, matchedCount);
              } else {
                termCounter.set(k, { term: disp, count: 1, matchedCount });
              }
            });
            // Natijalar va so'rovlar soni bo'yicha ketma-ketlikda saralash
            const sortedTerms = Array.from(termCounter.values()).sort(
              (a, b) => b.count - a.count || b.matchedCount - a.matchedCount
            );
            const totalMatchedInRegion = sortedTerms.reduce((acc, t) => acc + t.matchedCount, 0);
            const termsWithProductCount = sortedTerms.filter((t) => t.matchedCount > 0).length;

            return {
              ...reg,
              totalRequests: regLogs.length,
              uniqueTermsCount: sortedTerms.length,
              totalMatchedInRegion,
              termsWithProductCount,
              topTerms: sortedTerms,
            };
          }).sort((a, b) => b.totalRequests - a.totalRequests || b.totalMatchedInRegion - a.totalMatchedInRegion);

          return (
            <div className="space-y-2.5 sm:space-y-6 mt-2 sm:mt-0 animate-fadeIn">
              {/* 1. YUQORI PANEL VA KUN / OY / YIL / UMUMIY FILTRI */}
              <div className="bg-[#0A1931] border-2 border-[#1E3A6D] rounded-xl sm:rounded-2xl p-2.5 sm:p-5 shadow-2xl">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2 sm:gap-4">
                  <div className="flex items-center gap-2 sm:gap-3">
                    <div className="w-7 h-7 sm:w-11 sm:h-11 rounded-lg sm:rounded-xl bg-[#071326] border border-[#FFB800]/60 text-[#FFB800] flex items-center justify-center shrink-0">
                      <BarChart3 className="w-4 h-4 sm:w-5 sm:h-5 stroke-[2.2]" />
                    </div>
                    <div>
                      <h2 className="text-xs sm:text-xl font-black text-white leading-snug">
                        So‘rov va Mijozlar Monitoringi
                      </h2>
                    </div>
                  </div>

                  {/* Kun / Oy / Yil / Umumiy hisobida ko'rish filtri */}
                  <div className="flex items-center gap-1 sm:gap-2 flex-wrap bg-[#071326] p-1 sm:p-2 rounded-lg sm:rounded-2xl border border-[#1E3A6D]">
                    <span className="text-[10px] sm:text-[11px] font-black text-amber-400 px-1 sm:px-2 uppercase tracking-wider flex items-center gap-1">
                      <Clock className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-[#FFB800]" />
                      <span>Davr:</span>
                    </span>
                    {(
                      [
                        { id: 'day', label: 'Kun' },
                        { id: 'month', label: 'Oy' },
                        { id: 'year', label: 'Yil' },
                        { id: 'all', label: 'Umumiy' },
                      ] as { id: 'day' | 'month' | 'year' | 'all'; label: string }[]
                    ).map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setReqPeriod(p.id)}
                        className={`px-2 sm:px-3.5 py-1 sm:py-1.5 rounded-md sm:rounded-xl text-[10px] sm:text-xs font-black transition-all cursor-pointer border ${
                          reqPeriod === p.id
                            ? 'bg-red-600 text-white border-red-400 shadow-[0_0_14px_rgba(220,38,38,0.45)]'
                            : 'bg-[#0A1931] text-sky-200 border-[#1E3A6D] hover:border-[#FFB800]/60 hover:text-white'
                        }`}
                      >
                        {p.label}
                      </button>
                    ))}

                    {reqPeriod !== 'all' && (
                      <div className="flex items-center gap-1 ml-0.5">
                        {reqPeriod === 'day' && (
                          <input
                            type="date"
                            value={reqDateStr}
                            onChange={(e) => setReqDateStr(e.target.value || new Date().toISOString().slice(0, 10))}
                            className="px-2 sm:px-3 py-1 sm:py-1.5 bg-[#0A1931] border border-[#FFB800] rounded-lg sm:rounded-xl text-white text-[10px] sm:text-xs font-mono font-bold focus:outline-none"
                          />
                        )}
                        {reqPeriod === 'month' && (
                          <input
                            type="month"
                            value={reqDateStr.slice(0, 7)}
                            onChange={(e) => setReqDateStr(`${e.target.value}-01`)}
                            className="px-2 sm:px-3 py-1 sm:py-1.5 bg-[#0A1931] border border-[#FFB800] rounded-lg sm:rounded-xl text-white text-[10px] sm:text-xs font-mono font-bold focus:outline-none"
                          />
                        )}
                        {reqPeriod === 'year' && (
                          <select
                            value={reqDateStr.slice(0, 4)}
                            onChange={(e) => setReqDateStr(`${e.target.value}-01-01`)}
                            className="px-2 sm:px-3 py-1 sm:py-1.5 bg-[#0A1931] border border-[#FFB800] rounded-lg sm:rounded-xl text-white text-[10px] sm:text-xs font-mono font-bold focus:outline-none cursor-pointer"
                          >
                            {[2024, 2025, 2026, 2027].map((yr) => (
                              <option key={yr} value={String(yr)}>
                                {yr}-yil
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* 2. HUDUDLAR MIQYOSIDA KABINETLAR DIAGRAMMASI (14 TA HUDUD) */}
              <div className="bg-[#0A1931] border-2 border-[#1E3A6D] rounded-xl sm:rounded-2xl p-2.5 sm:p-6 shadow-2xl space-y-2.5 sm:space-y-5">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2 sm:gap-4 pb-2 sm:pb-4 border-b border-[#1E3A6D]">
                  <div className="flex items-center gap-2 sm:gap-3">
                    <div className="w-7 h-7 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-[#071326] border border-[#FFB800]/50 flex items-center justify-center text-[#FFB800] shrink-0">
                      <MapPin className="w-4 h-4 sm:w-5 sm:h-5" />
                    </div>
                    <h3 className="text-xs sm:text-lg font-black text-white">
                      Hududlar Miqyosida Kabinetlar Diagrammasi
                    </h3>
                  </div>

                  <div className="flex flex-wrap items-center gap-1 sm:gap-2 text-[10px] sm:text-xs">
                    <div className="px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg bg-[#071326] border border-[#1E3A6D] flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-[#FFB800]" />
                      <span className="text-sky-100 font-bold">B2B:</span>
                      <span className="font-mono font-black text-[#FFB800]">{totalB2B} ta</span>
                    </div>
                    <div className="px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg bg-[#071326] border border-[#1E3A6D] flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-emerald-400" />
                      <span className="text-sky-100 font-bold">B2C:</span>
                      <span className="font-mono font-black text-emerald-400">{totalB2C} ta</span>
                    </div>
                    <div className="px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg bg-[#071326] border border-[#1E3A6D] flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-sky-400" />
                      <span className="text-sky-100 font-bold">Mijoz:</span>
                      <span className="font-mono font-black text-sky-300">{totalUsers} ta</span>
                    </div>
                    <div className="px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg bg-[#071326] border border-emerald-400/50 font-mono font-black text-emerald-400">
                      Jami: {totalB2B + totalB2C + totalUsers} kabinet
                    </div>
                    <div className="px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg bg-[#071326] border border-[#FFB800]/60 font-mono font-black text-[#FFB800]">
                      {formatPriceSum(totalTurnoverAllRegions)}
                    </div>
                  </div>
                </div>

                {/* 14 ustunli diagramma — Ustun balandligi kabinetlar soni va savdo bo'yicha */}
                <div className="overflow-x-auto pb-1">
                  <div className="min-w-[540px] sm:min-w-[920px] pt-3 sm:pt-8 pb-1 sm:pb-2 px-1 sm:px-2">
                    <div className="grid grid-cols-14 gap-1 sm:gap-2 items-end h-36 sm:h-52 border-b-2 border-[#1E3A6D] pb-2 px-0.5">
                      {regionalData.map((reg, idx) => {
                        const barHeightPct =
                          reg.totalCabinets > 0
                            ? Math.max(16, Math.round((reg.totalCabinets / maxRegionCabinets) * 100))
                            : 5;
                        const isHovered = activeReqBarHover === idx;

                        return (
                          <div
                            key={reg.key}
                            onClick={() => handleAcknowledgeRequestProblem(reg.key)}
                            onMouseEnter={() => setActiveReqBarHover(idx)}
                            onMouseLeave={() => setActiveReqBarHover(null)}
                            className="flex flex-col items-center justify-end h-full group relative cursor-pointer select-none"
                          >
                            {/* Ustun ustidagi savdo summasi va kabinet soni */}
                            <div className="mb-1 text-center leading-tight">
                              <span
                                className={`block text-[8px] sm:text-[9px] font-mono font-black ${
                                  reg.turnover > 0 ? 'text-[#FFB800]' : 'text-sky-300/60'
                                }`}
                              >
                                {reg.turnover > 0
                                  ? `${Math.round(reg.turnover / 1000)}k`
                                  : '0'}
                              </span>
                              <span
                                className={`block text-[8px] sm:text-[10px] font-mono font-black ${
                                  reg.totalCabinets > 0 ? 'text-white' : 'text-sky-300/50'
                                }`}
                              >
                                {reg.totalCabinets}ta
                              </span>
                            </div>

                            {/* Ustun (Bar) */}
                            <div className="w-full max-w-[26px] sm:max-w-[38px] bg-[#071326] rounded-t-lg sm:rounded-t-xl border border-[#1E3A6D] h-24 sm:h-36 flex items-end p-0.5 overflow-hidden">
                              <div
                                className={`w-full rounded-t-lg transition-all duration-500 ${
                                  reg.totalCabinets > 0
                                    ? reg.turnover > 0
                                      ? 'bg-gradient-to-t from-red-600 via-[#FFB800] to-emerald-400 shadow-[0_0_14px_rgba(255,184,0,0.45)]'
                                      : 'bg-gradient-to-t from-blue-600 via-sky-400 to-emerald-300'
                                    : 'bg-[#1E3A6D]/50'
                                }`}
                                style={{ height: `${barHeightPct}%` }}
                              />
                            </div>

                            {/* Hoverda to'liq ma'lumot */}
                            {isHovered && (
                              <div className="absolute -top-8 left-1/2 -translate-x-1/2 z-20 w-48 p-2.5 rounded-xl bg-[#071326] border-2 border-[#FFB800] shadow-2xl text-[10px] space-y-1 pointer-events-none">
                                <div className="font-black text-[#FFB800] border-b border-[#1E3A6D] pb-1">
                                  {reg.key} ({reg.totalCabinets} ta)
                                </div>
                                <div className="flex justify-between text-white">
                                  <span>B2B kabinet:</span>
                                  <strong className="font-mono text-[#FFB800]">{reg.b2bCount} ta</strong>
                                </div>
                                <div className="flex justify-between text-white">
                                  <span>B2C kabinet:</span>
                                  <strong className="font-mono text-emerald-400">{reg.b2cCount} ta</strong>
                                </div>
                                <div className="flex justify-between text-white">
                                  <span>Mijoz kabineti:</span>
                                  <strong className="font-mono text-sky-300">{reg.userCount} ta</strong>
                                </div>
                                <div className="flex justify-between text-amber-300 border-t border-[#1E3A6D] pt-1 font-mono font-black">
                                  <span>Savdo:</span>
                                  <span>{formatPriceSum(reg.turnover)}</span>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* Viloyat nomlari qatori */}
                    <div className="grid grid-cols-14 gap-1 sm:gap-2 pt-2 px-0.5 text-center">
                      {regionalData.map((reg) => (
                        <div key={reg.key} className="text-[8px] sm:text-[10px] font-black text-sky-100 leading-tight truncate" title={reg.key}>
                          {reg.short}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* 3. VILOYATLAR KESIMIDA JADVAL (TAGMA-TAG JOYLASHGAN 14 VILOYAT + ENG KO'P SOTILGAN 7 TA MAHSULOT) */}
              <div className="bg-[#0A1931] border-2 border-[#1E3A6D] rounded-xl sm:rounded-2xl p-2.5 sm:p-6 shadow-2xl space-y-2.5 sm:space-y-4">
                <div className="flex items-center justify-between gap-2 pb-2 sm:pb-3 border-b border-[#1E3A6D]">
                  <div className="flex items-center gap-2 sm:gap-3">
                    <div className="w-7 h-7 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-[#071326] border border-[#FFB800]/50 flex items-center justify-center text-[#FFB800] shrink-0">
                      <Package className="w-4 h-4 sm:w-5 sm:h-5" />
                    </div>
                    <h3 className="text-xs sm:text-lg font-black text-white leading-snug">
                      Viloyatlar Kesimida Kabinetlar va Eng Ko‘p Sotilgan 7 ta Mahsulot Jadvali
                    </h3>
                  </div>
                </div>

                {/* MOBIL EKRAN UCHUN: 14 ta viloyatning har biri ixcham va barcha mahsulot nomlari, miqdori va summasi to'liq ko'rinadigan karta shaklida */}
                <div className="sm:hidden space-y-2">
                  {regionalData.map((reg, idx) => (
                    <div
                      key={reg.key}
                      onClick={() => handleAcknowledgeRequestProblem(reg.key)}
                      className="p-2.5 rounded-xl bg-[#071326] border border-[#1E3A6D] space-y-2"
                    >
                      {/* 1-qator: №, Viloyat nomi va Savdo aylanmasi */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="w-5 h-5 rounded-md bg-amber-500/20 text-[#FFB800] border border-[#FFB800]/50 font-mono font-black text-[10px] flex items-center justify-center shrink-0">
                            {idx + 1}
                          </span>
                          <span className="font-black text-white text-xs truncate">
                            {reg.key}
                          </span>
                        </div>
                        <span className="px-2 py-0.5 rounded-lg bg-[#0A1931] border border-[#FFB800]/50 font-mono font-black text-[#FFB800] text-[11px] shrink-0">
                          {formatPriceSum(reg.turnover)}
                        </span>
                      </div>

                      {/* 2-qator: Kabinetlar soni (Jami, B2B, B2C, Mijoz) bir qatorda */}
                      <div className="flex items-center justify-between gap-1.5 px-2 py-1 rounded-lg bg-[#0A1931] border border-[#1E3A6D] text-[10px] font-mono">
                        <span className="text-white font-black">
                          Jami: <strong className="text-[#FFB800]">{reg.totalCabinets} kabinet</strong>
                        </span>
                        <span className="text-sky-200">
                          B2B: <strong className="text-[#FFB800]">{reg.b2bCount}</strong> • B2C: <strong className="text-emerald-400">{reg.b2cCount}</strong> • Mijoz: <strong className="text-sky-300">{reg.userCount}</strong>
                        </span>
                      </div>

                      {/* 3-qator: Eng ko'p sotilgan 7 ta mahsulot */}
                      {reg.top7Products.length > 0 ? (
                        <div className="space-y-1.5 pt-1 border-t border-[#1E3A6D]/70">
                          <span className="text-[10px] font-bold text-amber-300 block">
                            Eng ko‘p sotilgan mahsulotlar ({reg.top7Products.length}):
                          </span>
                          <div className="grid grid-cols-1 gap-1.5">
                            {reg.top7Products.map((prod, pIdx) => (
                              <div
                                key={`${reg.key}-m-prod-${pIdx}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleAcknowledgeRequestProblem(prod.title);
                                }}
                                className="flex items-center justify-between gap-2 bg-[#0A1931] border border-[#1E3A6D] px-2.5 py-1.5 rounded-lg"
                              >
                                <div className="flex items-center gap-1.5 min-w-0 flex-1">
                                  <span className="w-4.5 h-4.5 rounded bg-[#FFB800] text-[#0A1931] font-mono font-black text-[10px] flex items-center justify-center shrink-0">
                                    {pIdx + 1}
                                  </span>
                                  <span className="font-black text-white text-[11px] leading-snug break-words">
                                    {prod.title}
                                  </span>
                                </div>
                                <div className="text-right shrink-0 font-mono">
                                  <span className="text-[10px] font-black text-emerald-400 block">
                                    {prod.totalQty} {prod.unit}
                                  </span>
                                  <span className="text-[10px] font-bold text-[#FFB800] block">
                                    {formatPriceSum(prod.totalSum)}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="text-[10px] text-sky-300/60 font-medium">
                          Hozircha sotilgan mahsulot qayd etilmagan (0 ta)
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* KOMPYUTER EKRANI UCHUN JADVAL */}
                <div className="hidden sm:block overflow-x-auto rounded-2xl border-2 border-[#1E3A6D]">
                  <table className="w-full text-left text-xs text-[#F5F5F2] border-collapse">
                    <thead className="bg-[#071326] text-amber-400 uppercase text-[11px] tracking-wider border-b-2 border-[#1E3A6D]">
                      <tr className="divide-x divide-[#1E3A6D]">
                        <th className="py-3.5 px-3 font-black text-center w-12">№</th>
                        <th className="py-3.5 px-4 font-black w-48">Viloyat / Hudud</th>
                        <th className="py-3.5 px-4 font-black text-center w-44">Kabinetlar Soni</th>
                        <th className="py-3.5 px-4 font-black text-right w-40">Savdo Aylanmasi</th>
                        <th className="py-3.5 px-4 font-black">
                          Eng Ko‘p Sotilgan 7 ta Mahsulot (1 — 7)
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y-2 divide-[#1E3A6D] bg-[#0A1931]">
                      {regionalData.map((reg, idx) => (
                        <tr
                          key={reg.key}
                          onClick={() => handleAcknowledgeRequestProblem(reg.key)}
                          className="hover:bg-[#132C54] transition-colors divide-x divide-[#1E3A6D] cursor-pointer"
                        >
                          <td className="py-4 px-3 text-center font-mono font-black text-amber-400">
                            {idx + 1}
                          </td>
                          <td className="py-4 px-4 font-black text-white text-xs sm:text-sm">
                            <div className="flex items-center gap-2">
                              <MapPin className="w-4 h-4 text-[#FFB800] shrink-0" />
                              <span>{reg.key}</span>
                            </div>
                          </td>
                          <td className="py-4 px-4 text-center">
                            <div className="inline-flex flex-col gap-1 bg-[#071326] px-3 py-1.5 rounded-xl border border-[#1E3A6D] text-[11px] font-mono">
                              <span className="text-white font-black">
                                Jami: <strong className="text-[#FFB800]">{reg.totalCabinets} kabinet</strong>
                              </span>
                              <span className="text-[10px] text-sky-200">
                                B2B: {reg.b2bCount} • B2C: {reg.b2cCount} • Mijoz: {reg.userCount}
                              </span>
                            </div>
                          </td>
                          <td className="py-4 px-4 text-right font-mono font-black text-[#FFB800] text-xs sm:text-sm whitespace-nowrap">
                            {formatPriceSum(reg.turnover)}
                          </td>
                          <td className="py-4 px-4">
                            {reg.top7Products.length > 0 ? (
                              <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-2">
                                {reg.top7Products.map((prod, pIdx) => (
                                  <div
                                    key={`${reg.key}-prod-${pIdx}`}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleAcknowledgeRequestProblem(prod.title);
                                    }}
                                    className={`flex items-center justify-between gap-2.5 bg-[#071326] border px-3 py-2 rounded-xl cursor-pointer transition-all min-w-[200px] ${
                                      requestProblemsState.hasUnacknowledged && searchLogs.length === 0
                                        ? 'border-amber-400 shadow-[0_0_12px_rgba(255,184,0,0.4)] animate-pulse'
                                        : 'border-[#1E3A6D]'
                                    }`}
                                  >
                                    <div className="flex items-center gap-2 min-w-0 flex-1">
                                      <span className="w-5 h-5 rounded-md bg-[#FFB800] text-[#0A1931] font-mono font-black text-[10px] flex items-center justify-center shrink-0">
                                        {pIdx + 1}
                                      </span>
                                      <span className="font-black text-white text-xs break-words leading-snug" title={prod.title}>
                                        {prod.title}
                                      </span>
                                    </div>
                                    <div className="text-right shrink-0 font-mono">
                                      <span className="text-[11px] font-black text-emerald-400 block">
                                        {prod.totalQty} {prod.unit}
                                      </span>
                                      <span className="text-[10px] text-amber-300 block">
                                        {formatPriceSum(prod.totalSum)}
                                      </span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <span className="text-[11px] text-sky-300/60 font-medium">
                                Hozircha sotilgan mahsulot qayd etilmagan (0 ta)
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* 4. QIDIRUV SO'ROVLAR TAHLILI (ENG KO'P QIDIRILAYOTGAN 7 TADAN 19 TAGACHA MAHSULOTLAR RO'YXATI VA DIAGRAMMASI) */}
              <div className="bg-[#0A1931] border-2 border-[#1E3A6D] rounded-xl sm:rounded-2xl p-2.5 sm:p-6 shadow-2xl space-y-2.5 sm:space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-3 pb-2.5 sm:pb-4 border-b border-[#1E3A6D]">
                  <div className="flex items-center gap-2 sm:gap-3">
                    <div className="w-7 h-7 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-[#071326] border border-[#FFB800]/50 flex items-center justify-center text-[#FFB800] shrink-0">
                      <Search className="w-4 h-4 sm:w-5 sm:h-5" />
                    </div>
                    <h3 className="text-xs sm:text-lg font-black text-white leading-snug">
                      Qidiruv So‘rovlar Tahlili
                    </h3>
                  </div>
                  <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap shrink-0">
                    <span className="px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg sm:rounded-xl bg-emerald-500/20 border border-emerald-400/50 text-[10px] sm:text-xs font-mono font-black text-emerald-400">
                      Top {Math.min(19, Math.max(7, overallTopSearched.length))} ro‘yxat (7 — 19)
                    </span>
                    <span className="px-2.5 sm:px-3.5 py-1 sm:py-1.5 rounded-lg sm:rounded-xl bg-[#071326] border border-[#FFB800]/60 text-[10px] sm:text-xs font-mono font-black text-[#FFB800]">
                      Jami qidiruv so‘rovlari: {totalSearchRequestsCount} ta so‘rov
                    </span>
                  </div>
                </div>

                {overallTopSearched.length === 0 ? (
                  <div className="text-center py-6 sm:py-10 bg-[#071326] rounded-xl sm:rounded-2xl border border-dashed border-[#1E3A6D] p-4 sm:p-6">
                    <p className="text-sky-200 text-xs sm:text-sm font-bold">
                      Tanlangan davr bo‘yicha mijoz qidiruv so‘rovlari hali qayd etilmagan (0 ta so‘rov).
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 sm:gap-3.5">
                    {overallTopSearched.slice(0, 19).map((item, idx) => {
                      const pct = Math.max(10, Math.round((item.count / maxSearchCount) * 100));
                      const sharePct =
                        totalSearchRequestsCount > 0
                          ? Math.round((item.count / totalSearchRequestsCount) * 100)
                          : 0;
                      const isTop7 = idx < 7;
                      const cleanTermKey = item.term.toLowerCase().trim();
                      const mappedProbKey = requestProblemsState.termKeyLookup.get(cleanTermKey);
                      const isItemUnacknowledged = Boolean(
                        mappedProbKey &&
                          requestProblemsState.activeKeys.includes(mappedProbKey) &&
                          !acknowledgedProblemKeys.includes(mappedProbKey)
                      );
                      return (
                        <div
                          key={item.term}
                          onClick={() => handleAcknowledgeRequestProblem(item.term)}
                          className={`p-2.5 sm:p-4 rounded-xl sm:rounded-2xl bg-[#071326] border space-y-2 transition-all cursor-pointer ${
                            isItemUnacknowledged
                              ? 'border-rose-500 shadow-[0_0_18px_rgba(244,63,94,0.45)] animate-pulse'
                              : isTop7
                              ? 'border-[#FFB800]/70 hover:border-[#FFB800]'
                              : 'border-[#1E3A6D] hover:border-sky-400/60'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-1.5 sm:gap-2 flex-wrap">
                            <div className="flex items-center gap-1.5 sm:gap-2.5 min-w-0">
                              <span
                                className={`w-5 h-5 sm:w-6 sm:h-6 rounded-md sm:rounded-lg font-mono font-black text-[10px] sm:text-xs flex items-center justify-center shrink-0 ${
                                  isTop7
                                    ? 'bg-[#FFB800] text-[#0A1931]'
                                    : 'bg-[#132C54] text-sky-200 border border-[#1E3A6D]'
                                }`}
                              >
                                {idx + 1}
                              </span>
                              <span className="font-black text-white text-xs sm:text-sm truncate">
                                {item.term}
                              </span>
                              {isTop7 && (
                                <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-[#FFB800] border border-[#FFB800]/40 text-[9px] sm:text-[10px] font-mono font-black">
                                  TOP-7
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
                              <span
                                className={`px-2 py-0.5 rounded-md sm:rounded-lg font-mono font-black text-[10px] sm:text-[11px] border ${
                                  item.matchedCount > 0
                                    ? 'bg-emerald-500/20 text-emerald-400 border-emerald-400/50'
                                    : isItemUnacknowledged
                                    ? 'bg-rose-600/35 text-rose-200 border-rose-400 shadow-[0_0_12px_rgba(244,63,94,0.5)] animate-pulse'
                                    : 'bg-rose-500/20 text-rose-300 border-rose-400/40'
                                }`}
                              >
                                {item.matchedCount > 0
                                  ? `Bor: ${item.matchedCount} ta`
                                  : '0 ta natija'}
                              </span>
                              <span className="px-2 py-0.5 rounded-md sm:rounded-lg bg-red-600/25 text-red-300 border border-red-400/50 font-mono font-black text-[10px] sm:text-xs">
                                {item.count} ta so‘rov ({sharePct}%)
                              </span>
                            </div>
                          </div>

                          <div className="w-full h-2 sm:h-3 bg-[#0A1931] rounded-full overflow-hidden border border-[#1E3A6D]">
                            <div
                              className="h-full bg-gradient-to-r from-red-600 via-[#FFB800] to-emerald-400 rounded-full transition-all duration-500"
                              style={{ width: `${pct}%` }}
                            />
                          </div>

                          <div className="text-[10px] sm:text-[11px] text-sky-200 flex items-center justify-between gap-2 flex-wrap">
                            <span className="flex items-center gap-1">
                              <MapPin className="w-3 h-3 text-amber-400 shrink-0" />
                              <span>Hududlar: {Array.from(item.regions).join(', ')}</span>
                            </span>
                            <span className="font-mono text-[10px] text-sky-300">
                              #{idx + 1}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* 5. VILOYATLARARO MAHSULOT QIDIRUV STATISTIKASI (SO'ROVLAR KO'P VILOYAT BIRINCHI!) */}
              <div className="bg-[#0A1931] border-2 border-[#1E3A6D] rounded-xl sm:rounded-2xl p-2.5 sm:p-6 shadow-2xl space-y-2.5 sm:space-y-4">
                <div className="flex items-center justify-between gap-2 pb-2 sm:pb-3 border-b border-[#1E3A6D]">
                  <div className="flex items-center gap-2 sm:gap-3">
                    <div className="w-7 h-7 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-[#071326] border border-[#FFB800]/50 flex items-center justify-center text-[#FFB800] shrink-0">
                      <Globe className="w-4 h-4 sm:w-5 sm:h-5" />
                    </div>
                    <h3 className="text-xs sm:text-lg font-black text-white leading-snug">
                      Viloyatlararo Mahsulot Qidiruv Statistikasi
                    </h3>
                  </div>
                </div>

                {/* MOBIL EKRAN UCHUN: 14 ta viloyat qidiruv statistikasi ixcham karta shaklida */}
                <div className="sm:hidden space-y-2">
                  {regionalSearchStats.map((regStat, idx) => {
                    const hasRegUnacknowledgedProblem = regStat.topTerms.some((tItem) => {
                      const k = requestProblemsState.termKeyLookup.get(tItem.term.toLowerCase().trim());
                      return Boolean(
                        k &&
                          requestProblemsState.activeKeys.includes(k) &&
                          !acknowledgedProblemKeys.includes(k)
                      );
                    });
                    return (
                      <div
                        key={regStat.key}
                        onClick={() => handleAcknowledgeRequestProblem(regStat.key)}
                        className={`p-2.5 rounded-xl bg-[#071326] border space-y-2 ${
                          hasRegUnacknowledgedProblem ? 'border-rose-500/80' : 'border-[#1E3A6D]'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="w-5 h-5 rounded-md bg-amber-500/20 text-[#FFB800] border border-[#FFB800]/50 font-mono font-black text-[10px] flex items-center justify-center shrink-0">
                              {idx + 1}
                            </span>
                            <span className="font-black text-white text-xs truncate">
                              {regStat.key}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0 font-mono">
                            <span
                              className={`px-2 py-0.5 rounded-lg text-[10px] font-black ${
                                regStat.totalRequests > 0
                                  ? 'bg-[#FFB800] text-[#0A1931]'
                                  : 'bg-[#0A1931] text-sky-300/60 border border-[#1E3A6D]'
                              }`}
                            >
                              {regStat.totalRequests} ta so‘rov
                            </span>
                            {regStat.totalRequests > 0 && (
                              <span
                                className={`px-2 py-0.5 rounded-lg text-[10px] font-black border ${
                                  regStat.totalMatchedInRegion > 0
                                    ? 'bg-emerald-500/20 text-emerald-400 border-emerald-400/50'
                                    : 'bg-rose-500/20 text-rose-300 border-rose-400/50'
                                }`}
                              >
                                {regStat.totalMatchedInRegion > 0
                                  ? `Bor (${regStat.totalMatchedInRegion} ta)`
                                  : 'Mahsulot yo‘q'}
                              </span>
                            )}
                          </div>
                        </div>

                        {regStat.topTerms.length > 0 ? (
                          <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-[#1E3A6D]/70">
                            {regStat.topTerms.slice(0, 19).map((tItem, tIdx) => (
                              <span
                                key={`${regStat.key}-m-term-${tIdx}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleAcknowledgeRequestProblem(tItem.term);
                                }}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-[#0A1931] border border-[#1E3A6D] text-[10px] font-mono"
                              >
                                <span className="w-4 h-4 rounded bg-[#FFB800] text-[#0A1931] font-black text-[9px] flex items-center justify-center">
                                  {tIdx + 1}
                                </span>
                                <strong className="text-white font-black">{tItem.term}</strong>
                                <span className="text-amber-300 font-bold">({tItem.count} ta)</span>
                                <span
                                  className={`px-1.5 py-0.2 rounded text-[9px] font-black ${
                                    tItem.matchedCount > 0
                                      ? 'bg-emerald-500/25 text-emerald-400'
                                      : 'bg-rose-500/25 text-rose-300'
                                  }`}
                                >
                                  {tItem.matchedCount > 0 ? `${tItem.matchedCount} natija` : '0 natija'}
                                </span>
                              </span>
                            ))}
                          </div>
                        ) : (
                          <div className="text-[10px] text-sky-300/60">
                            Hozircha so‘rovlar ro‘yxati bo‘sh
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* KOMPYUTER EKRANI UCHUN JADVAL */}
                <div className="hidden sm:block overflow-x-auto rounded-2xl border-2 border-[#1E3A6D]">
                  <table className="w-full text-left text-xs text-[#F5F5F2] border-collapse">
                    <thead className="bg-[#071326] text-amber-400 uppercase text-[11px] tracking-wider border-b-2 border-[#1E3A6D]">
                      <tr className="divide-x divide-[#1E3A6D]">
                        <th className="py-3.5 px-3 font-black text-center w-12">№</th>
                        <th className="py-3.5 px-4 font-black w-52">Viloyat / Hudud</th>
                        <th className="py-3.5 px-4 font-black text-center w-40">Jami Qidiruv So‘rovlari</th>
                        <th className="py-3.5 px-4 font-black text-center w-56">
                          So‘rov Natijasi (Mahsulot Turi Bor / Yo‘qligi)
                        </th>
                        <th className="py-3.5 px-4 font-black">
                          So‘rovlar Ro‘yxati (Natijalar Bo‘yicha Ketma-ketlikda)
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y-2 divide-[#1E3A6D] bg-[#0A1931]">
                      {regionalSearchStats.map((regStat, idx) => {
                        const hasRegUnacknowledgedProblem = regStat.topTerms.some((tItem) => {
                          const k = requestProblemsState.termKeyLookup.get(tItem.term.toLowerCase().trim());
                          return Boolean(
                            k &&
                              requestProblemsState.activeKeys.includes(k) &&
                              !acknowledgedProblemKeys.includes(k)
                          );
                        });
                        return (
                          <tr
                            key={regStat.key}
                            onClick={() => handleAcknowledgeRequestProblem(regStat.key)}
                            className={`hover:bg-[#132C54] transition-colors divide-x divide-[#1E3A6D] cursor-pointer ${
                              hasRegUnacknowledgedProblem ? 'bg-rose-950/20' : ''
                            }`}
                          >
                            <td className="py-3.5 px-3 text-center font-mono font-black text-amber-400">
                              {idx + 1}
                            </td>
                            <td className="py-3.5 px-4 font-black text-white text-xs sm:text-sm">
                              <div className="flex items-center gap-2">
                                <MapPin className="w-4 h-4 text-[#FFB800] shrink-0" />
                                <span>{regStat.key}</span>
                              </div>
                            </td>
                            <td className="py-3.5 px-4 text-center font-mono font-black">
                              <span
                                className={`px-3 py-1 rounded-xl text-xs inline-block ${
                                  regStat.totalRequests > 0
                                    ? 'bg-[#FFB800] text-[#0A1931]'
                                    : 'bg-[#071326] text-sky-300/60 border border-[#1E3A6D]'
                                }`}
                              >
                                {regStat.totalRequests} ta so‘rov
                              </span>
                            </td>
                            <td className="py-3.5 px-4 text-center font-mono">
                              {regStat.totalRequests === 0 ? (
                                <span className="text-[11px] text-sky-300/60">
                                  0 ta natija
                                </span>
                              ) : regStat.totalMatchedInRegion > 0 ? (
                                <div className="inline-flex flex-col items-center gap-0.5 px-3 py-1 rounded-xl bg-emerald-500/20 border border-emerald-400/50">
                                  <span className="text-emerald-400 font-black text-xs">
                                    Mahsulot bor ({regStat.totalMatchedInRegion} ta natija)
                                  </span>
                                  <span className="text-[10px] text-emerald-200">
                                    {regStat.termsWithProductCount} ta so‘rovda mahsulot chiqdi
                                  </span>
                                </div>
                              ) : (
                                <div
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleAcknowledgeRequestProblem(regStat.key);
                                  }}
                                  className={`inline-flex flex-col items-center gap-0.5 px-3 py-1 rounded-xl border cursor-pointer ${
                                    hasRegUnacknowledgedProblem
                                      ? 'bg-rose-600/35 border-rose-400 shadow-[0_0_14px_rgba(244,63,94,0.5)] animate-pulse'
                                      : 'bg-rose-500/20 border-rose-400/40'
                                  }`}
                                >
                                  <span className="text-rose-300 font-black text-xs">
                                    Mahsulot yo‘q (0 ta natija)
                                  </span>
                                  <span className="text-[10px] text-rose-200/80">
                                    Platformada topilmadi
                                  </span>
                                </div>
                              )}
                            </td>
                            <td className="py-3.5 px-4">
                              {regStat.topTerms.length > 0 ? (
                                <div className="flex flex-wrap items-center gap-2">
                                  {regStat.topTerms.slice(0, 19).map((tItem, tIdx) => {
                                    const tCleanKey = tItem.term.toLowerCase().trim();
                                    const tProbKey = requestProblemsState.termKeyLookup.get(tCleanKey);
                                    const isTermUnack = Boolean(
                                      tProbKey &&
                                        requestProblemsState.activeKeys.includes(tProbKey) &&
                                        !acknowledgedProblemKeys.includes(tProbKey)
                                    );
                                    return (
                                      <span
                                        key={`${regStat.key}-term-${tIdx}`}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleAcknowledgeRequestProblem(tItem.term);
                                        }}
                                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#071326] border text-xs cursor-pointer transition-all ${
                                          isTermUnack
                                            ? 'border-rose-400 shadow-[0_0_12px_rgba(244,63,94,0.45)] animate-pulse'
                                            : 'border-[#1E3A6D]'
                                        }`}
                                      >
                                        <span className="w-4 h-4 rounded bg-[#FFB800] text-[#0A1931] font-mono font-black text-[10px] flex items-center justify-center">
                                          {tIdx + 1}
                                        </span>
                                        <strong className="text-white font-black">{tItem.term}</strong>
                                        <span className="px-2 py-0.5 rounded-md bg-red-600/30 text-amber-300 font-mono font-black text-[11px]">
                                          {tItem.count} ta so‘rov
                                        </span>
                                        <span
                                          className={`px-2 py-0.5 rounded-md font-mono font-black text-[10px] ${
                                            tItem.matchedCount > 0
                                              ? 'bg-emerald-500/25 text-emerald-400 border border-emerald-400/40'
                                              : 'bg-rose-500/25 text-rose-300 border border-rose-400/40'
                                          }`}
                                        >
                                          {tItem.matchedCount > 0
                                            ? `${tItem.matchedCount} ta natija`
                                            : '0 ta natija'}
                                        </span>
                                      </span>
                                    );
                                  })}
                                </div>
                              ) : (
                                <span className="text-[11px] text-sky-300/60 font-medium">
                                  Hozircha so‘rovlar ro‘yxati bo‘sh
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          );
        })()}

        {/* =========================================================================
            SECTION 5: KABINET LOGLARI (Sozlamalar ichidan Parol bilan kiriladi!)
            ========================================================================= */}
        {activeSection === 'logs' && (
          <div className="space-y-3 sm:space-y-4 mt-2.5 sm:mt-0 animate-fadeIn">
            {/* Header for Kabinet Loglari */}
            <div className="bg-[#0A1931] border-2 border-[#FFB800] rounded-xl sm:rounded-2xl p-2.5 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-3 shadow-xl">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="w-8 h-8 sm:w-11 sm:h-11 rounded-lg sm:rounded-xl bg-[#FFB800] text-[#0A1931] flex items-center justify-center shrink-0 shadow-md">
                  <Activity className="w-4 h-4 sm:w-5 sm:h-5 stroke-[2.5]" />
                </div>
                <div>
                  <h2 className="text-xs sm:text-xl font-black text-white">
                    Kabinet Loglari
                  </h2>
                  <p className="text-[10px] sm:text-xs text-sky-200">
                    Sozlamalar orqali parol bilan tasdiqlangan maxfiy kabinet loglari ({logs.length} ta qayd)
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveSection('reports')}
                className="px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg sm:rounded-xl bg-[#071326] hover:bg-[#0F2547] text-[#FFB800] border border-[#FFB800]/60 font-bold text-[11px] sm:text-xs flex items-center gap-1.5 sm:gap-2 cursor-pointer self-start sm:self-auto"
              >
                <ArrowLeft className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                <span>Asosiy bo‘limga qaytish</span>
              </button>
            </div>
            
            {/* Filter Logs */}
            <div className="bg-[#0A1931] border-2 border-[#1E3A6D] rounded-xl sm:rounded-2xl p-2.5 sm:p-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 sm:gap-3 shadow-lg">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-400" />
                <input
                  type="text"
                  placeholder="Qidiruv"
                  value={logSearch}
                  onChange={(e) => setLogSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 sm:py-2.5 bg-[#071326] border border-[#1E3A6D] rounded-xl text-white text-xs placeholder-sky-300/60 focus:outline-none focus:border-[#FFB800]"
                />
              </div>

              <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                <span className="text-xs text-sky-200 font-semibold hidden sm:inline">Yo‘nalish:</span>
                <select
                  value={logCategoryFilter}
                  onChange={(e) => setLogCategoryFilter(e.target.value)}
                  className="flex-1 sm:flex-none px-2.5 sm:px-3 py-1.5 sm:py-2 bg-[#071326] border border-[#1E3A6D] rounded-xl text-[11px] sm:text-xs text-white focus:outline-none focus:border-[#FFB800] cursor-pointer"
                >
                  <option value="all">Barcha yo‘nalishlar</option>
                  <option value="add_cabinet">🟢 Kabinet qo‘shildi</option>
                  <option value="edit_cabinet">🟡 Tahrirlash</option>
                  <option value="delete_cabinet">🔴 O‘chirishlar</option>
                  <option value="auth_access">🔵 Kirish / Chiqish</option>
                  <option value="emergency_pass">🟣 1 Martalik Parol</option>
                  <option value="orders_sales">🟣 Sotuv / Buyurtmalar</option>
                </select>

                <button
                  type="button"
                  onClick={() => {
                    addLog('Loglar ro‘yxati yangilandi', 'system', 'Tizim loglari ro‘yxati qayta yuklandi.', 'info');
                  }}
                  className="p-2 rounded-xl bg-[#071326] hover:bg-[#0F2547] text-sky-200 hover:text-white cursor-pointer border border-[#1E3A6D]"
                  title="Yangilash"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>

                {logs.length > 0 && (
                  <button
                    type="button"
                    onClick={handleClearAllLogs}
                    className="p-2 rounded-xl bg-[#071326] hover:bg-rose-500/20 text-rose-300 hover:text-rose-200 cursor-pointer border border-rose-500/30 transition-all"
                    title="Barcha loglarni tozalash"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            {/* Ranglar qo'llanmasi (Legend) */}
            <div className="bg-[#0A1931] border border-[#1E3A6D] rounded-xl p-2 sm:p-3 flex flex-wrap items-center gap-1.5 sm:gap-2 text-xs shadow-lg">
              <span className="text-[10px] sm:text-[11px] text-sky-200 font-bold uppercase tracking-wider mr-1">Yo‘nalish ranglari:</span>
              <span className="px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold text-[10px] sm:text-[11px]">
                🟢 Kabinet Qo‘shish
              </span>
              <span className="px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-lg bg-amber-500/20 text-amber-300 border border-[#FFB800]/50 font-bold text-[10px] sm:text-[11px]">
                🟡 Tahrirlash
              </span>
              <span className="px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-lg bg-rose-500/20 text-rose-300 border border-rose-500/40 font-bold text-[10px] sm:text-[11px]">
                🔴 O‘chirishlar
              </span>
              <span className="px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-lg bg-sky-500/20 text-sky-300 border border-sky-500/40 font-bold text-[10px] sm:text-[11px]">
                🔵 Kirish / Chiqish
              </span>
              <span className="px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-lg bg-purple-500/20 text-purple-300 border border-purple-500/40 font-bold text-[10px] sm:text-[11px]">
                🟣 1 Martalik Parol
              </span>
            </div>

            {/* Logs List: Log nomi, Kabinet logini va vaqti ko'rsatiladi */}
            <div className="bg-[#0A1931] border-2 border-[#1E3A6D] rounded-xl p-3 sm:p-5 shadow-xl divide-y divide-blue-500/20">
              {filteredLogs.map((logItem) => {
                const meta = getLogCategoryMeta(logItem.category);
                // Extract cabinet login from details or actor
                const detailLoginMatch =
                  (logItem.details || '').match(/Login:\s*([^,)\s•]+)/i) ||
                  (logItem.details || '').match(/«([^»]+)»\s*logini/i) ||
                  (logItem.actor || '').match(/\((?:Login:\s*)?([^)]+)\)/i);
                const extractedLogin = detailLoginMatch && detailLoginMatch[1]
                  ? detailLoginMatch[1].trim()
                  : logItem.actor
                  ? logItem.actor.replace(/\s*\(Bosh Admin\)/i, '').trim()
                  : '';

                return (
                  <div key={logItem.id} className="py-2.5 sm:py-3.5 first:pt-0 last:pb-0 space-y-1">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 sm:gap-2">
                      <div className="flex items-center flex-wrap gap-1.5 sm:gap-2.5">
                        <span className={`w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full shrink-0 ${meta.dot} shadow-lg`}></span>
                        <span className="font-black text-white text-xs sm:text-sm">
                          {logItem.action}
                        </span>
                        {extractedLogin && (
                          <span className="px-2 py-0.5 rounded-lg bg-[#071326] border border-[#FFB800]/60 text-[#FFB800] font-mono font-black text-[10px] sm:text-xs">
                            Kabinet logini: {extractedLogin}
                          </span>
                        )}
                      </div>

                      {/* Vaqti bilan: Aniq soat va sana */}
                      <div className="shrink-0 text-right text-[10px] sm:text-[11px] font-mono text-[#B8B8B3] flex items-center gap-2">
                        <div className="flex items-center gap-1 text-amber-400 font-bold">
                          <Clock className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                          <span>{new Date(logItem.timestamp).toLocaleTimeString('uz-UZ')}</span>
                        </div>
                        <span className="text-[10px] sm:text-[11px] text-[#B8B8B3]">
                          {new Date(logItem.timestamp).toLocaleDateString('uz-UZ')}
                        </span>
                      </div>
                    </div>

                    {logItem.details && (
                      <div className="pl-4 sm:pl-5 text-[11px] sm:text-xs text-sky-200/90 leading-relaxed">
                        {logItem.details}
                      </div>
                    )}
                  </div>
                );
              })}

              {filteredLogs.length === 0 && (
                <div className="text-center py-8 sm:py-12 text-[#B8B8B3] text-xs">
                  Qidiruv bo‘yicha log qaydlari topilmadi.
                </div>
              )}
            </div>

          </div>
        )}

        {/* =========================================================================
            SECTION: B2B CRM VA B2C CRM (Qo'shilgan Adminlarda Huquqlarga berilganda ishlaydi)
            ========================================================================= */}
        {(activeSection === 'b2b_crm' || activeSection === 'b2c_crm') && (() => {
          const isB2BMode = activeSection === 'b2b_crm';
          const targetSuppliers = suppliers.filter((s) =>
            isB2BMode ? s.cabinetType === 'manufacturer' : (s.cabinetType || 'partner') === 'partner'
          );
          const targetProducts = adminProducts.filter((p: any) => {
            if (isB2BMode) return p.supplierCabinetType === 'manufacturer';
            return p.supplierCabinetType !== 'manufacturer';
          });
          const outOfStockProducts = targetProducts.filter((p: any) => (Number(p.stock) || 0) <= 0);

          let allSavedOrders: any[] = [];
          try {
            const rawOrd = localStorage.getItem('bunkerstroy_orders');
            allSavedOrders = rawOrd ? JSON.parse(rawOrd) : [];
          } catch {}
          const crmOfflineOrders = Array.isArray(allSavedOrders)
            ? allSavedOrders.filter((o) => o && o.orderChannel === 'offline')
            : [];

          return (
            <div className="space-y-3 sm:space-y-6 mt-2.5 sm:mt-0 animate-fadeIn">
              <div className="bg-[#0A1931] border-2 border-[#FFB800] rounded-xl sm:rounded-2xl p-2.5 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-4 shadow-xl">
                <div className="flex items-center gap-2 sm:gap-3.5">
                  <div className="w-9 h-9 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-[#071326] border border-[#FFB800] text-[#FFB800] flex items-center justify-center shrink-0">
                    {isB2BMode ? <Building className="w-4 h-4 sm:w-6 sm:h-6" /> : <Package className="w-4 h-4 sm:w-6 sm:h-6" />}
                  </div>
                  <div>
                    <h2 className="text-xs sm:text-xl font-black text-white">
                      {isB2BMode ? "B2B CRM — Ishlab Chiqaruvchilar CRM va Ombor Boshqaruvi" : "B2C CRM — Hamkor Ta'minotchilar CRM va Ombor Boshqaruvi"}
                    </h2>
                    <p className="text-[10px] sm:text-xs text-sky-200 hidden sm:block">
                      {isB2BMode
                        ? "B2B ta'minotchilar mahsulotlari, ombor qoldig‘i, CRM savdolari va B2B so‘rovlari monitoringi"
                        : "B2C ta'minotchilar mahsulotlari, asl (keltirilgan) narxi, sotuv narxi, foyda va ombor holati monitoringi"}
                    </p>
                  </div>
                </div>
              </div>

              {/* KPI Qatorlari */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4">
                <div className="p-2.5 sm:p-4 rounded-xl sm:rounded-2xl bg-[#0A1931] border border-[#1E3A6D]">
                  <span className="text-[10px] sm:text-[11px] text-sky-300 font-bold uppercase block">
                    {isB2BMode ? 'B2B Ta’minotchilar' : 'B2C Ta’minotchilar'}
                  </span>
                  <span className="text-base sm:text-2xl font-black text-white font-mono mt-0.5 sm:mt-1 block">
                    {targetSuppliers.length} ta
                  </span>
                </div>
                <div className="p-2.5 sm:p-4 rounded-xl sm:rounded-2xl bg-[#0A1931] border border-[#1E3A6D]">
                  <span className="text-[10px] sm:text-[11px] text-amber-300 font-bold uppercase block">
                    Jami Mahsulotlar
                  </span>
                  <span className="text-base sm:text-2xl font-black text-[#FFB800] font-mono mt-0.5 sm:mt-1 block">
                    {targetProducts.length} xil
                  </span>
                </div>
                <div className="p-2.5 sm:p-4 rounded-xl sm:rounded-2xl bg-[#0A1931] border border-[#1E3A6D]">
                  <span className="text-[10px] sm:text-[11px] text-rose-300 font-bold uppercase block">
                    Vaqtincha Tugagan
                  </span>
                  <span className="text-base sm:text-2xl font-black text-rose-400 font-mono mt-0.5 sm:mt-1 block">
                    {outOfStockProducts.length} xil
                  </span>
                </div>
                <div className="p-2.5 sm:p-4 rounded-xl sm:rounded-2xl bg-[#0A1931] border border-[#1E3A6D]">
                  <span className="text-[10px] sm:text-[11px] text-emerald-300 font-bold uppercase block">
                    {isB2BMode ? 'B2B So‘rovlar / CRM' : 'CRM Savdolar'}
                  </span>
                  <span className="text-base sm:text-2xl font-black text-emerald-400 font-mono mt-0.5 sm:mt-1 block">
                    {isB2BMode ? b2bOrders.length + crmOfflineOrders.length : crmOfflineOrders.length} ta
                  </span>
                </div>
              </div>

              {/* Mahsulotlar, Asl narx, Sotuv narx, Foyda va Ombor jadvali */}
              <div className="bg-[#0A1931] border-2 border-[#1E3A6D] rounded-xl sm:rounded-2xl p-2.5 sm:p-5 space-y-2.5 sm:space-y-4 shadow-xl">
                <h3 className="text-xs sm:text-base font-black text-[#FFB800] uppercase tracking-wider flex items-center gap-2">
                  <Package className="w-4 h-4 shrink-0" />
                  <span>
                    {isB2BMode ? 'B2B CRM Mahsulotlar va Ombor Ro‘yxati' : 'B2C CRM Mahsulotlar, Asl Narx, Foyda va Ombor Ro‘yxati'} ({targetProducts.length})
                  </span>
                </h3>

                <div className="overflow-x-auto rounded-xl border border-[#1E3A6D]">
                  <table className="w-full text-left text-xs text-white border-collapse">
                    <thead className="bg-[#071326] text-[#FFB800] uppercase text-[11px] border-b border-[#1E3A6D]">
                      <tr>
                        <th className="py-3 px-3">№</th>
                        <th className="py-3 px-4">Mahsulot</th>
                        <th className="py-3 px-4">Ta'minotchi</th>
                        <th className="py-3 px-4">Asl (Keltirilgan) Narx</th>
                        <th className="py-3 px-4">Sotuv Narxi</th>
                        <th className="py-3 px-4">1 birlik Foydasi</th>
                        <th className="py-3 px-4">Ombor Holati</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#1E3A6D] bg-[#071533]">
                      {targetProducts.map((prod: any, idx: number) => {
                        const costVal = Number(prod.costPrice || prod.originalPrice || 0);
                        const saleVal = Number(prod.price || 0);
                        const profitVal = Math.max(0, saleVal - costVal);
                        const stockVal = Number(prod.stock || 0);
                        return (
                          <tr key={prod.id || idx} className="hover:bg-[#0c265e]">
                            <td className="py-3 px-3 font-mono font-bold text-amber-400">{idx + 1}</td>
                            <td className="py-3 px-4 font-black text-white">
                              {prod.title}
                              <span className="block text-[10px] text-sky-300 font-normal">
                                {prod.category} • {prod.saleChannel === 'offline' ? 'CRM' : 'Onlayn'}
                              </span>
                            </td>
                            <td className="py-3 px-4 font-bold text-sky-200">{prod.supplierName || '—'}</td>
                            <td className="py-3 px-4 font-mono text-slate-300">
                              {costVal > 0 ? formatPriceSum(costVal) : '—'}
                            </td>
                            <td className="py-3 px-4 font-mono font-black text-[#FFB800]">
                              {formatPriceSum(saleVal)} / {prod.unit}
                            </td>
                            <td className="py-3 px-4 font-mono font-black text-emerald-400">
                              {costVal > 0 ? `+${formatPriceSum(profitVal)}` : '—'}
                            </td>
                            <td className="py-3 px-4">
                              {stockVal > 0 ? (
                                <span className="px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-mono font-bold text-[11px]">
                                  Omborda: {stockVal} {prod.unit}
                                </span>
                              ) : (
                                <span className="px-2.5 py-1 rounded-lg bg-red-600/25 text-red-300 border border-red-500/50 font-mono font-black text-[11px]">
                                  Vaqtincha tugagan (0 {prod.unit})
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                      {targetProducts.length === 0 && (
                        <tr>
                          <td colSpan={7} className="py-8 text-center text-sky-200">
                            Hozircha mahsulotlar mavjud emas.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          );
        })()}

        {/* =========================================================================
            SECTION: XAVFSIZLIK SO'ROVI (5 MARTA XATO PAROL -> 25 DAQIQA BLOKLANGANLAR)
            ========================================================================= */}
        {activeSection === 'security_requests' && (
          <div className="space-y-3 sm:space-y-6 mt-2.5 sm:mt-0 animate-fadeIn">
            <div className="bg-[#0A1931] border-2 border-[#1E3A6D] rounded-xl sm:rounded-3xl p-2.5 sm:p-6 shadow-2xl space-y-3 sm:space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-4 pb-2.5 sm:pb-4 border-b border-[#1E3A6D]">
                <div className="flex items-center gap-2 sm:gap-3">
                  <div className="w-9 h-9 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-red-600/20 border-2 border-red-500 flex items-center justify-center text-red-400 shrink-0">
                    <ShieldAlert className="w-4 h-4 sm:w-6 sm:h-6" />
                  </div>
                  <div>
                    <h2 className="text-xs sm:text-xl font-black text-white flex items-center gap-2">
                      <span>Xavfsizlik So‘rovi</span>
                      <span className="px-2 sm:px-2.5 py-0.5 rounded-full text-[10px] sm:text-xs font-mono bg-red-500/20 text-red-300 border border-red-500/40">
                        {blockedOrFlaggedSecurityRequests.length} ta
                      </span>
                    </h2>
                    <p className="text-[10px] sm:text-xs text-sky-200 mt-0.5">
                      5 marta parol xato kiritilganda 25 daqiqaga bloklangan loginlar, xato parollar ketma-ketligi va 1 martalik parol berish bo‘limi
                    </p>
                  </div>
                </div>
              </div>

              {blockedOrFlaggedSecurityRequests.length === 0 ? (
                <div className="p-10 rounded-2xl bg-[#071326] border border-[#1E3A6D] text-center space-y-2">
                  <ShieldCheck className="w-10 h-10 text-emerald-400 mx-auto" />
                  <div className="text-sm font-black text-white">
                    Hozircha bloklangan loginlar yoki xavfsizlik so‘rovlari yo‘q
                  </div>
                  <p className="text-xs text-sky-200/80">
                    Foydalanuvchi parolni 5 marta xato kiritsa, uning logini va IP manzili 25 daqiqaga bloklanadi hamda shu yerda ko‘rinadi.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {blockedOrFlaggedSecurityRequests.map((reqItem) => {
                    const isContactOpen = selectedSecurityRequestId === reqItem.id;
                    const remSeconds =
                      reqItem.isBlocked && reqItem.blockedUntil && reqItem.blockedUntil > secNowMs
                        ? Math.max(1, Math.ceil((reqItem.blockedUntil - secNowMs) / 1000))
                        : 0;
                    const remMin = Math.floor(remSeconds / 60);
                    const remSec = remSeconds % 60;
                    const timerText = `${String(remMin).padStart(2, '0')}:${String(remSec).padStart(2, '0')}`;
                    const otpVal =
                      oneTimePassInputMap[reqItem.id] !== undefined
                        ? oneTimePassInputMap[reqItem.id]
                        : reqItem.oneTimePassword || '';

                    return (
                      <div
                        key={reqItem.id}
                        className={`rounded-2xl border-2 p-4 sm:p-5 transition-all space-y-4 ${
                          !reqItem.acknowledgedByAdmin
                            ? 'bg-red-950/35 border-red-500 shadow-[0_0_20px_rgba(239,68,68,0.3)]'
                            : reqItem.isBlocked
                            ? 'bg-[#071326] border-amber-500/60'
                            : 'bg-[#071326] border-[#1E3A6D]'
                        }`}
                      >
                        {/* Top summary row */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div className="space-y-1">
                            <div className="flex items-center flex-wrap gap-2">
                              <span
                                className={`px-2.5 py-0.5 rounded-lg text-[10px] font-black uppercase border ${
                                  reqItem.cabinetType === 'B2B'
                                    ? 'bg-amber-500/20 text-[#FFB800] border-[#FFB800]/50'
                                    : reqItem.cabinetType === 'B2C'
                                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400/50'
                                    : reqItem.cabinetType === 'Mijoz'
                                    ? 'bg-sky-500/20 text-sky-300 border-sky-400/50'
                                    : 'bg-purple-500/20 text-purple-300 border-purple-400/50'
                                }`}
                              >
                                {reqItem.cabinetType} Kabinet
                              </span>
                              <span className="text-sm sm:text-base font-black text-white">
                                {reqItem.cabinetName}
                              </span>
                              <span className="px-2.5 py-0.5 rounded-lg bg-[#0A1931] border border-[#1E3A6D] font-mono text-xs font-bold text-[#FFB800]">
                                Login: {reqItem.login}
                              </span>
                            </div>

                            <div className="flex items-center flex-wrap gap-3 text-xs text-sky-200 font-mono">
                              <span>IP: {reqItem.ip}</span>
                              <span>•</span>
                              <span>
                                Xato urinishlar: <strong className="text-red-400">{reqItem.failedAttempts?.length || reqItem.attemptsCount} marta</strong>
                              </span>
                              {remSeconds > 0 ? (
                                <>
                                  <span>•</span>
                                  <span className="px-2 py-0.5 rounded-md bg-red-600/30 border border-red-500 text-red-200 font-black">
                                    25 daqiqalik blok: {timerText}
                                  </span>
                                </>
                              ) : reqItem.oneTimePassword ? (
                                <>
                                  <span>•</span>
                                  <span className="px-2 py-0.5 rounded-md bg-emerald-600/30 border border-emerald-500 text-emerald-200 font-black">
                                    1 martalik parol berilgan: {reqItem.oneTimePassword}
                                  </span>
                                </>
                              ) : null}
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              type="button"
                              onClick={() => {
                                acknowledgeSecurityRequest(reqItem.id);
                                setSecurityRequests(getSecurityBlockRequests());
                                setSelectedSecurityRequestId(isContactOpen ? null : reqItem.id);
                              }}
                              className={`px-4 py-2.5 rounded-xl font-black text-xs transition-all cursor-pointer flex items-center justify-center gap-2 border shrink-0 ${
                                isContactOpen
                                  ? 'bg-[#FFB800] text-[#0A1931] border-[#FFC928] shadow-lg'
                                  : !reqItem.acknowledgedByAdmin
                                  ? 'bg-red-600 hover:bg-red-500 text-white border-amber-300 animate-pulse shadow-lg'
                                  : 'bg-[#FFB800] hover:bg-amber-400 text-[#0A1931] border-[#FFC928]'
                              }`}
                            >
                              <Phone className="w-4 h-4" />
                              <span>Kabinet bilan bog‘lanish</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                removeSecurityBlockRequest(reqItem.id);
                                setSecurityRequests(getSecurityBlockRequests());
                                if (selectedSecurityRequestId === reqItem.id) {
                                  setSelectedSecurityRequestId(null);
                                }
                              }}
                              title="Xavfsizlik so‘rovini o‘chirish va logga saqlash"
                              className="w-10 h-10 rounded-xl bg-red-600/20 hover:bg-red-600 text-red-300 hover:text-white border border-red-500/50 flex items-center justify-center transition-all cursor-pointer shrink-0"
                            >
                              <X className="w-4 h-4 stroke-[2.5]" />
                            </button>
                          </div>
                        </div>

                        {/* Kabinet bilan bog'lanish bosilganda ochiladigan to'liq ma'lumotlar oynasi */}
                        {isContactOpen && (
                          <div className="pt-4 border-t border-[#1E3A6D] space-y-4 animate-fadeIn">
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                              {/* 1. Kabinet haqida ma'lumot hamda Login va Parol */}
                              <div className="p-4 rounded-2xl bg-[#0A1931] border border-[#1E3A6D] space-y-3">
                                <div className="flex items-center justify-between border-b border-[#1E3A6D] pb-2">
                                  <span className="text-xs font-black text-[#FFB800] uppercase tracking-wider flex items-center gap-1.5">
                                    <Building className="w-4 h-4" />
                                    <span>Kabinet Haqida Ma'lumot va Login-Paroli</span>
                                  </span>
                                  {reqItem.phone && reqItem.phone !== '—' && (
                                    <a
                                      href={`tel:${reqItem.phone.replace(/\s+/g, '')}`}
                                      className="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-black text-[11px] flex items-center gap-1.5"
                                    >
                                      <Phone className="w-3 h-3" />
                                      <span>Qo‘ng‘iroq: {reqItem.phone}</span>
                                    </a>
                                  )}
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                                  <div className="p-2.5 rounded-xl bg-[#071326] border border-[#1E3A6D]">
                                    <span className="text-sky-300/80 block text-[10px]">Kabinet Nomi:</span>
                                    <span className="font-black text-white">{reqItem.cabinetName}</span>
                                  </div>
                                  <div className="p-2.5 rounded-xl bg-[#071326] border border-[#1E3A6D]">
                                    <span className="text-sky-300/80 block text-[10px]">Telefon Raqami:</span>
                                    <span className="font-mono font-black text-emerald-300">{reqItem.phone || '—'}</span>
                                  </div>
                                  {reqItem.inn && (
                                    <div className="p-2.5 rounded-xl bg-[#071326] border border-[#1E3A6D]">
                                      <span className="text-sky-300/80 block text-[10px]">STIR (INN):</span>
                                      <span className="font-mono font-black text-white">{reqItem.inn}</span>
                                    </div>
                                  )}
                                  {reqItem.region && (
                                    <div className="p-2.5 rounded-xl bg-[#071326] border border-[#1E3A6D]">
                                      <span className="text-sky-300/80 block text-[10px]">Hudud:</span>
                                      <span className="font-bold text-white">
                                        {reqItem.region} {reqItem.district ? `(${reqItem.district})` : ''}
                                      </span>
                                    </div>
                                  )}
                                </div>

                                {/* Kabinet Logini va Paroli */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                                  <div className="p-3 rounded-xl bg-[#071326] border-2 border-[#FFB800]/50 space-y-1">
                                    <div className="flex items-center justify-between text-[11px] text-sky-200">
                                      <span className="font-bold">Kabinet Logini:</span>
                                      <button
                                        type="button"
                                        onClick={() => navigator.clipboard.writeText(reqItem.login)}
                                        className="text-[#FFB800] hover:underline font-bold cursor-pointer"
                                      >
                                        Nusxa
                                      </button>
                                    </div>
                                    <div className="font-mono font-black text-sm text-white select-all">
                                      {reqItem.login}
                                    </div>
                                  </div>

                                  <div className="p-3 rounded-xl bg-[#071326] border-2 border-emerald-500/50 space-y-1">
                                    <div className="flex items-center justify-between text-[11px] text-sky-200">
                                      <span className="font-bold">Kabinet Paroli:</span>
                                      <button
                                        type="button"
                                        onClick={() => navigator.clipboard.writeText(reqItem.currentPassword)}
                                        className="text-emerald-400 hover:underline font-bold cursor-pointer"
                                      >
                                        Nusxa
                                      </button>
                                    </div>
                                    <div className="font-mono font-black text-sm text-emerald-300 select-all">
                                      {reqItem.currentPassword}
                                    </div>
                                  </div>
                                </div>

                                {/* Bir martalik parol kiritish imkoni */}
                                <div className="p-3.5 rounded-xl bg-purple-950/40 border border-purple-400/50 space-y-2.5">
                                  <div className="flex items-center justify-between">
                                    <label className="text-xs font-black text-purple-200 flex items-center gap-1.5">
                                      <KeyRound className="w-4 h-4 text-[#FFB800]" />
                                      <span>Bir Martalik Parol Kiritish:</span>
                                    </label>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const gen = `BS-${Math.floor(100000 + Math.random() * 900000)}`;
                                        setOneTimePassInputMap((prev) => ({ ...prev, [reqItem.id]: gen }));
                                      }}
                                      className="text-[11px] font-bold text-[#FFB800] hover:underline cursor-pointer"
                                    >
                                      Avto-generatsiya
                                    </button>
                                  </div>

                                  <div className="flex flex-col sm:flex-row gap-2">
                                    <input
                                      type="text"
                                      value={otpVal}
                                      onChange={(e) =>
                                        setOneTimePassInputMap((prev) => ({
                                          ...prev,
                                          [reqItem.id]: e.target.value,
                                        }))
                                      }
                                      placeholder="Bir martalik parolni kiriting"
                                      className="flex-1 px-3.5 py-2.5 rounded-xl bg-[#071326] border border-purple-400/50 text-white font-mono font-bold text-xs focus:outline-none focus:border-[#FFB800]"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const cleanVal = (otpVal || '').trim();
                                        if (!cleanVal) return;
                                        assignOneTimePasswordToCabinet(reqItem.id, cleanVal);
                                        setSecurityRequests(getSecurityBlockRequests());
                                        setOneTimePassSavedNotice((prev) => ({
                                          ...prev,
                                          [reqItem.id]: `«${cleanVal}» bir martalik parol saqlandi va blok ochildi!`,
                                        }));
                                      }}
                                      className="px-4 py-2.5 rounded-xl bg-[#FFB800] hover:bg-amber-400 text-[#0A1931] font-black text-xs cursor-pointer shrink-0 flex items-center justify-center gap-1.5"
                                    >
                                      <Check className="w-4 h-4 stroke-[3]" />
                                      <span>Saqlash</span>
                                    </button>
                                  </div>

                                  {oneTimePassSavedNotice[reqItem.id] && (
                                    <div className="text-[11px] font-bold text-emerald-300 flex items-center gap-1.5">
                                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                                      <span>{oneTimePassSavedNotice[reqItem.id]}</span>
                                    </div>
                                  )}
                                </div>
                              </div>

                              {/* 2. Xato urinishlardagi parollar ketma-ketligi */}
                              <div className="p-4 rounded-2xl bg-[#0A1931] border border-[#1E3A6D] space-y-3">
                                <div className="flex items-center justify-between border-b border-[#1E3A6D] pb-2">
                                  <span className="text-xs font-black text-red-400 uppercase tracking-wider flex items-center gap-1.5">
                                    <Lock className="w-4 h-4" />
                                    <span>Xato Urinishlardagi Parollar Ketma-Ketligi</span>
                                  </span>
                                  <div className="flex items-center gap-2">
                                    <span className="px-2 py-0.5 rounded-md bg-red-500/20 border border-red-500/40 text-red-300 font-mono text-[10px] font-black">
                                      {reqItem.failedAttempts?.length || 0} ta urinish
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        removeSecurityBlockRequest(reqItem.id);
                                        setSecurityRequests(getSecurityBlockRequests());
                                        setSelectedSecurityRequestId(null);
                                      }}
                                      title="Yopish va o‘chirish (Logga saqlanadi)"
                                      className="w-7 h-7 rounded-lg bg-red-600/25 hover:bg-red-600 text-red-200 hover:text-white border border-red-500/50 flex items-center justify-center transition-all cursor-pointer"
                                    >
                                      <X className="w-3.5 h-3.5 stroke-[2.5]" />
                                    </button>
                                  </div>
                                </div>

                                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                                  {(reqItem.failedAttempts || []).map((att, idx) => (
                                    <div
                                      key={`${att.attemptNumber}-${idx}`}
                                      className="flex items-center justify-between gap-3 p-2.5 rounded-xl bg-[#071326] border border-red-500/30 text-xs"
                                    >
                                      <div className="flex items-center gap-2.5">
                                        <span className="w-6 h-6 rounded-lg bg-red-600/30 border border-red-500 text-red-200 font-mono font-black text-[11px] flex items-center justify-center shrink-0">
                                          {idx + 1}
                                        </span>
                                        <div>
                                          <span className="text-[10px] text-sky-300/70 block">
                                            {idx + 1}-xato urinishda terilgan parol:
                                          </span>
                                          <span className="font-mono font-black text-sm text-amber-300 select-all">
                                            {att.enteredPassword}
                                          </span>
                                        </div>
                                      </div>
                                      <span className="text-[10px] font-mono text-sky-300/70 shrink-0">
                                        {new Date(att.timestamp).toLocaleTimeString('uz-UZ')}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>
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
        )}

          </div>

          {/* =========================================================================
              YON TARAFI (O'NG TARAFDAN CHIQADIGAN, BO'YIGA UZUN VA CHETLARNI YOPGAN BO'LIMLAR PANELI)
              ========================================================================= */}
          <aside
            className={`hidden lg:block transition-all duration-300 ease-in-out shrink-0 order-1 lg:order-2 self-stretch ${
              isSidebarCollapsed ? 'w-full lg:w-[76px]' : 'w-full lg:w-[330px]'
            } lg:sticky lg:top-[72px] lg:h-[calc(100vh-72px)] z-20`}
          >
            <div className="bg-[#0A1931] border-b-2 lg:border-b-0 lg:border-l-2 border-[#1E3A6D] rounded-none h-full min-h-full p-4 shadow-[-12px_0_32px_rgba(0,0,0,0.55)] flex flex-col justify-between gap-4 overflow-y-auto">
              <div className="space-y-3">
                {/* Yon menyuni yig'ish va ochish sarlavhasi */}
                <div
                  onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
                  className="pb-3 border-b border-[#1E3A6D] flex items-center justify-between cursor-pointer group select-none hover:opacity-90 transition-opacity"
                  title={isSidebarCollapsed ? "Bo‘limlarni yondan ochish" : "Bo‘limlarni o‘ng chetga yopish"}
                >
                  {!isSidebarCollapsed && (
                    <h3 className="text-xs sm:text-sm font-black text-[#FFB800] tracking-wider uppercase font-mono flex items-center gap-2">
                      <Layers className="w-4 h-4 text-[#FFB800]" />
                      <span>{isSubAdmin ? (currentUser?.displayName || 'Admin Bo‘limlari') : 'Admin Bo‘limlari'}</span>
                    </h3>
                  )}
                  <div
                    className={`p-2 rounded-xl bg-[#071326] group-hover:bg-[#0F2547] text-[#FFB800] border border-[#1E3A6D] group-hover:border-[#FFB800] transition-colors ${
                      isSidebarCollapsed ? 'mx-auto' : 'ml-auto'
                    }`}
                  >
                    {isSidebarCollapsed ? <PanelLeftOpen className="w-4 h-4 rotate-180" /> : <PanelLeftClose className="w-4 h-4 rotate-180" />}
                  </div>
                </div>

                <nav className="flex flex-col gap-2.5">
                  {(isSubAdmin
                    ? allowedSubAdminSections
                    : (['reports', 'suppliers', 'requests_customers'] as const)
                  ).map((secKey, idx) => {
                    const metaMap: Record<string, { label: string; badge: string | number; icon: any }> = {
                      reports: {
                        label: 'Monitoring, hisobot',
                        badge: idx + 1,
                        icon: BarChart3,
                      },
                      suppliers: {
                        label: "Ta'minotchi B2B2C Hamkorlar",
                        badge: suppliers.length,
                        icon: Users,
                      },
                      requests_customers: {
                        label: "So'rov va Mijozlar",
                        badge: requestProblemsState.unacknowledgedCount > 0 ? requestProblemsState.unacknowledgedCount : orders.length,
                        icon: ShoppingCart,
                      },
                      b2b_crm: {
                        label: 'B2B CRM',
                        badge: suppliers.filter((s) => s.cabinetType === 'manufacturer').length,
                        icon: Building,
                      },
                      b2c_crm: {
                        label: 'B2C CRM',
                        badge: suppliers.filter((s) => (s.cabinetType || 'partner') === 'partner').length,
                        icon: Package,
                      },
                    };
                    const itemMeta = metaMap[secKey] || metaMap.reports;
                    const IconComp = itemMeta.icon;
                    const isActive = activeSection === secKey && !isSettingsOpen;
                    const isReqBlinking =
                      secKey === 'requests_customers' && requestProblemsState.hasUnacknowledged;

                    return (
                      <button
                        key={secKey}
                        type="button"
                        onClick={() => setActiveSection(secKey as any)}
                        title={itemMeta.label}
                        className={`w-full flex items-center ${
                          isSidebarCollapsed ? 'justify-center p-3.5' : 'justify-between px-4 py-3.5'
                        } rounded-xl text-xs sm:text-sm font-black transition-all cursor-pointer border ${
                          isActive
                            ? isReqBlinking
                              ? 'bg-red-600 text-white border-amber-300 shadow-[0_0_20px_rgba(255,184,0,0.65)] animate-pulse'
                              : 'bg-red-600 text-white border-red-400 shadow-[0_0_16px_rgba(220,38,38,0.45)]'
                            : isReqBlinking
                            ? 'bg-gradient-to-r from-amber-500/25 via-blue-600/25 to-amber-500/25 text-amber-200 border-amber-400 shadow-[0_0_18px_rgba(255,184,0,0.45)] animate-pulse'
                            : 'bg-[#071326] text-sky-100 hover:text-white hover:bg-[#0F2547] border-[#1E3A6D]'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <IconComp
                            className={`w-4 h-4 shrink-0 ${
                              isActive ? 'text-white' : 'text-[#FFB800]'
                            }`}
                          />
                          {!isSidebarCollapsed && <span className="text-left">{itemMeta.label}</span>}
                        </div>
                        {!isSidebarCollapsed && (
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                              isActive
                                ? 'bg-white text-red-700 font-black'
                                : isReqBlinking
                                ? 'bg-[#FFB800] text-[#0A1931] font-black'
                                : 'bg-[#0F2547] text-sky-200'
                            }`}
                          >
                            {itemMeta.badge}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </nav>
              </div>

              <div className="space-y-3 mt-auto">
                {/* KABINETLAR SONI DIAGRAMMASI (Bo'lim sifatida ishlamaydi — faqat Bo'limlar ro'yxati ochilganda pastki qismda ko'rinadi) */}
                {!isSidebarCollapsed && (() => {
                  const adminCabCount = 1;
                  const b2bCabCount = manufacturersCount;
                  const b2cCabCount = partnersCount;
                  const customerCabCount = registeredCustomers.length;
                  const maxCabVal = Math.max(adminCabCount, b2bCabCount, b2cCabCount, customerCabCount, 1);
                  const totalAllCabs = adminCabCount + b2bCabCount + b2cCabCount + customerCabCount;
                  const cabRows = [
                    {
                      label: 'ADMIN KABINETLAR',
                      count: adminCabCount,
                      barColor: 'from-red-600 to-rose-400',
                      badgeColor: 'text-rose-300 bg-rose-500/20 border-rose-400/40',
                    },
                    {
                      label: 'B2B KABINETLAR',
                      count: b2bCabCount,
                      barColor: 'from-amber-500 to-[#FFB800]',
                      badgeColor: 'text-[#FFB800] bg-amber-500/20 border-[#FFB800]/50',
                    },
                    {
                      label: 'B2C KABINETLAR',
                      count: b2cCabCount,
                      barColor: 'from-emerald-500 to-emerald-300',
                      badgeColor: 'text-emerald-300 bg-emerald-500/20 border-emerald-400/50',
                    },
                    {
                      label: 'FOYDALANUVCHI MIJOZ KABINETLAR',
                      count: customerCabCount,
                      barColor: 'from-blue-600 to-sky-400',
                      badgeColor: 'text-sky-300 bg-sky-500/20 border-sky-400/50',
                    },
                  ];

                  return (
                    <div className="pt-3 border-t border-[#1E3A6D] select-none">
                      <div className="bg-[#071326] border border-[#1E3A6D] rounded-xl p-3.5 space-y-3">
                        <div className="flex items-center justify-between gap-2 pb-2 border-b border-[#1E3A6D]">
                          <span className="text-[11px] font-black text-[#FFB800] uppercase tracking-wider flex items-center gap-1.5">
                            <BarChart3 className="w-3.5 h-3.5 text-[#FFB800]" />
                            <span>Kabinetlar Soni Diagrammasi</span>
                          </span>
                          <span className="px-2 py-0.5 rounded-lg bg-[#0A1931] border border-[#1E3A6D] font-mono font-black text-[10px] text-white">
                            Jami: {totalAllCabs} ta
                          </span>
                        </div>

                        <div className="space-y-2.5">
                          {cabRows.map((item) => {
                            const widthPct = item.count > 0 ? Math.max(12, Math.round((item.count / maxCabVal) * 100)) : 4;
                            return (
                              <div key={item.label} className="space-y-1">
                                <div className="flex items-center justify-between gap-2 text-[10px]">
                                  <span className="font-black text-white tracking-wide">
                                    {item.label}
                                  </span>
                                  <span className={`px-2 py-0.5 rounded-md border font-mono font-black text-[10px] shrink-0 ${item.badgeColor}`}>
                                    {item.count} ta
                                  </span>
                                </div>
                                <div className="w-full h-2 bg-[#0A1931] rounded-full overflow-hidden border border-[#1E3A6D]">
                                  <div
                                    className={`h-full bg-gradient-to-r ${item.barColor} rounded-full transition-all duration-500`}
                                    style={{ width: `${widthPct}%` }}
                                  />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* XAVFSIZLIK SO'ROVI BO'LIMI (Eng pastda — Kabinetlar Soni Diagrammasi qismidan ham pastda) */}
                <div className="pt-2 border-t border-[#1E3A6D]">
                  <button
                    type="button"
                    onClick={() => setActiveSection('security_requests')}
                    title="Xavfsizlik So‘rovi (Login bloklanganda yonib o‘chadi)"
                    className={`w-full flex items-center ${
                      isSidebarCollapsed ? 'justify-center p-3.5' : 'justify-between px-4 py-3.5'
                    } rounded-xl text-xs sm:text-sm font-black transition-all cursor-pointer border ${
                      activeSection === 'security_requests' && !isSettingsOpen
                        ? hasBlinkingSecurityRequest
                          ? 'bg-red-600 text-white border-amber-300 shadow-[0_0_24px_rgba(239,68,68,0.85)] animate-pulse'
                          : 'bg-red-600 text-white border-red-400 shadow-[0_0_16px_rgba(220,38,38,0.45)]'
                        : hasBlinkingSecurityRequest
                        ? 'bg-gradient-to-r from-red-600 via-amber-500 to-red-600 text-white border-2 border-amber-300 shadow-[0_0_24px_rgba(239,68,68,0.85)] animate-pulse'
                        : 'bg-[#071326] text-sky-100 hover:text-white hover:bg-[#0F2547] border-[#1E3A6D]'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <ShieldAlert
                        className={`w-4 h-4 shrink-0 ${
                          activeSection === 'security_requests' || hasBlinkingSecurityRequest
                            ? 'text-white'
                            : 'text-red-400'
                        }`}
                      />
                      {!isSidebarCollapsed && <span className="text-left">Xavfsizlik So‘rovi</span>}
                    </div>
                    {!isSidebarCollapsed && (
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                          activeSection === 'security_requests' || hasBlinkingSecurityRequest
                            ? 'bg-white text-red-700 font-black'
                            : 'bg-[#0F2547] text-sky-200'
                        }`}
                      >
                        {blockedOrFlaggedSecurityRequests.length}
                      </span>
                    )}
                  </button>

                  {/* SOZLAMALAR BO'LIMI */}
                  <button
                    type="button"
                    onClick={() => setIsSettingsOpen(true)}
                    title="Sozlamalar va Chiqish"
                    className={`mt-2 w-full flex items-center ${
                      isSidebarCollapsed ? 'justify-center p-3.5' : 'justify-between px-4 py-3.5'
                    } rounded-xl text-xs sm:text-sm font-black transition-all cursor-pointer border ${
                      isSettingsOpen
                        ? 'bg-[#FFB800] text-[#0A1931] border-amber-400 shadow-md'
                        : 'bg-[#071326] text-sky-100 hover:text-white hover:bg-[#0F2547] border-[#1E3A6D]'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Settings className={`w-4 h-4 shrink-0 ${isSettingsOpen ? 'text-[#0A1931]' : 'text-[#FFB800]'}`} />
                      {!isSidebarCollapsed && <span className="text-left">Sozlamalar</span>}
                    </div>
                  </button>
                </div>
              </div>
            </div>
          </aside>

          {/* Mobil ekranda O'ng tarafdan chiquvchi menyu */}
          {isMobileSidebarOpen && (
            <div
              className="fixed inset-0 z-50 lg:hidden bg-black/80 backdrop-blur-sm flex justify-end animate-fadeIn"
              onClick={() => setIsMobileSidebarOpen(false)}
            >
              <div
                className="w-80 max-w-[88vw] h-full bg-[#0A1931] border-l-2 border-[#FFB800] p-5 space-y-4 overflow-y-auto shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between pb-3 border-b border-[#1E3A6D]">
                  <h3 className="text-sm font-black text-[#FFB800] uppercase tracking-wider flex items-center gap-2">
                    <Layers className="w-4 h-4" />
                    <span>Admin Bo‘limlari</span>
                  </h3>
                  <button
                    type="button"
                    onClick={() => setIsMobileSidebarOpen(false)}
                    className="p-2 rounded-xl bg-[#071326] text-sky-200 hover:text-white border border-[#1E3A6D]"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <nav className="flex flex-col gap-2.5">
                  {(isSubAdmin
                    ? allowedSubAdminSections
                    : (['reports', 'suppliers', 'requests_customers'] as const)
                  ).map((secKey, idx) => {
                    const labels: Record<string, string> = {
                      reports: 'Monitoring, hisobot',
                      suppliers: "Ta'minotchi B2B2C Hamkorlar",
                      requests_customers: "So'rov va Mijozlar",
                      b2b_crm: 'B2B CRM',
                      b2c_crm: 'B2C CRM',
                    };
                    const isMobileReqBlinking =
                      secKey === 'requests_customers' && requestProblemsState.hasUnacknowledged;
                    return (
                      <button
                        key={secKey}
                        type="button"
                        onClick={() => {
                          setActiveSection(secKey as any);
                          setIsMobileSidebarOpen(false);
                        }}
                        className={`w-full flex items-center justify-between px-4 py-3.5 rounded-2xl text-xs font-black border ${
                          activeSection === secKey
                            ? isMobileReqBlinking
                              ? 'bg-[#FFB800] text-[#0A1931] border-red-400 animate-pulse'
                              : 'bg-[#FFB800] text-[#0A1931] border-[#FFC928]'
                            : isMobileReqBlinking
                            ? 'bg-gradient-to-r from-amber-500/25 via-blue-600/25 to-amber-500/25 text-amber-200 border-amber-400 animate-pulse'
                            : 'bg-[#071326] text-sky-100 border-[#1E3A6D]'
                        }`}
                      >
                        <span>{labels[secKey] || secKey}</span>
                        <span className="text-[10px] font-mono">{idx + 1}</span>
                      </button>
                    );
                  })}
                </nav>

                {/* Mobil menyuda ham Kabinetlar Soni Diagrammasi */}
                <div className="pt-3 border-t border-[#1E3A6D] select-none">
                  <div className="bg-[#071326] border border-[#1E3A6D] rounded-2xl p-3.5 space-y-2.5">
                    <div className="flex items-center justify-between gap-2 pb-2 border-b border-[#1E3A6D]">
                      <span className="text-[11px] font-black text-[#FFB800] uppercase tracking-wider">
                        Kabinetlar Soni Diagrammasi
                      </span>
                      <span className="font-mono font-black text-[10px] text-white">
                        {1 + manufacturersCount + partnersCount + registeredCustomers.length} ta
                      </span>
                    </div>
                    {[
                      { label: 'ADMIN KABINETLAR', count: 1, cls: 'text-rose-300' },
                      { label: 'B2B KABINETLAR', count: manufacturersCount, cls: 'text-[#FFB800]' },
                      { label: 'B2C KABINETLAR', count: partnersCount, cls: 'text-emerald-400' },
                      { label: 'FOYDALANUVCHI MIJOZ KABINETLAR', count: registeredCustomers.length, cls: 'text-sky-300' },
                    ].map((row) => (
                      <div key={row.label} className="flex items-center justify-between text-[11px]">
                        <span className="font-black text-white">{row.label}</span>
                        <span className={`font-mono font-black ${row.cls}`}>{row.count} ta</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Mobil menyuda ham eng pastda Xavfsizlik So'rovi */}
                <div className="pt-2 border-t border-[#1E3A6D]">
                  <button
                    type="button"
                    onClick={() => {
                      setActiveSection('security_requests');
                      setIsMobileSidebarOpen(false);
                    }}
                    className={`w-full flex items-center justify-between px-4 py-3.5 rounded-2xl text-xs font-black border ${
                      activeSection === 'security_requests'
                        ? 'bg-red-600 text-white border-amber-300'
                        : hasBlinkingSecurityRequest
                        ? 'bg-gradient-to-r from-red-600 via-amber-500 to-red-600 text-white border-amber-300 animate-pulse'
                        : 'bg-[#071326] text-sky-100 border-[#1E3A6D]'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <ShieldAlert className="w-4 h-4 text-red-400" />
                      <span>Xavfsizlik So‘rovi</span>
                    </span>
                    <span className="text-[10px] font-mono">
                      {blockedOrFlaggedSecurityRequests.length}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setIsMobileSidebarOpen(false);
                      setIsSettingsOpen(true);
                    }}
                    className="mt-2 w-full flex items-center justify-between px-4 py-3.5 rounded-2xl text-xs font-black border bg-[#071326] text-sky-100 border-[#1E3A6D] hover:border-[#FFB800]"
                  >
                    <span className="flex items-center gap-2">
                      <Settings className="w-4 h-4 text-[#FFB800]" />
                      <span>Sozlamalar</span>
                    </span>
                  </button>
                </div>
              </div>
            </div>
          )}

        </div>
      </main>

      {/* =========================================================================
          MODAL: TA'MINOTCHI HAMKOR KABINETI QO'SHISH
          (Ism va Familiya alohida kiritiladi!)
          ========================================================================= */}
      {isAddSupplierOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fadeIn">
          <div className="bg-[#222528] border-2 border-[#FFB800] rounded-2xl max-w-4xl w-full p-6 sm:p-8 lg:p-10 space-y-6 shadow-2xl relative max-h-[94vh] overflow-y-auto">
            
            <button
              onClick={() => setIsAddSupplierOpen(false)}
              className="absolute top-5 right-5 text-slate-400 hover:text-white p-2 rounded-xl bg-[#292C2F] transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Header */}
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-2xl bg-amber-500/20 text-amber-400 border border-[#FFB800]/40">
                <UserPlus className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-xl sm:text-2xl font-black text-white">Kabinet Qo‘shish</h2>
                <p className="text-xs sm:text-sm text-[#B8B8B3]">
                  Kabinet turini tanlang: B2B yoki B2C
                </p>
              </div>
            </div>

            <form onSubmit={handleAddSupplierSubmit} className="space-y-4 text-xs">
              {/* Ikkita tanlov: B2B va B2C */}
              <div className="space-y-1.5">
                <label className="text-slate-200 font-bold block">Kabinet turini tanlang:</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setNewSuppCabinetType('manufacturer');
                      if (newSuppStir.replace(/\D/g, '').length === 9) {
                        handleStirChangeAndLookup(newSuppStir, false, 'manufacturer');
                      }
                    }}
                    className={`p-4 rounded-xl border-2 text-left transition-all cursor-pointer flex items-center gap-3 ${
                      newSuppCabinetType === 'manufacturer'
                        ? 'bg-[#FFB800] text-[#151719] border-[#FFC928] font-black shadow-lg'
                        : 'bg-[#151719] text-slate-200 border-[#51504A] hover:border-[#FFB800]/60'
                    }`}
                  >
                    <Building className="w-5 h-5 shrink-0" />
                    <div>
                      <span className="block text-sm sm:text-base font-black">B2B</span>
                      <span className={`block text-[11px] font-semibold ${newSuppCabinetType === 'manufacturer' ? 'text-[#151719]/80' : 'text-[#B8B8B3]'}`}>
                        Hisobotlar • Mahsulotlar • Mijozlar • B2B buyurtmalar • Amaliyotlar
                      </span>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setNewSuppCabinetType('partner');
                      if (newSuppStir.replace(/\D/g, '').length === 9) {
                        handleStirChangeAndLookup(newSuppStir, false, 'partner');
                      }
                    }}
                    className={`p-4 rounded-xl border-2 text-left transition-all cursor-pointer flex items-center gap-3 ${
                      newSuppCabinetType === 'partner'
                        ? 'bg-[#FFB800] text-[#151719] border-[#FFC928] font-black shadow-lg'
                        : 'bg-[#151719] text-slate-200 border-[#51504A] hover:border-[#FFB800]/60'
                    }`}
                  >
                    <Users className="w-5 h-5 shrink-0" />
                    <div>
                      <span className="block text-sm sm:text-base font-black">B2C</span>
                      <span className={`block text-[11px] font-semibold ${newSuppCabinetType === 'partner' ? 'text-[#151719]/80' : 'text-[#B8B8B3]'}`}>
                        Hisobotlar • Mahsulotlar • CRM • Mijozlar • B2B ta'minotchilar
                      </span>
                    </div>
                  </button>
                </div>
              </div>

              {/* STIR RAQAMI VA ORGINFO.UZ / STAT.UZ DAN BITTA JADVAL ASOSIDA MA'LUMOTLAR */}
              <div className="p-4 rounded-2xl bg-[#151719] border border-[#FFB800]/40 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <label className="text-amber-400 font-black flex items-center gap-1.5 text-xs">
                    <Building className="w-4 h-4 text-amber-400" />
                    <span>
                      {newSuppCabinetType === 'manufacturer'
                        ? 'B2B Kabineti STIR Raqami:'
                        : 'B2C Kabineti STIR Raqami:'}
                    </span>
                  </label>
                  {newSuppStirLoading && (
                    <span className="text-[11px] text-amber-300 font-mono flex items-center gap-1 animate-pulse">
                      <RefreshCw className="w-3 h-3 animate-spin" /> Tekshirilmoqda...
                    </span>
                  )}
                </div>

                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    required
                    maxLength={9}
                    value={newSuppStir}
                    onChange={(e) => handleStirChangeAndLookup(e.target.value, false)}
                    className="flex-1 px-3.5 py-2.5 bg-[#222528] border border-[#51504A] focus:border-[#FFB800] rounded-xl text-white text-xs font-mono font-bold tracking-wider focus:outline-none"
                  />
                  <button
                    type="button"
                    disabled={newSuppStirLoading || newSuppStir.replace(/\D/g, '').length !== 9}
                    onClick={() => handleStirChangeAndLookup(newSuppStir, false)}
                    className="px-4 py-2.5 rounded-xl bg-[#FFB800] hover:bg-amber-400 disabled:opacity-40 text-slate-950 font-black text-xs transition-all cursor-pointer shrink-0 flex items-center justify-center gap-1.5"
                  >
                    <Search className="w-3.5 h-3.5" />
                    <span>STIR Tekshirish</span>
                  </button>
                </div>

                {newSuppStirError && (
                  <p className="text-red-400 text-[11px] font-bold">{newSuppStirError}</p>
                )}

                {/* STIR aniqlanganda barcha ma'lumotlar bitta jadval asosida ko'rinadi */}
                {renderStirCompanyTable(newSuppCompanyInfo)}
              </div>

              {/* Login, Parol va Kirish Telefon Raqami */}
              <div className="p-4 rounded-2xl bg-[#151719] border border-[#51504A] space-y-3">
                <span className="text-[11px] font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                  <KeyRound className="w-3.5 h-3.5" />
                  Kabinetga Kirish Ma'lumotlari
                </span>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <label className="text-slate-300 font-medium">Kabinet Logini:</label>
                    <input
                      type="text"
                      required
                      value={newSuppLogin}
                      onChange={(e) => setNewSuppLogin(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-[#222528] border border-[#51504A] rounded-xl text-white text-xs font-mono focus:outline-none focus:border-[#FFB800]"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-slate-300 font-medium">Kirish Paroli:</label>
                    <input
                      type="text"
                      required
                      value={newSuppPassword}
                      onChange={(e) => setNewSuppPassword(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-[#222528] border border-[#51504A] rounded-xl text-white text-xs font-mono focus:outline-none focus:border-[#FFB800]"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-emerald-300 font-bold flex items-center gap-1">
                      <Phone className="w-3 h-3 text-emerald-400" />
                      <span>Kirish Telefon Raqami:</span>
                    </label>
                    <input
                      type="tel"
                      required
                      value={newSuppPhone}
                      onChange={(e) => setNewSuppPhone(formatUzPhone(e.target.value))}
                      placeholder="+998 90 123 45 67"
                      className="w-full px-3.5 py-2.5 bg-[#222528] border border-emerald-500/40 rounded-xl text-white text-xs font-mono font-bold focus:outline-none focus:border-emerald-400"
                    />
                  </div>
                </div>
              </div>

              {/* Mahsulot turi (Kategoriya): Mavjud ro'yxatdan tanlash yoki Yangi kategoriya qo'lda kiritish */}
              <div className="space-y-2.5 p-3.5 rounded-2xl bg-[#151719] border border-[#51504A]">
                <div className="flex items-center justify-between">
                  <label className="text-slate-200 font-bold flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-amber-400" />
                    Mahsulot Turi (Kategoriya):
                  </label>
                  <span className="text-[11px] text-[#FFB800] font-medium">Mavjud yoki Yangi kategoriya</span>
                </div>

                {/* Mavjud kategoriyalar bo'lsa tezkor tanlash imkoni */}
                {productTypes.length > 0 && (
                  <div className="space-y-1">
                    <label className="text-[11px] text-[#B8B8B3]">Mavjud kategoriyalardan tanlash:</label>
                    <select
                      value={productTypes.some(pt => pt.label.toLowerCase() === newSuppCategory.trim().toLowerCase()) ? newSuppCategory : ''}
                      onChange={(e) => {
                        if (e.target.value) {
                          setNewSuppCategory(e.target.value);
                        }
                      }}
                      className="w-full px-3.5 py-2.5 bg-[#222528] border border-[#51504A] rounded-xl text-white text-xs font-semibold focus:outline-none focus:border-[#FFB800] cursor-pointer"
                    >
                      <option value="">-- Mavjud kategoriyani tanlang --</option>
                      {productTypes.map((pt) => (
                        <option key={pt.id} value={pt.label}>{pt.label}</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Qo'lda kiritish (Yangi toifa) */}
                <div className="space-y-1">
                  <label className="text-[11px] text-[#B8B8B3]">
                    Yoki yangi toifani qo'lda yozing:
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={newSuppCategory}
                      onChange={(e) => setNewSuppCategory(e.target.value)}
                      onBlur={(e) => {
                        const val = e.target.value.trim();
                        if (val.length >= 2) {
                          const updated = addProductType(val);
                          setProductTypes(updated);
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          const val = newSuppCategory.trim();
                          if (val.length >= 2) {
                            const updated = addProductType(val);
                            setProductTypes(updated);
                          }
                        }
                      }}
                      className="flex-1 px-3.5 py-2.5 bg-[#222528] border border-[#51504A] rounded-xl text-white text-xs font-medium focus:outline-none focus:border-[#FFB800]"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const val = newSuppCategory.trim();
                        if (val.length >= 2) {
                          const updated = addProductType(val);
                          setProductTypes(updated);
                        }
                        setIsCategoryPickerOpen(true);
                      }}
                      className="px-3.5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs transition-all cursor-pointer whitespace-nowrap shadow-md"
                    >
                      Barcha Toifalar
                    </button>
                  </div>
                </div>
              </div>

              {/* Komissiya Foizi (0.1%, 0.5%, 1% dan 10% gacha va ixtiyoriy kasr foiz) + Umumiydan yoki Foydadan tanlash */}
              <div className="p-3.5 rounded-2xl bg-[#151719] border border-[#51504A] space-y-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <label className="text-slate-200 font-bold flex items-center gap-1.5 text-xs">
                    <DollarSign className="w-3.5 h-3.5 text-amber-400" />
                    <span>Shartnoma Foizi (0.1%, 0.5%, 1% — 10%):</span>
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      step="0.1"
                      min="0.1"
                      max="100"
                      value={newSuppCommission}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        if (!isNaN(val) && val > 0) {
                          setNewSuppCommission(val);
                        }
                      }}
                      className="w-20 px-2.5 py-1 bg-[#222528] border border-[#FFB800] rounded-lg text-amber-400 font-mono font-black text-xs focus:outline-none text-center"
                      title="Shartnoma foizini kiriting (masalan: 0.1, 0.5, 2, 5)"
                    />
                    <span className="px-2.5 py-1 rounded-lg bg-amber-500/20 text-amber-400 border border-[#FFB800]/40 font-mono font-black text-xs">
                      {newSuppCommissionBasis === 'profit' ? 'Savdodan' : 'Umumiydan'} {newSuppCommission}%
                    </span>
                  </div>
                </div>

                {/* Hisoblash turi: Umumiydan yoki Savdodan */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setNewSuppCommissionBasis('total')}
                    className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                      newSuppCommissionBasis === 'total'
                        ? 'bg-[#FFB800]/20 border-[#FFB800] text-white'
                        : 'bg-[#222528] border-[#51504A] text-[#B8B8B3] hover:border-[#FFB800]/50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-black text-xs text-amber-400">Umumiydan ({newSuppCommission}%)</span>
                      {newSuppCommissionBasis === 'total' && <Check className="w-3.5 h-3.5 text-amber-400" />}
                    </div>
                    <span className="text-[10px] text-[#B8B8B3] block mt-0.5">
                      Mahsulotning umumiy summasidan hisoblanadi (masalan: Umumiydan 2%)
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setNewSuppCommissionBasis('profit')}
                    className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                      newSuppCommissionBasis === 'profit'
                        ? 'bg-emerald-500/20 border-emerald-400 text-white'
                        : 'bg-[#222528] border-[#51504A] text-[#B8B8B3] hover:border-emerald-400/50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-black text-xs text-emerald-400">Savdodan ({newSuppCommission}%)</span>
                      {newSuppCommissionBasis === 'profit' && <Check className="w-3.5 h-3.5 text-emerald-400" />}
                    </div>
                    <span className="text-[10px] text-[#B8B8B3] block mt-0.5">
                      Mahsulot savdosidan hisoblanadi (masalan: Savdodan 5%)
                    </span>
                  </button>
                </div>

                <div className="grid grid-cols-6 sm:grid-cols-12 gap-1.5">
                  {[0.1, 0.5, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((pct) => (
                    <button
                      key={pct}
                      type="button"
                      onClick={() => setNewSuppCommission(pct)}
                      className={`py-2 rounded-xl font-mono font-black text-xs border transition-all cursor-pointer ${
                        Number(newSuppCommission) === pct
                          ? 'bg-[#FFB800] text-[#151719] border-[#FFC928] shadow-md'
                          : 'bg-[#222528] text-[#B8B8B3] border-[#51504A] hover:border-[#FFB800]'
                      }`}
                    >
                      {pct}%
                    </button>
                  ))}
                </div>
              </div>

              {/* Reklama video havolasi uchun ruxsat tugmasi */}
              <div className="p-3.5 rounded-2xl bg-[#151719] border border-[#51504A] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <span className="text-slate-200 font-bold block text-xs">
                  Reklama havolasi uchun ruxsat (YouTube video)
                </span>
                <button
                  type="button"
                  onClick={() => setNewSuppAllowPromoVideo(!newSuppAllowPromoVideo)}
                  className={`px-4 py-2 rounded-xl font-black text-xs transition-all cursor-pointer shrink-0 flex items-center gap-2 border ${
                    newSuppAllowPromoVideo
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50 shadow-md'
                      : 'bg-[#222528] text-[#B8B8B3] border-[#51504A] hover:border-[#FFB800]'
                  }`}
                >
                  <Check className={`w-3.5 h-3.5 ${newSuppAllowPromoVideo ? 'text-emerald-400' : 'opacity-40'}`} />
                  <span>{newSuppAllowPromoVideo ? 'Reklama ruxsati berilgan ✓' : 'Reklama havolasi uchun ruxsat'}</span>
                </button>
              </div>

              {(newSuppPhoneError || newSuppContractError || newSuppConfirmError) && (
                <div className="p-3 rounded-xl bg-red-500/20 text-red-300 border border-red-500/40 text-xs font-bold">
                  {newSuppConfirmError || newSuppPhoneError || newSuppContractError}
                </div>
              )}

              {supplierAddSuccess && (
                <div className="p-3.5 rounded-2xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs flex items-center gap-2 font-bold animate-fadeIn">
                  <Check className="w-4 h-4 text-emerald-400" />
                  <span>Ta'minotchi kabineti muvaffaqiyatli qo‘shildi!</span>
                </div>
              )}

              {/* Submit Buttons */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#51504A]">
                <button
                  type="button"
                  onClick={() => setIsAddSupplierOpen(false)}
                  className="px-5 py-2.5 rounded-xl bg-[#292C2F] hover:bg-[#222528] text-slate-300 text-xs font-bold transition-colors cursor-pointer border border-[#51504A]"
                >
                  Bekor qilish
                </button>
                <button
                  type="submit"
                  className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-xs shadow-lg shadow-amber-500/25 active:scale-95 transition-all cursor-pointer"
                >
                  <Check className="w-4 h-4 stroke-[3]" />
                  <span>Kabinetni Saqlash</span>
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL: KORXONA KABINETINI TAHRIRLASH
          (Ism va Familiya alohida + 1 martalik favqulodda parol + O'chirish)
          ========================================================================= */}
      {isEditSupplierOpen && editingSupplier && (
        <div className="fixed inset-0 z-[65] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fadeIn">
          <div className="bg-[#222528] border-2 border-[#FFB800] rounded-2xl max-w-4xl w-full p-6 sm:p-8 lg:p-10 space-y-6 shadow-2xl relative max-h-[94vh] overflow-y-auto">
            
            <button
              onClick={() => {
                setIsEditSupplierOpen(false);
                setEditingSupplier(null);
                setShowDeleteConfirm(false);
              }}
              className="absolute top-5 right-5 text-slate-400 hover:text-white p-2 rounded-xl bg-[#292C2F] transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Header */}
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-2xl bg-amber-500/20 text-amber-400 border border-[#FFB800]/40">
                <Pencil className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-xl sm:text-2xl font-black text-white">Kabinetni Tahrirlash</h2>
                <p className="text-xs sm:text-sm text-[#B8B8B3]">«{editingSupplier.companyName}» korxonasi ma'lumotlari</p>
              </div>
            </div>

            <form onSubmit={handleEditSupplierSubmit} className="space-y-4 text-xs">
              {/* Kabinet turi (Faqat kiritilgan kabinet turi ko'rsatiladi, ikkita tanlov chiqmaydi) */}
              <div className="space-y-1.5">
                <label className="text-slate-200 font-bold block">Kabinet turi:</label>
                <div className="p-3.5 rounded-xl border-2 bg-[#FFB800]/15 text-[#FFB800] border-[#FFB800] font-black flex items-center gap-2.5">
                  {editSuppCabinetType === 'manufacturer' ? (
                    <>
                      <Building className="w-4 h-4 shrink-0" />
                      <span className="text-xs sm:text-sm font-black">B2B</span>
                    </>
                  ) : (
                    <>
                      <Users className="w-4 h-4 shrink-0" />
                      <span className="text-xs sm:text-sm font-black">B2C</span>
                    </>
                  )}
                </div>
              </div>

              {/* STIR Raqami va bitta jadval asosida ma'lumotlar */}
              <div className="p-3.5 rounded-2xl bg-[#151719] border border-[#FFB800]/40 space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="text-amber-400 font-bold flex items-center gap-1.5">
                    <Building className="w-3.5 h-3.5 text-amber-400" />
                    <span>
                      {editSuppCabinetType === 'manufacturer'
                        ? 'B2B Kabineti STIR Raqami:'
                        : 'B2C Kabineti STIR Raqami:'}
                    </span>
                  </label>
                  {editSuppStirLoading && (
                    <span className="text-[10px] text-amber-300 font-mono animate-pulse">Tekshirilmoqda...</span>
                  )}
                </div>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    maxLength={9}
                    value={editSuppStir}
                    onChange={(e) => handleStirChangeAndLookup(e.target.value, true)}
                    placeholder="STIR kiriting"
                    className="flex-1 px-3.5 py-2.5 bg-[#222528] border border-[#51504A] rounded-xl text-white text-xs font-mono font-bold focus:outline-none focus:border-[#FFB800]"
                  />
                  <button
                    type="button"
                    disabled={editSuppStirLoading || editSuppStir.replace(/\D/g, '').length !== 9}
                    onClick={() => handleStirChangeAndLookup(editSuppStir, true)}
                    className="px-4 py-2.5 rounded-xl bg-[#FFB800] hover:bg-amber-400 disabled:opacity-40 text-slate-950 font-black text-xs transition-all cursor-pointer shrink-0 flex items-center justify-center gap-1.5"
                  >
                    <Search className="w-3.5 h-3.5" />
                    <span>STIR Tekshirish</span>
                  </button>
                </div>
                {editSuppStirError && (
                  <p className="text-red-400 text-[11px] font-bold">{editSuppStirError}</p>
                )}

                {/* STIR aniqlanganda barcha ma'lumotlar bitta jadval asosida ko'rinadi */}
                {renderStirCompanyTable(editSuppCompanyInfo)}
              </div>

              {/* Kabinet Logini, Kirish Paroli va Kirish Telefon Raqami */}
              <div className="p-4 rounded-2xl bg-[#151719] border border-[#51504A] space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                    <KeyRound className="w-3.5 h-3.5" />
                    Kabinetga Kirish Kalitlari
                  </span>
                  {copiedKey && <span className="text-[10px] text-emerald-400 font-bold animate-pulse">{copiedKey}</span>}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[#B8B8B3] text-[11px]">
                      <span>Kabinet Logini:</span>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(editSuppLogin);
                          setCopiedKey("Login nusxalandi!");
                          setTimeout(() => setCopiedKey(null), 1500);
                        }}
                        className="text-amber-400 hover:underline cursor-pointer"
                      >
                        Nusxa
                      </button>
                    </div>
                    <input
                      type="text"
                      required
                      value={editSuppLogin}
                      onChange={(e) => setEditSuppLogin(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-[#222528] border border-[#51504A] rounded-xl text-white text-xs font-mono font-bold focus:outline-none focus:border-[#FFB800]"
                    />
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[#B8B8B3] text-[11px]">
                      <span>Kirish Paroli:</span>
                      <button
                        type="button"
                        onClick={() => setShowEditSuppPassword(!showEditSuppPassword)}
                        className="text-amber-400 cursor-pointer"
                      >
                        {showEditSuppPassword ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                      </button>
                    </div>
                    <input
                      type={showEditSuppPassword ? 'text' : 'password'}
                      value={editSuppPassword}
                      onChange={(e) => setEditSuppPassword(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-[#222528] border border-[#51504A] rounded-xl text-white text-xs font-mono font-bold focus:outline-none focus:border-[#FFB800]"
                    />
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-emerald-300 text-[11px] font-bold">
                      <span className="flex items-center gap-1">
                        <Phone className="w-3 h-3 text-emerald-400" />
                        Kirish Telefon Raqami:
                      </span>
                    </div>
                    <input
                      type="tel"
                      required
                      value={editSuppPhone}
                      onChange={(e) => setEditSuppPhone(formatUzPhone(e.target.value))}
                      placeholder="+998 90 123 45 67"
                      className="w-full px-3.5 py-2.5 bg-[#222528] border border-emerald-500/40 rounded-xl text-white text-xs font-mono font-bold focus:outline-none focus:border-emerald-400"
                    />
                  </div>
                </div>
              </div>

              {/* 1 Martalik Favqulodda Kirish Paroli */}
              <div className="p-4 rounded-2xl bg-purple-950/40 border border-purple-500/40 space-y-2.5">
                <div className="flex items-center gap-2 text-purple-300 font-bold">
                  <KeyRound className="w-4 h-4 text-purple-400" />
                  <span>1 Martalik Favqulodda Kirish Paroli</span>
                </div>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-purple-400" />
                  <input
                    type="text"
                    value={editSuppEmergencyPass}
                    onChange={(e) => setEditSuppEmergencyPass(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 bg-[#151719] border border-purple-500/40 rounded-xl text-white text-xs font-mono placeholder-purple-400/50 focus:outline-none focus:border-purple-400"
                  />
                </div>
                {editingSupplier.emergencyPassword && (
                  <div className="text-[11px] text-purple-300 font-mono flex items-center gap-1.5 mt-1">
                    <span className="w-2 h-2 rounded-full bg-purple-400 animate-pulse"></span>
                    <span>Hozirgi faol 1 martalik parol: <strong>{editingSupplier.emergencyPassword}</strong></span>
                  </div>
                )}
              </div>

              {/* Hudud va Shahar */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-slate-200 font-bold flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-amber-400" />
                    Hudud (Viloyat):
                  </label>
                  <select
                    value={editSuppRegion}
                    onChange={(e) => {
                      const reg = e.target.value;
                      setEditSuppRegion(reg);
                      const dists = REGIONS_AND_DISTRICTS[reg] || [];
                      setEditSuppDistrict(dists[0] || '');
                    }}
                    className="w-full px-3.5 py-2.5 bg-[#151719] border border-[#51504A] rounded-xl text-white text-xs focus:outline-none focus:border-[#FFB800] cursor-pointer"
                  >
                    {regionsList.map((reg) => (
                      <option key={reg} value={reg}>{reg}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-slate-200 font-bold flex items-center gap-1.5">
                    <Building className="w-3.5 h-3.5 text-[#B8B8B3]" />
                    Shahar va Tumanlar:
                  </label>
                  <select
                    value={editSuppDistrict}
                    onChange={(e) => setEditSuppDistrict(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-[#151719] border border-[#51504A] rounded-xl text-white text-xs focus:outline-none focus:border-[#FFB800] cursor-pointer"
                  >
                    {(REGIONS_AND_DISTRICTS[editSuppRegion] || []).map((dist) => (
                      <option key={dist} value={dist}>{dist}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Mahsulot turi (Kategoriya): Mavjud ro'yxatdan tanlash yoki Yangi kategoriya qo'lda kiritish */}
              <div className="space-y-2.5 p-3.5 rounded-2xl bg-[#151719] border border-[#51504A]">
                <div className="flex items-center justify-between">
                  <label className="text-slate-200 font-bold flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-amber-400" />
                    Mahsulot Turi (Kategoriya):
                  </label>
                  <span className="text-[11px] text-[#FFB800] font-medium">Mavjud yoki Yangi kategoriya</span>
                </div>

                {/* Mavjud kategoriyalar bo'lsa tezkor tanlash imkoni */}
                {productTypes.length > 0 && (
                  <div className="space-y-1">
                    <label className="text-[11px] text-[#B8B8B3]">Mavjud kategoriyalardan tanlash:</label>
                    <select
                      value={productTypes.some(pt => pt.label.toLowerCase() === editSuppCategory.trim().toLowerCase()) ? editSuppCategory : ''}
                      onChange={(e) => {
                        if (e.target.value) {
                          setEditSuppCategory(e.target.value);
                        }
                      }}
                      className="w-full px-3.5 py-2.5 bg-[#222528] border border-[#51504A] rounded-xl text-white text-xs font-semibold focus:outline-none focus:border-[#FFB800] cursor-pointer"
                    >
                      <option value="">-- Mavjud kategoriyani tanlang --</option>
                      {productTypes.map((pt) => (
                        <option key={pt.id} value={pt.label}>{pt.label}</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Qo'lda kiritish (Yangi toifa) */}
                <div className="space-y-1">
                  <label className="text-[11px] text-[#B8B8B3]">
                    Yoki yangi toifani qo'lda yozing:
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      required
                      value={editSuppCategory}
                      onChange={(e) => setEditSuppCategory(e.target.value)}
                      onBlur={(e) => {
                        const val = e.target.value.trim();
                        if (val.length >= 2) {
                          const updated = addProductType(val);
                          setProductTypes(updated);
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          const val = editSuppCategory.trim();
                          if (val.length >= 2) {
                            const updated = addProductType(val);
                            setProductTypes(updated);
                          }
                        }
                      }}
                      className="flex-1 px-3.5 py-2.5 bg-[#222528] border border-[#51504A] rounded-xl text-white text-xs font-medium focus:outline-none focus:border-[#FFB800]"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const val = editSuppCategory.trim();
                        if (val.length >= 2) {
                          const updated = addProductType(val);
                          setProductTypes(updated);
                        }
                        setIsEditCategoryPickerOpen(true);
                      }}
                      className="px-3.5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs transition-all cursor-pointer whitespace-nowrap shadow-md"
                    >
                      Barcha Toifalar
                    </button>
                  </div>
                </div>
              </div>

              {/* Shartnoma Foizi tahrirlanmaydi — faqat ma'lumot sifatida ko'rsatiladi */}
              <div className="p-3.5 rounded-2xl bg-[#151719] border border-[#51504A] flex items-center justify-between">
                <span className="text-slate-200 font-bold flex items-center gap-1.5 text-xs">
                  <DollarSign className="w-3.5 h-3.5 text-amber-400" />
                  <span>Biriktirilgan Shartnoma Foizi:</span>
                </span>
                <span className="px-3 py-1 rounded-lg bg-amber-500/20 text-amber-400 border border-[#FFB800]/40 font-mono font-black text-xs">
                  {editingSupplier.commissionBasis === 'profit' ? 'Savdodan' : 'Umumiydan'} {editingSupplier.commissionRate || 5}%
                </span>
              </div>

              {/* Reklama video havolasi uchun ruxsat tugmasi (Tahrirlash oynasida) */}
              <div className="p-3.5 rounded-2xl bg-[#151719] border border-[#51504A] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <span className="text-slate-200 font-bold block text-xs">
                  Reklama havolasi uchun ruxsat (YouTube video)
                </span>
                <button
                  type="button"
                  onClick={() => setEditSuppAllowPromoVideo(!editSuppAllowPromoVideo)}
                  className={`px-4 py-2 rounded-xl font-black text-xs transition-all cursor-pointer shrink-0 flex items-center gap-2 border ${
                    editSuppAllowPromoVideo
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50 shadow-md'
                      : 'bg-[#222528] text-[#B8B8B3] border-[#51504A] hover:border-[#FFB800]'
                  }`}
                >
                  <Check className={`w-3.5 h-3.5 ${editSuppAllowPromoVideo ? 'text-emerald-400' : 'opacity-40'}`} />
                  <span>{editSuppAllowPromoVideo ? 'Reklama ruxsati berilgan ✓' : 'Reklama havolasi uchun ruxsat'}</span>
                </button>
              </div>

              {editSuppContractError && (
                <div className="p-3 rounded-xl bg-red-500/20 text-red-300 border border-red-500/40 text-xs font-bold">
                  {editSuppContractError}
                </div>
              )}

              {supplierEditSuccess && (
                <div className="p-3.5 rounded-2xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs flex items-center gap-2 font-bold animate-fadeIn">
                  <Check className="w-4 h-4 text-emerald-400" />
                  <span>Korxona kabineti muvaffaqiyatli yangilandi!</span>
                </div>
              )}

              {/* Action buttons: O'chirish, Bekor qilish, Saqlash */}
              <div className="flex items-center justify-between gap-3 pt-3 border-t border-[#51504A]">
                <button
                  type="button"
                  onClick={() => handleRequestDeleteSupplier(editingSupplier)}
                  className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-red-500/15 hover:bg-red-500/25 text-red-400 hover:text-red-300 font-bold border border-red-500/30 transition-all cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>O‘chirish</span>
                </button>

                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditSupplierOpen(false);
                      setEditingSupplier(null);
                      setShowDeleteConfirm(false);
                    }}
                    className="px-5 py-2.5 rounded-xl bg-[#292C2F] text-slate-300 font-bold cursor-pointer"
                  >
                    Bekor qilish
                  </button>
                  <button
                    type="submit"
                    className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black shadow-lg shadow-amber-500/20 active:scale-95 transition-all cursor-pointer"
                  >
                    <Save className="w-4 h-4" />
                    <span>Saqlash</span>
                  </button>
                </div>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL: HAMKOR HISOBOTI (Ko'rsatilgan ta'minotchining Onlayn Savdosi,
          Bunker uchun ajratilishi kerak bo'lgan %, Kun/Oy/Yil filtri va Tahrirlashga o'tish.
          Login va Parol bu yerda KO'RSATILMAYDI — faqat Tahrirlash bosilganda ko'rinadi!)
          ========================================================================= */}
      {isReportModalOpen && selectedReportSupplier && detailedReport && (
        <div className="fixed inset-0 z-50 bg-[#0A1931] flex flex-col w-screen h-[100dvh] sm:h-screen animate-fadeIn overflow-hidden">
          <div className="bg-[#0A1931] flex-1 w-full h-full p-2.5 sm:p-6 lg:p-8 space-y-2.5 sm:space-y-4 flex flex-col overflow-hidden relative">
            
            {/* Tepadagi X tugmasi (Pastki Yopish tugmasi yo'q, faqat tepadagi X yetadi) */}
            <button
              onClick={() => {
                setIsReportModalOpen(false);
                setSelectedReportSupplier(null);
              }}
              title="Yopish"
              className="absolute top-2.5 right-2.5 sm:top-6 sm:right-6 text-white hover:text-white p-1.5 sm:p-2.5 rounded-lg sm:rounded-xl bg-red-600 hover:bg-red-500 border border-red-400 transition-all cursor-pointer shadow-lg active:scale-95 z-10"
            >
              <X className="w-4 h-4 sm:w-5 sm:h-5 stroke-[2.5]" />
            </button>

            {/* Modal Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-3 pb-2.5 sm:pb-4 border-b border-[#1E3A6D] pr-10 sm:pr-14">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="p-2 sm:p-3 rounded-xl sm:rounded-2xl bg-[#071326] text-[#FFB800] border border-[#FFB800]/50 shrink-0">
                  <FileSpreadsheet className="w-4 h-4 sm:w-6 sm:h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                    <h2 className="text-sm sm:text-2xl font-black text-white">
                      «{selectedReportSupplier.companyName}» — Hisobot
                    </h2>
                    <span className="px-2 py-0.5 rounded-full text-[9px] sm:text-[10px] font-bold uppercase bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                      {selectedReportSupplier.status === 'active' ? 'Faol' : selectedReportSupplier.status}
                    </span>
                    <span className="px-2 py-0.5 rounded-md text-[9px] sm:text-[10px] font-mono font-black uppercase bg-amber-500/20 text-[#FFB800] border border-[#FFB800]/40">
                      {detailedReport.commissionBasis === 'profit' ? 'Savdodan' : 'Umumiydan'} {detailedReport.commissionRate}%
                    </span>
                  </div>
                  <p className="text-[10px] sm:text-xs text-sky-200 mt-0.5">
                    {selectedReportSupplier.inn ? `STIR: ${selectedReportSupplier.inn} • ` : ''}
                    Mas'ul: {selectedReportSupplier.name} {selectedReportSupplier.surname || ''} ({selectedReportSupplier.phone}) • {selectedReportSupplier.region}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5 sm:gap-2 self-start sm:self-center shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    handleOpenEditSupplier(selectedReportSupplier);
                  }}
                  className="px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg sm:rounded-xl bg-[#FFB800] hover:bg-amber-400 text-[#0A1931] font-black text-[11px] sm:text-xs flex items-center gap-1 sm:gap-1.5 cursor-pointer shadow-md active:scale-95 transition-all"
                >
                  <Pencil className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  <span>Tahrirlash</span>
                </button>
                <button
                  type="button"
                  onClick={handleDownloadSupplierReport}
                  className="px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-lg sm:rounded-xl bg-[#071326] hover:bg-[#132C54] text-amber-300 font-bold text-[11px] sm:text-xs border border-[#1E3A6D] flex items-center gap-1 sm:gap-1.5 cursor-pointer"
                  title="Belgilangan sanadagi hisobotni yuklab olish"
                >
                  <Download className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  <span>Chop etish</span>
                </button>
              </div>
            </div>

            {/* Tepa qismda Kun / Oy / Yil hisobida ko'rish imkoni + Jami KPI */}
            <div className="bg-[#071326] border-2 border-[#1E3A6D] rounded-xl sm:rounded-2xl p-2 sm:p-3.5 flex flex-col lg:flex-row lg:items-center justify-between gap-2 sm:gap-3">
              <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                <span className="text-[10px] sm:text-xs font-black text-amber-400 mr-1 flex items-center gap-1 uppercase tracking-wider">
                  <Clock className="w-3.5 h-3.5 text-[#FFB800]" />
                  <span>Vaqt:</span>
                </span>
                {(
                  [
                    { id: 'day', label: 'Kun' },
                    { id: 'month', label: 'Oy' },
                    { id: 'year', label: 'Yil' },
                    { id: 'all', label: 'Barchasi' },
                  ] as { id: SupplierReportPeriod; label: string }[]
                ).map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setReportPeriod(p.id)}
                    className={`px-2.5 sm:px-3.5 py-1 sm:py-1.5 rounded-lg sm:rounded-xl text-[10px] sm:text-xs font-black transition-all cursor-pointer border ${
                      reportPeriod === p.id
                        ? 'bg-red-600 text-white border-red-400 shadow-[0_0_14px_rgba(220,38,38,0.45)]'
                        : 'bg-[#0A1931] text-sky-200 border-[#1E3A6D] hover:border-[#FFB800]/60 hover:text-white'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}

                {reportPeriod !== 'all' && (
                  <div className="flex items-center gap-1.5 ml-0.5">
                    {reportPeriod === 'day' && (
                      <input
                        type="date"
                        value={reportDateStr}
                        onChange={(e) => setReportDateStr(e.target.value || new Date().toISOString().slice(0, 10))}
                        className="px-2 sm:px-3 py-1 sm:py-1.5 bg-[#0A1931] border border-[#FFB800] rounded-lg sm:rounded-xl text-white text-[10px] sm:text-xs font-mono font-bold focus:outline-none"
                      />
                    )}
                    {reportPeriod === 'month' && (
                      <input
                        type="month"
                        value={reportDateStr.slice(0, 7)}
                        onChange={(e) => setReportDateStr(`${e.target.value}-01`)}
                        className="px-2 sm:px-3 py-1 sm:py-1.5 bg-[#0A1931] border border-[#FFB800] rounded-lg sm:rounded-xl text-white text-[10px] sm:text-xs font-mono font-bold focus:outline-none"
                      />
                    )}
                    {reportPeriod === 'year' && (
                      <select
                        value={reportDateStr.slice(0, 4)}
                        onChange={(e) => setReportDateStr(`${e.target.value}-01-01`)}
                        className="px-2 sm:px-3 py-1 sm:py-1.5 bg-[#0A1931] border border-[#FFB800] rounded-lg sm:rounded-xl text-white text-[10px] sm:text-xs font-mono font-bold focus:outline-none cursor-pointer"
                      >
                        {[2024, 2025, 2026, 2027].map((yr) => (
                          <option key={yr} value={String(yr)}>
                            {yr}-yil
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                )}
              </div>

              {/* Umumiy hisobot ko'rsatkichlari */}
              <div className="grid grid-cols-2 sm:flex sm:items-center gap-1.5 sm:gap-2.5 flex-wrap">
                <div className="px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-lg sm:rounded-xl bg-[#0A1931] border border-[#1E3A6D]">
                  <span className="text-[9px] sm:text-[10px] text-sky-200 uppercase font-bold block">
                    Savdo hajmida:
                  </span>
                  <span className="text-[11px] sm:text-sm font-mono font-black text-white">
                    {Math.max(
                      detailedReport.uniqueProductTypesCount,
                      adminProducts.filter(
                        (p: any) =>
                          p &&
                          (p.supplierId === selectedReportSupplier.id ||
                            (p.supplierName || '').toLowerCase().trim() ===
                              (selectedReportSupplier.companyName || '').toLowerCase().trim())
                      ).length
                    )}{' '}
                    xil ({detailedReport.totalSoldQuantity} ta)
                  </span>
                </div>
                <div className="px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-lg sm:rounded-xl bg-[#0A1931] border border-[#FFB800]/50">
                  <span className="text-[9px] sm:text-[10px] text-amber-300 uppercase font-bold block">
                    Foyda (Savdo):
                  </span>
                  <span className="text-[11px] sm:text-sm font-mono font-black text-[#FFB800]">
                    {formatPriceSum(detailedReport.totalSalesSum)}
                  </span>
                </div>
                <div className="px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-lg sm:rounded-xl bg-emerald-500/20 border-2 border-emerald-400/70">
                  <span className="text-[9px] sm:text-[10px] text-emerald-300 uppercase font-bold block">
                    Bunker {detailedReport.commissionRate}%:
                  </span>
                  <span className="text-[11px] sm:text-sm font-mono font-black text-emerald-400">
                    {formatPriceSum(detailedReport.totalCommissionSum)}
                  </span>
                </div>
                <div className="px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-lg sm:rounded-xl bg-[#0A1931] border border-sky-400/40">
                  <span className="text-[9px] sm:text-[10px] text-sky-300 uppercase font-bold block">Sof Foyda:</span>
                  <span className="text-[11px] sm:text-sm font-mono font-black text-sky-300">
                    {formatPriceSum(detailedReport.netPayoutSum)}
                  </span>
                </div>
              </div>
            </div>

            {/* Asosiy Hisobot Jadvali: Onlayn Platformada Sotilayotgan Mahsulotlar Ro'yxati */}
            <div className="flex-1 overflow-y-auto space-y-3 sm:space-y-4 pr-0.5 sm:pr-1 text-xs">
              <div className="bg-[#071326] border-2 border-[#1E3A6D] rounded-xl sm:rounded-2xl p-2.5 sm:p-4 space-y-2.5 sm:space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-[#1E3A6D]">
                  <h3 className="text-xs sm:text-sm font-black text-[#FFB800] uppercase tracking-wider flex items-center gap-2">
                    <Package className="w-4 h-4" />
                    <span>
                      Onlayn Platformada Sotilayotgan Mahsulotlar Ro‘yxati va Savdo Hisoboti ({detailedReport.sales.length})
                    </span>
                  </h3>
                </div>

                <div className="overflow-x-auto rounded-xl border-2 border-[#1E3A6D]">
                  <table className="w-full text-left text-[#F5F5F2] border-collapse">
                    <thead className="bg-[#0A1931] text-amber-400 uppercase text-[11px] tracking-wider border-b-2 border-[#1E3A6D]">
                      <tr className="divide-x divide-[#1E3A6D]">
                        <th className="py-3.5 px-3 font-black text-center w-12">№</th>
                        <th className="py-3.5 px-4 font-black">Mahsulot nomlari</th>
                        <th className="py-3.5 px-4 font-black">Sotilgan miqdori</th>
                        <th className="py-3.5 px-4 font-black">Sana</th>
                        <th className="py-3.5 px-4 font-black">Xaridor Ism familiya va manzili</th>
                        <th className="py-3.5 px-4 font-black text-right">Bunker Stroy Ulushi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y-2 divide-[#1E3A6D] bg-[#071533]">
                      {detailedReport.sales.map((item, idx) => {
                        const basisLabel = detailedReport.commissionBasis === 'profit' ? 'Savdodan' : 'Umumiydan';
                        const itemBaseSum =
                          (detailedReport.commissionBasis === 'profit' ? item.profitSum : item.totalSum) || 0;
                        const itemBunkerShare = Math.round(
                          (itemBaseSum * detailedReport.commissionRate) / 100
                        );
                        return (
                          <tr key={item.id} className="hover:bg-[#0c265e] transition-colors divide-x divide-[#1E3A6D]">
                            {/* 1. № */}
                            <td className="py-3.5 px-3 text-center font-mono font-black text-amber-400">
                              {idx + 1}
                            </td>

                            {/* 2. Mahsulot nomlari */}
                            <td className="py-3.5 px-4">
                              <strong className="text-white font-black text-xs sm:text-sm block">
                                {item.productTitle}
                              </strong>
                              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                <span className="text-[11px] text-amber-300 font-semibold">{item.category}</span>
                                <span className="text-[11px] font-mono text-sky-200">
                                  • 1 {item.unit}: {formatPriceSum(item.price)}
                                </span>
                              </div>
                            </td>

                            {/* 3. Sotilgan miqdori */}
                            <td className="py-3.5 px-4">
                              <span className="font-mono font-black text-white text-xs sm:text-sm block">
                                {item.quantity} {item.unit}
                              </span>
                              <span className="font-mono font-bold text-[#FFB800] text-xs block mt-0.5">
                                Foyda (Savdo): {formatPriceSum(item.totalSum)}
                              </span>
                            </td>

                            {/* 4. Sana */}
                            <td className="py-3.5 px-4 font-mono text-sky-200 font-semibold text-xs whitespace-nowrap">
                              {item.date || '—'}
                            </td>

                            {/* 5. Xaridor Ism familiya va manzili */}
                            <td className="py-3.5 px-4">
                              <div className="space-y-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-white font-black text-xs sm:text-sm">
                                    {item.buyerName}
                                  </span>
                                  {item.buyerPhone && (
                                    <span className="text-[11px] text-emerald-400 font-mono font-bold">
                                      ({item.buyerPhone})
                                    </span>
                                  )}
                                </div>
                                {item.deliveryAddress && (
                                  <div className="inline-flex items-center gap-1.5 bg-[#0A1931] border border-[#1E3A6D] px-2.5 py-1 rounded-lg">
                                    <MapPin className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                                    <span className="text-[11px] text-sky-100 font-semibold">
                                      {formatCleanFullAddress(item.deliveryAddress)}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setSelectedAdminMapLocation({
                                          title: `${item.buyerName} — Xaridor Manzili`,
                                          subtitle: item.buyerPhone,
                                          address: item.deliveryAddress || '',
                                          coords: extractCoordsFromAddress(item.deliveryAddress),
                                        })
                                      }
                                      title="Xaritadan ko‘rish"
                                      className="p-1 rounded-md bg-[#FFB800]/20 hover:bg-[#FFB800] text-[#FFB800] hover:text-slate-950 border border-[#FFB800]/50 cursor-pointer transition-all shrink-0 ml-1"
                                    >
                                      <ExternalLink className="w-3 h-3" />
                                    </button>
                                  </div>
                                )}
                              </div>
                            </td>

                            {/* 6. Bunker Stroy Ulushi (Yashil rangda!) */}
                            <td className="py-3.5 px-4 text-right">
                              <span className="inline-block px-2.5 py-1 rounded-lg bg-emerald-500/25 border border-emerald-400/60 font-mono font-black text-emerald-400 text-xs sm:text-sm">
                                {formatPriceSum(itemBunkerShare)}
                              </span>
                              <span className="block mt-1 font-mono font-bold text-[10px] text-emerald-300">
                                Bunker Stroy uchun ajratiladigan {detailedReport.commissionRate}% ({basisLabel})
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                      {detailedReport.sales.length === 0 && (
                        <tr>
                          <td colSpan={6} className="py-10 px-4 text-center text-sky-200 text-xs">
                            Tanlangan davr bo‘yicha sotilgan mahsulotlar mavjud emas.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL: BOSH ADMIN SOZLAMALARI (3 marta Chiqish bosilganda ochiladi)
          ========================================================================= */}
      {isSettingsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
          <div className="bg-[#222528] border border-[#FFB800]/50 rounded-xl max-w-lg w-full p-6 sm:p-8 space-y-6 shadow-2xl relative max-h-[90vh] overflow-y-auto">
            
            <button
              onClick={() => setIsSettingsOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white p-2 rounded-xl bg-[#292C2F] transition-colors"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Header */}
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-2xl bg-amber-500/20 text-amber-400 border border-[#FFB800]/40">
                <Settings className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-black text-white">Sozlamalar Oynasi</h2>
                <p className="text-xs text-[#B8B8B3]">Bosh admin kirish ma'lumotlari va logotip rasmi</p>
              </div>
            </div>

            <form onSubmit={handleSaveSettings} className="space-y-5 text-xs">
              
              {/* Section 1: Login va Parolni Almashtirish */}
              <div className="space-y-3.5 bg-[#151719] p-4 rounded-2xl border border-[#51504A]">
                <span className="text-[11px] font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                  <KeyRound className="w-3.5 h-3.5" />
                  Login va Parolni Almashtirish
                </span>

                <div className="space-y-1">
                  <label className="text-slate-300 font-semibold flex items-center gap-1.5">
                    <UserIcon className="w-3.5 h-3.5 text-[#B8B8B3]" />
                    Yangi Login:
                  </label>
                  <input
                    type="text"
                    required
                    value={newLogin}
                    onChange={(e) => setNewLogin(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-[#222528] border border-[#51504A] rounded-xl text-white text-xs focus:outline-none focus:border-[#FFB800]"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-slate-300 font-semibold">Yangi Parol:</label>
                  <div className="relative">
                    <input
                      type={showNewPassword ? 'text' : 'password'}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="w-full pl-3.5 pr-10 py-2.5 bg-[#222528] border border-[#51504A] rounded-xl text-white text-xs focus:outline-none focus:border-[#FFB800] font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-1"
                    >
                      {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>

              {/* Section 2: Logotipga Rasm Qo‘yish */}
              <div className="space-y-3 bg-[#151719] p-4 rounded-2xl border border-[#51504A]">
                <span className="text-[11px] font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                  <ImageIcon className="w-3.5 h-3.5" />
                  Logotipga Rasm Qo‘yish
                </span>

                <div className="flex flex-wrap items-center gap-3">
                  <label className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold cursor-pointer transition-all active:scale-95 shadow-md">
                    <Upload className="w-4 h-4" />
                    <span>Rasm yuklash</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                  </label>

                  {selectedLogo && (
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-emerald-400 font-semibold px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center gap-1">
                        <Check className="w-3 h-3" /> {selectedFileName || "Rasm tanlandi"}
                      </span>
                      <button
                        type="button"
                        onClick={handleRemoveLogo}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-red-500/15 hover:bg-red-500/25 text-red-400 text-xs transition-colors border border-red-500/30 font-semibold cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>O‘chirish</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Section 3: Ijtimoiy Tarmoqlar & Bog'lanish */}
              <div className="space-y-3 bg-[#151719] p-4 rounded-2xl border border-[#51504A]">
                <span className="text-[11px] font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                  <Share2 className="w-3.5 h-3.5 text-blue-400" />
                  Ijtimoiy Tarmoqlar & Bog'lanish
                </span>

                {/* Telegram input */}
                <div className="space-y-1">
                  <label className="text-xs text-sky-300 font-semibold flex items-center gap-1.5">
                    <RealTelegramLogo className="w-4 h-4 rounded-full overflow-hidden" />
                    Telegram:
                  </label>
                  <input
                    type="text"
                    value={telegram}
                    onChange={(e) => setTelegram(e.target.value)}
                    placeholder="Telegram manzil yoki havola"
                    className="w-full px-3.5 py-2.5 bg-[#222528] border border-[#51504A] rounded-xl text-white text-xs focus:outline-none focus:border-sky-400 font-medium"
                  />
                </div>

                {/* Instagram input */}
                <div className="space-y-1">
                  <label className="text-xs text-pink-300 font-semibold flex items-center gap-1.5">
                    <RealInstagramLogo className="w-4 h-4 rounded overflow-hidden" />
                    Instagram:
                  </label>
                  <input
                    type="text"
                    value={instagram}
                    onChange={(e) => setInstagram(e.target.value)}
                    placeholder="Instagram profil yoki havola"
                    className="w-full px-3.5 py-2.5 bg-[#222528] border border-pink-500/40 rounded-xl text-white text-xs focus:outline-none focus:border-pink-400 font-medium"
                  />
                </div>

                {/* Telefon raqam input */}
                <div className="space-y-1">
                  <label className="text-xs text-emerald-300 font-semibold flex items-center gap-1.5">
                    <RealPhoneLogo className="w-4 h-4 rounded overflow-hidden" />
                    Telefon raqam:
                  </label>
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="Telefon raqam"
                    className="w-full px-3.5 py-2.5 bg-[#222528] border border-emerald-500/40 rounded-xl text-white text-xs focus:outline-none focus:border-emerald-400 font-medium font-mono"
                  />
                </div>
              </div>

              {/* Section 4: Kabinet Loglari (Parol bilan kiriladi) */}
              <div className="space-y-3 bg-[#151719] p-4 rounded-2xl border border-[#FFB800]/50">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                      <Activity className="w-3.5 h-3.5 text-amber-400" />
                      Kabinet Loglari
                    </span>
                    <p className="text-[11px] text-[#B8B8B3] mt-0.5">
                      Kabinet loglariga faqat tasdiqlash paroli orqali kiriladi ({logs.length} ta qayd)
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      openConfirmModal(
                        "Kabinet Loglariga kirish",
                        "Kabinet loglarini ko‘rish uchun parolni kiriting.",
                        () => {
                          setIsSettingsOpen(false);
                          setActiveSection('logs');
                        }
                      );
                    }}
                    className="px-4 py-2.5 rounded-xl bg-[#FFB800] hover:bg-amber-400 text-slate-950 font-black text-xs flex items-center gap-2 cursor-pointer shadow-md active:scale-95 shrink-0"
                  >
                    <Lock className="w-3.5 h-3.5 stroke-[2.5]" />
                    <span>Loglar</span>
                  </button>
                </div>
              </div>

              {errorMessage && (
                <div className="p-3 rounded-xl bg-red-500/20 text-red-300 border border-red-500/30 text-xs font-medium">
                  {errorMessage}
                </div>
              )}

              {saveSuccess && (
                <div className="p-3 rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs flex items-center gap-2 font-medium">
                  <Check className="w-4 h-4" />
                  <span>Sozlamalar muvaffaqiyatli saqlandi!</span>
                </div>
              )}

              {/* Action buttons + Kabinetdan Chiqish (Faqat Sozlamalar ichida) */}
              <div className="flex flex-wrap items-center justify-between gap-2.5 pt-3 border-t border-[#51504A]">
                <button
                  type="button"
                  onClick={() => {
                    setIsSettingsOpen(false);
                    if (onLogout) {
                      onLogout();
                    } else {
                      onGoToShop?.();
                    }
                  }}
                  className="px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white border border-red-400 font-black text-xs flex items-center gap-1.5 cursor-pointer shadow-lg active:scale-95 transition-all"
                  title="Kabinetdan chiqish"
                >
                  <LogOut className="w-4 h-4 stroke-[2.5]" />
                  <span>Kabinetdan Chiqish</span>
                </button>

                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => setIsSettingsOpen(false)}
                    className="px-4 py-2.5 rounded-xl bg-[#292C2F] hover:bg-[#222528] text-slate-300 font-semibold cursor-pointer"
                  >
                    Yopish
                  </button>
                  <button
                    type="submit"
                    className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold shadow-lg shadow-amber-500/20 active:scale-95 transition-all cursor-pointer"
                  >
                    <Save className="w-4 h-4" />
                    <span>Saqlash</span>
                  </button>
                </div>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL: MAHSULOT TURLARI RO'YXATI OYNASI
          ========================================================================= */}
      {(isCategoryPickerOpen || isEditCategoryPickerOpen) && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fadeIn">
          <div className="bg-[#222528] border-2 border-[#FFB800] rounded-xl max-w-lg w-full p-6 sm:p-7 space-y-5 shadow-2xl relative max-h-[85vh] flex flex-col">
            
            <button
              type="button"
              onClick={() => {
                setIsCategoryPickerOpen(false);
                setIsEditCategoryPickerOpen(false);
              }}
              className="absolute top-5 right-5 text-slate-400 hover:text-white p-2 rounded-xl bg-[#292C2F] transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Header */}
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-2xl bg-amber-500/20 text-amber-400 border border-[#FFB800]/40">
                <Layers className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-xl font-black text-white">Mavjud Mahsulot Turlari</h2>
                <p className="text-xs text-[#B8B8B3]">Ro‘yxatdan tanlash yoki yangi turni qo‘shish</p>
              </div>
            </div>

            {/* Yangi turni qo'lda yozish */}
            <div className="bg-[#151719] p-3.5 rounded-2xl border border-[#51504A] space-y-2">
              <label className="text-[11px] font-bold text-amber-400 uppercase tracking-wider block">
                Yangi mahsulot turini yozish:
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={pickerCustomInput}
                  onChange={(e) => setPickerCustomInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleSelectCustomCategory();
                    }
                  }}
                  className="flex-1 px-3.5 py-2.5 bg-[#222528] border border-[#51504A] rounded-xl text-white text-xs font-semibold focus:outline-none focus:border-[#FFB800]"
                />
                <button
                  type="button"
                  onClick={handleSelectCustomCategory}
                  disabled={!pickerCustomInput.trim()}
                  className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed text-slate-950 text-xs font-black transition-all cursor-pointer whitespace-nowrap active:scale-95"
                >
                  Tanlash
                </button>
              </div>
            </div>

            {/* Ro'yxat: Ustun shaklida */}
            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              <div className="text-[11px] font-bold text-[#B8B8B3] uppercase tracking-wider px-1">
                Mavjud Ro‘yxat (Ustun shaklida):
              </div>
              {productTypes.map((pt) => {
                const currentVal = isEditCategoryPickerOpen ? editSuppCategory : newSuppCategory;
                const isSelected = currentVal.toLowerCase() === pt.label.toLowerCase();
                return (
                  <button
                    key={`picker-item-${pt.id}`}
                    type="button"
                    onClick={() => {
                      if (isEditCategoryPickerOpen) {
                        setEditSuppCategory(pt.label);
                        setIsEditCategoryPickerOpen(false);
                      } else {
                        setNewSuppCategory(pt.label);
                        setIsCategoryPickerOpen(false);
                      }
                    }}
                    className={`w-full p-4 rounded-2xl text-xs sm:text-sm font-bold transition-all border flex items-center justify-between cursor-pointer ${
                      isSelected
                        ? 'bg-amber-500 text-slate-950 border-amber-300 font-black shadow-lg scale-[1.01]'
                        : 'bg-[#151719] text-[#F5F5F2] border-[#51504A] hover:border-[#FFB800] hover:bg-[#222528] hover:text-white'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className={`w-2.5 h-2.5 rounded-full ${isSelected ? 'bg-slate-950' : 'bg-amber-400'}`}></span>
                      <span className="text-left font-black">{pt.label}</span>
                    </div>
                    {isSelected ? (
                      <span className="px-2.5 py-1 rounded-xl bg-slate-950 text-amber-400 text-xs font-black flex items-center gap-1">
                        <Check className="w-3.5 h-3.5 stroke-[3]" />
                        <span>Tanlangan</span>
                      </span>
                    ) : (
                      <span className="text-[#B8B8B3] text-xs font-medium px-2.5 py-1 rounded-lg bg-[#222528] border border-[#51504A]">
                        Tanlash
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Footer */}
            <div className="pt-3 border-t border-[#51504A] flex items-center justify-end">
              <button
                type="button"
                onClick={() => {
                  setIsCategoryPickerOpen(false);
                  setIsEditCategoryPickerOpen(false);
                }}
                className="px-5 py-2.5 rounded-xl bg-[#292C2F] hover:bg-[#222528] text-slate-300 text-xs font-bold transition-colors cursor-pointer"
              >
                ✕ Yopish
              </button>
            </div>

          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL: YANGI MOLIYAVIY OPERATSIYA KIRITISH (KIRIM / CHIQIM)
          ========================================================================= */}
      {isAddTxOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fadeIn">
          <div className="bg-[#222528] border-2 border-[#FFB800] rounded-xl max-w-lg w-full p-6 sm:p-8 space-y-5 shadow-2xl relative">
            
            <button
              onClick={() => setIsAddTxOpen(false)}
              className="absolute top-5 right-5 text-slate-400 hover:text-white p-2 rounded-xl bg-[#292C2F] transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Header */}
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-2xl bg-amber-500/20 text-amber-400 border border-[#FFB800]/40">
                <FileSpreadsheet className="w-6 h-6 stroke-[2.5]" />
              </div>
              <div>
                <h2 className="text-xl font-black text-white">Yangi Moliyaviy Operatsiya</h2>
                <p className="text-xs text-[#B8B8B3]">Platforma moliya jurnaliga kirim yoki chiqim qo‘shish</p>
              </div>
            </div>

            <form onSubmit={handleAddTransactionSubmit} className="space-y-4 text-xs">
              
              {/* Operatsiya turi: Kirim yoki Chiqim */}
              <div className="space-y-1.5">
                <label className="text-slate-200 font-bold block">Operatsiya Turi:</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setNewTxType('income');
                      setNewTxCategory('Mahsulotlar savdosi');
                    }}
                    className={`py-3 px-4 rounded-xl font-black text-xs flex items-center justify-center gap-2 border transition-all cursor-pointer ${
                      newTxType === 'income'
                        ? 'bg-emerald-500 text-slate-950 border-emerald-400 shadow-lg shadow-emerald-500/20'
                        : 'bg-[#151719] text-emerald-400 border-[#51504A] hover:border-emerald-500/50'
                    }`}
                  >
                    <ArrowUpRight className="w-4 h-4 stroke-[3]" />
                    <span>+ Kirim (Tushum)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setNewTxType('expense');
                      setNewTxCategory("Ta'minotchi to‘lovi");
                    }}
                    className={`py-3 px-4 rounded-xl font-black text-xs flex items-center justify-center gap-2 border transition-all cursor-pointer ${
                      newTxType === 'expense'
                        ? 'bg-rose-500 text-white border-rose-400 shadow-lg shadow-rose-500/20'
                        : 'bg-[#151719] text-rose-400 border-[#51504A] hover:border-rose-500/50'
                    }`}
                  >
                    <ArrowDownRight className="w-4 h-4 stroke-[3]" />
                    <span>- Chiqim (Xarajat)</span>
                  </button>
                </div>
              </div>

              {/* Toifa (Category) */}
              <div className="space-y-1">
                <label className="text-slate-200 font-bold block">Operatsiya Toifasi:</label>
                <select
                  value={newTxCategory}
                  onChange={(e) => setNewTxCategory(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-[#151719] border border-[#51504A] rounded-lg text-[#F5F5F2] text-xs focus:outline-none focus:border-[#FFB800] cursor-pointer"
                >
                  {newTxType === 'income' ? (
                    <>
                      <option value="Mahsulotlar savdosi">Mahsulotlar savdosi (Xaridor to‘lovi)</option>
                      <option value="Logistika xizmati">Logistika xizmati tushumi</option>
                      <option value="Kafolatlangan bitim komissiyasi">Kafolatlangan bitim komissiyasi</option>
                      <option value="Global bunker ta'minoti">Global bunker ta'minoti</option>
                      <option value="Boshqa kirim">Boshqa kirim operatsiyasi</option>
                    </>
                  ) : (
                    <>
                      <option value="Ta'minotchi to‘lovi">Ta'minotchi to‘lovi (Xarid narxi)</option>
                      <option value="Logistika va yoqilg‘i">Logistika va yoqilg‘i xarajati</option>
                      <option value="Haydovchi xizmat haqi">Haydovchi xizmat haqi</option>
                      <option value="Qaytarilgan tovar kompensatsiyasi">Qaytarilgan tovar kompensatsiyasi</option>
                      <option value="Operatsion xarajatlar">Operatsion va xizmat xarajatlari</option>
                      <option value="Boshqa chiqim">Boshqa chiqim operatsiyasi</option>
                    </>
                  )}
                </select>
              </div>

              {/* Manba / Qabul Qiluvchi */}
              <div className="space-y-1">
                <label className="text-slate-200 font-bold block">
                  {newTxType === 'income' ? 'To‘lovchi Manba / Mijoz:' : 'Qabul Qiluvchi / Ta\'minotchi:'}
                </label>
                <input
                  type="text"
                  required
                  placeholder={newTxType === 'income' ? 'Masalan: «Modern Stroy» MChJ' : 'Masalan: NATH bazasi / Haydovchi'}
                  value={newTxSource}
                  onChange={(e) => setNewTxSource(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-[#151719] border border-[#51504A] rounded-xl text-white text-xs focus:outline-none focus:border-[#FFB800]"
                />
              </div>

              {/* To'lov turi */}
              <div className="space-y-1">
                <label className="text-slate-200 font-bold block">To‘lov Usuli:</label>
                <select
                  value={newTxPaymentMethod}
                  onChange={(e) => setNewTxPaymentMethod(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-[#151719] border border-[#51504A] rounded-xl text-white text-xs focus:outline-none focus:border-[#FFB800] cursor-pointer"
                >
                  <option value="Bank hisob raqami (Perechisleniye)">Bank hisob raqami (Perechisleniye)</option>
                  <option value="Perechisleniye (Kafolatlangan bitim)">Perechisleniye (Kafolatlangan bitim)</option>
                  <option value="Korporativ karta (Humo/Uzcard)">Korporativ karta (Humo/Uzcard)</option>
                  <option value="Karta orqali">Karta orqali</option>
                  <option value="Naqd pul">Naqd pul</option>
                </select>
              </div>

              {/* Summa (so'm) */}
              <div className="space-y-1">
                <label className="text-slate-200 font-bold block">Summa (so‘m):</label>
                <input
                  type="text"
                  required
                  placeholder="Masalan: 15 000 000"
                  value={newTxAmount}
                  onChange={(e) => {
                    const raw = e.target.value.replace(/\D/g, '');
                    if (!raw) {
                      setNewTxAmount('');
                    } else {
                      setNewTxAmount(new Intl.NumberFormat('uz-UZ').format(parseInt(raw, 10)));
                    }
                  }}
                  className="w-full px-3.5 py-2.5 bg-[#151719] border border-[#51504A] rounded-xl text-white text-sm font-mono font-bold focus:outline-none focus:border-[#FFB800]"
                />
              </div>

              {/* Modal Buttons */}
              <div className="pt-3 border-t border-[#51504A] flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsAddTxOpen(false)}
                  className="px-4 py-2.5 rounded-xl bg-[#292C2F] hover:bg-[#222528] text-slate-300 font-bold transition-colors cursor-pointer"
                >
                  Bekor qilish
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black shadow-lg shadow-amber-500/25 transition-all cursor-pointer active:scale-95"
                >
                  Operatsiyani Qo‘shish
                </button>
              </div>

            </form>

          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL: YANGI OG'IR TEXNIKA QO'SHISH
          ========================================================================= */}
      {isAddVehicleOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fadeIn">
          <div className="bg-[#222528] border-2 border-[#FFB800] rounded-xl max-w-lg w-full p-6 sm:p-7 space-y-5 shadow-2xl relative max-h-[90vh] overflow-y-auto">
            <button
              type="button"
              onClick={() => setIsAddVehicleOpen(false)}
              className="absolute top-4 right-4 p-1.5 rounded-lg bg-[#292C2F] text-[#B8B8B3] hover:text-[#F5F5F2] border border-[#51504A] cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3">
              <div className="p-3 rounded-xl bg-[#151719] border border-[#FFB800] text-[#FFB800]">
                <Truck className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-[#F5F5F2]">Yangi Og‘ir Texnika Qo‘shish</h3>
                <p className="text-xs text-[#B8B8B3]">Flotga samosval, kran, mikser yoki yuk mashinasi kiritish</p>
              </div>
            </div>

            <form onSubmit={handleAddVehicleSubmit} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="text-[#F5F5F2] font-bold">Texnika Modeli va Nomi:</label>
                <input
                  type="text"
                  required
                  placeholder="Masalan: Shacman F3000 Samosval"
                  value={newVehName}
                  onChange={(e) => setNewVehName(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-[#151719] border border-[#51504A] rounded-lg text-[#F5F5F2] focus:outline-none focus:border-[#FFB800]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[#F5F5F2] font-bold">Texnika Turi:</label>
                  <select
                    value={newVehType}
                    onChange={(e: any) => setNewVehType(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-[#151719] border border-[#51504A] rounded-lg text-[#F5F5F2] focus:outline-none focus:border-[#FFB800] cursor-pointer"
                  >
                    <option value="samosval">Samosval (Tosh/Qum/Sement)</option>
                    <option value="fura">Katta Fura (Yarim tirkama)</option>
                    <option value="kran_manipulyator">Kran / Manipulyator</option>
                    <option value="mikser">Beton Qorgich (Mikser)</option>
                    <option value="gazel">Kichik Bortli Gazel</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[#F5F5F2] font-bold">Yuk Sig‘imi (tonna):</label>
                  <input
                    type="number"
                    required
                    placeholder="25"
                    value={newVehCapacity}
                    onChange={(e) => setNewVehCapacity(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-[#151719] border border-[#51504A] rounded-lg text-[#F5F5F2] focus:outline-none focus:border-[#FFB800]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[#F5F5F2] font-bold">Haydovchi F.I.Sh:</label>
                  <input
                    type="text"
                    required
                    placeholder="Alisher Zokirov"
                    value={newVehDriver}
                    onChange={(e) => setNewVehDriver(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-[#151719] border border-[#51504A] rounded-lg text-[#F5F5F2] focus:outline-none focus:border-[#FFB800]"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[#F5F5F2] font-bold">Telefon Raqami:</label>
                  <input
                    type="text"
                    required
                    value={newVehPhone}
                    onChange={(e) => setNewVehPhone(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-[#151719] border border-[#51504A] rounded-lg text-[#F5F5F2] font-mono focus:outline-none focus:border-[#FFB800]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[#F5F5F2] font-bold">1 km Narxi (so‘m):</label>
                  <input
                    type="number"
                    required
                    placeholder="14000"
                    value={newVehPriceKm}
                    onChange={(e) => setNewVehPriceKm(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-[#151719] border border-[#51504A] rounded-lg text-[#F5F5F2] font-mono focus:outline-none focus:border-[#FFB800]"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[#F5F5F2] font-bold">Doimiy Baza / Lokatsiya:</label>
                  <input
                    type="text"
                    required
                    placeholder="Toshkent, Sergeli ombori"
                    value={newVehLocation}
                    onChange={(e) => setNewVehLocation(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-[#151719] border border-[#51504A] rounded-lg text-[#F5F5F2] focus:outline-none focus:border-[#FFB800]"
                  />
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-3 border-t border-[#51504A]">
                <button
                  type="button"
                  onClick={() => setIsAddVehicleOpen(false)}
                  className="px-4 py-2 rounded-lg bg-[#292C2F] text-[#B8B8B3] hover:text-[#F5F5F2] border border-[#51504A] cursor-pointer"
                >
                  Bekor qilish
                </button>
                <button
                  type="submit"
                  className="btn-industrial-yellow px-5 py-2 rounded-lg font-bold flex items-center gap-2 cursor-pointer shadow-md"
                >
                  <Check className="w-4 h-4 stroke-[2.5]" />
                  <span>Flotga Qo‘shish</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL: YANGI GLOBAL HAMKOR QO'SHISH
          ========================================================================= */}
      {isAddGlobalPartnerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fadeIn">
          <div className="bg-[#222528] border-2 border-[#FFB800] rounded-xl max-w-lg w-full p-6 sm:p-7 space-y-5 shadow-2xl relative max-h-[90vh] overflow-y-auto">
            <button
              type="button"
              onClick={() => setIsAddGlobalPartnerOpen(false)}
              className="absolute top-4 right-4 p-1.5 rounded-lg bg-[#292C2F] text-[#B8B8B3] hover:text-[#F5F5F2] border border-[#51504A] cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3">
              <div className="p-3 rounded-xl bg-[#151719] border border-[#FFB800] text-[#FFB800]">
                <Globe className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-[#F5F5F2]">Yangi Global Hamkor Biriktirish</h3>
                <p className="text-xs text-[#B8B8B3]">Xalqaro zavod yoki ishlab chiqaruvchini tizimga kiritish</p>
              </div>
            </div>

            <form onSubmit={handleAddGlobalPartnerSubmit} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="text-[#F5F5F2] font-bold">Kompaniya yoki Zavod Nomi:</label>
                <input
                  type="text"
                  required
                  placeholder="Heidelberg Materials AG"
                  value={newGpName}
                  onChange={(e) => setNewGpName(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-[#151719] border border-[#51504A] rounded-lg text-[#F5F5F2] focus:outline-none focus:border-[#FFB800]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[#F5F5F2] font-bold">Davlat:</label>
                  <input
                    type="text"
                    required
                    placeholder="Germaniya"
                    value={newGpCountry}
                    onChange={(e) => setNewGpCountry(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-[#151719] border border-[#51504A] rounded-lg text-[#F5F5F2] focus:outline-none focus:border-[#FFB800]"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[#F5F5F2] font-bold">Bayroq / Emodzi:</label>
                  <input
                    type="text"
                    placeholder="🇩🇪 yoki 🌐"
                    value={newGpFlag}
                    onChange={(e) => setNewGpFlag(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-[#151719] border border-[#51504A] rounded-lg text-[#F5F5F2] text-center focus:outline-none focus:border-[#FFB800]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[#F5F5F2] font-bold">Kategoriya:</label>
                  <select
                    value={newGpCategory}
                    onChange={(e) => setNewGpCategory(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-[#151719] border border-[#51504A] rounded-lg text-[#F5F5F2] focus:outline-none focus:border-[#FFB800] cursor-pointer"
                  >
                    <option value="Metall va Po‘lat">Metall va Po‘lat</option>
                    <option value="Sement va Klinker">Sement va Klinker</option>
                    <option value="Quruq Aralashmalar">Quruq Aralashmalar</option>
                    <option value="Izolyatsiya va Akustika">Izolyatsiya va Akustika</option>
                    <option value="Kimyoviy Qo‘shimchalar">Kimyoviy Qo‘shimchalar</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[#F5F5F2] font-bold">Mahsulot Turi:</label>
                  <input
                    type="text"
                    required
                    placeholder="Sulfatga chidamli sement"
                    value={newGpProductType}
                    onChange={(e) => setNewGpProductType(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-[#151719] border border-[#51504A] rounded-lg text-[#F5F5F2] focus:outline-none focus:border-[#FFB800]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[#F5F5F2] font-bold">Yillik Ta'minot Quvvati:</label>
                  <input
                    type="text"
                    placeholder="50,000 tonna"
                    value={newGpVolume}
                    onChange={(e) => setNewGpVolume(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-[#151719] border border-[#51504A] rounded-lg text-[#F5F5F2] focus:outline-none focus:border-[#FFB800]"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[#F5F5F2] font-bold">Mas'ul Vakil F.I.Sh:</label>
                  <input
                    type="text"
                    placeholder="Hans Weber"
                    value={newGpContact}
                    onChange={(e) => setNewGpContact(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-[#151719] border border-[#51504A] rounded-lg text-[#F5F5F2] focus:outline-none focus:border-[#FFB800]"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[#F5F5F2] font-bold">Aloqa Telefoni / Email:</label>
                <input
                  type="text"
                  placeholder="+49 151 234567"
                  value={newGpPhone}
                  onChange={(e) => setNewGpPhone(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-[#151719] border border-[#51504A] rounded-lg text-[#F5F5F2] font-mono focus:outline-none focus:border-[#FFB800]"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-3 border-t border-[#51504A]">
                <button
                  type="button"
                  onClick={() => setIsAddGlobalPartnerOpen(false)}
                  className="px-4 py-2 rounded-lg bg-[#292C2F] text-[#B8B8B3] hover:text-[#F5F5F2] border border-[#51504A] cursor-pointer"
                >
                  Bekor qilish
                </button>
                <button
                  type="submit"
                  className="btn-industrial-yellow px-5 py-2 rounded-lg font-bold flex items-center gap-2 cursor-pointer shadow-md"
                >
                  <Check className="w-4 h-4 stroke-[2.5]" />
                  <span>Global Ta'minotchini Saqlash</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL: TA'MINOTCHI HAQIDA MA'LUMOTLAR (KORXONA PROFILI)
          ========================================================================= */}
      {isAboutSupplierOpen && aboutSupplier && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fadeIn">
          <div className="bg-[#222528] border-2 border-sky-400/80 rounded-xl max-w-xl w-full p-6 sm:p-7 space-y-5 shadow-2xl relative max-h-[90vh] overflow-y-auto">
            <button
              type="button"
              onClick={() => setIsAboutSupplierOpen(false)}
              className="absolute top-4 right-4 p-1.5 rounded-lg bg-[#292C2F] text-[#B8B8B3] hover:text-[#F5F5F2] border border-[#51504A] cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 pb-3 border-b border-[#51504A]">
              <div className="p-3 rounded-xl bg-[#151719] border border-sky-400 text-sky-400">
                <Building className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-[#F5F5F2] flex items-center gap-2">
                  <span>{aboutSupplier.companyName}</span>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase ${
                    aboutSupplier.status === 'active'
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                      : 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                  }`}>
                    {aboutSupplier.status === 'active' ? 'Faol Hamkor' : 'Kutilmoqda'}
                  </span>
                </h3>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              {aboutSupplier.inn && (
                <div className="p-3 rounded-lg bg-[#151719] border border-[#FFB800]/40 space-y-1 sm:col-span-2">
                  <span className="text-[10px] font-mono text-[#B8B8B3] block">STIR Raqami (INN):</span>
                  <span className="font-black text-[#FFB800] text-sm font-mono flex items-center gap-1.5">
                    <Building className="w-4 h-4 text-[#FFB800]" />
                    {aboutSupplier.inn}
                  </span>
                </div>
              )}

              <div className="p-3 rounded-lg bg-[#151719] border border-[#51504A] space-y-1">
                <span className="text-[10px] font-mono text-[#B8B8B3] block">Mas'ul Vakil:</span>
                <span className="font-bold text-[#F5F5F2] text-sm flex items-center gap-1.5">
                  <UserIcon className="w-4 h-4 text-[#FFB800]" />
                  {aboutSupplier.name} {aboutSupplier.surname || ''}
                </span>
              </div>

              <div className="p-3 rounded-lg bg-[#151719] border border-[#51504A] space-y-1">
                <span className="text-[10px] font-mono text-[#B8B8B3] block">Aloqa Telefoni:</span>
                <span className="font-bold text-[#FFB800] text-sm font-mono flex items-center gap-1.5">
                  <Phone className="w-4 h-4 text-[#FFB800]" />
                  {aboutSupplier.phone}
                </span>
              </div>

              <div className="p-3 rounded-lg bg-[#151719] border border-[#51504A] space-y-1">
                <span className="text-[10px] font-mono text-[#B8B8B3] block">Viloyat / Hudud:</span>
                <span className="font-bold text-[#F5F5F2] flex items-center gap-1.5">
                  <MapPin className="w-4 h-4 text-[#FFB800]" />
                  {aboutSupplier.region}
                </span>
              </div>

              <div className="p-3 rounded-lg bg-[#151719] border border-[#51504A] space-y-1">
                <span className="text-[10px] font-mono text-[#B8B8B3] block">Tizimga Kirish Logini:</span>
                <span className="font-bold text-amber-300 font-mono flex items-center gap-1.5">
                  <KeyRound className="w-4 h-4 text-amber-400" />
                  {aboutSupplier.login}
                </span>
              </div>

              <div className="p-3 rounded-lg bg-[#151719] border border-[#51504A] space-y-1">
                <span className="text-[10px] font-mono text-[#B8B8B3] block">Mahsulot Kategoriyasi:</span>
                <span className="font-bold text-[#F5F5F2] flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-[#FFB800]" />
                  {aboutSupplier.category}
                </span>
              </div>

              <div className="p-3 rounded-lg bg-[#151719] border border-[#51504A] space-y-1">
                <span className="text-[10px] font-mono text-[#B8B8B3] block">Shartnoma va Komissiya Foizi:</span>
                <span className="font-bold text-[#F5F5F2] flex items-center gap-2">
                  <FileText className="w-4 h-4 text-[#FFB800]" />
                  <span>№ {aboutSupplier.contractNumber}</span>
                  <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-mono font-black text-xs">
                    {aboutSupplier.commissionRate || 5}%
                  </span>
                </span>
              </div>
            </div>

            {aboutSupplier.contractPdfData && (
              <div className="p-3.5 rounded-lg bg-[#151719] border border-[#51504A] text-xs">
                <button
                  type="button"
                  onClick={() => handleDownloadPdf(aboutSupplier.contractPdfData, aboutSupplier.contractPdfName || 'shartnoma_fayli')}
                  className="btn-industrial-yellow px-3 py-1.5 rounded-lg text-xs font-bold inline-flex items-center gap-2 cursor-pointer shadow-sm"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Rasmiy Shartnoma Faylini Yuklab Olish (PDF)</span>
                </button>
              </div>
            )}

            <div className="pt-2 flex items-center justify-between border-t border-[#51504A]">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsAboutSupplierOpen(false);
                    handleOpenEditSupplier(aboutSupplier);
                  }}
                  className="px-4 py-2 rounded-lg bg-[#FFB800]/20 hover:bg-[#FFB800] text-[#FFB800] hover:text-[#151719] border border-[#FFB800]/50 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  <span>Ma'lumotlarni Tahrirlash</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleRequestDeleteSupplier(aboutSupplier)}
                  className="px-4 py-2 rounded-lg bg-red-500/20 hover:bg-red-600 text-red-400 hover:text-white border border-red-500/40 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>O‘chirish</span>
                </button>
              </div>

              <button
                type="button"
                onClick={() => setIsAboutSupplierOpen(false)}
                className="px-4 py-2 rounded-lg bg-[#292C2F] text-[#B8B8B3] hover:text-[#F5F5F2] border border-[#51504A] text-xs font-bold cursor-pointer"
              >
                Yopish
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL: GLOBAL TA'MINOTCHINI TAHRIRLASH
          ========================================================================= */}
      {isEditGlobalPartnerOpen && editingGlobalPartner && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fadeIn">
          <div className="bg-[#222528] border-2 border-[#FFB800] rounded-xl max-w-lg w-full p-6 sm:p-7 space-y-5 shadow-2xl relative max-h-[90vh] overflow-y-auto">
            <button
              type="button"
              onClick={() => {
                setIsEditGlobalPartnerOpen(false);
                setEditingGlobalPartner(null);
              }}
              className="absolute top-4 right-4 p-1.5 rounded-lg bg-[#292C2F] text-[#B8B8B3] hover:text-[#F5F5F2] border border-[#51504A] cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3">
              <div className="p-3 rounded-xl bg-[#151719] border border-[#FFB800] text-[#FFB800]">
                <Globe className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-[#F5F5F2]">Global Ta'minotchini Tahrirlash</h3>
                <p className="text-xs text-[#B8B8B3]">Xalqaro zavod va import hamkori ma'lumotlarini yangilash</p>
              </div>
            </div>

            <form onSubmit={handleEditGlobalPartnerSubmit} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="text-[#F5F5F2] font-bold">Kompaniya yoki Zavod Nomi:</label>
                <input
                  type="text"
                  required
                  value={editGpName}
                  onChange={(e) => setEditGpName(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-[#151719] border border-[#51504A] rounded-lg text-[#F5F5F2] focus:outline-none focus:border-[#FFB800]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[#F5F5F2] font-bold">Davlat:</label>
                  <input
                    type="text"
                    required
                    value={editGpCountry}
                    onChange={(e) => setEditGpCountry(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-[#151719] border border-[#51504A] rounded-lg text-[#F5F5F2] focus:outline-none focus:border-[#FFB800]"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[#F5F5F2] font-bold">Bayroq / Emodzi:</label>
                  <input
                    type="text"
                    value={editGpFlag}
                    onChange={(e) => setEditGpFlag(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-[#151719] border border-[#51504A] rounded-lg text-[#F5F5F2] text-center focus:outline-none focus:border-[#FFB800]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[#F5F5F2] font-bold">Kategoriya:</label>
                  <select
                    value={editGpCategory}
                    onChange={(e) => setEditGpCategory(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-[#151719] border border-[#51504A] rounded-lg text-[#F5F5F2] focus:outline-none focus:border-[#FFB800] cursor-pointer"
                  >
                    <option value="Metall va Po‘lat">Metall va Po‘lat</option>
                    <option value="Sement va Klinker">Sement va Klinker</option>
                    <option value="Quruq Aralashmalar">Quruq Aralashmalar</option>
                    <option value="Izolyatsiya va Akustika">Izolyatsiya va Akustika</option>
                    <option value="Kimyoviy Qo‘shimchalar">Kimyoviy Qo‘shimchalar</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[#F5F5F2] font-bold">Mahsulot Turi:</label>
                  <input
                    type="text"
                    required
                    value={editGpProductType}
                    onChange={(e) => setEditGpProductType(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-[#151719] border border-[#51504A] rounded-lg text-[#F5F5F2] focus:outline-none focus:border-[#FFB800]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[#F5F5F2] font-bold">Yillik Ta'minot Quvvati:</label>
                  <input
                    type="text"
                    value={editGpVolume}
                    onChange={(e) => setEditGpVolume(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-[#151719] border border-[#51504A] rounded-lg text-[#F5F5F2] focus:outline-none focus:border-[#FFB800]"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[#F5F5F2] font-bold">Tranzit Muddati:</label>
                  <input
                    type="text"
                    value={editGpDeliveryDays}
                    onChange={(e) => setEditGpDeliveryDays(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-[#151719] border border-[#51504A] rounded-lg text-[#F5F5F2] focus:outline-none focus:border-[#FFB800]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[#F5F5F2] font-bold">Mas'ul Vakil F.I.Sh:</label>
                  <input
                    type="text"
                    value={editGpContact}
                    onChange={(e) => setEditGpContact(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-[#151719] border border-[#51504A] rounded-lg text-[#F5F5F2] focus:outline-none focus:border-[#FFB800]"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[#F5F5F2] font-bold">Aloqa Telefoni / Email:</label>
                  <input
                    type="text"
                    value={editGpPhone}
                    onChange={(e) => setEditGpPhone(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-[#151719] border border-[#51504A] rounded-lg text-[#F5F5F2] font-mono focus:outline-none focus:border-[#FFB800]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[#F5F5F2] font-bold">Narx Sharti:</label>
                  <input
                    type="text"
                    value={editGpPriceTerm}
                    onChange={(e) => setEditGpPriceTerm(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-[#151719] border border-[#51504A] rounded-lg text-[#F5F5F2] focus:outline-none focus:border-[#FFB800]"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[#F5F5F2] font-bold">Hamkorlik Holati:</label>
                  <select
                    value={editGpContractStatus}
                    onChange={(e: any) => setEditGpContractStatus(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-[#151719] border border-[#51504A] rounded-lg text-[#F5F5F2] focus:outline-none focus:border-[#FFB800] cursor-pointer"
                  >
                    <option value="active">Faol Hamkor</option>
                    <option value="in_transit">Tranzitda (Yo‘lda)</option>
                    <option value="customs">Bojxona Nazoratida</option>
                  </select>
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-3 border-t border-[#51504A]">
                <button
                  type="button"
                  onClick={() => {
                    setIsEditGlobalPartnerOpen(false);
                    setEditingGlobalPartner(null);
                  }}
                  className="px-4 py-2 rounded-lg bg-[#292C2F] text-[#B8B8B3] hover:text-[#F5F5F2] border border-[#51504A] cursor-pointer"
                >
                  Bekor qilish
                </button>
                <button
                  type="submit"
                  className="btn-industrial-yellow px-5 py-2 rounded-lg font-bold flex items-center gap-2 cursor-pointer shadow-md"
                >
                  <Check className="w-4 h-4 stroke-[2.5]" />
                  <span>O‘zgarishlarni Saqlash</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL: LOGISTIK TA'MINOTCHINI / TEXNIKANI TAHRIRLASH
          ========================================================================= */}
      {isEditVehicleOpen && editingVehicle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fadeIn">
          <div className="bg-[#222528] border-2 border-[#FFB800] rounded-xl max-w-lg w-full p-6 sm:p-7 space-y-5 shadow-2xl relative max-h-[90vh] overflow-y-auto">
            <button
              type="button"
              onClick={() => {
                setIsEditVehicleOpen(false);
                setEditingVehicle(null);
              }}
              className="absolute top-4 right-4 p-1.5 rounded-lg bg-[#292C2F] text-[#B8B8B3] hover:text-[#F5F5F2] border border-[#51504A] cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3">
              <div className="p-3 rounded-xl bg-[#151719] border border-[#FFB800] text-[#FFB800]">
                <Truck className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-[#F5F5F2]">Logistik Ta'minotchini Tahrirlash</h3>
                <p className="text-xs text-[#B8B8B3]">Texnika va mas'ul haydovchi ma'lumotlarini yangilash</p>
              </div>
            </div>

            <form onSubmit={handleEditVehicleSubmit} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="text-[#F5F5F2] font-bold">Texnika Modeli va Nomi:</label>
                <input
                  type="text"
                  required
                  value={editVehName}
                  onChange={(e) => setEditVehName(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-[#151719] border border-[#51504A] rounded-lg text-[#F5F5F2] focus:outline-none focus:border-[#FFB800]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[#F5F5F2] font-bold">Texnika Turi:</label>
                  <select
                    value={editVehType}
                    onChange={(e: any) => setEditVehType(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-[#151719] border border-[#51504A] rounded-lg text-[#F5F5F2] focus:outline-none focus:border-[#FFB800] cursor-pointer"
                  >
                    <option value="samosval">Samosval (Tosh/Qum/Sement)</option>
                    <option value="fura">Katta Fura (Yarim tirkama)</option>
                    <option value="kran_manipulyator">Kran / Manipulyator</option>
                    <option value="mikser">Beton Qorgich (Mikser)</option>
                    <option value="gazel">Kichik Bortli Gazel</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[#F5F5F2] font-bold">Yuk Sig‘imi (tonna):</label>
                  <input
                    type="number"
                    required
                    value={editVehCapacity}
                    onChange={(e) => setEditVehCapacity(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-[#151719] border border-[#51504A] rounded-lg text-[#F5F5F2] focus:outline-none focus:border-[#FFB800]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[#F5F5F2] font-bold">Haydovchi / Mas'ul F.I.Sh:</label>
                  <input
                    type="text"
                    required
                    value={editVehDriver}
                    onChange={(e) => setEditVehDriver(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-[#151719] border border-[#51504A] rounded-lg text-[#F5F5F2] focus:outline-none focus:border-[#FFB800]"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[#F5F5F2] font-bold">Telefon Raqami:</label>
                  <input
                    type="text"
                    required
                    value={editVehPhone}
                    onChange={(e) => setEditVehPhone(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-[#151719] border border-[#51504A] rounded-lg text-[#F5F5F2] font-mono focus:outline-none focus:border-[#FFB800]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[#F5F5F2] font-bold">1 km Narxi (so‘m):</label>
                  <input
                    type="number"
                    required
                    value={editVehPriceKm}
                    onChange={(e) => setEditVehPriceKm(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-[#151719] border border-[#51504A] rounded-lg text-[#F5F5F2] font-mono focus:outline-none focus:border-[#FFB800]"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[#F5F5F2] font-bold">Doimiy Baza / Lokatsiya:</label>
                  <input
                    type="text"
                    required
                    value={editVehLocation}
                    onChange={(e) => setEditVehLocation(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-[#151719] border border-[#51504A] rounded-lg text-[#F5F5F2] focus:outline-none focus:border-[#FFB800]"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[#F5F5F2] font-bold">Transport Holati:</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setEditVehAvailable(true)}
                    className={`py-2 px-3 rounded-lg font-bold text-xs flex items-center justify-center gap-2 border cursor-pointer ${
                      editVehAvailable
                        ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500'
                        : 'bg-[#151719] text-[#B8B8B3] border-[#51504A]'
                    }`}
                  >
                    <span>● Bo‘sh (Tayyor)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditVehAvailable(false)}
                    className={`py-2 px-3 rounded-lg font-bold text-xs flex items-center justify-center gap-2 border cursor-pointer ${
                      !editVehAvailable
                        ? 'bg-amber-500/20 text-amber-400 border-amber-500'
                        : 'bg-[#151719] text-[#B8B8B3] border-[#51504A]'
                    }`}
                  >
                    <span>○ Band (Yo‘lda)</span>
                  </button>
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-3 border-t border-[#51504A]">
                <button
                  type="button"
                  onClick={() => {
                    setIsEditVehicleOpen(false);
                    setEditingVehicle(null);
                  }}
                  className="px-4 py-2 rounded-lg bg-[#292C2F] text-[#B8B8B3] hover:text-[#F5F5F2] border border-[#51504A] cursor-pointer"
                >
                  Bekor qilish
                </button>
                <button
                  type="submit"
                  className="btn-industrial-yellow px-5 py-2 rounded-lg font-bold flex items-center gap-2 cursor-pointer shadow-md"
                >
                  <Check className="w-4 h-4 stroke-[2.5]" />
                  <span>O‘zgarishlarni Saqlash</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL: IJTIMOIY TARMOQ LINKINI ALMASHTIRISH VA LINKGA O'TISH
          (Telegram, Instagram, Telefon uchun maxsus boshqaruv)
          ========================================================================= */}
      {socialModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="bg-[#222528] border-2 border-[#FFB800] rounded-xl max-w-md w-full p-6 space-y-5 shadow-2xl relative">
            <button
              type="button"
              onClick={() => setSocialModal(null)}
              className="absolute top-4 right-4 p-1.5 rounded-lg bg-[#292C2F] text-[#B8B8B3] hover:text-[#F5F5F2] border border-[#51504A] cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#151719] border border-[#FFB800] flex items-center justify-center text-[#FFB800]">
                {socialModal.type === 'telegram' && <RealTelegramLogo className="w-5 h-5" />}
                {socialModal.type === 'instagram' && <RealInstagramLogo className="w-5 h-5" />}
                {socialModal.type === 'phone' && <RealPhoneLogo className="w-5 h-5" />}
              </div>
              <div>
                <h3 className="text-base font-bold text-[#F5F5F2]">{socialModal.title}</h3>
                <p className="text-xs text-[#B8B8B3]">Havolaga o‘tish yoki yangi link/raqamga almashtirish</p>
              </div>
            </div>

            <div className="space-y-4 pt-1">
              {/* Amaldagi havola va Havolaga o'tish tugmasi */}
              <div className="p-3 rounded-lg bg-[#151719] border border-[#51504A] space-y-2">
                <span className="text-[11px] uppercase font-mono text-[#B8B8B3] block">Amaldagi Havola:</span>
                <div className="text-xs font-mono font-bold text-white break-all">
                  {socialModal.currentVal || 'Kiritilmagan'}
                </div>
                {socialModal.currentVal && (
                  <a
                    href={
                      socialModal.type === 'phone'
                        ? `tel:${socialModal.currentVal.replace(/[^0-9+]/g, '')}`
                        : socialModal.currentVal.startsWith('http')
                        ? socialModal.currentVal
                        : socialModal.type === 'telegram'
                        ? `https://t.me/${socialModal.currentVal.replace('@', '')}`
                        : `https://instagram.com/${socialModal.currentVal.replace('@', '')}`
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#292C2F] hover:bg-[#FFB800] text-[#FFB800] hover:text-[#151719] border border-[#51504A] text-xs font-bold transition-all cursor-pointer mt-1"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Havolaga o‘tish</span>
                  </a>
                )}
              </div>

              {/* Havolani almashtirish */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-[#F5F5F2] block">Yangi Havolani Kiriting:</label>
                <input
                  type="text"
                  value={socialEditVal}
                  onChange={(e) => setSocialEditVal(e.target.value)}
                  placeholder={
                    socialModal.type === 'telegram'
                      ? 'https://t.me/bunkerstroy yoki @bunkerstroy'
                      : socialModal.type === 'instagram'
                      ? 'https://instagram.com/bunkerstroy'
                      : '+998 90 123 45 67'
                  }
                  className="w-full px-3.5 py-2.5 bg-[#151719] border border-[#51504A] rounded-lg text-white text-xs font-mono focus:outline-none focus:border-[#FFB800]"
                />
              </div>

              {socialSavedNotice && (
                <div className="p-2.5 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-bold flex items-center gap-2 animate-fadeIn">
                  <Check className="w-4 h-4 text-emerald-400" />
                  <span>Havola muvaffaqiyatli almashtirildi va saqlandi!</span>
                </div>
              )}

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-[#51504A]">
                <button
                  type="button"
                  onClick={() => {
                    setSocialModal(null);
                    setSocialConfirmPass('');
                    setSocialConfirmError(null);
                  }}
                  className="px-4 py-2 rounded-lg bg-[#292C2F] text-xs font-bold text-[#B8B8B3] hover:text-[#F5F5F2] border border-[#51504A] cursor-pointer"
                >
                  Yopish
                </button>
                <button
                  type="button"
                  onClick={() => {
                    openConfirmModal(
                      "Havolani saqlashni tasdiqlash",
                      `${socialModal.title} havolasini yangilash uchun tasdiqlash parolini kiriting.`,
                      () => {
                        const trimmed = socialEditVal.trim();
                        const updatedConfig = {
                          ...config,
                          [socialModal.type]: trimmed,
                        };
                        saveAdminConfig(updatedConfig);
                        if (onConfigChange) onConfigChange(updatedConfig);
                        setConfig(updatedConfig);
                        setSocialModal({
                          ...socialModal,
                          currentVal: trimmed,
                        });
                        setSocialConfirmPass('');
                        setSocialSavedNotice(true);
                        addLog('Ijtimoiy havola yangilandi', 'system', `${socialModal.title} yangilandi: ${trimmed}`, 'info');
                        setTimeout(() => setSocialSavedNotice(false), 2500);
                      }
                    );
                  }}
                  className="btn-industrial-yellow px-5 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-md"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>Havolani Saqlash</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          UNIVERSAL MODAL: TASDIQLASH PAROLI OYNASI (Aquarius.102)
          ========================================================================= */}
      {confirmModal && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fadeIn">
          <div className="bg-[#222528] border-2 border-[#FFB800] rounded-xl max-w-md w-full p-6 space-y-4 shadow-2xl relative">
            <button
              type="button"
              onClick={() => setConfirmModal(null)}
              className="absolute top-4 right-4 p-1.5 rounded-lg bg-[#292C2F] text-[#B8B8B3] hover:text-[#F5F5F2] border border-[#51504A] cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#151719] border border-[#FFB800] flex items-center justify-center text-[#FFB800]">
                <Lock className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-[#F5F5F2]">{confirmModal.title}</h3>
                <p className="text-xs text-[#B8B8B3]">{confirmModal.description}</p>
              </div>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!isValidConfirmPassword(confirmModalPass)) {
                  setConfirmModalError("Kiritilgan tasdiqlash paroli noto'g'ri!");
                  return;
                }
                const fn = confirmModal.onConfirm;
                setConfirmModal(null);
                setConfirmModalPass('');
                setConfirmModalError(null);
                fn();
              }}
              className="space-y-4 pt-1"
            >
              <div className="space-y-1.5 bg-[#151719] p-3.5 rounded-xl border border-[#FFB800]/40">
                <label className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                  <KeyRound className="w-3.5 h-3.5 text-amber-400" />
                  Tasdiqlash paroli:
                </label>
                <input
                  type="password"
                  required
                  autoFocus
                  value={confirmModalPass}
                  onChange={(e) => {
                    setConfirmModalPass(e.target.value);
                    setConfirmModalError(null);
                  }}
                  placeholder="Tasdiqlash parolini kiriting"
                  className="w-full px-3.5 py-2.5 bg-[#222528] border border-amber-500/50 rounded-lg text-white text-xs font-mono focus:outline-none focus:border-[#FFB800]"
                />
                {confirmModalError && (
                  <p className="text-red-400 text-[11px] font-bold">{confirmModalError}</p>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#51504A]">
                <button
                  type="button"
                  onClick={() => setConfirmModal(null)}
                  className="px-4 py-2 rounded-lg bg-[#292C2F] text-xs font-bold text-[#B8B8B3] hover:text-[#F5F5F2] border border-[#51504A] cursor-pointer"
                >
                  Bekor qilish
                </button>
                <button
                  type="submit"
                  className="btn-industrial-yellow px-5 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-md"
                >
                  <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                  <span>Tasdiqlash</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL: KATEGORIYALARNI BOSHQARISH VA TANLASH (Barcha toifalar ro'yxati)
          ========================================================================= */}
      {(isCategoryPickerOpen || isEditCategoryPickerOpen) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="bg-[#222528] border-2 border-[#FFB800] rounded-xl max-w-md w-full p-6 space-y-4 shadow-2xl relative max-h-[85vh] overflow-y-auto">
            <button
              type="button"
              onClick={() => {
                setIsCategoryPickerOpen(false);
                setIsEditCategoryPickerOpen(false);
              }}
              className="absolute top-4 right-4 p-1.5 rounded-lg bg-[#292C2F] text-[#B8B8B3] hover:text-[#F5F5F2] border border-[#51504A] cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2.5">
              <div className="p-2.5 rounded-xl bg-[#151719] border border-[#FFB800] text-[#FFB800]">
                <Layers className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-[#F5F5F2]">Bunker Mahsulot Toifalari</h3>
                <p className="text-xs text-[#B8B8B3]">Mavjud toifani tanlang yoki yangisini kiriting</p>
              </div>
            </div>

            {/* Yangi toifa kiritish */}
            <div className="p-3 rounded-lg bg-[#151719] border border-[#51504A] space-y-2">
              <label className="text-xs font-bold text-[#FFB800] block">+ Yangi toifa qo‘shish:</label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Yangi toifa nomi (Masalan: Sement, Shag'al...)"
                  value={pickerCustomInput}
                  onChange={(e) => setPickerCustomInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      const val = pickerCustomInput.trim();
                      if (val.length >= 2) {
                        const updated = addProductType(val);
                        setProductTypes(updated);
                        if (isCategoryPickerOpen) setNewSuppCategory(val);
                        if (isEditCategoryPickerOpen) setEditSuppCategory(val);
                        setPickerCustomInput('');
                      }
                    }
                  }}
                  className="flex-1 px-3 py-2 bg-[#222528] border border-[#51504A] rounded-lg text-white text-xs focus:outline-none focus:border-[#FFB800]"
                />
                <button
                  type="button"
                  onClick={() => {
                    const val = pickerCustomInput.trim();
                    if (val.length >= 2) {
                      const updated = addProductType(val);
                      setProductTypes(updated);
                      if (isCategoryPickerOpen) setNewSuppCategory(val);
                      if (isEditCategoryPickerOpen) setEditSuppCategory(val);
                      setPickerCustomInput('');
                    }
                  }}
                  className="btn-industrial-yellow px-3.5 py-2 rounded-lg text-xs font-bold cursor-pointer whitespace-nowrap shadow-sm"
                >
                  Qo‘shish
                </button>
              </div>
            </div>

            {/* Mavjud toifalar ro'yxati */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs text-[#B8B8B3]">
                <span className="font-bold">Mavjud toifalar ({productTypes.length} ta):</span>
              </div>
              {productTypes.length === 0 ? (
                <div className="p-4 rounded-lg bg-[#151719] border border-[#51504A] text-center text-xs text-[#B8B8B3]">
                  Hozircha kategoriyalar kiritilmagan. Yuqoridagi maydon orqali yangi toifa qo‘shishingiz mumkin.
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-2 max-h-60 overflow-y-auto pr-1">
                  {productTypes.map((pt) => (
                    <button
                      key={pt.id}
                      type="button"
                      onClick={() => {
                        if (isCategoryPickerOpen) setNewSuppCategory(pt.label);
                        if (isEditCategoryPickerOpen) setEditSuppCategory(pt.label);
                        setIsCategoryPickerOpen(false);
                        setIsEditCategoryPickerOpen(false);
                      }}
                      className="flex items-center justify-between p-2.5 rounded-lg bg-[#151719] hover:bg-[#292C2F] border border-[#51504A] hover:border-[#FFB800] text-white text-xs font-bold transition-all text-left cursor-pointer group"
                    >
                      <span className="group-hover:text-[#FFB800]">{pt.label}</span>
                      <Check className="w-3.5 h-3.5 text-[#FFB800] opacity-0 group-hover:opacity-100 transition-opacity" />
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="pt-2 flex items-center justify-end border-t border-[#51504A]">
              <button
                type="button"
                onClick={() => {
                  setIsCategoryPickerOpen(false);
                  setIsEditCategoryPickerOpen(false);
                }}
                className="px-4 py-1.5 rounded-lg bg-[#151719] text-xs font-bold text-[#B8B8B3] hover:text-[#F5F5F2]"
              >
                Yopish
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Admin Xaritadan ko'rish modali */}
      {selectedAdminMapLocation && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center p-3 sm:p-5 bg-black/85 backdrop-blur-md animate-fadeIn"
          onClick={() => setSelectedAdminMapLocation(null)}
        >
          <div
            className="bg-[#151719] border-2 border-[#FFB800] rounded-3xl max-w-3xl w-full p-5 sm:p-6 space-y-4 shadow-2xl relative text-xs"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 pb-3 border-b border-[#51504A]">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-2xl bg-amber-500/20 text-[#FFB800] border border-amber-500/40">
                  <MapPin className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-black text-white">
                    {selectedAdminMapLocation.title}
                  </h3>
                  {selectedAdminMapLocation.subtitle && (
                    <p className="text-xs text-[#B8B8B3] font-mono">
                      {selectedAdminMapLocation.subtitle}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setAdminMapType(adminMapType === 'm' ? 'k' : 'm')}
                  className="px-3 py-1.5 rounded-xl bg-[#222528] hover:bg-[#292C2F] text-[#FFB800] border border-[#51504A] font-bold text-xs cursor-pointer flex items-center gap-1.5"
                >
                  <Globe className="w-3.5 h-3.5" />
                  <span>{adminMapType === 'm' ? "Sun'iy yo'ldosh" : 'Xarita'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedAdminMapLocation(null)}
                  className="p-2 rounded-xl bg-[#222528] hover:bg-red-600 text-slate-300 hover:text-white border border-[#51504A] cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-[#222528] border border-[#51504A] flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-start gap-2">
                <MapPin className="w-4 h-4 text-[#FFB800] shrink-0 mt-0.5" />
                <div>
                  <span className="text-[#FFB800] font-black text-xs sm:text-sm block">
                    {formatRegionAndDistrictOnly(selectedAdminMapLocation.address)}
                  </span>
                  <span className="text-slate-300 text-xs block mt-0.5">
                    {formatCleanFullAddress(selectedAdminMapLocation.address)}
                  </span>
                </div>
              </div>
              {selectedAdminMapLocation.coords && (
                <span className="px-2.5 py-1 rounded-lg bg-[#151719] border border-amber-500/40 text-[#FFB800] font-mono font-bold text-[11px] shrink-0">
                  {selectedAdminMapLocation.coords.lat.toFixed(5)}, {selectedAdminMapLocation.coords.lng.toFixed(5)}
                </span>
              )}
            </div>

            <div className="relative w-full h-80 sm:h-96 rounded-2xl overflow-hidden border-2 border-[#51504A] bg-[#222528]">
              <iframe
                title="Yetkazish Lokatsiyasi"
                width="100%"
                height="100%"
                style={{ border: 0 }}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                src={`https://maps.google.com/maps?q=${encodeURIComponent(
                  selectedAdminMapLocation.coords
                    ? `${selectedAdminMapLocation.coords.lat},${selectedAdminMapLocation.coords.lng}`
                    : `${formatCleanFullAddress(selectedAdminMapLocation.address)}, Uzbekistan`
                )}&hl=uz&z=16&t=${adminMapType}&output=embed`}
              />
            </div>

            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={() => setSelectedAdminMapLocation(null)}
                className="px-5 py-2.5 rounded-xl bg-[#FFB800] hover:bg-[#FFC928] text-slate-950 font-black text-xs cursor-pointer"
              >
                Yopish
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Ta'minotchi kabinetiga o'tish uchun Admin SMS Tasdiqlash Oynasi */}
      {pendingEnterSupplier && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-3 sm:p-4 bg-[#071326]/80 backdrop-blur-md animate-fadeIn">
          <form
            onSubmit={handleConfirmEnterSupplier}
            className="liquid-glass-settings-window rounded-2xl max-w-md w-full p-4 sm:p-6 text-white shadow-2xl space-y-4 border border-[#FFB800]/60"
          >
            <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-white/15">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-[#FFB800] text-[#071326] flex items-center justify-center font-black shrink-0">
                  <ShieldCheck className="w-5 h-5 stroke-[2.5]" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-black text-white">
                    SMS <span className="text-[#FFB800]">tasdiqlash</span>
                  </h3>
                  <p className="text-[11px] text-sky-200 truncate max-w-[230px]">
                    «{pendingEnterSupplier.companyName}» kabinetiga o‘tish
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPendingEnterSupplier(null)}
                className="p-1.5 rounded-lg liquid-glass-btn-navy text-slate-300 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {enterSuppSmsNotice && (
              <div className="p-3 rounded-xl bg-[#071739]/90 border border-[#FFB800]/60 text-xs text-[#FFB800] font-mono font-bold text-center">
                {enterSuppSmsNotice}
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-sky-100 block">
                Admin telefon raqamiga yuborilgan 6 xonali SMS kodni kiriting:
              </label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                autoFocus
                placeholder="6 xonali SMS kod"
                value={enterSuppSmsCode}
                onChange={(e) => {
                  setEnterSuppSmsCode(e.target.value.replace(/\D/g, '').slice(0, 6));
                  setEnterSuppError(null);
                }}
                className="w-full px-4 py-3 rounded-xl liquid-glass-input text-center text-lg font-mono font-black tracking-widest text-[#FFB800] placeholder-sky-200/40 focus:outline-none border border-[#FFB800]/60"
              />
            </div>

            {enterSuppError && (
              <div className="p-2.5 rounded-xl bg-red-500/20 border border-red-400/50 text-red-200 text-xs font-bold">
                {enterSuppError}
              </div>
            )}

            <div className="flex items-center justify-between gap-2 pt-1">
              <button
                type="button"
                disabled={enterSuppSending}
                onClick={() => handleRequestEnterSupplier(pendingEnterSupplier)}
                className="px-3 py-2.5 rounded-xl liquid-glass-tab-inactive text-xs font-bold text-[#FFB800] hover:text-white cursor-pointer"
              >
                Kodni qayta yuborish
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPendingEnterSupplier(null)}
                  className="px-3.5 py-2.5 rounded-xl liquid-glass-tab-inactive text-xs font-bold text-slate-200 cursor-pointer"
                >
                  Bekor qilish
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl liquid-glass-btn-amber text-xs font-black text-[#071326] flex items-center gap-1.5 cursor-pointer shadow-lg"
                >
                  <span>Tasdiqlash va Kirish</span>
                  <ExternalLink className="w-3.5 h-3.5 stroke-[2.5]" />
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

    </div>
  );
};
