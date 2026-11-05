import React, { useEffect, useState, useRef } from 'react';
import { protobufFetch as fetch } from '../../lib/protobufClient';
import {
  Package,
  Truck,
  Clock,
  CheckCircle2,
  AlertCircle,
  MapPin,
  RefreshCw,
  Layers,
  User,
  CreditCard,
  Phone,
  Printer,
  ChevronRight,
  ShieldCheck,
  Building,
  Calendar,
  FileText,
  PlusCircle,
  ArrowUpRight,
  ShoppingBag,
  ShoppingCart,
  Coins,
  Settings,
  KeyRound,
  UserCheck,
  Save,
  Check,
  AlertTriangle,
  Lock,
  Mail,
  Home,
  ArrowLeft,
  Camera,
  Upload,
  Trash2,
  X,
  HardHat,
  Globe,
  PanelLeftClose,
  PanelLeftOpen,
  Menu,
  LogOut,
  Plus,
  Minus,
  ArrowRight
} from 'lucide-react';
import { Order, UserProfile, CartItem, Product } from '../../types';
import {
  db,
  deleteField,
  handleFirestoreError,
  OperationType,
  sendSecurePhoneOtp,
  verifySecurePhoneOtp,
  hashPasswordServerSide,
  syncFirebaseAccountWithEmail,
} from '../../lib/firebase';
import { collection, query, where, onSnapshot, doc, updateDoc, setDoc } from 'firebase/firestore';
import { CabinetLogsModal } from '../modals/CabinetLogsModal';
import { CheckoutModal } from '../modals/CheckoutModal';
import { Marketplace } from './Marketplace';
import { GlobalBunkerHub } from '../cabinets/GlobalBunkerHub';
import { recordCabinetLog } from '../../lib/cabinetLogs';
import { REGIONS_AND_DISTRICTS } from '../../data/regionsData';
import { INITIAL_PRODUCTS } from '../../data/mockData';
import { isOrderAfterReset, pickMoreAdvancedOrder, saveOrdersToStorageSafe } from '../../data/supplierReportsData';
import { getOrdersApi, updateOrderStatusApi } from '../../lib/api';
import { formatPrice } from '../../lib/formatters';
import {
  getLoginConflictError,
  isLoginRejectedError,
  computePasswordSignature,
  validateLoginAndPasswordAsync,
} from '../../lib/adminSettings';
import { useLanguage } from '../../lib/i18n';

interface OrdersViewProps {
  user: UserProfile | null;
  products?: Product[];
  onAddToCart?: (product: Product, quantity?: number) => void;
  onOpenAuth: () => void;
  onGoToShop: () => void;
  onLogout?: () => void;
  cart?: CartItem[];
  onUpdateQuantity?: (productId: string, quantity: number) => void;
  onRemoveItem?: (productId: string) => void;
  onClearCart?: () => void;
  onUserUpdate?: (updatedUser: UserProfile) => void;
}

