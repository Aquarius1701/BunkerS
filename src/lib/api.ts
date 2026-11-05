// ==============================================================================
// BunkerS Enterprise API Client
// Fully Typed REST Integration with NestJS Backend & PostgreSQL
// ==============================================================================

import type { Product, Order, LogisticsVehicle } from '../types';

export interface ProductQueryParams {
  category?: string;
  search?: string;
  supplierId?: string;
  region?: string;
  minPrice?: number;
  maxPrice?: number;
  sortBy?: 'createdAt' | 'price_asc' | 'price_desc' | 'popular';
  order?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

export interface SupplierQueryParams {
  cabinetType?: 'manufacturer' | 'partner';
  region?: string;
  category?: string;
  search?: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  error?: string;
  message?: string;
}

// ==============================================================================
// AUTH TOKEN STORE
// ==============================================================================
export function setAuthToken(token: string): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem('bunkers_access_token', token);
  }
}

export function getAuthToken(): string | null {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('bunkers_access_token');
  }
  return null;
}

export function clearAuthToken(): void {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('bunkers_access_token');
  }
}

// Generic robust fetch wrapper
async function apiFetch<T>(endpoint: string, options: RequestInit = {}): Promise<ApiResponse<T>> {
  const url = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  const token = getAuthToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...((options.headers as Record<string, string>) || {}),
  };

  const res = await fetch(url, { ...options, headers });
  const data = await res.json();
  if (!res.ok && !data.error && !data.message) {
    throw new Error(`API error (${res.status}): ${res.statusText}`);
  }
  return data;
}

// ==============================================================================
// 1. PRODUCTS & CATALOG API
// ==============================================================================
export async function getProductsApi(params?: ProductQueryParams): Promise<Product[]> {
  try {
    const query = new URLSearchParams();
    if (params) {
      if (params.category) query.set('category', params.category);
      if (params.search) query.set('search', params.search);
      if (params.supplierId) query.set('supplierId', params.supplierId);
      if (params.region) query.set('region', params.region);
      if (params.minPrice) query.set('minPrice', String(params.minPrice));
      if (params.maxPrice) query.set('maxPrice', String(params.maxPrice));
      if (params.sortBy) query.set('sortBy', params.sortBy);
      if (params.page) query.set('page', String(params.page));
      if (params.limit) query.set('limit', String(params.limit));
    }
    const qStr = query.toString();
    const endpoint = `/api/products${qStr ? `?${qStr}` : ''}`;
    const res = await apiFetch<Product[]>(endpoint);
    return res.data || [];
  } catch (err) {
    console.warn('API getProductsApi fallback:', err);
    return [];
  }
}

export async function getProductByIdApi(id: string): Promise<Product | null> {
  try {
    const res = await apiFetch<Product>(`/api/products/${id}`);
    return res.data || null;
  } catch (err) {
    console.error('API getProductByIdApi error:', err);
    return null;
  }
}

export async function createProductApi(productData: Partial<Product>): Promise<Product | null> {
  try {
    const res = await apiFetch<Product>('/api/products', {
      method: 'POST',
      body: JSON.stringify(productData),
    });
    return res.data || null;
  } catch (err) {
    console.error('API createProductApi error:', err);
    return null;
  }
}

export async function updateProductApi(id: string, productData: Partial<Product>): Promise<Product | null> {
  try {
    const res = await apiFetch<Product>(`/api/products/${id}`, {
      method: 'PUT',
      body: JSON.stringify(productData),
    });
    return res.data || null;
  } catch (err) {
    console.error('API updateProductApi error:', err);
    return null;
  }
}

export async function deleteProductApi(id: string): Promise<boolean> {
  try {
    const res = await apiFetch<{ success: boolean }>(`/api/products/${id}`, {
      method: 'DELETE',
    });
    return Boolean(res.success);
  } catch (err) {
    console.error('API deleteProductApi error:', err);
    return false;
  }
}

// ==============================================================================
// 2. SUPPLIERS & FACTORIES API
// ==============================================================================
export async function getSuppliersApi(params?: SupplierQueryParams | 'manufacturer' | 'partner'): Promise<any[]> {
  try {
    const query = new URLSearchParams();
    if (typeof params === 'string') {
      query.set('cabinetType', params);
    } else if (params) {
      if (params.cabinetType) query.set('cabinetType', params.cabinetType);
      if (params.region) query.set('region', params.region);
      if (params.category) query.set('category', params.category);
      if (params.search) query.set('search', params.search);
    }
    const qStr = query.toString();
    const endpoint = `/api/suppliers${qStr ? `?${qStr}` : ''}`;
    const res = await apiFetch<any[]>(endpoint);
    return res.data || [];
  } catch (err) {
    console.warn('API getSuppliersApi fallback:', err);
    return [];
  }
}

