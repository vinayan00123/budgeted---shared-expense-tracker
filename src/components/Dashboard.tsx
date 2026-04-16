import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  TrendingUp, 
  TrendingDown, 
  Users, 
  Receipt, 
  ArrowRight,
  Plus,
  Wallet,
  Calendar,
  Pencil,
  Trash2,
  Loader2,
  X,
  BarChart3,
  PieChart as PieChartIcon
} from 'lucide-react';
import { Group, Expense, BudgetType, CATEGORIES } from '../types';
import { getCategoryIcon } from '../utils/categoryIcons';
import { db } from '../firebase';
import { collection, query, onSnapshot, orderBy, limit, doc, updateDoc, deleteDoc, Timestamp, setDoc } from 'firebase/firestore';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Legend as RechartsLegend } from 'recharts';
import { User } from 'firebase/auth';
import { formatCurrency, getCurrencySymbol } from '../utils/format';
import { CurrencyCode, CURRENCIES } from '../types';
import { handleFirestoreError, OperationType } from '../utils/errorHandling';

interface DashboardProps {
  user: User;
  groups: Group[];
  onSelectGroup: (id: string) => void;
  theme: 'light' | 'dark';
}

interface Alert {
  id: string;
  message: string;
  type: 'warning' | 'info';
  groupId: string;
}

interface DashboardExpense extends Expense {
  groupId: string;
}

const CustomCategoryTooltip = ({ active, payload, label, globalAllExpenses, categoryMonth, baseCurrency }: any) => {
  if (active && payload && payload.length) {
    const effectiveLabel = (payload[0]?.payload?.name as string) || (label as string);
    const CatIcon = getCategoryIcon(effectiveLabel || '');
    
    const mappedExpenses = (globalAllExpenses || []).filter((e: any) => {
      if (e.category !== effectiveLabel) return false;
      if (categoryMonth !== 'all') {
        const d = e.date.toDate();
        if (`${d.getFullYear()}-${d.getMonth()}` !== categoryMonth) return false;
      }
      return true;
    });
    
    const topExpenses = mappedExpenses.slice(0, 3);
    const overflow = mappedExpenses.length - topExpenses.length;

    return (
      <div className="bg-white/95 dark:bg-zinc-900/95 backdrop-blur-xl border border-zinc-200/80 dark:border-zinc-800/80 p-5 rounded-3xl shadow-[0_20px_40px_-5px_rgba(16,185,129,0.25)] dark:shadow-[0_20px_40px_-5px_rgba(0,0,0,0.5)] transform scale-100 ring-1 ring-emerald-500/10 w-[240px]">
        <div className="flex items-center gap-4 mb-3">
          <div className="w-12 h-12 rounded-[18px] bg-gradient-to-br from-emerald-500/20 to-emerald-500/5 flex items-center justify-center text-emerald-500 ring-1 ring-emerald-500/20 shadow-inner shrink-0">
             <CatIcon className="w-6 h-6" />
          </div>
          <div className="min-w-0">
            <p className="font-bold text-zinc-900 dark:text-white font-display tracking-tight text-xl leading-none truncate">{effectiveLabel}</p>
            <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold mt-1.5 truncate text-nowrap">Total Volume</p>
          </div>
        </div>
        <p className="font-mono font-bold text-2xl text-emerald-600 dark:text-emerald-400 mt-2 pb-4">
          {getCurrencySymbol(baseCurrency)}{formatCurrency(payload[0].value as number)}
        </p>
        
        {topExpenses.length > 0 && (
          <div className="border-t border-zinc-100 dark:border-zinc-800/60 pt-3 flex flex-col gap-2">
            {topExpenses.map((e: any) => (
              <div key={e.id} className="flex justify-between items-center gap-2">
                <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300 truncate" title={e.description}>{e.description}</span>
                <span className="text-xs font-mono font-bold text-zinc-500 shrink-0">{getCurrencySymbol(baseCurrency)}{formatCurrency(e.amount)}</span>
              </div>
            ))}
            {overflow > 0 && (
              <div className="text-[10px] text-zinc-400 font-bold italic text-center mt-1">
                + {overflow} more expenses
              </div>
            )}
          </div>
        )}
      </div>
    );
  }
  return null;
};

