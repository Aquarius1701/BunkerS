export interface FinancialTransaction {
  id: string;
  type: 'income' | 'expense';
  category: string;
  sourceOrDestination: string;
  amount: number;
  paymentMethod: string;
  date: string;
  status: 'completed' | 'pending';
}

export interface BunkerOverallStats {
  totalTurnover: number;       // Jami aylanma
  totalIncome: number;         // Kirim
  totalExpense: number;        // Chiqim
  netProfit: number;           // Sof foyda
  returnsCount: number;        // Qaytarilgan tovarlar soni
  returnsSum: number;          // Qaytarilgan tovarlar summasi
  ordersCount: number;         // Jami buyurtmalar soni
  activePartnersCount: number; // Faol ta'minotchilar soni
}

// Boshlang'ich holatda hali yangi mijozlar yo'q bo'lgani uchun barcha ko'rsatkichlar 0 bo'ladi.
// Ma'lumotlar real buyurtmalar va moliyaviy operatsiyalardan dinamik hisoblanadi.
export const INITIAL_BUNKER_STATS: BunkerOverallStats = {
  totalTurnover: 0,
  totalIncome: 0,
  totalExpense: 0,
  netProfit: 0,
  returnsCount: 0,
  returnsSum: 0,
  ordersCount: 0,
  activePartnersCount: 0,
};

export const INITIAL_TRANSACTIONS: FinancialTransaction[] = [];
