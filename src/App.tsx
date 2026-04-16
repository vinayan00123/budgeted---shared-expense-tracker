/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { auth, db, signIn, logOut, signInAnonymously, createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile } from './firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { 
  collection, 
  query, 
  onSnapshot, 
  doc, 
  setDoc, 
  serverTimestamp, 
  getDoc,
  getDocs,
  deleteDoc,
  collectionGroup,
  where
} from 'firebase/firestore';
import { 
  Plus, 
  LogOut, 
  LayoutDashboard, 
  Users, 
  Receipt, 
  Settings, 
  ChevronRight,
  Wallet,
  PieChart,
  ArrowUpRight,
  ArrowDownLeft,
  Search,
  Filter,
  MoreVertical,
  Menu,
  X,
  Sun,
  Moon,
  Mail,
  Key,
  User as UserIcon,
  Loader2,
  Eye,
  EyeOff,
  CheckCircle2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Group, UserProfile } from './types';

// Components
import Dashboard from './components/Dashboard';
import GroupView from './components/GroupView';
import CreateGroupModal from './components/CreateGroupModal';
import ProfileModal from './components/ProfileModal';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [groups, setGroups] = useState<Group[]>([]);
  const [lastError, setLastError] = useState<string | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [dataDeletedPopup, setDataDeletedPopup] = useState(false);
  const [showWelcomePopup, setShowWelcomePopup] = useState(false);

  // New Auth States
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('theme') as 'light' | 'dark') || 'dark';
    }
    return 'dark';
  });

  useEffect(() => {
    const root = window.document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  };

  const handleSignIn = async () => {
    setIsSigningIn(true);
    setAuthError(null);
    try {
      await signIn();
    } catch (error: any) {
      console.error(error);
      setAuthError(error.message);
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    
    if (authMode === 'register' && password !== confirmPassword) {
      setAuthError("Passwords do not match.");
      return;
    }
    
    setIsAuthLoading(true);
    setAuthError(null);
    try {
      if (authMode === 'register') {
        const userCred = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(userCred.user, { displayName: email.split('@')[0] });
        setShowSuccessDialog(true);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (error: any) {
      console.error("Auth error", error);
      let message = error.message;
      if (error.code === 'auth/invalid-credential') {
        message = authMode === 'login' 
          ? "Invalid email or password. Please check your credentials or create an account." 
          : "Could not create account with these credentials.";
      } else if (error.code === 'auth/email-already-in-use') {
        message = "This email is already registered. Please sign in instead.";
      } else if (error.code === 'auth/weak-password') {
        message = "Password should be at least 6 characters.";
      } else if (error.code === 'auth/operation-not-allowed') {
        message = "This login method is not enabled. Please enable it in the Firebase Console.";
      }
      setAuthError(message);
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleGuestLogin = async () => {
    setIsAuthLoading(true);
    setAuthError(null);
    try {
      await signInAnonymously(auth);
    } catch (error: any) {
      console.error("Guest login error", error);
      if (error.code === 'auth/operation-not-allowed') {
        setAuthError("Guest Login (Anonymous Auth) is not enabled in your Firebase Console.");
      } else {
        setAuthError("Failed to login as guest. " + error.message);
      }
    } finally {
      setIsAuthLoading(false);
    }
  };

  useEffect(() => {
    (window as any).openCreateGroupModal = () => setIsCreateModalOpen(true);
    return () => {
      delete (window as any).openCreateGroupModal;
    };
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        // Check if user has seen welcome popup
        const hasSeenWelcome = localStorage.getItem(`hasSeenWelcome_${currentUser.uid}`);
        if (!hasSeenWelcome) {
          setShowWelcomePopup(true);
        }

        // Ensure user profile exists
        const userRef = doc(db, 'users', currentUser.uid);
        const userSnap = await getDoc(userRef);
        if (!userSnap.exists()) {
          try {
            await setDoc(userRef, {
              uid: currentUser.uid,
              displayName: currentUser.displayName || (currentUser.isAnonymous ? 'Guest User' : currentUser.email?.split('@')[0]) || 'Unknown User',
              email: currentUser.email || `guest-${currentUser.uid.substring(0,6)}@budgeted.local`,
              photoURL: currentUser.photoURL,
              createdAt: serverTimestamp(),
            });
          } catch (error) {
            console.error("Error creating user profile:", error);
          }
        }

        // Test connection
        try {
          const { getDocFromServer } = await import('firebase/firestore');
          await getDocFromServer(doc(db, 'users', currentUser.uid));
          console.log("Firestore connection successful");
        } catch (error) {
          if (error instanceof Error && error.message.includes('offline')) {
            console.error("Firestore connection failed: client is offline");
          }
        }
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) {
      setGroups([]);
      return;
    }

    // Query groups where the user is a member using the memberIds array
    const groupsQuery = query(
      collection(db, 'groups'),
      where('memberIds', 'array-contains', user.uid)
    );

    const unsubscribe = onSnapshot(groupsQuery, (snapshot) => {
      console.log(`Groups snapshot received: ${snapshot.docs.length} groups`);
      setLastError(null);
      const fetchedGroups = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as Group));
      setGroups(fetchedGroups);
    }, (error) => {
      console.error("Error fetching groups:", error);
      setLastError(error.message);
      if (error.message.includes('Missing or insufficient permissions')) {
        console.warn("Permission denied for groups query. Check firestore.rules.");
        return;
      }
    });

    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    if (selectedGroupId && !groups.find(g => g.id === selectedGroupId)) {
      setSelectedGroupId(null);
    }
  }, [groups, selectedGroupId]);

  if (loading || isSigningIn) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-zinc-50 dark:bg-black transition-colors duration-300">
        <div className="w-64 h-1 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden relative">
          <motion.div 
            initial={{ x: '-100%' }}
            animate={{ x: '200%' }}
            transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
            className="w-1/2 h-full absolute top-0 bg-emerald-500 rounded-full shadow-[0_0_15px_rgba(16,185,129,0.7)]"
          />
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-white dark:bg-black p-4 text-center relative overflow-hidden transition-colors duration-300">
        {/* Background Gradients */}
        <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
          <div className="absolute -top-1/4 -left-1/4 w-[80%] h-[80%] bg-emerald-600/10 dark:bg-emerald-600/20 rounded-full blur-[120px]" />
          <div className="absolute -bottom-1/4 -right-1/4 w-[80%] h-[80%] bg-lime-600/10 dark:bg-lime-600/20 rounded-full blur-[120px]" />
        </div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full bg-zinc-50/80 dark:bg-zinc-900/80 backdrop-blur-2xl p-8 sm:p-10 rounded-[48px] shadow-2xl border border-zinc-200 dark:border-white/10 relative z-10"
        >
          <div className="w-16 h-16 sm:w-20 sm:h-20 bg-gradient-to-br from-emerald-500 to-lime-500 rounded-[24px] flex items-center justify-center mx-auto mb-6 shadow-xl shadow-emerald-500/20">
            <Wallet className="w-8 h-8 sm:w-10 sm:h-10 text-white" />
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-2 text-zinc-900 dark:text-white font-display">Budgeted</h1>
          <p className="text-zinc-500 dark:text-zinc-400 mb-8 leading-relaxed text-sm">Professional expense tracking.</p>

          {authError && (
            <div className="mb-6 p-4 bg-red-50 dark:bg-red-500/10 border border-red-100 dark:border-red-500/20 rounded-2xl text-red-600 dark:text-red-400 text-xs font-bold text-left shadow-inner flex flex-col gap-2">
              <p>{authError}</p>
              {authError.includes("enable") && (
                <p className="text-[10px] opacity-80 font-medium border-t border-red-200 dark:border-red-500/30 pt-2">
                  Tip: Go to Firebase Console &gt; Authentication &gt; Sign-in method and enable the providers.
                </p>
              )}
            </div>
          )}

          <div className="flex gap-2 mb-6 p-1 bg-zinc-100 dark:bg-zinc-800/80 rounded-2xl">
            <button
              onClick={() => {
                setAuthMode('login');
                setEmail('');
                setPassword('');
                setConfirmPassword('');
                setAuthError(null);
              }}
              className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${authMode === 'login' ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'}`}
            >
              Sign In
            </button>
            <button
              onClick={() => {
                setAuthMode('register');
                setEmail('');
                setPassword('');
                setConfirmPassword('');
                setAuthError(null);
              }}
              className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${authMode === 'register' ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'}`}
            >
              Create Account
            </button>
          </div>

          <form onSubmit={handleEmailAuth} className="space-y-4 mb-6">
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400" />
              <input 
                type="email" 
                placeholder="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-12 pr-4 py-4 bg-white dark:bg-zinc-950/50 border border-zinc-200 dark:border-zinc-800 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all font-medium text-sm text-zinc-900 dark:text-white placeholder:text-zinc-400"
                required
              />
            </div>
            <div className="relative">
              <Key className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400" />
              <input 
                type={showPassword ? "text" : "password"} 
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-12 pr-12 py-4 bg-white dark:bg-zinc-950/50 border border-zinc-200 dark:border-zinc-800 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all font-medium text-sm text-zinc-900 dark:text-white placeholder:text-zinc-400"
                required
                minLength={6}
              />
              <button 
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
            
            {authMode === 'register' && (
              <div className="relative">
                <Key className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400" />
                <input 
                  type={showConfirmPassword ? "text" : "password"} 
                  placeholder="Confirm Password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full pl-12 pr-12 py-4 bg-white dark:bg-zinc-950/50 border border-zinc-200 dark:border-zinc-800 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all font-medium text-sm text-zinc-900 dark:text-white placeholder:text-zinc-400"
                  required
                  minLength={6}
                />
                <button 
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
                >
                  {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            )}

            <button
              type="submit"
              disabled={isAuthLoading}
              className="w-full py-4 bg-emerald-600 text-white rounded-2xl font-bold hover:bg-emerald-700 transition-all active:scale-[0.98] flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 text-sm disabled:opacity-50"
            >
              {isAuthLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : (authMode === 'login' ? 'Sign In' : 'Create Account')}
            </button>
          </form>

          <div className="relative flex items-center py-2 mb-6 opacity-60">
            <div className="flex-grow border-t border-zinc-300 dark:border-zinc-700"></div>
            <span className="flex-shrink-0 mx-4 text-zinc-500 text-xs font-bold uppercase tracking-wider">Or</span>
            <div className="flex-grow border-t border-zinc-300 dark:border-zinc-700"></div>
          </div>

          <div className="space-y-3">
            <button
              onClick={handleSignIn}
              type="button"
              className="w-full py-3.5 bg-zinc-900 dark:bg-white text-white dark:text-zinc-950 rounded-2xl font-bold hover:bg-zinc-800 dark:hover:bg-zinc-100 transition-all active:scale-[0.98] flex items-center justify-center gap-3 shadow-lg shadow-zinc-900/10 dark:shadow-white/10 text-sm outline-none focus:ring-4 focus:ring-zinc-500/40"
            >
              <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="" className="w-5 h-5 bg-white rounded-full p-0.5" />
              Continue with Google
            </button>
            
            <button
              onClick={handleGuestLogin}
              type="button"
              disabled={isAuthLoading}
              className="w-full py-3.5 bg-white dark:bg-zinc-800/80 text-zinc-900 dark:text-white rounded-2xl font-bold hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-all active:scale-[0.98] flex items-center justify-center gap-3 shadow-sm border border-zinc-200 dark:border-zinc-700 text-sm disabled:opacity-50"
            >
              {isAuthLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <UserIcon className="w-5 h-5 text-zinc-500" />}
              Continue as Guest
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-zinc-50 dark:bg-black font-sans selection:bg-emerald-100 selection:text-emerald-900 relative overflow-hidden transition-colors duration-300">
      {/* Debug Overlay */}
      {process.env.NODE_ENV !== 'production' && (
        <div className="fixed bottom-4 right-4 z-[100] bg-black/80 text-white p-4 rounded-2xl text-[10px] font-mono max-w-xs pointer-events-none">
          <p className="font-bold mb-1 text-emerald-400">DEBUG INFO</p>
          <p>Groups: {groups.length}</p>
          <p>User: {user.uid.slice(0, 8)}...</p>
          {lastError && <p className="text-red-400 mt-2">Error: {lastError}</p>}
        </div>
      )}

      {/* Mobile Sidebar Overlay */}
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsSidebarOpen(false)}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <aside className={`
        fixed lg:static inset-y-0 left-0 w-72 bg-white dark:bg-black border-r border-zinc-200 dark:border-white/5 flex flex-col z-50 lg:z-10 transition-all duration-300 ease-in-out overflow-y-auto custom-scrollbar
        ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        {/* Vibrant background glow */}
        <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none opacity-10 dark:opacity-20">
          <div className="absolute -top-24 -left-24 w-64 h-64 bg-emerald-600 rounded-full blur-[100px]" />
          <div className="absolute top-1/2 -right-32 w-64 h-64 bg-lime-600 rounded-full blur-[100px]" />
        </div>

        <div className="p-8 relative z-10 shrink-0">
          <div className="flex items-center justify-between mb-10">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-lime-500 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/20">
                <Wallet className="w-6 h-6 text-white" />
              </div>
              <span className="text-xl font-bold tracking-tight text-zinc-900 dark:text-white font-display">Budgeted</span>
            </div>
            <button 
              onClick={() => setIsSidebarOpen(false)}
              className="lg:hidden p-2 text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          <nav className="space-y-1.5">
            <button 
              onClick={() => {
                setSelectedGroupId(null);
                setIsSidebarOpen(false);
              }}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 ${!selectedGroupId ? 'bg-zinc-900 dark:bg-white text-white dark:text-zinc-950 shadow-xl shadow-zinc-900/10 dark:shadow-white/10' : 'text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-white/5 hover:text-zinc-900 dark:hover:text-white'}`}
            >
              <LayoutDashboard className="w-5 h-5" />
              <span className="font-bold">Dashboard</span>
            </button>
          </nav>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-2 relative z-10 custom-scrollbar min-h-[200px]">
          <div className="flex items-center justify-between px-4 mb-4">
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-400 dark:text-zinc-500">Your Groups</span>
            <button 
              onClick={() => {
                setIsCreateModalOpen(true);
                setIsSidebarOpen(false);
              }}
              className="p-1.5 hover:bg-zinc-100 dark:hover:bg-white/10 rounded-lg transition-colors text-zinc-400 dark:text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-1">
            {groups.map(group => (
              <button
                key={group.id}
                onClick={() => {
                  setSelectedGroupId(group.id);
                  setIsSidebarOpen(false);
                }}
                className={`w-full flex items-center justify-between px-4 py-3 rounded-xl transition-all duration-300 group ${selectedGroupId === group.id ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/20' : 'text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-white/5 hover:text-zinc-900 dark:hover:text-white'}`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full transition-transform group-hover:scale-125 ${group.type === 'personal' ? 'bg-blue-400' : group.type === 'household' ? 'bg-emerald-400' : 'bg-orange-400'}`} />
                  <span className="truncate text-sm font-medium">{group.name}</span>
                </div>
                {selectedGroupId === group.id && <ChevronRight className="w-4 h-4 opacity-70" />}
              </button>
            ))}
            {groups.length === 0 && (
              <div className="px-4 py-8 text-center">
                <p className="text-xs text-zinc-400 dark:text-zinc-600 italic">No groups yet</p>
              </div>
            )}
          </div>
        </div>

        <div className="p-6 mt-auto relative z-10 shrink-0">
          <button 
            onClick={() => setIsProfileModalOpen(true)}
            className="w-full p-4 bg-zinc-50 dark:bg-white/5 rounded-2xl border border-zinc-200 dark:border-white/10 mb-4 backdrop-blur-md hover:bg-zinc-100 dark:hover:bg-white/10 transition-colors text-left focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <div className="flex items-center gap-3">
              <img src={user.photoURL || `https://ui-avatars.com/api/?name=${user.displayName}&background=random`} alt="" className="w-10 h-10 rounded-xl shadow-sm border border-zinc-200 dark:border-white/10 object-cover bg-white" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-zinc-900 dark:text-white truncate">{user.displayName}</p>
                <p className="text-[10px] text-zinc-500 truncate font-mono">{user.email}</p>
              </div>
            </div>
          </button>
          <div className="flex items-center gap-2">
            <button 
              onClick={logOut}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-zinc-500 dark:text-zinc-400 hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400 transition-all duration-300 font-bold text-sm"
            >
              <LogOut className="w-4 h-4" />
              Sign Out
            </button>
            <button 
              onClick={toggleTheme}
              className="p-3 rounded-xl text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-white/5 hover:text-zinc-900 dark:hover:text-white transition-all duration-300"
              title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            >
              {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto relative">
        {/* Mobile Header */}
        <div className="lg:hidden flex items-center justify-between p-4 bg-black border-b border-white/5 sticky top-0 z-30">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-br from-emerald-500 to-lime-500 rounded-lg flex items-center justify-center">
              <Wallet className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-white font-display">Budgeted</span>
          </div>
          <button 
            onClick={() => setIsSidebarOpen(true)}
            className="p-2 text-zinc-400 hover:text-white"
          >
            <Menu className="w-6 h-6" />
          </button>
        </div>
        <AnimatePresence mode="wait">
          {!selectedGroupId ? (
            <motion.div
              key="dashboard"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3 }}
              className="p-10 max-w-7xl mx-auto"
            >
              <Dashboard 
                user={user} 
                groups={groups} 
                onSelectGroup={(id) => {
                  setSelectedGroupId(id);
                  setIsSidebarOpen(false);
                }}
                theme={theme}
              />
            </motion.div>
          ) : (
            <motion.div
              key={selectedGroupId}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3 }}
              className="p-10 max-w-7xl mx-auto"
            >
              <GroupView 
                groupId={selectedGroupId} 
                user={user} 
                onBack={() => setSelectedGroupId(null)} 
                theme={theme}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Modals */}

      {/* Success Dialog */}
      <AnimatePresence>
        {showSuccessDialog && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setShowSuccessDialog(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-sm bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-[40px] shadow-2xl p-10 text-center"
            >
              <div className="w-20 h-20 bg-emerald-50 dark:bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto mb-8 border border-emerald-100 dark:border-emerald-500/20">
                <CheckCircle2 className="w-10 h-10 text-emerald-500" />
              </div>
              <h3 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white mb-4 font-display">Account Created!</h3>
              <p className="text-zinc-500 dark:text-zinc-400 mb-8 leading-relaxed text-sm">
                Your account has been successfully created. You can now use the dashboard!
              </p>
              <button
                onClick={() => setShowSuccessDialog(false)}
                className="w-full py-4 bg-emerald-600 text-white rounded-2xl font-bold hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-500/20 active:scale-95 text-sm"
              >
                Let's get started
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <CreateGroupModal 
        isOpen={isCreateModalOpen} 
        onClose={() => setIsCreateModalOpen(false)} 
        user={user}
      />

      <ProfileModal
        isOpen={isProfileModalOpen}
        onClose={() => setIsProfileModalOpen(false)}
        user={user}
        groups={groups}
        onSelectGroup={(groupId) => {
          setSelectedGroupId(groupId);
          setIsSidebarOpen(false);
        }}
      />

      {/* Welcome Popup removed */}
    </div>
  );
}