export async function getSupplierByIdApi(id: string): Promise<any | null> {
  try {
    const res = await apiFetch<any>(`/api/suppliers/${id}`);
    return res.data || null;
  } catch (err) {
    console.error('API getSupplierByIdApi error:', err);
    return null;
  }
}

export async function getSupplierStatsApi(id: string): Promise<any> {
  try {
    const res = await apiFetch<any>(`/api/suppliers/${id}/stats`);
    return res.data;
  } catch (err) {
    console.error('API getSupplierStatsApi error:', err);
    return null;
  }
}

export async function createSupplierApi(supplierData: any): Promise<any | null> {
  try {
    const res = await apiFetch<any>('/api/suppliers', {
      method: 'POST',
      body: JSON.stringify(supplierData),
    });
    return res.data || null;
  } catch (err) {
    console.error('API createSupplierApi error:', err);
    return null;
  }
}

export async function updateSupplierApi(id: string, supplierData: any): Promise<any | null> {
  try {
    const res = await apiFetch<any>(`/api/suppliers/${id}`, {
      method: 'PUT',
      body: JSON.stringify(supplierData),
    });
    return res.data || null;
  } catch (err) {
    console.error('API updateSupplierApi error:', err);
    return null;
  }
}

export async function updateSupplierStatusApi(id: string, status: string): Promise<any | null> {
  try {
    const res = await apiFetch<any>(`/api/suppliers/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
    return res.data || null;
  } catch (err) {
    console.error('API updateSupplierStatusApi error:', err);
    return null;
  }
}

export async function deleteSupplierApi(id: string): Promise<boolean> {
  try {
    const res = await apiFetch<{ success: boolean }>(`/api/suppliers/${id}`, {
      method: 'DELETE',
    });
    return Boolean(res.success);
  } catch (err) {
    console.error('API deleteSupplierApi error:', err);
    return false;
  }
}

// ==============================================================================
// 3. ORDERS & ESCROW API
// ==============================================================================
export async function createOrderApi(orderPayload: any): Promise<ApiResponse<Order>> {
  return apiFetch<Order>('/api/orders', {
    method: 'POST',
    body: JSON.stringify(orderPayload),
  });
}

export async function getOrdersApi(buyerId?: string, status?: string): Promise<Order[]> {
  try {
    const query = new URLSearchParams();
    if (buyerId) query.set('buyerId', buyerId);
    if (status) query.set('status', status);
    const qStr = query.toString();
    const res = await apiFetch<Order[]>(`/api/orders${qStr ? `?${qStr}` : ''}`);
    return res.data || [];
  } catch (err) {
    console.warn('API getOrdersApi fallback:', err);
    return [];
  }
}

export async function getOrderByIdApi(id: string): Promise<Order | null> {
  try {
    const res = await apiFetch<Order>(`/api/orders/${id}`);
    return res.data || null;
  } catch (err) {
    console.error('API getOrderByIdApi error:', err);
    return null;
  }
}

export async function updateOrderStatusApi(
  id: string,
  status: string,
  driverInfo?: { driverName?: string; driverPhone?: string }
): Promise<Order | null> {
  try {
    const res = await apiFetch<Order>(`/api/orders/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status, ...driverInfo }),
    });
    return res.data || null;
  } catch (err) {
    console.error('API updateOrderStatusApi error:', err);
    return null;
  }
}

// ==============================================================================
// 4. LOGISTICS FLEET API
// ==============================================================================
export async function getLogisticsVehiclesApi(type?: string): Promise<LogisticsVehicle[]> {
  try {
    const endpoint = type ? `/api/logistics/vehicles?type=${type}` : '/api/logistics/vehicles';
    const res = await apiFetch<LogisticsVehicle[]>(endpoint);
    return res.data || [];
  } catch (err) {
    console.warn('API getLogisticsVehiclesApi fallback:', err);
    return [];
  }
}

export async function createVehicleApi(vehicleData: any): Promise<LogisticsVehicle | null> {
  try {
    const res = await apiFetch<LogisticsVehicle>('/api/logistics/vehicles', {
      method: 'POST',
      body: JSON.stringify(vehicleData),
    });
    return res.data || null;
  } catch (err) {
    console.error('API createVehicleApi error:', err);
    return null;
  }
}

export async function updateVehicleApi(id: string, vehicleData: any): Promise<LogisticsVehicle | null> {
  try {
    const res = await apiFetch<LogisticsVehicle>(`/api/logistics/vehicles/${id}`, {
      method: 'PUT',
      body: JSON.stringify(vehicleData),
    });
    return res.data || null;
  } catch (err) {
    console.error('API updateVehicleApi error:', err);
    return null;
  }
}

