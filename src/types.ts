import { Timestamp } from 'firebase/firestore';

export type GroupType = 'personal' | 'household' | 'trip' | 'other';
export type SplitType = 'equal' | 'percentage' | 'exact';
export type MemberRole = 'admin' | 'member';
export type BudgetType = 'weekly' | 'monthly' | 'total' | 'custom';

export interface UserProfile {
  uid: string;
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
  createdAt: Timestamp;
}

export type CurrencyCode = 'USD' | 'INR' | 'AED' | 'CAD' | 'EUR' | 'GBP';

export const CURRENCIES: Record<CurrencyCode, { symbol: string, label: string }> = {
  USD: { symbol: '$', label: 'US Dollar' },
  INR: { symbol: '₹', label: 'Indian Rupee' },
  AED: { symbol: 'د.إ', label: 'UAE Dirham' },
  CAD: { symbol: 'C$', label: 'Canadian Dollar' },
  EUR: { symbol: '€', label: 'Euro' },
  GBP: { symbol: '£', label: 'British Pound' }
};

export interface Group {
  id: string;
  name: string;
  description?: string;
  createdBy: string;
  createdAt: Timestamp;
  type: GroupType;
  memberIds: string[];
  maxBudget?: number;
  budgetType?: BudgetType;
  currency?: CurrencyCode; // Added currency code, optional for backward compatibility
  startDate?: string;
  endDate?: string;
}

export interface GroupMember {
  uid: string;
  role: MemberRole;
  joinedAt: Timestamp;
  displayName?: string;
  email?: string;
}

export interface Expense {
  id: string;
  amount: number;
  description: string;
  category: string;
  paidBy: string; // userId
  date: Timestamp;
  createdAt: Timestamp;
  splitType: SplitType;
}

export const CATEGORIES = [
  'Food',
  'Rent',
  'Utilities',
  'Transport',
  'Entertainment',
  'Shopping',
  'Health',
  'Travel',
  'Savings',
  'Other'
];
