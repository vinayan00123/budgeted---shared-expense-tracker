import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, User as UserIcon, Mail, Calendar, Users, Briefcase, Home, Plane } from 'lucide-react';
import { User } from 'firebase/auth';
import { Group } from '../types';

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User;
  groups: Group[];
  onSelectGroup: (groupId: string) => void;
}

export default function ProfileModal({ isOpen, onClose, user, groups, onSelectGroup }: ProfileModalProps) {
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const getGroupIcon = (type: string) => {
    switch (type) {
      case 'household': return <Home className="w-5 h-5 text-emerald-500" />;
      case 'trip': return <Plane className="w-5 h-5 text-orange-500" />;
      case 'personal': return <Users className="w-5 h-5 text-blue-500" />;
      default: return <Briefcase className="w-5 h-5 text-emerald-500" />;
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative w-full max-w-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-[32px] shadow-2xl overflow-hidden"
          >
            <div className="p-8">
              <div className="flex items-center justify-between mb-8">
                <h2 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white font-display flex items-center gap-2">
                  <UserIcon className="w-6 h-6 text-zinc-400" />
                  Your Profile
                </h2>
                <button 
                  onClick={onClose} 
                  className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition-colors text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex items-center gap-6 mb-10 p-6 bg-zinc-50 dark:bg-black/20 rounded-3xl border border-zinc-100 dark:border-zinc-800/50">
                <img 
                  src={user.photoURL || `https://ui-avatars.com/api/?name=${user.displayName}&background=random`} 
                  alt="Profile" 
                  className="w-20 h-20 rounded-2xl shadow-lg border-2 border-white dark:border-zinc-800 object-cover bg-white" 
                />
                <div className="flex-1 min-w-0">
                  <h3 className="text-xl font-bold text-zinc-900 dark:text-white truncate">{user.displayName}</h3>
                  <div className="flex items-center gap-2 text-sm text-zinc-500 mt-1">
                    <Mail className="w-4 h-4 shrink-0" />
                    <span className="truncate">{user.email}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-zinc-500 mt-1">
                    <Calendar className="w-4 h-4 shrink-0" />
                    <span>Active Member</span>
                  </div>
                </div>
              </div>

              <div className="mb-2">
                <h3 className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-4 flex items-center justify-between">
                  <span>Your Groups</span>
                  <span className="bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-white px-2 py-0.5 rounded-full">{groups.length}</span>
                </h3>
                <div className="space-y-3 max-h-[300px] overflow-y-auto custom-scrollbar pr-2">
                  {groups.length === 0 ? (
                    <div className="text-center py-8 text-zinc-500 border border-dashed border-zinc-200 dark:border-zinc-800 rounded-2xl">
                      No groups yet. Create one to get started!
                    </div>
                  ) : (
                    groups.map(group => (
                      <button
                        key={group.id}
                        onClick={() => {
                          onSelectGroup(group.id);
                          onClose();
                        }}
                        className="w-full flex items-center justify-between p-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl hover:border-emerald-500/50 hover:bg-emerald-50 dark:hover:bg-emerald-500/5 transition-all text-left group"
                      >
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 bg-zinc-50 dark:bg-zinc-800 rounded-xl flex items-center justify-center shrink-0 border border-zinc-100 dark:border-zinc-700">
                            {getGroupIcon(group.type)}
                          </div>
                          <div>
                            <p className="font-bold text-zinc-900 dark:text-white group-hover:text-emerald-700 dark:group-hover:text-emerald-400 transition-colors">{group.name}</p>
                            <p className="text-xs text-zinc-500 capitalize">{group.type} • {group.memberIds.length} Members</p>
                          </div>
                        </div>
                        <div className="text-xs font-bold text-zinc-400 bg-zinc-50 dark:bg-zinc-800 px-3 py-1.5 rounded-lg group-hover:bg-emerald-100 dark:group-hover:bg-emerald-500/20 group-hover:text-emerald-700 dark:group-hover:text-emerald-400 transition-colors">
                          View
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
