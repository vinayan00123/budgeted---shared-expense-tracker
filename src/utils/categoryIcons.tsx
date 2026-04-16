import { 
  Coffee,
  Home,
  Zap,
  Car,
  Film,
  ShoppingBag,
  HeartPulse,
  Plane,
  MoreHorizontal,
  Receipt,
  LucideIcon,
  PiggyBank
} from 'lucide-react';

export const getCategoryIcon = (category: string): LucideIcon => {
  switch (category) {
    case 'Food': return Coffee;
    case 'Rent': return Home;
    case 'Utilities': return Zap;
    case 'Transport': return Car;
    case 'Entertainment': return Film;
    case 'Shopping': return ShoppingBag;
    case 'Health': return HeartPulse;
    case 'Travel': return Plane;
    case 'Savings': return PiggyBank;
    case 'Other': return MoreHorizontal;
    default: return Receipt;
  }
};