export async function deleteVehicleApi(id: string): Promise<boolean> {
  try {
    const res = await apiFetch<{ success: boolean }>(`/api/logistics/vehicles/${id}`, {
      method: 'DELETE',
    });
    return Boolean(res.success);
  } catch (err) {
    console.error('API deleteVehicleApi error:', err);
    return false;
  }
}

export async function calculateFreightApi(payload: {
  vehicleType: string;
  distanceKm: number;
  totalWeightTons?: number;
}): Promise<any> {
  try {
    const res = await apiFetch<any>('/api/logistics/calculate', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return res.data;
  } catch (err) {
    console.error('API calculateFreightApi error:', err);
    return null;
  }
}

// ==============================================================================
// 5. CRM NASIYA DAFTARI API
// ==============================================================================
export async function getCrmDebtsApi(supplierId?: string): Promise<any[]> {
  try {
    const endpoint = supplierId ? `/api/crm/debts?supplierId=${supplierId}` : '/api/crm/debts';
    const res = await apiFetch<any[]>(endpoint);
    return res.data || [];
  } catch (err) {
    console.warn('API getCrmDebtsApi fallback:', err);
    return [];
  }
}

export async function recordCrmDebtPaymentApi(id: string, amount: number): Promise<any> {
  return apiFetch<any>(`/api/crm/debts/${id}/pay`, {
    method: 'PATCH',
    body: JSON.stringify({ amount }),
  });
}

export async function createCrmDebtApi(debtPayload: any): Promise<any> {
  return apiFetch<any>('/api/crm/debts', {
    method: 'POST',
    body: JSON.stringify(debtPayload),
  });
}

// ==============================================================================
// 6. SOLIQ REYESTRI & E-IMZO API
// ==============================================================================
export async function lookupCompanyByStirApi(inn: string): Promise<any> {
  const cleanInn = inn.replace(/\D/g, '');
  return apiFetch<any>(`/api/company/lookup?inn=${cleanInn}`);
}

export async function registerMchjApi(payload: any): Promise<any> {
  return apiFetch<any>('/api/company/register-mchj', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function getTestStirsApi(): Promise<any> {
  const res = await apiFetch<any>('/api/company/test-stirs');
  return res.data;
}

export async function createEImzoChallengeApi(inn?: string): Promise<any> {
  const res = await apiFetch<any>('/api/eimzo/challenge', {
    method: 'POST',
    body: JSON.stringify({ inn: inn ? inn.replace(/\D/g, '') : undefined }),
  });
  return res;
}

export async function verifyEImzoSignatureApi(payload: any): Promise<any> {
  return apiFetch<any>('/api/eimzo/verify', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

// ==============================================================================
// 7. SMS GATEWAY & OTP API
// ==============================================================================
export async function sendSmsOtpApi(phone: string, purpose = 'auth'): Promise<any> {
  return apiFetch<any>('/api/sms/send', {
    method: 'POST',
    body: JSON.stringify({ phone, purpose }),
  });
}

export async function verifySmsOtpApi(phone: string, code: string, purpose = 'auth'): Promise<any> {
  return apiFetch<any>('/api/sms/verify', {
    method: 'POST',
    body: JSON.stringify({ phone, code, purpose }),
  });
}

// ==============================================================================
// 8. AUTH & SESSION API
// ==============================================================================
export async function loginApi(payload: { login: string; password: string }): Promise<any> {
  const res = await apiFetch<any>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  if (res.data?.accessToken) {
    setAuthToken(res.data.accessToken);
  }
  return res;
}

export async function verifyAccountApi(payload: { login: string; password: string }): Promise<any> {
  const res = await apiFetch<any>('/api/auth/verify-account', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  if (res.data?.accessToken) {
    setAuthToken(res.data.accessToken);
  }
  return res;
}

export async function completeMigrationApi(payload: any): Promise<any> {
  const res = await apiFetch<any>('/api/auth/complete-migration', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  if (res.data?.accessToken) {
    setAuthToken(res.data.accessToken);
  }
  return res;
}

export async function registerApi(payload: any): Promise<any> {
  const res = await apiFetch<any>('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  if (res.data?.accessToken) {
    setAuthToken(res.data.accessToken);
  }
  return res;
}

export async function getMeApi(): Promise<any> {
  try {
    const res = await apiFetch<any>('/api/auth/me');
    return res.data;
  } catch {
    return null;
  }
}

export async function checkAuthSessionApi(): Promise<any> {
  try {
    const res = await apiFetch<any>('/api/auth/session');
    return res.data;
  } catch {
    return null;
  }
}

// ==============================================================================
// 9. HEALTH & SYSTEM API
// ==============================================================================
export async function getHealthApi(): Promise<any> {
  try {
    const res = await fetch('/api/health');
    return await res.json();
  } catch {
    return null;
  }
}
