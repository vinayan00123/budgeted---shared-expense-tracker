import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ArrowLeft, 
  Plus, 
  Users, 
  Receipt, 
  MoreVertical, 
  Trash2, 
  UserPlus,
  TrendingUp,
  PieChart as PieChartIcon,
  Calendar,
  Tag,
  CreditCard,
  BarChart3,
  Sparkles,
  Loader2,
  Pencil,
  X
} from 'lucide-react';
import Markdown from 'react-markdown';
import { GoogleGenAI } from "@google/genai";
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend
} from 'recharts';
import { db } from '../firebase';
import { 
  collection, 
  query, 
  onSnapshot, 
  orderBy, 
  doc, 
  setDoc,
  addDoc, 
  deleteDoc, 
  serverTimestamp, 
  Timestamp,
  getDocs,
  where,
  updateDoc,
  arrayUnion
} from 'firebase/firestore';
import { User } from 'firebase/auth';
import { Group, Expense, GroupMember, CATEGORIES, BudgetType } from '../types';
import { formatCurrency, getCurrencySymbol } from '../utils/format';
import { handleFirestoreError, OperationType } from '../utils/errorHandling';
import { getCategoryIcon } from '../utils/categoryIcons';

interface GroupViewProps {
  groupId: string;
  user: User;
  onBack: () => void;
  theme: 'light' | 'dark';
}

