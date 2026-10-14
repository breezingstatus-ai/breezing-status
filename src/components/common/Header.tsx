import React from 'react';
import { ClipboardList, Settings } from 'lucide-react';
import { PWAInstallButton } from '../pwa/PWAInstallButton';
import { UserProfile } from '../../types';

interface HeaderProps {
  user: UserProfile | null;
  isAuthLoading: boolean;
  isAdmin: boolean;
  isAdminMode: boolean;
  onToggleAdminMode: () => void;
  onOpenRequests: () => void;
  onOpenSettings: () => void;
  onOpenAuth: () => void;
  pendingRequestsCount?: number;
}

export const Header: React.FC<HeaderProps> = ({ user, isAuthLoading, isAdmin, isAdminMode, onToggleAdminMode, onOpenRequests, onOpenSettings, onOpenAuth, pendingRequestsCount = 0 }) => (
  <header className="site-header">
    <div className="header-inner">
      <a href="/" className="brand" aria-label="Breezing Status home">
        <span className="brand-mark">b<span>.</span></span>
        <span className="brand-copy"><strong>breezing<span>status</span></strong><small>{isAdminMode ? 'Operations workspace' : 'Your status. Beautifully prepared.'}</small></span>
        <span className="brand-hd">HD</span>
      </a>
      <nav className="header-actions" aria-label="Account navigation">
        <span className="header-install"><PWAInstallButton /></span>
        {isAdmin && <button onClick={onToggleAdminMode} className="header-mode">{isAdminMode ? 'Customer view' : 'Admin'}</button>}
        <button onClick={onOpenRequests} className="header-requests" aria-label="My Requests" title="My Requests">
          <ClipboardList size={18} strokeWidth={1.6} /><span>Requests</span>
          {pendingRequestsCount > 0 && <span className="request-dot" />}
        </button>
        {user ? (
          <button onClick={onOpenSettings} className="profile-button" aria-label="Open Settings" title={`Account: ${user.full_name}`}>
            {user.avatar_url ? <img src={user.avatar_url} alt="" /> : <span className="profile-initial">{user.full_name?.charAt(0).toUpperCase() || 'B'}</span>}
            <span className="profile-name">{user.full_name?.split(' ')[0] || 'Account'}</span>
            <Settings size={16} strokeWidth={1.6} />
          </button>
        ) : isAuthLoading ? <span className="account-skeleton" role="status" aria-label="Restoring account" /> : (
          <button onClick={onOpenAuth} className="header-signin">Sign in</button>
        )}
      </nav>
    </div>
  </header>
);
