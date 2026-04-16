import { CurrencyCode, CURRENCIES } from '../types';

export const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
};

export const getCurrencySymbol = (code?: CurrencyCode): string => {
  if (!code) return '$';
  return CURRENCIES[code]?.symbol || '$';
};
