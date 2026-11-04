export type UserType = 'individual' | 'legal';

export type CompanyStatus = 'active' | 'liquidated' | 'suspended';

export interface CompanyInfo {
  inn: string;
  companyName: string;
  shortName?: string;
  status: CompanyStatus;
  statusDescription: string;
  director?: string;
  phone?: string;
  email?: string;
  address?: string;
  locality?: string;
  region?: string;
  district?: string;
  registrationDate?: string;
  registrationOrgan?: string;
  activityType?: string;
  okedCode?: string;
  thsht?: string;
  dbibt?: string;
  charterCapital?: string;
  foundersCount?: number;
  founders?: string[];
  updatedAt?: string;
  source?: string;
  summaryText?: string;
  vatPayer?: boolean;
}

export type AdminPermissionSection =
  | 'reports'
  | 'suppliers'
  | 'requests_customers'
  | 'b2b_crm'
  | 'b2c_crm';

export interface SubAdminCabinetAccount {
  id: string;
  cabinetName: string;
  login: string;
  password: string;
  passwordHash?: string;
  passwordMigrated?: boolean;
  phone?: string;
  status?: 'active' | 'blocked';
  permissions: AdminPermissionSection[];
  createdAt: string;
  updatedAt?: string;
}

export type UserRole = 
  | 'individual' 
  | 'legal' 
  | 'customer' 
  | 'contractor' 
  | 'logistics_driver' 
  | 'specialist' 
  | 'admin' 
  | 'bunker_admin'
  | 'supplier';

export interface UserProfile {
  id: string;
  email: string;
  displayName: string;
  firstName?: string;
  lastName?: string;
  userType?: UserType;
  companyName?: string;
  inn?: string;
  region?: string;
  district?: string;
  mahalla?: string;
  role: UserRole;
  phone?: string;
  cabinetType?: SupplierCabinetType;
  contractNumber?: string;
  mustChangeCredentials?: boolean;
  isSubAdmin?: boolean;
  subAdminId?: string;
  subAdminPermissions?: AdminPermissionSection[];
  impersonatedByBunkerAdmin?: boolean;
  impersonatedByAdmin?: boolean;
  impersonatorAdminProfile?: UserProfile;
  photoURL?: string;
  createdAt: string;
  status?: 'active' | 'blocked' | 'pending';
  verificationStatus?: 'pending' | 'verified' | 'rejected';
  eimzoVerifiedAt?: string;
  eimzoSerialNumber?: string;
  idCardNumber?: string;
  birthDate?: string;
  middleName?: string;
  pinfl?: string;
  issuedBy?: string;
  myIdJobId?: string;
  address?: string;
  myGovVerified?: boolean;
}

export type CabinetVerificationStatus = 'pending' | 'verified' | 'rejected';

export type SupplierCabinetType = 'manufacturer' | 'partner';

export type CommissionBasis = 'total' | 'profit';

export interface SupplierPartner {
  id: string;
  cabinetType?: SupplierCabinetType;
  inn?: string;
  companyInfo?: CompanyInfo;
  name: string;
  surname?: string;
  companyName: string;
  phone: string;
  secondaryPhone?: string;
  email: string;
  login: string;
  password?: string;
  passwordHash?: string;
  emergencyPassword?: string;
  emergencyPasswordHash?: string;
  passwordMigrated?: boolean;
  firebaseUid?: string;
  mustChangeCredentials?: boolean;
  region: string;
  district?: string;
  category: string;
  status: 'active' | 'blocked' | 'pending';
  productsCount: number;
  totalSalesSum: number;
  rating: number;
  contractNumber?: string;
  contractPdfName?: string;
  contractPdfData?: string;
  allowPromoVideo?: boolean;
  commissionRate?: number;
  commissionBasis?: CommissionBasis;
  createdAt: string;
  lastLoginAt?: string;
}

export type LogCategory = 
  | 'add_cabinet' 
  | 'edit_cabinet' 
  | 'delete_cabinet' 
  | 'auth_access' 
  | 'emergency_pass' 
  | 'orders_sales' 
  | 'supplier' 
  | 'auth' 
  | 'cabinet' 
  | 'product' 
  | 'system';

export interface SystemLog {
  id: string;
  action: string;
  actor: string;
  category: LogCategory;
  details: string;
  timestamp: string;
  ip?: string;
  level: 'info' | 'warning' | 'error' | 'success';
}

export interface SupplierSaleItem {
  id: string;
  orderId?: string;
  productId?: string;
  orderChannel?: 'online' | 'offline';
  productTitle: string;
  category: string;
  quantity: number;
  unit: string;
  price: number;
  totalSum: number;
  profitSum?: number;
  buyerName: string;
  buyerPhone: string;
  driverPhone?: string;
  deliveryAddress?: string;
  date: string;
  rawDate?: string;
  status: 'delivered' | 'in_transit' | 'assigned' | 'pending';
}

export interface SupplierReturnItem {
  id: string;
  productTitle: string;
  quantity: number;
  unit: string;
  totalSum: number;
  reason: string;
  date: string;
  status: 'returned' | 'processed' | 'refunded';
}

export interface SupplierLogisticsRoute {
  id: string;
  fromLocation: string;
  toLocation: string;
  productTitle: string;
  quantityText: string;
  driverName: string;
  driverPhone: string;
  vehicle: string;
  status: 'delivered' | 'in_transit' | 'assigned' | 'pending';
  deliveredAt: string;
}

