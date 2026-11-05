import React, { useState, useEffect } from 'react';
import { protobufFetch as fetch } from '../../lib/protobufClient';
import {
  ShieldAlert,
  ShieldCheck,
  UserPlus,
  KeyRound,
  Lock,
  Eye,
  EyeOff,
  Check,
  X,
  Pencil,
  Trash2,
  ArrowRight,
  ArrowUp,
  ArrowDown,
  Layers,
  BarChart3,
  Users,
  ShoppingCart,
  Building,
  HardHat,
  LogOut,
  Plus,
  ExternalLink,
  Copy,
  Save,
  Briefcase,
  Search,
  RefreshCw,
  FileText,
  FileUp,
  DollarSign,
  MapPin,
  Phone,
  Settings,
  Upload,
  Image as ImageIcon,
  Share2,
} from 'lucide-react';
import {
  AdminConfig,
  getAdminConfig,
  saveAdminConfig,
  getSubAdmins,
  saveSubAdmins,
  ADMIN_PERMISSION_META,
  BUNKER_ADMIN_CREDENTIALS,
  getBunkerAdminCredentials,
  saveBunkerAdminCredentials,
  isLoginTakenAnywhere,
  getLoginConflictError,
  isLoginRejectedError,
  compressImageFileToDataUrl,
} from '../../lib/adminSettings';
import { RealTelegramLogo, RealInstagramLogo, RealYouTubeLogo, RealPhoneLogo } from '../common/SocialLogos';
import { createSupplierApi, updateSupplierApi, deleteSupplierApi } from '../../lib/api';
import {
  AdminPermissionSection,
  SubAdminCabinetAccount,
  SupplierPartner,
  SupplierCabinetType,
  CompanyInfo,
  UserProfile,
} from '../../types';
import { MOCK_FAKE_SUPPLIER_IDS } from '../../data/mockData';
import { REGIONS_AND_DISTRICTS } from '../../data/regionsData';
import { getProductTypes, addProductType, ProductTypeItem } from '../../data/productTypes';
import { db, sendSecurePhoneOtp, verifySecurePhoneOtp } from '../../lib/firebase';
import { doc, setDoc, deleteDoc } from 'firebase/firestore';
import { releaseCabinetDeviceLock } from '../../lib/securityGuard';
import { useLanguage } from '../../lib/i18n';

interface BunkerAdminCabinetProps {
  currentUser?: UserProfile | null;
  onLogout: () => void;
  onGoToShop: () => void;
  onMainAdminConfigChange?: (cfg: AdminConfig) => void;
  onEnterMainAdminCabinet: () => void;
  onEnterSubAdminCabinet: (subAdmin: SubAdminCabinetAccount) => void;
  onEnterSupplierCabinet?: (supplier: SupplierPartner) => void;
}

const formatUzPhone = (val: string): string => {
  let digits = val.replace(/\D/g, '');
  if (digits.startsWith('998')) {
    digits = digits.slice(3);
  }
  digits = digits.slice(0, 9);
  if (digits.length === 0) return '+998 ';
  let formatted = '+998 ';
  if (digits.length > 0) formatted += digits.slice(0, 2);
  if (digits.length > 2) formatted += ' ' + digits.slice(2, 5);
  if (digits.length > 5) formatted += ' ' + digits.slice(5, 7);
  if (digits.length > 7) formatted += ' ' + digits.slice(7, 9);
  return formatted;
};