export const OrdersView: React.FC<OrdersViewProps> = ({
  user,
  products = INITIAL_PRODUCTS,
  onAddToCart = () => {},
  onOpenAuth,
  onGoToShop,
  onLogout,
  cart = [],
  onUpdateQuantity = () => {},
  onRemoveItem = () => {},
  onClearCart = () => {},
  onUserUpdate,
}) => {
  // Mijoz kabinetidagi 5 ta asosiy bo'lim:
  // 1. 'bunker' (Bunker - mahsulotlar katalogi)
  // 2. 'global_bunker' (Global bunker - xalqaro ta'minot)
  // 3. 'savat' (Savat)
  // 4. 'orders' (Buyurtmalarim)
  // 5. 'settings' (Sozlamalar)
  const { lang, setLang } = useLanguage();
  const [cabinetTheme, setCabinetTheme] = useState<'night' | 'light'>(() => {
    try {
      const saved = localStorage.getItem('bunkerstroy_customer_theme_v2');
      if (saved === 'light' || saved === 'night') return saved;
    } catch {}
    return 'light';
  });
  const toggleCabinetTheme = (nextTheme: 'night' | 'light') => {
    setCabinetTheme(nextTheme);
    try {
      localStorage.setItem('bunkerstroy_customer_theme_v2', nextTheme);
      window.dispatchEvent(new Event('bunkerstroy-theme-change'));
    } catch {}
  };
  const [activeSection, setActiveSection] = useState<'bunker' | 'global_bunker' | 'savat' | 'orders' | 'settings'>('bunker');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [selectedReceiptOrder, setSelectedReceiptOrder] = useState<Order | null>(null);
  const [selectedMapOrder, setSelectedMapOrder] = useState<Order | null>(null);
  const [orderMapType, setOrderMapType] = useState<'m' | 'k'>('m');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'confirmed' | 'in_transit' | 'delivered'>('all');

  // Zavod (B2B) tasdiqlagan so'rov uchun to'lov modali holatlari
  const [payingB2bOrder, setPayingB2bOrder] = useState<Order | null>(null);
  const [b2bCardNumber, setB2bCardNumber] = useState('');
  const [b2bCardExpiry, setB2bCardExpiry] = useState('');
  const [b2bSmsSent, setB2bSmsSent] = useState(false);
  const [b2bSentSmsCode, setB2bSentSmsCode] = useState('');
  const [b2bSmsInput, setB2bSmsInput] = useState('');
  const [b2bPaymentError, setB2bPaymentError] = useState<string | null>(null);
  const [b2bPaymentLoading, setB2bPaymentLoading] = useState(false);

  const openB2bPaymentModal = (order: Order) => {
    setPayingB2bOrder(order);
    setB2bCardNumber('');
    setB2bCardExpiry('');
    setB2bSmsSent(false);
    setB2bSentSmsCode('');
    setB2bSmsInput('');
    setB2bPaymentError(null);
  };

  const handleSendB2bPaymentSms = () => {
    const cleanCard = b2bCardNumber.replace(/\D/g, '');
    if (cleanCard.length !== 16) {
      setB2bPaymentError("Plastik karta 16 xonali raqamini to'liq kiriting!");
      return;
    }
    const cleanExp = b2bCardExpiry.replace(/\D/g, '');
    if (cleanExp.length !== 4) {
      setB2bPaymentError('Karta amal qilish muddatini kiriting (OO/YY)!');
      return;
    }
    const generated = String(Math.floor(100000 + Math.random() * 900000));
    setB2bSentSmsCode(generated);
    setB2bSmsInput('');
    setB2bSmsSent(true);
    setB2bPaymentError(null);
  };

  const handleConfirmB2bOrderPayment = async () => {
    if (!payingB2bOrder) return;
    if (!b2bSmsSent) {
      setB2bPaymentError('Avval SMS kod oling!');
      return;
    }
    if (b2bSmsInput.trim().toUpperCase() !== b2bSentSmsCode.trim().toUpperCase()) {
      setB2bPaymentError("Kiritilgan SMS kod noto'g'ri!");
      return;
    }

    setB2bPaymentLoading(true);
    setB2bPaymentError(null);
    const nowIso = new Date().toISOString();
    const orderId = payingB2bOrder.id;
    const paidOrderObj: Order = {
      ...payingB2bOrder,
      paymentStatus: 'paid',
      paidAt: nowIso,
      updatedAt: nowIso,
    };

    try {
      const savedOrdersRaw = localStorage.getItem('bunkerstroy_orders');
      const ordersList: Order[] = savedOrdersRaw ? JSON.parse(savedOrdersRaw) : [];
      if (Array.isArray(ordersList)) {
        let found = false;
        const updatedList = ordersList.map((o: Order) => {
          if (o && o.id === orderId) {
            found = true;
            return { ...o, paymentStatus: 'paid' as const, paidAt: nowIso, updatedAt: nowIso };
          }
          return o;
        });
        if (!found) {
          updatedList.unshift(paidOrderObj);
        }
        try {
          localStorage.setItem('bunkerstroy_orders', JSON.stringify(updatedList));
        } catch {
          try {
            localStorage.removeItem('bunkerstroy_logs');
            localStorage.setItem('bunkerstroy_orders', JSON.stringify(updatedList));
          } catch {}
        }
      }

      // Deduct stock & increment salesCount for paid B2B order items
      const orderedItems = Array.isArray(payingB2bOrder.items) ? payingB2bOrder.items : [];
      if (orderedItems.length > 0) {
        const savedProds = localStorage.getItem('bunkerstroy_products');
        if (savedProds) {
          const prodsList = JSON.parse(savedProds);
          if (Array.isArray(prodsList)) {
            const updatedProds = prodsList.map((p: any) => {
              const matchedItem = orderedItems.find(
                (it: any) => (it.productId || it?.product?.id) === p.id
              );
              if (!matchedItem) return p;
              const qty = Number(matchedItem.quantity) || 0;
              const nextSales = (Number(p.salesCount) || 0) + qty;
              const nextStock = Math.max(0, (Number(p.stock) || 0) - qty);
              try {
                setDoc(
                  doc(db, 'products', p.id),
                  { stock: nextStock, salesCount: nextSales },
                  { merge: true }
                ).catch(() => {});
              } catch {}
              return { ...p, salesCount: nextSales, stock: nextStock };
            });
            localStorage.setItem('bunkerstroy_products', JSON.stringify(updatedProds));
            window.dispatchEvent(new CustomEvent('bunkerstroy_products_updated'));
          }
        }
      }
    } catch {}

    setOrders((prev) =>
      prev.map((o) =>
        o.id === orderId ? { ...o, paymentStatus: 'paid', paidAt: nowIso, updatedAt: nowIso } : o
      )
    );

    try {
      await setDoc(doc(db, 'orders', orderId), paidOrderObj, { merge: true });
      updateOrderStatusApi(orderId, 'delivered').catch(() => {});
    } catch {}

    window.dispatchEvent(new CustomEvent('bunkerstroy_orders_updated'));
    window.dispatchEvent(new CustomEvent('bunkerstroy_finance_updated'));
    window.dispatchEvent(new Event('storage'));

    setB2bPaymentLoading(false);
    setPayingB2bOrder(null);
  };

  const extractCoordsFromAddress = (addr?: string): { lat: number; lng: number } | null => {
    if (!addr) return null;
    const match = addr.match(/\[(?:Google Maps|Koordinata):\s*([-+]?\d*\.?\d+)\s*,\s*([-+]?\d*\.?\d+)\]/i);
    if (match && match[1] && match[2]) {
      const lat = parseFloat(match[1]);
      const lng = parseFloat(match[2]);
      if (!isNaN(lat) && !isNaN(lng)) return { lat, lng };
    }
    return null;
  };

  const formatRegionAndDistrictOnly = (addr?: string): string => {
    if (!addr) return 'Manzil ko‘rsatilmagan';
    const cleaned = addr.replace(/\[(?:Google Maps|Koordinata):.*?\]/gi, '').trim();
    const parts = cleaned
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[0]}, ${parts[1]}`;
    }
    return cleaned || 'Manzil ko‘rsatilmagan';
  };

  const formatCleanFullAddress = (addr?: string): string => {
    if (!addr) return 'Manzil ko‘rsatilmagan';
    return addr.replace(/\[(?:Google Maps|Koordinata):.*?\]/gi, '').trim() || 'Manzil ko‘rsatilmagan';
  };

  const detectLocalUzOperator = (twoDigitPrefix: string): {
    operatorId: 'uzmobile' | 'beeline' | 'ucell' | 'mobiuz' | 'humans';
    operatorName: string;
  } | null => {
    if (['90', '91'].includes(twoDigitPrefix)) {
      return { operatorId: 'beeline', operatorName: 'Beeline' };
    }
    if (['93', '94', '50'].includes(twoDigitPrefix)) {
      return { operatorId: 'ucell', operatorName: 'Ucell' };
    }
    if (['97', '88'].includes(twoDigitPrefix)) {
      return { operatorId: 'mobiuz', operatorName: 'Mobiuz' };
    }
    if (['33'].includes(twoDigitPrefix)) {
      return { operatorId: 'humans', operatorName: 'Humans' };
    }
    if (['99', '95', '77'].includes(twoDigitPrefix)) {
      return { operatorId: 'uzmobile', operatorName: 'Uztelecom (Uzmobile)' };
    }
    return null;
  };

  const isRealUzMobilePhone = (raw?: string): boolean => {
    if (!raw) return false;
    let d = String(raw).replace(/\D/g, '');
    if (d.startsWith('998')) d = d.slice(3);
    if (d.length !== 9) return false;
    const prefix = d.slice(0, 2);
    if (!detectLocalUzOperator(prefix)) return false;
    const sub = d.slice(2);
    if (sub === '3453453' || sub === '1234567' || sub === '0000000' || /^(\d)\1{6}$/.test(sub)) {
      return false;
    }
    return true;
  };

  // Profile and Credentials editing state
  const [firstName, setFirstName] = useState(user?.myGovVerified ? (user?.firstName || '') : '');
  const [lastName, setLastName] = useState(user?.myGovVerified ? (user?.lastName || '') : '');
  const [middleName, setMiddleName] = useState(user?.myGovVerified ? (user?.middleName || '') : '');
  const [pinfl, setPinfl] = useState(user?.pinfl || '');
  const [issuedBy, setIssuedBy] = useState(user?.issuedBy || '');
  const [myIdJobId, setMyIdJobId] = useState(user?.myIdJobId || '');
  const [idCardNumber, setIdCardNumber] = useState(
    user?.idCardNumber && user.idCardNumber.trim() !== 'AE 4690961' ? user.idCardNumber : ''
  );
  const [birthDate, setBirthDate] = useState(
    user?.birthDate && user.birthDate.trim() !== '29.01.2007' ? user.birthDate : ''
  );
  const [citizenAddress, setCitizenAddress] = useState(user?.myGovVerified ? (user?.address || '') : '');
  const [myGovVerified, setMyGovVerified] = useState<boolean>(Boolean(user?.myGovVerified));
  const [myGovLoading, setMyGovLoading] = useState(false);
  const [myGovError, setMyGovError] = useState<string | null>(null);
  const [phone, setPhone] = useState(isRealUzMobilePhone(user?.phone) ? (user?.phone || '') : '');
  const [newOperatorPhoneInput, setNewOperatorPhoneInput] = useState('+998 ');
  const [registeredMobileNumbers, setRegisteredMobileNumbers] = useState<
    Array<{
      phone: string;
      cleanPhone: string;
      operatorId: 'uzmobile' | 'beeline' | 'ucell' | 'mobiuz' | 'humans';
      operatorName: string;
      prefix: string;
      ownerName: string;
      ownerIdCard: string;
      isPrimary?: boolean;
      verifiedOwner: boolean;
    }>
  >([]);
  const [phoneOwnershipError, setPhoneOwnershipError] = useState<string | null>(null);
  const [region, setRegion] = useState(user?.myGovVerified ? (user?.region || '') : '');
  const [district, setDistrict] = useState(user?.myGovVerified ? (user?.district || '') : '');
  const [loginInput, setLoginInput] = useState(user?.email?.split('@')[0] || user?.displayName || '');
  const hiddenDateInputRef = useRef<HTMLInputElement>(null);
  
  // Password change state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // SMS verification state for login & password update
  const [smsCodeSent, setSmsCodeSent] = useState(false);
  const [sentSmsCode, setSentSmsCode] = useState('');
  const [smsCodeInput, setSmsCodeInput] = useState('');
  const [smsTimer, setSmsTimer] = useState(0);
  const [smsNotice, setSmsNotice] = useState<string | null>(null);

  // SMS verification state for profile personal information update
  const [profileSmsSent, setProfileSmsSent] = useState(false);
  const [profileSmsCode, setProfileSmsCode] = useState('');
  const [profileSmsInput, setProfileSmsInput] = useState('');
  const [profileSmsTimer, setProfileSmsTimer] = useState(0);
  const [profileSmsNotice, setProfileSmsNotice] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [saveSuccessMessage, setSaveSuccessMessage] = useState<string | null>(null);
  const [saveErrorMessage, setSaveErrorMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isCabinetLogsOpen, setIsCabinetLogsOpen] = useState(false);

  const formatLocalPhone9Digits = (nineDigits: string): string => {
    const d = nineDigits.replace(/\D/g, '').slice(-9);
    if (d.length !== 9) return `+998 ${d}`;
    return `+998 ${d.slice(0, 2)} ${d.slice(2, 5)} ${d.slice(5, 7)} ${d.slice(7, 9)}`;
  };

  // Foydalanuvchining haqiqiy tasdiqlangan telefon raqamlarini (soxta raqamlarsiz) yig'ish
  const getExistingUserOwnedPhones = (targetIdCard?: string): string[] => {
    const phonesSet = new Set<string>();
    const addIfValid = (raw?: string) => {
      if (!raw || !isRealUzMobilePhone(raw)) return;
      let d = String(raw).replace(/\D/g, '');
      if (d.startsWith('998')) d = d.slice(3);
      if (d.length === 9) {
        phonesSet.add(`+998 ${d.slice(0, 2)} ${d.slice(2, 5)} ${d.slice(5, 7)} ${d.slice(7, 9)}`);
      }
    };

    if (user?.phone && isRealUzMobilePhone(user.phone)) {
      addIfValid(user.phone);
    }

    try {
      const savedCust = localStorage.getItem('bunkerstroy_customers');
      const custList = savedCust ? JSON.parse(savedCust) : [];
      if (Array.isArray(custList)) {
        const cleanTargetId = String(targetIdCard || idCardNumber || '')
          .toUpperCase()
          .replace(/[^A-Z0-9]/g, '');
        custList.forEach((c: any) => {
          if (!c) return;
          const cCleanId = String(c.idCardNumber || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
          if (cleanTargetId.length === 9 && cCleanId === cleanTargetId) {
            if (c.phone) addIfValid(c.phone);
            if (Array.isArray(c.registeredPhones)) {
              c.registeredPhones.forEach((p: string) => addIfValid(p));
            }
          }
        });
      }
    } catch {}

    return Array.from(phonesSet);
  };

  const buildLocalMobileItems = (
    rawPhones: string[],
    ownerFullName: string,
    ownerId: string
  ) => {
    const seen = new Set<string>();
    const result: Array<{
      phone: string;
      cleanPhone: string;
      operatorId: 'uzmobile' | 'beeline' | 'ucell' | 'mobiuz' | 'humans';
      operatorName: string;
      prefix: string;
      ownerName: string;
      ownerIdCard: string;
      isPrimary?: boolean;
      verifiedOwner: boolean;
    }> = [];

    rawPhones.forEach((raw) => {
      if (!isRealUzMobilePhone(raw)) return;
      let d = String(raw || '').replace(/\D/g, '');
      if (d.startsWith('998')) d = d.slice(3);
      if (d.length !== 9 || seen.has(d)) return;
      const prefix = d.slice(0, 2);
      const op = detectLocalUzOperator(prefix);
      if (!op) return;
      seen.add(d);
      result.push({
        phone: formatLocalPhone9Digits(d),
        cleanPhone: `+998${d}`,
        operatorId: op.operatorId,
        operatorName: op.operatorName,
        prefix,
        ownerName: ownerFullName,
        ownerIdCard: ownerId,
        isPrimary: result.length === 0,
        verifiedOwner: true,
      });
    });

    return result;
  };

  // SMS countdown timers
  useEffect(() => {
    let interval: any;
    if (smsTimer > 0) {
      interval = setInterval(() => {
        setSmsTimer((prev) => (prev > 0 ? prev - 1 : 0));
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [smsTimer]);

  useEffect(() => {
    let interval: any;
    if (profileSmsTimer > 0) {
      interval = setInterval(() => {
        setProfileSmsTimer((prev) => (prev > 0 ? prev - 1 : 0));
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [profileSmsTimer]);

  useEffect(() => {
    if (user) {
      const isVerified = Boolean(user.myGovVerified && user.idCardNumber);
      const fName = isVerified ? (user.firstName || '') : '';
      const lName = isVerified ? (user.lastName || '') : '';
      setFirstName(fName);
      setLastName(lName);
      setMiddleName(isVerified ? (user.middleName || '') : '');
      setPinfl(user.pinfl || '');
      setIssuedBy(user.issuedBy || '');
      setMyIdJobId(user.myIdJobId || '');
      const cleanIdVal =
        user.idCardNumber && user.idCardNumber.trim() !== 'AE 4690961' ? user.idCardNumber : '';
      setIdCardNumber(cleanIdVal);
      const rawB = user.birthDate && user.birthDate.trim() !== '29.01.2007' ? user.birthDate : '';
      if (/^\d{4}-\d{2}-\d{2}$/.test(rawB)) {
        const [y, m, d] = rawB.split('-');
        setBirthDate(`${d}.${m}.${y}`);
      } else {
        setBirthDate(rawB);
      }
      setCitizenAddress(isVerified ? (user.address || '') : '');
      setMyGovVerified(isVerified);
      const cleanValidPhone = isRealUzMobilePhone(user.phone) ? (user.phone || '') : '';
      setPhone(cleanValidPhone);
      setRegion(isVerified ? (user.region || '') : '');
      setDistrict(isVerified ? (user.district || '') : '');
      setLoginInput(user.email ? user.email.split('@')[0] : user.displayName || '');

      if (isVerified && user.idCardNumber) {
        const existingPhones = getExistingUserOwnedPhones(user.idCardNumber);
        const ownerLabel = `${lName} ${fName}`.trim() || user.displayName || 'Foydalanuvchi';
        setRegisteredMobileNumbers(
          buildLocalMobileItems(existingPhones, ownerLabel, user.idCardNumber)
        );
      } else {
        setRegisteredMobileNumbers([]);
      }
    }
  }, [user]);

  // Foydalanuvchi ism va familiyasining bosh harflari (Initials)
  const getUserInitials = (u: UserProfile | null) => {
    if (!u) return 'BS';
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

  // Surat yuklash (Rasm yuklanganda shu harflar o'rniga rasm yuklanadi)
  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    if (file.size > 3 * 1024 * 1024) {
      setSaveErrorMessage("Rasm hajmi 3MB dan oshmasligi kerak.");
      return;
    }

    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result as string;
      try {
        const updatedProfile: UserProfile = {
          ...user,
          photoURL: base64,
        };
        await setDoc(doc(db, 'users', user.id), { photoURL: base64 }, { merge: true });
        if (onUserUpdate) onUserUpdate(updatedProfile);
        setSaveSuccessMessage("Profil surati muvaffaqiyatli yuklandi!");
        setTimeout(() => setSaveSuccessMessage(null), 3000);
      } catch (err: any) {
        setSaveErrorMessage("Suratni saqlashda xatolik yuz berdi.");
      }
    };
    reader.readAsDataURL(file);
  };

  const handleRemovePhoto = async () => {
    if (!user) return;
    try {
      const updatedProfile: UserProfile = {
        ...user,
        photoURL: undefined,
      };
      await setDoc(doc(db, 'users', user.id), { photoURL: '' }, { merge: true });
      if (onUserUpdate) onUserUpdate(updatedProfile);
      setSaveSuccessMessage("Profil surati o'chirildi.");
      setTimeout(() => setSaveSuccessMessage(null), 3000);
    } catch {}
  };

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    setLoading(true);
    let latestFsOrders: Order[] = [];

    const syncLocalAndFirestore = (firestoreOrders?: Order[]) => {
      try {
        if (Array.isArray(firestoreOrders)) {
          latestFsOrders = firestoreOrders.filter((fo) => fo && isOrderAfterReset(fo));
        }

        const savedOrders = localStorage.getItem('bunkerstroy_orders');
        const localParsed: Order[] = savedOrders ? JSON.parse(savedOrders) : [];
        const localUserOrders = Array.isArray(localParsed)
          ? localParsed.filter(
              (o: Order) => o && isOrderAfterReset(o) && (o.buyerId === user.id || o.buyerPhone === user.phone)
            )
          : [];

        const mergedMap = new Map<string, Order>();
        latestFsOrders.forEach((fo) => {
          if (fo && fo.id) mergedMap.set(fo.id, fo);
        });
        localUserOrders.forEach((lo) => {
          if (!lo || !lo.id) return;
          const existing = mergedMap.get(lo.id);
          if (!existing) {
            mergedMap.set(lo.id, lo);
          } else {
            mergedMap.set(lo.id, pickMoreAdvancedOrder(lo, existing));
          }
        });

        const merged = Array.from(mergedMap.values());
        merged.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setOrders(merged);

        if (Array.isArray(localParsed) && merged.length > 0) {
          const allMap = new Map<string, Order>();
          localParsed.forEach((o) => {
            if (o && o.id && isOrderAfterReset(o)) allMap.set(o.id, o);
          });
          merged.forEach((mo) => {
            const ex = allMap.get(mo.id);
            allMap.set(mo.id, ex ? pickMoreAdvancedOrder(mo, ex) : mo);
          });
          saveOrdersToStorageSafe(Array.from(allMap.values()));
        }
      } catch {}
    };

    // 1. Try local storage orders first for instant display
    syncLocalAndFirestore();

    // 1b. Sync orders from PostgreSQL database
    getOrdersApi(user.id).then((dbOrders) => {
      if (Array.isArray(dbOrders) && dbOrders.length > 0) {
        syncLocalAndFirestore(dbOrders);
      }
    }).catch(() => {});

    const handleLocalOrdersEvent = () => {
      syncLocalAndFirestore();
    };
    window.addEventListener('storage', handleLocalOrdersEvent);
    window.addEventListener('bunkerstroy_orders_updated', handleLocalOrdersEvent);
    window.addEventListener('bunkerstroy-orders-updated', handleLocalOrdersEvent);

    // 2. Real-time Firestore sync
    const q = query(collection(db, 'orders'), where('buyerId', '==', user.id));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list: Order[] = [];
        snapshot.forEach((d) => {
          const ord = d.data() as Order;
          if (isOrderAfterReset(ord)) {
            list.push(ord);
          }
        });
        syncLocalAndFirestore(list);
        setLoading(false);
      },
      (error) => {
        console.error('Orders snapshot error:', error);
        setLoading(false);
      }
    );

    return () => {
      window.removeEventListener('storage', handleLocalOrdersEvent);
      window.removeEventListener('bunkerstroy_orders_updated', handleLocalOrdersEvent);
      window.removeEventListener('bunkerstroy-orders-updated', handleLocalOrdersEvent);
      unsubscribe();
    };
  }, [user]);

  // Tug'ilgan sanani KK.OO.YYYY formatlash
  const formatBirthDateInput = (val: string): string => {
    const digits = val.replace(/\D/g, '').slice(0, 8);
    if (digits.length <= 2) return digits;
    if (digits.length <= 4) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
    return `${digits.slice(0, 2)}.${digits.slice(2, 4)}.${digits.slice(4, 8)}`;
  };

  // ID karta raqami va tug'ilgan sana kiritilib «Tasdiqlash» bosilganda ism, familiya, manzil va telefon raqamlarni to'ldirish
  const handleVerifyMyGovIdCard = async (
    customId?: string,
    customBirthDate?: string
  ) => {
    const effectiveId = (customId !== undefined ? customId : idCardNumber)
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '');
    const rawBirth = (customBirthDate !== undefined ? customBirthDate : birthDate).trim();

    if (!/^[A-Z]{2}\d{7}$/.test(effectiveId)) {
      setMyGovError("ID karta seriya va raqamini to‘liq kiriting.");
      return;
    }

    const birthDigits = rawBirth.replace(/\D/g, '');
    if (birthDigits.length !== 8) {
      setMyGovError("Tug‘ilgan sanani to‘liq kiriting.");
      return;
    }

    setMyGovLoading(true);
    setMyGovError(null);
    setPhoneOwnershipError(null);
    setSaveErrorMessage(null);

    const existingUserPhones = getExistingUserOwnedPhones(effectiveId);

    const applyVerifiedCitizen = (d: any, jobId?: string) => {
      const verifiedFirstName = d.firstName || '';
      const verifiedLastName = d.lastName || '';
      const verifiedMiddleName = d.middleName || '';
      const verifiedPinfl = d.pinfl || '';
      const verifiedRegion = d.region || 'Toshkent shahri';
      const verifiedDistrict = d.district || (REGIONS_AND_DISTRICTS[verifiedRegion]?.[0] || '');
      const verifiedAddress = d.address || `${verifiedRegion}, ${verifiedDistrict}`;
      const verifiedIssuedBy = d.issuedBy || 'IIV MvaFRB';
      const verifiedBirthDisplay = d.birthDateFormatted || rawBirth;
      const cleanIdStr = (d.cleanIdCardNumber || effectiveId).toUpperCase().replace(/[^A-Z0-9]/g, '');
      const formattedId =
        cleanIdStr.length === 9 ? `${cleanIdStr.slice(0, 2)} ${cleanIdStr.slice(2, 9)}` : idCardNumber;

      const ownerFullName = `${verifiedLastName} ${verifiedFirstName}`.trim();
      const apiMobileNumbers = Array.isArray(d.registeredMobileNumbers)
        ? d.registeredMobileNumbers.filter((m: any) => isRealUzMobilePhone(m?.phone || m?.cleanPhone))
        : buildLocalMobileItems(existingUserPhones, ownerFullName, formattedId);

      setFirstName(verifiedFirstName);
      setLastName(verifiedLastName);
      setMiddleName(verifiedMiddleName);
      if (verifiedPinfl) setPinfl(verifiedPinfl);
      setIssuedBy(verifiedIssuedBy);
      setMyIdJobId(jobId || '');
      setBirthDate(verifiedBirthDisplay);
      if (formattedId) setIdCardNumber(formattedId);
      setRegion(verifiedRegion);
      setDistrict(verifiedDistrict);
      setCitizenAddress(verifiedAddress);
      setRegisteredMobileNumbers(apiMobileNumbers);
      setMyGovVerified(true);

      let chosenPhone = isRealUzMobilePhone(phone) ? phone.trim() : '';
      if (apiMobileNumbers.length > 0) {
        const cleanCurrent = chosenPhone.replace(/\D/g, '').slice(-9);
        const matchesOwnNumber = apiMobileNumbers.some(
          (m: any) => String(m.cleanPhone || '').endsWith(cleanCurrent) && cleanCurrent.length === 9
        );
        if (!matchesOwnNumber) {
          chosenPhone = apiMobileNumbers[0].phone;
          setPhone(chosenPhone);
        }
      } else {
        setPhone(chosenPhone);
      }

      if (user) {
        const autoUpdatedProfile: UserProfile = {
          ...user,
          firstName: verifiedFirstName,
          lastName: verifiedLastName,
          middleName: verifiedMiddleName,
          pinfl: verifiedPinfl || user.pinfl,
          displayName: `${verifiedFirstName} ${verifiedLastName}`.trim() || user.displayName,
          idCardNumber: formattedId,
          birthDate: verifiedBirthDisplay,
          issuedBy: verifiedIssuedBy,
          myIdJobId: jobId || '',
          region: verifiedRegion,
          district: verifiedDistrict,
          address: verifiedAddress,
          myGovVerified: true,
          phone: chosenPhone,
        };

        try {
          setDoc(doc(db, 'users', user.id), autoUpdatedProfile, { merge: true });
        } catch {}

        try {
          const savedCust = localStorage.getItem('bunkerstroy_customers');
          const custList = savedCust ? JSON.parse(savedCust) : [];
          if (Array.isArray(custList)) {
            const updatedCustList = custList.map((c: any) =>
              c && c.id === user.id ? { ...c, ...autoUpdatedProfile } : c
            );
            localStorage.setItem('bunkerstroy_customers', JSON.stringify(updatedCustList));
            window.dispatchEvent(new Event('storage'));
          }
        } catch {}

        if (onUserUpdate) {
          onUserUpdate(autoUpdatedProfile);
        }
        setSaveSuccessMessage("Shaxsiy ma'lumotlar va ID karta sozlamalarda muvaffaqiyatli saqlandi!");
        setTimeout(() => setSaveSuccessMessage(null), 4000);
      }
    };

    try {
      const res = await fetch('/api/myid/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idCardNumber: effectiveId,
          birthDate: rawBirth,
          currentPhone: isRealUzMobilePhone(phone) ? phone : undefined,
          existingPhones: existingUserPhones,
        }),
      });
      const json = await res.json();
      if (res.ok && json.success && json.data) {
        applyVerifiedCitizen(json.data, json.myIdJobId);
        return;
      }
      setMyGovVerified(false);
      setMyGovError(
        json.error ||
          "Kiritilgan ID karta raqami va tug‘ilgan sana bo‘yicha davlat bazasida ma'lumot topilmadi."
      );
    } catch (err: any) {
      setMyGovVerified(false);
      setMyGovError(
        err?.message || "Ma'lumotlarni tekshirishda xatolik yuz berdi. Qayta urinib ko‘ring."
      );
    } finally {
      setMyGovLoading(false);
    }
  };

  // ID egasi nomiga aloqa operatori raqamini biriktirish va tekshirish
  const handleBindOperatorPhone = async () => {
    setPhoneOwnershipError(null);
    setSaveErrorMessage(null);

    const normalizedId = idCardNumber.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!myGovVerified || !/^[A-Z]{2}\d{7}$/.test(normalizedId)) {
      setPhoneOwnershipError("Avval ID karta raqami va tug‘ilgan sanani kiritib «Tasdiqlash» tugmasini bosing.");
      return;
    }

    if (!isRealUzMobilePhone(newOperatorPhoneInput)) {
      setPhoneOwnershipError(
        "Haqiqiy aloqa operatori raqamini kiriting (Uztelecom: 99/95/77, Beeline: 90/91, Ucell: 93/94/50, Mobiuz: 97/88, Humans: 33)."
      );
      return;
    }

    try {
      const resp = await fetch('/api/myid/verify-phone-ownership', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: newOperatorPhoneInput,
          idCardNumber: normalizedId,
          fullName: `${lastName} ${firstName}`.trim(),
          existingPhones: getExistingUserOwnedPhones(normalizedId),
        }),
      });
      const json = await resp.json();
      if (!resp.ok || !json.owned) {
        setPhoneOwnershipError(json.error || "Raqamni tasdiqlab bo‘lmadi.");
        return;
      }

      if (Array.isArray(json.registeredMobileNumbers)) {
        setRegisteredMobileNumbers(json.registeredMobileNumbers);
      }
      if (json.phone) {
        setPhone(json.phone);
      }
      setNewOperatorPhoneInput('+998 ');
    } catch (err: any) {
      setPhoneOwnershipError(err?.message || "Aloqa operatori bilan ulanishda xatolik.");
    }
  };

  // 1. Shaxsiy ma'lumotlarni o'zgartirish uchun SMS kod yuborish
  const handleSendProfileSms = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSaveErrorMessage(null);
    setSaveSuccessMessage(null);
    setPhoneOwnershipError(null);

    const normalizedId = idCardNumber.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!/^[A-Z]{2}\d{7}$/.test(normalizedId) || !myGovVerified) {
      setSaveErrorMessage("Iltimos, ID karta raqami va tug‘ilgan sanani kiritib «Tasdiqlash» tugmasini bosing!");
      return;
    }

    if (!isRealUzMobilePhone(phone)) {
      setPhoneOwnershipError("Aloqa operatorlari ro‘yxatidan telefon raqamni tanlang yoki kiriting!");
      setSaveErrorMessage("Aloqa operatorlari ro‘yxatidan telefon raqamni tanlang yoki kiriting!");
      return;
    }

    let cleanNine = phone.replace(/\D/g, '');
    if (cleanNine.startsWith('998')) cleanNine = cleanNine.slice(3);

    try {
      const verifyResp = await fetch('/api/myid/verify-phone-ownership', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone,
          idCardNumber: normalizedId,
          fullName: `${lastName} ${firstName}`.trim(),
          existingPhones: getExistingUserOwnedPhones(normalizedId),
        }),
      });
      const verifyJson = await verifyResp.json();
      if (!verifyResp.ok || !verifyJson.owned) {
        const msg = verifyJson.error || "Telefon raqamni tasdiqlab bo‘lmadi.";
        setPhoneOwnershipError(msg);
        setSaveErrorMessage(msg);
        return;
      }
    } catch {}

    const genCode = Math.floor(100000 + Math.random() * 900000).toString();
    setProfileSmsCode(genCode);
    setProfileSmsSent(true);
    setProfileSmsTimer(60);
    setProfileSmsInput('');

    try {
      const smsResp = await fetch('/api/sms/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, code: genCode }),
      });
      const smsData = await smsResp.json();
      if (smsData?.mode === 'real_sms') {
        setProfileSmsNotice(`📲 SMS kod ${phone} raqamiga yuborildi!`);
      } else {
        setProfileSmsNotice(`📲 ${phone} raqamiga SMS tasdiqlash kodi yuborildi: ${genCode}`);
      }
    } catch {
      setProfileSmsNotice(`📲 ${phone} raqamiga SMS tasdiqlash kodi yuborildi: ${genCode}`);
    }
  };

  // 2. Shaxsiy ma'lumotlar SMS kodini tasdiqlab saqlash
  const handleVerifyAndSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSaveErrorMessage(null);
    setSaveSuccessMessage(null);

    if (!profileSmsInput.trim() || profileSmsInput.trim() !== profileSmsCode) {
      setSaveErrorMessage("SMS tasdiqlash kodi noto'g'ri kiritildi! Iltimos, qayta tekshirib tering.");
      return;
    }

    setIsSaving(true);
    try {
      const formattedId = idCardNumber.toUpperCase().replace(/[^A-Z0-9]/g, '');
      const updatedProfile: UserProfile = {
        ...user,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        middleName: middleName.trim(),
        displayName: `${firstName.trim()} ${lastName.trim()}`.trim() || user.displayName,
        idCardNumber: formattedId ? `${formattedId.slice(0, 2)} ${formattedId.slice(2)}` : user.idCardNumber,
        birthDate: birthDate.trim(),
        pinfl: pinfl.trim(),
        issuedBy: issuedBy.trim(),
        myIdJobId: myIdJobId,
        address: citizenAddress.trim() || `${region}${district ? `, ${district}` : ''}`,
        myGovVerified: true,
        phone: phone.trim(),
        region: region,
        district: district,
      };

      // Update Firestore
      await setDoc(doc(db, 'users', user.id), updatedProfile, { merge: true });

      // Update bunkerstroy_customers in localStorage so regional customer counts stay in sync
      try {
        const savedCust = localStorage.getItem('bunkerstroy_customers');
        const custList = savedCust ? JSON.parse(savedCust) : [];
        if (Array.isArray(custList)) {
          const updatedCustList = custList.map((c: any) =>
            c && c.id === user.id ? { ...c, ...updatedProfile } : c
          );
          localStorage.setItem('bunkerstroy_customers', JSON.stringify(updatedCustList));
          window.dispatchEvent(new Event('storage'));
        }
      } catch {}

      // Record Cabinet Security Log
      await recordCabinetLog({
        userId: user.id,
        userLogin: user.email || user.displayName,
        userName: updatedProfile.displayName,
        action: 'profile_update',
        actionLabel: `Ma'lumotlar my.gov.uz va SMS bilan tahrirlandi (Login: ${user.email ? user.email.split('@')[0] : user.displayName})`,
        details: `Kabinet logini: ${user.email ? user.email.split('@')[0] : user.displayName} • Shaxsiy ma'lumotlar yangilandi: ${updatedProfile.displayName}, ID: ${updatedProfile.idCardNumber || ''}, Tug'ilgan sana: ${birthDate}, Tel: ${phone}, Manzil: ${updatedProfile.address}`,
        status: 'success',
      });

      if (onUserUpdate) {
        onUserUpdate(updatedProfile);
      }

      setSaveSuccessMessage("Profil ma'lumotlari https://my.gov.uz/uz tasdig'i bilan muvaffaqiyatli saqlandi!");
      setProfileSmsSent(false);
      setProfileSmsCode('');
      setProfileSmsInput('');
      setProfileSmsNotice(null);
      setTimeout(() => setSaveSuccessMessage(null), 4000);
    } catch (err: any) {
      setSaveErrorMessage("Saqlashda xatolik yuz berdi: " + (err.message || 'Server xatosi'));
    } finally {
      setIsSaving(false);
    }
  };

  // 1. Yangi login va parol uchun SMS tasdiqlash kodini yuborish
  const handleSendCredentialsSms = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSaveErrorMessage(null);
    setSaveSuccessMessage(null);

    const trimmedLogin = loginInput.trim();
    if (!trimmedLogin || trimmedLogin.length < 5) {
      setSaveErrorMessage("Login kamida 5 ta belgidan iborat bo‘lishi kerak!");
      return;
    }

    const validation = await validateLoginAndPasswordAsync(trimmedLogin, newPassword, user.id, {
      currentAccount: user,
    });
    if (validation.error) {
      if (validation.clearLogin) {
        setLoginInput('');
      }
      setSaveErrorMessage(validation.error);
      return;
    }

    // SMS tasdiqlash kodi faqat serverda hosil qilinadi va tekshiriladi
    setSentSmsCode('');
    setSmsCodeInput('');
    const targetPhone = user.phone || phone || '+998 90 123 45 67';

    const otpRes = await sendSecurePhoneOtp(targetPhone, 'confirm');
    if (!otpRes.success) {
      setSaveErrorMessage(otpRes.error || 'SMS yuborishda xatolik yuz berdi.');
      return;
    }
    setSmsCodeSent(true);
    setSmsTimer(60);
    setSmsNotice(`📲 SMS tasdiqlash kodi ${targetPhone} raqamiga yuborildi.`);
  };

  // 2. SMS kodni serverda tasdiqlab yangilash
  const handleVerifySmsAndSaveCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSaveErrorMessage(null);
    setSaveSuccessMessage(null);

    const targetPhone = user.phone || phone || '+998 90 123 45 67';
    const check = await verifySecurePhoneOtp({
      phone: targetPhone,
      code: smsCodeInput.trim(),
      purpose: 'confirm',
    });

    if (!check.verified) {
      setSaveErrorMessage(check.error || "SMS tasdiqlash kodi noto'g'ri kiritildi! Iltimos, qayta tekshirib tering.");
      return;
    }

    const trimmedLogin = loginInput.trim();
    if (!trimmedLogin || trimmedLogin.length < 5) {
      setSaveErrorMessage("Login kamida 5 ta belgidan iborat bo‘lishi kerak!");
      return;
    }

    const validation = await validateLoginAndPasswordAsync(trimmedLogin, newPassword, user.id, {
      currentAccount: user,
    });
    if (validation.error) {
      if (validation.clearLogin) {
        setLoginInput('');
      }
      setSaveErrorMessage(validation.error);
      return;
    }

    setIsSaving(true);

    try {
      const newEmail = trimmedLogin.includes('@') ? trimmedLogin : `${trimmedLogin}@bunkerstroy.uz`;
      const updatedProfile: UserProfile = {
        ...user,
        email: newEmail,
      };

      const cleanNewPass = newPassword.trim();
      let newPasswordHash: string | null = null;
      let newPasswordSignature: string | null = null;
      let firebaseUid: string | null = null;

      if (cleanNewPass) {
        const [fbRes, hRes] = await Promise.all([
          syncFirebaseAccountWithEmail(trimmedLogin, cleanNewPass),
          hashPasswordServerSide(cleanNewPass),
        ]);
        newPasswordHash = hRes;
        newPasswordSignature = computePasswordSignature(cleanNewPass);
        firebaseUid = fbRes.firebaseUid;
      }

      // Update bunkerstroy_customers in localStorage without plaintext password
      try {
        const savedCust = localStorage.getItem('bunkerstroy_customers');
        const parsedCust = savedCust ? JSON.parse(savedCust) : [];
        const custList = Array.isArray(parsedCust) ? parsedCust : [];
        let foundInCust = false;
        const nextCustList = custList.map((c: any) => {
          if (
            c?.id === user.id ||
            (c?.email && user?.email && String(c.email).toLowerCase() === String(user.email).toLowerCase())
          ) {
            foundInCust = true;
            const copy = {
              ...c,
              ...updatedProfile,
              login: trimmedLogin,
              email: newEmail,
            };
            if (newPasswordHash) {
              delete copy.password;
              delete copy.emergencyPassword;
              copy.passwordHash = newPasswordHash;
              if (newPasswordSignature) copy.passwordSignature = newPasswordSignature;
              copy.passwordMigrated = true;
              if (firebaseUid) copy.firebaseUid = firebaseUid;
            }
            return copy;
          }
          return c;
        });
        if (!foundInCust) {
          nextCustList.unshift({
            ...updatedProfile,
            login: trimmedLogin,
            email: newEmail,
            ...(newPasswordHash
              ? {
                  passwordHash: newPasswordHash,
                  ...(newPasswordSignature ? { passwordSignature: newPasswordSignature } : {}),
                  passwordMigrated: true,
                  ...(firebaseUid ? { firebaseUid } : {}),
                }
              : {}),
          });
        }
        localStorage.setItem('bunkerstroy_customers', JSON.stringify(nextCustList));
        window.dispatchEvent(new CustomEvent('bunkerstroy_customers_updated'));
      } catch {}

      const firestoreUpdateData: Record<string, any> = {
        ...updatedProfile,
        login: trimmedLogin,
      };
      if (newPasswordHash) {
        firestoreUpdateData.passwordHash = newPasswordHash;
        firestoreUpdateData.passwordMigrated = true;
        firestoreUpdateData.password = deleteField();
        firestoreUpdateData.emergencyPassword = deleteField();
        if (firebaseUid) firestoreUpdateData.firebaseUid = firebaseUid;
      }
      await setDoc(doc(db, 'users', user.id), firestoreUpdateData, { merge: true });

      // Record security log for login / password change
      if (newPassword) {
        await recordCabinetLog({
          userId: user.id,
          userLogin: trimmedLogin,
          userName: user.displayName,
          action: 'password_change',
          actionLabel: "Parol SMS orqali muvaffaqiyatli almashtirildi",
          details: `SMS tasdiqlash kodi orqali yangi parol va login yangilandi: ${trimmedLogin}.`,
          status: 'success',
        });
      } else {
        await recordCabinetLog({
          userId: user.id,
          userLogin: trimmedLogin,
          userName: user.displayName,
          action: 'login_change',
          actionLabel: "Login SMS orqali almashtirildi",
          details: `SMS tasdiqlash kodi orqali yangi login o‘zgartirildi: ${trimmedLogin}`,
          status: 'success',
        });
      }

      if (onUserUpdate) {
        onUserUpdate(updatedProfile);
      }

      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setSmsCodeSent(false);
      setSentSmsCode('');
      setSmsCodeInput('');
      setSmsNotice(null);
      setSaveSuccessMessage("Login va parol SMS tasdiqlash orqali muvaffaqiyatli yangilandi!");
      setTimeout(() => setSaveSuccessMessage(null), 4000);
    } catch (err: any) {
      setSaveErrorMessage("Xatolik yuz berdi: " + (err.message || 'Server xatosi'));
    } finally {
      setIsSaving(false);
    }
  };

  const getStatusBadge = (status: Order['status']) => {
    switch (status) {
      case 'pending':
      case 'confirmed':
        return (
          <span className="px-2 py-0.5 rounded-full text-[9px] sm:text-[11px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-1">
            <Clock className="w-2.5 h-2.5 sm:w-3 sm:h-3" /> Onlayn mahsulot kutmoqda
          </span>
        );
      case 'assigned':
        return (
          <span className="px-2 py-0.5 rounded-full text-[9px] sm:text-[11px] font-bold bg-amber-500/25 text-amber-300 border border-amber-400/50 flex items-center gap-1 shadow-sm">
            <Package className="w-3 h-3 animate-pulse text-[#FFB800]" /> Mahsulot yuklash jarayonida
          </span>
        );
      case 'in_transit':
        return (
          <span className="px-2 py-0.5 rounded-full text-[9px] sm:text-[11px] font-bold bg-emerald-500/25 text-emerald-300 border border-emerald-400/50 flex items-center gap-1 shadow-sm">
            <Truck className="w-3 h-3 animate-bounce text-emerald-400" /> Yetkazilmoqda
          </span>
        );
      case 'delivered':
        return (
          <span className="px-2 py-0.5 rounded-full text-[9px] sm:text-[11px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1">
            <CheckCircle2 className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-emerald-400" /> Yetkazildi
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded-full text-[9px] sm:text-[11px] font-bold bg-slate-700 text-slate-300">
            {status}
          </span>
        );
    }
  };

  const getPaymentBadge = (method?: string, status?: string) => {
    const isPaid = status === 'paid';
    const isAwaitingB2b = status === 'awaiting_b2b_approval';
    const isApprovedUnpaid = status === 'b2b_approved_unpaid';
    return (
      <div className="flex items-center gap-1 flex-wrap">
        <span
          className={`px-1.5 py-0.5 rounded-md text-[9px] sm:text-[10px] font-bold uppercase border ${
            method === 'payme'
              ? 'bg-[#00CCCC]/20 text-[#00CCCC] border-[#00CCCC]/40'
              : method === 'click'
              ? 'bg-[#008AE6]/20 text-[#008AE6] border-[#008AE6]/40'
              : method === 'uzum'
              ? 'bg-[#7000FF]/20 text-[#B070FF] border-[#7000FF]/40'
              : method === 'cash'
              ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
              : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
          }`}
        >
          {method === 'cash' ? "Naqd to'lov" : method || 'Karta'}
        </span>
        <span
          className={`text-[9px] sm:text-[10px] font-black px-1.5 py-0.5 rounded ${
            isPaid
              ? 'bg-emerald-500/20 text-emerald-400'
              : isAwaitingB2b
              ? 'bg-amber-500/20 text-amber-300 border border-amber-400/40'
              : isApprovedUnpaid
              ? 'bg-blue-500/25 text-sky-300 border border-sky-400/50 animate-pulse'
              : 'bg-amber-500/20 text-amber-300'
          }`}
        >
          {isPaid
            ? '✓ To‘langan'
            : isAwaitingB2b
            ? '⏳ Zavod B2B tasdiqlashi kutilmoqda'
            : isApprovedUnpaid
            ? '🔔 Zavod tasdiqladi — To‘lov kutilmoqda'
            : 'Yetkazilganda to‘lanadi'}
        </span>
      </div>
    );
  };

  if (!user) {
    return (
      <div className="text-center py-20 bg-[#F3F4F6] rounded-xl border border-[#D1D5DB] p-8 space-y-4 max-w-2xl mx-auto shadow-md anim-part-12">
        <div className="w-16 h-16 rounded-xl bg-white border border-[#D1D5DB] flex items-center justify-center mx-auto text-[#D97706]">
          <Settings className="w-8 h-8" />
        </div>
        <h3 className="text-xl font-bold text-[#374151]">Kabinet sozlamalari</h3>
        <p className="text-xs text-[#6B7280] max-w-md mx-auto leading-relaxed">
          Parol va login almashtirish, shaxsiy ma'lumotlarni tahrirlash hamda saqlangan buyurtmalarni monitoring qilish uchun kabinetingizga kiring.
        </p>
        <button
          onClick={onOpenAuth}
          className="btn-kabinet-kirish-red bg-[#DC2626] hover:bg-[#B91C1C] active:bg-[#991B1B] text-white border border-red-700 px-6 py-2.5 rounded-lg font-bold text-xs sm:text-sm cursor-pointer shadow-md active:scale-95 transition-all"
        >
          Kabinetga Kirish / Ro'yxatdan o'tish
        </button>
      </div>
    );
  }

  const filteredOrders = orders.filter((o) => {
    if (statusFilter === 'all') return true;
    if (statusFilter === 'pending') return o.status === 'pending' || o.status === 'confirmed';
    if (statusFilter === 'confirmed') return o.status === 'assigned';
    return o.status === statusFilter;
  });

  const totalSpent = orders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);
  const totalItemsCount = orders.reduce(
    (sum, o) => sum + (o.items ? o.items.reduce((s, i) => s + i.quantity, 0) : 0),
    0
  );

  const totalCartItems = cart.reduce((sum, item) => sum + item.quantity, 0);
  const totalCartSum = cart.reduce((sum, item) => sum + item.product.price * item.quantity, 0);

  // Bildirishnoma: Mijoz buyurtmasi Yuklash jarayonida ('assigned'), Manzilga yuborildi ('in_transit') yoki yangi buyurtma bo'lganda Buyurtmalarim bo'limi rangi tovlanadi
  const activeAlertOrders = orders.filter(
    (o) => o.status === 'assigned' || o.status === 'in_transit' || o.status === 'pending' || o.status === 'confirmed'
  );
  const loadingOrdersCount = orders.filter((o) => o.status === 'assigned').length;
  const inTransitWithPhoneOrders = orders.filter((o) => o.status === 'in_transit' && o.driverPhone);
  const hasOrdersAlert = activeAlertOrders.length > 0;

  return (
    <div className="min-h-screen w-full flex flex-col transition-colors duration-300 bg-white text-[#374151]">
      {/* ============================================================== */}
      {/* MIJOZ KABINETI YUQORI PANELI (TYOMNIY SINIY + SARIQ)           */}
      {/* ============================================================== */}
      <header className="sticky top-0 z-40 w-full bg-8k-navy-header border-b-2 border-[#FFB800] text-white shadow-sm">
        <div className="h-[3px] w-full anim-part-1 opacity-95" />
        <div className="w-full px-3 sm:px-6 lg:px-8 pt-2 pb-1 sm:py-0 h-12 sm:h-13 flex items-center justify-between gap-2">
          {/* Chap tomon: Kichkinaroq Logo (Bo'limlar menyusi tugmasi pastga Qidiruv/Filtr qatoriga tushirildi) */}
          <div className="flex items-center gap-2 mt-1.5 sm:mt-0">
            <div
              onClick={() => setActiveSection('bunker')}
              onDoubleClick={(e) => {
                e.stopPropagation();
                setIsCabinetLogsOpen(true);
              }}
              title="Loglar bo‘limiga kirish uchun logotipni 2 marta bosing"
              className="flex items-center gap-1.5 sm:gap-2 cursor-pointer group select-none"
            >
              <div className="anim-part-2 relative w-6 h-6 sm:w-8 sm:h-8 rounded-md bg-[#0F2547] border border-[#254B85] group-hover:border-[#FFB800] flex items-center justify-center transition-all shadow-sm">
                <HardHat className="w-3.5 h-3.5 sm:w-4.5 sm:h-4.5 text-[#FFB800] stroke-[2.2]" />
              </div>
              <div className="flex flex-col">
                <span className="text-xs sm:text-base font-black tracking-wider leading-none">
                  <span className="text-[#FFB800]">BUNKER</span>{' '}
                  <span className="text-white">STROY</span>
                </span>
              </div>
            </div>
          </div>

          {/* O'ng tomon: Savat tezkor tugmasi (Liquid Glass) */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            {/* Savat tezkor tugmasi */}
            <button
              type="button"
              onClick={() => setActiveSection('savat')}
              className={`relative flex items-center gap-1.5 px-2.5 sm:px-3.5 py-1 sm:py-1.5 rounded-lg text-[11px] sm:text-xs font-bold cursor-pointer ${
                totalCartItems > 0
                  ? 'liquid-glass-btn-emerald font-black'
                  : activeSection === 'savat'
                  ? 'liquid-glass-btn-amber font-black'
                  : 'liquid-glass-btn-navy'
              }`}
              title="Savat bo'limiga o'tish"
            >
              <ShoppingCart className={`w-3.5 h-3.5 ${
                totalCartItems > 0
                  ? 'text-white'
                  : activeSection === 'savat'
                  ? 'text-[#071326]'
                  : 'text-[#FFB800]'
              }`} />
              <span className={totalCartItems > 0 ? 'text-white' : activeSection === 'savat' ? 'text-[#071326]' : 'text-white'}>Savat</span>
              {totalCartItems > 0 && (
                <span className="bg-[#071326] text-white px-1 py-0.2 rounded text-[10px] font-mono font-black border border-emerald-300">
                  {totalCartItems}
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* ============================================================== */}
      {/* ASOSIY TANA: KUNDUZGI / TUNGI REJIM + LIQUID GLASS YON PANEL    */}
      {/* ============================================================== */}
      <main className={`flex-1 w-full flex flex-col transition-colors duration-300 ${cabinetTheme === 'night' ? 'bg-[#071326] text-gray-100' : 'bg-white text-gray-800'}`}>
        <div className={`flex-1 flex flex-col lg:flex-row items-stretch min-h-[calc(100vh-3rem)] sm:min-h-[calc(100vh-4rem)] transition-colors duration-300 ${cabinetTheme === 'night' ? 'bg-[#071326]' : 'bg-white'}`}>

          {/* MOBIL YON MENYU (FAQAT AJRATILGAN BO'LIM NOMLARI KNOPKASI TYOMNIY SINIY) */}
          {isMobileSidebarOpen && (
            <div
              className="fixed inset-0 bg-[#071326]/60 backdrop-blur-sm z-50 lg:hidden flex animate-fadeIn"
              onClick={() => setIsMobileSidebarOpen(false)}
            >
              <div
                className={`anim-part-8 w-72 max-w-[85vw] h-[100dvh] min-h-screen backdrop-blur-xl border-r p-4 flex flex-col justify-between shadow-2xl overflow-y-auto ${
                  cabinetTheme === 'night'
                    ? 'bg-[#071326]/90 border-white/15 text-white'
                    : 'bg-white/95 border-slate-200 text-slate-800'
                }`}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="space-y-4">
                  {/* Bo'limlar tepasidagi Ism (bosilganda Sozlamalar ochiladi) va X yopish tugmasi */}
                  <div className={`pb-3 border-b flex items-center justify-between gap-2 anim-part-9 ${
                    cabinetTheme === 'night' ? 'border-white/15' : 'border-slate-200'
                  }`}>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveSection('settings');
                        setIsMobileSidebarOpen(false);
                      }}
                      className={`flex-1 flex items-center gap-2.5 p-2.5 rounded-xl transition-all cursor-pointer text-left min-w-0 ${
                        activeSection === 'settings'
                          ? 'liquid-glass-tab-active font-black'
                          : 'liquid-glass-tab-inactive'
                      }`}
                      title="Sozlamalar bo'limini ochish"
                    >
                      {user.photoURL ? (
                        <img
                          src={user.photoURL}
                          alt={user.displayName}
                          className="w-8 h-8 rounded-lg object-cover border border-[#FFB800] shrink-0"
                        />
                      ) : (
                        <div className="anim-part-2 w-8 h-8 rounded-lg bg-[#071326] text-[#FFB800] font-mono font-black text-xs flex items-center justify-center border border-[#FFB800] shrink-0">
                          {getUserInitials(user)}
                        </div>
                      )}
                      <span className={`text-sm font-black tracking-wider font-mono truncate ${activeSection === 'settings' ? 'text-[#071326]' : 'text-white'}`}>
                        {user.firstName || user.displayName}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsMobileSidebarOpen(false)}
                      title="Bo'limlarni yopish"
                      className="p-2.5 rounded-xl liquid-glass-tab-inactive text-[#FFB800] hover:text-white cursor-pointer shrink-0"
                    >
                      <X className="w-4 h-4 stroke-[2.5]" />
                    </button>
                  </div>

                  <nav className="flex flex-col gap-2.5 anim-part-9">
                    {/* 1. Mahsulotlar */}
                    <button
                      type="button"
                      onClick={() => { setActiveSection('bunker'); setIsMobileSidebarOpen(false); }}
                      className={`anim-part-10 w-full flex items-center justify-between p-3 rounded-xl text-xs font-bold transition-all text-left cursor-pointer ${
                        activeSection === 'bunker'
                          ? 'liquid-glass-tab-active font-black'
                          : 'liquid-glass-tab-inactive'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <HardHat className={`w-4 h-4 stroke-[2.2] ${activeSection === 'bunker' ? 'text-[#071326]' : 'text-[#FFB800]'}`} />
                        <span className="block font-bold">Mahsulotlar</span>
                      </div>
                    </button>

                    {/* 2. Zavod Mahsulotlari */}
                    <button
                      type="button"
                      onClick={() => { setActiveSection('global_bunker'); setIsMobileSidebarOpen(false); }}
                      className={`anim-part-10 w-full flex items-center justify-between p-3 rounded-xl text-xs font-bold transition-all text-left cursor-pointer ${
                        activeSection === 'global_bunker'
                          ? 'liquid-glass-tab-active font-black'
                          : 'liquid-glass-tab-inactive'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <Globe className={`w-4 h-4 stroke-[2.2] ${activeSection === 'global_bunker' ? 'text-[#071326]' : 'text-[#FFB800]'}`} />
                        <span className="block font-bold">Zavod Mahsulotlari</span>
                      </div>
                    </button>

                    {/* 3. Savat */}
                    <button
                      type="button"
                      onClick={() => { setActiveSection('savat'); setIsMobileSidebarOpen(false); }}
                      className={`w-full flex items-center justify-between p-3 rounded-xl text-xs font-bold transition-all text-left cursor-pointer ${
                        totalCartItems > 0
                          ? 'liquid-glass-btn-emerald font-black'
                          : activeSection === 'savat'
                          ? 'liquid-glass-tab-active font-black'
                          : 'liquid-glass-tab-inactive'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <ShoppingCart className={`w-4 h-4 stroke-[2.2] ${
                          totalCartItems > 0
                            ? 'text-white'
                            : activeSection === 'savat'
                            ? 'text-[#071326]'
                            : 'text-[#FFB800]'
                        }`} />
                        <span className="block font-bold">Savat</span>
                      </div>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${
                        totalCartItems > 0
                          ? 'bg-[#071326] text-white border-emerald-300'
                          : 'bg-[#071326] text-[#FFB800] border-[#2E5A9C]'
                      }`}>
                        {totalCartItems}
                      </span>
                    </button>

                    {/* 4. Buyurtmalarim */}
                    <button
                      type="button"
                      onClick={() => { setActiveSection('orders'); setIsMobileSidebarOpen(false); }}
                      className={`anim-part-11 w-full flex items-center justify-between p-3 rounded-xl text-xs font-bold transition-all text-left cursor-pointer ${
                        activeSection === 'orders' || hasOrdersAlert
                          ? 'liquid-glass-tab-active font-black'
                          : 'liquid-glass-tab-inactive'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <Package className={`w-4 h-4 stroke-[2.2] ${activeSection === 'orders' || hasOrdersAlert ? 'text-[#071326]' : 'text-[#FFB800]'}`} />
                        <span className="block font-bold">Buyurtmalarim</span>
                      </div>
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-[#071326] text-[#FFB800] border border-[#1E3A6D]">
                        {orders.length}
                      </span>
                    </button>
                  </nav>
                </div>
              </div>
            </div>
          )}

          {/* DESKTOP YON TARAFI: YIG'ILGANDA YON CHIZIQ VA STRELKA ORQALI OCHILADI, OCHILGANDA X BILAN YOPILADI */}
          {isSidebarCollapsed ? (
            <div
              onMouseEnter={() => setIsSidebarCollapsed(false)}
              onClick={() => setIsSidebarCollapsed(false)}
              title="Bo'limlarni ochish"
              className="hidden lg:flex flex-col items-start shrink-0 w-3 self-stretch min-h-[calc(100vh-3rem)] sm:min-h-[calc(100vh-4rem)] cursor-pointer group relative z-30 select-none"
            >
              <div className="w-[3px] group-hover:w-1.5 h-full bg-gradient-to-b from-[#FFB800] via-[#38BDF8] to-[#FFB800] opacity-90 transition-all duration-150" />
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsSidebarCollapsed(false);
                }}
                title="Bo'limlarni ochish"
                className="fixed left-1.5 top-20 z-40 p-2 rounded-xl liquid-glass-tab-inactive text-[#FFB800] cursor-pointer shadow-lg"
              >
                <ArrowRight className="w-4 h-4 stroke-[2.5]" />
              </button>
            </div>
          ) : (
            <aside className={`hidden lg:flex flex-col shrink-0 w-72 bg-transparent border-r transition-all duration-200 self-stretch min-h-[calc(100vh-3rem)] sm:min-h-[calc(100vh-4rem)] ${
              cabinetTheme === 'night' ? 'border-white/10' : 'border-slate-200/80'
            }`}>
              <div className="sticky top-14 sm:top-16 flex-1 flex flex-col justify-between p-3 sm:p-4 space-y-3">
                <div className="space-y-3 anim-part-9">
                  {/* Bo'limlar tepasidagi Ism (bosilganda Sozlamalar ochiladi) va X yig'ish tugmasi */}
                  <div className={`pb-3 border-b flex items-center justify-between gap-2 select-none ${
                    cabinetTheme === 'night' ? 'border-white/15' : 'border-slate-200'
                  }`}>
                    <button
                      type="button"
                      onClick={() => setActiveSection('settings')}
                      className={`flex-1 flex items-center gap-2.5 px-3 py-2.5 min-w-0 rounded-xl transition-all cursor-pointer ${
                        activeSection === 'settings'
                          ? 'liquid-glass-tab-active font-black'
                          : 'liquid-glass-tab-inactive'
                      }`}
                      title="Sozlamalar bo'limini ochish"
                    >
                      {user.photoURL ? (
                        <img
                          src={user.photoURL}
                          alt={user.displayName}
                          className="w-7 h-7 rounded-lg object-cover border border-[#FFB800] shrink-0"
                        />
                      ) : (
                        <div className="anim-part-2 w-7 h-7 rounded-lg bg-[#071326] text-[#FFB800] font-mono font-black text-xs flex items-center justify-center border border-[#FFB800] shrink-0">
                          {getUserInitials(user)}
                        </div>
                      )}
                      <span className={`text-sm font-black tracking-wider font-mono truncate ${activeSection === 'settings' ? 'text-[#071326]' : 'text-white'}`}>
                        {user.firstName || user.displayName}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setIsSidebarCollapsed(true)}
                      title="Bo'limlarni yopish"
                      className="p-2.5 rounded-xl liquid-glass-tab-inactive text-[#FFB800] transition-colors cursor-pointer shrink-0"
                    >
                      <X className="w-4 h-4 stroke-[2.5]" />
                    </button>
                  </div>

                  {/* 4 ta Bo'lim (Faqat ajratilgan bo'lim nomlari knopkasi Tyomniy Siniy) */}
                  <nav className="flex flex-col gap-2.5">
                    {/* 1. Mahsulotlar */}
                    <button
                      type="button"
                      onClick={() => setActiveSection('bunker')}
                      title="Mahsulotlar"
                      className={`anim-part-10 w-full flex items-center justify-between p-3 rounded-xl text-xs font-bold transition-all text-left cursor-pointer ${
                        activeSection === 'bunker'
                          ? 'liquid-glass-tab-active font-black'
                          : 'liquid-glass-tab-inactive'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <HardHat className={`w-4 h-4 stroke-[2.2] shrink-0 ${activeSection === 'bunker' ? 'text-[#071326]' : 'text-[#FFB800]'}`} />
                        <span className="block font-bold">Mahsulotlar</span>
                      </div>
                    </button>

                    {/* 2. Zavod Mahsulotlari */}
                    <button
                      type="button"
                      onClick={() => setActiveSection('global_bunker')}
                      title="Zavod Mahsulotlari"
                      className={`anim-part-10 w-full flex items-center justify-between p-3 rounded-xl text-xs font-bold transition-all text-left cursor-pointer ${
                        activeSection === 'global_bunker'
                          ? 'liquid-glass-tab-active font-black'
                          : 'liquid-glass-tab-inactive'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <Globe className={`w-4 h-4 stroke-[2.2] shrink-0 ${activeSection === 'global_bunker' ? 'text-[#071326]' : 'text-[#FFB800]'}`} />
                        <span className="block font-bold">Zavod Mahsulotlari</span>
                      </div>
                    </button>

                    {/* 3. Savat */}
                    <button
                      type="button"
                      onClick={() => setActiveSection('savat')}
                      title="Savat"
                      className={`w-full flex items-center justify-between p-3 rounded-xl text-xs font-bold transition-all text-left cursor-pointer ${
                        totalCartItems > 0
                          ? 'liquid-glass-btn-emerald font-black'
                          : activeSection === 'savat'
                          ? 'liquid-glass-tab-active font-black'
                          : 'liquid-glass-tab-inactive'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <ShoppingCart className={`w-4 h-4 stroke-[2.2] shrink-0 ${
                          totalCartItems > 0
                            ? 'text-white'
                            : activeSection === 'savat'
                            ? 'text-[#071326]'
                            : 'text-[#FFB800]'
                        }`} />
                        <span className="block font-bold">Savat</span>
                      </div>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-[#071326] border ${
                        totalCartItems > 0 ? 'text-white border-emerald-300' : 'text-[#FFB800] border-[#1E3A6D]'
                      }`}>
                        {totalCartItems}
                      </span>
                    </button>

                    {/* 4. Buyurtmalarim */}
                    <button
                      type="button"
                      onClick={() => setActiveSection('orders')}
                      title="Buyurtmalarim"
                      className={`anim-part-11 w-full flex items-center justify-between p-3 rounded-xl text-xs font-bold transition-all text-left cursor-pointer ${
                        activeSection === 'orders' || hasOrdersAlert
                          ? 'liquid-glass-tab-active font-black'
                          : 'liquid-glass-tab-inactive'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <Package className={`w-4 h-4 stroke-[2.2] shrink-0 ${activeSection === 'orders' || hasOrdersAlert ? 'text-[#071326]' : 'text-[#FFB800]'}`} />
                        <span className="block font-bold">Buyurtmalarim</span>
                      </div>
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-[#071326] text-[#FFB800] border border-[#1E3A6D]">
                        {orders.length}
                      </span>
                    </button>
                  </nav>
                </div>
              </div>
            </aside>
          )}

          {/* O'NG TOMON: TANLANGAN BO'LIM TARKIBI */}
          <div className={`flex-1 min-w-0 w-full flex flex-col mt-3 sm:mt-0 px-2 sm:px-6 lg:px-8 py-2 sm:py-5 space-y-3 transition-colors duration-300 ${cabinetTheme === 'night' ? 'bg-[#071326]' : 'bg-white'}`}>

            {/* 13-QISM ANIMATSIYASI: BILDIRISHNOMA (ALERT) + STRELKA BO'LIMLAR TUGMASI BIR QATORDA */}
            {activeSection === 'orders' && (loadingOrdersCount > 0 || inTransitWithPhoneOrders.length > 0) && (
              <div
                onClick={() => setActiveSection('orders')}
                className="anim-part-13 mt-2 sm:mt-0 px-2.5 py-1.5 rounded-xl bg-[#0A1931] border-2 border-[#FFB800] text-white shadow-md flex items-center justify-between gap-2 cursor-pointer transition-all"
              >
                <div className="flex items-center gap-2 flex-wrap min-w-0">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsMobileSidebarOpen(true);
                    }}
                    className="lg:hidden p-2 rounded-lg liquid-glass-btn-navy text-[#FFB800] font-black text-[11px] sm:text-xs cursor-pointer shrink-0 flex items-center justify-center"
                    title="Bo‘limlarni ochish"
                    aria-label="Bo‘limlarni ochish"
                  >
                    <ArrowRight className="w-4 h-4 stroke-[2.5]" />
                  </button>
                  <div className="w-5 h-5 rounded-md bg-emerald-500 text-[#0A1931] flex items-center justify-center font-black shrink-0">
                    <Truck className="w-3 h-3" />
                  </div>
                  <div className="text-[10px] sm:text-xs font-black text-white flex items-center gap-1.5 flex-wrap">
                    <span className="text-[#FFB800]">Buyurtma Holati Bildirishnomasi!</span>
                    {loadingOrdersCount > 0 && (
                      <span className="px-1.5 py-0.5 rounded text-[9px] sm:text-[10px] font-mono font-black bg-[#FFB800] text-[#0A1931]">
                        Yuklashda: {loadingOrdersCount} ta
                      </span>
                    )}
                    {inTransitWithPhoneOrders.length > 0 && (
                      <span className="px-2 py-0.5 rounded text-[9px] sm:text-[10px] font-mono font-black bg-emerald-500/25 text-emerald-300 border border-emerald-400/50">
                        Yetkazilmoqda • Tel: {inTransitWithPhoneOrders[0].driverPhone}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* 1-BO'LIM: BUNKER (MAHSULOTLAR KATALOGI — Bo'limlar tugmasi Qidiruv va Filtr qatorida) */}
            {activeSection === 'bunker' && (
              <div className="animate-fadeIn">
                <Marketplace
                  products={products.filter((p) => p.supplierCabinetType !== 'manufacturer')}
                  onAddToCart={onAddToCart}
                  currentUser={user}
                  onOpenCabinetMenu={() => setIsMobileSidebarOpen(true)}
                />
              </div>
            )}

            {/* 2-BO'LIM: B2B BUNKER (Bo'limlar tugmasi Qidiruv va Filtr qatorida) */}
            {activeSection === 'global_bunker' && (
              <div className="animate-fadeIn">
                <Marketplace
                  products={products.filter((p) => p.supplierCabinetType === 'manufacturer')}
                  onAddToCart={onAddToCart}
                  currentUser={user}
                  onOpenCabinetMenu={() => setIsMobileSidebarOpen(true)}
                />
              </div>
            )}

            {/* 3-BO'LIM: SAVAT (FULL SCREEN WHITE BACKGROUND YOKI TUNGI REJIMDA LIQUID GLASS) */}
            {activeSection === 'savat' && (
              <div className={`${
                cabinetTheme === 'night'
                  ? 'liquid-glass-settings-window text-[#F5F5F2]'
                  : 'bg-white text-[#0A1931]'
              } rounded-2xl sm:rounded-3xl p-3 sm:p-8 lg:p-10 mt-2.5 sm:mt-0 space-y-4 sm:space-y-8 animate-fadeIn w-full flex-1 min-h-[75vh] sm:min-h-[calc(100vh-6rem)] flex flex-col justify-between`}>
                <div className="space-y-4 sm:space-y-8 flex-1 flex flex-col">
                  <div className={`flex items-center justify-between gap-3 pb-3.5 sm:pb-6 border-b ${
                    cabinetTheme === 'night' ? 'border-white/15' : 'border-slate-200'
                  }`}>
                    <div className="flex items-center gap-2.5 sm:gap-4">
                      <button
                        type="button"
                        onClick={() => setIsMobileSidebarOpen(true)}
                        className="lg:hidden p-2 rounded-lg liquid-glass-btn-navy text-[#FFB800] cursor-pointer shrink-0"
                        title="Bo‘limlarni ochish"
                      >
                        <ArrowRight className="w-4 h-4 stroke-[2.5]" />
                      </button>
                      <div className="p-2 sm:p-4 rounded-xl sm:rounded-2xl liquid-glass-btn-emerald text-white">
                        <ShoppingCart className="w-5 h-5 sm:w-7 sm:h-7 lg:w-8 lg:h-8" />
                      </div>
                      <div>
                        <h2 className={`text-base sm:text-2xl lg:text-3xl font-black leading-tight ${
                          cabinetTheme === 'night' ? 'text-[#F5F5F2]' : 'text-[#0A1931]'
                        }`}>
                          Savat ({totalCartItems})
                        </h2>
                        <p className={`text-[11px] sm:text-base lg:text-lg mt-0.5 sm:mt-1 ${
                          cabinetTheme === 'night' ? 'text-sky-200' : 'text-slate-600 font-semibold'
                        }`}>
                          Tanlangan qurilish mahsulotlari va tezkor buyurtma oynasi
                        </p>
                      </div>
                    </div>
                  </div>

                  {cart.length === 0 ? (
                    <div className="text-center py-14 sm:py-24 lg:py-32 p-6 sm:p-14 lg:p-20 space-y-4 sm:space-y-6 flex-1 w-full flex flex-col items-center justify-center min-h-[52vh] sm:min-h-[65vh]">
                      <div className="w-16 h-16 sm:w-24 sm:h-24 lg:w-28 lg:h-28 rounded-2xl sm:rounded-3xl liquid-glass-filter-card flex items-center justify-center mx-auto shadow-lg">
                        <ShoppingCart className="w-8 h-8 sm:w-12 sm:h-12 lg:w-14 lg:h-14 text-[#FFB800]" />
                      </div>
                      <h4 className={`text-base sm:text-2xl lg:text-3xl font-black ${
                        cabinetTheme === 'night' ? 'text-white' : 'text-[#0A1931]'
                      }`}>
                        Savatingiz hozircha bo‘sh
                      </h4>
                      <p className={`text-xs sm:text-base lg:text-lg max-w-md sm:max-w-xl mx-auto leading-relaxed ${
                        cabinetTheme === 'night' ? 'text-sky-200' : 'text-slate-600 font-semibold'
                      }`}>
                        Bunker katalogidan kerakli qurilish mahsulotlarini tanlab savatga qo‘shing.
                      </p>
                      <button
                        type="button"
                        onClick={() => setActiveSection('bunker')}
                        className="liquid-glass-btn-amber px-6 py-2.5 sm:px-9 sm:py-4 rounded-xl sm:rounded-2xl font-black text-xs sm:text-base lg:text-lg cursor-pointer mt-2 shadow-md"
                      >
                        Bunker Katalogiga O‘tish
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-4 sm:space-y-6">
                      <div className="w-full overflow-hidden sm:overflow-x-auto rounded-2xl liquid-glass-settings-card text-white">
                        <table className="w-full text-left border-collapse table-fixed sm:table-auto">
                          <thead>
                            <tr className="bg-[#0A1931]/70 border-b border-white/15 text-[8.5px] sm:text-sm font-black uppercase tracking-tight sm:tracking-wider text-sky-200">
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
                            {cart.map((item, idx) => {
                              const liveProd = products.find((p) => p.id === item.product.id) || item.product;
                              const maxStock = typeof liveProd.stock === 'number' ? Math.max(0, liveProd.stock) : 0;
                              const isAtLimit = item.quantity >= maxStock;
                              const cleanSupplierName = String(item.product.supplierName || "Rasmiy Ta'minotchi")
                                .replace(/mas['’`]?uliyati\s+cheklangan\s+jamiyati/gi, '')
                                .replace(/\bMCHJ\b/gi, '')
                                .trim();
                              const supplierAddr = [item.product.region, item.product.district]
                                .filter(Boolean)
                                .join(', ') || 'O‘zbekiston';

                              return (
                                <tr key={item.product.id} className="hover:bg-[#132C54]/75 transition-colors">
                                  {/* Desktopda alohida № */}
                                  <td className="hidden sm:table-cell sm:py-4 sm:px-5 text-center text-[#FFB800] font-mono font-black sm:text-base align-middle border-r border-white/15">
                                    {idx + 1}
                                  </td>

                                  {/* 1-ustun: Mahsulot Nomi */}
                                  <td className="py-2.5 px-1.5 sm:py-4 sm:px-5 align-middle border-r border-white/15">
                                    <div className="flex items-start sm:items-center gap-1 sm:gap-3.5">
                                      <img
                                        src={item.product.image}
                                        alt=""
                                        className="w-6 h-6 sm:w-14 sm:h-14 rounded sm:rounded-xl object-cover shrink-0 bg-[#0A1931]/80 border border-white/20 mt-0.5 sm:mt-0"
                                      />
                                      <div className="min-w-0 flex-1">
                                        <div className="font-black text-white text-[9px] sm:text-base leading-tight break-words">
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
                                  <td className="py-2.5 px-1 sm:py-4 sm:px-5 text-center align-middle">
                                    <div className="inline-flex items-center justify-center gap-0.5 sm:gap-2 liquid-glass-filter-card px-1 py-0.5 sm:px-3 sm:py-1.5 rounded-lg">
                                      <button
                                        type="button"
                                        disabled={item.quantity <= Math.max(1, Number(liveProd.minOrder) || Number(item.product.minOrder) || 1)}
                                        onClick={() => {
                                          const minQty = Math.max(1, Number(liveProd.minOrder) || Number(item.product.minOrder) || 1);
                                          if (item.quantity <= minQty) return;
                                          onUpdateQuantity(item.product.id, Math.max(minQty, item.quantity - 1));
                                        }}
                                        className={`p-0.5 sm:p-1 rounded ${
                                          item.quantity <= Math.max(1, Number(liveProd.minOrder) || Number(item.product.minOrder) || 1)
                                            ? 'text-slate-600 opacity-40 cursor-not-allowed'
                                            : 'text-sky-200 hover:text-white cursor-pointer'
                                        }`}
                                      >
                                        <Minus className="w-2.5 h-2.5 sm:w-4 sm:h-4" />
                                      </button>
                                      <span className="text-[9px] sm:text-base font-black text-[#FFB800] px-0.5 sm:px-2.5 min-w-[16px] sm:min-w-[32px] text-center font-mono">
                                        {item.quantity}
                                      </span>
                                      <button
                                        type="button"
                                        disabled={isAtLimit}
                                        onClick={() => {
                                          if (item.quantity < maxStock) {
                                            onUpdateQuantity(item.product.id, item.quantity + 1);
                                          }
                                        }}
                                        className={`p-0.5 sm:p-1 rounded ${
                                          isAtLimit
                                            ? 'text-slate-600 cursor-not-allowed'
                                            : 'text-sky-200 hover:text-white cursor-pointer'
                                        }`}
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
                          <tfoot className="bg-[#0A1931]/70 border-t border-white/15 font-bold">
                            <tr>
                              <td className="hidden sm:table-cell sm:py-4 sm:px-5 border-r border-white/15" />
                              <td
                                colSpan={2}
                                className="py-2.5 px-1.5 sm:py-4 sm:px-5 text-left text-sky-200 uppercase tracking-tight sm:tracking-wider text-[8.5px] sm:text-sm font-bold border-r border-white/15"
                              >
                                Jami: {totalCartItems} ta birlik | {cart.length} xil
                              </td>
                              <td className="py-2.5 px-1 sm:py-4 sm:px-5 text-right text-[#FFB800] uppercase tracking-tight sm:tracking-wider font-black text-[8.5px] sm:text-sm border-r border-white/15">
                                Umumiy:
                              </td>
                              <td className="py-2.5 px-1 sm:py-4 sm:px-5 text-right text-[9px] sm:text-lg text-[#FFB800] font-mono font-black break-words">
                                {formatPrice(totalCartSum)}
                              </td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>

                      <div className="p-3.5 sm:p-5 rounded-2xl liquid-glass-settings-card flex items-center justify-between gap-3 flex-wrap">
                        <div>
                          <span className="text-[11px] sm:text-sm text-sky-200 block">
                            Umumiy hisob ({totalCartItems} ta):
                          </span>
                          <span className="text-base sm:text-2xl font-black text-[#FFB800] font-mono">
                            {formatPrice(totalCartSum)}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setIsCheckoutOpen(true)}
                          className="liquid-glass-btn-amber px-5 py-2.5 sm:px-7 sm:py-3.5 rounded-xl font-black text-xs sm:text-base flex items-center justify-center gap-2 cursor-pointer"
                        >
                          <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5 stroke-[2.5]" />
                          <span>Buyurtmani Rasmiylashtirish</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 4-BO'LIM: BUYURTMALARIM (MOBILDA BITTA EKRANGA TO'LIQ SIG'ADIGAN IXCHAM DIZAYN) */}
            {activeSection === 'orders' && (
              <div className="bg-[#0A1931] rounded-xl border border-[#1E3A6D] p-2 sm:p-4 mt-2.5 sm:mt-0 text-[#F5F5F2] shadow-xl space-y-1.5 sm:space-y-3 animate-fadeIn">
                {/* Yuqori qator: Buyurtmalarim sarlavhasi + Holat filtrlari bir qatorda/ixcham */}
                <div className="flex flex-wrap items-center justify-between gap-1.5 pb-1.5 sm:pb-2.5 border-b border-[#1E3A6D]">
                  <div className="flex items-center gap-1.5">
                    {!(loadingOrdersCount > 0 || inTransitWithPhoneOrders.length > 0) && (
                      <button
                        type="button"
                        onClick={() => setIsMobileSidebarOpen(true)}
                        className="lg:hidden p-2 rounded-lg liquid-glass-btn-navy text-[#FFB800] font-black text-[11px] flex items-center justify-center cursor-pointer shrink-0"
                        title="Bo‘limlarni ochish"
                      >
                        <ArrowRight className="w-4 h-4 stroke-[2.5]" />
                      </button>
                    )}
                    <div className="p-1 sm:p-1.5 rounded-lg bg-[#FFB800]/20 text-[#FFB800] border border-[#FFB800]/40 shrink-0">
                      <Package className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    </div>
                    <h1 className="text-xs sm:text-base font-black text-[#F5F5F2] tracking-wide">
                      Buyurtmalarim
                    </h1>
                    <span className="px-1.5 py-0.2 rounded text-[10px] sm:text-xs font-bold bg-[#FFB800] text-[#0A1931] font-mono shadow-sm">
                      {orders.length}
                    </span>
                  </div>

                  {/* Buyurtmalar ro'yxati filtrlari (ixcham tugmalar) */}
                  <div className="flex flex-wrap items-center gap-1">
                    {[
                      { id: 'all', label: `Barchasi (${orders.length})` },
                      { id: 'pending', label: 'Onlayn mahsulot kutmoqda' },
                      { id: 'confirmed', label: 'Mahsulot yuklash jarayonida' },
                      { id: 'in_transit', label: 'Yetkazilmoqda' },
                      { id: 'delivered', label: 'Yetkazilgan' },
                    ].map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => setStatusFilter(f.id as any)}
                        className={`px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-md text-[9px] sm:text-[11px] font-bold transition-all cursor-pointer ${
                          statusFilter === f.id
                            ? 'bg-[#FFB800] text-[#0A1931] shadow-sm font-black'
                            : 'bg-[#071326] text-slate-200 hover:text-white border border-[#1E3A6D]'
                        }`}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Buyurtmalar ro'yxati */}
                <div className="space-y-2">
                  {statusFilter === 'delivered' && (
                    <div className="p-2 rounded-lg bg-[#07193f] border border-emerald-500/40 flex items-center justify-between flex-wrap gap-2 text-[10px] animate-fadeIn">
                      <div className="flex items-center gap-1.5">
                        <FileText className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        <span className="font-bold text-white">Yetkazilgan Buyurtmalar Hisobotlari</span>
                      </div>
                      <span className="text-[10px] font-mono font-black px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                        {orders.filter((o) => o.status === 'delivered').length} ta hisobot
                      </span>
                    </div>
                  )}

                  {loading ? (
                    <div className="text-center py-6 space-y-2">
                      <RefreshCw className="w-6 h-6 text-amber-400 animate-spin mx-auto" />
                      <p className="text-[11px] text-sky-200">Buyurtmalar yuklanmoqda...</p>
                    </div>
                  ) : filteredOrders.length === 0 ? (
                    <div className="text-center py-6 bg-[#07193f]/80 rounded-xl border border-blue-500/30 p-4 space-y-2.5">
                      <Package className="w-8 h-8 text-slate-500 mx-auto" />
                      <h4 className="text-xs sm:text-sm font-bold text-white">Buyurtmalar topilmadi</h4>
                      <p className="text-[10px] text-sky-200 max-w-xs mx-auto">
                        Sizda hali ushbu toifadagi buyurtmalar mavjud emas. Bunker bo‘limidan tovar tanlang va buyurtma bering.
                      </p>
                      <button
                        type="button"
                        onClick={() => setActiveSection('bunker')}
                        className="px-4 py-1.5 rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-[11px] cursor-pointer shadow-md"
                      >
                        Bunkerga O‘tish
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {filteredOrders.map((order) => (
                        <div
                          key={order.id}
                          className="bg-[#071326] border border-[#1E3A6D] rounded-xl p-2 sm:p-3.5 hover:border-[#FFB800]/60 transition-all space-y-1.5 sm:space-y-2.5 shadow-md"
                        >
                          {/* 1-qator: ID + Status + To'lov + Sana/Vaqt */}
                          <div className="flex flex-wrap items-center justify-between gap-1.5 pb-1.5 border-b border-[#1E3A6D]">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-mono font-black text-amber-400 text-xs sm:text-sm">
                                #{order.id.slice(-8).toUpperCase()}
                              </span>
                              {getStatusBadge(order.status)}
                              {getPaymentBadge(order.paymentMethod, order.paymentStatus)}
                            </div>

                            <div className="flex items-center gap-2 text-[10px] sm:text-xs text-slate-300 font-mono">
                              <span className="flex items-center gap-1">
                                <Calendar className="w-3 h-3 text-amber-400" />
                                {new Date(order.createdAt).toLocaleDateString('uz-UZ')}
                              </span>
                              <span>{new Date(order.createdAt).toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' })}</span>
                            </div>
                          </div>

                          {/* 2-qator: 4 bosqichli holat indikatori (3. Yetkazilmoqda YASHIL holatda) */}
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1 sm:gap-1.5 p-1 sm:p-2 rounded-lg bg-[#051026] border border-[#1E3A6D] text-[9px] sm:text-[11px]">
                            <div className="flex items-center gap-1 px-1.5 py-1 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-bold truncate">
                              <CheckCircle2 className="w-3 h-3 shrink-0 text-emerald-400" />
                              <span className="truncate">1. Onlayn mahsulot kutmoqda</span>
                            </div>
                            <div
                              className={`flex items-center gap-1 px-1.5 py-1 rounded border font-bold truncate ${
                                order.status === 'assigned'
                                  ? 'bg-[#FFB800] text-slate-950 border-amber-300 shadow-sm'
                                  : order.status === 'in_transit' || order.status === 'delivered'
                                  ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                                  : 'bg-[#0A1931] text-slate-400 border-[#1E3A6D]'
                              }`}
                            >
                              <Package className="w-3 h-3 shrink-0" />
                              <span className="truncate">2. Mahsulot yuklash jarayonida</span>
                            </div>
                            <div
                              className={`flex items-center gap-1 px-1.5 py-1 rounded border font-bold truncate ${
                                order.status === 'in_transit'
                                  ? 'bg-emerald-500 text-slate-950 border-emerald-300 shadow-sm font-black'
                                  : order.status === 'delivered'
                                  ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                                  : 'bg-[#0A1931] text-slate-400 border-[#1E3A6D]'
                              }`}
                            >
                              <Truck className="w-3 h-3 shrink-0" />
                              <span className="truncate">3. Yetkazilmoqda</span>
                            </div>
                            <div
                              className={`flex items-center gap-1 px-1.5 py-1 rounded border font-bold truncate ${
                                order.status === 'delivered'
                                  ? 'bg-emerald-500 text-slate-950 border-emerald-300 shadow-sm font-black'
                                  : 'bg-[#0A1931] text-slate-400 border-[#1E3A6D]'
                              }`}
                            >
                              <CheckCircle2 className="w-3 h-3 shrink-0" />
                              <span className="truncate">4. Yetkazildi</span>
                            </div>
                          </div>

                          {/* 3-qator: Buyurtma qilingan mahsulotlar */}
                          <div className="space-y-1">
                            <span className="text-[9px] sm:text-[10px] font-bold text-slate-300 uppercase tracking-wider block">
                              Buyurtma qilingan mahsulotlar ({order.items?.length || 0} tur):
                            </span>

                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
                              {order.items?.map((item, idx) => {
                                const itemImg = (item as any).product?.image || (item as any).image;
                                const itemTitle = item.title || (item as any).product?.title || 'Mahsulot';
                                const itemUnit = item.unit || (item as any).product?.unit || 'dona';
                                const itemPrice = item.price || (item as any).product?.price || 0;
                                return (
                                  <div
                                    key={idx}
                                    className="bg-[#0A1931] px-2 py-1.5 rounded-lg border border-[#1E3A6D] flex items-center justify-between gap-2 text-[10px] sm:text-xs"
                                  >
                                    <div className="flex items-center gap-2 min-w-0 flex-1">
                                      {itemImg && (
                                        <img
                                          src={itemImg}
                                          alt={itemTitle}
                                          className="w-7 h-7 sm:w-8 sm:h-8 rounded object-cover border border-[#1E3A6D] shrink-0"
                                        />
                                      )}
                                      <div className="min-w-0 flex-1">
                                        <h5 className="font-bold text-[#F5F5F2] truncate text-[10px] sm:text-xs leading-tight">{itemTitle}</h5>
                                        <p className="text-[9px] sm:text-[10px] text-slate-300 leading-tight">
                                          {item.quantity} {itemUnit} × {formatPrice(itemPrice)}
                                        </p>
                                      </div>
                                    </div>
                                    <span className="font-mono font-bold text-[#FFB800] text-[10px] sm:text-xs shrink-0">
                                      {formatPrice(itemPrice * item.quantity)}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>

                          {/* 4-qator: Manzil, Qabul qiluvchi, Holat, Tel nomer hamda Jami To'lov + Mahsulot uchun chek bitta ixcham blokda */}
                          <div className="pt-1.5 border-t border-[#1E3A6D] space-y-1.5 text-[10px] sm:text-xs">
                            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[#B8B8B3]">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span className="font-semibold text-[#F5F5F2] shrink-0">Manzil:</span>
                                <span className="font-bold text-white truncate">
                                  {formatRegionAndDistrictOnly(order.deliveryAddress)}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => setSelectedMapOrder(order)}
                                  title="Xaritadan ko‘rish"
                                  className="p-1 rounded bg-[#FFB800]/20 hover:bg-[#FFB800] text-[#FFB800] hover:text-slate-950 border border-[#FFB800]/50 cursor-pointer transition-all shrink-0"
                                >
                                  <MapPin className="w-3 h-3 stroke-[2.3]" />
                                </button>
                              </div>

                              {order.recipientPhone && (
                                <div className="flex items-center gap-1 text-[10px] sm:text-[11px] text-slate-300">
                                  <Phone className="w-2.5 h-2.5 text-[#FFB800] shrink-0" />
                                  <span>Qabul qiluvchi: <strong className="text-white">{order.recipientName || 'Xaridor'} ({order.recipientPhone})</strong></span>
                                </div>
                              )}
                            </div>

                            {/* Holat va Haydovchi tel raqami yonma-yon ixcham */}
                            <div className="flex flex-wrap items-center gap-1.5">
                              {order.status === 'assigned' && (
                                <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/20 border border-[#FFB800] text-[#FFB800] font-black text-[10px] animate-pulse">
                                  <Package className="w-3 h-3 shrink-0" />
                                  <span>Mahsulot yuklash jarayonida</span>
                                </div>
                              )}
                              {order.status === 'in_transit' && (
                                <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/20 border border-emerald-400 text-emerald-300 font-black text-[10px]">
                                  <Truck className="w-3 h-3 shrink-0 text-emerald-400" />
                                  <span>Holat: Yetkazilmoqda</span>
                                </div>
                              )}
                              {order.driverPhone && (
                                <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-emerald-500/20 border border-emerald-400 text-emerald-300 font-black text-[10px]">
                                  <Phone className="w-3 h-3 text-emerald-400 shrink-0" />
                                  <span>Bog‘lanish uchun tel nomer:</span>
                                  <a
                                    href={`tel:${order.driverPhone}`}
                                    className="font-mono text-[11px] text-white underline hover:text-[#FFB800]"
                                  >
                                    {order.driverPhone}
                                  </a>
                                </div>
                              )}
                            </div>

                            {/* Zavod (B2B) so'rovi holati va To'lov tugmasi */}
                            {order.paymentStatus === 'awaiting_b2b_approval' && (
                              <div className="p-2.5 rounded-xl bg-amber-500/15 border border-amber-400/50 text-amber-200 text-[10px] sm:text-xs font-semibold flex items-center gap-2">
                                <Clock className="w-4 h-4 text-[#FFB800] shrink-0 animate-spin" />
                                <span>
                                  Zavod (B2B) kabinetiga buyurtma so‘rovi yuborilgan. Zavod tasdiqlaganidan so‘ng to‘lov qilish tugmasi faollashadi.
                                </span>
                              </div>
                            )}

                            {order.paymentStatus === 'b2b_approved_unpaid' && (
                              <div className="p-2.5 sm:p-3 rounded-xl bg-emerald-500/20 border-2 border-emerald-400 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                <div className="text-[11px] sm:text-xs text-emerald-100 font-bold">
                                  ✅ Zavod (B2B) kabineti so‘rovingizni tasdiqladi! Endi to‘lovni amalga oshirishingiz mumkin:
                                </div>
                                <button
                                  type="button"
                                  onClick={() => openB2bPaymentModal(order)}
                                  className="px-3.5 py-2 rounded-lg bg-[#FFB800] hover:bg-amber-400 text-[#0A1931] font-black text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow-md active:scale-95 shrink-0"
                                >
                                  <CreditCard className="w-3.5 h-3.5" />
                                  <span>To‘lov qilish ({formatPrice(order.totalAmount)})</span>
                                </button>
                              </div>
                            )}

                            {/* Eng pastki qator: Jami To'lov (chapda) va Mahsulot uchun chek (o'ngda) bir qatorda */}
                            <div className="pt-1 border-t border-[#1E3A6D] flex items-center justify-between gap-2">
                              <div className="flex items-baseline gap-1.5">
                                <span className="text-[10px] text-slate-300 font-semibold">Jami To'lov:</span>
                                <span className="text-xs sm:text-base font-black text-[#FFB800] font-mono">
                                  {formatPrice(order.totalAmount)}
                                </span>
                              </div>

                              {(order.status === 'assigned' ||
                                order.status === 'in_transit' ||
                                order.status === 'delivered') && (
                                <button
                                  type="button"
                                  onClick={() => setSelectedReceiptOrder(order)}
                                  className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-[#FFB800] to-amber-500 hover:from-[#FFC928] hover:to-amber-400 text-[#0A1931] text-[10px] sm:text-xs font-black flex items-center gap-1 cursor-pointer transition-all shadow-sm active:scale-95 shrink-0"
                                >
                                  <FileText className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                                  <span>Mahsulot uchun chek</span>
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 5-BO'LIM: SOZLAMALAR (FAQAT OYNANING O'ZI LIQUID GLASS DIZAYNDA, KNOPKALAR O'Z HOLATIDA, MOBILGA MOS) */}
            {activeSection === 'settings' && (
              <div className="liquid-glass-settings-window rounded-2xl p-3 sm:p-5 mt-2.5 sm:mt-0 text-[#F5F5F2] shadow-2xl space-y-3 sm:space-y-4 animate-fadeIn w-full max-w-[1440px]">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-3 border-b border-white/20">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <button
                      type="button"
                      onClick={() => setIsMobileSidebarOpen(true)}
                      className="lg:hidden p-2 rounded-lg liquid-glass-btn-navy text-[#FFB800] cursor-pointer shrink-0"
                      title="Bo‘limlarni ochish"
                    >
                      <ArrowRight className="w-4 h-4 stroke-[2.5]" />
                    </button>
                    <div
                      onClick={() => fileInputRef.current?.click()}
                      className="relative group shrink-0 cursor-pointer"
                      title="Surat yuklash yoki almashtirish uchun bosing"
                    >
                      {user.photoURL ? (
                        <img
                          src={user.photoURL}
                          alt={user.displayName}
                          className="w-10 h-10 sm:w-11 sm:h-11 rounded-lg object-cover border border-[#FFB800] shadow-sm group-hover:opacity-90 transition-opacity"
                        />
                      ) : (
                        <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-lg bg-[#071326] text-[#FFB800] border border-[#1E3A6D] flex items-center justify-center font-mono font-bold text-sm sm:text-base shadow-sm">
                          {getUserInitials(user)}
                        </div>
                      )}

                      <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded bg-[#FFB800] text-[#0A1931] flex items-center justify-center shadow border border-[#0A1931]">
                        <Camera className="w-2.5 h-2.5 stroke-[2.5]" />
                      </div>

                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handlePhotoUpload}
                      />
                    </div>

                    <div className="space-y-0.5 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <h2 className="text-xs sm:text-base font-black text-[#F5F5F2] leading-tight truncate">
                          {user.firstName ? `${user.firstName} ${user.lastName || ''}`.trim() : user.displayName} kabinet sozlamalari
                        </h2>
                        {user.photoURL && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRemovePhoto();
                            }}
                            className="px-1.5 py-0.5 rounded bg-red-500/10 hover:bg-red-500/20 text-red-300 border border-red-500/30 text-[9px] font-bold flex items-center gap-0.5 cursor-pointer"
                            title="Suratni o'chirish"
                          >
                            <Trash2 className="w-2.5 h-2.5" />
                            <span>O&apos;chirish</span>
                          </button>
                        )}
                      </div>
                      {user.region && (
                        <div className="flex items-center gap-1 text-[10px] text-[#B8B8B3] truncate">
                          <MapPin className="w-2.5 h-2.5 text-[#FFB800] shrink-0" />
                          <span className="truncate">{user.region}{user.district ? `, ${user.district}` : ''}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Faqat Sozlamalar bo'limida: Tungi/Kunduzgi rejim tugmasi, 3 Tilli tanlov (Lotin, Kirill, Rus), Chiqish va X yopish */}
                  <div className="flex items-center gap-1.5 flex-wrap justify-start sm:justify-end">
                    <button
                      type="button"
                      onClick={() => toggleCabinetTheme(cabinetTheme === 'night' ? 'light' : 'night')}
                      className="px-2.5 py-1.5 rounded-lg bg-[#071326] hover:bg-[#0F2547] border border-blue-500/40 text-[#FFB800] text-[10px] sm:text-[11px] font-black cursor-pointer transition-all"
                    >
                      {cabinetTheme === 'night' ? 'Tungi rejim (Qora)' : 'Kunduzgi rejim'}
                    </button>

                    {/* 3 til tanlash tugmalari: O'zbek (Lotin), Ўзбек (Кирилл), Русский */}
                    <div className="inline-flex items-center rounded-lg bg-[#071326] p-0.5 border border-blue-500/40 gap-0.5">
                      <button
                        type="button"
                        onClick={() => setLang('uz')}
                        className={`px-2 py-1 rounded-md text-[10px] sm:text-[11px] font-black cursor-pointer transition-all ${
                          lang === 'uz'
                            ? 'bg-[#FFB800] text-slate-950 shadow-sm'
                            : 'text-sky-200 hover:text-white'
                        }`}
                        title="O‘zbek tili (Lotin)"
                      >
                        O‘Z
                      </button>
                      <button
                        type="button"
                        onClick={() => setLang('uz_cyrl')}
                        className={`px-2 py-1 rounded-md text-[10px] sm:text-[11px] font-black cursor-pointer transition-all ${
                          lang === 'uz_cyrl'
                            ? 'bg-[#FFB800] text-slate-950 shadow-sm'
                            : 'text-sky-200 hover:text-white'
                        }`}
                        title="Ўзбек тили (Кирилл)"
                      >
                        ЎЗ
                      </button>
                      <button
                        type="button"
                        onClick={() => setLang('ru')}
                        className={`px-2 py-1 rounded-md text-[10px] sm:text-[11px] font-black cursor-pointer transition-all ${
                          lang === 'ru'
                            ? 'bg-[#FFB800] text-slate-950 shadow-sm'
                            : 'text-sky-200 hover:text-white'
                        }`}
                        title="Русский язык"
                      >
                        РУ
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        if (onLogout) {
                          onLogout();
                        } else {
                          onGoToShop();
                        }
                      }}
                      className="px-2.5 py-1.5 rounded-lg bg-[#DC2626] hover:bg-[#B91C1C] text-white border border-red-500/80 text-[10px] sm:text-[11px] font-bold flex items-center gap-1 cursor-pointer shadow-sm"
                      title="Kabinetdan chiqish"
                    >
                      <LogOut className="w-3 h-3 stroke-[2.3]" />
                      <span>Chiqish</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setActiveSection('bunker')}
                      title="Yopish"
                      className="w-7 h-7 rounded-lg bg-slate-800/80 hover:bg-red-500/20 text-slate-300 hover:text-red-300 border border-slate-700 flex items-center justify-center shrink-0 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {saveSuccessMessage && (
                  <div className="p-2.5 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 flex items-center gap-1.5 text-[11px] font-bold animate-fadeIn">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span>{saveSuccessMessage}</span>
                  </div>
                )}

                {saveErrorMessage && (
                  <div className="p-2.5 rounded-lg bg-red-500/20 border border-red-500/40 text-red-300 flex items-center gap-1.5 text-[11px] font-bold animate-fadeIn">
                    <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                    <span>{saveErrorMessage}</span>
                  </div>
                )}

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 sm:gap-4 text-[11px]">
                  {/* 1. Shaxsiy ma'lumotlarni tahrirlash (Liquid Glass oyna, knopkalar o'z holatida, mobilga mos) */}
                  <div className="lg:col-span-7 liquid-glass-settings-card rounded-2xl p-3 sm:p-4 space-y-2.5">
                    <div className="flex items-center justify-between gap-2 pb-2 border-b border-white/20">
                      <div className="flex items-center gap-1.5">
                        <div className="p-1.5 rounded-lg bg-amber-400/20 text-amber-400">
                          <User className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                        </div>
                        <h3 className="text-xs sm:text-sm font-black text-white">Shaxsiy ma&apos;lumotlar</h3>
                      </div>
                      {myGovLoading && (
                        <RefreshCw className="w-3.5 h-3.5 text-amber-400 animate-spin shrink-0" />
                      )}
                    </div>

                    <div className="space-y-2.5">
                      {/* ID Karta Raqami, Tug'ilgan Sana va Tasdiqlash */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-end">
                        <div className="grid grid-cols-2 sm:col-span-2 gap-2">
                          <div>
                            <label className="block text-slate-200 font-bold mb-1 text-[10px] sm:text-[11px]">
                              ID Karta Raqami:
                            </label>
                            <input
                              type="text"
                              maxLength={10}
                              value={idCardNumber}
                              onChange={(e) => {
                                const cleaned = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
                                const letters = cleaned.replace(/[^A-Z]/g, '').slice(0, 2);
                                const digits = cleaned.slice(letters.length).replace(/\D/g, '').slice(0, 7);
                                const formatted = digits.length > 0 ? `${letters} ${digits}` : letters;
                                setIdCardNumber(formatted);
                                setMyGovVerified(false);
                                setMyGovError(null);
                                setFirstName('');
                                setLastName('');
                                setRegion('');
                                setDistrict('');
                                setCitizenAddress('');
                                setRegisteredMobileNumbers([]);
                              }}
                              placeholder="AD 1234567"
                              className="w-full bg-slate-950/90 border border-slate-700 rounded-lg px-2.5 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-amber-400 font-mono uppercase text-[11px] sm:text-xs"
                            />
                          </div>

                          <div>
                            <label className="block text-slate-200 font-bold mb-1 text-[10px] sm:text-[11px]">Tug‘ilgan Sana:</label>
                            <div className="relative flex items-center">
                              <input
                                type="text"
                                inputMode="numeric"
                                maxLength={10}
                                value={birthDate}
                                onChange={(e) => {
                                  const formatted = formatBirthDateInput(e.target.value);
                                  setBirthDate(formatted);
                                  setMyGovVerified(false);
                                  setMyGovError(null);
                                  setFirstName('');
                                  setLastName('');
                                  setRegion('');
                                  setDistrict('');
                                  setCitizenAddress('');
                                  setRegisteredMobileNumbers([]);
                                }}
                                placeholder="KK.OO.YYYY"
                                className="w-full bg-slate-950/90 border border-slate-700 rounded-lg pl-2.5 pr-7 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-amber-400 font-mono text-[11px] sm:text-xs"
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  if (hiddenDateInputRef.current) {
                                    if (typeof hiddenDateInputRef.current.showPicker === 'function') {
                                      hiddenDateInputRef.current.showPicker();
                                    } else {
                                      hiddenDateInputRef.current.click();
                                    }
                                  }
                                }}
                                title="Kalendardan tanlash"
                                className="absolute right-2 text-amber-400 hover:text-amber-300 cursor-pointer"
                              >
                                <Calendar className="w-3.5 h-3.5" />
                              </button>
                              <input
                                ref={hiddenDateInputRef}
                                type="date"
                                className="sr-only"
                                onChange={(e) => {
                                  const iso = e.target.value;
                                  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
                                    const [y, m, d] = iso.split('-');
                                    const formatted = `${d}.${m}.${y}`;
                                    setBirthDate(formatted);
                                    setMyGovVerified(false);
                                    setMyGovError(null);
                                    setFirstName('');
                                    setLastName('');
                                    setRegion('');
                                    setDistrict('');
                                    setCitizenAddress('');
                                    setRegisteredMobileNumbers([]);
                                  }
                                }}
                              />
                            </div>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleVerifyMyGovIdCard(idCardNumber, birthDate)}
                          disabled={myGovLoading}
                          className="w-full py-2 px-3 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-60 text-slate-950 font-black text-[11px] sm:text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow-sm active:scale-95 transition-all"
                        >
                          {myGovLoading ? (
                            <>
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                              <span>Tekshirilmoqda</span>
                            </>
                          ) : (
                            <>
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Tasdiqlash</span>
                            </>
                          )}
                        </button>
                      </div>

                      {myGovError && (
                        <div className="p-2 rounded-lg bg-red-500/15 border border-red-500/30 text-red-300 text-[10px] font-bold flex items-center gap-1.5">
                          <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                          <span>{myGovError}</span>
                        </div>
                      )}

                      {/* Avtomatik to'ldiriladigan Ism va Familiya */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div>
                          <label className="block text-slate-200 font-bold mb-1 text-[10px] sm:text-[11px]">Ism:</label>
                          <input
                            type="text"
                            value={firstName}
                            readOnly
                            placeholder="Avtomatik to‘ldiriladi"
                            className="w-full bg-slate-950/90 border border-emerald-500/40 rounded-lg px-2.5 py-2 text-emerald-300 font-bold placeholder-slate-500 focus:outline-none text-[11px] sm:text-xs"
                          />
                        </div>

                        <div>
                          <label className="block text-slate-200 font-bold mb-1 text-[10px] sm:text-[11px]">Familiya:</label>
                          <input
                            type="text"
                            value={lastName}
                            readOnly
                            placeholder="Avtomatik to‘ldiriladi"
                            className="w-full bg-slate-950/90 border border-emerald-500/40 rounded-lg px-2.5 py-2 text-emerald-300 font-bold placeholder-slate-500 focus:outline-none text-[11px] sm:text-xs"
                          />
                        </div>
                      </div>

                      {/* Manzil (Viloyat, Tuman/Shahar) */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div>
                          <label className="block text-slate-200 font-bold mb-1 text-[10px] sm:text-[11px]">Viloyat:</label>
                          <select
                            value={region}
                            onChange={(e) => {
                              setRegion(e.target.value);
                              setDistrict('');
                            }}
                            className="w-full bg-slate-950/90 border border-slate-700 rounded-lg px-2.5 py-2 text-white focus:outline-none focus:border-amber-400 text-[11px] sm:text-xs"
                          >
                            <option value="">Viloyatni tanlang...</option>
                            {Object.keys(REGIONS_AND_DISTRICTS).map((reg) => (
                              <option key={reg} value={reg}>{reg}</option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="block text-slate-200 font-bold mb-1 text-[10px] sm:text-[11px]">Tuman / Shahar:</label>
                          <select
                            value={district}
                            disabled={!region}
                            onChange={(e) => setDistrict(e.target.value)}
                            className="w-full bg-slate-950/90 border border-slate-700 rounded-lg px-2.5 py-2 text-white focus:outline-none focus:border-amber-400 text-[11px] sm:text-xs disabled:opacity-50"
                          >
                            <option value="">{region ? 'Tuman / shahar...' : 'Avval viloyat'}</option>
                            {(REGIONS_AND_DISTRICTS[region] || []).map((dist) => (
                              <option key={dist} value={dist}>{dist}</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div>
                        <label className="block text-slate-200 font-bold mb-1 text-[10px] sm:text-[11px]">Manzil (Doimiy yashash manzili):</label>
                        <input
                          type="text"
                          value={citizenAddress}
                          onChange={(e) => setCitizenAddress(e.target.value)}
                          placeholder="Tasdiqlanganda avtomatik to‘ldiriladi"
                          className="w-full bg-slate-950/90 border border-slate-700 rounded-lg px-2.5 py-2 text-sky-200 font-semibold placeholder-slate-500 focus:outline-none focus:border-amber-400 text-[11px] sm:text-xs"
                        />
                      </div>

                      {/* ID karta tasdiqlangan va Saqlash */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1">
                        {myGovVerified && (
                          <div className="px-2.5 py-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/40 flex items-center gap-1.5 text-emerald-300 text-[10px] font-bold flex-wrap">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                            <span>ID tasdiqlangan ({idCardNumber})</span>
                            {pinfl && (
                              <span className="px-1.5 py-0.2 rounded bg-blue-500/20 border border-blue-400/30 text-sky-300 font-mono text-[9px]">
                                JSHSHIR: {pinfl}
                              </span>
                            )}
                          </div>
                        )}

                        <button
                          type="button"
                          disabled={isSaving || myGovLoading}
                          onClick={async () => {
                            if (!user) return;
                            setSaveErrorMessage(null);
                            setSaveSuccessMessage(null);
                            const normalizedId = idCardNumber.toUpperCase().replace(/[^A-Z0-9]/g, '');
                            if (!/^[A-Z]{2}\d{7}$/.test(normalizedId)) {
                              setSaveErrorMessage("Iltimos, ID karta seriya va raqamini to‘liq kiriting!");
                              return;
                            }
                            if (!myGovVerified && birthDate.replace(/\D/g, '').length === 8) {
                              await handleVerifyMyGovIdCard(idCardNumber, birthDate);
                              return;
                            }
                            setIsSaving(true);
                            try {
                              const formattedId = `${normalizedId.slice(0, 2)} ${normalizedId.slice(2, 9)}`;
                              const updatedProfile: UserProfile = {
                                ...user,
                                firstName: firstName.trim() || user.firstName || 'Mijoz',
                                lastName: lastName.trim() || user.lastName || '',
                                middleName: middleName.trim() || user.middleName,
                                displayName:
                                  `${firstName.trim() || user.firstName || ''} ${lastName.trim() || user.lastName || ''}`.trim() ||
                                  user.displayName,
                                idCardNumber: formattedId,
                                birthDate: birthDate.trim() || user.birthDate,
                                pinfl: pinfl.trim() || user.pinfl,
                                issuedBy: issuedBy.trim() || user.issuedBy,
                                myIdJobId: myIdJobId || user.myIdJobId,
                                address: citizenAddress.trim() || `${region}${district ? `, ${district}` : ''}` || user.address,
                                myGovVerified: true,
                                region: region || user.region,
                                district: district || user.district,
                              };
                              await setDoc(doc(db, 'users', user.id), updatedProfile, { merge: true });
                              try {
                                const savedCust = localStorage.getItem('bunkerstroy_customers');
                                const custList = savedCust ? JSON.parse(savedCust) : [];
                                if (Array.isArray(custList)) {
                                  const updatedCustList = custList.map((c: any) =>
                                    c && c.id === user.id ? { ...c, ...updatedProfile } : c
                                  );
                                  localStorage.setItem('bunkerstroy_customers', JSON.stringify(updatedCustList));
                                  window.dispatchEvent(new Event('storage'));
                                }
                              } catch {}
                              if (onUserUpdate) {
                                onUserUpdate(updatedProfile);
                              }
                              setMyGovVerified(true);
                              setSaveSuccessMessage("Shaxsiy ma'lumotlar va ID karta sozlamalarda muvaffaqiyatli saqlandi!");
                              setTimeout(() => setSaveSuccessMessage(null), 4000);
                            } catch (err: any) {
                              setSaveErrorMessage("Saqlashda xatolik yuz berdi: " + (err.message || 'Server xatosi'));
                            } finally {
                              setIsSaving(false);
                            }
                          }}
                          className="w-full sm:w-auto px-4 py-2.5 rounded-lg bg-[#FFB800] hover:bg-[#FFC928] text-slate-950 font-black text-[11px] sm:text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow-md active:scale-95 transition-all sm:ml-auto"
                        >
                          <Save className="w-3.5 h-3.5" />
                          <span>{isSaving ? "Saqlanmoqda..." : "Shaxsiy Ma'lumotlarni Saqlash"}</span>
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* 2. Login va Parol almashtirish (Liquid Glass oyna, knopkalar o'z holatida, mobilga mos) */}
                  <div className="lg:col-span-5 liquid-glass-settings-card rounded-2xl p-3 sm:p-4 space-y-2.5 flex flex-col justify-between">
                    <div className="space-y-2.5">
                      <div className="flex items-center gap-2 pb-2 border-b border-white/20">
                        <div className="p-1.5 rounded-lg bg-purple-500/20 text-purple-300">
                          <KeyRound className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                        </div>
                        <div>
                          <h3 className="text-xs sm:text-sm font-black text-white leading-tight">Login va Parol almashtirish</h3>
                          <p className="text-[10px] text-sky-200">SMS tasdiqlash orqali xavfsiz almashtirish.</p>
                        </div>
                      </div>

                      <div className="px-3 py-2 rounded-lg bg-slate-950/90 border border-purple-500/30 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          <Phone className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                          <span className="text-slate-200 font-bold text-[10px] sm:text-[11px]">Mavjud tel:</span>
                        </div>
                        <span className="font-mono font-black text-amber-300 text-[11px] sm:text-xs">
                          {phone || user.phone || '+998 -- --- -- --'}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div>
                          <label className="block text-slate-200 font-bold mb-1 text-[10px] sm:text-[11px]">Kabinet Logini:</label>
                          <input
                            type="text"
                            value={loginInput}
                            onChange={(e) => setLoginInput(e.target.value)}
                            placeholder="Login"
                            className="w-full bg-slate-950/90 border border-slate-700 rounded-lg px-2.5 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-amber-400 font-mono text-[11px] sm:text-xs"
                          />
                        </div>

                        <div>
                          <label className="block text-slate-200 font-bold mb-1 text-[10px] sm:text-[11px]">Yangi Parol:</label>
                          <input
                            type="password"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            placeholder="Yangi parol"
                            className="w-full bg-slate-950/90 border border-slate-700 rounded-lg px-2.5 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-amber-400 font-mono text-[11px] sm:text-xs"
                          />
                        </div>
                      </div>

                      {!smsCodeSent ? (
                        <div className="pt-1">
                          <button
                            type="button"
                            onClick={handleSendCredentialsSms}
                            className="w-full py-2.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-black text-[11px] sm:text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow-sm active:scale-95 transition-all"
                          >
                            <Phone className="w-3.5 h-3.5" />
                            <span>SMS Tasdiqlash Kodini Olish</span>
                          </button>
                        </div>
                      ) : (
                        <div className="pt-1 space-y-2 animate-fadeIn">
                          {smsNotice && (
                            <div className="p-2 rounded-lg bg-purple-500/20 border border-purple-500/40 text-purple-200 text-[10px] flex items-center justify-between">
                              <span className="font-mono font-bold">{smsNotice}</span>
                              {smsTimer > 0 ? (
                                <span className="text-amber-400 font-mono font-bold shrink-0">
                                  {smsTimer}s
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={handleSendCredentialsSms}
                                  className="text-amber-400 hover:underline font-bold shrink-0"
                                >
                                  Qayta yuborish
                                </button>
                              )}
                            </div>
                          )}

                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              inputMode="numeric"
                              maxLength={6}
                              value={smsCodeInput}
                              onChange={(e) => setSmsCodeInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
                              placeholder="6 xonali kod"
                              className="w-32 bg-slate-950 border border-amber-400 rounded-lg px-2.5 py-2 text-white font-mono text-center tracking-widest text-xs font-bold focus:outline-none"
                            />
                            <button
                              type="button"
                              onClick={handleVerifySmsAndSaveCredentials}
                              disabled={isSaving}
                              className="flex-1 py-2 px-3 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-[11px] sm:text-xs flex items-center justify-center gap-1 cursor-pointer shadow-sm active:scale-95 transition-all"
                            >
                              <Check className="w-3.5 h-3.5 stroke-[3]" />
                              <span>{isSaving ? "Saqlanmoqda..." : "Tasdiqlash"}</span>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Kabinetdan Chiqish tugmasi Sozlamalar bo'limida (o'z holatida) */}
                    <div className="pt-2.5 border-t border-white/20">
                      <button
                        type="button"
                        onClick={() => {
                          if (onLogout) {
                            onLogout();
                          } else {
                            onGoToShop();
                          }
                        }}
                        className="w-full py-2.5 rounded-lg bg-[#DC2626] hover:bg-[#B91C1C] text-white border border-red-500/80 text-[11px] sm:text-xs font-black flex items-center justify-center gap-1.5 cursor-pointer shadow-sm active:scale-95 transition-all"
                      >
                        <LogOut className="w-3.5 h-3.5 stroke-[2.3]" />
                        <span>Kabinetdan Chiqish</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

          </div>
        </div>
      </main>

      {/* Chekni ko'rish modali */}
      {selectedReceiptOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/85 backdrop-blur-md animate-fadeIn">
          <div className="bg-slate-900 border-2 border-blue-500/60 rounded-3xl max-w-lg w-full p-6 text-white shadow-2xl space-y-5 max-h-[95vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-amber-400" />
                <h3 className="font-black text-base">BunkerStroy Elektron To'lov Cheki</h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedReceiptOrder(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            <div id="printable-receipt" className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-3 font-mono text-xs">
              <div className="text-center pb-2 border-b border-dashed border-slate-700 space-y-1">
                <div className="font-black text-amber-400 text-sm">BUNKER STROY MCHJ</div>
                <div className="text-[10px] text-slate-400">Qurilish mollari & Logistika Platformasi</div>
                <div className="text-[10px] text-slate-400">Toshkent sh., O'zbekiston</div>
              </div>

              <div className="space-y-1 text-[11px]">
                <div className="flex justify-between">
                  <span className="text-slate-400">Chek raqami:</span>
                  <span className="font-bold text-white">#{selectedReceiptOrder.id.slice(-8).toUpperCase()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Sana va vaqt:</span>
                  <span>{new Date(selectedReceiptOrder.createdAt).toLocaleString('uz-UZ')}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Mijoz:</span>
                  <span className="font-bold">{selectedReceiptOrder.buyerName || user.displayName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Telefon:</span>
                  <span>{selectedReceiptOrder.buyerPhone || user.phone || '+998 -- --- -- --'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Manzil:</span>
                  <span className="text-right truncate max-w-[200px]">{formatRegionAndDistrictOnly(selectedReceiptOrder.deliveryAddress)}</span>
                </div>
              </div>

              <div className="py-2 border-t border-b border-dashed border-slate-700 space-y-1.5">
                <div className="font-bold text-slate-400 text-[10px] uppercase">Tovarlar ro'yxati:</div>
                {selectedReceiptOrder.items?.map((item, idx) => {
                  const itemTitle = item.title || (item as any).product?.title || 'Mahsulot';
                  const itemUnit = item.unit || (item as any).product?.unit || 'dona';
                  const itemPrice = item.price || (item as any).product?.price || 0;
                  return (
                    <div key={idx} className="flex justify-between items-center text-[11px]">
                      <div className="truncate max-w-[180px]">
                        {idx + 1}. {itemTitle}
                        <span className="text-[10px] text-slate-400 block">
                          {item.quantity} {itemUnit} × {formatPrice(itemPrice)}
                        </span>
                      </div>
                      <span className="font-bold">
                        {formatPrice(itemPrice * item.quantity)}
                      </span>
                    </div>
                  );
                })}
              </div>

              <div className="pt-1 space-y-1 text-[11px]">
                <div className="flex justify-between font-black text-sm text-amber-400">
                  <span>JAMI TO'LOV:</span>
                  <span>{formatPrice(selectedReceiptOrder.totalAmount)}</span>
                </div>
                <div className="flex justify-between text-[10px] text-slate-400">
                  <span>To'lov turi:</span>
                  <span className="uppercase text-white font-bold">{selectedReceiptOrder.paymentMethod || 'Karta'}</span>
                </div>
                <div className="flex justify-between text-[10px] text-emerald-400 font-bold">
                  <span>Holati:</span>
                  <span>✓ {selectedReceiptOrder.paymentStatus === 'paid' ? "To'langan" : "Qabul qilinganda"}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => window.print()}
                className="flex-1 py-3 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-xs flex items-center justify-center gap-2 cursor-pointer shadow-lg active:scale-95 transition-all"
              >
                <Printer className="w-4 h-4" />
                <span>Chop etish / PDF</span>
              </button>
              <button
                type="button"
                onClick={() => setSelectedReceiptOrder(null)}
                className="px-5 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold cursor-pointer"
              >
                Yopish
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4 Bosqichli Checkout Modal */}
      {isCheckoutOpen && (
        <CheckoutModal
          isOpen={isCheckoutOpen}
          onClose={() => setIsCheckoutOpen(false)}
          items={cart}
          user={user}
          onUserUpdate={onUserUpdate}
          onUpdateQuantity={onUpdateQuantity}
          onRemoveItem={onRemoveItem}
          onClearCart={onClearCart}
          onOrderCompleted={() => {
            setIsCheckoutOpen(false);
            onClearCart();
            setActiveSection('orders');
          }}
          onOpenAuth={() => {}}
        />
      )}

      {/* Xaritadan ko'rish modali */}
      {selectedMapOrder && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-5 bg-black/85 backdrop-blur-md animate-fadeIn"
          onClick={() => setSelectedMapOrder(null)}
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
                    Yetkazish Manzili Xaritasi
                  </h3>
                  <p className="text-xs text-slate-400">
                    {formatRegionAndDistrictOnly(selectedMapOrder.deliveryAddress)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setOrderMapType(orderMapType === 'm' ? 'k' : 'm')}
                  className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-[#FFB800] border border-slate-700 font-bold text-xs cursor-pointer flex items-center gap-1.5"
                >
                  <Globe className="w-3.5 h-3.5" />
                  <span>{orderMapType === 'm' ? "Sun'iy yo'ldosh" : 'Xarita'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedMapOrder(null)}
                  className="p-2 rounded-xl bg-slate-900 hover:bg-red-600 text-slate-300 hover:text-white border border-slate-800 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-between gap-2">
              <div className="flex items-start gap-2">
                <MapPin className="w-4 h-4 text-[#FFB800] shrink-0 mt-0.5" />
                <div>
                  <span className="text-[#FFB800] font-black text-xs sm:text-sm block">
                    {formatRegionAndDistrictOnly(selectedMapOrder.deliveryAddress)}
                  </span>
                  <span className="text-slate-300 text-xs block mt-0.5">
                    {formatCleanFullAddress(selectedMapOrder.deliveryAddress)}
                  </span>
                </div>
              </div>
            </div>

            <div className="relative w-full h-80 sm:h-96 rounded-2xl overflow-hidden border-2 border-slate-800 bg-slate-900">
              {(() => {
                const coords = extractCoordsFromAddress(selectedMapOrder.deliveryAddress);
                return (
                  <iframe
                    title="Yetkazish Lokatsiyasi"
                    width="100%"
                    height="100%"
                    style={{ border: 0 }}
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                    src={`https://maps.google.com/maps?q=${encodeURIComponent(
                      coords
                        ? `${coords.lat},${coords.lng}`
                        : `${formatCleanFullAddress(selectedMapOrder.deliveryAddress)}, Uzbekistan`
                    )}&hl=uz&z=16&t=${orderMapType}&output=embed`}
                  />
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Zavod (B2B) tasdiqlagan so'rov uchun To'lov Modali */}
      {payingB2bOrder && (
        <div
          className="fixed inset-0 z-[75] flex items-center justify-center p-3 sm:p-5 bg-black/80 backdrop-blur-md animate-fadeIn"
          onClick={() => setPayingB2bOrder(null)}
        >
          <div
            className="bg-[#0A1931] border-2 border-[#FFB800] rounded-2xl max-w-md w-full p-4 sm:p-5 space-y-4 shadow-2xl text-white text-xs"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-[#1E3A6D]">
              <div className="flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-[#FFB800]" />
                <div>
                  <h3 className="text-sm sm:text-base font-black text-white">
                    Zavod (B2B) Buyurtmasi To‘lovi
                  </h3>
                  <p className="text-[11px] text-slate-300">
                    Zavod tasdiqlagan buyurtma uchun to‘lov
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPayingB2bOrder(null)}
                className="p-1.5 rounded-lg bg-[#071326] hover:bg-red-600 text-slate-300 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 rounded-xl bg-[#071326] border border-[#1E3A6D] flex items-center justify-between">
              <span className="text-slate-300 font-semibold">To‘lov summasi:</span>
              <span className="text-sm sm:text-base font-black text-[#FFB800] font-mono">
                {formatPrice(payingB2bOrder.totalAmount)}
              </span>
            </div>

            {b2bPaymentError && (
              <div className="p-2.5 rounded-lg bg-red-500/20 border border-red-400 text-red-200 text-[11px] font-bold">
                {b2bPaymentError}
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-300 mb-1">
                  Plastik karta raqami (16 xona):
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={b2bCardNumber}
                  onChange={(e) => {
                    const digits = e.target.value.replace(/\D/g, '').slice(0, 16);
                    const formatted = digits.replace(/(\d{4})(?=\d)/g, '$1 ');
                    setB2bCardNumber(formatted);
                  }}
                  placeholder="8600 0000 0000 0000"
                  className="w-full px-3 py-2.5 rounded-xl bg-[#071326] border border-[#254B85] focus:border-[#FFB800] text-white font-mono text-sm focus:outline-none"
                />
              </div>

              <div className="flex items-end gap-2">
                <div className="w-32">
                  <label className="block text-[11px] font-bold text-slate-300 mb-1">
                    Amal qilish (OO/YY):
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={b2bCardExpiry}
                    onChange={(e) => {
                      const d = e.target.value.replace(/\D/g, '').slice(0, 4);
                      setB2bCardExpiry(d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d);
                    }}
                    placeholder="12/28"
                    className="w-full px-3 py-2.5 rounded-xl bg-[#071326] border border-[#254B85] focus:border-[#FFB800] text-white font-mono text-sm text-center focus:outline-none"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleSendB2bPaymentSms}
                  className="flex-1 py-2.5 px-3 rounded-xl bg-[#FFB800] hover:bg-amber-400 text-[#0A1931] font-black text-xs cursor-pointer transition-all"
                >
                  {b2bSmsSent ? 'SMS qayta yuborish' : 'SMS kod olish'}
                </button>
              </div>

              {b2bSmsSent && (
                <div className="p-3 rounded-xl bg-[#071326] border border-emerald-500/50 space-y-2">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-emerald-300 font-bold">
                      SMS kod: <strong className="font-mono text-sm text-white">{b2bSentSmsCode}</strong>
                    </span>
                  </div>
                  {(() => {
                    const expectedLen = b2bSentSmsCode ? b2bSentSmsCode.length : 6;
                    return (
                      <input
                        type="text"
                        maxLength={expectedLen}
                        value={b2bSmsInput}
                        onChange={(e) =>
                          setB2bSmsInput(
                            e.target.value
                              .replace(/[^0-9a-zA-Z]/g, '')
                              .slice(0, expectedLen)
                          )
                        }
                        placeholder={`${expectedLen} xonali SMS kodni kiriting`}
                        className="w-full px-3 py-2 rounded-lg bg-[#0A1931] border border-[#FFB800] text-white font-mono text-center text-base tracking-widest focus:outline-none"
                      />
                    );
                  })()}
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setPayingB2bOrder(null)}
                className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs cursor-pointer"
              >
                Bekor qilish
              </button>
              <button
                type="button"
                disabled={b2bPaymentLoading || !b2bSmsSent}
                onClick={handleConfirmB2bOrderPayment}
                className="flex-1 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-black text-xs cursor-pointer shadow-lg"
              >
                {b2bPaymentLoading ? 'Tasdiqlanmoqda...' : 'To‘lovni tasdiqlash'}
              </button>
            </div>
          </div>
        </div>
      )}

      <CabinetLogsModal
        isOpen={isCabinetLogsOpen}
        onClose={() => setIsCabinetLogsOpen(false)}
        currentUser={user}
      />
    </div>
  );
};