export interface ProductVariant {
  id: string;
  unit: string;
  colors: string[];
  specification: string;
  price: number;
  originalPrice: number;
  costPrice?: number;
  minOrder: number;
}

export interface Product {
  id: string;
  title: string;
  category: 'Sement va qorishmalar' | 'Armatura va metall' | 'Gisht va bloklar' | 'Izolyatsiya va tom' | string;
  price: number;
  originalPrice?: number;
  costPrice?: number;
  initialStock?: number;
  unit: 'qop (50kg)' | 'tonna' | 'dona' | 'm²' | 'm³' | 'rulon' | 'metr' | string;
  saleChannel?: 'online' | 'offline';
  variants?: ProductVariant[];
  supplierId?: string;
  supplierInn?: string;
  supplierName: string;
  manufacturerName?: string;
  supplierCabinetType?: SupplierCabinetType;
  stock: number;
  unlimitedStock?: boolean;
  minOrder: number;
  energyEfficiencyRating?: 'A++' | 'A+' | 'A' | 'B' | 'Standart';
  isEscoCertified?: boolean;
  image: string;
  description: string;
  repairType?: 'ichki' | 'tashqi' | 'ishchi_kuchi' | 'asbob_uskunalar' | 'texnika_ijarasi' | 'universal';
  itemType?: 'material' | 'labor' | 'tool' | 'rental';
  region?: string;
  district?: string;
  salesCount?: number;
  videoUrl?: string;
  videoViews?: number;
  viewsCount?: number;
  hasDelivery?: boolean;
  warranty?: string;
  hasBonus?: boolean;
  bonusDescription?: string;
  bonusThreshold?: number;
  bonusAmount?: number;
  images?: string[];
  colors?: string[];
  lengths?: string[];
  weights?: string[];
  sizes?: string[];
  detailBlocks?: { image: string; text: string }[];
}

export interface CartItem {
  product: Product;
  quantity: number;
}

export interface Order {
  id: string;
  orderChannel?: 'online' | 'offline';
  buyerId: string;
  buyerName: string;
  buyerPhone: string;
  items: {
    productId: string;
    title: string;
    quantity: number;
    unit: string;
    price: number;
    totalSum?: number;
    category?: string;
    supplierId?: string;
    supplierInn?: string;
    supplierName?: string;
  }[];
  totalAmount: number;
  status: 'pending' | 'confirmed' | 'assigned' | 'in_transit' | 'delivered' | 'cancelled';
  driverPhone?: string;
  driverName?: string;
  deliveryAddress: string;
  deliveryRegion?: string;
  deliveryDistrict?: string;
  deliveryStreet?: string;
  deliveryLandmark?: string;
  recipientName?: string;
  recipientPhone?: string;
  paymentMethod?: 'uzcard' | 'humo' | 'click' | 'visa' | 'payme' | 'uzum' | 'card' | 'cash' | string;
  paymentStatus?: 'paid' | 'pending' | 'awaiting_b2b_approval' | 'b2b_approved_unpaid';
  requiresB2bApproval?: boolean;
  paidAt?: string;
  transactionId?: string;
  deliveryCoords?: { lat: number; lng: number };
  vehicleType: string;
  createdAt: string;
  updatedAt: string;
}

export interface CrmDebtRecord {
  id: string;
  supplierId: string;
  supplierInn?: string;
  supplierCompanyName: string;
  basketName?: string;
  customerName: string;
  customerPhone: string;
  items: {
    productId: string;
    title: string;
    quantity: number;
    unit: string;
    price: number;
    totalSum: number;
    category?: string;
  }[];
  totalOrderAmount: number;
  initialPaidAmount: number;
  debtAmount: number;
  paidDebtAmount: number;
  remainingDebtAmount: number;
  status: 'pending' | 'paid';
  note?: string;
  createdAt: string;
  updatedAt: string;
  paidAt?: string;
}

export interface B2BOrderItem {
  productId: string;
  title: string;
  category: string;
  unit: string;
  specification?: string;
  color?: string;
  quantity: number;
  price: number;
  totalSum: number;
  image?: string;
  manufacturerId?: string;
  manufacturerInn?: string;
  manufacturerName: string;
}

export interface B2BOrderRequest {
  id: string;
  buyerSupplierId: string;
  buyerCompanyName: string;
  buyerInn: string;
  buyerDirector: string;
  buyerPhone: string;
  buyerRegion: string;
  buyerAddress?: string;
  buyerContractNumber?: string;
  buyerCompanyInfo?: CompanyInfo;
  manufacturerId?: string;
  manufacturerInn?: string;
  manufacturerCompanyName: string;
  manufacturerPhone?: string;
  manufacturerRegion?: string;
  items: B2BOrderItem[];
  totalAmount: number;
  status: 'requested' | 'approved_awaiting_payment' | 'paid' | 'preparing' | 'in_transit' | 'paid_shipped' | 'delivered';
  bankAccountDetails?: string;
  driverPhone?: string;
  createdAt: string;
  approvedAt?: string;
  paidAt?: string;
  shippedAt?: string;
}

export interface LogisticsVehicle {
  id: string;
  name: string;
  type: 'samosval' | 'mikser' | 'kran_manipulyator' | 'gazel' | 'fura';
  capacityTons: number;
  pricePerKm: number;
  basePrice: number;
  available: boolean;
  driverName: string;
  phone: string;
  currentLocation: string;
  image: string;
}


export interface MapPlace {
  title: string;
  uri: string;
  placeAnswerSources?: any;
}