export default function Dashboard({ user, groups, onSelectGroup, theme }: DashboardProps) {
  const [recentExpenses, setRecentExpenses] = useState<DashboardExpense[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [isGroupsListOpen, setIsGroupsListOpen] = useState(false);
  const [globalStats, setGlobalStats] = useState({
    weeklySpent: 0,
    monthlySpent: 0,
    totalBudget: 0,
    monthlyGainLoss: 0
  });
  
  const [globalAllExpenses, setGlobalAllExpenses] = useState<DashboardExpense[]>([]);
  const [drillDownCategory, setDrillDownCategory] = useState<string | null>(null);
  const [categoryMonth, setCategoryMonth] = useState<string>('all');

  // Edit/Delete states
  const [editingExpense, setEditingExpense] = useState<DashboardExpense | null>(null);
  const [expenseToDelete, setExpenseToDelete] = useState<DashboardExpense | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // User Profile States
  const [monthlyIncome, setMonthlyIncome] = useState<number>(0);
  const [baseCurrency, setBaseCurrency] = useState<CurrencyCode>('USD');
  const [isIncomeModalOpen, setIsIncomeModalOpen] = useState(false);
  const [editIncome, setEditIncome] = useState('');
  const [editCurrency, setEditCurrency] = useState<CurrencyCode>('USD');
  const [chartData, setChartData] = useState<any[]>([]);

  // Load user profile
  useEffect(() => {
    const userRef = doc(db, 'users', user.uid);
    const unsub = onSnapshot(userRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.monthlyIncome !== undefined) {
          setMonthlyIncome(data.monthlyIncome);
          setEditIncome(data.monthlyIncome.toString());
        }
        if (data.currency) {
          setBaseCurrency(data.currency);
          setEditCurrency(data.currency);
        }
      }
    });
    return () => unsub();
  }, [user.uid]);

  const handleSaveIncome = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await setDoc(doc(db, 'users', user.uid), {
        monthlyIncome: parseFloat(editIncome) || 0,
        currency: editCurrency
      }, { merge: true });
      setIsIncomeModalOpen(false);
    } catch (error) {
      console.error(error);
    }
  };

  const groupsListModalRef = React.useRef<HTMLDivElement>(null);
  const deleteExpenseModalRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isGroupsListOpen && groupsListModalRef.current) {
      groupsListModalRef.current.focus();
    }
  }, [isGroupsListOpen]);

  useEffect(() => {
    if (expenseToDelete && deleteExpenseModalRef.current) {
      deleteExpenseModalRef.current.focus();
    }
  }, [expenseToDelete]);

  // Form states for editing
  const [editAmount, setEditAmount] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editCategory, setEditCategory] = useState(CATEGORIES[0]);
  const [editDate, setEditDate] = useState(new Date().toISOString().split('T')[0]);

  useEffect(() => {
    if (editingExpense) {
      setEditAmount(editingExpense.amount.toString());
      setEditDescription(editingExpense.description);
      setEditCategory(editingExpense.category);
      setEditDate(editingExpense.date.toDate().toISOString().split('T')[0]);
    }
  }, [editingExpense]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setEditingExpense(null);
        setExpenseToDelete(null);
        setIsGroupsListOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleUpdateExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingExpense) return;

    setIsSaving(true);
    try {
      const [y, m, d] = editDate.split('-');
      const localDate = new Date(parseInt(y), parseInt(m) - 1, parseInt(d), 12, 0, 0);

      const expenseRef = doc(db, 'groups', editingExpense.groupId, 'expenses', editingExpense.id);
      await updateDoc(expenseRef, {
        amount: parseFloat(editAmount),
        description: editDescription,
        category: editCategory,
        date: Timestamp.fromDate(localDate),
      });
      setEditingExpense(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `groups/${editingExpense.groupId}/expenses/${editingExpense.id}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteExpense = async () => {
    if (!expenseToDelete) return;

    setIsDeleting(true);
    try {
      const expenseRef = doc(db, 'groups', expenseToDelete.groupId, 'expenses', expenseToDelete.id);
      await deleteDoc(expenseRef);
      setExpenseToDelete(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `groups/${expenseToDelete.groupId}/expenses/${expenseToDelete.id}`);
    } finally {
      setIsDeleting(false);
    }
  };

  const isDateInCurrentPeriod = (date: Date, group: Group) => {
    const now = new Date();
    const type = group.budgetType || 'total';

    if (group?.startDate && group?.endDate) {
      const start = new Date(group.startDate);
      start.setHours(0, 0, 0, 0);
      const end = new Date(group.endDate);
      end.setHours(23, 59, 59, 999);
      if (date < start || date > end) return false;
    }

    if (type === 'total' || type === 'custom') return true;
    
    if (type === 'monthly') {
      return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
    }
    
    if (type === 'weekly') {
      const startOfWeek = new Date(now);
      startOfWeek.setDate(now.getDate() - now.getDay());
      startOfWeek.setHours(0, 0, 0, 0);
      
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 7);
      
      return date >= startOfWeek && date < endOfWeek;
    }
    
    return true;
  };

  useEffect(() => {
    if (groups.length === 0) {
      setRecentExpenses([]);
      setAlerts([]);
      return;
    }

    const expensesMap = new Map<string, DashboardExpense[]>();
    
    const unsubscribes = groups.map(group => {
      const expensesQuery = query(
        collection(db, 'groups', group.id, 'expenses'),
        orderBy('date', 'desc')
      );

      return onSnapshot(expensesQuery, (snapshot) => {
        const fetchedExpenses = snapshot.docs.map(doc => ({ 
          id: doc.id, 
          groupId: group.id,
          ...doc.data() 
        } as DashboardExpense));
        
        expensesMap.set(group.id, fetchedExpenses);
        
        // Combine all expenses from all groups
        const allExpenses = Array.from(expensesMap.values()).flat();
        setGlobalAllExpenses(allExpenses);
        
        // Sort by date descending
        allExpenses.sort((a, b) => b.date.toMillis() - a.date.toMillis());
        
        // Take top 50
        setRecentExpenses(allExpenses.slice(0, 50));
        
        // Generate alerts based on budgets
        const newAlerts: Alert[] = [];
        let totalMaxBudgetGlobal = 0;
        
        groups.forEach(g => {
          if (!g.maxBudget) return;
          totalMaxBudgetGlobal += g.maxBudget;
          
          const gExpenses = expensesMap.get(g.id) || [];
          const currentPeriodExpenses = gExpenses.filter(e => 
            isDateInCurrentPeriod(e.date.toDate(), g)
          );
          
          const totalSpent = currentPeriodExpenses.reduce((sum, e) => sum + e.amount, 0);
          
          if (totalSpent > g.maxBudget) {
            newAlerts.push({
              id: `over-budget-${g.id}`,
              message: `Group "${g.name}" is over its ${g.budgetType || 'total'} budget (${getCurrencySymbol(g.currency)}${totalSpent.toFixed(2)} / ${getCurrencySymbol(g.currency)}${g.maxBudget.toFixed(2)})`,
              type: 'warning' as const,
              groupId: g.id
            });
          }
        });
        
        const now = new Date();
        const startOfWeek = new Date(now);
        startOfWeek.setDate(now.getDate() - now.getDay());
        startOfWeek.setHours(0, 0, 0, 0);

        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(startOfWeek.getDate() + 7);

        const finalTotalWeekly = allExpenses
          .filter(e => e.date.toDate() >= startOfWeek && e.date.toDate() < endOfWeek)
          .reduce((sum, e) => sum + e.amount, 0);

        const finalTotalMonthly = allExpenses
          .filter(e => e.date.toDate().getMonth() === now.getMonth() && e.date.toDate().getFullYear() === now.getFullYear())
          .reduce((sum, e) => sum + e.amount, 0);

        setGlobalStats({
          weeklySpent: finalTotalWeekly,
          monthlySpent: finalTotalMonthly,
          totalBudget: totalMaxBudgetGlobal,
          monthlyGainLoss: totalMaxBudgetGlobal - finalTotalMonthly
        });
        
        
        // Generate Chart Data for the last 6 months
        const newChartData = [];
        for (let i = 5; i >= 0; i--) {
          const d = new Date();
          d.setMonth(d.getMonth() - i);
          
          const monthSpend = allExpenses
             .filter(e => e.date.toDate().getMonth() === d.getMonth() && e.date.toDate().getFullYear() === d.getFullYear())
             .reduce((sum, e) => sum + e.amount, 0);

          newChartData.push({
            name: d.toLocaleDateString('en-US', { month: 'short' }),
            expensed: monthSpend,
            // income and balance will be assigned live via effect below
            rawMonth: d.getMonth(),
            rawYear: d.getFullYear()
          });
        }
        setChartData(newChartData);

        setAlerts(newAlerts);
        
      }, (error) => {
        if (error.message.includes('Missing or insufficient permissions')) {
          // This is expected if the group was just deleted and the listener hasn't been detached yet
          return;
        }
        console.error("Error fetching expenses for group", group.id, error);
      });
    });

    return () => {
      unsubscribes.forEach(unsub => unsub());
    };
  }, [groups, user.uid]);

  const availableMonths = React.useMemo(() => {
    const months = new Set<string>();
    globalAllExpenses.forEach(e => {
      const d = e.date.toDate();
      months.add(`${d.getFullYear()}-${d.getMonth()}`);
    });
    return Array.from(months).sort((a, b) => {
      const [yA, mA] = a.split('-').map(Number);
      const [yB, mB] = b.split('-').map(Number);
      if (yB !== yA) return yB - yA;
      return mB - mA;
    });
  }, [globalAllExpenses]);

  const formatMonthKey = (key: string) => {
    if (key === 'all') return 'All Time';
    const [y, m] = key.split('-').map(Number);
    const date = new Date(y, m, 1);
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  };

  const categoryChartData = React.useMemo(() => {
    const categoryTotals: Record<string, number> = {};
    globalAllExpenses.forEach(e => {
      if (categoryMonth !== 'all') {
        const d = e.date.toDate();
        if (`${d.getFullYear()}-${d.getMonth()}` !== categoryMonth) return;
      }
      if (!categoryTotals[e.category]) categoryTotals[e.category] = 0;
      categoryTotals[e.category] += e.amount;
    });

    return Object.keys(categoryTotals)
      .map(cat => ({ name: cat, value: categoryTotals[cat] }))
      .sort((a, b) => b.value - a.value);
  }, [globalAllExpenses, categoryMonth]);

  return (
    <div className="max-w-6xl mx-auto">
      <header className="mb-12 flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-zinc-900 dark:text-white mb-3 font-display">
            Welcome back, <span className="text-emerald-600 dark:text-emerald-400">{user.displayName?.split(' ')[0]}</span>
          </h1>
          <p className="text-zinc-500 dark:text-zinc-400 font-medium text-lg">Here's what's happening with your shared budgets today.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          <button 
            onClick={() => setIsIncomeModalOpen(true)}
            className="flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-3 bg-zinc-900 border border-zinc-800 text-white dark:bg-white dark:border-white dark:text-zinc-900 rounded-2xl text-sm font-bold hover:bg-zinc-800 dark:hover:bg-zinc-100 transition-all shadow-lg active:scale-95"
          >
            <Wallet className="w-4 h-4" />
            {monthlyIncome > 0 ? `Income: ${getCurrencySymbol(baseCurrency)}${formatCurrency(monthlyIncome)}` : 'Set Income'}
          </button>
          <button 
            onClick={() => (window as any).openCreateGroupModal?.()}
            className="flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-3 bg-emerald-600 text-white rounded-2xl text-sm font-bold hover:bg-emerald-700 hover:shadow-xl hover:shadow-emerald-500/40 transition-all shadow-lg shadow-emerald-500/20 active:scale-95"
          >
            <Plus className="w-4 h-4" />
            Create Group
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
        <button 
          onClick={() => {
            if (groups.length === 0) return;
            if (groups.length === 1) {
              onSelectGroup(groups[0].id);
            } else {
              setIsGroupsListOpen(true);
            }
          }}
          className={`text-left bg-white dark:bg-black/40 backdrop-blur-xl border border-zinc-200 dark:border-zinc-800 p-8 rounded-[32px] shadow-xl shadow-zinc-200/50 dark:shadow-emerald-500/5 relative overflow-hidden group transition-all ${groups.length > 0 ? 'hover:scale-[1.02] hover:border-emerald-500/50 active:scale-95 cursor-pointer' : 'cursor-default'}`}
        >
          <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 dark:bg-emerald-500/20 rounded-full -mr-16 -mt-16 transition-transform group-hover:scale-110" />
          <div className="relative z-10">
            <div className="w-12 h-12 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-100 dark:border-emerald-500/20 rounded-2xl flex items-center justify-center mb-6 text-emerald-600 dark:text-emerald-400">
              <Users className="w-6 h-6" />
            </div>
            <p className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-[0.2em] mb-1">Active Groups</p>
            <p className="text-4xl font-bold text-zinc-900 dark:text-white font-display tracking-tight">{groups.length}</p>
          </div>
        </button>

        <button 
          onClick={() => {
            if (groups.length === 0) return;
            if (groups.length === 1) {
              onSelectGroup(groups[0].id);
            } else {
              setIsGroupsListOpen(true);
            }
          }}
          className={`text-left bg-white dark:bg-black/40 backdrop-blur-xl border border-zinc-200 dark:border-zinc-800 p-8 rounded-[32px] shadow-xl shadow-zinc-200/50 dark:shadow-lime-500/5 relative overflow-hidden group transition-all ${globalAllExpenses.length > 0 ? 'hover:scale-[1.02] hover:border-lime-500/50 active:scale-95 cursor-pointer' : 'cursor-default'}`}
        >
          <div className="absolute top-0 right-0 w-32 h-32 bg-lime-500/10 dark:bg-lime-500/20 rounded-full -mr-16 -mt-16 transition-transform group-hover:scale-110" />
          <div className="relative z-10">
            <div className="w-12 h-12 bg-lime-50 dark:bg-lime-500/10 border border-lime-100 dark:border-lime-500/20 rounded-2xl flex items-center justify-center mb-6 text-lime-600 dark:text-lime-400">
              <Receipt className="w-6 h-6" />
            </div>
            <p className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-[0.2em] mb-1">Total Expenses</p>
            <p className="text-4xl font-bold text-zinc-900 dark:text-white font-display tracking-tight">{globalAllExpenses.length}</p>
          </div>
        </button>

        <button 
          onClick={() => {
            if (alerts.length === 0) return;
            onSelectGroup(alerts[0].groupId);
          }}
          className={`text-left bg-white dark:bg-black/40 backdrop-blur-xl border border-zinc-200 dark:border-zinc-800 p-8 rounded-[32px] shadow-xl shadow-zinc-200/50 dark:shadow-red-500/5 relative overflow-hidden group transition-all ${alerts.length > 0 ? 'hover:scale-[1.02] hover:border-red-500/50 active:scale-95 cursor-pointer' : 'cursor-default'}`}
        >
          <div className="absolute top-0 right-0 w-32 h-32 bg-red-500/10 dark:bg-red-500/20 rounded-full -mr-16 -mt-16 transition-transform group-hover:scale-110" />
          <div className="relative z-10">
            <div className="w-12 h-12 bg-red-50 dark:bg-red-500/10 border border-red-100 dark:border-red-500/20 rounded-2xl flex items-center justify-center mb-6 text-red-600 dark:text-red-400">
              <TrendingUp className="w-6 h-6" />
            </div>
            <p className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-[0.2em] mb-1">Active Alerts</p>
            <p className="text-4xl font-bold text-zinc-900 dark:text-white font-display tracking-tight">{alerts.length}</p>
          </div>
        </button>
      </div>

      {(() => {
        const displayIncome = monthlyIncome > 0 ? monthlyIncome : globalStats.totalBudget;
        const currentProfit = displayIncome - globalStats.monthlySpent;
        const currencySym = monthlyIncome > 0 ? getCurrencySymbol(baseCurrency) : '$';

        return (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6 mb-12">
            <div className="bg-white dark:bg-black/40 backdrop-blur-xl border border-zinc-200 dark:border-zinc-800 p-6 rounded-3xl shadow-xl shadow-zinc-200/50 dark:shadow-emerald-500/5">
              <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2 font-display">Weekly Global</p>
              <p className="text-2xl sm:text-3xl font-bold text-zinc-900 dark:text-white font-display tracking-tight">{currencySym}{formatCurrency(globalStats.weeklySpent)}</p>
            </div>
            <div className="bg-white dark:bg-black/40 backdrop-blur-xl border border-zinc-200 dark:border-zinc-800 p-6 rounded-3xl shadow-xl shadow-zinc-200/50 dark:shadow-emerald-500/5">
              <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2 font-display">Monthly Global</p>
              <p className="text-2xl sm:text-3xl font-bold text-zinc-900 dark:text-white font-display tracking-tight">{currencySym}{formatCurrency(globalStats.monthlySpent)}</p>
            </div>
            <div className="bg-white dark:bg-black/40 backdrop-blur-xl border border-zinc-200 dark:border-zinc-800 p-6 rounded-3xl shadow-xl shadow-zinc-200/50 dark:shadow-emerald-500/5">
              <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2 font-display">{monthlyIncome > 0 ? 'Your Income' : 'Global Budget'}</p>
              <p className="text-2xl sm:text-3xl font-bold text-zinc-900 dark:text-white font-display tracking-tight">{currencySym}{formatCurrency(displayIncome)}</p>
            </div>
            <div className={`bg-white dark:bg-black/40 backdrop-blur-xl border-2 p-6 rounded-3xl shadow-xl transition-all ${currentProfit >= 0 ? 'border-emerald-500/50 shadow-emerald-500/20' : 'border-red-500/50 shadow-red-500/20'}`}>
              <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2 font-display">{currentProfit >= 0 ? 'Monthly Profit' : 'Monthly Loss'}</p>
              <p className={`text-2xl sm:text-3xl font-bold font-display tracking-tight truncate ${currentProfit >= 0 ? 'text-emerald-500 dark:text-emerald-400 drop-shadow-[0_0_10px_rgba(16,185,129,0.3)]' : 'text-red-500 dark:text-red-400 drop-shadow-[0_0_10px_rgba(239,68,68,0.3)]'}`}>
                {currentProfit >= 0 ? '+' : '-'}{currencySym}{formatCurrency(Math.abs(currentProfit))}
              </p>
            </div>
          </div>
        );
      })()}

      <AnimatePresence>
        {isGroupsListOpen && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setIsGroupsListOpen(false)}
            />
            <motion.div 
              ref={groupsListModalRef}
              tabIndex={-1}
              role="dialog"
              aria-modal="true"
              aria-labelledby="select-group-title"
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-[32px] shadow-2xl overflow-hidden outline-none"
            >
              <div className="p-8">
                <h3 id="select-group-title" className="text-xl font-bold text-zinc-900 dark:text-white mb-6 font-display">Select a Group</h3>
                <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
                {groups.map(group => (
                  <button
                    key={group.id}
                    onClick={() => {
                      onSelectGroup(group.id);
                      setIsGroupsListOpen(false);
                    }}
                    className="w-full flex items-center justify-between p-4 rounded-2xl bg-zinc-50 dark:bg-white/5 hover:bg-zinc-100 dark:hover:bg-white/10 border border-zinc-100 dark:border-white/5 transition-all text-left group"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-2 h-2 rounded-full ${group.type === 'personal' ? 'bg-blue-400' : group.type === 'household' ? 'bg-emerald-400' : 'bg-orange-400'}`} />
                      <span className="font-bold text-zinc-900 dark:text-white">{group.name}</span>
                    </div>
                    <ArrowRight className="w-4 h-4 text-zinc-400 dark:text-zinc-500 group-hover:translate-x-1 transition-transform" />
                  </button>
                ))}
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
        <div className="lg:col-span-2 space-y-12">
          <section>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-white font-display">Recent Activity</h2>
            </div>
            <div className="bg-white dark:bg-zinc-900 rounded-[32px] border border-zinc-200 dark:border-zinc-800 shadow-xl shadow-zinc-200/50 dark:shadow-black/20 overflow-hidden">
              {recentExpenses.length === 0 ? (
                <div className="p-16 text-center">
                  <div className="w-16 h-16 bg-zinc-50 dark:bg-zinc-800 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Receipt className="w-8 h-8 text-zinc-300 dark:text-zinc-600" />
                  </div>
                  <p className="text-zinc-500 dark:text-zinc-400 font-medium">No recent expenses found.</p>
                </div>
              ) : (
                <div className="max-h-[480px] overflow-y-auto custom-scrollbar">
                  <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {recentExpenses.map(expense => (
                    <div key={expense.id} className="p-4 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between transition-all group hover:bg-zinc-50 dark:hover:bg-zinc-800/50 gap-4">
                      <div className="flex items-center gap-4 min-w-0">
                        <div className="w-12 h-12 sm:w-14 sm:h-14 bg-zinc-50 dark:bg-zinc-800 rounded-2xl flex items-center justify-center transition-all border border-zinc-100 dark:border-transparent shrink-0">
                          {(() => {
                            const Icon = getCategoryIcon(expense.category);
                            return <Icon className="w-6 h-6 sm:w-7 sm:h-7 text-emerald-500 dark:text-emerald-400" />;
                          })()}
                        </div>
                        <div className="min-w-0">
                          <p className="font-bold text-zinc-900 dark:text-white text-base sm:text-lg truncate">{expense.description}</p>
                          <div className="flex flex-wrap items-center gap-2 sm:gap-3 mt-1">
                            <span className="text-[9px] sm:text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider px-2 py-0.5 sm:px-2.5 sm:py-1 bg-emerald-50 dark:bg-emerald-500/10 rounded-lg border border-emerald-100 dark:border-emerald-500/20">{expense.category}</span>
                            <span className="text-[9px] sm:text-[10px] text-zinc-500 font-mono font-bold">
                              {expense.date.toDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            </span>
                            <span className="text-[9px] sm:text-[10px] text-zinc-400 font-medium italic truncate max-w-[100px] sm:max-w-none">
                              in {groups.find(g => g.id === expense.groupId)?.name}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center justify-between sm:justify-end gap-4 sm:gap-6 border-t border-zinc-100 dark:border-zinc-800 sm:border-0 pt-3 sm:pt-0 shrink-0">
                        <div className="text-left sm:text-right min-w-0">
                          <p 
                            className={`text-lg sm:text-xl font-bold font-mono truncate ${expense.paidBy === user.uid ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-900 dark:text-white'}`}
                            title={`${getCurrencySymbol(groups.find(g => g.id === expense.groupId)?.currency)}${formatCurrency(expense.amount)}`}
                          >
                            {getCurrencySymbol(groups.find(g => g.id === expense.groupId)?.currency)}{formatCurrency(expense.amount)}
                          </p>
                          <p className="text-[9px] sm:text-[10px] text-zinc-500 uppercase tracking-widest font-bold mt-0.5">
                            {expense.paidBy === user.uid ? 'You paid' : 'Someone paid'}
                          </p>
                        </div>
                        {expense.paidBy === user.uid && (
                          <div className="flex items-center gap-1">
                            <button 
                              onClick={() => setEditingExpense(expense)}
                              className="p-2 text-zinc-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 rounded-xl lg:opacity-0 group-hover:opacity-100 focus:opacity-100 focus:bg-emerald-50 dark:focus:bg-emerald-500/10 transition-all active:scale-90 outline-none focus:ring-2 focus:ring-emerald-500"
                              title="Edit Expense"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button 
                              onClick={() => setExpenseToDelete(expense)}
                              className="p-2 text-zinc-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-xl lg:opacity-0 group-hover:opacity-100 focus:opacity-100 focus:bg-red-50 dark:focus:bg-red-500/10 transition-all active:scale-90 outline-none focus:ring-2 focus:ring-red-500"
                              title="Delete Expense"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                  </div>
                </div>
              )}
            </div>
          </section>
          {/* Chart Section */}
          {chartData.length > 0 && (
            <section className="pt-4">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-white font-display flex items-center gap-3">
                  <BarChart3 className="w-6 h-6 text-emerald-500" />
                  Monthly Comparison
                </h2>
              </div>
              <div className="bg-white dark:bg-zinc-900 rounded-[32px] p-4 sm:p-8 border border-zinc-200 dark:border-zinc-800 shadow-xl shadow-zinc-200/50 dark:shadow-black/20 overflow-hidden h-[340px]">
                <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                  <BarChart 
                    data={chartData.map(d => ({ 
                      ...d, 
                      income: monthlyIncome > 0 ? monthlyIncome : globalStats.totalBudget, 
                      balance: Math.max(0, (monthlyIncome > 0 ? monthlyIncome : globalStats.totalBudget) - d.expensed) 
                    }))} 
                    margin={{ top: 10, right: 10, left: -20, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f4f4f5" opacity={0.1} />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#a1a1aa' }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#a1a1aa' }} tickFormatter={(value) => `${getCurrencySymbol(baseCurrency)}${value}`} />
                    <RechartsTooltip 
                      cursor={{ fill: 'rgba(16, 185, 129, 0.05)' }} 
                      contentStyle={{ borderRadius: '16px', border: 'none', backgroundColor: theme === 'dark' ? '#18181b' : '#ffffff', color: theme === 'dark' ? '#ffffff' : '#18181b', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)' }} 
                      formatter={(value: number) => [`${getCurrencySymbol(baseCurrency)}${formatCurrency(value)}`, undefined]}
                    />
                    <RechartsLegend iconType="circle" wrapperStyle={{ fontSize: '10px', paddingTop: '10px', fontWeight: 600 }} />
                    <Bar dataKey="income" name="Target Income / Budget" fill="#10b981" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="expensed" name="Expensed Amount" fill="#ef4444" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="balance" name="Balance Left" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>
          )}

          {/* Category Distribution Section */}
          {categoryChartData.length > 0 && (
            <section className="pt-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-4">
                <div className="flex items-center gap-3">
                  <h2 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-white font-display flex items-center gap-3">
                    <PieChartIcon className="w-6 h-6 text-emerald-500" />
                    Category Analytics
                  </h2>
                  <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest hidden md:block">Click column for full details</div>
                </div>
                <select
                  value={categoryMonth}
                  onChange={(e) => setCategoryMonth(e.target.value)}
                  className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-white rounded-xl px-4 py-2.5 text-sm font-bold shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 active:scale-95 transition-all outline-none cursor-pointer"
                >
                  <option value="all">All Time</option>
                  {availableMonths.map(key => (
                    <option key={key} value={key}>{formatMonthKey(key)}</option>
                  ))}
                </select>
              </div>
              <div className="bg-white dark:bg-zinc-900 rounded-[32px] p-4 sm:p-8 border border-zinc-200 dark:border-zinc-800 shadow-xl shadow-zinc-200/50 dark:shadow-black/20 overflow-hidden h-[450px]">
                <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                  <BarChart 
                    data={categoryChartData}
                    margin={{ top: 20, right: 10, left: -20, bottom: 25 }}
                  >
                    <defs>
                      <linearGradient id="proEmerald" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#10b981" stopOpacity={1}/>
                        <stop offset="100%" stopColor="#059669" stopOpacity={0.4}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f4f4f5" opacity={0.05} />
                    <XAxis 
                      dataKey="name" 
                      axisLine={false} 
                      tickLine={false} 
                      interval={0}
                      tick={{ fontSize: 11, fill: '#a1a1aa', fontWeight: 600 }} 
                      height={30} 
                      dy={10}
                    />
                    <YAxis 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fontSize: 10, fill: '#a1a1aa' }} 
                      tickFormatter={(value) => `${getCurrencySymbol(baseCurrency)}${value}`} 
                      domain={[0, (dataMax: number) => monthlyIncome > 0 ? Math.max(dataMax, monthlyIncome) : dataMax]}
                    />
                    <RechartsTooltip 
                      cursor={{ fill: theme === 'dark' ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)', radius: 12 }} 
                      content={<CustomCategoryTooltip globalAllExpenses={globalAllExpenses} categoryMonth={categoryMonth} baseCurrency={baseCurrency} />}
                    />
                    <Bar 
                      dataKey="value" 
                      fill="url(#proEmerald)" 
                      radius={[12, 12, 12, 12]} 
                      barSize={40}
                      onClick={(data: any) => {
                        const name = data?.name || data?.payload?.name || data?.activePayload?.[0]?.payload?.name;
                        if (name) setDrillDownCategory(name);
                      }}
                      className="cursor-pointer transition-all hover:opacity-90"
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>
          )}
        </div>

        <div className="space-y-12">
          <section>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-white font-display">Budget Alerts</h2>
            </div>
            <div className="space-y-4">
              {alerts.length === 0 ? (
                <div className="p-10 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-[32px] text-center shadow-xl shadow-zinc-200/50 dark:shadow-black/20">
                  <div className="w-12 h-12 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto mb-3">
                    <TrendingDown className="w-6 h-6 text-emerald-500" />
                  </div>
                  <p className="text-zinc-500 text-sm font-medium">All budgets on track</p>
                </div>
              ) : (
                alerts.map(alert => (
                  <motion.div 
                    key={alert.id}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className={`p-6 rounded-[32px] border shadow-md transition-all duration-300 ${
                      alert.type === 'warning' 
                        ? 'bg-red-50 dark:bg-red-950/80 border-red-200 dark:border-red-900/50 text-red-900 dark:text-red-100 backdrop-blur-sm' 
                        : 'bg-emerald-600 border-emerald-500 text-white shadow-lg shadow-emerald-500/20'
                    }`}
                  >
                    <div className="flex gap-4">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                        alert.type === 'warning' ? 'bg-red-500/10 dark:bg-red-500/20' : 'bg-white/20'
                      }`}>
                        <TrendingUp className={`w-5 h-5 ${alert.type === 'warning' ? 'text-red-600 dark:text-red-400' : 'text-white'}`} />
                      </div>
                      <p className="text-sm font-bold leading-relaxed">{alert.message}</p>
                    </div>
                  </motion.div>
                ))
              )}
            </div>
          </section>
        </div>
      </div>

      {/* Modals */}
      <AnimatePresence>
        {editingExpense && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              onClick={() => setEditingExpense(null)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby="edit-expense-title"
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md bg-white dark:bg-zinc-900 rounded-[40px] shadow-2xl p-10 outline-none"
              tabIndex={-1}
            >
              <div className="flex items-center justify-between mb-8">
                <h3 id="edit-expense-title" className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white font-display">Edit Expense</h3>
                <button 
                  onClick={() => setEditingExpense(null)} 
                  className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition-colors outline-none focus:ring-2 focus:ring-emerald-500"
                  aria-label="Close modal"
                >
                  <X className="w-5 h-5 text-zinc-500" />
                </button>
              </div>
              
              <form onSubmit={handleUpdateExpense} className="space-y-6">
                <div>
                  <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-[0.15em] mb-2">Amount</label>
                  <div className="relative">
                    <span className="absolute left-5 top-1/2 -translate-y-1/2 text-zinc-400 font-mono font-bold">{getCurrencySymbol(groups.find(g => g.id === editingExpense?.groupId)?.currency)}</span>
                    <input
                      type="number"
                      step="0.01"
                      value={editAmount}
                      onChange={(e) => setEditAmount(e.target.value)}
                      className="w-full pl-10 pr-5 py-4 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all font-mono font-bold dark:text-white"
                      required
                      autoFocus
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-[0.15em] mb-2">Description</label>
                  <input
                    type="text"
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    className="w-full px-5 py-4 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all font-medium dark:text-white"
                    placeholder="What was this for?"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-[0.15em] mb-3">Category</label>
                  <div className="flex flex-wrap gap-2 pb-2">
                    {CATEGORIES.map(cat => {
                      const CatIcon = getCategoryIcon(cat);
                      return (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => setEditCategory(cat)}
                          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border transition-all ${editCategory === cat ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-500/50 text-emerald-600 dark:text-emerald-400 shadow-sm' : 'bg-zinc-50 dark:bg-zinc-800/50 border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'}`}
                        >
                          <CatIcon className="w-4 h-4" />
                          <span className="text-xs font-bold">{cat}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-[0.15em] mb-2">Date</label>
                  <div className="relative">
                    <input
                      type="date"
                      value={editDate}
                      onClick={(e) => e.currentTarget.showPicker()}
                      onChange={(e) => setEditDate(e.target.value)}
                      className="w-full pl-5 pr-12 py-4 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all font-medium dark:text-white [&::-webkit-calendar-picker-indicator]:opacity-0 cursor-pointer"
                      required
                    />
                    <Calendar className="absolute right-5 top-1/2 -translate-y-1/2 w-5 h-5 text-emerald-500 opacity-80 pointer-events-none" />
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="w-full py-4 bg-emerald-600 text-white rounded-2xl font-bold hover:bg-emerald-700 transition-all mt-4 flex items-center justify-center gap-2 disabled:opacity-50 shadow-lg shadow-emerald-500/20 active:scale-95"
                >
                  {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Save Changes'}
                </button>
              </form>
            </motion.div>
          </div>
        )}

        {expenseToDelete && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              onClick={() => setExpenseToDelete(null)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              ref={deleteExpenseModalRef}
              tabIndex={-1}
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="delete-expense-title"
              aria-describedby="delete-expense-desc"
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md bg-white dark:bg-zinc-900 rounded-[40px] shadow-2xl p-10 text-center outline-none"
            >
              <div className="w-20 h-20 bg-red-50 dark:bg-red-500/10 rounded-3xl flex items-center justify-center mx-auto mb-8 text-red-600 border border-red-100 dark:border-red-500/20">
                <Trash2 className="w-10 h-10" />
              </div>
              <h3 id="delete-expense-title" className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white mb-4 font-display">Delete Expense?</h3>
              <p id="delete-expense-desc" className="text-zinc-500 dark:text-zinc-400 mb-10 leading-relaxed">
                Are you sure you want to delete this expense? This action cannot be undone.
              </p>
              <div className="flex gap-4">
                <button
                  onClick={() => setExpenseToDelete(null)}
                  className="flex-1 py-4 bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-white rounded-2xl font-bold hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-all active:scale-95"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteExpense}
                  disabled={isDeleting}
                  className="flex-1 py-4 bg-red-600 text-white rounded-2xl font-bold hover:bg-red-700 transition-all flex items-center justify-center gap-2 disabled:opacity-50 shadow-lg shadow-red-500/20 active:scale-95"
                >
                  {isDeleting ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Delete'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {/* Income Modal */}
      <AnimatePresence>
        {isIncomeModalOpen && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              onClick={() => setIsIncomeModalOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              role="dialog"
              aria-modal="true"
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-sm bg-white dark:bg-zinc-900 rounded-[40px] shadow-2xl p-8 outline-none border border-zinc-200 dark:border-zinc-800"
              tabIndex={-1}
            >
              <div className="flex items-center justify-between mb-8">
                <h3 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white font-display">Your Salary</h3>
                <button 
                  onClick={() => setIsIncomeModalOpen(false)} 
                  className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition-colors outline-none"
                >
                  <X className="w-5 h-5 text-zinc-500" />
                </button>
              </div>
              
              <form onSubmit={handleSaveIncome} className="space-y-6">
                <div>
                  <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-[0.15em] mb-2">Total Monthly Amount</label>
                  <div className="relative">
                    <span className="absolute left-5 top-1/2 -translate-y-1/2 text-zinc-400 font-mono font-bold">{getCurrencySymbol(editCurrency)}</span>
                    <input
                      type="number"
                      step="0.01"
                      value={editIncome}
                      onChange={(e) => setEditIncome(e.target.value)}
                      className="w-full pl-10 pr-5 py-4 bg-zinc-50 dark:bg-black border border-zinc-200 dark:border-zinc-700 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all font-mono font-bold dark:text-white"
                      placeholder="0.00"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-[0.15em] mb-2">Base Currency</label>
                  <select
                    value={editCurrency}
                    onChange={(e) => setEditCurrency(e.target.value as CurrencyCode)}
                    className="w-full px-5 py-4 bg-zinc-50 dark:bg-black border border-zinc-200 dark:border-zinc-700 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all font-medium appearance-none dark:text-white"
                  >
                    {Object.entries(CURRENCIES).map(([code, { label, symbol }]) => (
                      <option key={code} value={code}>{label} ({symbol})</option>
                    ))}
                  </select>
                </div>
                
                <button
                  type="submit"
                  className="w-full py-4 bg-emerald-600 text-white rounded-2xl font-bold hover:bg-emerald-700 transition-all mt-4 flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 active:scale-95"
                >
                  Save Profile
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Category Drill-Down Modal */}
      <AnimatePresence>
        {drillDownCategory && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              onClick={() => setDrillDownCategory(null)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              role="dialog"
              aria-modal="true"
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-2xl bg-white dark:bg-zinc-900 rounded-[40px] shadow-2xl p-8 sm:p-10 outline-none max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between mb-8 sticky top-0 bg-white dark:bg-zinc-900 pt-2 pb-6 z-10 border-b border-zinc-100 dark:border-zinc-800">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-emerald-50 dark:bg-emerald-500/10 rounded-2xl flex items-center justify-center text-emerald-500">
                    {(() => {
                      const Icon = getCategoryIcon(drillDownCategory || '');
                      return <Icon className="w-6 h-6" />;
                    })()}
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white font-display">{drillDownCategory} Expenses</h3>
                    <p className="text-zinc-500 text-sm font-medium">All recorded interactions</p>
                  </div>
                </div>
                <button 
                  onClick={() => setDrillDownCategory(null)} 
                  className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition-colors outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <X className="w-5 h-5 text-zinc-500" />
                </button>
              </div>

              <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {globalAllExpenses.filter(e => e.category === drillDownCategory).length === 0 ? (
                  <div className="p-10 text-center text-zinc-500 italic">No expenses found for {drillDownCategory}.</div>
                ) : (
                  globalAllExpenses.filter(e => e.category === drillDownCategory).map(expense => (
                     <div key={expense.id} className="py-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 group">
                       <div className="min-w-0">
                         <p className="font-bold text-zinc-900 dark:text-white text-lg truncate group-hover:text-emerald-500 transition-colors">{expense.description}</p>
                         <p className="text-[10px] text-zinc-500 font-mono font-bold mt-1.5 flex items-center flex-wrap gap-2">
                           <span className="bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded-md text-zinc-600 dark:text-zinc-400">
                             {expense.date.toDate().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                           </span>
                           <span className="text-zinc-300 dark:text-zinc-700 hidden sm:inline">•</span>
                           <span className="text-zinc-500">
                             in <span className="text-zinc-600 dark:text-zinc-400 border-b border-dashed border-zinc-300 dark:border-zinc-700 pb-0.5">{groups.find(g => g.id === expense.groupId)?.name}</span>
                           </span>
                         </p>
                       </div>
                       <p 
                          className={`text-xl font-bold font-mono tracking-tight shrink-0 sm:text-right ${expense.paidBy === user.uid ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-900 dark:text-white'}`}
                       >
                         {getCurrencySymbol(groups.find(g => g.id === expense.groupId)?.currency)}{formatCurrency(expense.amount)}
                       </p>
                     </div>
                  ))
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
