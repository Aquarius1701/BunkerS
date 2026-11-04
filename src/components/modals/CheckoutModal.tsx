import React, { useState, useEffect } from 'react';
import { protobufFetch as fetch } from '../../lib/protobufClient';
import {
  Package,
  MapPin,
  Phone,
  CreditCard,
  CheckCircle,
  AlertCircle,
  ChevronRight,
  ChevronLeft,
  Trash2,
  Plus,
  Minus,
  ShieldCheck,
  Building2,
  Clock,
  Printer,
  FileText,
  DollarSign,
  Smartphone,
  Wallet,
  Coins,
  User,
  Navigation,
  Globe
} from 'lucide-react';
import { CartItem, UserProfile, Order } from '../../types';
import {
  REGIONS_AND_DISTRICTS,
  getMfyListForDistrict,
  REGION_COORDINATES,
  getLocationCoordinates,
} from '../../data/regionsData';
import { db, handleFirestoreError, OperationType } from '../../lib/firebase';
import { doc, setDoc } from 'firebase/firestore';
import { recordCabinetLog } from '../../lib/cabinetLogs';
import { InteractiveDeliveryMap } from '../common/InteractiveDeliveryMap';
import { createOrderApi } from '../../lib/api';

interface CheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: CartItem[];
  user: UserProfile | null;
  onUserUpdate?: (updatedUser: UserProfile) => void;
  onUpdateQuantity: (productId: string, quantity: number) => void;
  onRemoveItem: (productId: string) => void;
  onClearCart: () => void;
  onOrderCompleted: (order: Order) => void;
  onOpenAuth: () => void;
}

