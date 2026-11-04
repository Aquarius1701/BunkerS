import { Product, LogisticsVehicle } from '../types';

// Barcha dastlabki soxta (mock) mahsulotlar ID ro'yxati — tizimdan va bazadan tozalash uchun
export const MOCK_FAKE_PRODUCT_IDS: string[] = [
  'prod-cement-m500-01',
  'prod-cement-m400-02',
  'prod-qorishma-rotband-03',
  'prod-armatura-a500c-12-04',
  'prod-armatura-a500c-16-05',
  'prod-katanka-sim-06',
  'prod-gazoblok-d500-07',
  'prod-pishiq-gisht-08',
  'prod-shlakoblok-09',
  'prod-penoplast-fasad-10',
  'prod-technonikol-bitum-11',
  'prod-ceresit-cm11-12',
  'prod-1',
  'prod-2',
  'prod-3',
  'prod-4',
  'prod-5',
  'prod-6',
  'prod-7',
  'prod-8',
  'prod-9',
  'prod-10',
  'prod-11',
  'prod-12',
];

export const MOCK_FAKE_VEHICLE_IDS: string[] = [
  'veh-1',
  'veh-2',
  'veh-3',
  'veh-4',
];

export const MOCK_FAKE_GLOBAL_IDS: string[] = [
  'gp-1',
  'gp-2',
  'gp-3',
  'gp-4',
  'gp-5',
  'gp-6',
];

export const MOCK_FAKE_SUPPLIER_IDS: string[] = [
  'supp-1712345678901',
  'supp-1',
  'supp-2',
  'supp-3',
  'supp-4',
  'supp-5',
];

// Admin kabineti yoki ta'minotchi kabineti kiritmagan barcha mahsulotlar va texnikalar 0 holatda bo'ladi
export const INITIAL_PRODUCTS: Product[] = [];

export const INITIAL_VEHICLES: LogisticsVehicle[] = [];