export const BunkerAdminCabinet: React.FC<BunkerAdminCabinetProps> = ({
  onLogout,
  onGoToShop,
  onMainAdminConfigChange,
  onEnterMainAdminCabinet,
  onEnterSubAdminCabinet,
  onEnterSupplierCabinet,
}) => {
  const { lang, setLang } = useLanguage();
  // Tepada 2 ta bo'lim kartasi: 'admin_cabinets' (Admin Kabinetlar) va 'supplier_cabinets' (B2B va B2C Ta'minotchi Kabinetlar)
  const [activeBunkerSection, setActiveBunkerSection] = useState<'admin_cabinets' | 'supplier_cabinets'>('admin_cabinets');

  // 1. Hozirgi mavjud Asosiy Admin kabineti ma'lumotlari va Bunker Admin Sozlamalari
  const [mainAdminConfig, setMainAdminConfig] = useState<AdminConfig>(() => getAdminConfig());
  const [bunkerCreds, setBunkerCreds] = useState(() => getBunkerAdminCredentials());
  const [isEditingMainAdmin, setIsEditingMainAdmin] = useState(false);
  const [editMainLogin, setEditMainLogin] = useState(mainAdminConfig.login);
  const [editMainPassword, setEditMainPassword] = useState(mainAdminConfig.password);
  const [editMainPhone, setEditMainPhone] = useState(mainAdminConfig.phone || '+998 77 017 03 01');
  const [showMainPass, setShowMainPass] = useState(false);
  const [mainAdminSavedMsg, setMainAdminSavedMsg] = useState<string | null>(null);
  const [mainAdminError, setMainAdminError] = useState<string | null>(null);

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

  // Bunker Admin Sozlamalari (Logoni 2 marta bosganda yoki Sozlamalar tugmasidan ochiladi)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [bunkerLoginInput, setBunkerLoginInput] = useState(bunkerCreds.login);
  const [bunkerPassInput, setBunkerPassInput] = useState(bunkerCreds.password);
  const [bunkerPhoneInput, setBunkerPhoneInput] = useState(bunkerCreds.phone || mainAdminConfig.phone || '+998 71 200 00 50');
  const [showBunkerPass, setShowBunkerPass] = useState(false);
  const [settingsLogoUrl, setSettingsLogoUrl] = useState<string | null>(mainAdminConfig.logoUrl);
  const [settingsLogoFileName, setSettingsLogoFileName] = useState<string | null>(null);
  const [settingsTelegram1, setSettingsTelegram1] = useState(mainAdminConfig.telegram || '');
  const [settingsTelegram2, setSettingsTelegram2] = useState(mainAdminConfig.telegram2 || mainAdminConfig.telegram || '');
  const [settingsYoutube, setSettingsYoutube] = useState(mainAdminConfig.youtube || '');
  const [settingsInstagram, setSettingsInstagram] = useState(mainAdminConfig.instagram || '');
  const [settingsPhone, setSettingsPhone] = useState(mainAdminConfig.phone || '');
  const [settingsSmsSent, setSettingsSmsSent] = useState(false);
  const [settingsSmsCode, setSettingsSmsCode] = useState('');
  const [settingsSmsInput, setSettingsSmsInput] = useState('');
  const [settingsSmsNotice, setSettingsSmsNotice] = useState<string | null>(null);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [settingsSavedSuccess, setSettingsSavedSuccess] = useState(false);

  const computeUnifiedCustomersCount = (): number => {
    try {
      const seenKeys = new Set<string>();
      let count = 0;
      const rawCust = localStorage.getItem('bunkerstroy_customers');
      if (rawCust) {
        const parsedCust = JSON.parse(rawCust);
        if (Array.isArray(parsedCust)) {
          for (const c of parsedCust) {
            if (!c || c.role === 'admin' || c.role === 'bunker_admin' || c.role === 'supplier') continue;
            const phoneDigits = String(c.phone || '').replace(/\D/g, '').slice(-9);
            const loginKey = String(c.login || '').trim().toLowerCase();
            const nameKey = String(c.displayName || `${c.firstName || ''} ${c.lastName || ''}`).trim().toLowerCase();
            const key = phoneDigits.length === 9 ? `ph:${phoneDigits}` : loginKey ? `lg:${loginKey}` : `id:${c.id || nameKey}`;
            if (!seenKeys.has(key)) {
              seenKeys.add(key);
              if (phoneDigits.length === 9) seenKeys.add(`ph:${phoneDigits}`);
              if (loginKey) seenKeys.add(`lg:${loginKey}`);
              count++;
            }
          }
        }
      }
      const rawOrders = localStorage.getItem('bunkerstroy_orders');
      if (rawOrders) {
        const parsedOrders = JSON.parse(rawOrders);
        if (Array.isArray(parsedOrders)) {
          for (const ord of parsedOrders) {
            if (!ord || ord.status === 'cancelled' || ord.orderChannel === 'offline') continue;
            const bPhone = String(ord.customerPhone || ord.buyerPhone || '').replace(/\D/g, '').slice(-9);
            const bName = String(ord.customerName || ord.buyerName || '').trim().toLowerCase();
            const key = bPhone.length === 9 ? `ph:${bPhone}` : bName ? `nm:${bName}` : '';
            if (key && !seenKeys.has(key)) {
              seenKeys.add(key);
              count++;
            }
          }
        }
      }
      return count;
    } catch {
      return 0;
    }
  };

  // Foydalanuvchi (mijoz) kabinetlar soni (faqat soni ko'rsatiladi)
  const [customersCount, setCustomersCount] = useState<number>(() => computeUnifiedCustomersCount());

  // 2. Qo'shilgan Admin kabinetlar ro'yxati
  const [subAdmins, setSubAdmins] = useState<SubAdminCabinetAccount[]>(() => getSubAdmins());
  const [visiblePasswords, setVisiblePasswords] = useState<Record<string, boolean>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // 3. Yangi Admin Kabinet yaratish formasi holatlari
  const [newCabinetName, setNewCabinetName] = useState('');
  const [newLogin, setNewLogin] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newSubPhone, setNewSubPhone] = useState('+998 ');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [newPermissions, setNewPermissions] = useState<AdminPermissionSection[]>([]);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState<string | null>(null);

  // 4. Mavjud Qo'shilgan Admin kabinetini tahrirlash modali holatlari
  const [editingSubAdmin, setEditingSubAdmin] = useState<SubAdminCabinetAccount | null>(null);
  const [editSubName, setEditSubName] = useState('');
  const [editSubLogin, setEditSubLogin] = useState('');
  const [editSubPassword, setEditSubPassword] = useState('');
  const [editSubPhone, setEditSubPhone] = useState('+998 ');
  const [showEditSubPass, setShowEditSubPass] = useState(false);
  const [editSubPermissions, setEditSubPermissions] = useState<AdminPermissionSection[]>([]);
  const [editSubError, setEditSubError] = useState<string | null>(null);

  // 5. Mavjud B2B / B2C Ta'minotchi kabinetlar
  const [suppliers, setSuppliers] = useState<SupplierPartner[]>(() => {
    try {
      const saved = localStorage.getItem('bunkerstroy_suppliers');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed.filter(
            (s: SupplierPartner) =>
              s && s.id && !MOCK_FAKE_SUPPLIER_IDS.includes(s.id) && s.companyName !== 'NATH'
          );
        }
      }
    } catch {}
    return [];
  });
  const [supplierFilterTab, setSupplierFilterTab] = useState<'all' | 'manufacturer' | 'partner'>('all');
  const [supplierSearch, setSupplierSearch] = useState('');

  // 6. Ta'minotchi Kabinet Qo'shish (Faqat Bunker Admin uchun)
  const [isAddSupplierOpen, setIsAddSupplierOpen] = useState(false);
  const [newSuppCabinetType, setNewSuppCabinetType] = useState<SupplierCabinetType>('manufacturer');
  const [newSuppStir, setNewSuppStir] = useState('');
  const [newSuppStirLoading, setNewSuppStirLoading] = useState(false);
  const [newSuppStirError, setNewSuppStirError] = useState<string | null>(null);
  const [newSuppCompanyInfo, setNewSuppCompanyInfo] = useState<CompanyInfo | null>(null);
  const [newSuppCompany, setNewSuppCompany] = useState('');
  const [newSuppName, setNewSuppName] = useState('');
  const [newSuppSurname, setNewSuppSurname] = useState('');
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
  const [newSuppAllowPromoVideo, setNewSuppAllowPromoVideo] = useState(false);
  const [newSuppCommission, setNewSuppCommission] = useState<number>(5);
  const [newSuppCommissionBasis, setNewSuppCommissionBasis] = useState<'total' | 'profit'>('total');
  const [supplierAddSuccess, setSupplierAddSuccess] = useState(false);
  const [productTypes, setProductTypes] = useState<ProductTypeItem[]>(() => getProductTypes());

  // 7. Ta'minotchi Kabinetini Tahrirlash va O'chirish (Parol asosida)
  const [editingSupplier, setEditingSupplier] = useState<SupplierPartner | null>(null);
  const [editSuppCabinetType, setEditSuppCabinetType] = useState<SupplierCabinetType>('manufacturer');
  const [editSuppStir, setEditSuppStir] = useState('');
  const [editSuppStirLoading, setEditSuppStirLoading] = useState(false);
  const [editSuppStirError, setEditSuppStirError] = useState<string | null>(null);
  const [editSuppCompanyInfo, setEditSuppCompanyInfo] = useState<CompanyInfo | null>(null);
  const [editSuppCompany, setEditSuppCompany] = useState('');
  const [editSuppName, setEditSuppName] = useState('');
  const [editSuppSurname, setEditSuppSurname] = useState('');
  const [editSuppPhone, setEditSuppPhone] = useState('+998 ');
  const [editSuppLogin, setEditSuppLogin] = useState('');
  const [editSuppPassword, setEditSuppPassword] = useState('');
  const [showEditSuppPass, setShowEditSuppPass] = useState(false);
  const [editSuppRegion, setEditSuppRegion] = useState('');
  const [editSuppDistrict, setEditSuppDistrict] = useState('');
  const [editSuppCategory, setEditSuppCategory] = useState('');
  const [editSuppCommission, setEditSuppCommission] = useState<number>(5);
  const [editSuppCommissionBasis, setEditSuppCommissionBasis] = useState<'total' | 'profit'>('total');
  const [editSuppAuthPassword, setEditSuppAuthPassword] = useState('');
  const [showEditSuppAuthPass, setShowEditSuppAuthPass] = useState(false);
  const [editSuppError, setEditSuppError] = useState<string | null>(null);
  const [editSuppSuccess, setEditSuppSuccess] = useState(false);

  const [deletingSupplier, setDeletingSupplier] = useState<SupplierPartner | null>(null);
  const [deleteSuppAuthPassword, setDeleteSuppAuthPassword] = useState('');
  const [showDeleteSuppAuthPass, setShowDeleteSuppAuthPass] = useState(false);
  const [deleteSuppSmsSent, setDeleteSuppSmsSent] = useState(false);
  const [deleteSuppSmsCode, setDeleteSuppSmsCode] = useState('');
  const [deleteSuppSmsInput, setDeleteSuppSmsInput] = useState('');
  const [deleteSuppSmsNotice, setDeleteSuppSmsNotice] = useState<string | null>(null);
  const [deleteSuppError, setDeleteSuppError] = useState<string | null>(null);

  // Bir xil STIR bilan ayni kabinet turida (B2B da yaratilgan bo'lsa B2B da, B2C da yaratilgan bo'lsa B2C da) ikkinchi kabinet yaratmaslik algoritmi
  const isStirTakenInCabinetType = (
    rawStir: string,
    targetType: SupplierCabinetType,
    excludeSupplierId?: string
  ): boolean => {
    const clean = (rawStir || '').replace(/\D/g, '');
    if (clean.length !== 9) return false;
    return suppliers.some((s) => {
      if (!s || (excludeSupplierId && s.id === excludeSupplierId)) return false;
      const sStir = (s.inn || '').replace(/\D/g, '');
      const sType: SupplierCabinetType = s.cabinetType === 'manufacturer' ? 'manufacturer' : 'partner';
      return sStir === clean && sType === targetType;
    });
  };

  // Ta'minotchi kabinetini tahrirlash va o'chirish uchun parolni tekshirish
  const isValidSupplierActionPassword = (pass: string, targetSupp?: SupplierPartner | null): boolean => {
    const trimmed = pass.trim();
    if (!trimmed) return false;
    const latestBunkerPass = (getBunkerAdminCredentials().password || bunkerCreds.password || 'ADMIN..').trim();
    const latestAdminPass = (getAdminConfig().password || mainAdminConfig.password || 'ADMIN.').trim();
    const suppPass = (targetSupp?.password || '').trim();
    return (
      trimmed === latestBunkerPass ||
      trimmed === latestAdminPass ||
      (Boolean(suppPass) && trimmed === suppPass)
    );
  };

  useEffect(() => {
    const syncAll = () => {
      setMainAdminConfig(getAdminConfig());
      setSubAdmins(getSubAdmins());
      setProductTypes(getProductTypes());
      try {
        const saved = localStorage.getItem('bunkerstroy_suppliers');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) {
            setSuppliers(
              parsed.filter(
                (s: SupplierPartner) =>
                  s && s.id && !MOCK_FAKE_SUPPLIER_IDS.includes(s.id) && s.companyName !== 'NATH'
              )
            );
          }
        }
      } catch {}
      setCustomersCount(computeUnifiedCustomersCount());
    };
    window.addEventListener('bunkerstroy_admin_config_updated', syncAll);
    window.addEventListener('bunkerstroy_sub_admins_updated', syncAll);
    window.addEventListener('bunkerstroy_suppliers_updated', syncAll);
    window.addEventListener('bunkerstroy_customers_updated', syncAll);
    window.addEventListener('bunkerstroy_orders_updated', syncAll);
    return () => {
      window.removeEventListener('bunkerstroy_admin_config_updated', syncAll);
      window.removeEventListener('bunkerstroy_sub_admins_updated', syncAll);
      window.removeEventListener('bunkerstroy_suppliers_updated', syncAll);
      window.removeEventListener('bunkerstroy_customers_updated', syncAll);
      window.removeEventListener('bunkerstroy_orders_updated', syncAll);
    };
  }, []);

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
    return {
      firstName: formatWord(parts[1]),
      lastName: formatWord(parts[0]),
    };
  };

  const resolveRegionKey = (rawRegion?: string, rawAddress?: string): string => {
    const searchStr = `${rawRegion || ''} ${rawAddress || ''}`.replace(/`/g, '‘').replace(/'/g, '‘').toLowerCase();
    if (!searchStr.trim()) return '';
    if (rawRegion && REGIONS_AND_DISTRICTS[rawRegion]) return rawRegion;
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

  const resolveDistrictKey = (regionKey: string, rawDistrict?: string, rawAddress?: string): string => {
    if (!regionKey || !REGIONS_AND_DISTRICTS[regionKey]) return '';
    const regionDistricts = REGIONS_AND_DISTRICTS[regionKey];
    if (rawDistrict && regionDistricts.includes(rawDistrict)) return rawDistrict;
    const searchStr = `${rawDistrict || ''} ${rawAddress || ''}`.replace(/`/g, '‘').replace(/'/g, '‘').toLowerCase();
    for (const dist of regionDistricts) {
      const distBase = dist.replace(/\s+(tumani|shahri)$/i, '').trim().toLowerCase();
      if (distBase && searchStr.includes(distBase)) {
        return dist;
      }
    }
    return regionDistricts[0] || '';
  };

  // STIR tekshirish funksiyasi (Ta'minotchi qo'shish va tahrirlash uchun)
  const handleStirChangeAndLookup = async (
    rawValue: string,
    isEdit = false,
    overrideCabinetType?: SupplierCabinetType
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

    if (cleanStir.length < 9) {
      if (isEdit) {
        setEditSuppCompanyInfo(null);
      } else {
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
        const errMsg = resJson.error || "Ushbu STIR raqami bo‘yicha MChJ topilmadi.";
        if (isEdit) {
          setEditSuppStirError(errMsg);
          setEditSuppCompanyInfo(null);
        } else {
          setNewSuppStirError(errMsg);
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
        setEditSuppName(firstName || comp.director || '');
        setEditSuppSurname(lastName || '');
        setEditSuppRegion(matchedRegion || comp.locality || comp.region || 'Toshkent shahri');
        setEditSuppDistrict(matchedDistrict || comp.district || '');
        if (comp.phone) setEditSuppPhone(formatUzPhone(comp.phone));
      } else {
        setNewSuppCompanyInfo(comp);
        setNewSuppCompany(comp.companyName || '');
        setNewSuppName(firstName || comp.director || '');
        setNewSuppSurname(lastName || '');
        setNewSuppRegion(matchedRegion || comp.locality || comp.region || 'Toshkent shahri');
        setNewSuppDistrict(matchedDistrict || comp.district || '');
        if (comp.phone) setNewSuppPhone(formatUzPhone(comp.phone));
        if (comp.email) setNewSuppEmail(comp.email);
      }
    } catch {
      const errMsg = "Reyestr serveri bilan bog‘lanishda xatolik yuz berdi.";
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

  const handlePdfUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fileName = file.name;
    const reader = new FileReader();
    reader.onloadend = () => {
      setNewSuppPdfName(fileName);
      setNewSuppPdfData(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  // Yangi B2B / B2C Ta'minotchi kabinetini saqlash (Bunker Admin tomonidan)
  const handleAddSupplierSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanStir = newSuppStir.replace(/\D/g, '');
    if (cleanStir.length !== 9) {
      setNewSuppStirError("Iltimos, 9 xonali STIR raqamini kiriting!");
      return;
    }
    // Bir xil STIR bilan ayni kabinet turida (masalan B2B da) ikkinchi kabinet yaratib bo'lmaydi (bildirishnomasiz algoritm)
    if (isStirTakenInCabinetType(cleanStir, newSuppCabinetType)) {
      return;
    }
    if (!newSuppCompany.trim()) {
      setNewSuppStirError("Avval STIR raqamini tekshirib, tashkilot ma'lumotlarini yuklang!");
      return;
    }
    if (!newSuppLogin.trim() || !newSuppPassword.trim()) {
      setNewSuppContractError("Iltimos, kabinet login va parolini kiriting.");
      return;
    }
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

    const trimmedCategory = newSuppCategory.trim() || "Qurilish materiallari";
    addProductType(trimmedCategory);
    setProductTypes(getProductTypes());

    const finalRegion =
      newSuppRegion ||
      newSuppCompanyInfo?.locality ||
      newSuppCompanyInfo?.region ||
      'Toshkent shahri';
    const selectedDistrict =
      newSuppDistrict ||
      newSuppCompanyInfo?.district ||
      (REGIONS_AND_DISTRICTS[finalRegion]?.[0] || '');

    const newSupplier: SupplierPartner = {
      id: `supp-${Date.now()}`,
      cabinetType: newSuppCabinetType,
      inn: cleanStir,
      companyInfo: newSuppCompanyInfo || undefined,
      name: newSuppName.trim() || newSuppCompanyInfo?.director || 'Rahbar',
      surname: newSuppSurname.trim() || undefined,
      companyName: newSuppCompany.trim(),
      phone: newSuppPhone.trim().length > 5 ? newSuppPhone.trim() : '+998 00 000 00 00',
      email: newSuppEmail.trim() || `${newSuppLogin.trim()}@bunkerstroy.uz`,
      login: newSuppLogin.trim(),
      password: newSuppPassword.trim(),
      region: finalRegion,
      district: selectedDistrict,
      category: trimmedCategory,
      contractNumber: contractNum,
      contractPdfName: newSuppPdfName || undefined,
      contractPdfData: newSuppPdfData || undefined,
      allowPromoVideo: newSuppAllowPromoVideo,
      commissionRate: Math.min(100, Math.max(0.1, Number(newSuppCommission) || 5)),
      commissionBasis: newSuppCommissionBasis,
      status: 'active',
      productsCount: 0,
      totalSalesSum: 0,
      rating: 5.0,
      createdAt: new Date().toISOString(),
    };

    // Firestore ga yozish
    try {
      const cleanForFirestore = Object.fromEntries(
        Object.entries({
          ...newSupplier,
          role: 'supplier',
          displayName: newSupplier.companyName,
          firstName: newSupplier.name,
          lastName: newSupplier.surname,
          contractPdfData: undefined,
        }).filter(([, v]) => v !== undefined)
      );
      setDoc(doc(db, 'users', newSupplier.id), cleanForFirestore, { merge: true }).catch(() => {});
    } catch {}

    createSupplierApi(newSupplier).then((res) => {
      if (res?.data?.id) newSupplier.id = res.data.id;
    }).catch((err) => console.warn('Backend createSupplier notice:', err));

    const updatedSuppliers = [newSupplier, ...suppliers];
    try {
      localStorage.setItem('bunkerstroy_suppliers', JSON.stringify(updatedSuppliers));
      window.dispatchEvent(new CustomEvent('bunkerstroy_suppliers_updated'));
    } catch {
      try {
        const light = updatedSuppliers.map((s) => ({ ...s, contractPdfData: undefined }));
        localStorage.setItem('bunkerstroy_suppliers', JSON.stringify(light));
        window.dispatchEvent(new CustomEvent('bunkerstroy_suppliers_updated'));
      } catch {}
    }
    setSuppliers(updatedSuppliers);

    setSupplierAddSuccess(true);
    setTimeout(() => {
      setSupplierAddSuccess(false);
      setIsAddSupplierOpen(false);
      setNewSuppStir('');
      setNewSuppStirError(null);
      setNewSuppCompanyInfo(null);
      setNewSuppCompany('');
      setNewSuppName('');
      setNewSuppSurname('');
      setNewSuppPhone('+998 ');
      setNewSuppEmail('');
      setNewSuppLogin('');
      setNewSuppPassword('');
      setNewSuppRegion('');
      setNewSuppDistrict('');
      setNewSuppCategory('');
      setNewSuppContractNumber('');
      setNewSuppPdfName(null);
      setNewSuppPdfData(null);
      setNewSuppAllowPromoVideo(false);
      setNewSuppCommission(5);
      setNewSuppCommissionBasis('total');
    }, 1000);
  };

  // Ta'minotchi kabinetini tahrirlash oynasini ochish
  const handleOpenEditSupplier = (supp: SupplierPartner) => {
    setEditingSupplier(supp);
    setEditSuppCabinetType(supp.cabinetType === 'manufacturer' ? 'manufacturer' : 'partner');
    setEditSuppStir(supp.inn || '');
    setEditSuppStirError(null);
    setEditSuppCompanyInfo(supp.companyInfo || null);
    setEditSuppCompany(supp.companyName || '');
    setEditSuppName(supp.name || '');
    setEditSuppSurname(supp.surname || '');
    setEditSuppPhone(supp.phone ? formatUzPhone(supp.phone) : '+998 ');
    setEditSuppLogin(supp.login || '');
    setEditSuppPassword(supp.password || '');
    setShowEditSuppPass(false);
    setEditSuppRegion(supp.region || 'Toshkent shahri');
    setEditSuppDistrict(supp.district || '');
    setEditSuppCategory(supp.category || '');
    setEditSuppCommission(Number(supp.commissionRate) || 5);
    setEditSuppCommissionBasis(supp.commissionBasis === 'profit' ? 'profit' : 'total');
    setEditSuppAuthPassword('');
    setShowEditSuppAuthPass(false);
    setEditSuppError(null);
    setEditSuppSuccess(false);
  };

  // Ta'minotchi kabineti tahririni parol asosida saqlash
  const handleSaveEditSupplier = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSupplier) return;
    setEditSuppError(null);

    const cleanStir = editSuppStir.replace(/\D/g, '');
    if (cleanStir.length === 9 && isStirTakenInCabinetType(cleanStir, editSuppCabinetType, editingSupplier.id)) {
      return;
    }

    if (!isValidSupplierActionPassword(editSuppAuthPassword, editingSupplier)) {
      setEditSuppError("Tasdiqlash paroli noto‘g‘ri kiritildi!");
      return;
    }

    const tLogin = editSuppLogin.trim();
    const tPass = editSuppPassword.trim();
    if (!tLogin || !tPass) {
      setEditSuppError("Iltimos, kabinet login va parolini kiriting.");
      return;
    }

    const conflict = getLoginConflictError(tLogin, editingSupplier.id, tPass, {
      requirePassword: true,
      currentAccount: editingSupplier,
    });
    if (conflict) {
      if (isLoginRejectedError(conflict)) {
        setEditSuppLogin('');
      }
      setEditSuppError(conflict);
      return;
    }

    const trimmedCategory = editSuppCategory.trim() || editingSupplier.category || 'Qurilish materiallari';
    addProductType(trimmedCategory);
    setProductTypes(getProductTypes());

    const updatedSupp: SupplierPartner = {
      ...editingSupplier,
      cabinetType: editSuppCabinetType,
      inn: cleanStir || editingSupplier.inn,
      companyInfo: editSuppCompanyInfo || editingSupplier.companyInfo,
      companyName: editSuppCompany.trim() || editingSupplier.companyName,
      name: editSuppName.trim() || editingSupplier.name,
      surname: editSuppSurname.trim() || undefined,
      phone: editSuppPhone.trim().length > 5 ? editSuppPhone.trim() : editingSupplier.phone,
      login: tLogin,
      password: tPass,
      region: editSuppRegion || editingSupplier.region,
      district: editSuppDistrict || editingSupplier.district,
      category: trimmedCategory,
      commissionRate: Math.min(100, Math.max(0.1, Number(editSuppCommission) || 5)),
      commissionBasis: editSuppCommissionBasis,
    };

    try {
      const cleanForFirestore = Object.fromEntries(
        Object.entries({
          ...updatedSupp,
          role: 'supplier',
          displayName: updatedSupp.companyName,
          firstName: updatedSupp.name,
          lastName: updatedSupp.surname,
          contractPdfData: undefined,
        }).filter(([, v]) => v !== undefined)
      );
      setDoc(doc(db, 'users', updatedSupp.id), cleanForFirestore, { merge: true }).catch(() => {});
    } catch {}

    const nextSuppliers = suppliers.map((s) => (s.id === editingSupplier.id ? updatedSupp : s));
    try {
      localStorage.setItem('bunkerstroy_suppliers', JSON.stringify(nextSuppliers));
      window.dispatchEvent(new CustomEvent('bunkerstroy_suppliers_updated'));
    } catch {
      try {
        const light = nextSuppliers.map((s) => ({ ...s, contractPdfData: undefined }));
        localStorage.setItem('bunkerstroy_suppliers', JSON.stringify(light));
        window.dispatchEvent(new CustomEvent('bunkerstroy_suppliers_updated'));
      } catch {}
    }
    setSuppliers(nextSuppliers);
    updateSupplierApi(editingSupplier.id, updatedSupp).catch((err) => console.warn('Backend updateSupplier notice:', err));
    setEditSuppSuccess(true);
    setTimeout(() => {
      setEditSuppSuccess(false);
      setEditingSupplier(null);
    }, 800);
  };

  // Ta'minotchi kabinetini Bunker Admin paroli asosida o'chirish (SMS siz, va kabinet yuklagan barcha mahsulotlarni o'chirish)
  const handleConfirmDeleteSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deletingSupplier) return;
    setDeleteSuppError(null);

    if (!isValidSupplierActionPassword(deleteSuppAuthPassword, deletingSupplier)) {
      setDeleteSuppError("Bunker Admin paroli noto‘g‘ri kiritildi!");
      return;
    }

    // Faol qurilma sessiyasini bo'shatish
    releaseCabinetDeviceLock(deletingSupplier.login, deletingSupplier.id);

    const nextSuppliers = suppliers.filter((s) => s.id !== deletingSupplier.id);
    try {
      localStorage.setItem('bunkerstroy_suppliers', JSON.stringify(nextSuppliers));
      window.dispatchEvent(new CustomEvent('bunkerstroy_suppliers_updated'));
    } catch {}
    setSuppliers(nextSuppliers);
    deleteSupplierApi(deletingSupplier.id).catch((err) => console.warn('Backend deleteSupplier notice:', err));

    try {
      deleteDoc(doc(db, 'users', deletingSupplier.id)).catch(() => {});
    } catch {}

    // Ushbu kabinet yuklagan barcha mahsulotlarni localStorage, App state va Firestore dan to'liq o'chirish
    try {
      const savedProds = localStorage.getItem('bunkerstroy_products');
      if (savedProds) {
        const prodList = JSON.parse(savedProds);
        if (Array.isArray(prodList)) {
          const suppComp = (deletingSupplier.companyName || '').trim().toLowerCase();
          const suppStir = (deletingSupplier.inn || '').replace(/\D/g, '');
          const remaining = prodList.filter((p: any) => {
            if (p?.supplierId) {
              const isIdMatch = p.supplierId === deletingSupplier.id;
              if (isIdMatch && p?.id) {
                deleteDoc(doc(db, 'products', p.id)).catch(() => {});
              }
              return !isIdMatch;
            }
            const pSupp = (p?.supplierName || '').trim().toLowerCase();
            const pStir = (p?.supplierInn || '').replace(/\D/g, '');
            const sameType =
              !p?.supplierCabinetType ||
              !deletingSupplier.cabinetType ||
              p.supplierCabinetType === deletingSupplier.cabinetType;
            const isMatch =
              sameType &&
              ((suppComp && pSupp === suppComp) || (suppStir && pStir && pStir === suppStir));
            if (isMatch && p?.id) {
              deleteDoc(doc(db, 'products', p.id)).catch(() => {});
            }
            return !isMatch;
          });
          localStorage.setItem('bunkerstroy_products', JSON.stringify(remaining));
          window.dispatchEvent(new CustomEvent('bunkerstroy_products_updated'));
        }
      }
    } catch {}

    if (editingSupplier?.id === deletingSupplier.id) {
      setEditingSupplier(null);
    }
    setDeletingSupplier(null);
    setDeleteSuppAuthPassword('');
    setDeleteSuppSmsSent(false);
    setDeleteSuppSmsCode('');
    setDeleteSuppSmsInput('');
    setDeleteSuppSmsNotice(null);
  };

  const getPermissionLabel = (perm: AdminPermissionSection) => {
    return ADMIN_PERMISSION_META.find((m) => m.id === perm)?.label || perm;
  };

  const getPermissionIcon = (perm: AdminPermissionSection) => {
    switch (perm) {
      case 'reports':
        return <BarChart3 className="w-4 h-4 text-[#FFB800]" />;
      case 'suppliers':
        return <Users className="w-4 h-4 text-emerald-400" />;
      case 'requests_customers':
        return <ShoppingCart className="w-4 h-4 text-sky-400" />;
      case 'b2b_crm':
        return <Building className="w-4 h-4 text-purple-400" />;
      case 'b2c_crm':
        return <Briefcase className="w-4 h-4 text-rose-400" />;
    }
  };

  // Asosiy Admin kabineti login/parolini saqlash (Bunker Admin tomonidan)
  const handleSaveMainAdminCredentials = (e: React.FormEvent) => {
    e.preventDefault();
    setMainAdminError(null);
    const tLogin = editMainLogin.trim();
    const tPass = editMainPassword.trim();
    const tPhone = editMainPhone.trim().length > 5 ? editMainPhone.trim() : mainAdminConfig.phone || '+998 77 017 03 01';

    if (!tLogin || !tPass) {
      setMainAdminError("Asosiy Admin login va paroli bo‘sh bo‘lishi mumkin emas.");
      return;
    }

    const mainLoginConflict = getLoginConflictError(tLogin, 'admin-master', tPass, {
      requirePassword: true,
      currentAccount: mainAdminConfig,
    });
    if (mainLoginConflict) {
      if (isLoginRejectedError(mainLoginConflict)) {
        setEditMainLogin('');
      }
      setMainAdminError(mainLoginConflict);
      return;
    }

    const updated: AdminConfig = {
      ...mainAdminConfig,
      login: tLogin,
      password: tPass,
      phone: tPhone,
      credentialsUpdatedByAdmin: true,
    };

    saveAdminConfig(updated);
    setMainAdminConfig(updated);
    if (onMainAdminConfigChange) onMainAdminConfigChange(updated);
    setIsEditingMainAdmin(false);
    setMainAdminSavedMsg("Admin kabineti ma'lumotlari muvaffaqiyatli yangilandi!");
    setTimeout(() => setMainAdminSavedMsg(null), 3000);
  };

  const handleOpenBunkerSettings = () => {
    const latestCfg = getAdminConfig();
    const latestBunker = getBunkerAdminCredentials();
    setMainAdminConfig(latestCfg);
    setBunkerCreds(latestBunker);
    setBunkerLoginInput(latestBunker.login);
    setBunkerPassInput(latestBunker.password);
    setBunkerPhoneInput(latestBunker.phone || latestCfg.phone || '+998 71 200 00 50');
    setSettingsLogoUrl(latestCfg.logoUrl);
    setSettingsLogoFileName(null);
    setSettingsTelegram1(latestCfg.telegram || '');
    setSettingsTelegram2(latestCfg.telegram2 || latestCfg.telegram || '');
    setSettingsYoutube(latestCfg.youtube || '');
    setSettingsInstagram(latestCfg.instagram || '');
    setSettingsPhone(latestCfg.phone || '');
    setSettingsSmsSent(false);
    setSettingsSmsCode('');
    setSettingsSmsInput('');
    setSettingsSmsNotice(null);
    setSettingsError(null);
    setSettingsSavedSuccess(false);
    setIsSettingsOpen(true);
  };

  const handleSettingsLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSettingsLogoFileName(file.name);
    const compressedUrl = await compressImageFileToDataUrl(file, 256, 0.82);
    if (compressedUrl) {
      setSettingsLogoUrl(compressedUrl);
    }
  };

  const handleSaveBunkerSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSettingsError(null);
    const tBLogin = bunkerLoginInput.trim();
    const tBPass = bunkerPassInput.trim();
    const tBPhone = (bunkerPhoneInput || settingsPhone || '+998 71 200 00 50').trim();
    if (!tBLogin || !tBPass) {
      setSettingsError("Bunker Admin login va paroli bo‘sh bo‘lishi mumkin emas.");
      return;
    }
    if (tBPhone.replace(/\D/g, '').length < 9) {
      setSettingsError("Iltimos, tasdiqlash telefon raqamini to‘liq kiriting.");
      return;
    }
    const bunkerLoginConflict = getLoginConflictError(tBLogin, 'bunker-admin-master', tBPass, {
      requirePassword: true,
      currentAccount: bunkerCreds,
    });
    if (bunkerLoginConflict) {
      if (isLoginRejectedError(bunkerLoginConflict)) {
        setBunkerLoginInput('');
      }
      setSettingsError(bunkerLoginConflict);
      return;
    }

    // Telefon raqam orqali serverda SMS tasdiqlash (kod hech qachon ekranga chiqarilmaydi)
    if (!settingsSmsSent) {
      setSettingsSmsCode('');
      setSettingsSmsInput('');
      setSettingsSmsNotice(`📲 Tasdiqlash telefon raqamingizga (${tBPhone}) SMS kod yuborilmoqda...`);
      const res = await sendSecurePhoneOtp(tBPhone, 'confirm');
      if (!res.success) {
        setSettingsError(res.error || 'SMS yuborishda xatolik yuz berdi.');
        setSettingsSmsNotice(null);
        return;
      }
      setSettingsSmsSent(true);
      setSettingsSmsCode(res.code || '');
      setSettingsSmsNotice(
        res.code
          ? `📲 SMS tasdiqlash kodi ${tBPhone} raqamingizga yuborildi. Kod: ${res.code}`
          : `📲 SMS tasdiqlash kodi ${tBPhone} raqamingizga yuborildi.`
      );
      return;
    }

    const check = await verifySecurePhoneOtp({
      phone: tBPhone,
      code: settingsSmsInput.trim(),
      purpose: 'confirm',
    });
    if (!check.verified) {
      setSettingsError(check.error || "SMS tasdiqlash kodi noto‘g‘ri kiritildi!");
      return;
    }

    saveBunkerAdminCredentials({ login: tBLogin, password: tBPass, phone: tBPhone });
    setBunkerCreds({ login: tBLogin, password: tBPass, phone: tBPhone });

    const updatedCfg: AdminConfig = {
      ...mainAdminConfig,
      logoUrl: settingsLogoUrl,
      telegram: settingsTelegram1.trim(),
      telegram2: settingsTelegram2.trim(),
      youtube: settingsYoutube.trim(),
      instagram: settingsInstagram.trim(),
      phone: settingsPhone.trim() || tBPhone,
    };
    saveAdminConfig(updatedCfg);
    setMainAdminConfig(updatedCfg);
    if (onMainAdminConfigChange) onMainAdminConfigChange(updatedCfg);
    setSettingsSavedSuccess(true);
    setSettingsSmsSent(false);
    setSettingsSmsNotice(null);
    setTimeout(() => {
      setSettingsSavedSuccess(false);
      setIsSettingsOpen(false);
    }, 1000);
  };

  // Huquq (Bo'lim) qo'shish yoki olib tashlash (ketma-ketlikda!)
  const handleTogglePermission = (
    perm: AdminPermissionSection,
    currentList: AdminPermissionSection[],
    setList: React.Dispatch<React.SetStateAction<AdminPermissionSection[]>>
  ) => {
    if (currentList.includes(perm)) {
      setList(currentList.filter((p) => p !== perm));
    } else {
      setList([...currentList, perm]);
    }
  };

  const handleMovePermission = (
    index: number,
    direction: 'up' | 'down',
    currentList: AdminPermissionSection[],
    setList: React.Dispatch<React.SetStateAction<AdminPermissionSection[]>>
  ) => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= currentList.length) return;
    const copy = [...currentList];
    const temp = copy[index];
    copy[index] = copy[targetIndex];
    copy[targetIndex] = temp;
    setList(copy);
  };

  // Yangi Admin Kabineti yaratish
  const handleCreateSubAdmin = (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);
    setCreateSuccess(null);

    const tName = newCabinetName.trim();
    const tLogin = newLogin.trim();
    const tPass = newPassword.trim();
    const tPhone = newSubPhone.trim().length > 5 ? newSubPhone.trim() : mainAdminConfig.phone || '+998 77 017 03 01';

    if (!tName) {
      setCreateError("Iltimos, Kabinet nomini kiriting.");
      return;
    }
    if (!tLogin) {
      setCreateError("Iltimos, Kabinet uchun Login kiriting.");
      return;
    }
    if (!tPass) {
      setCreateError("Iltimos, Kabinet uchun Parol kiriting.");
      return;
    }
    if (newPermissions.length === 0) {
      setCreateError("Iltimos, kamida 1 ta Huquq (Bo‘lim) qo‘shing!");
      return;
    }

    const subLoginConflict = getLoginConflictError(tLogin, undefined, tPass, {
      requirePassword: true,
    });
    if (subLoginConflict) {
      if (isLoginRejectedError(subLoginConflict)) {
        setNewLogin('');
      }
      setCreateError(subLoginConflict);
      return;
    }

    const newAccount: SubAdminCabinetAccount = {
      id: 'subadmin-' + Date.now().toString(36),
      cabinetName: tName,
      login: tLogin,
      password: tPass,
      phone: tPhone,
      permissions: [...newPermissions],
      createdAt: new Date().toISOString(),
    };

    const updatedList = [newAccount, ...subAdmins];
    saveSubAdmins(updatedList);
    setSubAdmins(updatedList);

    try {
      setDoc(
        doc(db, 'users', newAccount.id),
        {
          id: newAccount.id,
          email: `${newAccount.login.toLowerCase()}@bunkerstroy.uz`,
          displayName: newAccount.cabinetName,
          firstName: newAccount.login,
          companyName: newAccount.cabinetName,
          phone: newAccount.phone,
          role: 'admin',
          isSubAdmin: true,
          subAdminId: newAccount.id,
          subAdminPermissions: newAccount.permissions,
          login: newAccount.login,
          password: newAccount.password,
          createdAt: newAccount.createdAt,
        },
        { merge: true }
      ).catch(() => {});
    } catch {}

    setNewCabinetName('');
    setNewLogin('');
    setNewPassword('');
    setNewSubPhone('+998 ');
    setNewPermissions([]);
    setCreateSuccess(`«${tName}» admin kabineti muvaffaqiyatli yaratildi!`);
    setTimeout(() => setCreateSuccess(null), 3500);
  };

  // Mavjud Sub-Adminni tahrirlashni saqlash
  const handleSaveEditSubAdmin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSubAdmin) return;
    setEditSubError(null);

    const tName = editSubName.trim();
    const tLogin = editSubLogin.trim();
    const tPass = editSubPassword.trim();
    const tPhone = editSubPhone.trim().length > 5 ? editSubPhone.trim() : editingSubAdmin.phone || mainAdminConfig.phone || '+998 77 017 03 01';

    if (!tName || !tLogin || !tPass) {
      setEditSubError("Kabinet nomi, login va parol to‘ldirilishi shart.");
      return;
    }
    if (editSubPermissions.length === 0) {
      setEditSubError("Kamida 1 ta bo‘lim (huquq) biriktirilishi shart.");
      return;
    }
    const editSubLoginConflict = getLoginConflictError(tLogin, editingSubAdmin.id, tPass, {
      requirePassword: true,
      currentAccount: editingSubAdmin,
    });
    if (editSubLoginConflict) {
      if (isLoginRejectedError(editSubLoginConflict)) {
        setEditSubLogin('');
      }
      setEditSubError(editSubLoginConflict);
      return;
    }

    const updatedAccount: SubAdminCabinetAccount = {
      ...editingSubAdmin,
      cabinetName: tName,
      login: tLogin,
      password: tPass,
      phone: tPhone,
      permissions: [...editSubPermissions],
      updatedAt: new Date().toISOString(),
    };

    const nextList = subAdmins.map((a) => (a.id === editingSubAdmin.id ? updatedAccount : a));
    saveSubAdmins(nextList);
    setSubAdmins(nextList);

    try {
      setDoc(
        doc(db, 'users', updatedAccount.id),
        {
          id: updatedAccount.id,
          email: `${updatedAccount.login.toLowerCase()}@bunkerstroy.uz`,
          displayName: updatedAccount.cabinetName,
          firstName: updatedAccount.login,
          companyName: updatedAccount.cabinetName,
          phone: updatedAccount.phone,
          role: 'admin',
          isSubAdmin: true,
          subAdminId: updatedAccount.id,
          subAdminPermissions: updatedAccount.permissions,
          login: updatedAccount.login,
          password: updatedAccount.password,
          updatedAt: updatedAccount.updatedAt,
        },
        { merge: true }
      ).catch(() => {});
    } catch {}

    setEditingSubAdmin(null);
  };

  // Sub-Admin kabinetini o'chirish
  const handleDeleteSubAdmin = (id: string) => {
    const nextList = subAdmins.filter((a) => a.id !== id);
    saveSubAdmins(nextList);
    setSubAdmins(nextList);
    try {
      deleteDoc(doc(db, 'users', id)).catch(() => {});
    } catch {}
    if (editingSubAdmin?.id === id) {
      setEditingSubAdmin(null);
    }
  };

  const handleCopyText = (key: string, text: string) => {
    try {
      navigator.clipboard.writeText(text);
      setCopiedId(key);
      setTimeout(() => setCopiedId(null), 1500);
    } catch {}
  };

  const filteredSuppliers = suppliers.filter((s) => {
    const sType = s.cabinetType || 'partner';
    if (supplierFilterTab !== 'all' && sType !== supplierFilterTab) return false;
    const q = supplierSearch.trim().toLowerCase();
    if (!q) return true;
    return (
      (s.companyName || '').toLowerCase().includes(q) ||
      (s.inn || '').toLowerCase().includes(q) ||
      (s.login || '').toLowerCase().includes(q) ||
      `${s.name || ''} ${s.surname || ''}`.toLowerCase().includes(q) ||
      (s.region || '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="min-h-screen w-full bg-[#071326] text-[#F5F5F2] flex flex-col font-sans">
      {/* =========================================================================
          HEADER: BUNKER ADMIN BOSH BOSHQARUV PANELI
          ========================================================================= */}
      <header className="bg-gradient-to-r from-[#0A1931] via-[#0F2547] to-[#0A1931] border-b-2 border-[#FFB800] px-2.5 sm:px-6 lg:px-10 pt-2 pb-1 sm:py-0 h-16 sm:h-20 flex items-center justify-between shadow-2xl sticky top-0 z-40">
        <div
          onClick={handleOpenBunkerSettings}
          title="Sozlamalarni ochish uchun bosing"
          className="flex items-center gap-2 sm:gap-3.5 mt-1.5 sm:mt-0 cursor-pointer select-none group min-w-0"
        >
          {mainAdminConfig.logoUrl ? (
            <img
              src={mainAdminConfig.logoUrl}
              alt="Logo"
              className="w-8 h-8 sm:w-11 sm:h-11 object-contain rounded-lg sm:rounded-xl border-2 border-[#FFB800] bg-[#071326] shrink-0"
            />
          ) : (
            <div className="w-8 h-8 sm:w-11 sm:h-11 rounded-lg sm:rounded-xl bg-[#FFB800] text-[#071326] flex items-center justify-center shadow-[0_0_20px_rgba(255,184,0,0.4)] border-2 border-amber-200 shrink-0">
              <HardHat className="w-4.5 h-4.5 sm:w-6 sm:h-6 stroke-[2.5]" />
            </div>
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
              <h1 className="text-xs sm:text-2xl font-black tracking-wider text-white uppercase leading-tight">
                <span className="text-[#FFB800]">BUNKER</span> <span className="text-white">STROY</span>{' '}
                <span className="text-[10px] sm:text-lg text-amber-300">• BUNKER ADMIN</span>
              </h1>
              <span className="hidden sm:inline-flex px-2.5 py-0.5 rounded-full text-[10px] font-mono font-black uppercase bg-red-600 text-white border border-red-400 shadow-sm">
                Bosh Boshqaruv
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
          {/* Bitta Til almashtirish tugmasi (O'Z <-> РУ) */}
          <button
            type="button"
            onClick={() => setLang(lang === 'uz' ? 'ru' : 'uz')}
            className="px-2 sm:px-3 py-1 sm:py-2 rounded-lg sm:rounded-xl bg-[#FFB800] hover:bg-[#FFC928] text-[#071326] border border-[#E5A600] text-[10px] sm:text-xs font-black transition-all cursor-pointer shadow-sm shrink-0"
            title={lang === 'uz' ? 'Русский язык (РУ)' : "O‘zbek tili (O‘Z)"}
          >
            {lang === 'uz' ? 'O‘Z' : 'РУ'}
          </button>

          <button
            type="button"
            onClick={onGoToShop}
            className="px-2 sm:px-3.5 py-1 sm:py-2 rounded-lg sm:rounded-xl bg-[#0A1931] hover:bg-[#132C54] text-sky-200 hover:text-[#FFB800] border border-[#254B85] text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5"
          >
            <HardHat className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#FFB800]" />
            <span className="hidden sm:inline">Bosh sahifa</span>
          </button>

          <button
            type="button"
            onClick={handleOpenBunkerSettings}
            className="px-2.5 sm:px-4 py-1 sm:py-2 rounded-lg sm:rounded-xl bg-[#071326] hover:bg-[#132C54] text-[#FFB800] border border-[#FFB800]/60 text-[11px] sm:text-sm font-black transition-all flex items-center gap-1 sm:gap-1.5 cursor-pointer shadow-lg active:scale-95"
            title="Sozlamalar va Chiqish"
          >
            <Settings className="w-3.5 h-3.5 sm:w-4 sm:h-4 stroke-[2.5]" />
            <span>Sozlamalar</span>
          </button>
        </div>
      </header>

      {/* =========================================================================
          MAIN CONTENT
          ========================================================================= */}
      <main className="flex-1 w-full max-w-7xl mx-auto mt-3 sm:mt-0 px-2.5 sm:px-6 lg:px-8 py-3 sm:py-6 space-y-3 sm:space-y-6">
        {/* =====================================================================
            YUQORI 2 TA BOSILADIGAN BO'LIM KARTALARI:
            1) Admin Kabinetlar (ustiga bosilganda Admin kabinetlar ro'yxati, qo'shish va tahrirlash)
            2) B2B va B2C Ta'minotchi Kabinetlar (ustiga bosilganda Ta'minotchi kabinetlar ro'yxati, qo'shish va to'g'ridan-to'g'ri o'tish)
            ===================================================================== */}
        <div className="grid grid-cols-2 gap-2 sm:gap-4 mt-1.5 sm:mt-0">
          {activeBunkerSection === 'supplier_cabinets' ? (
            <div className="rounded-xl sm:rounded-2xl p-2.5 sm:p-5 flex items-center justify-between text-left border-2 shadow-xl bg-[#0A1931] border-emerald-500/50">
              <div className="min-w-0">
                <span className="text-[10px] sm:text-xs font-mono uppercase text-emerald-300 font-bold block truncate">
                  Foydalanuvchilar soni
                </span>
                <span className="text-sm sm:text-2xl font-black text-white font-mono mt-0.5 sm:mt-1 block truncate">
                  {customersCount} ta
                </span>
              </div>
              <div className="w-8 h-8 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl flex items-center justify-center border bg-emerald-500/20 border-emerald-400 text-emerald-400 shrink-0">
                <Users className="w-4 h-4 sm:w-6 sm:h-6" />
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setActiveBunkerSection('admin_cabinets')}
              className={`rounded-xl sm:rounded-2xl p-2.5 sm:p-5 flex items-center justify-between text-left transition-all cursor-pointer border-2 shadow-xl ${
                activeBunkerSection === 'admin_cabinets'
                  ? 'bg-[#132C54] border-[#FFB800] shadow-[0_0_25px_rgba(255,184,0,0.25)]'
                  : 'bg-[#0A1931] border-emerald-500/50 hover:border-[#FFB800]/70'
              }`}
            >
              <div className="min-w-0">
                <span className="text-[10px] sm:text-xs font-mono uppercase text-emerald-300 font-bold block truncate">
                  Admin Kabinetlar
                </span>
                <span className="text-sm sm:text-2xl font-black text-white font-mono mt-0.5 sm:mt-1 block truncate">
                  {subAdmins.length} ta kabinet
                </span>
              </div>
              <div
                className={`w-8 h-8 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl flex items-center justify-center border shrink-0 ${
                  activeBunkerSection === 'admin_cabinets'
                    ? 'bg-[#FFB800] text-[#071326] border-amber-200'
                    : 'bg-emerald-500/20 border-emerald-400 text-emerald-400'
                }`}
              >
                <UserPlus className="w-4 h-4 sm:w-6 sm:h-6" />
              </div>
            </button>
          )}

          <button
            type="button"
            onClick={() =>
              setActiveBunkerSection(
                activeBunkerSection === 'supplier_cabinets' ? 'admin_cabinets' : 'supplier_cabinets'
              )
            }
            className={`rounded-xl sm:rounded-2xl p-2.5 sm:p-5 flex items-center justify-between text-left transition-all cursor-pointer border-2 shadow-xl ${
              activeBunkerSection === 'supplier_cabinets'
                ? 'bg-[#132C54] border-[#FFB800] shadow-[0_0_25px_rgba(255,184,0,0.25)]'
                : 'bg-[#0A1931] border-sky-500/50 hover:border-[#FFB800]/70'
            }`}
          >
            <div className="min-w-0">
              <span className="text-[10px] sm:text-xs font-mono uppercase text-sky-300 font-bold block truncate">
                Ta'minotchi Kabinetlar
              </span>
              <span className="text-sm sm:text-2xl font-black text-white font-mono mt-0.5 sm:mt-1 block truncate">
                {suppliers.length} ta hamkor
              </span>
            </div>
            <div
              className={`w-8 h-8 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl flex items-center justify-center border shrink-0 ${
                activeBunkerSection === 'supplier_cabinets'
                  ? 'bg-[#FFB800] text-[#071326] border-amber-200'
                  : 'bg-sky-500/20 border-sky-400 text-sky-400'
              }`}
            >
              <Building className="w-4 h-4 sm:w-6 sm:h-6" />
            </div>
          </button>
        </div>

        {/* =====================================================================
            TAB 1: ADMIN KABINETLAR (Ro'yxat, Tahrirlash, Qo'shish va Kabinetga o'tish)
            ===================================================================== */}
        {activeBunkerSection === 'admin_cabinets' && (
          <div className="space-y-2.5 sm:space-y-6 animate-fadeIn">
            {/* 1. Admin kabineti */}
            <section className="bg-[#0A1931] border-2 border-[#FFB800] rounded-2xl sm:rounded-3xl p-2.5 sm:p-6 shadow-2xl space-y-2.5 sm:space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 sm:pb-4 border-b border-[#1E3A6D]">
                <div className="flex items-center gap-2 sm:gap-3.5">
                  <div className="w-8 h-8 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-[#FFB800] text-[#071326] flex items-center justify-center shrink-0 font-black shadow-md">
                    <ShieldCheck className="w-4 h-4 sm:w-6 sm:h-6 stroke-[2.5]" />
                  </div>
                  <h2 className="text-sm sm:text-xl font-black text-white">
                    Admin Kabineti
                  </h2>
                </div>

                <div className="flex items-center gap-1.5 sm:gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setEditMainLogin(mainAdminConfig.login);
                      setEditMainPassword(mainAdminConfig.password);
                      setEditMainPhone(mainAdminConfig.phone ? formatUzPhone(mainAdminConfig.phone) : '+998 77 017 03 01');
                      setIsEditingMainAdmin(!isEditingMainAdmin);
                      setMainAdminError(null);
                    }}
                    className="px-2.5 sm:px-4 py-1.5 sm:py-2.5 rounded-xl bg-[#132C54] hover:bg-[#1B3B6F] text-[#FFB800] border border-[#FFB800]/60 text-[10px] sm:text-xs font-black flex items-center gap-1 sm:gap-2 cursor-pointer transition-all"
                  >
                    <Pencil className="w-3 h-3 sm:w-4 sm:h-4 shrink-0" />
                    <span>{isEditingMainAdmin ? 'Bekor qilish' : "Login va Parolni O'zgartirish"}</span>
                  </button>

                  <button
                    type="button"
                    onClick={onEnterMainAdminCabinet}
                    className="px-3 sm:px-5 py-1.5 sm:py-2.5 rounded-xl bg-gradient-to-r from-[#FFB800] to-amber-500 hover:from-amber-400 hover:to-amber-500 text-[#071326] text-[11px] sm:text-sm font-black flex items-center gap-1 sm:gap-2 cursor-pointer shadow-lg shadow-amber-500/25 active:scale-95 transition-all"
                  >
                    <span>Kabinetga o‘tish</span>
                    <ArrowRight className="w-3.5 h-3.5 sm:w-4 sm:h-4 stroke-[2.5]" />
                  </button>
                </div>
              </div>

              {mainAdminSavedMsg && (
                <div className="p-2.5 sm:p-3 rounded-xl sm:rounded-2xl bg-emerald-500/20 border border-emerald-400 text-emerald-300 text-[11px] sm:text-xs font-bold flex items-center gap-2 animate-fadeIn">
                  <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>{mainAdminSavedMsg}</span>
                </div>
              )}

              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-4 text-xs">
                <div className="p-2.5 sm:p-4 rounded-xl sm:rounded-2xl bg-[#071326] border border-[#1E3A6D] space-y-0.5">
                  <span className="text-[10px] sm:text-[11px] text-sky-300 font-semibold block">Kabinet Nomi:</span>
                  <span className="text-xs sm:text-base font-black text-white block truncate">
                    Admin Kabineti
                  </span>
                </div>

                <div className="p-2.5 sm:p-4 rounded-xl sm:rounded-2xl bg-[#071326] border border-[#1E3A6D] space-y-0.5">
                  <span className="text-[10px] sm:text-[11px] text-sky-300 font-semibold block">Kirish Telefoni:</span>
                  <span className="text-xs sm:text-sm font-mono font-bold text-amber-300 block truncate">
                    {mainAdminConfig.phone || '+998 77 017 03 01'}
                  </span>
                </div>

                <div className="p-2.5 sm:p-4 rounded-xl sm:rounded-2xl bg-[#071326] border border-[#1E3A6D] space-y-0.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] sm:text-[11px] text-sky-300 font-semibold">Joriy Login:</span>
                    <button
                      type="button"
                      onClick={() => handleCopyText('main-login', mainAdminConfig.login)}
                      className="text-[10px] sm:text-[11px] text-[#FFB800] hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <Copy className="w-3 h-3" />
                      <span>{copiedId === 'main-login' ? 'Nusxalandi' : 'Nusxa'}</span>
                    </button>
                  </div>
                  <span className="text-xs sm:text-base font-mono font-black text-[#FFB800] block truncate">
                    {mainAdminConfig.login}
                  </span>
                </div>

                <div className="p-2.5 sm:p-4 rounded-xl sm:rounded-2xl bg-[#071326] border border-[#1E3A6D] space-y-0.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] sm:text-[11px] text-sky-300 font-semibold">Joriy Parol:</span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setShowMainPass(!showMainPass)}
                        className="text-sky-300 hover:text-white cursor-pointer"
                      >
                        {showMainPass ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleCopyText('main-pass', mainAdminConfig.password)}
                        className="text-[10px] sm:text-[11px] text-[#FFB800] hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        <Copy className="w-3 h-3" />
                        <span>{copiedId === 'main-pass' ? 'Nusxalandi' : 'Nusxa'}</span>
                      </button>
                    </div>
                  </div>
                  <span className="text-xs sm:text-base font-mono font-black text-emerald-400 block truncate">
                    {showMainPass ? mainAdminConfig.password : '••••••••'}
                  </span>
                </div>
              </div>

              {isEditingMainAdmin && (
                <form
                  onSubmit={handleSaveMainAdminCredentials}
                  className="p-3 sm:p-5 rounded-xl sm:rounded-2xl bg-[#071326] border-2 border-[#FFB800] space-y-3 animate-fadeIn"
                >
                  <div className="flex items-center justify-between">
                    <h3 className="text-[11px] sm:text-sm font-black text-[#FFB800] uppercase tracking-wider flex items-center gap-1.5">
                      <KeyRound className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      <span>Admin Kabineti Login, Parol va Telefonini O‘zgartirish</span>
                    </h3>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-4 text-xs">
                    <div className="space-y-1">
                      <label className="font-bold text-white block">Yangi Login:</label>
                      <input
                        type="text"
                        required
                        value={editMainLogin}
                        onChange={(e) => setEditMainLogin(e.target.value)}
                        placeholder="Masalan: ADMIN."
                        className="w-full px-3 py-2 sm:py-2.5 rounded-xl bg-[#0A1931] border border-[#254B85] text-white font-mono font-bold text-xs focus:outline-none focus:border-[#FFB800]"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="font-bold text-white block">Yangi Parol:</label>
                      <input
                        type="text"
                        required
                        value={editMainPassword}
                        onChange={(e) => setEditMainPassword(e.target.value)}
                        placeholder="Masalan: ADMIN."
                        className="w-full px-3 py-2 sm:py-2.5 rounded-xl bg-[#0A1931] border border-[#254B85] text-white font-mono font-bold text-xs focus:outline-none focus:border-[#FFB800]"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="font-bold text-amber-300 flex items-center gap-1">
                        <Phone className="w-3 h-3 text-[#FFB800]" />
                        <span>Kirish Telefon Raqami:</span>
                      </label>
                      <input
                        type="tel"
                        value={editMainPhone}
                        onChange={(e) => setEditMainPhone(formatUzPhone(e.target.value))}
                        placeholder="+998 90 123 45 67"
                        className="w-full px-3 py-2 sm:py-2.5 rounded-xl bg-[#0A1931] border border-[#254B85] text-white font-mono font-bold text-xs focus:outline-none focus:border-[#FFB800]"
                      />
                    </div>
                  </div>

                  {mainAdminError && (
                    <p className="text-xs text-red-400 font-bold">{mainAdminError}</p>
                  )}

                  <div className="flex items-center justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setIsEditingMainAdmin(false)}
                      className="px-3.5 py-1.5 sm:py-2 rounded-xl bg-[#0A1931] text-sky-200 hover:text-white border border-[#254B85] text-xs font-bold cursor-pointer"
                    >
                      Bekor qilish
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-1.5 sm:py-2 rounded-xl bg-[#FFB800] hover:bg-amber-400 text-[#071326] text-xs font-black flex items-center gap-1.5 cursor-pointer shadow-md"
                    >
                      <Save className="w-3.5 h-3.5" />
                      <span>Saqlash</span>
                    </button>
                  </div>
                </form>
              )}
            </section>

            {/* 2. Yangi Admin Kabinet Yaratish va Yaratilgan Admin Kabinetlar Ro'yxati */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 sm:gap-6 items-start">
              {/* CHAP TOMON: YANGI ADMIN KABINET YARATISH FORMASI */}
              <div className="lg:col-span-5 bg-[#0A1931] border-2 border-[#1E3A6D] rounded-2xl sm:rounded-3xl p-3 sm:p-6 shadow-2xl space-y-3 sm:space-y-4">
                <div className="flex items-center gap-2.5 pb-2.5 border-b border-[#1E3A6D]">
                  <div className="w-8 h-8 sm:w-11 sm:h-11 rounded-xl sm:rounded-2xl bg-emerald-500/20 border border-emerald-400 text-emerald-400 flex items-center justify-center shrink-0">
                    <UserPlus className="w-4 h-4 sm:w-5 sm:h-5 stroke-[2.3]" />
                  </div>
                  <h2 className="text-sm sm:text-lg font-black text-white">
                    Yangi Admin Kabinet Yaratish
                  </h2>
                </div>

                <form onSubmit={handleCreateSubAdmin} className="space-y-2.5 sm:space-y-4 text-xs">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
                    <div className="space-y-1">
                      <label className="font-bold text-white block text-[11px] sm:text-xs">
                        Kabinet Nomi:
                      </label>
                      <input
                        type="text"
                        required
                        value={newCabinetName}
                        onChange={(e) => setNewCabinetName(e.target.value)}
                        placeholder="Kabinet nomi"
                        className="w-full px-3 py-2 sm:py-2.5 rounded-xl bg-[#071326] border border-[#254B85] text-white text-xs focus:outline-none focus:border-[#FFB800]"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="font-bold text-amber-300 flex items-center gap-1 text-[11px] sm:text-xs">
                        <Phone className="w-3 h-3 text-[#FFB800]" />
                        <span>Kirish Telefon Raqami:</span>
                      </label>
                      <input
                        type="tel"
                        value={newSubPhone}
                        onChange={(e) => setNewSubPhone(formatUzPhone(e.target.value))}
                        placeholder="+998 90 123 45 67"
                        className="w-full px-3 py-2 sm:py-2.5 rounded-xl bg-[#071326] border border-[#254B85] text-white font-mono font-bold text-xs focus:outline-none focus:border-[#FFB800]"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 sm:gap-3">
                    <div className="space-y-1">
                      <label className="font-bold text-white block text-[11px] sm:text-xs">
                        Login (O‘zgarmas):
                      </label>
                      <input
                        type="text"
                        required
                        value={newLogin}
                        onChange={(e) => setNewLogin(e.target.value)}
                        placeholder="Login kiriting"
                        className="w-full px-3 py-2 sm:py-2.5 rounded-xl bg-[#071326] border border-[#254B85] text-white font-mono font-bold text-xs focus:outline-none focus:border-[#FFB800]"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="font-bold text-white block text-[11px] sm:text-xs">
                        Parol (O‘zgarmas):
                      </label>
                      <div className="relative">
                        <input
                          type={showNewPassword ? 'text' : 'password'}
                          required
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          placeholder="Parol kiriting"
                          className="w-full pl-3 pr-8 py-2 sm:py-2.5 rounded-xl bg-[#071326] border border-[#254B85] text-white font-mono font-bold text-xs focus:outline-none focus:border-[#FFB800]"
                        />
                        <button
                          type="button"
                          onClick={() => setShowNewPassword(!showNewPassword)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-sky-300 hover:text-white cursor-pointer"
                        >
                          {showNewPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="font-black text-[#FFB800] uppercase tracking-wider text-[11px] sm:text-xs flex items-center gap-1.5">
                        <Layers className="w-3.5 h-3.5" />
                        <span>Huquqlar (Bo‘limlar) Qo‘shish:</span>
                      </label>
                      <span className="text-[10px] sm:text-[11px] text-sky-200 font-mono">
                        {newPermissions.length} ta tanlandi
                      </span>
                    </div>

                    <div className="space-y-1.5">
                      {ADMIN_PERMISSION_META.map((item) => {
                        const orderIdx = newPermissions.indexOf(item.id);
                        const isAdded = orderIdx !== -1;
                        return (
                          <div
                            key={item.id}
                            className={`px-2.5 py-2 sm:p-3 rounded-xl sm:rounded-2xl border transition-all flex items-center justify-between gap-2 ${
                              isAdded
                                ? 'bg-[#132C54] border-[#FFB800] shadow-md'
                                : 'bg-[#071326] border-[#1E3A6D] hover:border-[#254B85]'
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              {isAdded ? (
                                <span className="w-5 h-5 sm:w-6 sm:h-6 rounded-lg bg-[#FFB800] text-[#071326] font-mono font-black text-[11px] sm:text-xs flex items-center justify-center shrink-0">
                                  {orderIdx + 1}
                                </span>
                              ) : (
                                <div className="w-5 h-5 sm:w-6 sm:h-6 rounded-lg bg-[#0A1931] border border-[#1E3A6D] flex items-center justify-center shrink-0">
                                  {getPermissionIcon(item.id)}
                                </div>
                              )}
                              <div className="min-w-0">
                                <span className="font-black text-white text-[11px] sm:text-xs block truncate">
                                  {item.label}
                                </span>
                                <span className="hidden sm:block text-[10px] text-sky-200/80 truncate">
                                  {item.description}
                                </span>
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={() =>
                                handleTogglePermission(item.id, newPermissions, setNewPermissions)
                              }
                              className={`px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-lg sm:rounded-xl font-black text-[10px] sm:text-[11px] shrink-0 cursor-pointer flex items-center gap-1 transition-all ${
                                isAdded
                                  ? 'bg-red-600/20 hover:bg-red-600 text-red-300 hover:text-white border border-red-500/40'
                                  : 'bg-[#FFB800] hover:bg-amber-400 text-[#071326] shadow-sm'
                              }`}
                            >
                              {isAdded ? (
                                <>
                                  <X className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                                  <span>Olib tashlash</span>
                                </>
                              ) : (
                                <>
                                  <Plus className="w-3 h-3 sm:w-3.5 sm:h-3.5 stroke-[2.5]" />
                                  <span>Qo‘shish</span>
                                </>
                              )}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {newPermissions.length > 0 && (
                    <div className="p-2.5 sm:p-3.5 rounded-xl sm:rounded-2xl bg-[#071326] border-2 border-emerald-500/50 space-y-1.5 animate-fadeIn">
                      <span className="text-[10px] sm:text-[11px] font-black text-emerald-400 uppercase tracking-wider block">
                        Ishlash Ketma-ketligi:
                      </span>
                      <div className="space-y-1">
                        {newPermissions.map((perm, idx) => (
                          <div
                            key={perm}
                            className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-[#0A1931] border border-[#1E3A6D]"
                          >
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="px-1.5 py-0.5 rounded bg-[#FFB800] text-[#071326] font-mono font-black text-[10px]">
                                {idx + 1}
                              </span>
                              <span className="font-bold text-white text-[11px] truncate">
                                {getPermissionLabel(perm)}
                              </span>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                disabled={idx === 0}
                                onClick={() =>
                                  handleMovePermission(idx, 'up', newPermissions, setNewPermissions)
                                }
                                className="p-1 rounded bg-[#132C54] text-sky-200 disabled:opacity-30 hover:text-white cursor-pointer"
                              >
                                <ArrowUp className="w-3 h-3" />
                              </button>
                              <button
                                type="button"
                                disabled={idx === newPermissions.length - 1}
                                onClick={() =>
                                  handleMovePermission(idx, 'down', newPermissions, setNewPermissions)
                                }
                                className="p-1 rounded bg-[#132C54] text-sky-200 disabled:opacity-30 hover:text-white cursor-pointer"
                              >
                                <ArrowDown className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {createError && (
                    <div className="p-2.5 rounded-xl bg-red-950/60 border border-red-500/50 text-red-300 text-xs font-bold">
                      {createError}
                    </div>
                  )}

                  {createSuccess && (
                    <div className="p-2.5 rounded-xl bg-emerald-950/60 border border-emerald-500/50 text-emerald-300 text-xs font-bold flex items-center gap-2">
                      <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>{createSuccess}</span>
                    </div>
                  )}

                  <button
                    type="submit"
                    className="w-full py-2.5 sm:py-3.5 rounded-xl sm:rounded-2xl bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-slate-950 font-black text-xs sm:text-sm shadow-lg shadow-emerald-500/25 flex items-center justify-center gap-2 cursor-pointer active:scale-95 transition-all"
                  >
                    <UserPlus className="w-4 h-4 stroke-[2.5]" />
                    <span>Admin Kabinetini Yaratish</span>
                  </button>
                </form>
              </div>

              {/* O'NG TOMON: YARATILGAN ADMIN KABINETLAR RO'YXATI */}
              <div className="lg:col-span-7 bg-[#0A1931] border-2 border-[#1E3A6D] rounded-2xl sm:rounded-3xl p-3 sm:p-6 shadow-2xl space-y-3 sm:space-y-4">
                <div className="flex items-center justify-between pb-2.5 border-b border-[#1E3A6D]">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 sm:w-11 sm:h-11 rounded-xl sm:rounded-2xl bg-[#FFB800]/20 border border-[#FFB800] text-[#FFB800] flex items-center justify-center shrink-0">
                      <Layers className="w-4 h-4 sm:w-5 sm:h-5 stroke-[2.3]" />
                    </div>
                    <h2 className="text-sm sm:text-lg font-black text-white">
                      Yaratilgan Admin Kabinetlar ({subAdmins.length})
                    </h2>
                  </div>
                </div>

                {subAdmins.length === 0 ? (
                  <div className="p-5 sm:p-8 rounded-2xl bg-[#071326] border border-dashed border-[#254B85] text-center space-y-2">
                    <ShieldAlert className="w-8 h-8 text-[#FFB800] mx-auto opacity-80" />
                    <div className="text-xs sm:text-sm font-black text-white">
                      Hozircha qo‘shimcha Admin kabinetlari yaratilmagan
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-2 sm:gap-3.5">
                    {subAdmins.map((adminAcc) => {
                      const isPassShown = Boolean(visiblePasswords[adminAcc.id]);
                      return (
                        <div
                          key={adminAcc.id}
                          className="p-2.5 sm:p-4 rounded-xl sm:rounded-2xl bg-[#071326] border-2 border-[#1E3A6D] hover:border-[#FFB800]/70 transition-all space-y-2 sm:space-y-3 shadow-lg"
                        >
                          <div className="flex items-center justify-between gap-2 pb-1.5 sm:pb-2.5 border-b border-[#1E3A6D]">
                            <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 flex-wrap">
                              <h3 className="text-xs sm:text-base font-black text-white truncate">
                                {adminAcc.cabinetName}
                              </h3>
                              <span className="px-2 py-0.5 rounded-full text-[9px] sm:text-[10px] font-mono font-bold bg-amber-500/20 text-[#FFB800] border border-[#FFB800]/40 shrink-0">
                                {adminAcc.permissions.length} ta bo‘lim
                              </span>
                              {adminAcc.phone && (
                                <span className="text-[10px] font-mono text-amber-300 flex items-center gap-1 shrink-0">
                                  <Phone className="w-3 h-3 text-amber-400" />
                                  {adminAcc.phone}
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-1 sm:gap-2 shrink-0">
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingSubAdmin(adminAcc);
                                  setEditSubName(adminAcc.cabinetName);
                                  setEditSubLogin(adminAcc.login);
                                  setEditSubPassword(adminAcc.password);
                                  setEditSubPhone(adminAcc.phone ? formatUzPhone(adminAcc.phone) : '+998 ');
                                  setEditSubPermissions([...adminAcc.permissions]);
                                  setEditSubError(null);
                                }}
                                className="px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg sm:rounded-xl bg-[#132C54] hover:bg-[#1B3B6F] text-amber-300 border border-amber-400/40 text-[10px] sm:text-xs font-bold flex items-center gap-1 cursor-pointer"
                              >
                                <Pencil className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                                <span>Tahrirlash</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => handleDeleteSubAdmin(adminAcc.id)}
                                className="p-1.5 sm:p-2 rounded-lg sm:rounded-xl bg-red-600/15 hover:bg-red-600 text-red-400 hover:text-white border border-red-500/40 text-xs font-bold cursor-pointer transition-colors"
                                title="Kabinetni o‘chirish"
                              >
                                <Trash2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                              </button>

                              <button
                                type="button"
                                onClick={() => onEnterSubAdminCabinet(adminAcc)}
                                className="px-2.5 sm:px-3.5 py-1 sm:py-1.5 rounded-lg sm:rounded-xl bg-gradient-to-r from-[#FFB800] to-amber-500 hover:from-amber-400 hover:to-amber-500 text-[#071326] text-[10px] sm:text-xs font-black flex items-center gap-1 cursor-pointer shadow-md active:scale-95"
                              >
                                <span>Kirish</span>
                                <ArrowRight className="w-3 h-3 sm:w-3.5 sm:h-3.5 stroke-[2.5]" />
                              </button>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <div className="px-2.5 py-1.5 sm:p-2.5 rounded-lg sm:rounded-xl bg-[#0A1931] border border-[#1E3A6D] flex items-center justify-between">
                              <div className="min-w-0">
                                <span className="text-[9px] sm:text-[10px] text-sky-300 block">Login:</span>
                                <span className="font-mono font-black text-[#FFB800] text-xs sm:text-sm block truncate">
                                  {adminAcc.login}
                                </span>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleCopyText(`login-${adminAcc.id}`, adminAcc.login)}
                                className="text-[10px] text-sky-300 hover:text-white flex items-center gap-1 cursor-pointer shrink-0"
                              >
                                <Copy className="w-3 h-3" />
                              </button>
                            </div>

                            <div className="px-2.5 py-1.5 sm:p-2.5 rounded-lg sm:rounded-xl bg-[#0A1931] border border-[#1E3A6D] flex items-center justify-between">
                              <div className="min-w-0">
                                <span className="text-[9px] sm:text-[10px] text-sky-300 block">Parol:</span>
                                <span className="font-mono font-black text-emerald-400 text-xs sm:text-sm block truncate">
                                  {isPassShown ? adminAcc.password : '••••••••'}
                                </span>
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setVisiblePasswords((prev) => ({
                                      ...prev,
                                      [adminAcc.id]: !prev[adminAcc.id],
                                    }))
                                  }
                                  className="text-sky-300 hover:text-white cursor-pointer"
                                >
                                  {isPassShown ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleCopyText(`pass-${adminAcc.id}`, adminAcc.password)}
                                  className="text-[10px] text-sky-300 hover:text-white flex items-center gap-1 cursor-pointer"
                                >
                                  <Copy className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-1 sm:gap-1.5">
                            {adminAcc.permissions.map((perm, idx) => (
                              <span
                                key={perm}
                                className="inline-flex items-center gap-1 px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-lg bg-[#0A1931] border border-[#FFB800]/50 text-[10px] sm:text-xs font-bold text-white"
                              >
                                <span className="w-4 h-4 rounded bg-[#FFB800] text-[#071326] font-mono font-black text-[9px] flex items-center justify-center">
                                  {idx + 1}
                                </span>
                                <span>{getPermissionLabel(perm)}</span>
                              </span>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* =====================================================================
            TAB 2: B2B VA B2C TA'MINOTCHI KABINETLAR RO'YXATI, QO'SHISH VA TO'G'RIDAN-TO'G'RI O'TISH
            (Mobilda Ustun shaklda va bitta ekranda 4 ta kabinet sig'adigan ixcham dizayn)
            ===================================================================== */}
        {activeBunkerSection === 'supplier_cabinets' && (
          <section className="bg-[#0A1931] border-2 border-[#1E3A6D] rounded-2xl sm:rounded-3xl p-2.5 sm:p-6 shadow-2xl space-y-2.5 sm:space-y-4 animate-fadeIn">
            <div className="flex items-center justify-between gap-2 pb-2 sm:pb-4 border-b border-[#1E3A6D]">
              <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                <div className="w-8 h-8 sm:w-11 sm:h-11 rounded-xl sm:rounded-2xl bg-sky-500/20 border border-sky-400 text-sky-400 flex items-center justify-center shrink-0">
                  <Building className="w-4 h-4 sm:w-5 sm:h-5" />
                </div>
                <h2 className="text-xs sm:text-xl font-black text-white truncate">
                  Ta'minotchi Kabinetlar Ro‘yxati ({filteredSuppliers.length})
                </h2>
              </div>

              <button
                type="button"
                onClick={() => {
                  setNewSuppCabinetType('manufacturer');
                  setNewSuppStir('');
                  setNewSuppStirError(null);
                  setNewSuppCompanyInfo(null);
                  setNewSuppCompany('');
                  setNewSuppName('');
                  setNewSuppSurname('');
                  setNewSuppPhone('+998 ');
                  setNewSuppRegion('');
                  setNewSuppDistrict('');
                  setIsAddSupplierOpen(true);
                }}
                className="btn-industrial-yellow flex items-center justify-center gap-1.5 px-3 sm:px-5 py-1.5 sm:py-2.5 rounded-xl text-[11px] sm:text-sm font-black cursor-pointer shadow-lg active:scale-95 shrink-0"
              >
                <UserPlus className="w-3.5 h-3.5 sm:w-4 sm:h-4 stroke-[2.5]" />
                <span>Kabinet Qo‘shish</span>
              </button>
            </div>

            {/* Filtr va Qidiruv */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 sm:gap-3">
              <div className="grid grid-cols-3 sm:flex items-center gap-1.5 sm:gap-2">
                <button
                  type="button"
                  onClick={() => setSupplierFilterTab('all')}
                  className={`px-2 sm:px-4 py-1.5 sm:py-2 rounded-lg sm:rounded-xl text-[10px] sm:text-xs font-black cursor-pointer border transition-all truncate ${
                    supplierFilterTab === 'all'
                      ? 'bg-[#FFB800] text-[#071326] border-amber-300'
                      : 'bg-[#071326] text-sky-200 border-[#1E3A6D] hover:border-[#FFB800]'
                  }`}
                >
                  Barchasi ({suppliers.length})
                </button>
                <button
                  type="button"
                  onClick={() => setSupplierFilterTab('manufacturer')}
                  className={`px-2 sm:px-4 py-1.5 sm:py-2 rounded-lg sm:rounded-xl text-[10px] sm:text-xs font-black cursor-pointer border transition-all truncate ${
                    supplierFilterTab === 'manufacturer'
                      ? 'bg-purple-500 text-white border-purple-300'
                      : 'bg-[#071326] text-sky-200 border-[#1E3A6D] hover:border-purple-400'
                  }`}
                >
                  B2B ({suppliers.filter((s) => s.cabinetType === 'manufacturer').length})
                </button>
                <button
                  type="button"
                  onClick={() => setSupplierFilterTab('partner')}
                  className={`px-2 sm:px-4 py-1.5 sm:py-2 rounded-lg sm:rounded-xl text-[10px] sm:text-xs font-black cursor-pointer border transition-all truncate ${
                    supplierFilterTab === 'partner'
                      ? 'bg-emerald-500 text-slate-950 border-emerald-300'
                      : 'bg-[#071326] text-sky-200 border-[#1E3A6D] hover:border-emerald-400'
                  }`}
                >
                  B2C ({suppliers.filter((s) => (s.cabinetType || 'partner') === 'partner').length})
                </button>
              </div>

              <div className="relative flex-1 max-w-md">
                <Search className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#FFB800] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={supplierSearch}
                  onChange={(e) => setSupplierSearch(e.target.value)}
                  placeholder="STIR, korxona yoki login..."
                  className="w-full pl-8 sm:pl-10 pr-3 py-1.5 sm:py-2 rounded-lg sm:rounded-xl bg-[#071326] border border-[#1E3A6D] text-white text-xs focus:outline-none focus:border-[#FFB800]"
                />
              </div>
            </div>

            {filteredSuppliers.length === 0 ? (
              <div className="p-6 sm:p-10 rounded-2xl bg-[#071326] border border-dashed border-[#254B85] text-center space-y-2">
                <Building className="w-8 h-8 sm:w-10 sm:h-10 text-sky-400 mx-auto opacity-80" />
                <div className="text-xs sm:text-sm font-black text-white">
                  Ta'minotchi kabinetlar topilmadi
                </div>
              </div>
            ) : (
              /* Mobilda Ustun shaklda (grid-cols-1) va bitta ekranda 4 ta kabinet sig'adigan ixcham kartalar */
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-4">
                {filteredSuppliers.map((supp) => {
                  const isB2B = supp.cabinetType === 'manufacturer';
                  const isPassVisible = Boolean(visiblePasswords[`supp-${supp.id}`]);
                  return (
                    <div
                      key={supp.id}
                      className="p-2.5 sm:p-4 rounded-xl sm:rounded-2xl bg-[#071326] border-2 border-[#1E3A6D] hover:border-[#FFB800] transition-all flex flex-col justify-between gap-1.5 sm:gap-3 shadow-lg"
                    >
                      <div className="space-y-1 sm:space-y-2">
                        {/* 1-qator: B2B/B2C badge + Korxona nomi + STIR */}
                        <div className="flex items-center justify-between gap-1.5">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span
                              className={`px-1.5 sm:px-2.5 py-0.5 rounded text-[9px] sm:text-[10px] font-mono font-black uppercase shrink-0 ${
                                isB2B
                                  ? 'bg-purple-500/20 text-purple-300 border border-purple-400/40'
                                  : 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/40'
                              }`}
                            >
                              {isB2B ? 'B2B' : 'B2C'}
                            </span>
                            <h4 className="text-xs sm:text-sm font-black text-white truncate">
                              {supp.companyName}
                            </h4>
                          </div>
                          {supp.inn && (
                            <span className="text-[10px] sm:text-[11px] font-mono text-sky-300 font-bold shrink-0">
                              STIR: {supp.inn}
                            </span>
                          )}
                        </div>

                        {/* 2-qator: Rahbar, Hudud va Telefon (mobilda 1 qatorda ixcham) */}
                        <div className="flex items-center flex-wrap gap-x-2.5 gap-y-0.5 text-[10px] sm:text-[11px] text-sky-200">
                          <span className="inline-flex items-center gap-1 truncate max-w-[150px] sm:max-w-none">
                            <Users className="w-3 h-3 text-[#FFB800] shrink-0" />
                            <span className="truncate">{supp.name} {supp.surname || ''}</span>
                          </span>
                          <span className="inline-flex items-center gap-1 truncate">
                            <MapPin className="w-3 h-3 text-sky-400 shrink-0" />
                            <span className="truncate">{supp.region}</span>
                          </span>
                          {supp.phone && (
                            <span className="inline-flex items-center gap-1 font-mono text-amber-300 shrink-0">
                              <Phone className="w-3 h-3 text-amber-400 shrink-0" />
                              <span>{supp.phone}</span>
                            </span>
                          )}
                        </div>

                        {/* 3-qator: Login & Parol + Tugmalar */}
                        <div className="px-2.5 py-1.5 sm:p-2.5 rounded-lg sm:rounded-xl bg-[#0A1931] border border-[#1E3A6D] grid grid-cols-2 gap-2 text-[10px] sm:text-[11px]">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="text-[9px] sm:text-[10px] text-sky-300 shrink-0">Login:</span>
                            <span className="font-mono font-black text-[#FFB800] truncate">{supp.login}</span>
                          </div>
                          <div className="flex items-center justify-between gap-1 min-w-0">
                            <div className="flex items-center gap-1 min-w-0">
                              <span className="text-[9px] sm:text-[10px] text-sky-300 shrink-0">Parol:</span>
                              <span className="font-mono font-black text-emerald-400 truncate">
                                {isPassVisible ? supp.password || '—' : '••••••'}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() =>
                                setVisiblePasswords((prev) => ({
                                  ...prev,
                                  [`supp-${supp.id}`]: !prev[`supp-${supp.id}`],
                                }))
                              }
                              className="text-sky-300 hover:text-white cursor-pointer shrink-0"
                            >
                              {isPassVisible ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* 4-qator: Amallar (O'chirish tugmasi Tahrirlash ichkarisida joylashgan) */}
                      <div className="grid grid-cols-2 gap-1.5 sm:gap-2">
                        <button
                          type="button"
                          onClick={() => handleOpenEditSupplier(supp)}
                          className="py-1.5 sm:py-2 px-2 sm:px-3 rounded-lg sm:rounded-xl bg-[#132C54] hover:bg-[#1B3B6F] text-amber-300 border border-amber-400/40 font-bold text-[10px] sm:text-xs flex items-center justify-center gap-1 cursor-pointer transition-all active:scale-95"
                        >
                          <Pencil className="w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0" />
                          <span className="truncate">Tahrirlash</span>
                        </button>

                        {onEnterSupplierCabinet && (
                          <button
                            type="button"
                            onClick={() => handleRequestEnterSupplier(supp)}
                            className="py-1.5 sm:py-2 px-2 sm:px-4 rounded-lg sm:rounded-xl bg-gradient-to-r from-[#FFB800] to-amber-500 hover:from-amber-400 hover:to-amber-500 text-[#071326] font-black text-[10px] sm:text-xs flex items-center justify-center gap-1 sm:gap-2 cursor-pointer transition-all shadow-md active:scale-95"
                          >
                            <ExternalLink className="w-3 h-3 sm:w-3.5 sm:h-3.5 stroke-[2.5] shrink-0" />
                            <span className="truncate">Kabinetga o‘tish</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}
      </main>

      {/* =========================================================================
          MODAL 1: QO'SHILGAN ADMIN KABINETINI TAHRIRLASH (FAQAT BUNKER ADMIN UCHUN)
          ========================================================================= */}
      {editingSubAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="bg-[#0A1931] border-2 border-[#FFB800] rounded-2xl sm:rounded-3xl max-w-xl w-full p-4 sm:p-6 space-y-3.5 sm:space-y-5 shadow-2xl max-h-[92vh] overflow-y-auto relative">
            <button
              type="button"
              onClick={() => setEditingSubAdmin(null)}
              className="absolute top-3.5 right-3.5 p-2 rounded-xl bg-[#071326] text-sky-200 hover:text-white border border-[#1E3A6D] cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-2.5 pr-8">
              <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl sm:rounded-2xl bg-[#FFB800]/20 border border-[#FFB800] text-[#FFB800] flex items-center justify-center shrink-0">
                <Pencil className="w-4 h-4 sm:w-5 sm:h-5" />
              </div>
              <div>
                <h3 className="text-sm sm:text-lg font-black text-white">
                  Admin Kabinetni Tahrirlash
                </h3>
                <p className="text-[11px] sm:text-xs text-sky-200">
                  «{editingSubAdmin.cabinetName}»
                </p>
              </div>
            </div>

            <form onSubmit={handleSaveEditSubAdmin} className="space-y-3 sm:space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3">
                <div className="space-y-1">
                  <label className="font-bold text-white block">Kabinet Nomi:</label>
                  <input
                    type="text"
                    required
                    value={editSubName}
                    onChange={(e) => setEditSubName(e.target.value)}
                    className="w-full px-3 py-2 sm:py-2.5 rounded-xl bg-[#071326] border border-[#254B85] text-white text-xs focus:outline-none focus:border-[#FFB800]"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-amber-300 flex items-center gap-1">
                    <Phone className="w-3 h-3 text-[#FFB800]" />
                    <span>Kirish Telefon Raqami:</span>
                  </label>
                  <input
                    type="tel"
                    value={editSubPhone}
                    onChange={(e) => setEditSubPhone(formatUzPhone(e.target.value))}
                    placeholder="+998 90 123 45 67"
                    className="w-full px-3 py-2 sm:py-2.5 rounded-xl bg-[#071326] border border-[#254B85] text-white font-mono font-bold text-xs focus:outline-none focus:border-[#FFB800]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
                <div className="space-y-1">
                  <label className="font-bold text-white block">Login:</label>
                  <input
                    type="text"
                    required
                    value={editSubLogin}
                    onChange={(e) => setEditSubLogin(e.target.value)}
                    className="w-full px-3 py-2 sm:py-2.5 rounded-xl bg-[#071326] border border-[#254B85] text-white font-mono font-bold text-xs focus:outline-none focus:border-[#FFB800]"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-white block">Parol:</label>
                  <div className="relative">
                    <input
                      type={showEditSubPass ? 'text' : 'password'}
                      required
                      value={editSubPassword}
                      onChange={(e) => setEditSubPassword(e.target.value)}
                      className="w-full pl-3 pr-8 py-2 sm:py-2.5 rounded-xl bg-[#071326] border border-[#254B85] text-white font-mono font-bold text-xs focus:outline-none focus:border-[#FFB800]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowEditSubPass(!showEditSubPass)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-sky-300 hover:text-white cursor-pointer"
                    >
                      {showEditSubPass ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="font-black text-[#FFB800] uppercase tracking-wider block text-[11px]">
                  Huquqlar (Bo‘limlar) va Ketma-ketlik:
                </label>
                <div className="space-y-1.5">
                  {ADMIN_PERMISSION_META.map((item) => {
                    const orderIdx = editSubPermissions.indexOf(item.id);
                    const isAdded = orderIdx !== -1;
                    return (
                      <div
                        key={item.id}
                        className={`p-2 sm:p-2.5 rounded-xl border flex items-center justify-between gap-2 ${
                          isAdded
                            ? 'bg-[#132C54] border-[#FFB800]'
                            : 'bg-[#071326] border-[#1E3A6D]'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          {isAdded && (
                            <span className="w-5 h-5 rounded bg-[#FFB800] text-[#071326] font-mono font-black text-[10px] flex items-center justify-center shrink-0">
                              {orderIdx + 1}
                            </span>
                          )}
                          <span className="font-bold text-white text-[11px] sm:text-xs truncate">{item.label}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            handleTogglePermission(
                              item.id,
                              editSubPermissions,
                              setEditSubPermissions
                            )
                          }
                          className={`px-2.5 py-1 rounded-lg font-black text-[10px] sm:text-[11px] cursor-pointer shrink-0 ${
                            isAdded
                              ? 'bg-red-600/20 text-red-300 border border-red-500/40'
                              : 'bg-[#FFB800] text-[#071326]'
                          }`}
                        >
                          {isAdded ? 'Olib tashlash' : '+ Qo‘shish'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              {editSubPermissions.length > 0 && (
                <div className="p-2.5 rounded-xl bg-[#071326] border border-emerald-500/40 space-y-1">
                  <span className="text-[10px] font-bold text-emerald-400 block">
                    Ishlash tartibi:
                  </span>
                  {editSubPermissions.map((perm, idx) => (
                    <div
                      key={perm}
                      className="flex items-center justify-between px-2.5 py-1 rounded-lg bg-[#0A1931] border border-[#1E3A6D]"
                    >
                      <span className="font-bold text-white text-[11px]">
                        {idx + 1}. {getPermissionLabel(perm)}
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          disabled={idx === 0}
                          onClick={() =>
                            handleMovePermission(
                              idx,
                              'up',
                              editSubPermissions,
                              setEditSubPermissions
                            )
                          }
                          className="p-1 rounded bg-[#132C54] text-sky-200 disabled:opacity-30 cursor-pointer"
                        >
                          <ArrowUp className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          disabled={idx === editSubPermissions.length - 1}
                          onClick={() =>
                            handleMovePermission(
                              idx,
                              'down',
                              editSubPermissions,
                              setEditSubPermissions
                            )
                          }
                          className="p-1 rounded bg-[#132C54] text-sky-200 disabled:opacity-30 cursor-pointer"
                        >
                          <ArrowDown className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {editSubError && (
                <p className="text-red-400 font-bold text-xs">{editSubError}</p>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#1E3A6D]">
                <button
                  type="button"
                  onClick={() => setEditingSubAdmin(null)}
                  className="px-3.5 py-2 rounded-xl bg-[#071326] text-sky-200 border border-[#1E3A6D] font-bold cursor-pointer"
                >
                  Bekor qilish
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-[#FFB800] hover:bg-amber-400 text-[#071326] font-black flex items-center gap-1.5 cursor-pointer shadow-md"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>O‘zgarishlarni Saqlash</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL 2: TA'MINOTCHI KABINET QO'SHISH (FAQAT BUNKER ADMIN UCHUN)
          ========================================================================= */}
      {isAddSupplierOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4 bg-black/85 backdrop-blur-md animate-fadeIn">
          <div className="bg-[#222528] border-2 border-[#FFB800] rounded-2xl max-w-4xl w-full p-3.5 sm:p-8 space-y-3.5 sm:space-y-6 shadow-2xl relative max-h-[94vh] overflow-y-auto text-[#F5F5F2]">
            <button
              type="button"
              onClick={() => setIsAddSupplierOpen(false)}
              className="absolute top-3.5 right-3.5 sm:top-5 sm:right-5 text-slate-400 hover:text-white p-1.5 sm:p-2 rounded-xl bg-[#292C2F] transition-colors cursor-pointer"
            >
              <X className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>

            <div className="flex items-center gap-2.5 sm:gap-3 pr-8">
              <div className="p-2 sm:p-3 rounded-xl sm:rounded-2xl bg-amber-500/20 text-amber-400 border border-[#FFB800]/40 shrink-0">
                <UserPlus className="w-5 h-5 sm:w-6 sm:h-6" />
              </div>
              <div>
                <h2 className="text-base sm:text-2xl font-black text-white">Kabinet Qo‘shish</h2>
                <p className="text-[11px] sm:text-sm text-[#B8B8B3]">
                  Kabinet turini tanlang: B2B yoki B2C
                </p>
              </div>
            </div>

            <form onSubmit={handleAddSupplierSubmit} className="space-y-3 sm:space-y-4 text-xs">
              <div className="space-y-1.5">
                <label className="text-slate-200 font-bold block">Kabinet turini tanlang:</label>
                <div className="grid grid-cols-2 gap-2 sm:gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setNewSuppCabinetType('manufacturer');
                      const clean = newSuppStir.replace(/\D/g, '');
                      if (clean.length === 9) {
                        if (isStirTakenInCabinetType(clean, 'manufacturer')) {
                          setNewSuppCompanyInfo(null);
                          setNewSuppCompany('');
                          setNewSuppName('');
                          setNewSuppSurname('');
                          setNewSuppRegion('');
                          setNewSuppDistrict('');
                          setNewSuppStirError(null);
                        } else if (!newSuppCompanyInfo) {
                          handleStirChangeAndLookup(clean, false, 'manufacturer');
                        }
                      }
                    }}
                    className={`p-2.5 sm:p-4 rounded-xl border-2 text-left transition-all cursor-pointer flex items-center gap-2 sm:gap-3 ${
                      newSuppCabinetType === 'manufacturer'
                        ? 'bg-[#FFB800] text-[#151719] border-[#FFC928] font-black shadow-lg'
                        : 'bg-[#151719] text-slate-200 border-[#51504A] hover:border-[#FFB800]/60'
                    }`}
                  >
                    <Building className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" />
                    <div>
                      <span className="block text-xs sm:text-base font-black">B2B</span>
                      <span className={`hidden sm:block text-[11px] font-semibold ${newSuppCabinetType === 'manufacturer' ? 'text-[#151719]/80' : 'text-[#B8B8B3]'}`}>
                        Hisobotlar • Mahsulotlar • Mijozlar • B2B buyurtmalar • Amaliyotlar
                      </span>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setNewSuppCabinetType('partner');
                      const clean = newSuppStir.replace(/\D/g, '');
                      if (clean.length === 9) {
                        if (isStirTakenInCabinetType(clean, 'partner')) {
                          setNewSuppCompanyInfo(null);
                          setNewSuppCompany('');
                          setNewSuppName('');
                          setNewSuppSurname('');
                          setNewSuppRegion('');
                          setNewSuppDistrict('');
                          setNewSuppStirError(null);
                        } else if (!newSuppCompanyInfo) {
                          handleStirChangeAndLookup(clean, false, 'partner');
                        }
                      }
                    }}
                    className={`p-2.5 sm:p-4 rounded-xl border-2 text-left transition-all cursor-pointer flex items-center gap-2 sm:gap-3 ${
                      newSuppCabinetType === 'partner'
                        ? 'bg-[#FFB800] text-[#151719] border-[#FFC928] font-black shadow-lg'
                        : 'bg-[#151719] text-slate-200 border-[#51504A] hover:border-[#FFB800]/60'
                    }`}
                  >
                    <Users className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" />
                    <div>
                      <span className="block text-xs sm:text-base font-black">B2C</span>
                      <span className={`hidden sm:block text-[11px] font-semibold ${newSuppCabinetType === 'partner' ? 'text-[#151719]/80' : 'text-[#B8B8B3]'}`}>
                        Hisobotlar • Mahsulotlar • CRM • Mijozlar • B2B ta'minotchilar
                      </span>
                    </div>
                  </button>
                </div>
              </div>

              {/* STIR Tekshirish */}
              <div className="p-3 sm:p-4 rounded-2xl bg-[#151719] border border-[#FFB800]/40 space-y-2.5">
                <div className="flex items-center justify-between">
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

                <div className="flex gap-2">
                  <input
                    type="text"
                    required
                    maxLength={9}
                    value={newSuppStir}
                    onChange={(e) => handleStirChangeAndLookup(e.target.value)}
                    placeholder="9 xonali STIR"
                    className="flex-1 px-3 py-2 sm:px-3.5 sm:py-2.5 bg-[#222528] border border-[#51504A] focus:border-[#FFB800] rounded-xl text-white text-xs font-mono font-bold tracking-wider focus:outline-none"
                  />
                  <button
                    type="button"
                    disabled={newSuppStirLoading || newSuppStir.replace(/\D/g, '').length !== 9}
                    onClick={() => handleStirChangeAndLookup(newSuppStir)}
                    className="px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl bg-[#FFB800] hover:bg-amber-400 disabled:opacity-40 text-slate-950 font-black text-xs transition-all cursor-pointer shrink-0 flex items-center justify-center gap-1.5"
                  >
                    <Search className="w-3.5 h-3.5" />
                    <span>STIR Tekshirish</span>
                  </button>
                </div>

                {newSuppStirError && (
                  <p className="text-red-400 text-[11px] font-bold">{newSuppStirError}</p>
                )}

                {newSuppCompanyInfo && (
                  <div className="p-2.5 sm:p-3.5 rounded-xl bg-[#222528] border border-emerald-500/40 space-y-1.5 text-xs">
                    <div className="font-black text-emerald-400 text-xs sm:text-sm">
                      {newSuppCompanyInfo.companyName}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-[11px] text-slate-300">
                      <div>
                        <span className="text-slate-400">Rahbar: </span>
                        <strong className="text-white">{newSuppCompanyInfo.director}</strong>
                      </div>
                      <div>
                        <span className="text-slate-400">Hudud: </span>
                        <strong className="text-white">
                          {newSuppCompanyInfo.locality || newSuppCompanyInfo.region || newSuppRegion}
                        </strong>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Login, Parol va Kirish uchun Telefon Raqami */}
              <div className="p-3 sm:p-4 rounded-2xl bg-[#151719] border border-[#51504A] space-y-2.5">
                <span className="text-[11px] font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                  <KeyRound className="w-3.5 h-3.5" />
                  Kabinetga Kirish Ma'lumotlari
                </span>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  <div className="space-y-1">
                    <label className="text-slate-300 font-medium text-[11px] sm:text-xs">Kabinet Logini:</label>
                    <input
                      type="text"
                      required
                      value={newSuppLogin}
                      onChange={(e) => setNewSuppLogin(e.target.value)}
                      placeholder="Login"
                      className="w-full px-3 py-2 sm:px-3.5 sm:py-2.5 bg-[#222528] border border-[#51504A] rounded-xl text-white text-xs font-mono focus:outline-none focus:border-[#FFB800]"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-slate-300 font-medium text-[11px] sm:text-xs">Kirish Paroli:</label>
                    <input
                      type="text"
                      required
                      value={newSuppPassword}
                      onChange={(e) => setNewSuppPassword(e.target.value)}
                      placeholder="Parol"
                      className="w-full px-3 py-2 sm:px-3.5 sm:py-2.5 bg-[#222528] border border-[#51504A] rounded-xl text-white text-xs font-mono focus:outline-none focus:border-[#FFB800]"
                    />
                  </div>

                  <div className="space-y-1 col-span-2 sm:col-span-1">
                    <label className="text-emerald-300 font-bold text-[11px] sm:text-xs flex items-center gap-1">
                      <Phone className="w-3 h-3 text-emerald-400" />
                      <span>Kirish Telefon Raqami:</span>
                    </label>
                    <input
                      type="tel"
                      required
                      value={newSuppPhone}
                      onChange={(e) => setNewSuppPhone(formatUzPhone(e.target.value))}
                      placeholder="+998 90 123 45 67"
                      className="w-full px-3 py-2 sm:px-3.5 sm:py-2.5 bg-[#222528] border border-emerald-500/40 rounded-xl text-white text-xs font-mono font-bold focus:outline-none focus:border-emerald-400"
                    />
                  </div>
                </div>
              </div>

              {/* Kategoriya */}
              <div className="p-3 sm:p-3.5 rounded-2xl bg-[#151719] border border-[#51504A] space-y-2">
                <label className="text-slate-200 font-bold flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-amber-400" />
                  Mahsulot Turi (Kategoriya):
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {productTypes.length > 0 && (
                    <select
                      value={productTypes.some((pt) => pt.label.toLowerCase() === newSuppCategory.trim().toLowerCase()) ? newSuppCategory : ''}
                      onChange={(e) => {
                        if (e.target.value) setNewSuppCategory(e.target.value);
                      }}
                      className="w-full px-3 py-2 sm:px-3.5 sm:py-2.5 bg-[#222528] border border-[#51504A] rounded-xl text-white text-xs focus:outline-none focus:border-[#FFB800] cursor-pointer"
                    >
                      <option value="">-- Mavjud kategoriyani tanlang --</option>
                      {productTypes.map((pt) => (
                        <option key={pt.id} value={pt.label}>
                          {pt.label}
                        </option>
                      ))}
                    </select>
                  )}
                  <input
                    type="text"
                    value={newSuppCategory}
                    onChange={(e) => setNewSuppCategory(e.target.value)}
                    placeholder="Kategoriya nomi"
                    className="w-full px-3 py-2 sm:px-3.5 sm:py-2.5 bg-[#222528] border border-[#51504A] rounded-xl text-white text-xs focus:outline-none focus:border-[#FFB800]"
                  />
                </div>
              </div>

              {/* Shartnoma Foizi + Umumiydan yoki Foydadan (Savdodan) */}
              <div className="p-3 sm:p-3.5 rounded-2xl bg-[#151719] border border-[#51504A] space-y-2.5">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <label className="text-slate-200 font-bold flex items-center gap-1.5 text-xs">
                    <DollarSign className="w-3.5 h-3.5 text-amber-400" />
                    <span>Shartnoma Foizi:</span>
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
                        if (!isNaN(val) && val > 0) setNewSuppCommission(val);
                      }}
                      className="w-16 sm:w-20 px-2 py-1 bg-[#222528] border border-[#FFB800] rounded-lg text-amber-400 font-mono font-black text-xs focus:outline-none text-center"
                    />
                    <span className="px-2 py-1 rounded-lg bg-amber-500/20 text-amber-400 border border-[#FFB800]/40 font-mono font-black text-[11px] sm:text-xs">
                      {newSuppCommissionBasis === 'profit' ? 'Foydadan' : 'Umumiydan'} {newSuppCommission}%
                    </span>
                  </div>
                </div>

                {/* Hisoblash turi: Umumiydan yoki Foydadan (Savdodan) */}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setNewSuppCommissionBasis('total')}
                    className={`p-2 sm:p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                      newSuppCommissionBasis === 'total'
                        ? 'bg-[#FFB800]/20 border-[#FFB800] text-white'
                        : 'bg-[#222528] border-[#51504A] text-[#B8B8B3] hover:border-[#FFB800]/50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-black text-[11px] sm:text-xs text-amber-400">Umumiydan ({newSuppCommission}%)</span>
                      {newSuppCommissionBasis === 'total' && <Check className="w-3.5 h-3.5 text-amber-400" />}
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setNewSuppCommissionBasis('profit')}
                    className={`p-2 sm:p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                      newSuppCommissionBasis === 'profit'
                        ? 'bg-emerald-500/20 border-emerald-400 text-white'
                        : 'bg-[#222528] border-[#51504A] text-[#B8B8B3] hover:border-emerald-400/50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-black text-[11px] sm:text-xs text-emerald-400">Foydadan ({newSuppCommission}%)</span>
                      {newSuppCommissionBasis === 'profit' && <Check className="w-3.5 h-3.5 text-emerald-400" />}
                    </div>
                  </button>
                </div>

                <div className="grid grid-cols-6 sm:grid-cols-12 gap-1.5">
                  {[0.1, 0.5, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((pct) => (
                    <button
                      key={pct}
                      type="button"
                      onClick={() => setNewSuppCommission(pct)}
                      className={`py-1.5 sm:py-2 rounded-xl font-mono font-black text-[11px] sm:text-xs border transition-all cursor-pointer ${
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

              {newSuppContractError && (
                <div className="p-2.5 rounded-xl bg-red-500/20 text-red-300 border border-red-500/40 text-xs font-bold">
                  {newSuppContractError}
                </div>
              )}

              {supplierAddSuccess && (
                <div className="p-3 rounded-2xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs flex items-center gap-2 font-bold">
                  <Check className="w-4 h-4 text-emerald-400" />
                  <span>Ta'minotchi kabineti muvaffaqiyatli qo‘shildi!</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2.5 pt-2.5 border-t border-[#51504A]">
                <button
                  type="button"
                  onClick={() => setIsAddSupplierOpen(false)}
                  className="px-4 py-2 sm:py-2.5 rounded-xl bg-[#292C2F] hover:bg-[#222528] text-slate-300 text-xs font-bold transition-colors cursor-pointer border border-[#51504A]"
                >
                  Bekor qilish
                </button>
                <button
                  type="submit"
                  disabled={isStirTakenInCabinetType(newSuppStir, newSuppCabinetType)}
                  className="flex items-center gap-1.5 px-5 py-2 sm:py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 disabled:opacity-40 disabled:cursor-not-allowed text-slate-950 font-black text-xs shadow-lg shadow-amber-500/25 active:scale-95 transition-all cursor-pointer"
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
          MODAL: TA'MINOTCHI KABINETINI TAHRIRLASH (Parol asosida)
          ========================================================================= */}
      {editingSupplier && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4 bg-black/85 backdrop-blur-md animate-fadeIn">
          <div className="bg-[#0A1931] border-2 border-[#FFB800] rounded-2xl sm:rounded-3xl max-w-2xl w-full p-3.5 sm:p-7 space-y-3.5 sm:space-y-5 shadow-2xl relative max-h-[94vh] overflow-y-auto text-[#F5F5F2]">
            <button
              type="button"
              onClick={() => setEditingSupplier(null)}
              className="absolute top-3.5 right-3.5 sm:top-4 sm:right-4 p-1.5 sm:p-2 rounded-xl bg-[#071326] text-sky-200 hover:text-white border border-[#1E3A6D] cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-2.5 sm:gap-3 pr-8">
              <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl sm:rounded-2xl bg-[#FFB800]/20 border border-[#FFB800] text-[#FFB800] flex items-center justify-center shrink-0">
                <Pencil className="w-4 h-4 sm:w-5 sm:h-5" />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm sm:text-xl font-black text-white truncate">
                  Kabinetni Tahrirlash
                </h3>
                <p className="text-[11px] sm:text-xs text-sky-200 truncate">
                  «{editingSupplier.companyName}» ({editSuppCabinetType === 'manufacturer' ? 'B2B' : 'B2C'})
                </p>
              </div>
            </div>

            <form onSubmit={handleSaveEditSupplier} className="space-y-3 sm:space-y-4 text-xs">
              {/* STIR va Tashkilot ma'lumotlari */}
              <div className="p-3 sm:p-4 rounded-2xl bg-[#071326] border border-[#1E3A6D] space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="text-[#FFB800] font-black flex items-center gap-1.5">
                    <Building className="w-3.5 h-3.5" />
                    <span>STIR Raqami:</span>
                  </label>
                  {editSuppStirLoading && (
                    <span className="text-[11px] text-amber-300 font-mono flex items-center gap-1 animate-pulse">
                      <RefreshCw className="w-3 h-3 animate-spin" /> Tekshirilmoqda...
                    </span>
                  )}
                </div>

                <div className="flex gap-2">
                  <input
                    type="text"
                    maxLength={9}
                    value={editSuppStir}
                    onChange={(e) => handleStirChangeAndLookup(e.target.value, true)}
                    className="flex-1 px-3 py-2 sm:px-3.5 sm:py-2.5 bg-[#0A1931] border border-[#254B85] focus:border-[#FFB800] rounded-xl text-white font-mono font-bold focus:outline-none"
                  />
                  <button
                    type="button"
                    disabled={editSuppStirLoading || editSuppStir.replace(/\D/g, '').length !== 9}
                    onClick={() => handleStirChangeAndLookup(editSuppStir, true)}
                    className="px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl bg-[#FFB800] hover:bg-amber-400 disabled:opacity-40 text-[#071326] font-black transition-all cursor-pointer shrink-0 flex items-center justify-center gap-1.5"
                  >
                    <Search className="w-3.5 h-3.5" />
                    <span>STIR Tekshirish</span>
                  </button>
                </div>

                {editSuppStirError && (
                  <p className="text-red-400 text-[11px] font-bold">{editSuppStirError}</p>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                  <div className="space-y-1">
                    <label className="text-sky-200 font-bold block">Korxona nomi:</label>
                    <input
                      type="text"
                      required
                      value={editSuppCompany}
                      onChange={(e) => setEditSuppCompany(e.target.value)}
                      className="w-full px-3 py-2 sm:px-3.5 sm:py-2.5 bg-[#0A1931] border border-[#254B85] rounded-xl text-white font-bold focus:outline-none focus:border-[#FFB800]"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-emerald-300 font-bold flex items-center gap-1">
                      <Phone className="w-3 h-3 text-emerald-400" />
                      <span>Kirish Telefon Raqami:</span>
                    </label>
                    <input
                      type="text"
                      value={editSuppPhone}
                      onChange={(e) => setEditSuppPhone(formatUzPhone(e.target.value))}
                      placeholder="+998 90 123 45 67"
                      className="w-full px-3 py-2 sm:px-3.5 sm:py-2.5 bg-[#0A1931] border border-emerald-500/40 rounded-xl text-white font-mono font-bold focus:outline-none focus:border-emerald-400"
                    />
                  </div>
                </div>
              </div>

              {/* Login va Parol */}
              <div className="p-3 sm:p-4 rounded-2xl bg-[#071326] border border-[#1E3A6D] grid grid-cols-2 gap-2.5">
                <div className="space-y-1">
                  <label className="text-sky-200 font-bold block">Kabinet Logini:</label>
                  <input
                    type="text"
                    required
                    value={editSuppLogin}
                    onChange={(e) => setEditSuppLogin(e.target.value)}
                    className="w-full px-3 py-2 sm:px-3.5 sm:py-2.5 bg-[#0A1931] border border-[#254B85] rounded-xl text-[#FFB800] font-mono font-bold focus:outline-none focus:border-[#FFB800]"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sky-200 font-bold block">Kabinet Paroli:</label>
                  <div className="relative">
                    <input
                      type={showEditSuppPass ? 'text' : 'password'}
                      required
                      value={editSuppPassword}
                      onChange={(e) => setEditSuppPassword(e.target.value)}
                      className="w-full pl-3 pr-8 py-2 sm:py-2.5 bg-[#0A1931] border border-[#254B85] rounded-xl text-emerald-400 font-mono font-bold focus:outline-none focus:border-[#FFB800]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowEditSuppPass(!showEditSuppPass)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-sky-300 hover:text-white cursor-pointer"
                    >
                      {showEditSuppPass ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              </div>

              {/* Kategoriya va Shartnoma foizi */}
              <div className="p-3 sm:p-4 rounded-2xl bg-[#071326] border border-[#1E3A6D] space-y-2.5">
                <div className="space-y-1">
                  <label className="text-sky-200 font-bold block">Mahsulot Turi (Kategoriya):</label>
                  <input
                    type="text"
                    value={editSuppCategory}
                    onChange={(e) => setEditSuppCategory(e.target.value)}
                    className="w-full px-3 py-2 sm:px-3.5 sm:py-2.5 bg-[#0A1931] border border-[#254B85] rounded-xl text-white focus:outline-none focus:border-[#FFB800]"
                  />
                </div>

                <div className="flex items-center justify-between gap-2 flex-wrap pt-1">
                  <span className="text-sky-200 font-bold">Shartnoma Foizi:</span>
                  <div className="flex items-center gap-1.5 sm:gap-2">
                    <input
                      type="number"
                      step="0.1"
                      min="0.1"
                      max="100"
                      value={editSuppCommission}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        if (!isNaN(val) && val > 0) setEditSuppCommission(val);
                      }}
                      className="w-16 sm:w-20 px-2 py-1 bg-[#0A1931] border border-[#FFB800] rounded-lg text-[#FFB800] font-mono font-black text-center focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setEditSuppCommissionBasis('total')}
                      className={`px-2.5 py-1 rounded-lg font-bold cursor-pointer border text-[11px] sm:text-xs ${
                        editSuppCommissionBasis === 'total'
                          ? 'bg-[#FFB800] text-[#071326] border-amber-300'
                          : 'bg-[#0A1931] text-sky-200 border-[#254B85]'
                      }`}
                    >
                      Umumiydan
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditSuppCommissionBasis('profit')}
                      className={`px-2.5 py-1 rounded-lg font-bold cursor-pointer border text-[11px] sm:text-xs ${
                        editSuppCommissionBasis === 'profit'
                          ? 'bg-emerald-500 text-slate-950 border-emerald-300'
                          : 'bg-[#0A1931] text-sky-200 border-[#254B85]'
                      }`}
                    >
                      Foydadan
                    </button>
                  </div>
                </div>
              </div>

              {/* Tahrirlashni tasdiqlash paroli */}
              <div className="p-3 sm:p-4 rounded-2xl bg-[#071326] border-2 border-[#FFB800] space-y-2">
                <label className="text-[#FFB800] font-black flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5" />
                  <span>Tahrirlashni tasdiqlash paroli:</span>
                </label>
                <div className="relative">
                  <input
                    type={showEditSuppAuthPass ? 'text' : 'password'}
                    required
                    value={editSuppAuthPassword}
                    onChange={(e) => {
                      setEditSuppAuthPassword(e.target.value);
                      setEditSuppError(null);
                    }}
                    placeholder="O‘zgarishlarni saqlash uchun parolni kiriting"
                    className="w-full pl-3 pr-8 py-2 sm:py-2.5 bg-[#0A1931] border border-[#FFB800]/60 rounded-xl text-white font-mono font-bold focus:outline-none focus:border-[#FFB800]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowEditSuppAuthPass(!showEditSuppAuthPass)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-sky-300 hover:text-white cursor-pointer"
                  >
                    {showEditSuppAuthPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {editSuppError && (
                <div className="p-2.5 rounded-xl bg-red-500/20 border border-red-500/40 text-red-300 font-bold">
                  {editSuppError}
                </div>
              )}

              {editSuppSuccess && (
                <div className="p-2.5 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 font-bold flex items-center gap-2">
                  <Check className="w-4 h-4" />
                  <span>Kabinet ma'lumotlari muvaffaqiyatli saqlandi!</span>
                </div>
              )}

              <div className="flex items-center justify-between gap-2 pt-2.5 border-t border-[#1E3A6D]">
                <button
                  type="button"
                  onClick={() => {
                    const target = editingSupplier;
                    setEditingSupplier(null);
                    setDeletingSupplier(target);
                    setDeleteSuppAuthPassword('');
                    setShowDeleteSuppAuthPass(false);
                    setDeleteSuppError(null);
                    setDeleteSuppSmsSent(false);
                    setDeleteSuppSmsCode('');
                    setDeleteSuppSmsInput('');
                    setDeleteSuppSmsNotice(null);
                  }}
                  className="px-3 py-2 sm:px-4 sm:py-2.5 rounded-xl bg-red-600/20 hover:bg-red-600 text-red-300 hover:text-white border border-red-500/40 font-bold flex items-center gap-1.5 cursor-pointer transition-all"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>O‘chirish</span>
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingSupplier(null)}
                    className="px-3.5 py-2 sm:px-4 sm:py-2.5 rounded-xl bg-[#071326] text-sky-200 border border-[#1E3A6D] font-bold cursor-pointer"
                  >
                    Bekor qilish
                  </button>
                  <button
                    type="submit"
                    disabled={
                      editSuppStir.replace(/\D/g, '').length === 9 &&
                      isStirTakenInCabinetType(editSuppStir, editSuppCabinetType, editingSupplier.id)
                    }
                    className="px-4 py-2 sm:px-5 sm:py-2.5 rounded-xl bg-[#FFB800] hover:bg-amber-400 disabled:opacity-40 text-[#071326] font-black flex items-center gap-1.5 cursor-pointer shadow-md"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>Saqlash</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL: TA'MINOTCHI KABINETINI O'CHIRISH (Parol asosida)
          ========================================================================= */}
      {deletingSupplier && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-fadeIn">
          <div className="bg-[#0A1931] border-2 border-red-500 rounded-2xl sm:rounded-3xl max-w-md w-full p-4 sm:p-6 space-y-3.5 shadow-2xl relative text-[#F5F5F2]">
            <button
              type="button"
              onClick={() => {
                setDeletingSupplier(null);
                setDeleteSuppSmsSent(false);
                setDeleteSuppSmsCode('');
                setDeleteSuppSmsInput('');
                setDeleteSuppSmsNotice(null);
              }}
              className="absolute top-3.5 right-3.5 p-1.5 rounded-xl bg-[#071326] text-sky-200 hover:text-white border border-[#1E3A6D] cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-2.5 pr-8">
              <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl sm:rounded-2xl bg-red-600/20 border border-red-500 text-red-400 flex items-center justify-center shrink-0">
                <Trash2 className="w-4 h-4 sm:w-5 sm:h-5" />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm sm:text-base font-black text-white">
                  Kabinetni O‘chirish
                </h3>
                <p className="text-[11px] sm:text-xs text-sky-200 truncate">
                  «{deletingSupplier.companyName}» (STIR: {deletingSupplier.inn || '—'})
                </p>
              </div>
            </div>

            <form onSubmit={handleConfirmDeleteSupplier} className="space-y-3.5 text-xs">
              <div className="p-3.5 rounded-2xl bg-[#071326] border border-red-500/40 space-y-2.5">
                <div className="space-y-1.5">
                  <label className="text-amber-300 font-black flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5 text-[#FFB800]" />
                    <span>Bunker Admin paroli:</span>
                  </label>
                  <div className="relative">
                    <input
                      type={showDeleteSuppAuthPass ? 'text' : 'password'}
                      required
                      autoFocus
                      value={deleteSuppAuthPassword}
                      onChange={(e) => {
                        setDeleteSuppAuthPassword(e.target.value);
                        setDeleteSuppError(null);
                      }}
                      placeholder="Bunker Admin parolini kiriting"
                      className="w-full pl-3.5 pr-9 py-2 sm:py-2.5 bg-[#0A1931] border border-[#254B85] focus:border-[#FFB800] rounded-xl text-white font-mono font-bold focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowDeleteSuppAuthPass(!showDeleteSuppAuthPass)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-sky-300 hover:text-white cursor-pointer"
                    >
                      {showDeleteSuppAuthPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {deleteSuppError && (
                  <p className="text-red-400 text-[11px] font-bold">{deleteSuppError}</p>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#1E3A6D]">
                <button
                  type="button"
                  onClick={() => {
                    setDeletingSupplier(null);
                    setDeleteSuppSmsSent(false);
                    setDeleteSuppSmsCode('');
                    setDeleteSuppSmsInput('');
                    setDeleteSuppSmsNotice(null);
                  }}
                  className="px-4 py-2 rounded-xl bg-[#071326] text-sky-200 border border-[#1E3A6D] font-bold cursor-pointer"
                >
                  Bekor qilish
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white font-black flex items-center gap-1.5 cursor-pointer shadow-lg"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>O‘chirish</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL 3: BUNKER ADMIN SOZLAMALARI (Mobilga moslashtirilgan ixcham dizayn)
          ========================================================================= */}
      {isSettingsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
          <div className="bg-[#222528] border-2 border-[#FFB800] rounded-2xl max-w-lg w-full p-3.5 sm:p-6 space-y-3 sm:space-y-4 shadow-2xl relative max-h-[94vh] overflow-y-auto text-[#F5F5F2]">
            <button
              type="button"
              onClick={() => setIsSettingsOpen(false)}
              className="absolute top-3 right-3 sm:top-4 sm:right-4 text-slate-400 hover:text-white p-1.5 sm:p-2 rounded-xl bg-[#292C2F] transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center justify-between gap-2 pr-8">
              <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
                <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400 border border-[#FFB800]/40 shrink-0">
                  <Settings className="w-4 h-4 sm:w-5 sm:h-5" />
                </div>
                <h2 className="text-sm sm:text-lg font-black text-white truncate">Bunker Admin Sozlamalari</h2>
              </div>
              <div className="flex items-center rounded-xl bg-[#151719] border border-[#51504A] p-0.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setLang('uz')}
                  className={`px-2 py-1 rounded-lg text-[10px] sm:text-[11px] font-black cursor-pointer transition-all ${
                    lang === 'uz' ? 'bg-[#FFB800] text-slate-950' : 'text-slate-300 hover:text-white'
                  }`}
                >
                  O‘zbekcha
                </button>
                <button
                  type="button"
                  onClick={() => setLang('ru')}
                  className={`px-2 py-1 rounded-lg text-[10px] sm:text-[11px] font-black cursor-pointer transition-all ${
                    lang === 'ru' ? 'bg-blue-600 text-white' : 'text-slate-300 hover:text-white'
                  }`}
                >
                  Русский
                </button>
              </div>
            </div>

            <form onSubmit={handleSaveBunkerSettings} className="space-y-2.5 sm:space-y-3.5 text-xs">
              {/* 1. Bunker Admin Login, Parol va Tasdiqlash Telefon Raqami */}
              <div className="space-y-2.5 bg-[#151719] p-3 sm:p-4 rounded-xl sm:rounded-2xl border border-[#51504A]">
                <span className="text-[11px] font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                  <KeyRound className="w-3.5 h-3.5" />
                  Bunker Admin Login va Paroli
                </span>

                <div className="grid grid-cols-2 gap-2 sm:gap-3">
                  <div className="space-y-1">
                    <label className="text-slate-300 font-semibold block text-[11px] sm:text-xs">Login:</label>
                    <input
                      type="text"
                      required
                      value={bunkerLoginInput}
                      onChange={(e) => setBunkerLoginInput(e.target.value)}
                      className="w-full px-3 py-2 bg-[#222528] border border-[#51504A] rounded-xl text-white text-xs font-mono focus:outline-none focus:border-[#FFB800]"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-slate-300 font-semibold block text-[11px] sm:text-xs">Parol:</label>
                    <div className="relative">
                      <input
                        type={showBunkerPass ? 'text' : 'password'}
                        required
                        value={bunkerPassInput}
                        onChange={(e) => setBunkerPassInput(e.target.value)}
                        className="w-full pl-3 pr-8 py-2 bg-[#222528] border border-[#51504A] rounded-xl text-white text-xs font-mono focus:outline-none focus:border-[#FFB800]"
                      />
                      <button
                        type="button"
                        onClick={() => setShowBunkerPass(!showBunkerPass)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white cursor-pointer"
                      >
                        {showBunkerPass ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-emerald-300 font-semibold flex items-center gap-1.5 text-[11px] sm:text-xs">
                    <Phone className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span>SMS Tasdiqlash Telefon Raqami (Bunker Admin):</span>
                  </label>
                  <input
                    type="tel"
                    required
                    value={bunkerPhoneInput}
                    onChange={(e) => {
                      setBunkerPhoneInput(formatUzPhone(e.target.value));
                      setSettingsSmsSent(false);
                      setSettingsSmsNotice(null);
                    }}
                    placeholder="+998 90 123 45 67"
                    className="w-full px-3 py-2 bg-[#222528] border border-emerald-500/40 rounded-xl text-white text-xs font-mono font-bold focus:outline-none focus:border-emerald-400"
                  />
                </div>
              </div>

              {/* 2. Logotipga Rasm Qo'yish */}
              <div className="flex items-center justify-between gap-2 bg-[#151719] p-2.5 sm:p-3.5 rounded-xl sm:rounded-2xl border border-[#51504A]">
                <span className="text-[11px] font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                  <ImageIcon className="w-3.5 h-3.5 shrink-0" />
                  <span>Logotipga Rasm Qo‘yish</span>
                </span>

                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-1.5 px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-[11px] sm:text-xs cursor-pointer transition-all active:scale-95 shadow-md">
                    <Upload className="w-3.5 h-3.5" />
                    <span>Rasm yuklash</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleSettingsLogoUpload}
                      className="hidden"
                    />
                  </label>

                  {settingsLogoUrl && (
                    <button
                      type="button"
                      onClick={() => {
                        setSettingsLogoUrl(null);
                        setSettingsLogoFileName(null);
                      }}
                      className="p-1.5 rounded-xl bg-red-500/15 hover:bg-red-500/25 text-red-400 border border-red-500/30 cursor-pointer"
                      title="O‘chirish"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* 3. Ijtimoiy Tarmoq Havolalari */}
              <div className="space-y-2 bg-[#151719] p-3 sm:p-4 rounded-xl sm:rounded-2xl border border-[#51504A]">
                <span className="text-[11px] font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                  <Share2 className="w-3.5 h-3.5 text-sky-400" />
                  Ijtimoiy Tarmoq Havolalari va Aloqa
                </span>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-[11px] text-sky-300 font-semibold flex items-center gap-1">
                      <RealTelegramLogo className="w-3.5 h-3.5 rounded-full overflow-hidden shrink-0" />
                      <span className="truncate">1-Telegram (Tarmoq):</span>
                    </label>
                    <input
                      type="text"
                      value={settingsTelegram1}
                      onChange={(e) => setSettingsTelegram1(e.target.value)}
                      className="w-full px-3 py-1.5 sm:py-2 bg-[#222528] border border-[#51504A] rounded-xl text-white text-xs focus:outline-none focus:border-sky-400 font-medium"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] text-sky-300 font-semibold flex items-center gap-1">
                      <RealTelegramLogo className="w-3.5 h-3.5 rounded-full overflow-hidden shrink-0" />
                      <span className="truncate">2-Telegram (Aloqa):</span>
                    </label>
                    <input
                      type="text"
                      value={settingsTelegram2}
                      onChange={(e) => setSettingsTelegram2(e.target.value)}
                      className="w-full px-3 py-1.5 sm:py-2 bg-[#222528] border border-[#51504A] rounded-xl text-white text-xs focus:outline-none focus:border-sky-400 font-medium"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] text-red-400 font-semibold flex items-center gap-1">
                      <RealYouTubeLogo className="w-3.5 h-3.5 rounded overflow-hidden shrink-0" />
                      <span className="truncate">YouTube Havola:</span>
                    </label>
                    <input
                      type="text"
                      value={settingsYoutube}
                      onChange={(e) => setSettingsYoutube(e.target.value)}
                      className="w-full px-3 py-1.5 sm:py-2 bg-[#222528] border border-red-500/40 rounded-xl text-white text-xs focus:outline-none focus:border-red-400 font-medium"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] text-pink-300 font-semibold flex items-center gap-1">
                      <RealInstagramLogo className="w-3.5 h-3.5 rounded overflow-hidden shrink-0" />
                      <span className="truncate">Instagram Havola:</span>
                    </label>
                    <input
                      type="text"
                      value={settingsInstagram}
                      onChange={(e) => setSettingsInstagram(e.target.value)}
                      className="w-full px-3 py-1.5 sm:py-2 bg-[#222528] border border-pink-500/40 rounded-xl text-white text-xs focus:outline-none focus:border-pink-400 font-medium"
                    />
                  </div>

                  <div className="space-y-1 sm:col-span-2">
                    <label className="text-[11px] text-emerald-300 font-semibold flex items-center gap-1">
                      <RealPhoneLogo className="w-3.5 h-3.5 rounded overflow-hidden shrink-0" />
                      <span>Telefon raqam:</span>
                    </label>
                    <input
                      type="text"
                      value={settingsPhone}
                      onChange={(e) => setSettingsPhone(e.target.value)}
                      className="w-full px-3 py-1.5 sm:py-2 bg-[#222528] border border-emerald-500/40 rounded-xl text-white text-xs focus:outline-none focus:border-emerald-400 font-medium font-mono"
                    />
                  </div>
                </div>
              </div>

              {settingsSmsSent && (
                <div className="p-3 rounded-xl bg-[#151719] border-2 border-amber-500/60 space-y-2 animate-fadeIn">
                  {settingsSmsNotice && (
                    <div className="p-2 rounded-lg bg-amber-500/15 border border-amber-400/40 text-amber-200 text-[11px] font-mono font-bold">
                      {settingsSmsNotice}
                    </div>
                  )}
                  <label className="text-emerald-300 font-black flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5 text-emerald-400" />
                    <span>SMS Tasdiqlash kodi (6 xonali):</span>
                  </label>
                  <input
                    type="text"
                    required
                    autoFocus
                    maxLength={6}
                    value={settingsSmsInput}
                    onChange={(e) => {
                      setSettingsSmsInput(e.target.value.replace(/\D/g, '').slice(0, 6));
                      setSettingsError(null);
                    }}
                    placeholder="6 xonali SMS kodni kiriting"
                    className="w-full px-3 py-2 bg-[#222528] border-2 border-emerald-500/50 focus:border-emerald-400 rounded-xl text-white font-mono text-sm tracking-widest font-black focus:outline-none"
                  />
                </div>
              )}

              {settingsError && (
                <div className="p-2.5 rounded-xl bg-red-500/20 text-red-300 border border-red-500/30 text-xs font-bold">
                  {settingsError}
                </div>
              )}

              {settingsSavedSuccess && (
                <div className="p-2.5 rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs flex items-center gap-2 font-bold">
                  <Check className="w-4 h-4" />
                  <span>Sozlamalar muvaffaqiyatli saqlandi!</span>
                </div>
              )}

              <div className="flex items-center justify-between gap-2 pt-2.5 border-t border-[#51504A]">
                <button
                  type="button"
                  onClick={() => {
                    setIsSettingsOpen(false);
                    onLogout();
                  }}
                  className="px-3 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white border border-red-400 font-black text-[11px] sm:text-xs flex items-center gap-1.5 cursor-pointer shadow-lg active:scale-95 transition-all"
                >
                  <LogOut className="w-3.5 h-3.5 stroke-[2.5]" />
                  <span>Kabinetdan Chiqish</span>
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsSettingsOpen(false)}
                    className="px-3 py-2 rounded-xl bg-[#292C2F] hover:bg-[#222528] text-slate-300 font-semibold text-[11px] sm:text-xs cursor-pointer"
                  >
                    Yopish
                  </button>
                  <button
                    type="submit"
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-[11px] sm:text-xs shadow-lg shadow-amber-500/20 active:scale-95 transition-all cursor-pointer"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>{settingsSmsSent ? 'Tasdiqlash' : 'Saqlash'}</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Ta'minotchi kabinetiga o'tish uchun Admin SMS Tasdiqlash Oynasi */}
      {pendingEnterSupplier && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-[#071326]/80 backdrop-blur-md animate-fadeIn">
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