export const CheckoutModal: React.FC<CheckoutModalProps> = ({
  isOpen,
  onClose,
  items,
  user,
  onUserUpdate,
  onUpdateQuantity,
  onRemoveItem,
  onClearCart,
  onOrderCompleted,
  onOpenAuth,
}) => {
  // Step navigation: 1 -> 2 -> 3 -> 4 -> 5 (Success/Receipt)
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 2: Manzilni tasdiqlash (Ro'yxatdan tanlash + Xarita sinxronizatsiyasi)
  const initialRegion =
    user?.region && REGIONS_AND_DISTRICTS[user.region] ? user.region : 'Toshkent shahri';
  const initialDistrict =
    user?.district && (REGIONS_AND_DISTRICTS[initialRegion] || []).includes(user.district)
      ? user.district
      : (REGIONS_AND_DISTRICTS[initialRegion] || [])[0] || 'Shayxontohur tumani';
  const initialMfyList = getMfyListForDistrict(initialDistrict);
  const initialMfy = initialMfyList[0] || 'Besh-Yog‘och MFY';

  const [region, setRegion] = useState<string>(initialRegion);
  const [district, setDistrict] = useState<string>(initialDistrict);
  const [mfy, setMfy] = useState<string>(initialMfy);

  // Type-ahead search queries & dropdown open state for right-column selectors
  const [openDropdown, setOpenDropdown] = useState<'region' | 'district' | 'mfy' | null>(null);
  const [regionQuery, setRegionQuery] = useState<string>(initialRegion);
  const [districtQuery, setDistrictQuery] = useState<string>(initialDistrict);
  const [mfyQuery, setMfyQuery] = useState<string>(initialMfy);
  const [skipNextReverseGeocode, setSkipNextReverseGeocode] = useState<boolean>(false);

  const [mapPinned, setMapPinned] = useState<boolean>(true);
  const [showMapPicker, setShowMapPicker] = useState<boolean>(true);
  const [showManualAddressFields, setShowManualAddressFields] = useState<boolean>(false);
  const [detectedMapAddress, setDetectedMapAddress] = useState<string>(
    `${initialRegion}, ${initialDistrict}, ${initialMfy}`
  );
  const [detectedAddressDetails, setDetectedAddressDetails] = useState<{
    region: string;
    district: string;
    street: string;
  }>({
    region: initialRegion,
    district: initialDistrict,
    street: initialMfy,
  });
  const [mapCoords, setMapCoords] = useState<{ lat: number; lng: number }>(() =>
    getLocationCoordinates(initialRegion, initialDistrict, initialMfy)
  );

  // Step 3: Qabul qiluvchi (ID Karta ma'lumotlari va Telefon raqam + Qo'shimcha raqam)
  const [recipientFirstName, setRecipientFirstName] = useState<string>(
    user?.firstName || user?.displayName?.split(' ')[0] || ''
  );
  const [recipientLastName, setRecipientLastName] = useState<string>(
    user?.lastName || user?.displayName?.split(' ').slice(1).join(' ') || ''
  );
  const [recipientIdCard, setRecipientIdCard] = useState<string>(
    user?.idCardNumber || ''
  );
  const [recipientBirthDate, setRecipientBirthDate] = useState<string>(
    user?.birthDate || ''
  );
  const [idVerifiedInCheckout, setIdVerifiedInCheckout] = useState<boolean>(
    Boolean(user?.idCardNumber && /^[A-Z]{2}\s?\d{7}$/i.test(user.idCardNumber.trim()))
  );
  const [idVerifying, setIdVerifying] = useState<boolean>(false);
  const [cabinetPhone, setCabinetPhone] = useState<string>(
    user?.phone || '+998 '
  );
  const [showAdditionalPhone, setShowAdditionalPhone] = useState<boolean>(false);
  const [secondaryPhone, setSecondaryPhone] = useState<string>('');

  // Saved delivery addresses for future orders
  const savedAddressesStorageKey = `bunkerstroy_saved_addresses_${user?.id || 'guest'}`;
  const [savedDeliveryAddresses, setSavedDeliveryAddresses] = useState<
    Array<{ address: string; lat: number; lng: number }>
  >(() => {
    try {
      const raw = localStorage.getItem(`bunkerstroy_saved_addresses_${user?.id || 'guest'}`);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });
  const [addressConfirmedNotice, setAddressConfirmedNotice] = useState<boolean>(false);

  const saveDeliveryAddressForFuture = (addrText: string, lat: number, lng: number) => {
    const cleanAddr = (addrText || '').trim();
    if (!cleanAddr) return;
    setSavedDeliveryAddresses((prev) => {
      const filtered = prev.filter((item) => item.address.toLowerCase() !== cleanAddr.toLowerCase());
      const next = [{ address: cleanAddr, lat, lng }, ...filtered].slice(0, 8);
      try {
        localStorage.setItem(savedAddressesStorageKey, JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  // Step 4: To'lov (UZCARD, HUMO, CLICK, VISA + SMS tasdiqlash)
  const [paymentMethod, setPaymentMethod] = useState<'uzcard' | 'humo' | 'click' | 'visa'>('uzcard');
  const [cardNumber, setCardNumber] = useState('');
  const [cardExpire, setCardExpire] = useState('');
  const [cardSmsSent, setCardSmsSent] = useState(false);
  const [sentCardSmsCode, setSentCardSmsCode] = useState('');
  const [cardSmsInput, setCardSmsInput] = useState('');
  const [completedOrder, setCompletedOrder] = useState<Order | null>(null);
  const [completedZavodOrder, setCompletedZavodOrder] = useState<Order | null>(null);

  // Helper to check if a cart item belongs to a Zavod (manufacturer B2B cabinet)
  const isZavodCartItem = (item: CartItem): boolean => {
    const p: any = item.product;
    if (p.supplierCabinetType === 'manufacturer') return true;
    try {
      const rawSupps = localStorage.getItem('bunkerstroy_suppliers');
      if (rawSupps) {
        const supps = JSON.parse(rawSupps);
        if (Array.isArray(supps)) {
          const matched = supps.find(
            (s: any) =>
              (p.supplierId && s.id === p.supplierId) ||
              (p.supplierInn && s.inn && String(s.inn).trim() === String(p.supplierInn).trim()) ||
              (p.supplierName &&
                s.companyName &&
                String(s.companyName).trim().toLowerCase() === String(p.supplierName).trim().toLowerCase())
          );
          if (matched && matched.cabinetType === 'manufacturer') return true;
        }
      }
    } catch {}
    return false;
  };

  const zavodItems = items.filter((it) => isZavodCartItem(it));
  const regularItems = items.filter((it) => !isZavodCartItem(it));
  const zavodTotal = zavodItems.reduce((sum, it) => sum + it.product.price * it.quantity, 0);
  const regularTotal = regularItems.reduce((sum, it) => sum + it.product.price * it.quantity, 0);
  const hasZavodItems = zavodItems.length > 0;
  const hasRegularItems = regularItems.length > 0;
  const isMixedCart = hasZavodItems && hasRegularItems;
  const isOnlyZavodCart = hasZavodItems && !hasRegularItems;

  const getMaskedCardPhoneLast4 = (): string => {
    const rawDigits = (cabinetPhone || user?.phone || '').replace(/\D/g, '');
    const last4 = rawDigits.length >= 4 ? rawDigits.slice(-4) : '8080';
    return `** ** ** ${last4}`;
  };

  const triggerCardSmsCode = () => {
    const generated = String(Math.floor(100000 + Math.random() * 900000));
    setSentCardSmsCode(generated);
    setCardSmsSent(true);
    setCardSmsInput('');
    setError(null);
  };

  // Update district and MFY lists when region/district changes
  const allRegionsList = Object.keys(REGIONS_AND_DISTRICTS);
  const districts = region ? REGIONS_AND_DISTRICTS[region] || [] : [];
  const mfyList = district ? getMfyListForDistrict(district) : [];

  const filteredRegions = allRegionsList.filter((r) => {
    const q = regionQuery.trim().toLowerCase();
    if (!q || q === region.toLowerCase()) return true;
    return r.toLowerCase().includes(q);
  });

  const filteredDistricts = districts.filter((d) => {
    const q = districtQuery.trim().toLowerCase();
    if (!q || q === district.toLowerCase()) return true;
    return d.toLowerCase().includes(q);
  });

  const filteredMfys = mfyList.filter((m) => {
    const q = mfyQuery.trim().toLowerCase();
    if (!q || q === mfy.toLowerCase()) return true;
    return m.toLowerCase().includes(q);
  });

  const syncMapToSelectedLocation = async (nextReg: string, nextDist: string, nextMfy: string) => {
    const baseCoords = getLocationCoordinates(nextReg, nextDist, nextMfy);
    setSkipNextReverseGeocode(true);
    setMapCoords(baseCoords);
    setMapPinned(true);

    const cleanAddr = [nextReg, nextDist, nextMfy].filter(Boolean).join(', ');
    setDetectedAddressDetails({
      region: nextReg || 'Toshkent shahri',
      district: nextDist || '',
      street: nextMfy || '',
    });
    setDetectedMapAddress(cleanAddr);

    // Optional forward geocoding to refine map pin if exact mahalla/district exists in Nominatim
    try {
      const searchQ = [
        nextMfy ? nextMfy.replace(/\s*MFY$/i, '') : '',
        nextDist,
        nextReg,
        "O'zbekiston",
      ]
        .filter(Boolean)
        .join(', ');
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(
          searchQ
        )}&limit=1&countrycodes=uz&accept-language=uz`
      );
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0 && data[0].lat && data[0].lon) {
          const foundLat = Number(parseFloat(data[0].lat).toFixed(6));
          const foundLng = Number(parseFloat(data[0].lon).toFixed(6));
          if (Math.hypot(foundLat - baseCoords.lat, foundLng - baseCoords.lng) < 0.8) {
            setSkipNextReverseGeocode(true);
            setMapCoords({ lat: foundLat, lng: foundLng });
          }
        }
      }
    } catch {}
  };

  const handleSelectRegion = (nextReg: string) => {
    const regDistricts = REGIONS_AND_DISTRICTS[nextReg] || [];
    const firstDist = regDistricts[0] || '';
    const distMfys = firstDist ? getMfyListForDistrict(firstDist) : [];
    const firstMfy = distMfys[0] || '';

    setRegion(nextReg);
    setRegionQuery(nextReg);
    setDistrict(firstDist);
    setDistrictQuery(firstDist);
    setMfy(firstMfy);
    setMfyQuery(firstMfy);
    setOpenDropdown('district');
    setError(null);
    syncMapToSelectedLocation(nextReg, firstDist, firstMfy);
  };

  const handleSelectDistrict = (nextDist: string) => {
    const distMfys = nextDist ? getMfyListForDistrict(nextDist) : [];
    const firstMfy = distMfys[0] || '';

    setDistrict(nextDist);
    setDistrictQuery(nextDist);
    setMfy(firstMfy);
    setMfyQuery(firstMfy);
    setOpenDropdown('mfy');
    setError(null);
    syncMapToSelectedLocation(region, nextDist, firstMfy);
  };

  const handleSelectMfy = (nextMfy: string) => {
    setMfy(nextMfy);
    setMfyQuery(nextMfy);
    setOpenDropdown(null);
    setError(null);
    syncMapToSelectedLocation(region, district, nextMfy);
  };

  const TASHKENT_DISTRICTS: Array<{ name: string; lat: number; lng: number }> = [
    { name: 'Chilonzor tumani', lat: 41.2755, lng: 69.204 },
    { name: 'Shayxontohur tumani', lat: 41.3205, lng: 69.232 },
    { name: 'Yunusobod tumani', lat: 41.366, lng: 69.2865 },
    { name: "Mirzo Ulug'bek tumani", lat: 41.3395, lng: 69.335 },
    { name: 'Yakkasaroy tumani', lat: 41.2825, lng: 69.2545 },
    { name: 'Mirobod tumani', lat: 41.287, lng: 69.286 },
    { name: 'Olmazor tumani', lat: 41.3535, lng: 69.2165 },
    { name: 'Uchtepa tumani', lat: 41.293, lng: 69.1705 },
    { name: 'Sergeli tumani', lat: 41.2225, lng: 69.2215 },
    { name: 'Yangihayot tumani', lat: 41.201, lng: 69.202 },
    { name: 'Yashnobod tumani', lat: 41.286, lng: 69.336 },
    { name: 'Bektemir tumani', lat: 41.225, lng: 69.334 },
  ];

  const getNearestRegionName = (lat: number, lng: number): string => {
    let closestRegion = 'Toshkent shahri';
    let minDistance = Infinity;
    Object.entries(REGION_COORDINATES).forEach(([regName, coords]) => {
      const dist = Math.hypot(coords.lat - lat, coords.lng - lng);
      if (dist < minDistance) {
        minDistance = dist;
        closestRegion = regName;
      }
    });
    return closestRegion;
  };

  const getFallbackDistrictName = (lat: number, lng: number, regName: string): string => {
    if (regName === 'Toshkent shahri' || (lat >= 41.18 && lat <= 41.42 && lng >= 69.12 && lng <= 69.42)) {
      let closest = 'Shayxontohur tumani';
      let minD = Infinity;
      for (const d of TASHKENT_DISTRICTS) {
        const dist = Math.hypot(d.lat - lat, d.lng - lng);
        if (dist < minD) {
          minD = dist;
          closest = d.name;
        }
      }
      return closest;
    }
    const regDistricts = REGIONS_AND_DISTRICTS[regName] || [];
    return regDistricts[0] || `${regName.replace(/\s*viloyati/i, '')} shahri`;
  };

  const resolveAddressFromCoords = async (lat: number, lng: number) => {
    const nearestReg = getNearestRegionName(lat, lng);
    const fallbackDist = getFallbackDistrictName(lat, lng, nearestReg);

    let resolvedRegion = nearestReg;
    let resolvedDistrict = fallbackDist;
    let resolvedStreet = '';

    try {
      const [nomRes, roadRes] = await Promise.allSettled([
        fetch(
          `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1&accept-language=uz`
        ),
        fetch(
          `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=16&addressdetails=1&accept-language=uz`
        ),
      ]);

      let addr: Record<string, string> = {};
      let roadAddr: Record<string, string> = {};
      let displayName = '';

      if (nomRes.status === 'fulfilled' && nomRes.value.ok) {
        const data = await nomRes.value.json();
        if (data?.address) addr = data.address;
        if (data?.display_name) displayName = data.display_name;
      }
      if (roadRes.status === 'fulfilled' && roadRes.value.ok) {
        const roadData = await roadRes.value.json();
        if (roadData?.address) roadAddr = roadData.address;
      }

      // 1. Viloyat / Shahar
      const rawRegion = addr.state || roadAddr.state || addr.city || roadAddr.city || nearestReg;
      if (/^toshkent$/i.test(rawRegion.trim())) {
        resolvedRegion = 'Toshkent shahri';
      } else {
        const matchedReg = Object.keys(REGIONS_AND_DISTRICTS).find(
          (r) => r.toLowerCase() === rawRegion.trim().toLowerCase()
        );
        resolvedRegion = matchedReg || nearestReg;
      }

      // 2. Tuman yoki shahar
      const rawDistrict =
        addr.city_district ||
        addr.borough ||
        addr.county ||
        roadAddr.city_district ||
        roadAddr.borough ||
        roadAddr.county ||
        addr.municipality ||
        addr.town ||
        addr.village ||
        (addr.city && !/^toshkent$/i.test(addr.city.trim()) ? addr.city : '');

      if (rawDistrict) {
        const regDists = REGIONS_AND_DISTRICTS[resolvedRegion] || [];
        const matchedDist = regDists.find((d) =>
          d.toLowerCase().includes(rawDistrict.replace(/\s*tumani|\s*shahri/i, '').trim().toLowerCase())
        );
        resolvedDistrict = matchedDist || rawDistrict;
      } else {
        resolvedDistrict = getFallbackDistrictName(lat, lng, resolvedRegion);
      }

      // 3. Mahalla / Ko'cha / Uy
      const mahallaPart =
        addr.neighbourhood ||
        addr.quarter ||
        addr.suburb ||
        roadAddr.neighbourhood ||
        roadAddr.quarter ||
        '';
      const streetPart =
        addr.road ||
        addr.pedestrian ||
        addr.residential ||
        addr.street ||
        roadAddr.road ||
        roadAddr.pedestrian ||
        roadAddr.residential ||
        addr.amenity ||
        '';
      const housePart = addr.house_number ? `${addr.house_number}-uy` : '';

      const streetPieces = Array.from(
        new Set(
          [mahallaPart, streetPart, housePart]
            .map((s) => (s || '').trim())
            .filter(Boolean)
        )
      );

      if (streetPieces.length > 0) {
        resolvedStreet = streetPieces.join(', ');
      } else if (displayName) {
        const firstSegments = displayName
          .split(',')
          .map((s) => s.trim())
          .filter(
            (s) =>
              s &&
              !s.toLowerCase().includes('oʻzbekiston') &&
              !s.toLowerCase().includes("o'zbekiston") &&
              !/^\d{5,6}$/.test(s) &&
              s.toLowerCase() !== resolvedRegion.toLowerCase() &&
              s.toLowerCase() !== resolvedDistrict.toLowerCase()
          );
        resolvedStreet = firstSegments.slice(0, 2).join(', ') || "Markaziy ko'cha";
      } else {
        resolvedStreet = "Markaziy ko'cha";
      }
    } catch {
      resolvedStreet = resolvedStreet || "Markaziy ko'cha";
    }

    const fullParts = Array.from(
      new Set([resolvedRegion, resolvedDistrict, resolvedStreet].map((p) => p.trim()).filter(Boolean))
    );
    const formattedFull = fullParts.join(', ');

    setRegion(resolvedRegion);
    setRegionQuery(resolvedRegion);
    setDistrict(resolvedDistrict);
    setDistrictQuery(resolvedDistrict);
    setMfy(resolvedStreet);
    setMfyQuery(resolvedStreet);

    setDetectedAddressDetails({
      region: resolvedRegion,
      district: resolvedDistrict,
      street: resolvedStreet,
    });
    setDetectedMapAddress(formattedFull || nearestReg);
  };

  useEffect(() => {
    if (skipNextReverseGeocode) {
      setSkipNextReverseGeocode(false);
      return;
    }
    resolveAddressFromCoords(mapCoords.lat, mapCoords.lng);
  }, [mapCoords.lat, mapCoords.lng]);

  // Sync user info if user changes
  useEffect(() => {
    if (user) {
      if (user.region && REGIONS_AND_DISTRICTS[user.region]) {
        const nextReg = user.region;
        const nextDist =
          user.district && (REGIONS_AND_DISTRICTS[nextReg] || []).includes(user.district)
            ? user.district
            : (REGIONS_AND_DISTRICTS[nextReg] || [])[0] || '';
        const nextMfy = (nextDist ? getMfyListForDistrict(nextDist) : [])[0] || '';
        setRegion(nextReg);
        setRegionQuery(nextReg);
        setDistrict(nextDist);
        setDistrictQuery(nextDist);
        setMfy(nextMfy);
        setMfyQuery(nextMfy);
        setSkipNextReverseGeocode(true);
        setMapCoords(getLocationCoordinates(nextReg, nextDist, nextMfy));
        setDetectedAddressDetails({
          region: nextReg,
          district: nextDist,
          street: nextMfy,
        });
        setDetectedMapAddress([nextReg, nextDist, nextMfy].filter(Boolean).join(', '));
      }
      if (user.firstName || user.displayName) {
        setRecipientFirstName(user.firstName || user.displayName.split(' ')[0] || '');
      }
      if (user.lastName) {
        setRecipientLastName(user.lastName);
      }
      if (user.idCardNumber) {
        setRecipientIdCard(user.idCardNumber);
        if (/^[A-Z]{2}\s?\d{7}$/i.test(user.idCardNumber.trim())) {
          setIdVerifiedInCheckout(true);
        }
      }
      if (user.birthDate) {
        setRecipientBirthDate(user.birthDate);
      }
      if (user.phone) {
        setCabinetPhone(user.phone);
      }
    }
  }, [user]);

  if (!isOpen) return null;

  const grandTotal = items.reduce((sum, item) => sum + item.product.price * item.quantity, 0);

  const formatPrice = (p: number) => new Intl.NumberFormat('uz-UZ').format(p) + " so'm";

  const formatUzPhoneInput = (val: string) => {
    const digits = val.replace(/\D/g, '');
    const local = digits.startsWith('998') ? digits.slice(3, 12) : digits.slice(0, 9);
    if (local.length === 0) return '+998 ';
    if (local.length <= 2) return `+998 ${local}`;
    if (local.length <= 5) return `+998 ${local.slice(0, 2)} ${local.slice(2)}`;
    if (local.length <= 7) return `+998 ${local.slice(0, 2)} ${local.slice(2, 5)} ${local.slice(5)}`;
    return `+998 ${local.slice(0, 2)} ${local.slice(2, 5)} ${local.slice(5, 7)} ${local.slice(7, 9)}`;
  };

  // Step 1 -> Step 2 validation
  const handleProceedToAddress = () => {
    if (!user) {
      onOpenAuth();
      return;
    }
    if (items.length === 0) {
      setError("Savat bo'sh! Iltimos, mahsulot qo'shing.");
      return;
    }
    setError(null);
    setStep(2);
  };

  // Step 2 -> Step 3 validation
  // Agar xaritadan belgilansa yoki real joylashuv uzatilsa, qo'lda viloyat/tuman/MFY yozish va belgilash shart emas — shu joylashuv qabul qilinadi!
  const handleProceedToPhone = () => {
    if (mapPinned || showMapPicker) {
      setMapPinned(true);
      saveDeliveryAddressForFuture(detectedMapAddress, mapCoords.lat, mapCoords.lng);
      setError(null);
      setStep(3);
      return;
    }
    if (!region) {
      setError('Iltimos, viloyatni tanlang yoki xaritadan joylashuvni belgilang!');
      return;
    }
    if (!district) {
      setError('Iltimos, tuman yoki shaharni tanlang!');
      return;
    }
    if (!mfy) {
      setError("Iltimos, MFY (Mahalla fuqarolar yig'ini) ni ro'yxatdan tanlang!");
      return;
    }
    setError(null);
    setStep(3);
  };

  const formatBirthDateInput = (val: string): string => {
    const digits = val.replace(/\D/g, '').slice(0, 8);
    if (digits.length <= 2) return digits;
    if (digits.length <= 4) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
    return `${digits.slice(0, 2)}.${digits.slice(2, 4)}.${digits.slice(4, 8)}`;
  };

  const verifyAndSaveRecipientIdCard = async (): Promise<{
    ok: boolean;
    firstName: string;
    lastName: string;
    formattedId: string;
    birthDate: string;
  }> => {
    const cleanId = recipientIdCard.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!/^[A-Z]{2}\d{7}$/.test(cleanId)) {
      setError('Iltimos, ID karta seriya va raqamini to‘liq kiriting!');
      return { ok: false, firstName: '', lastName: '', formattedId: '', birthDate: '' };
    }
    const formattedId = `${cleanId.slice(0, 2)} ${cleanId.slice(2, 9)}`;

    // Agar foydalanuvchi sozlanmalarda shu ID kartani allaqachon kiritgan bo'lsa
    const existingCleanUserId = (user?.idCardNumber || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (existingCleanUserId === cleanId && (recipientFirstName.trim() || user?.firstName)) {
      const fName = recipientFirstName.trim() || user?.firstName || 'Mijoz';
      const lName = recipientLastName.trim() || user?.lastName || '';
      setIdVerifiedInCheckout(true);
      setRecipientIdCard(formattedId);
      return {
        ok: true,
        firstName: fName,
        lastName: lName,
        formattedId,
        birthDate: recipientBirthDate || user?.birthDate || '',
      };
    }

    const birthDigits = recipientBirthDate.replace(/\D/g, '');
    const effectiveBirth =
      birthDigits.length === 8
        ? `${birthDigits.slice(0, 2)}.${birthDigits.slice(2, 4)}.${birthDigits.slice(4, 8)}`
        : user?.birthDate || '01.01.1995';

    setIdVerifying(true);
    setError(null);
    let resolvedFirst = recipientFirstName.trim() || user?.firstName || '';
    let resolvedLast = recipientLastName.trim() || user?.lastName || '';
    let resolvedPinfl = user?.pinfl || '';
    let resolvedRegion = region || getNearestRegionName(mapCoords.lat, mapCoords.lng) || user?.region || 'Toshkent shahri';
    let resolvedDistrict = district || user?.district || detectedMapAddress;
    let resolvedAddress = user?.address || `${resolvedRegion}, ${resolvedDistrict}`;

    try {
      const res = await fetch('/api/myid/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idCardNumber: cleanId,
          birthDate: effectiveBirth,
        }),
      });
      const json = await res.json();
      if (res.ok && json.success && json.data) {
        resolvedFirst = json.data.firstName || resolvedFirst || 'Mijoz';
        resolvedLast = json.data.lastName || resolvedLast || '';
        resolvedPinfl = json.data.pinfl || resolvedPinfl;
        if (json.data.region) resolvedRegion = json.data.region;
        if (json.data.district) resolvedDistrict = json.data.district;
        if (json.data.address) resolvedAddress = json.data.address;
      }
    } catch {}

    if (!resolvedFirst) {
      resolvedFirst = user?.displayName?.split(' ')[0] || 'Xaridor';
    }

    setRecipientFirstName(resolvedFirst);
    setRecipientLastName(resolvedLast);
    setRecipientIdCard(formattedId);
    setRecipientBirthDate(effectiveBirth);
    setIdVerifiedInCheckout(true);
    setIdVerifying(false);

    if (user) {
      const updatedUser: UserProfile = {
        ...user,
        firstName: resolvedFirst,
        lastName: resolvedLast,
        displayName: `${resolvedFirst} ${resolvedLast}`.trim() || user.displayName,
        idCardNumber: formattedId,
        birthDate: effectiveBirth,
        pinfl: resolvedPinfl || user.pinfl,
        myGovVerified: true,
        phone: cabinetPhone.trim() || user.phone,
        region: resolvedRegion,
        district: resolvedDistrict,
        address: resolvedAddress,
      };
      try {
        await setDoc(doc(db, 'users', user.id), updatedUser, { merge: true });
      } catch {}
      try {
        const savedCust = localStorage.getItem('bunkerstroy_customers');
        const custList = savedCust ? JSON.parse(savedCust) : [];
        if (Array.isArray(custList)) {
          let found = false;
          const updatedCustList = custList.map((c: any) => {
            if (c && c.id === user.id) {
              found = true;
              return { ...c, ...updatedUser };
            }
            return c;
          });
          if (!found) {
            updatedCustList.unshift(updatedUser);
          }
          localStorage.setItem('bunkerstroy_customers', JSON.stringify(updatedCustList));
          window.dispatchEvent(new Event('storage'));
        }
      } catch {}
      if (onUserUpdate) {
        onUserUpdate(updatedUser);
      }
    }

    return {
      ok: true,
      firstName: resolvedFirst,
      lastName: resolvedLast,
      formattedId,
      birthDate: effectiveBirth,
    };
  };

  // Step 3 -> Step 4 validation
  const handleProceedToPayment = async () => {
    const cleanPhoneDigits = cabinetPhone.replace(/\D/g, '');
    if (cleanPhoneDigits.length < 9) {
      setError("Iltimos, telefon raqamini to'liq kiriting!");
      return;
    }

    const idCheck = await verifyAndSaveRecipientIdCard();
    if (!idCheck.ok) {
      return;
    }

    setError(null);
    setStep(4);
  };

  // Step 4 -> Finalize Order & Payment (or Zavod B2B Request)
  const handleFinalizeOrder = async () => {
    if (!user) {
      onOpenAuth();
      return;
    }

    // Card & SMS verification is required ONLY if there are regular (non-Zavod) items being paid right now
    if (!isOnlyZavodCart) {
      const cleanCardDigits = cardNumber.replace(/\D/g, '');
      if (cleanCardDigits.length < 16) {
        setError('Iltimos, 16 xonali karta raqamini to‘liq kiriting!');
        return;
      }
      const cleanExpireDigits = cardExpire.replace(/\D/g, '');
      if (cleanExpireDigits.length < 4) {
        setError('Iltimos, karta amal qilish muddatini (OO/YY) to‘liq kiriting!');
        return;
      }
      const expMonth = Number(cleanExpireDigits.slice(0, 2));
      if (expMonth < 1 || expMonth > 12) {
        setError('Iltimos, karta amal qilish oyini (01 dan 12 gacha) to‘g‘ri kiriting!');
        return;
      }
      if (!cardSmsSent) {
        triggerCardSmsCode();
        return;
      }
      if (!cardSmsInput.trim() || cardSmsInput.trim().toLowerCase() !== sentCardSmsCode.trim().toLowerCase()) {
        setError('SMS tasdiqlash kodi noto‘g‘ri! Iltimos, karta ulangan raqamga yuborilgan kodni to‘liq kiriting.');
        return;
      }
    }

    setLoading(true);
    setError(null);

    saveDeliveryAddressForFuture(detectedMapAddress, mapCoords.lat, mapCoords.lng);

    const fullRecipientName = `${recipientFirstName.trim()} ${recipientLastName.trim()}`.trim();
    const manualAddressText = [region, district, mfy].filter(Boolean).join(', ');
    const baseDeliveryAddress =
      manualAddressText || detectedMapAddress || getNearestRegionName(mapCoords.lat, mapCoords.lng);
    const fullDeliveryAddress = `${baseDeliveryAddress}${
      mapPinned ? ` [Koordinata: ${mapCoords.lat.toFixed(5)}, ${mapCoords.lng.toFixed(5)}]` : ''
    }`;
    const fullPhone =
      secondaryPhone.trim() && secondaryPhone.replace(/\D/g, '').length >= 9
        ? `${cabinetPhone.trim()} (Qo'shimcha: ${secondaryPhone.trim()})`
        : cabinetPhone.trim();

    const createdOrders: Order[] = [];
    let primaryOrder: Order | null = null;
    let secondaryZavodOrder: Order | null = null;

    // 1. If there are Regular (B2C) items -> Paid Order
    if (regularItems.length > 0) {
      const regOrderId = 'ORD-' + Math.floor(100000 + Math.random() * 900000);
      const regTxId = 'TX-' + Date.now().toString(36).toUpperCase();
      const regOrder: Order = {
        id: regOrderId,
        buyerId: user.id,
        buyerName: fullRecipientName || user.displayName || 'Mijoz',
        buyerPhone: fullPhone,
        recipientName: fullRecipientName || 'Mijoz',
        recipientPhone: fullPhone,
        deliveryAddress: fullDeliveryAddress,
        deliveryRegion: region || detectedAddressDetails.region || getNearestRegionName(mapCoords.lat, mapCoords.lng),
        deliveryDistrict: district || detectedAddressDetails.district || detectedMapAddress,
        deliveryStreet: mfy || detectedAddressDetails.street || `${mapCoords.lat.toFixed(5)}, ${mapCoords.lng.toFixed(5)}`,
        deliveryLandmark: mfy || detectedAddressDetails.street || detectedMapAddress,
        items: regularItems.map((i) => ({
          productId: i.product.id,
          title: i.product.title,
          quantity: i.quantity,
          unit: i.product.unit,
          price: i.product.price,
          category: i.product.category,
          supplierId: i.product.supplierId,
          supplierInn: i.product.supplierInn,
          supplierName: i.product.supplierName,
        })),
        totalAmount: regularTotal,
        status: 'pending',
        vehicleType: regularTotal > 5000000 ? 'Gazel (Tezkor yetkazish)' : 'Kichik yuk mashinasi',
        paymentMethod,
        paymentStatus: 'paid',
        paidAt: new Date().toISOString(),
        transactionId: regTxId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      createdOrders.push(regOrder);
      primaryOrder = regOrder;
    }

    // 2. If there are Zavod (B2B) items -> Request Order (payment after Zavod B2B approval; buyer masked as 'Mijoz')
    if (zavodItems.length > 0) {
      const zavodOrderId = 'ORD-B2B-' + Math.floor(100000 + Math.random() * 900000);
      const zavodOrder: Order = {
        id: zavodOrderId,
        buyerId: user.id,
        buyerName: 'Mijoz',
        buyerPhone: '',
        recipientName: 'Mijoz',
        recipientPhone: '',
        deliveryAddress: fullDeliveryAddress,
        deliveryRegion: region || detectedAddressDetails.region || getNearestRegionName(mapCoords.lat, mapCoords.lng),
        deliveryDistrict: district || detectedAddressDetails.district || detectedMapAddress,
        deliveryStreet: mfy || detectedAddressDetails.street || `${mapCoords.lat.toFixed(5)}, ${mapCoords.lng.toFixed(5)}`,
        deliveryLandmark: mfy || detectedAddressDetails.street || detectedMapAddress,
        items: zavodItems.map((i) => ({
          productId: i.product.id,
          title: i.product.title,
          quantity: i.quantity,
          unit: i.product.unit,
          price: i.product.price,
          category: i.product.category,
          supplierId: i.product.supplierId,
          supplierInn: i.product.supplierInn,
          supplierName: i.product.supplierName,
        })),
        totalAmount: zavodTotal,
        status: 'pending',
        vehicleType: zavodTotal > 5000000 ? 'Gazel (Tezkor yetkazish)' : 'Kichik yuk mashinasi',
        paymentMethod,
        paymentStatus: 'awaiting_b2b_approval',
        requiresB2bApproval: true,
        transactionId: 'SO‘ROV-ZAVOD',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      createdOrders.push(zavodOrder);
      if (!primaryOrder) {
        primaryOrder = zavodOrder;
      } else {
        secondaryZavodOrder = zavodOrder;
      }
    }

    if (!primaryOrder) {
      setLoading(false);
      return;
    }

    try {
      try {
        const savedOrders = localStorage.getItem('bunkerstroy_orders');
        const ordersList = savedOrders ? JSON.parse(savedOrders) : [];
        for (const ord of createdOrders) {
          ordersList.unshift(ord);
        }
        localStorage.setItem('bunkerstroy_orders', JSON.stringify(ordersList));

        // Update products salesCount & stock for paid regular items
        if (regularItems.length > 0) {
          const savedProds = localStorage.getItem('bunkerstroy_products');
          if (savedProds) {
            const prodsList = JSON.parse(savedProds);
            if (Array.isArray(prodsList)) {
              const updatedProds = prodsList.map((p: any) => {
                const orderedItem = regularItems.find((it) => it.product.id === p.id);
                if (!orderedItem) return p;
                const nextSales = (Number(p.salesCount) || 0) + orderedItem.quantity;
                const nextStock = Math.max(0, (Number(p.stock) || 0) - orderedItem.quantity);
                try {
                  setDoc(
                    doc(db, 'products', p.id),
                    { stock: nextStock, salesCount: nextSales },
                    { merge: true }
                  ).catch(() => {});
                } catch {}
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

          // Update suppliers totalSalesSum for paid regular items
          const savedSupps = localStorage.getItem('bunkerstroy_suppliers');
          if (savedSupps) {
            const suppsList = JSON.parse(savedSupps);
            if (Array.isArray(suppsList)) {
              const updatedSupps = suppsList.map((s: any) => {
                const supplierSoldAmount = regularItems
                  .filter(
                    (it) =>
                      (it.product.supplierId && it.product.supplierId === s.id) ||
                      (it.product.supplierInn && s.inn && it.product.supplierInn === s.inn) ||
                      (it.product.supplierName || '').toLowerCase() === (s.companyName || '').toLowerCase()
                  )
                  .reduce((acc, it) => acc + it.product.price * it.quantity, 0);
                if (supplierSoldAmount <= 0) return s;
                return {
                  ...s,
                  totalSalesSum: (Number(s.totalSalesSum) || 0) + supplierSoldAmount,
                };
              });
              localStorage.setItem('bunkerstroy_suppliers', JSON.stringify(updatedSupps));
            }
          }

          // Save financial transaction for paid regular order
          const savedTx = localStorage.getItem('bunkerstroy_transactions');
          const txList = savedTx ? JSON.parse(savedTx) : [];
          const newTx = {
            id: primaryOrder.transactionId || 'TX-' + Date.now().toString(36).toUpperCase(),
            type: 'income',
            category: "Ta'minotchi hisob raqamiga o'tkazma (Savdo tushumi)",
            sourceOrDestination: `«${primaryOrder.buyerName}»`,
            amount: regularTotal,
            paymentMethod: `${paymentMethod.toUpperCase()} orqali to‘lov`,
            date: new Date().toISOString().replace('T', ' ').slice(0, 16),
            status: 'completed',
            orderId: primaryOrder.id,
          };
          txList.unshift(newTx);
          localStorage.setItem('bunkerstroy_transactions', JSON.stringify(txList));
        }

        // System log
        const savedLogs = localStorage.getItem('bunkerstroy_logs');
        const logsList = savedLogs ? JSON.parse(savedLogs) : [];
        for (const ord of createdOrders) {
          const isZavodReq = ord.paymentStatus === 'awaiting_b2b_approval';
          logsList.unshift({
            id: `log-${Date.now()}-${ord.id}`,
            action: isZavodReq
              ? 'Zavod (B2B) mahsulotlari uchun so‘rov yuborildi'
              : "Yangi buyurtma va to'lov rasmiylashtirildi",
            actor: isZavodReq ? 'Mijoz' : ord.buyerName,
            category: 'orders_sales',
            details: isZavodReq
              ? `Zavodga buyurtma so‘rovi (#${ord.id}). Summa: ${new Intl.NumberFormat('uz-UZ').format(
                  ord.totalAmount
                )} so'm. Yetkazish manzili: ${fullDeliveryAddress}.`
              : `Jismoniy shaxs kabinetidan yangi buyurtma (#${ord.id}). Summa: ${new Intl.NumberFormat(
                  'uz-UZ'
                ).format(ord.totalAmount)} so'm. To'lov: ${paymentMethod.toUpperCase()}. Manzil: ${fullDeliveryAddress}.`,
            timestamp: new Date().toISOString(),
            ip: '195.158.28.19',
            level: 'success',
          });
        }
        localStorage.setItem('bunkerstroy_logs', JSON.stringify(logsList));

        if (user) {
          recordCabinetLog({
            userId: user.id,
            userLogin: user.email || user.displayName,
            userName: primaryOrder.buyerName,
            action: 'order_placed',
            actionLabel: `Yangi buyurtma rasmiylashtirildi (#${primaryOrder.id})`,
            details: `Buyurtma summasi: ${new Intl.NumberFormat('uz-UZ').format(
              grandTotal
            )} so'm. Yetkazish: ${fullDeliveryAddress}.`,
          });
        }

        window.dispatchEvent(new CustomEvent('bunkerstroy_orders_updated'));
        window.dispatchEvent(new CustomEvent('bunkerstroy_finance_updated'));
        window.dispatchEvent(new Event('storage'));
      } catch (locErr) {
        console.warn('LocalStorage error:', locErr);
      }

      // Persist all created orders to backend & Firestore
      for (const ord of createdOrders) {
        try {
          const apiRes = await createOrderApi({
            buyerName: ord.buyerName,
            buyerPhone: ord.buyerPhone,
            deliveryAddress: ord.deliveryAddress,
            destinationRegion: ord.deliveryRegion || region,
            paymentMethod: ord.paymentMethod,
            items: ord.items.map((i: any) => ({
              productId: i.productId || i.id,
              quantity: i.quantity,
              price: i.price,
            })),
            vehicleType: ord.vehicleType,
            buyerType: user?.userType || 'individual',
            buyerInn: user?.inn,
            companyName: user?.companyName,
          });
          if (apiRes && apiRes.data) {
            ord.id = apiRes.data.id;
            ord.totalAmount = apiRes.data.totalAmount;
            (ord as any).escrowSplit = (apiRes.data as any).escrowSplit;
          }
        } catch (apiErr) {
          console.warn('Backend createOrderApi sync notice:', apiErr);
        }

        try {
          await setDoc(doc(db, 'orders', ord.id), ord);
        } catch (fsErr) {
          console.warn('Firestore order sync notice:', fsErr);
        }
      }

      setCompletedOrder(primaryOrder);
      setCompletedZavodOrder(secondaryZavodOrder);
      onClearCart();
      setStep(5);
      onOrderCompleted(primaryOrder);
    } catch (err: any) {
      console.error('Order creation error:', err);
      try {
        handleFirestoreError(err, OperationType.CREATE, 'orders');
      } catch (e: any) {
        setError("Buyurtmani rasmiylashtirishda xatolik yuz berdi. Iltimos qayta urinib ko'ring.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handlePrintReceipt = () => {
    window.print();
  };

  const expectedSmsLength = sentCardSmsCode ? sentCardSmsCode.length : 6;

  return (
    <div className="fixed inset-0 z-[60] w-screen h-screen bg-[#151719] flex flex-col overflow-hidden animate-fadeIn">
      <div className="bg-[#151719] text-[#F5F5F2] w-full h-full flex flex-col overflow-hidden">
        {/* Modal Top Header */}
        <div className="px-5 sm:px-8 py-4 border-b border-[#51504A] bg-[#1D2023] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-[#292C2F] text-[#FFB800] border border-[#51504A]">
              <Package className="w-6 h-6 stroke-[2.2]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg sm:text-xl font-bold text-[#F5F5F2]">
                  Jismoniy Shaxs Kabineti: Buyurtma Berish
                </h2>
                <span className="hidden sm:inline-block px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-[#292C2F] text-[#FFB800] border border-[#51504A]">
                  4 BOSQICHLI TIZIM
                </span>
              </div>
              <p className="text-xs text-[#B8B8B3]">
                Buyurtmani tasdiqlash → Manzilni tasdiqlash → Telefon raqam → To'lov
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="text-[#B8B8B3] hover:text-[#F5F5F2] p-2 rounded-lg bg-[#222528] hover:bg-[#292C2F] border border-[#51504A] transition-all cursor-pointer"
            title="Yopish"
          >
            ✕
          </button>
        </div>

        {/* 4 Ta Bosqich Progress Bar (Step Indicator) */}
        {step < 5 && (
          <div className="px-4 sm:px-8 py-3.5 bg-[#222528] border-b border-[#51504A]">
            <div className="grid grid-cols-4 gap-2 sm:gap-3 text-center">
              {/* 1. Buyurtmani tasdiqlash */}
              <div
                onClick={() => setStep(1)}
                className={`flex flex-col sm:flex-row items-center justify-center gap-1.5 p-2 rounded-lg cursor-pointer transition-all border ${
                  step === 1
                    ? 'bg-[#FFB800] text-[#151719] font-bold border-[#FFC928] shadow-sm'
                    : step > 1
                    ? 'bg-[#292C2F] text-[#F5F5F2] border-[#51504A] font-medium'
                    : 'bg-[#151719] text-[#B8B8B3] border-[#51504A]'
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold font-mono ${
                    step === 1
                      ? 'bg-[#151719] text-[#FFB800]'
                      : step > 1
                      ? 'bg-[#FFB800] text-[#151719]'
                      : 'bg-[#292C2F] text-[#B8B8B3]'
                  }`}
                >
                  {step > 1 ? '✓' : '1'}
                </div>
                <span className="text-[11px] sm:text-xs truncate">1. Buyurtmani tasdiqlash</span>
              </div>

              {/* 2. Manzilni tasdiqlash */}
              <div
                onClick={() => step > 1 && setStep(2)}
                className={`flex flex-col sm:flex-row items-center justify-center gap-1.5 p-2 rounded-lg transition-all border ${
                  step === 2
                    ? 'bg-[#FFB800] text-[#151719] font-bold border-[#FFC928] shadow-sm cursor-pointer'
                    : step > 2
                    ? 'bg-[#292C2F] text-[#F5F5F2] border-[#51504A] font-medium cursor-pointer'
                    : 'bg-[#151719] text-[#B8B8B3] border-[#51504A] opacity-60'
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold font-mono ${
                    step === 2
                      ? 'bg-[#151719] text-[#FFB800]'
                      : step > 2
                      ? 'bg-[#FFB800] text-[#151719]'
                      : 'bg-[#292C2F] text-[#B8B8B3]'
                  }`}
                >
                  {step > 2 ? '✓' : '2'}
                </div>
                <span className="text-[11px] sm:text-xs truncate">2. Manzilni tasdiqlash</span>
              </div>

              {/* 3. Telefon raqam */}
              <div
                onClick={() => step > 2 && setStep(3)}
                className={`flex flex-col sm:flex-row items-center justify-center gap-1.5 p-2 rounded-lg transition-all border ${
                  step === 3
                    ? 'bg-[#FFB800] text-[#151719] font-bold border-[#FFC928] shadow-sm cursor-pointer'
                    : step > 3
                    ? 'bg-[#292C2F] text-[#F5F5F2] border-[#51504A] font-medium cursor-pointer'
                    : 'bg-[#151719] text-[#B8B8B3] border-[#51504A] opacity-60'
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold font-mono ${
                    step === 3
                      ? 'bg-[#151719] text-[#FFB800]'
                      : step > 3
                      ? 'bg-[#FFB800] text-[#151719]'
                      : 'bg-[#292C2F] text-[#B8B8B3]'
                  }`}
                >
                  {step > 3 ? '✓' : '3'}
                </div>
                <span className="text-[11px] sm:text-xs truncate">3. Telefon raqam</span>
              </div>

              {/* 4. To'lov */}
              <div
                onClick={() => step > 3 && setStep(4)}
                className={`flex flex-col sm:flex-row items-center justify-center gap-1.5 p-2 rounded-lg transition-all border ${
                  step === 4
                    ? 'bg-[#FFB800] text-[#151719] font-bold border-[#FFC928] shadow-sm cursor-pointer'
                    : 'bg-[#151719] text-[#B8B8B3] border-[#51504A] opacity-60'
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold font-mono ${
                    step === 4 ? 'bg-[#151719] text-[#FFB800]' : 'bg-[#292C2F] text-[#B8B8B3]'
                  }`}
                >
                  4
                </div>
                <span className="text-[11px] sm:text-xs truncate">4. To'lov</span>
              </div>
            </div>
          </div>
        )}

        {/* Modal Body */}
        <div className="p-5 sm:p-7 overflow-y-auto space-y-6 flex-1 bg-[#040e24]">
          {error && (
            <div className="flex items-center gap-2 p-3.5 rounded-2xl bg-red-950/80 text-red-300 border border-red-600 text-xs font-bold animate-fadeIn">
              <AlertCircle className="w-5 h-5 shrink-0 text-red-400" />
              <span>{error}</span>
            </div>
          )}

          {/* ============================================================== */}
          {/* 1-BOSQICH: BUYURTMANI TASDIQLASH                              */}
          {/* ============================================================== */}
          {step === 1 && (
            <div className="space-y-6 animate-fadeIn">
              <div className="pb-3 border-b border-blue-500/30">
                <h3 className="text-base sm:text-lg font-black text-amber-400 flex items-center gap-2">
                  <Package className="w-5 h-5" />
                  1-Bosqich: Buyurtma qilingan tovarlar ro'yxatini tasdiqlash
                </h3>
              </div>

              {items.length === 0 ? (
                <div className="text-center py-16 space-y-3 bg-[#07193f] rounded-2xl border border-blue-500/40 p-6">
                  <Package className="w-12 h-12 text-slate-500 mx-auto" />
                  <p className="text-[#B8B8B3] font-bold text-sm">Hozirda savatda mahsulot yo'q.</p>
                  <button
                    onClick={onClose}
                    className="btn-industrial-yellow px-5 py-2.5 rounded-lg text-xs font-bold cursor-pointer"
                  >
                    Bunkerdan mahsulot tanlash
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="overflow-x-auto rounded-lg border border-[#51504A] bg-[#151719]">
                    <table className="w-full text-left border-collapse text-xs sm:text-sm">
                      <thead>
                        <tr className="bg-[#222528] text-[#F5F5F2] font-bold border-b border-[#51504A]">
                          <th className="py-3 px-4">№</th>
                          <th className="py-3 px-4">Mahsulot</th>
                          <th className="py-3 px-4">Narxi</th>
                          <th className="py-3 px-4 text-center">Miqdori</th>
                          <th className="py-3 px-4 text-right">Jami Summa</th>
                          <th className="py-3 px-4 text-center">O'chirish</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#51504A]/60">
                        {items.map((item, idx) => (
                          <tr key={item.product.id} className="hover:bg-[#222528] transition-colors">
                            <td className="py-3.5 px-4 font-mono font-bold text-[#B8B8B3]">{idx + 1}</td>
                            <td className="py-3.5 px-4">
                              <div className="flex items-center gap-3">
                                <img
                                  src={item.product.image}
                                  alt={item.product.title}
                                  className="w-12 h-12 rounded-lg object-cover bg-[#222528] border border-[#51504A] shrink-0"
                                />
                                <div>
                                  <div className="font-bold text-[#F5F5F2] leading-snug line-clamp-1">
                                    {item.product.title}
                                  </div>
                                  <div className="text-[11px] text-[#FFB800]">
                                    {item.product.category}
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td className="py-3.5 px-4 font-mono font-bold whitespace-nowrap text-[#F5F5F2]">
                              {formatPrice(item.product.price)}
                            </td>
                            <td className="py-3.5 px-4 text-center whitespace-nowrap">
                              <div className="inline-flex items-center gap-2 bg-[#222528] px-2 py-1 rounded-lg border border-[#51504A]">
                                <button
                                  type="button"
                                  onClick={() =>
                                    onUpdateQuantity(item.product.id, Math.max(1, item.quantity - 1))
                                  }
                                  className="p-1 text-[#B8B8B3] hover:text-[#F5F5F2] rounded hover:bg-[#292C2F] transition-colors"
                                >
                                  <Minus className="w-3.5 h-3.5" />
                                </button>
                                <span className="text-xs font-bold px-2 min-w-[44px] text-center font-mono text-[#F5F5F2]">
                                  {item.quantity} {item.product.unit}
                                </span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    onUpdateQuantity(item.product.id, item.quantity + 1)
                                  }
                                  className="p-1 text-[#B8B8B3] hover:text-[#F5F5F2] rounded hover:bg-[#292C2F] transition-colors"
                                >
                                  <Plus className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                            <td className="py-3.5 px-4 text-right font-mono font-bold text-[#FFB800] whitespace-nowrap">
                              {formatPrice(item.product.price * item.quantity)}
                            </td>
                            <td className="py-3.5 px-4 text-center">
                              <button
                                type="button"
                                onClick={() => onRemoveItem(item.product.id)}
                                className="p-1.5 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors cursor-pointer"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Summary Box */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                    <div className="bg-[#222528] p-4 rounded-lg border border-[#51504A] space-y-2 text-xs">
                      <div className="font-bold text-[#FFB800] flex items-center gap-1.5">
                        <ShieldCheck className="w-4 h-4" />
                        Platforma Kafolati
                      </div>
                      <p className="text-[#B8B8B3] leading-relaxed text-[11px]">
                        • Barcha mahsulotlar O'zbekiston standartlariga muvofiq sertifikatlangan.
                      </p>
                    </div>

                    <div className="bg-[#222528] p-4 rounded-lg border border-[#51504A] flex items-center justify-between">
                      <span className="text-sm font-bold text-[#F5F5F2]">Jami To'lanadigan Summa:</span>
                      <span className="text-xl font-black text-[#FFB800] font-mono">
                        {formatPrice(grandTotal)}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ============================================================== */}
          {/* 2-BOSQICH: MANZILNI TASDIQLASH                                */}
          {/* ============================================================== */}
          {step === 2 && (
            <div className="space-y-5 animate-fadeIn">
              <div className="pb-3 border-b border-[#51504A]">
                <h3 className="text-base sm:text-lg font-bold text-[#FFB800] flex items-center gap-2">
                  <MapPin className="w-5 h-5" />
                  2-Bosqich: Manzilni tasdiqlash
                </h3>
              </div>

              {/* Avval saqlangan manzillardan bir bosishda foydalanish imkoni */}
              {savedDeliveryAddresses.length > 0 && (
                <div className="p-4 rounded-xl bg-[#222528] border border-[#51504A] space-y-2.5">
                  <span className="text-xs font-bold text-[#FFB800] block">
                    Avval saqlangan yetkazish manzillaringiz (tanlash uchun bosing):
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {savedDeliveryAddresses.map((savedItem, sIdx) => {
                      const isSelectedSaved =
                        detectedMapAddress.toLowerCase() === savedItem.address.toLowerCase();
                      return (
                        <button
                          key={sIdx}
                          type="button"
                          onClick={() => {
                            setSkipNextReverseGeocode(false);
                            setMapCoords({ lat: savedItem.lat, lng: savedItem.lng });
                            setDetectedMapAddress(savedItem.address);
                            setMapPinned(true);
                            setAddressConfirmedNotice(true);
                            setError(null);
                          }}
                          className={`px-3 py-2 rounded-xl border text-xs font-bold flex items-center gap-2 cursor-pointer transition-all text-left ${
                            isSelectedSaved
                              ? 'bg-emerald-500/20 border-emerald-400 text-white shadow'
                              : 'bg-[#151719] border-[#51504A] text-[#F5F5F2] hover:border-[#FFB800]'
                          }`}
                        >
                          <MapPin className="w-3.5 h-3.5 text-[#FFB800] shrink-0" />
                          <span>{savedItem.address}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 2-Column Layout: Left = Map + Accepted Location, Right = Vertical Cascading Lists (Viloyat, Tuman/shahar, Mahalla) */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
                {/* CHAP USTUN: Xarita va Qabul qilingan yetkazish joylashuvi */}
                <div className="lg:col-span-7 space-y-4">
                  <div className="rounded-xl border border-[#51504A] overflow-hidden bg-[#222528] p-4 space-y-3">
                    {/* Interactive Delivery Map */}
                    <InteractiveDeliveryMap
                      lat={mapCoords.lat}
                      lng={mapCoords.lng}
                      onChangeCoords={(nextLat, nextLng) => {
                        setSkipNextReverseGeocode(false);
                        setMapCoords({ lat: nextLat, lng: nextLng });
                        setMapPinned(true);
                        setError(null);
                      }}
                    />

                    {/* Joylashuvni Tasdiqlash tugmasi */}
                    <div className="flex items-center justify-end pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          setMapPinned(true);
                          setAddressConfirmedNotice(true);
                          saveDeliveryAddressForFuture(detectedMapAddress, mapCoords.lat, mapCoords.lng);
                          setError(null);
                        }}
                        className="btn-industrial-yellow px-5 py-2.5 rounded-lg text-xs font-bold cursor-pointer shadow-sm"
                      >
                        Joylashuvni Tasdiqlash
                      </button>
                    </div>
                  </div>

                  {/* Qabul qilingan yetkazish joylashuvi ko'rsatkichi */}
                  <div className="p-4 rounded-xl bg-[#222528] border border-emerald-500/50 space-y-2.5">
                    <div className="flex items-start gap-3">
                      <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-bold text-emerald-400">
                          Qabul qilingan yetkazish joylashuvi:
                        </div>
                        <div className="text-sm sm:text-base font-bold text-[#F5F5F2] mt-0.5 break-words">
                          {detectedMapAddress}
                        </div>

                        {addressConfirmedNotice && (
                          <div className="text-[11px] text-emerald-300 font-bold mt-2">
                            ✓ Manzil saqlandi — keyingi buyurtmalarda ham shu manzildan foydalanishingiz mumkin
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* O'NG USTUN: Ustun shaklida Viloyat, Shahar yoki tuman, Mahalla (ustiga bosganda ro'yxat ochiladi va yozilish ketma-ketligida belgilanib boradi) */}
                <div className="lg:col-span-5 p-4 sm:p-5 rounded-xl bg-[#222528] border border-[#51504A] space-y-4">
                  <div className="pb-2 border-b border-[#51504A]">
                    <div className="text-xs sm:text-sm font-black text-[#FFB800]">
                      Yetkazish manzilini ro‘yxatdan tanlang:
                    </div>
                    <p className="text-[11px] text-[#B8B8B3] mt-0.5">
                      Ustiga bosing yoki yozing — tanlangach xaritada avtomatik ko‘rsatiladi
                    </p>
                  </div>

                  {/* 1. Viloyat / Hudud */}
                  <div className="relative space-y-1.5">
                    <label className="text-xs font-bold text-[#B8B8B3] block">
                      1. Viloyat / Hudud:
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        value={regionQuery}
                        onFocus={() => {
                          setOpenDropdown('region');
                          setRegionQuery('');
                        }}
                        onBlur={() => {
                          setTimeout(() => {
                            setOpenDropdown((prev) => (prev === 'region' ? null : prev));
                            setRegionQuery(region);
                          }, 180);
                        }}
                        onChange={(e) => {
                          const val = e.target.value;
                          setRegionQuery(val);
                          setOpenDropdown('region');
                          const exact = allRegionsList.find(
                            (r) => r.toLowerCase() === val.trim().toLowerCase()
                          );
                          if (exact) {
                            handleSelectRegion(exact);
                          }
                        }}
                        placeholder="Viloyatni tanlang..."
                        className="w-full px-3.5 py-2.5 pr-9 rounded-lg bg-[#151719] border border-[#51504A] focus:border-[#FFB800] text-xs sm:text-sm font-bold text-[#FFB800] focus:outline-none"
                      />
                      <button
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          if (openDropdown === 'region') {
                            setOpenDropdown(null);
                            setRegionQuery(region);
                          } else {
                            setOpenDropdown('region');
                            setRegionQuery('');
                          }
                        }}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#FFB800] text-xs font-bold px-1 cursor-pointer"
                      >
                        ▼
                      </button>
                    </div>

                    {openDropdown === 'region' && (
                      <div className="absolute z-30 left-0 right-0 mt-1 max-h-52 overflow-y-auto rounded-xl bg-[#151719] border-2 border-[#FFB800] shadow-2xl divide-y divide-[#51504A]/50">
                        {filteredRegions.length === 0 ? (
                          <div className="px-3.5 py-2.5 text-xs text-[#B8B8B3]">
                            Mos viloyat topilmadi
                          </div>
                        ) : (
                          filteredRegions.map((regItem) => (
                            <button
                              key={regItem}
                              type="button"
                              onMouseDown={(e) => {
                                e.preventDefault();
                                handleSelectRegion(regItem);
                              }}
                              className={`w-full text-left px-3.5 py-2.5 text-xs sm:text-sm font-bold transition-colors cursor-pointer flex items-center justify-between ${
                                regItem === region
                                  ? 'bg-[#FFB800] text-[#151719]'
                                  : 'text-[#F5F5F2] hover:bg-[#292C2F]'
                              }`}
                            >
                              <span>{regItem}</span>
                              {regItem === region && <span>✓</span>}
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>

                  {/* 2. Tuman yoki shahar */}
                  <div className="relative space-y-1.5">
                    <label className="text-xs font-bold text-[#B8B8B3] block">
                      2. Tuman yoki shahar:
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        value={districtQuery}
                        onFocus={() => {
                          setOpenDropdown('district');
                          setDistrictQuery('');
                        }}
                        onBlur={() => {
                          setTimeout(() => {
                            setOpenDropdown((prev) => (prev === 'district' ? null : prev));
                            setDistrictQuery(district);
                          }, 180);
                        }}
                        onChange={(e) => {
                          const val = e.target.value;
                          setDistrictQuery(val);
                          setOpenDropdown('district');
                          const exact = districts.find(
                            (d) => d.toLowerCase() === val.trim().toLowerCase()
                          );
                          if (exact) {
                            handleSelectDistrict(exact);
                          }
                        }}
                        placeholder="Tuman yoki shaharni tanlang..."
                        className="w-full px-3.5 py-2.5 pr-9 rounded-lg bg-[#151719] border border-[#51504A] focus:border-[#FFB800] text-xs sm:text-sm font-bold text-[#F5F5F2] focus:outline-none"
                      />
                      <button
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          if (openDropdown === 'district') {
                            setOpenDropdown(null);
                            setDistrictQuery(district);
                          } else {
                            setOpenDropdown('district');
                            setDistrictQuery('');
                          }
                        }}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#FFB800] text-xs font-bold px-1 cursor-pointer"
                      >
                        ▼
                      </button>
                    </div>

                    {openDropdown === 'district' && (
                      <div className="absolute z-30 left-0 right-0 mt-1 max-h-52 overflow-y-auto rounded-xl bg-[#151719] border-2 border-[#FFB800] shadow-2xl divide-y divide-[#51504A]/50">
                        {filteredDistricts.length === 0 ? (
                          <div className="px-3.5 py-2.5 text-xs text-[#B8B8B3]">
                            Mos tuman yoki shahar topilmadi
                          </div>
                        ) : (
                          filteredDistricts.map((distItem) => (
                            <button
                              key={distItem}
                              type="button"
                              onMouseDown={(e) => {
                                e.preventDefault();
                                handleSelectDistrict(distItem);
                              }}
                              className={`w-full text-left px-3.5 py-2.5 text-xs sm:text-sm font-bold transition-colors cursor-pointer flex items-center justify-between ${
                                distItem === district
                                  ? 'bg-[#FFB800] text-[#151719]'
                                  : 'text-[#F5F5F2] hover:bg-[#292C2F]'
                              }`}
                            >
                              <span>{distItem}</span>
                              {distItem === district && <span>✓</span>}
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>

                  {/* 3. Ko‘cha / Mahalla */}
                  <div className="relative space-y-1.5">
                    <label className="text-xs font-bold text-[#B8B8B3] block">
                      3. Ko‘cha / Mahalla:
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        value={mfyQuery}
                        onFocus={() => {
                          setOpenDropdown('mfy');
                          setMfyQuery('');
                        }}
                        onBlur={() => {
                          setTimeout(() => {
                            setOpenDropdown((prev) => (prev === 'mfy' ? null : prev));
                            setMfyQuery(mfy);
                          }, 180);
                        }}
                        onChange={(e) => {
                          const val = e.target.value;
                          setMfyQuery(val);
                          setOpenDropdown('mfy');
                          const exact = mfyList.find(
                            (m) => m.toLowerCase() === val.trim().toLowerCase()
                          );
                          if (exact) {
                            handleSelectMfy(exact);
                          }
                        }}
                        placeholder="Mahallani ro‘yxatdan tanlang..."
                        className="w-full px-3.5 py-2.5 pr-9 rounded-lg bg-[#151719] border border-[#51504A] focus:border-[#FFB800] text-xs sm:text-sm font-bold text-emerald-300 focus:outline-none"
                      />
                      <button
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          if (openDropdown === 'mfy') {
                            setOpenDropdown(null);
                            setMfyQuery(mfy);
                          } else {
                            setOpenDropdown('mfy');
                            setMfyQuery('');
                          }
                        }}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#FFB800] text-xs font-bold px-1 cursor-pointer"
                      >
                        ▼
                      </button>
                    </div>

                    {openDropdown === 'mfy' && (
                      <div className="absolute z-30 left-0 right-0 mt-1 max-h-52 overflow-y-auto rounded-xl bg-[#151719] border-2 border-[#FFB800] shadow-2xl divide-y divide-[#51504A]/50">
                        {filteredMfys.length === 0 ? (
                          <div className="px-3.5 py-2.5 text-xs text-[#B8B8B3]">
                            Mos mahalla topilmadi
                          </div>
                        ) : (
                          filteredMfys.map((mfyItem) => (
                            <button
                              key={mfyItem}
                              type="button"
                              onMouseDown={(e) => {
                                e.preventDefault();
                                handleSelectMfy(mfyItem);
                              }}
                              className={`w-full text-left px-3.5 py-2.5 text-xs sm:text-sm font-bold transition-colors cursor-pointer flex items-center justify-between ${
                                mfyItem === mfy
                                  ? 'bg-[#FFB800] text-[#151719]'
                                  : 'text-[#F5F5F2] hover:bg-[#292C2F]'
                              }`}
                            >
                              <span>{mfyItem}</span>
                              {mfyItem === mfy && <span>✓</span>}
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>

                  {/* Tanlangan manzil xulosasi (ustun shaklida) */}
                  <div className="pt-3 border-t border-[#51504A] space-y-2 text-xs">
                    <div className="bg-[#151719] px-3 py-2 rounded-lg border border-[#51504A] flex items-center justify-between gap-2">
                      <span className="text-[11px] text-[#B8B8B3]">Viloyat / Hudud:</span>
                      <span className="font-bold text-[#FFB800] text-right">{region || detectedAddressDetails.region}</span>
                    </div>
                    <div className="bg-[#151719] px-3 py-2 rounded-lg border border-[#51504A] flex items-center justify-between gap-2">
                      <span className="text-[11px] text-[#B8B8B3]">Tuman yoki shahar:</span>
                      <span className="font-bold text-[#F5F5F2] text-right">{district || detectedAddressDetails.district}</span>
                    </div>
                    <div className="bg-[#151719] px-3 py-2 rounded-lg border border-[#51504A] flex items-center justify-between gap-2">
                      <span className="text-[11px] text-[#B8B8B3]">Ko‘cha / Mahalla:</span>
                      <span className="font-bold text-emerald-300 text-right">{mfy || detectedAddressDetails.street}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ============================================================== */}
          {/* 3-BOSQICH: ID KARTA RAQAMI VA TELEFON RAQAM                   */}
          {/* ============================================================== */}
          {step === 3 && (
            <div className="space-y-6 animate-fadeIn">
              <div className="pb-3 border-b border-[#51504A]">
                <h3 className="text-base sm:text-lg font-bold text-[#FFB800] flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5" />
                  3-Bosqich: Qabul qiluvchi ID ma'lumotlari va telefon raqami
                </h3>
              </div>

              <div className="max-w-xl mx-auto space-y-5 bg-[#222528] p-5 sm:p-7 rounded-lg border border-[#51504A]">
                {user?.idCardNumber && /^[A-Z]{2}\s?\d{7}$/i.test(user.idCardNumber.trim()) ? (
                  <div className="p-4 rounded-xl bg-[#151719] border border-emerald-500/50 space-y-2">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                        <CheckCircle className="w-4 h-4 shrink-0" />
                        <span>Shaxsiy ma'lumotlarda ID karta tasdiqlangan</span>
                      </span>
                      <span className="px-2.5 py-0.5 rounded bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 font-mono font-black text-xs">
                        ID: {user.idCardNumber}
                      </span>
                    </div>
                    <div className="text-sm font-bold text-[#F5F5F2]">
                      Qabul qiluvchi: {`${recipientFirstName} ${recipientLastName}`.trim() || user.displayName}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3 p-4 rounded-xl bg-[#151719] border border-[#51504A]">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className="text-xs font-bold text-[#FFB800]">
                        Qabul qiluvchi ID Karta ma'lumotlari *
                      </span>
                      <span className="text-[10px] text-sky-300 font-mono">
                        Shaxsiy ma'lumotlarga ham avtomatik saqlanadi
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-[#B8B8B3] block">
                          ID Karta Raqami *
                        </label>
                        <input
                          type="text"
                          maxLength={10}
                          value={recipientIdCard}
                          onChange={(e) => {
                            const cleaned = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
                            const letters = cleaned.replace(/[^A-Z]/g, '').slice(0, 2);
                            const digits = cleaned.slice(letters.length).replace(/\D/g, '').slice(0, 7);
                            const formatted = digits.length > 0 ? `${letters} ${digits}` : letters;
                            setRecipientIdCard(formatted);
                            setIdVerifiedInCheckout(false);
                            setError(null);
                          }}
                          placeholder=""
                          className="w-full px-3.5 py-2.5 rounded-lg bg-[#222528] border border-[#51504A] text-[#F5F5F2] font-mono font-bold text-sm uppercase tracking-wider focus:border-[#FFB800] focus:outline-none"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-xs font-bold text-[#B8B8B3] block">
                          Tug‘ilgan Sana (KK.OO.YYYY)
                        </label>
                        <input
                          type="text"
                          inputMode="numeric"
                          maxLength={10}
                          value={recipientBirthDate}
                          onChange={(e) => {
                            setRecipientBirthDate(formatBirthDateInput(e.target.value));
                            setIdVerifiedInCheckout(false);
                            setError(null);
                          }}
                          placeholder=""
                          className="w-full px-3.5 py-2.5 rounded-lg bg-[#222528] border border-[#51504A] text-[#F5F5F2] font-mono font-bold text-sm tracking-wider focus:border-[#FFB800] focus:outline-none"
                        />
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => verifyAndSaveRecipientIdCard()}
                      disabled={idVerifying}
                      className="w-full py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-60 text-slate-950 font-black text-xs flex items-center justify-center gap-2 cursor-pointer transition-all"
                    >
                      <CheckCircle className="w-4 h-4" />
                      <span>{idVerifying ? 'Tekshirilmoqda...' : 'ID Kartani Tasdiqlash va Saqlash'}</span>
                    </button>

                    {idVerifiedInCheckout && (recipientFirstName || recipientLastName) && (
                      <div className="p-2.5 rounded-lg bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-xs font-bold flex items-center justify-between">
                        <span>✓ Tasdiqlandi: {`${recipientFirstName} ${recipientLastName}`.trim()}</span>
                        <span className="font-mono">{recipientIdCard}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Asosiy Telefon raqam */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[#B8B8B3] flex items-center justify-between">
                    <span>Telefon raqami (Kabinetdagi raqam) *</span>
                    <span className="text-[10px] text-emerald-400 font-bold flex items-center gap-1">
                      <CheckCircle className="w-3 h-3" /> Kabinet raqami
                    </span>
                  </label>
                  <div className="flex items-center rounded-lg bg-[#151719] border border-[#51504A] focus-within:border-[#FFB800] overflow-hidden">
                    <span className="px-3.5 py-3 text-xs sm:text-sm font-mono font-bold text-[#FFB800] border-r border-[#51504A] bg-[#292C2F]">
                      <Phone className="w-4 h-4" />
                    </span>
                    <input
                      type="tel"
                      inputMode="numeric"
                      maxLength={17}
                      value={cabinetPhone}
                      onChange={(e) => setCabinetPhone(formatUzPhoneInput(e.target.value))}
                      className="w-full px-4 py-3 bg-transparent text-[#F5F5F2] font-mono font-bold text-sm sm:text-base focus:outline-none"
                    />
                  </div>
                </div>

                {/* Qo'shimcha telefon raqam */}
                <div className="pt-2 border-t border-[#51504A]">
                  {!showAdditionalPhone && !secondaryPhone ? (
                    <button
                      type="button"
                      onClick={() => {
                        setShowAdditionalPhone(true);
                        setSecondaryPhone('+998 ');
                      }}
                      className="w-full py-2.5 px-4 rounded-lg bg-[#151719] hover:bg-[#292C2F] text-[#FFB800] border border-dashed border-[#FFB800]/60 text-xs font-bold flex items-center justify-center gap-2 cursor-pointer transition-colors"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Qo‘shimcha telefon raqam qo‘shish</span>
                    </button>
                  ) : (
                    <div className="space-y-1.5 animate-fadeIn">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-[#B8B8B3] flex items-center gap-1.5">
                          <Phone className="w-3.5 h-3.5 text-[#FFB800]" />
                          Qo‘shimcha telefon raqami
                        </label>
                        <button
                          type="button"
                          onClick={() => {
                            setShowAdditionalPhone(false);
                            setSecondaryPhone('');
                          }}
                          className="text-[11px] text-red-400 hover:underline cursor-pointer"
                        >
                          O‘chirish
                        </button>
                      </div>
                      <input
                        type="tel"
                        inputMode="numeric"
                        maxLength={17}
                        value={secondaryPhone}
                        onChange={(e) => setSecondaryPhone(formatUzPhoneInput(e.target.value))}
                        placeholder="+998 XX XXX XX XX"
                        className="w-full px-4 py-3 rounded-lg bg-[#151719] border border-[#51504A] text-[#F5F5F2] font-mono font-bold text-sm focus:border-[#FFB800] focus:outline-none"
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ============================================================== */}
          {/* 4-BOSQICH: TO'LOV VA ZAVOD (B2B) SO'ROV TARTIBI               */}
          {/* ============================================================== */}
          {step === 4 && (
            <div className="space-y-6 animate-fadeIn">
              <div className="pb-3 border-b border-[#51504A]">
                <h3 className="text-base sm:text-lg font-bold text-[#FFB800] flex items-center gap-2">
                  <CreditCard className="w-5 h-5" />
                  {isOnlyZavodCart
                    ? "4-Bosqich: Zavod (B2B) mahsulotlari uchun so'rov yuborish"
                    : "4-Bosqich: To'lov va so'rovni tasdiqlash"}
                </h3>
              </div>

              {/* ZAVOD (B2B) MAHSULOTLARI BO'YICHA TUSHUNTIRISH OYNASI */}
              {hasZavodItems && (
                <div className="p-4 sm:p-5 rounded-xl bg-amber-500/10 border-2 border-[#FFB800] space-y-3">
                  <div className="flex items-start gap-3">
                    <Building2 className="w-6 h-6 text-[#FFB800] shrink-0 mt-0.5" />
                    <div className="space-y-2 flex-1">
                      <div className="text-sm sm:text-base font-black text-[#FFB800]">
                        {isMixedCart
                          ? 'Aralash buyurtma tushuntirishi: Zavod (B2B) mahsulotlari uchun so‘rov yuboriladi!'
                          : 'Zavod (B2B) mahsulotlari uchun to‘lovdan oldin so‘rov yuboriladi!'}
                      </div>
                      <p className="text-xs text-[#F5F5F2] leading-relaxed">
                        {isMixedCart
                          ? `Savatingizda ham oddiy do‘kon mahsulotlari (${regularItems.length} ta — ${formatPrice(
                              regularTotal
                            )}), ham Zavod (B2B) mahsulotlari (${zavodItems.length} ta — ${formatPrice(
                              zavodTotal
                            )}) mavjud. Zavod mahsulotlari uchun avval Zavod kabinetiga so‘rov yuboriladi va Zavod (B2B) kabineti tasdiqlaganidan so‘ng to‘lov qilinadi. Oddiy mahsulotlar uchun esa to‘lov hozir amalga oshiriladi.`
                          : `Siz Zavod (B2B) mahsulotlaridan buyurtma bermoqdasiz (${zavodItems.length} ta mahsulot — ${formatPrice(
                              zavodTotal
                            )}). To‘lovni amalga oshirishdan oldin Zavod kabinetiga so‘rov yuboriladi. Zavod (B2B) kabineti so‘rovni tasdiqlaganidan so‘ng «Buyurtmalarim» bo‘limida to‘lov qilishingiz mumkin bo‘ladi.`}
                      </p>
                      <div className="p-3 rounded-lg bg-[#151719] border border-emerald-500/40 text-[11px] text-emerald-300 font-bold space-y-1">
                        <div>
                          🔒 Maxfiylik qoidasi: Zavod kabinetiga faqat buyurtma miqdori va yetkazish manzili (qayergaligi) ko‘rsatiladi.
                        </div>
                        <div>
                          👤 Mahsulot sotib oluvchi haqida shaxsiy ma’lumotlar va telefon raqami ko‘rsatilmaydi — Zavod kabinetida faqat «Mijoz» deb yuritiladi.
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Karta tanlash va SMS kod faqat hozir to'lanadigan oddiy mahsulotlar bo'lganda chiqadi */}
              {!isOnlyZavodCart && (
                <>
                  {/* 4 ta Karta turlari: UZCARD, HUMO, CLICK, VISA */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {[
                      {
                        id: 'uzcard',
                        label: 'UZCARD',
                        sub: 'Milliy to‘lov tizimi',
                        badge: (
                          <div className="w-11 h-8 rounded-lg bg-gradient-to-br from-[#0057A8] to-[#00AEEF] flex items-center justify-center shadow-inner border border-white/20 shrink-0">
                            <div className="flex flex-col items-center leading-none">
                              <span className="text-[9px] font-black tracking-tighter text-white">UZCARD</span>
                              <span className="w-5 h-1 rounded-full bg-[#F7941D] mt-0.5" />
                            </div>
                          </div>
                        ),
                      },
                      {
                        id: 'humo',
                        label: 'HUMO',
                        sub: 'Milliy bank kartasi',
                        badge: (
                          <div className="w-11 h-8 rounded-lg bg-gradient-to-br from-[#1C274C] via-[#009688] to-[#F59E0B] flex items-center justify-center shadow-inner border border-white/20 shrink-0">
                            <div className="flex flex-col items-center leading-none">
                              <span className="text-[9px] font-black tracking-wider text-white">HUMO</span>
                              <span className="w-4 h-1.5 rounded-full bg-amber-300/90 mt-0.5" />
                            </div>
                          </div>
                        ),
                      },
                      {
                        id: 'click',
                        label: 'CLICK',
                        sub: 'Click Up / Evolution',
                        badge: (
                          <div className="w-11 h-8 rounded-lg bg-gradient-to-br from-[#0066CC] to-[#00B4FF] flex items-center justify-center shadow-inner border border-white/20 shrink-0">
                            <div className="flex items-center gap-0.5">
                              <span className="w-2 h-2 rounded-full bg-white" />
                              <span className="text-[9px] font-black tracking-tight text-white">CLICK</span>
                            </div>
                          </div>
                        ),
                      },
                      {
                        id: 'visa',
                        label: 'VISA',
                        sub: 'Xalqaro to‘lov kartasi',
                        badge: (
                          <div className="w-11 h-8 rounded-lg bg-gradient-to-br from-[#1A1F71] to-[#254AA5] flex items-center justify-center shadow-inner border border-amber-400/40 shrink-0">
                            <span className="text-[11px] italic font-black tracking-wider text-white border-b-2 border-[#F7B600] leading-none pb-0.5">
                              VISA
                            </span>
                          </div>
                        ),
                      },
                    ].map((cardType) => (
                      <div
                        key={cardType.id}
                        onClick={() => setPaymentMethod(cardType.id as any)}
                        className={`p-3.5 rounded-xl border cursor-pointer transition-all flex items-center justify-between gap-2 ${
                          paymentMethod === cardType.id
                            ? 'bg-[#292C2F] border-[#FFB800] shadow-[0_0_12px_rgba(255,184,0,0.25)]'
                            : 'bg-[#222528] border-[#51504A] hover:border-[#777A7C]'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          {cardType.badge}
                          <div className="min-w-0">
                            <span className="text-sm sm:text-base font-black tracking-wider font-mono text-white block leading-tight">
                              {cardType.label}
                            </span>
                            <span className="text-[10px] text-[#B8B8B3] truncate block">
                              {cardType.sub}
                            </span>
                          </div>
                        </div>
                        <div
                          className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                            paymentMethod === cardType.id ? 'border-[#FFB800] bg-[#FFB800]' : 'border-[#51504A]'
                          }`}
                        >
                          {paymentMethod === cardType.id && <div className="w-1.5 h-1.5 rounded-full bg-[#151719]" />}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Karta raqami va SMS tasdiqlash */}
                  <div className="p-5 rounded-xl bg-[#222528] border border-[#51504A] space-y-4">
                    <div className="text-xs font-bold text-[#FFB800] flex items-center gap-1.5">
                      <CreditCard className="w-4 h-4" />
                      <span>{paymentMethod.toUpperCase()} karta ma'lumotlari</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="sm:col-span-2 space-y-1">
                        <label className="text-[11px] text-[#B8B8B3] font-bold">Karta raqami (16 ta raqam):</label>
                        <input
                          type="text"
                          inputMode="numeric"
                          maxLength={19}
                          value={cardNumber}
                          onChange={(e) => {
                            const digits = e.target.value.replace(/\D/g, '').slice(0, 16);
                            const formatted = digits.replace(/(\d{4})(?=\d)/g, '$1 ');
                            setCardNumber(formatted);
                            setCardSmsSent(false);
                            setError(null);
                          }}
                          placeholder="0000 0000 0000 0000"
                          className="w-full px-3.5 py-2.5 rounded-lg bg-[#151719] border border-[#51504A] font-mono font-bold text-[#F5F5F2] text-xs sm:text-sm focus:outline-none focus:border-[#FFB800]"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[11px] text-[#B8B8B3] font-bold">Muddati (OO/YY):</label>
                        <input
                          type="text"
                          inputMode="numeric"
                          maxLength={5}
                          value={cardExpire}
                          onChange={(e) => {
                            const digits = e.target.value.replace(/\D/g, '').slice(0, 4);
                            if (digits.length >= 3) {
                              setCardExpire(`${digits.slice(0, 2)}/${digits.slice(2, 4)}`);
                            } else {
                              setCardExpire(digits);
                            }
                            setCardSmsSent(false);
                            setError(null);
                          }}
                          placeholder="12/28"
                          className="w-full px-3.5 py-2.5 rounded-lg bg-[#151719] border border-[#51504A] font-mono font-bold text-[#F5F5F2] text-xs sm:text-sm text-center focus:outline-none focus:border-[#FFB800]"
                        />
                      </div>
                    </div>

                    {/* SMS tasdiqlash oynasi — SMSda nechta belgi (raqam yoki harf) bo'lsa shuncha to'liq qabul qiladi */}
                    {cardSmsSent && (
                      <div className="p-4 rounded-xl bg-[#151719] border border-emerald-500/50 space-y-3 animate-fadeIn">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="text-xs font-bold text-emerald-400">
                            Karta ulangan raqamga SMS kod yuborildi:{' '}
                            <span className="font-mono font-black text-[#FFB800] text-sm">
                              {getMaskedCardPhoneLast4()}
                            </span>
                          </div>
                          <span className="px-2.5 py-1 rounded bg-[#222528] border border-[#FFB800]/50 text-[#FFB800] font-mono font-black text-xs">
                            SMS kod: {sentCardSmsCode}
                          </span>
                        </div>

                        <div className="flex flex-col sm:flex-row gap-2.5">
                          <input
                            type="text"
                            maxLength={expectedSmsLength + 4}
                            value={cardSmsInput}
                            onChange={(e) => {
                              const cleaned = e.target.value
                                .replace(/[^a-zA-Z0-9]/g, '')
                                .slice(0, expectedSmsLength);
                              setCardSmsInput(cleaned);
                              setError(null);
                            }}
                            placeholder={`${expectedSmsLength} belgili SMS kodni kiriting`}
                            className="flex-1 px-4 py-2.5 rounded-lg bg-[#222528] border border-[#FFB800] font-mono font-black text-white text-sm tracking-widest text-center focus:outline-none"
                          />
                          <button
                            type="button"
                            onClick={triggerCardSmsCode}
                            className="px-3.5 py-2 rounded-lg bg-[#292C2F] hover:bg-[#34373B] text-[#FFB800] border border-[#51504A] text-xs font-bold cursor-pointer"
                          >
                            Qayta SMS yuborish
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* Order Final Summary */}
              <div className="p-4 sm:p-5 rounded-lg bg-[#222528] border border-[#FFB800]/50 space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-[#51504A] flex-wrap gap-2">
                  <div className="text-xs font-bold text-[#B8B8B3]">
                    Yetkazish manzili:{' '}
                    <span className="text-[#F5F5F2]">
                      {[region, district, mfy].filter(Boolean).join(', ') || detectedMapAddress}
                    </span>
                  </div>
                  <div className="text-xs font-bold text-[#B8B8B3]">
                    {isOnlyZavodCart ? (
                      <span className="text-emerald-400">Zavod uchun xaridor: «Mijoz» (shaxsiy ma’lumotlar yashirin)</span>
                    ) : (
                      <>
                        Aloqa: <span className="text-[#F5F5F2]">{cabinetPhone}</span>
                      </>
                    )}
                  </div>
                </div>

                {isMixedCart ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <div className="p-3 rounded-lg bg-[#151719] border border-emerald-500/40">
                      <span className="text-[11px] text-[#B8B8B3] block">Hozir to‘lanadigan summa (Oddiy mahsulotlar):</span>
                      <span className="text-xl font-black text-emerald-400 font-mono">
                        {formatPrice(regularTotal)}
                      </span>
                    </div>
                    <div className="p-3 rounded-lg bg-[#151719] border border-amber-500/40">
                      <span className="text-[11px] text-[#B8B8B3] block">
                        Zavod tasdiqlagach to‘lanadigan (B2B so‘rov):
                      </span>
                      <span className="text-xl font-black text-[#FFB800] font-mono">
                        {formatPrice(zavodTotal)}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs text-[#B8B8B3] block">
                        {isOnlyZavodCart
                          ? 'Zavod tasdiqlaganidan so‘ng to‘lanadigan summa:'
                          : "Jami to'lanadigan summa:"}
                      </span>
                      <span className="text-2xl sm:text-3xl font-black text-[#FFB800] font-mono">
                        {formatPrice(grandTotal)}
                      </span>
                    </div>

                    <div className="text-right">
                      <span className="text-xs text-[#B8B8B3] block">Holat:</span>
                      <span className="text-sm font-bold uppercase text-emerald-400">
                        {isOnlyZavodCart ? 'Zavodga so‘rov yuborish' : paymentMethod.toUpperCase()}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ============================================================== */}
          {/* 5-BOSQICH: RASMIY KVITANSIYA / CHEK (BUYURTMA TAYYOR)          */}
          {/* ============================================================== */}
          {step === 5 && completedOrder && (
            <div className="space-y-6 animate-fadeIn py-2 max-w-2xl mx-auto">
              {/* Success Badge */}
              <div className="text-center space-y-2">
                <div className="w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/50 flex items-center justify-center mx-auto shadow-xl">
                  <CheckCircle className="w-10 h-10" />
                </div>
                <h3 className="text-xl sm:text-2xl font-black text-white">
                  {completedOrder.paymentStatus === 'awaiting_b2b_approval'
                    ? 'Zavod (B2B) Kabinetiga So‘rovingiz Yuborildi!'
                    : 'Buyurtmangiz Muvaffaqiyatli Qabul Qilindi!'}
                </h3>
                <p className="text-xs text-sky-200">
                  {completedOrder.paymentStatus === 'awaiting_b2b_approval'
                    ? 'Zavod (B2B) kabineti so‘rovni tasdiqlaganidan so‘ng «Buyurtmalarim» bo‘limida to‘lovni amalga oshirishingiz mumkin.'
                    : completedZavodOrder
                    ? 'Oddiy mahsulotlar uchun to‘lov qabul qilindi, Zavod (B2B) mahsulotlari uchun esa Zavod kabinetiga so‘rov yuborildi!'
                    : "Jismoniy shaxs kabinetingizga buyurtma to'liq biriktirildi va ijroga berildi."}
                </p>
              </div>

              {/* Printable Official Receipt / Chek */}
              <div className="p-6 rounded-3xl bg-white text-slate-900 border-2 border-slate-300 shadow-2xl space-y-5 font-sans">
                {/* Chek Header */}
                <div className="flex items-center justify-between pb-4 border-b border-slate-200">
                  <div>
                    <div className="text-lg font-black tracking-wider text-slate-950">
                      BUNKER <span className="text-amber-600">STROY</span>
                    </div>
                    <div className="text-[11px] text-slate-500">
                      O'zbekiston Qurilish Mollari Onlayn Platformasi
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs font-mono font-bold text-slate-900">
                      Hujjat № {completedOrder.id}
                    </div>
                    <div className="text-[10px] text-slate-500 font-mono">
                      Holat: {completedOrder.transactionId}
                    </div>
                  </div>
                </div>

                {/* Buyer & Delivery Details */}
                <div className="grid grid-cols-2 gap-3 text-xs border-b border-slate-200 pb-4">
                  <div>
                    <span className="text-[10px] text-slate-500 block uppercase font-bold">Xaridor:</span>
                    <span className="font-bold text-slate-900">{completedOrder.buyerName}</span>
                    {completedOrder.buyerPhone && (
                      <span className="block text-slate-600 font-mono">{completedOrder.buyerPhone}</span>
                    )}
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 block uppercase font-bold">Manzil:</span>
                    <span className="font-medium text-slate-800 line-clamp-2">
                      {completedOrder.deliveryAddress}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 block uppercase font-bold">To'lov Turi:</span>
                    <span className="font-bold text-emerald-700 uppercase">
                      {completedOrder.paymentStatus === 'awaiting_b2b_approval'
                        ? 'Zavod tasdiqlaganidan so‘ng to‘lanadi'
                        : completedOrder.paymentMethod}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 block uppercase font-bold">Holat:</span>
                    <span className="font-bold text-blue-700">
                      {completedOrder.paymentStatus === 'awaiting_b2b_approval'
                        ? 'Zavod (B2B) tasdiqlashi kutilmoqda'
                        : 'To‘langan • Ijroda'}
                    </span>
                  </div>
                </div>

                {/* Items in receipt */}
                <div className="space-y-1.5 text-xs">
                  <div className="font-bold text-slate-700 uppercase text-[10px]">Tarkibi:</div>
                  <div className="divide-y divide-slate-100 max-h-40 overflow-y-auto">
                    {completedOrder.items.map((it, idx) => (
                      <div key={idx} className="py-1.5 flex justify-between items-center text-xs">
                        <span className="font-medium text-slate-800">
                          {idx + 1}. {it.title} ({it.quantity} {it.unit})
                        </span>
                        <span className="font-mono font-bold text-slate-900">
                          {formatPrice(it.price * it.quantity)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* If mixed cart also show the Zavod Request summary */}
                {completedZavodOrder && (
                  <div className="p-3 rounded-xl bg-amber-50 border border-amber-300 space-y-1 text-xs">
                    <div className="font-black text-amber-900">
                      + Zavod (B2B) so‘rovi (#{completedZavodOrder.id}) — Xaridor: «Mijoz»
                    </div>
                    <div className="text-[11px] text-amber-800">
                      Zavod B2B kabineti tasdiqlagach to‘lanadigan summa:{' '}
                      <span className="font-mono font-black">{formatPrice(completedZavodOrder.totalAmount)}</span>
                    </div>
                  </div>
                )}

                {/* Chek Total */}
                <div className="pt-3 border-t-2 border-slate-900 flex justify-between items-baseline">
                  <span className="text-sm font-black text-slate-950 uppercase">
                    {completedOrder.paymentStatus === 'awaiting_b2b_approval'
                      ? 'So‘rov Summasi:'
                      : "Jami To'langan:"}
                  </span>
                  <span className="text-xl font-black font-mono text-slate-950">
                    {formatPrice(completedOrder.totalAmount)}
                  </span>
                </div>
              </div>

              {/* Buttons */}
              <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={handlePrintReceipt}
                  className="btn-industrial-dark w-full sm:w-1/2 py-3 rounded-lg text-xs sm:text-sm font-bold flex items-center justify-center gap-2 cursor-pointer transition-colors"
                >
                  <Printer className="w-4 h-4 text-[#FFB800]" />
                  Chekni chop etish / Saqlash
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="btn-industrial-yellow w-full sm:w-1/2 py-3 rounded-lg text-xs sm:text-sm font-bold flex items-center justify-center gap-2 cursor-pointer shadow-md transition-all"
                >
                  Kabinetga qaytish
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Modal Bottom Actions */}
        {step < 5 && (
          <div className="px-5 sm:px-8 py-4 border-t border-[#51504A] bg-[#1D2023] flex items-center justify-between gap-3">
            <div>
              {step > 1 ? (
                <button
                  type="button"
                  onClick={() => setStep((prev) => (prev - 1) as any)}
                  className="btn-industrial-dark px-4 py-2 rounded-lg text-xs sm:text-sm font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Orqaga
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onClose}
                  className="btn-industrial-dark px-4 py-2 rounded-lg text-xs font-bold cursor-pointer transition-colors"
                >
                  Bekor qilish
                </button>
              )}
            </div>

            <div className="flex items-center gap-3">
              {step === 1 && (
                <button
                  type="button"
                  onClick={handleProceedToAddress}
                  disabled={items.length === 0}
                  className="btn-industrial-yellow px-5 sm:px-6 py-2.5 rounded-lg text-xs sm:text-sm font-bold flex items-center gap-2 shadow-sm cursor-pointer active:scale-95 disabled:opacity-50 transition-all"
                >
                  <span>Keyingisi: Manzilni tasdiqlash</span>
                  <ChevronRight className="w-4 h-4 stroke-[2.5]" />
                </button>
              )}

              {step === 2 && (
                <button
                  type="button"
                  onClick={handleProceedToPhone}
                  className="btn-industrial-yellow px-5 sm:px-6 py-2.5 rounded-lg text-xs sm:text-sm font-bold flex items-center gap-2 shadow-sm cursor-pointer active:scale-95 transition-all"
                >
                  <span>Keyingisi: Telefon raqam</span>
                  <ChevronRight className="w-4 h-4 stroke-[2.5]" />
                </button>
              )}

              {step === 3 && (
                <button
                  type="button"
                  onClick={handleProceedToPayment}
                  className="btn-industrial-yellow px-5 sm:px-6 py-2.5 rounded-lg text-xs sm:text-sm font-bold flex items-center gap-2 shadow-sm cursor-pointer active:scale-95 transition-all"
                >
                  <span>Keyingisi: To'lov</span>
                  <ChevronRight className="w-4 h-4 stroke-[2.5]" />
                </button>
              )}

              {step === 4 && (
                <button
                  type="button"
                  onClick={handleFinalizeOrder}
                  disabled={loading}
                  className="btn-industrial-yellow px-6 sm:px-8 py-3 rounded-lg text-xs sm:text-sm font-bold flex items-center gap-2 shadow-sm cursor-pointer active:scale-95 disabled:opacity-50 transition-all"
                >
                  {loading ? (
                    <span>Rasmiylashtirilmoqda...</span>
                  ) : (
                    <>
                      <CheckCircle className="w-5 h-5 stroke-[2.5]" />
                      <span>
                        {isOnlyZavodCart
                          ? 'Zavodga so‘rov yuborish'
                          : isMixedCart
                          ? cardSmsSent
                            ? 'SMS kodni tasdiqlash va Zavodga so‘rov yuborish'
                            : 'To‘lovni tasdiqlash va Zavodga so‘rov yuborish'
                          : cardSmsSent
                          ? 'SMS kodni tasdiqlash va Buyurtma berish'
                          : "To'lovni tasdiqlash"}
                      </span>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