export default function GroupView({ groupId, user, onBack, theme }: GroupViewProps) {
  const [group, setGroup] = useState<Group | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [isAddExpenseOpen, setIsAddExpenseOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [isAddMemberOpen, setIsAddMemberOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Form states
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [newMemberEmail, setNewMemberEmail] = useState('');
  
  // Graph Overrides
  const [graphStartDate, setGraphStartDate] = useState(group?.startDate || '');
  const [graphEndDate, setGraphEndDate] = useState(group?.endDate || '');

  React.useEffect(() => {
    if (group?.startDate) setGraphStartDate(group.startDate);
    if (group?.endDate) setGraphEndDate(group.endDate);
  }, [group?.startDate, group?.endDate]);
  
  // Settings states
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editMaxBudget, setEditMaxBudget] = useState('');
  const [editBudgetType, setEditBudgetType] = useState<BudgetType>('monthly');

  // AI Analysis states
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<string | null>(null);
  const [isAnalysisModalOpen, setIsAnalysisModalOpen] = useState(false);
  const analysisAbortController = useRef<AbortController | null>(null);

  // Stat details modal state
  const [selectedStatDetails, setSelectedStatDetails] = useState<{ title: string; amount: number; subtitle?: string } | null>(null);

  const statModalRef = useRef<HTMLDivElement>(null);
  const analysisModalRef = useRef<HTMLDivElement>(null);
  const deleteGroupModalRef = useRef<HTMLDivElement>(null);
  const deleteExpenseModalRef = useRef<HTMLDivElement>(null);

  const closeAnalysisModal = () => {
    setIsAnalysisModalOpen(false);
    if (analysisAbortController.current) {
      analysisAbortController.current.abort();
      analysisAbortController.current = null;
    }
    setIsAnalyzing(false);
    setAnalysisResult(null);
  };

  // Delete confirmation state
  const [expenseToDelete, setExpenseToDelete] = useState<string | null>(null);
  const [isDeleteGroupConfirmOpen, setIsDeleteGroupConfirmOpen] = useState(false);

  useEffect(() => {
    if (selectedStatDetails && statModalRef.current) {
      statModalRef.current.focus();
    }
  }, [selectedStatDetails]);

  useEffect(() => {
    if (isAnalysisModalOpen && analysisModalRef.current) {
      analysisModalRef.current.focus();
    }
  }, [isAnalysisModalOpen]);

  useEffect(() => {
    if (isDeleteGroupConfirmOpen && deleteGroupModalRef.current) {
      deleteGroupModalRef.current.focus();
    }
  }, [isDeleteGroupConfirmOpen]);

  useEffect(() => {
    if (expenseToDelete && deleteExpenseModalRef.current) {
      deleteExpenseModalRef.current.focus();
    }
  }, [expenseToDelete]);

  // Invite states
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState(false);

  useEffect(() => {
    const groupRef = doc(db, 'groups', groupId);
    const unsubscribeGroup = onSnapshot(groupRef, (doc) => {
      if (doc.exists()) {
        const data = doc.data() as Group;
        setGroup({ id: doc.id, ...data } as Group);
        setEditName(data.name);
        setEditDescription(data.description || '');
        setEditMaxBudget(data.maxBudget?.toString() || '');
        setEditBudgetType(data.budgetType || 'monthly');

        if (!graphStartDate || !graphEndDate) {
          if (data.budgetType === 'custom' && data.startDate && data.endDate) {
            setGraphStartDate(data.startDate);
            setGraphEndDate(data.endDate);
          } else {
            const now = new Date();
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(now.getDate() - 30);
            setGraphStartDate(thirtyDaysAgo.toISOString().split('T')[0]);
            setGraphEndDate(now.toISOString().split('T')[0]);
          }
        }
      }
    }, (error) => {
      if (error.message.includes('Missing or insufficient permissions')) return;
      console.error("Error fetching group:", error);
    });

    const expensesQuery = query(collection(db, 'groups', groupId, 'expenses'), orderBy('date', 'desc'));
    const unsubscribeExpenses = onSnapshot(expensesQuery, (snapshot) => {
      setExpenses(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Expense)));
    }, (error) => {
      if (error.message.includes('Missing or insufficient permissions')) return;
      console.error("Error fetching expenses:", error);
    });

    const membersQuery = collection(db, 'groups', groupId, 'members');
    const unsubscribeMembers = onSnapshot(membersQuery, (snapshot) => {
      setMembers(snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as GroupMember)));
    }, (error) => {
      if (error.message.includes('Missing or insufficient permissions')) return;
      console.error("Error fetching members:", error);
    });

    return () => {
      unsubscribeGroup();
      unsubscribeExpenses();
      unsubscribeMembers();
    };
  }, [groupId]);

  useEffect(() => {
    if (editingExpense) {
      setAmount(editingExpense.amount.toString());
      setDescription(editingExpense.description);
      setCategory(editingExpense.category);
      setDate(editingExpense.date.toDate().toISOString().split('T')[0]);
      setIsAddExpenseOpen(true);
    } else {
      setAmount('');
      setDescription('');
      setCategory(CATEGORIES[0]);
      setDate(new Date().toISOString().split('T')[0]);
    }
  }, [editingExpense]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsAddExpenseOpen(false);
        setIsAddMemberOpen(false);
        setIsSettingsOpen(false);
        closeAnalysisModal();
        setIsDeleteGroupConfirmOpen(false);
        setExpenseToDelete(null);
        setEditingExpense(null);
        setSelectedStatDetails(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || !description) return;

    try {
      const [y, m, d] = date.split('-');
      const localDate = new Date(parseInt(y), parseInt(m) - 1, parseInt(d), 12, 0, 0);

      const expenseData = {
        amount: parseFloat(amount),
        description: description.trim(),
        category,
        paidBy: editingExpense ? editingExpense.paidBy : user.uid,
        date: Timestamp.fromDate(localDate),
        createdAt: editingExpense ? editingExpense.createdAt : serverTimestamp(),
        splitType: 'equal' as const
      };

      if (editingExpense) {
        await updateDoc(doc(db, 'groups', groupId, 'expenses', editingExpense.id), expenseData);
      } else {
        await addDoc(collection(db, 'groups', groupId, 'expenses'), expenseData);
      }
      
      setIsAddExpenseOpen(false);
      setEditingExpense(null);
      setAmount('');
      setDescription('');
    } catch (error) {
      handleFirestoreError(error, editingExpense ? OperationType.UPDATE : OperationType.CREATE, `groups/${groupId}/expenses`);
    }
  };

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMemberEmail.trim()) return;

    setInviteLoading(true);
    setInviteError(null);
    setInviteSuccess(false);

    try {
      const usersRef = collection(db, 'users');
      // Ensure we check against lowercase email as Google stores it lowercase
      const targetEmail = newMemberEmail.trim().toLowerCase();
      const q = query(usersRef, where('email', '==', targetEmail));
      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        setInviteError('User not found. They must sign into the app at least once before you can invite them!');
        setInviteLoading(false);
        return;
      }

      const userDoc = querySnapshot.docs[0];
      const userData = userDoc.data();
      const newMemberUid = userDoc.id;

      if (group?.memberIds.includes(newMemberUid)) {
        setInviteError('User is already a member of this group.');
        setInviteLoading(false);
        return;
      }

      await setDoc(doc(db, 'groups', groupId, 'members', newMemberUid), {
        uid: newMemberUid,
        role: 'member',
        joinedAt: serverTimestamp(),
        displayName: userData.displayName || 'Unknown',
        email: userData.email || newMemberEmail.trim()
      });

      await updateDoc(doc(db, 'groups', groupId), {
        memberIds: arrayUnion(newMemberUid)
      });

      setInviteSuccess(true);
      setNewMemberEmail('');
      setTimeout(() => {
        setIsAddMemberOpen(false);
        setInviteSuccess(false);
      }, 2000);
    } catch (error: any) {
      console.error('Error adding member:', error);
      setInviteError(error.message || 'Failed to add member.');
    } finally {
      setInviteLoading(false);
    }
  };

  const handleDeleteExpense = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'groups', groupId, 'expenses', id));
      setExpenseToDelete(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `groups/${groupId}/expenses/${id}`);
    }
  };

  const handleDeleteGroup = async () => {
    try {
      await deleteDoc(doc(db, 'groups', groupId));
      onBack();
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `groups/${groupId}`);
    }
  };

  const handleUpdateSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editName.trim()) return;
    
    try {
      const updateData: any = {
        name: editName.trim(),
        description: editDescription.trim(),
        maxBudget: editMaxBudget ? parseFloat(editMaxBudget) : null,
        budgetType: editMaxBudget ? editBudgetType : 'total'
      };
      await updateDoc(doc(db, 'groups', groupId), updateData);
      setIsSettingsOpen(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `groups/${groupId}`);
    }
  };

  const isDateInCurrentPeriod = (date: Date, type: BudgetType) => {
    const now = new Date();
    
    // Always restrict to custom bounds if defined
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

  const currentPeriodExpenses = expenses.filter(e => {
    // If graph sliders are active, explicitly filter by them
    if (graphStartDate && graphEndDate) {
      const ed = e.date.toDate();
      const gs = new Date(graphStartDate);
      gs.setHours(0, 0, 0, 0);
      const ge = new Date(graphEndDate);
      ge.setHours(23, 59, 59, 999);
      if (ed < gs || ed > ge) return false;
    }
    
    return isDateInCurrentPeriod(e.date.toDate(), group?.budgetType || 'total');
  });

  const totalSpent = currentPeriodExpenses.reduce((sum, e) => sum + e.amount, 0);
  const userSpent = currentPeriodExpenses.filter(e => e.paidBy === user.uid).reduce((sum, e) => sum + e.amount, 0);
  const perPerson = members.length > 0 ? totalSpent / members.length : 0;
  const balance = userSpent - perPerson;

  // Budget calculation
  const currentBudgetSpent = totalSpent;

  // Chart Data Preparation
  const getLineChartData = () => {
    if (!group || group.budgetType === 'total') return [];
    
    const now = new Date();
    const data = [];
    
    let chartStart = new Date();
    let chartEnd = new Date();
    
    if (graphStartDate && graphEndDate) {
      chartStart = new Date(graphStartDate);
      chartEnd = new Date(graphEndDate);
    } else {
      // Fallback
      chartStart.setDate(now.getDate() - 30);
    }

    // Generate daily points
    const current = new Date(chartStart);
    current.setHours(0,0,0,0);
    const end = new Date(chartEnd);
    end.setHours(23,59,59,999);

    while (current <= end) {
      const dayStart = new Date(current);
      const dayEnd = new Date(current);
      dayEnd.setHours(23,59,59,999);
      
      const daySpent = expenses
        .filter(e => {
          const ed = e.date.toDate();
          return ed >= dayStart && ed <= dayEnd;
        })
        .reduce((sum, e) => sum + e.amount, 0);
        
      data.push({ 
        name: dayStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric', weekday: 'short' }),
        timestamp: dayStart.getTime(),
        amount: daySpent 
      });
      
      current.setDate(current.getDate() + 1);
    }
    
    return data;
  };

  const getPieChartData = () => {
    const uniqueCategories = new Set(currentPeriodExpenses.map(e => e.category));
    
    if (uniqueCategories.size === 1) {
      // Group by description (name of expense) if all match the same category
      const nameMap = new Map<string, number>();
      currentPeriodExpenses.forEach(e => {
        nameMap.set(e.description, (nameMap.get(e.description) || 0) + e.amount);
      });
      return Array.from(nameMap.entries()).map(([name, value]) => ({ name, value }));
    }

    // Default category grouping
    const categoryMap = new Map<string, number>();
    currentPeriodExpenses.forEach(e => {
      categoryMap.set(e.category, (categoryMap.get(e.category) || 0) + e.amount);
    });
    return Array.from(categoryMap.entries()).map(([name, value]) => ({ name, value }));
  };

  const lineData = getLineChartData();
  const pieData = getPieChartData();
  const COLORS = ['#10b981', '#f59e0b', '#3b82f6', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16', '#71717a'];

  const getPeriodLabel = () => {
    const now = new Date();
    const type = group?.budgetType || 'total';
    
    if (type === 'custom' && group?.startDate && group?.endDate) {
      return `${new Date(group.startDate).toLocaleDateString()} - ${new Date(group.endDate).toLocaleDateString()}`;
    }
    
    if (type === 'monthly') {
      return now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    }
    
    if (type === 'weekly') {
      const startOfWeek = new Date(now);
      startOfWeek.setDate(now.getDate() - now.getDay());
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 6);
      
      const startMonth = startOfWeek.toLocaleDateString('en-US', { month: 'short' });
      const endMonth = endOfWeek.toLocaleDateString('en-US', { month: 'short' });
      
      if (startMonth === endMonth) {
        return `${startMonth} ${startOfWeek.getDate()} - ${endOfWeek.getDate()}, ${now.getFullYear()}`;
      }
      return `${startMonth} ${startOfWeek.getDate()} - ${endMonth} ${endOfWeek.getDate()}, ${now.getFullYear()}`;
    }
    
    return 'All Time';
  };

  const handleAnalyzeSpending = async () => {
    setIsAnalyzing(true);
    setIsAnalysisModalOpen(true);
    setAnalysisResult(null);

    if (analysisAbortController.current) {
      analysisAbortController.current.abort();
    }
    const abortController = new AbortController();
    analysisAbortController.current = abortController;

    try {
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
      if (!apiKey) {
        setAnalysisResult("⚠️ **API Key Missing**\n\nThe AI Insights feature requires a Gemini API key. Please add `VITE_GEMINI_API_KEY=your_gen_ai_key` to a `.env` file in the root of your project and restart the development server.");
        setIsAnalyzing(false);
        return;
      }

      const ai = new GoogleGenAI({ apiKey });
      
      const expenseSummary = expenses.map(e => ({
        amount: e.amount,
        description: e.description,
        category: e.category,
        date: e.date.toDate().toLocaleDateString()
      }));

      const prompt = `
        Analyze the following spending data for a group budget named "${group?.name}".
        Group Type: ${group?.type}
        Budget Type: ${group?.budgetType}
        Max Budget: ${group?.maxBudget ? `${getCurrencySymbol(group.currency)}${group.maxBudget}` : 'No limit'}
        Total Spent in Current Period: ${getCurrencySymbol(group?.currency)}${totalSpent.toFixed(2)}
        
        Expenses:
        ${JSON.stringify(expenseSummary, null, 2)}
        
        Please provide:
        1. A summary of spending habits.
        2. Identification of any unusual or high spending categories.
        3. Practical suggestions for saving or better budget management.
        4. A brief outlook based on the current budget limit.
        
        Keep the tone helpful, professional, and encouraging. Use markdown for formatting.
      `;

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [{ parts: [{ text: prompt }] }]
      });

      if (abortController.signal.aborted) return;

      setAnalysisResult(response.text || "Could not generate analysis.");
    } catch (error: any) {
      if (error.name === 'AbortError' || abortController.signal.aborted) {
        return;
      }
      console.error("AI Analysis Error:", error);
      setAnalysisResult("Sorry, I encountered an error while analyzing your spending. Please try again later.");
    } finally {
      if (!abortController.signal.aborted) {
        setIsAnalyzing(false);
      }
    }
  };

  if (!group) return null;

  return (
    <div className="max-w-6xl mx-auto">
      <button 
        onClick={onBack}
        className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:border-zinc-300 dark:hover:border-zinc-700 rounded-xl transition-all duration-200 mb-10 group shadow-sm"
      >
        <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-1" />
        <span className="text-sm font-bold">Back to Dashboard</span>
      </button>

      <div className="flex flex-col md:flex-row md:items-start justify-between gap-8 mb-12">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-3">
            <span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider ${
              group.type === 'household' ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-500/20' :
              group.type === 'trip' ? 'bg-orange-50 dark:bg-orange-500/10 text-orange-700 dark:text-orange-400 border border-orange-100 dark:border-orange-500/20' :
              'bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 border border-blue-100 dark:border-blue-500/20'
            }`}>
              {group.type}
            </span>
            <div className="flex items-center gap-1.5 text-zinc-400 dark:text-zinc-500">
              <Calendar className="w-3.5 h-3.5" />
              <span className="text-[10px] font-bold uppercase tracking-widest">{getPeriodLabel()}</span>
            </div>
          </div>
          <h1 className="text-4xl font-bold tracking-tight text-zinc-900 dark:text-white mb-3 font-display">{group.name}</h1>
          <p className="text-zinc-600 dark:text-zinc-300 max-w-2xl leading-relaxed font-medium">{group.description || 'No description provided.'}</p>
        </div>

        <div className="flex flex-wrap items-stretch gap-2 sm:gap-3 w-full md:w-auto">
          {user.uid === group.createdBy && (
            <button 
              onClick={() => setIsSettingsOpen(true)}
              className="w-12 sm:w-auto p-3 border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 rounded-2xl text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-white transition-all shadow-sm flex items-center justify-center shrink-0"
              title="Group Settings"
            >
              <MoreVertical className="w-5 h-5" />
            </button>
          )}
          <button 
            onClick={() => setIsAddMemberOpen(true)}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 sm:px-5 py-3 border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 rounded-2xl text-sm font-bold text-zinc-700 dark:text-zinc-300 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 hover:border-emerald-200 dark:hover:border-emerald-800 hover:shadow-lg hover:shadow-emerald-500/10 transition-all active:scale-95"
          >
            <UserPlus className="w-4 h-4" />
            Invite
          </button>
          <button 
            onClick={handleAnalyzeSpending}
            disabled={isAnalyzing}
            className="flex-1 sm:flex-none relative overflow-hidden group flex items-center justify-center gap-2 px-4 sm:px-5 py-3 rounded-2xl text-sm font-bold text-zinc-900 shadow-xl transition-all disabled:opacity-50 active:scale-95"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-emerald-400 via-lime-400 to-emerald-400 bg-[length:200%_auto] animate-gradient-x group-hover:scale-105 transition-transform duration-500" />
            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 bg-gradient-to-r from-emerald-400 via-lime-400 to-emerald-400 blur-xl transition-opacity duration-500 -z-10" />
            <div className="relative flex items-center gap-2">
              {isAnalyzing ? <Loader2 className="w-4 h-4 animate-spin text-zinc-900" /> : <Sparkles className="w-4 h-4 text-zinc-900" />}
              AI Insights
            </div>
          </button>
          <button 
            onClick={() => {
              setEditingExpense(null);
              setIsAddExpenseOpen(true);
            }}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 rounded-2xl text-sm font-bold text-zinc-900 dark:text-white hover:bg-emerald-50 dark:hover:bg-emerald-900/20 hover:border-emerald-200 dark:hover:border-emerald-800 hover:shadow-lg hover:shadow-emerald-500/10 transition-all active:scale-95"
          >
            <Plus className="w-4 h-4" />
            Add Expense
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-4 lg:gap-6 mb-12">
        <button 
          onClick={() => setSelectedStatDetails({ title: 'Total Group Spend', amount: totalSpent })}
          className="text-left w-full bg-white dark:bg-zinc-900 p-6 md:p-5 lg:p-8 rounded-[32px] border border-zinc-200 dark:border-zinc-800 shadow-xl shadow-zinc-200/50 dark:shadow-black/20 relative overflow-hidden group hover:scale-[1.02] active:scale-95 transition-all cursor-pointer"
        >
          <div className="absolute top-0 right-0 w-32 h-32 bg-zinc-100 dark:bg-white/5 rounded-full -mr-16 -mt-16 transition-transform group-hover:scale-110" />
          <div className="relative">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em] font-display">Budget Overview</p>
              {group.maxBudget && (
                <span className={`text-[10px] font-bold px-2 py-1 rounded-lg uppercase tracking-wider ${currentBudgetSpent > group.maxBudget ? 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400 border border-red-200 dark:border-red-900/50' : 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900/50'}`}>
                  {currentBudgetSpent > group.maxBudget ? 'Loss (Over Budget)' : 'Profit (Under Budget)'}
                </span>
              )}
            </div>
            <p 
              className="text-4xl md:text-2xl lg:text-3xl xl:text-4xl font-bold text-zinc-900 dark:text-white font-display tracking-tight truncate mt-2"
              title={`${getCurrencySymbol(group?.currency)}${formatCurrency(totalSpent)}`}
            >
              {getCurrencySymbol(group?.currency)}{formatCurrency(totalSpent)}
              <span className="text-sm text-zinc-400 dark:text-zinc-500 font-medium ml-2 uppercase tracking-wide">Spent</span>
            </p>
            {group.maxBudget && (
              <div className="mt-6">
                <div className="flex justify-between text-[10px] font-bold uppercase mb-2 font-display">
                  <span className="text-zinc-500">Remaining</span>
                  <span className="text-zinc-900 dark:text-white">
                    {getCurrencySymbol(group?.currency)}{formatCurrency(Math.abs(group.maxBudget - currentBudgetSpent))}
                  </span>
                </div>
                <div className="h-2 bg-zinc-100 dark:bg-white/10 rounded-full overflow-hidden">
                  <div 
                    className={`h-full transition-all duration-700 ease-out ${currentBudgetSpent > group.maxBudget ? 'bg-red-500' : 'bg-emerald-500'}`}
                    style={{ width: `${Math.min(100, (currentBudgetSpent / group.maxBudget) * 100)}%` }}
                  />
                </div>
                <div className="flex justify-between items-center mt-3">
                  <p className="text-[10px] text-zinc-500 font-medium tracking-wide">
                    TOTAL {getCurrencySymbol(group?.currency)}{formatCurrency(group.maxBudget)}
                  </p>
                  <p className={`text-[10px] font-bold tracking-wide ${currentBudgetSpent > group.maxBudget ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                    {currentBudgetSpent > group.maxBudget ? '-' : '+'}{getCurrencySymbol(group?.currency)}{formatCurrency(Math.abs(group.maxBudget - currentBudgetSpent))}
                  </p>
                </div>
              </div>
            )}
          </div>
        </button>
        <button 
          onClick={() => setSelectedStatDetails({ title: 'Your Share', amount: perPerson, subtitle: `${totalSpent > 0 ? ((userSpent / totalSpent) * 100).toFixed(0) : 0}% of total paid by you` })}
          className="text-left w-full bg-white dark:bg-zinc-900 p-6 md:p-5 lg:p-8 rounded-[32px] border border-zinc-200 dark:border-zinc-800 shadow-xl shadow-zinc-200/50 dark:shadow-black/20 relative overflow-hidden group hover:scale-[1.02] active:scale-95 transition-all cursor-pointer"
        >
          <div className="absolute top-0 right-0 w-32 h-32 bg-zinc-100 dark:bg-white/5 rounded-full -mr-16 -mt-16 transition-transform group-hover:scale-110" />
          <div className="relative">
            <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em] mb-4 font-display">Your Share</p>
            <p 
              className="text-4xl md:text-2xl lg:text-3xl xl:text-4xl font-bold text-zinc-900 dark:text-white font-display tracking-tight truncate"
              title={`${getCurrencySymbol(group?.currency)}${formatCurrency(perPerson)}`}
            >
              {getCurrencySymbol(group?.currency)}{formatCurrency(perPerson)}
            </p>
            <p className="text-xs font-medium text-zinc-500 mt-4">
              {totalSpent > 0 ? ((userSpent / totalSpent) * 100).toFixed(0) : 0}% of total paid by you
            </p>
          </div>
        </button>
        <button 
          onClick={() => setSelectedStatDetails({ title: balance >= 0 ? 'You are owed' : 'You owe', amount: Math.abs(balance) })}
          className="text-left w-full bg-white dark:bg-zinc-900 p-6 md:p-5 lg:p-8 rounded-[32px] border border-zinc-200 dark:border-zinc-800 shadow-xl shadow-zinc-200/50 dark:shadow-black/20 relative overflow-hidden group hover:scale-[1.02] active:scale-95 transition-all duration-300 cursor-pointer"
        >
          <div className={`absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-[32px] border-2 shadow-[inset_0_0_20px_rgba(0,0,0,0.1)] ${balance >= 0 ? 'border-emerald-500/50 shadow-emerald-500/20' : 'border-red-500/50 shadow-red-500/20'}`} />
          <div className={`absolute top-0 right-0 w-32 h-32 rounded-full -mr-16 -mt-16 transition-transform duration-700 ease-out group-hover:scale-150 ${balance >= 0 ? 'bg-emerald-500/10' : 'bg-red-500/10'}`} />
          <div className="relative">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] mb-4 text-zinc-500 font-display">
              {balance >= 0 ? 'You are owed' : 'You owe'}
            </p>
            <p 
              className={`text-4xl md:text-2xl lg:text-3xl xl:text-4xl font-bold font-display tracking-tight truncate ${balance >= 0 ? 'text-emerald-500 dark:text-emerald-400 drop-shadow-[0_0_10px_rgba(16,185,129,0.3)]' : 'text-red-500 dark:text-red-400 drop-shadow-[0_0_10px_rgba(239,68,68,0.3)]'}`}
              title={`${getCurrencySymbol(group?.currency)}${formatCurrency(Math.abs(balance))}`}
            >
              {getCurrencySymbol(group?.currency)}{formatCurrency(Math.abs(balance))}
            </p>
          </div>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-12">
        {group.budgetType !== 'total' && (
          <div className="bg-white dark:bg-zinc-900 p-4 sm:p-8 rounded-[40px] border border-zinc-200 dark:border-zinc-800 shadow-xl shadow-zinc-200/50 dark:shadow-black/20">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-8 gap-4">
              <h3 className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-[0.15em] flex items-center gap-2">
                <TrendingUp className="w-4 h-4" />
                Spending Trend
              </h3>
              <div className="flex items-center gap-2 bg-zinc-50 dark:bg-zinc-800/50 p-1 rounded-xl border border-zinc-200 dark:border-zinc-700 w-full sm:w-auto">
                <input 
                  type="date"
                  value={graphStartDate}
                  onChange={(e) => {
                    setGraphStartDate(e.target.value);
                    if (group) {
                      updateDoc(doc(db, 'groups', group.id), { startDate: e.target.value });
                    }
                  }}
                  className="bg-transparent border-none text-[10px] sm:text-xs font-bold text-zinc-700 dark:text-zinc-300 focus:ring-0 w-full sm:w-auto px-2 py-1 outline-none appearance-none"
                />
                <span className="text-zinc-400 text-xs font-bold">-</span>
                <input 
                  type="date"
                  value={graphEndDate}
                  onChange={(e) => {
                    setGraphEndDate(e.target.value);
                    if (group) {
                      updateDoc(doc(db, 'groups', group.id), { endDate: e.target.value });
                    }
                  }}
                  className="bg-transparent border-none text-[10px] sm:text-xs font-bold text-zinc-700 dark:text-zinc-300 focus:ring-0 w-full sm:w-auto px-2 py-1 outline-none appearance-none"
                />
              </div>
            </div>
            <div className="h-[280px] w-full">
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <LineChart data={lineData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f4f4f5" opacity={0.1} />
                  <XAxis 
                    dataKey="name" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fontSize: 10, fill: '#a1a1aa', fontWeight: 500 }}
                    interval="preserveEnd"
                    minTickGap={25}
                  />
                  <YAxis 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fontSize: 10, fill: '#a1a1aa', fontWeight: 500 }}
                    tickFormatter={(value) => `${getCurrencySymbol(group?.currency)}${value}`}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      borderRadius: '16px', 
                      border: 'none', 
                      boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)', 
                      padding: '12px', 
                      backgroundColor: theme === 'dark' ? '#18181b' : '#ffffff', 
                      color: theme === 'dark' ? '#ffffff' : '#18181b' 
                    }}
                    itemStyle={{ fontSize: '12px', fontWeight: 600, color: theme === 'dark' ? '#ffffff' : '#18181b' }}
                    labelStyle={{ fontSize: '10px', color: '#71717a', marginBottom: '4px', textTransform: 'uppercase', fontWeight: 700 }}
                    formatter={(value: number) => [`${getCurrencySymbol(group?.currency)}${formatCurrency(value)}`, 'Spent']}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="amount" 
                    stroke="#4f46e5" 
                    strokeWidth={4} 
                    dot={{ r: 0 }}
                    activeDot={{ r: 6, fill: '#4f46e5', strokeWidth: 3, stroke: '#fff' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
        <div className={`bg-white dark:bg-zinc-900 p-4 sm:p-8 rounded-[40px] border border-zinc-200 dark:border-zinc-800 shadow-xl shadow-zinc-200/50 dark:shadow-black/20 ${group.budgetType === 'total' ? 'lg:col-span-2' : ''}`}>
          <h3 className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-[0.15em] mb-8 flex items-center gap-2">
            <PieChartIcon className="w-4 h-4" />
            Category Distribution
          </h3>
          <div className="h-[280px] w-full">
            {pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={85}
                    paddingAngle={pieData.length > 1 ? 8 : 0}
                    dataKey="value"
                    nameKey="name"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} strokeWidth={0} />
                    ))}
                  </Pie>
                  <Tooltip 
                    formatter={(value: number) => [`${getCurrencySymbol(group?.currency)}${formatCurrency(value)}`, 'Total']}
                    contentStyle={{ 
                      borderRadius: '16px', 
                      border: 'none', 
                      boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)', 
                      padding: '12px', 
                      backgroundColor: theme === 'dark' ? '#18181b' : '#ffffff', 
                      color: theme === 'dark' ? '#ffffff' : '#18181b' 
                    }}
                    itemStyle={{ color: theme === 'dark' ? '#ffffff' : '#18181b' }}
                  />
                  <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ fontSize: '10px', fontWeight: 500, paddingTop: '20px' }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-zinc-500 dark:text-zinc-400 text-sm">
                <PieChartIcon className="w-10 h-10 mb-2 opacity-20" />
                <p className="font-medium italic">No expenses in this period</p>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
        <div className="lg:col-span-2">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-white flex items-center gap-3 font-display">
              <Receipt className="w-6 h-6 text-zinc-400 dark:text-zinc-500" />
              Transaction History
            </h2>
            <div className="text-xs font-bold text-zinc-500 uppercase tracking-widest">{expenses.length} Total</div>
          </div>
          
          <div className="bg-white dark:bg-zinc-900 rounded-[40px] border border-zinc-200 dark:border-zinc-800 overflow-hidden shadow-xl shadow-zinc-200/50 dark:shadow-black/20">
            {expenses.length === 0 ? (
              <div className="p-10 sm:p-20 text-center">
                <div className="w-16 h-16 sm:w-20 sm:h-20 bg-zinc-50 dark:bg-zinc-800 rounded-full flex items-center justify-center mx-auto mb-6">
                  <Receipt className="w-8 h-8 sm:w-10 sm:h-10 text-zinc-300 dark:text-zinc-600" />
                </div>
                <h3 className="text-lg font-bold text-zinc-900 dark:text-white mb-2">No transactions yet</h3>
                <p className="text-zinc-500 dark:text-zinc-400 max-w-xs mx-auto text-sm">Start tracking your shared expenses by adding your first transaction.</p>
              </div>
            ) : (
              <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {expenses.map(expense => (
                  <div key={expense.id} className="p-4 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between group transition-all duration-200 gap-4 hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                    <div className="flex items-center gap-4 sm:gap-5 min-w-0">
                      <div className="w-12 h-12 sm:w-14 sm:h-14 bg-zinc-50 dark:bg-zinc-800 rounded-2xl flex flex-col items-center justify-center text-zinc-400 dark:text-zinc-500 border border-zinc-100 dark:border-zinc-700 group-hover:bg-white dark:group-hover:bg-zinc-800 transition-colors shrink-0">
                        <span className="text-[9px] sm:text-[10px] font-bold uppercase tracking-tighter text-zinc-500">{expense.date.toDate().toLocaleDateString('en-US', { month: 'short' })}</span>
                        <span className="text-lg sm:text-xl font-bold leading-none text-zinc-900 dark:text-white">{expense.date.toDate().getDate()}</span>
                      </div>
                      <div className="min-w-0">
                        <p className="font-bold text-zinc-900 dark:text-white group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors truncate">{expense.description}</p>
                        <div className="flex flex-wrap items-center gap-2 mt-1">
                          <span className="flex items-center gap-1.5 px-2.5 py-1 bg-zinc-100 dark:bg-zinc-800 rounded-full text-[9px] sm:text-[10px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider border border-zinc-200 dark:border-zinc-700 shrink-0">
                            {(() => {
                              const Icon = getCategoryIcon(expense.category);
                              return <Icon className="w-3 h-3 text-emerald-500 dark:text-emerald-400" />;
                            })()}
                            {expense.category}
                          </span>
                          <span className="text-zinc-300 dark:text-zinc-700 hidden sm:inline shrink-0">•</span>
                          <span className="text-[10px] sm:text-xs text-zinc-500 dark:text-zinc-400 font-medium truncate">Paid by {members.find(m => m.uid === expense.paidBy)?.displayName || 'Unknown'}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between sm:justify-end gap-4 sm:gap-6 w-full sm:w-auto shrink-0 mt-4 sm:mt-0">
                      <div className="text-left sm:text-right min-w-0">
                        <p 
                          className="text-lg sm:text-xl font-bold text-zinc-900 dark:text-white font-mono tracking-tight truncate"
                          title={`${getCurrencySymbol(group?.currency)}${formatCurrency(expense.amount)}`}
                        >
                          {getCurrencySymbol(group?.currency)}{formatCurrency(expense.amount)}
                        </p>
                        <p className="text-[9px] sm:text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Amount</p>
                      </div>
                      <div className="flex items-center gap-1">
                        <button 
                          onClick={() => setEditingExpense(expense)}
                          className="p-2 text-zinc-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 rounded-xl sm:opacity-0 group-hover:opacity-100 focus:opacity-100 focus:bg-emerald-50 dark:focus:bg-emerald-500/10 transition-all active:scale-90 outline-none focus:ring-2 focus:ring-emerald-500"
                          title="Edit Expense"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => setExpenseToDelete(expense.id)}
                          className="p-2 text-zinc-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-xl sm:opacity-0 group-hover:opacity-100 focus:opacity-100 focus:bg-red-50 dark:focus:bg-red-500/10 transition-all active:scale-90 outline-none focus:ring-2 focus:ring-red-500"
                          title="Delete Expense"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div>
          <h2 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-white mb-8 flex items-center gap-3 font-display">
            <Users className="w-6 h-6 text-zinc-400 dark:text-zinc-500" />
            Group Members
          </h2>
          <div className="bg-white dark:bg-zinc-900 p-8 rounded-[40px] border border-zinc-200 dark:border-zinc-800 shadow-xl shadow-zinc-200/50 dark:shadow-black/20">
            <div className="space-y-6">
              {members.map(member => (
                <div key={member.uid} className="flex items-center justify-between group">
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="relative shrink-0">
                      <div className="w-12 h-12 bg-zinc-50 dark:bg-zinc-800 rounded-2xl flex items-center justify-center text-zinc-400 dark:text-zinc-500 font-bold border border-zinc-100 dark:border-zinc-700 group-hover:border-emerald-500 transition-colors">
                        {member.displayName?.charAt(0)}
                      </div>
                      {member.uid === group.createdBy && (
                        <div className="absolute -top-1 -right-1 w-4 h-4 bg-emerald-600 rounded-full border-2 border-white dark:border-zinc-900 flex items-center justify-center">
                          <Sparkles className="w-2 h-2 text-white" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-zinc-900 dark:text-white truncate">{member.displayName}</p>
                      <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest truncate">{member.role}</p>
                    </div>
                  </div>
                  {member.uid === group.createdBy && (
                    <span className="shrink-0 text-[9px] font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-100 dark:border-emerald-500/20 ml-2">OWNER</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Add Expense Modal */}
      <AnimatePresence>
        {isAddExpenseOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              onClick={() => {
                setIsAddExpenseOpen(false);
                setEditingExpense(null);
              }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby="add-expense-title"
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md bg-white dark:bg-zinc-900 rounded-[40px] shadow-2xl p-6 sm:p-10 outline-none"
            >
              <div className="flex items-center justify-between mb-8">
                <h3 id="add-expense-title" className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white font-display">
                  {editingExpense ? 'Edit Expense' : 'Add Expense'}
                </h3>
                <button 
                  type="button"
                  onClick={() => {
                    setIsAddExpenseOpen(false);
                    setEditingExpense(null);
                  }} 
                  className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition-colors outline-none focus:ring-2 focus:ring-emerald-500"
                  aria-label="Close modal"
                >
                  <X className="w-5 h-5 text-zinc-500" />
                </button>
              </div>
              <form onSubmit={handleAddExpense} className="space-y-6">
                <div>
                  <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-[0.15em] mb-2">Amount</label>
                  <div className="relative">
                    <span className="absolute left-5 top-1/2 -translate-y-1/2 text-zinc-400 font-mono font-bold">{getCurrencySymbol(group?.currency)}</span>
                    <input
                      type="number"
                      step="0.01"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      className="w-full pl-10 pr-5 py-4 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all font-mono font-bold text-lg dark:text-white"
                      placeholder="0.00"
                      required
                      autoFocus
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-[0.15em] mb-2">Description</label>
                  <input
                    type="text"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="w-full px-5 py-4 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all font-medium dark:text-white"
                    placeholder="What was it for?"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-[0.15em] mb-3">Category</label>
                  <div className="flex flex-wrap gap-2 pb-2">
                    {CATEGORIES.map(c => {
                      const CatIcon = getCategoryIcon(c);
                      return (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setCategory(c)}
                          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border transition-all ${category === c ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-500/50 text-emerald-600 dark:text-emerald-400 shadow-sm' : 'bg-zinc-50 dark:bg-zinc-800/50 border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'}`}
                        >
                          <CatIcon className="w-4 h-4" />
                          <span className="text-xs font-bold">{c}</span>
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
                      value={date}
                      onClick={(e) => e.currentTarget.showPicker()}
                      onChange={(e) => setDate(e.target.value)}
                      className="w-full pl-5 pr-12 py-4 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all font-medium dark:text-white [&::-webkit-calendar-picker-indicator]:opacity-0 cursor-pointer"
                      required
                    />
                    <Calendar className="absolute right-5 top-1/2 -translate-y-1/2 w-5 h-5 text-emerald-500 opacity-80 pointer-events-none" />
                  </div>
                </div>
                <button
                  type="submit"
                  className="w-full py-4 bg-zinc-900 dark:bg-emerald-600 text-white rounded-2xl font-bold hover:bg-zinc-800 dark:hover:bg-emerald-700 transition-all mt-4 shadow-lg shadow-zinc-200 dark:shadow-emerald-500/20 active:scale-95"
                >
                  {editingExpense ? 'Update Transaction' : 'Save Transaction'}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Add Member Modal */}
      <AnimatePresence>
        {isAddMemberOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              onClick={() => setIsAddMemberOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby="add-member-title"
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md bg-white dark:bg-zinc-900 rounded-[40px] shadow-2xl p-10 outline-none"
            >
              <div className="flex items-center justify-between mb-2">
                <h3 id="add-member-title" className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white font-display">Invite Member</h3>
                <button 
                  type="button"
                  onClick={() => setIsAddMemberOpen(false)} 
                  className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition-colors outline-none focus:ring-2 focus:ring-emerald-500"
                  aria-label="Close modal"
                >
                  <X className="w-5 h-5 text-zinc-500" />
                </button>
              </div>
              <p className="text-zinc-500 dark:text-zinc-400 text-sm mb-8">Enter the email address of the person you want to add.</p>
              
              {inviteError && (
                <div className="mb-6 p-4 bg-red-50 dark:bg-red-500/10 border border-red-100 dark:border-red-500/20 text-red-600 dark:text-red-400 text-xs font-bold rounded-2xl">
                  {inviteError}
                </div>
              )}

              {inviteSuccess && (
                <div className="mb-6 p-4 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-100 dark:border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-bold rounded-2xl flex items-center gap-2">
                  <Sparkles className="w-4 h-4" />
                  Member added successfully!
                </div>
              )}

              <form onSubmit={handleAddMember} className="space-y-6">
                <div>
                  <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-[0.15em] mb-2">Email Address</label>
                  <input
                    type="email"
                    value={newMemberEmail}
                    onChange={(e) => {
                      setNewMemberEmail(e.target.value);
                      setInviteError(null);
                    }}
                    className="w-full px-5 py-4 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all font-medium dark:text-white"
                    placeholder="friend@example.com"
                    required
                    disabled={inviteLoading || inviteSuccess}
                    autoFocus
                  />
                </div>
                <button
                  type="submit"
                  disabled={inviteLoading || inviteSuccess}
                  className="w-full py-4 bg-zinc-900 dark:bg-emerald-600 text-white rounded-2xl font-bold hover:bg-zinc-800 dark:hover:bg-emerald-700 transition-all mt-4 flex items-center justify-center gap-2 disabled:opacity-50 shadow-lg shadow-zinc-200 dark:shadow-emerald-500/20 active:scale-95"
                >
                  {inviteLoading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Adding...
                    </>
                  ) : (
                    'Add to Group'
                  )}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Settings Modal */}
      <AnimatePresence>
        {isSettingsOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              onClick={() => setIsSettingsOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby="settings-title"
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md bg-white dark:bg-zinc-900 rounded-[40px] shadow-2xl p-10 max-h-[90vh] overflow-y-auto outline-none"
            >
              <div className="flex items-center justify-between mb-8">
                <h3 id="settings-title" className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white font-display">Group Settings</h3>
                <button 
                  type="button"
                  onClick={() => setIsSettingsOpen(false)} 
                  className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition-colors outline-none focus:ring-2 focus:ring-emerald-500"
                  aria-label="Close modal"
                >
                  <X className="w-5 h-5 text-zinc-500" />
                </button>
              </div>
              <form onSubmit={handleUpdateSettings} className="space-y-8">
                <div>
                  <h4 className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-400 mb-6">General Info</h4>
                  <div className="space-y-5">
                    <div>
                      <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-[0.15em] mb-2">Group Name</label>
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="w-full px-5 py-4 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all font-medium dark:text-white"
                        required
                        autoFocus
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-[0.15em] mb-2">Description</label>
                      <textarea
                        value={editDescription}
                        onChange={(e) => setEditDescription(e.target.value)}
                        className="w-full px-5 py-4 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all font-medium resize-none h-24 dark:text-white"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <h4 className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-400 mb-6">Budget Limits</h4>
                  <div className="space-y-5">
                    <div>
                      <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-[0.15em] mb-2">Max Budget</label>
                      <div className="relative">
                        <span className="absolute left-5 top-1/2 -translate-y-1/2 text-zinc-400 font-mono font-bold">{getCurrencySymbol(group?.currency)}</span>
                        <input
                          type="number"
                          step="0.01"
                          value={editMaxBudget}
                          onChange={(e) => setEditMaxBudget(e.target.value)}
                          placeholder="No limit"
                          className="w-full pl-10 pr-5 py-4 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all font-mono font-bold dark:text-white"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-[0.15em] mb-2">Frequency</label>
                      <select
                        value={editBudgetType}
                        onChange={(e) => setEditBudgetType(e.target.value as BudgetType)}
                        className="w-full px-5 py-4 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all font-medium appearance-none dark:text-white"
                      >
                        <option value="weekly">Per Week</option>
                        <option value="monthly">Per Month</option>
                        <option value="total">Total</option>
                      </select>
                    </div>
                  </div>
                </div>
                <button
                  type="submit"
                  className="w-full py-4 bg-zinc-900 dark:bg-emerald-600 text-white rounded-2xl font-bold hover:bg-zinc-800 dark:hover:bg-emerald-700 transition-all shadow-lg shadow-zinc-200 dark:shadow-emerald-500/20 active:scale-95"
                >
                  Save Settings
                </button>

                {(members.find(m => m.uid === user.uid)?.role === 'admin' || group?.createdBy === user.uid) && (
                  <div className="pt-8 border-t border-zinc-100 dark:border-zinc-800">
                    <button
                      type="button"
                      onClick={() => {
                        setIsSettingsOpen(false);
                        setIsDeleteGroupConfirmOpen(true);
                      }}
                      className="w-full py-4 bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 rounded-2xl font-bold hover:bg-red-100 dark:hover:bg-red-500/20 transition-all flex items-center justify-center gap-2 active:scale-95"
                    >
                      <Trash2 className="w-5 h-5" />
                      Delete Group
                    </button>
                  </div>
                )}
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      
      {/* AI Analysis Modal */}
      <AnimatePresence>
        {isAnalysisModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              onClick={closeAnalysisModal}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              ref={analysisModalRef}
              tabIndex={-1}
              role="dialog"
              aria-modal="true"
              aria-labelledby="analysis-title"
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-2xl bg-white dark:bg-zinc-900 rounded-[40px] shadow-2xl p-10 max-h-[85vh] overflow-y-auto outline-none"
            >
              <div className="flex items-center gap-4 mb-8">
                <div className="w-12 h-12 bg-emerald-50 dark:bg-emerald-500/10 rounded-2xl flex items-center justify-center text-emerald-600 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-500/20">
                  <Sparkles className="w-6 h-6" />
                </div>
                <div>
                  <h3 id="analysis-title" className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white font-display">Spending Analysis</h3>
                  <p className="text-zinc-500 dark:text-zinc-400 text-sm">AI-powered insights for {group.name}</p>
                </div>
              </div>

              {isAnalyzing ? (
                <div className="py-16 flex flex-col items-center justify-center gap-6 text-zinc-400">
                  <div className="relative">
                    <Loader2 className="w-10 h-10 animate-spin text-emerald-600" />
                    <div className="absolute inset-0 blur-lg bg-emerald-400/20 animate-pulse" />
                  </div>
                  <p className="font-bold text-sm uppercase tracking-widest animate-pulse">Analyzing your spending habits...</p>
                </div>
              ) : (
                <div className="max-w-none">
                  <div className="bg-zinc-50 dark:bg-zinc-800 rounded-[32px] p-8 border border-zinc-200 dark:border-zinc-700 analysis-content dark:text-zinc-300">
                    <Markdown>{analysisResult || ""}</Markdown>
                  </div>
                  <button
                    onClick={closeAnalysisModal}
                    className="w-full py-4 bg-zinc-900 dark:bg-emerald-600 text-white rounded-2xl font-bold hover:bg-zinc-800 dark:hover:bg-emerald-700 transition-all mt-8 shadow-lg shadow-zinc-200 dark:shadow-emerald-500/20 active:scale-95"
                  >
                    Close Analysis
                  </button>
                </div>
              )}

            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {/* Delete Group Confirmation Modal */}
      <AnimatePresence>
        {isDeleteGroupConfirmOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              onClick={() => setIsDeleteGroupConfirmOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              ref={deleteGroupModalRef}
              tabIndex={-1}
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="delete-group-title"
              aria-describedby="delete-group-desc"
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-sm bg-white dark:bg-zinc-900 rounded-[40px] shadow-2xl p-10 text-center outline-none"
            >
              <div className="w-20 h-20 bg-red-50 dark:bg-red-500/10 rounded-3xl flex items-center justify-center mx-auto mb-8 text-red-600 dark:text-red-400 border border-red-100 dark:border-red-500/20">
                <Trash2 className="w-10 h-10" />
              </div>
              <h3 id="delete-group-title" className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white mb-3 font-display">Delete Group?</h3>
              <p id="delete-group-desc" className="text-zinc-500 dark:text-zinc-400 text-sm mb-10 leading-relaxed">This will permanently delete the group <strong>{group?.name}</strong> and all its expenses. This action cannot be undone.</p>
              <div className="flex gap-4">
                <button
                  onClick={() => setIsDeleteGroupConfirmOpen(false)}
                  className="flex-1 py-4 bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 rounded-2xl font-bold hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-all active:scale-95"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteGroup}
                  className="flex-1 py-4 bg-red-600 text-white rounded-2xl font-bold hover:bg-red-700 transition-all shadow-lg shadow-red-200 dark:shadow-red-500/20 active:scale-95"
                >
                  Delete
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Stat Details Modal */}
      <AnimatePresence>
        {selectedStatDetails && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              onClick={() => setSelectedStatDetails(null)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              ref={statModalRef}
              tabIndex={-1}
              role="dialog"
              aria-modal="true"
              aria-labelledby="stat-title"
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md bg-white dark:bg-zinc-900 rounded-[40px] shadow-2xl p-10 text-center outline-none"
            >
              <p id="stat-title" className="text-xs font-bold text-zinc-500 uppercase tracking-[0.2em] mb-4 font-display">{selectedStatDetails.title}</p>
              <p className="text-5xl sm:text-6xl font-bold text-zinc-900 dark:text-white font-display tracking-tight mb-2 break-all">
                {getCurrencySymbol(group?.currency)}{formatCurrency(selectedStatDetails.amount)}
              </p>
              {selectedStatDetails.subtitle && (
                <p className="text-sm font-medium text-zinc-500 mt-4">
                  {selectedStatDetails.subtitle}
                </p>
              )}
              <button
                onClick={() => setSelectedStatDetails(null)}
                className="w-full py-4 bg-zinc-900 dark:bg-emerald-600 text-white rounded-2xl font-bold hover:bg-zinc-800 dark:hover:bg-emerald-700 transition-all mt-8 shadow-lg shadow-zinc-200 dark:shadow-emerald-500/20 active:scale-95"
              >
                Close
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {expenseToDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
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
              className="relative w-full max-w-sm bg-white dark:bg-zinc-900 rounded-[40px] shadow-2xl p-10 text-center outline-none"
            >
              <div className="w-20 h-20 bg-red-50 dark:bg-red-500/10 rounded-3xl flex items-center justify-center mx-auto mb-8 text-red-600 dark:text-red-400 border border-red-100 dark:border-red-500/20">
                <Trash2 className="w-10 h-10" />
              </div>
              <h3 id="delete-expense-title" className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white mb-3 font-display">Delete Expense?</h3>
              <p id="delete-expense-desc" className="text-zinc-500 dark:text-zinc-400 text-sm mb-10 leading-relaxed">This action cannot be undone. Are you sure you want to remove this expense?</p>
              <div className="flex gap-4">
                <button
                  onClick={() => setExpenseToDelete(null)}
                  className="flex-1 py-4 bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 rounded-2xl font-bold hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-all active:scale-95"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleDeleteExpense(expenseToDelete)}
                  className="flex-1 py-4 bg-red-600 text-white rounded-2xl font-bold hover:bg-red-700 transition-all shadow-lg shadow-red-200 dark:shadow-red-500/20 active:scale-95"
                >
                  Delete
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
