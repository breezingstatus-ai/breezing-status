import React from 'react';
import { Shield, Clock, Settings, User } from 'lucide-react';
import { StatusHDIcon } from './CustomIcons';
import { PWAInstallButton } from '../pwa/PWAInstallButton';
import { UserProfile } from '../../types';

interface HeaderProps {
  user: UserProfile | null;
  isAdmin: boolean;
  isAdminMode: boolean;
  onToggleAdminMode: () => void;
  onOpenRequests: () => void;
  onOpenSettings: () => void;
  onOpenAuth: () => void;
  pendingRequestsCount?: number;
}

export const Header: React.FC<HeaderProps> = ({
  user,
  isAdmin,
  isAdminMode,
  onToggleAdminMode,
  onOpenRequests,
  onOpenSettings,
  onOpenAuth,
  pendingRequestsCount = 0,
}) => {
  return (
    <header className="sticky top-0 z-40 w-full backdrop-blur-md bg-[#FAF9F5]/90 dark:bg-[#101713]/90 border-b border-[#E5E9E4] dark:border-[#2C3E32] transition-colors">
      <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
        {/* Left: Breezing Status HD logo + App Name */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#173B2A] dark:bg-[#58C994] flex items-center justify-center text-white dark:text-[#101713] shadow-xs font-bold tracking-tight">
            <span className="text-sm">HD</span>
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-sm tracking-tight text-[#19241E] dark:text-[#F2F6F2]">
                breezing status HD
              </span>
              <StatusHDIcon className="w-3.5 h-3.5 text-[#21A36B]" />
            </div>
            <span className="text-[10px] text-[#748078] dark:text-[#A7B8AC] -mt-0.5 font-medium">
              WhatsApp Status Master
            </span>
          </div>
        </div>

        {/* Right Navigation: My Requests Icon + Profile / Settings Icon */}
        <div className="flex items-center gap-2">
          {/* PWA Install Button when supported */}
          <PWAInstallButton />

          {/* Admin Switch (STRICT: ONLY visible if authenticated user has verified server-side admin role) */}
          {isAdmin && (
            <button
              onClick={onToggleAdminMode}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                isAdminMode
                  ? 'bg-[#173B2A] dark:bg-[#58C994] text-white dark:text-[#101713] shadow-xs'
                  : 'border border-[#CBD5CD] dark:border-[#3E5244] text-[#173B2A] dark:text-[#58C994] hover:bg-[#F1F5F1] dark:hover:bg-[#25332A]'
              }`}
              title={isAdminMode ? 'Return to Customer View' : 'Open Admin Portal'}
            >
              <Shield className="w-3.5 h-3.5" />
              <span>{isAdminMode ? 'Customer Preview' : 'Admin'}</span>
            </button>
          )}

          {/* 1. My Requests Icon Button */}
          <button
            onClick={onOpenRequests}
            className="relative p-2.5 rounded-xl text-[#748078] dark:text-[#A7B8AC] hover:text-[#19241E] dark:hover:text-[#F2F6F2] hover:bg-[#F1F5F1] dark:hover:bg-[#25332A] transition-colors"
            title="My Requests"
            aria-label="My Requests"
          >
            <Clock className="w-4 h-4" />
            {pendingRequestsCount > 0 && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[#21A36B] ring-2 ring-white dark:ring-[#101713]" />
            )}
          </button>

          {/* 2. Profile / Avatar / Settings Icon Button */}
          {user ? (
            <button
              onClick={onOpenSettings}
              className="flex items-center gap-2 pl-1.5 pr-2.5 py-1.5 rounded-xl border border-[#E5E9E4] dark:border-[#2C3E32] hover:bg-[#F1F5F1] dark:hover:bg-[#25332A] transition-colors group"
              title="Settings & Profile"
              aria-label="Open Settings"
            >
              {user.avatar_url ? (
                <img
                  src={user.avatar_url}
                  alt={user.full_name}
                  className="w-6 h-6 rounded-lg object-cover border border-[#21A36B]/40"
                />
              ) : (
                <div className="w-6 h-6 rounded-lg bg-[#21A36B]/15 text-[#21A36B] flex items-center justify-center font-bold text-xs">
                  {user.full_name?.charAt(0).toUpperCase() || 'U'}
                </div>
              )}
              <Settings className="w-3.5 h-3.5 text-[#748078] dark:text-[#A7B8AC] group-hover:text-[#19241E] dark:group-hover:text-[#F2F6F2] transition-colors" />
            </button>
          ) : (
            <button
              onClick={onOpenAuth}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#173B2A] dark:bg-[#58C994] text-white dark:text-[#101713] text-xs font-semibold shadow-xs hover:opacity-95 transition-all"
            >
              <User className="w-3.5 h-3.5" />
              <span>Sign In</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
