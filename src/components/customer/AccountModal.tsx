import React, { useState, useRef } from 'react';
import { 
  X, 
  User, 
  Phone, 
  Mail, 
  Award, 
  Clock, 
  Sparkles, 
  LogOut, 
  Edit2, 
  Check, 
  Moon, 
  Sun, 
  ArrowRight, 
  Eye, 
  Camera, 
  Loader2,
  Trash2,
  AlertTriangle
} from 'lucide-react';
import { UserProfile, SubscriptionPackage, UsageQuota, UploadRequest, AppSettings } from '../../types';
import { signOut, saveUserProfile, uploadProfileAvatar, deleteCustomerAccount } from '../../lib/supabase';
import { normalizePhoneNumber, validatePhoneNumber, SUPPORTED_COUNTRIES } from '../../lib/phone';

interface AccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: UserProfile;
  currentPackage: SubscriptionPackage;
  quota: UsageQuota;
  recentRequests: UploadRequest[];
  onOpenUpgrade: () => void;
  onUserUpdated: (user: UserProfile | null) => void;
  onSelectRequestForStatus: (req: UploadRequest) => void;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  appSettings?: AppSettings;
}

export const AccountModal: React.FC<AccountModalProps> = ({
  isOpen,
  onClose,
  user,
  currentPackage,
  quota,
  recentRequests,
  onOpenUpgrade,
  onUserUpdated,
  onSelectRequestForStatus,
  theme,
  onToggleTheme,
  appSettings,
}) => {
  const [isEditingPhone, setIsEditingPhone] = useState(false);
  const [countryCode, setCountryCode] = useState(user.country_code || '+265');
  const [localPhone, setLocalPhone] = useState(
    user.whatsapp_number.replace(user.country_code || '+265', '')
  );
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleSavePhone = async () => {
    setPhoneError(null);
    const normalized = normalizePhoneNumber(countryCode, localPhone);
    const valid = validatePhoneNumber(normalized);
    if (!valid.isValid) {
      setPhoneError(valid.error || 'Invalid phone number');
      return;
    }

    const updated = {
      ...user,
      whatsapp_number: normalized,
      country_code: countryCode,
    };
    await saveUserProfile(updated);
    onUserUpdated(updated);
    setIsEditingPhone(false);
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      alert('Please choose an image file (JPEG, PNG, WebP).');
      return;
    }
    try {
      setIsUploadingPhoto(true);
      const avatarUrl = await uploadProfileAvatar(file, user.id);
      const updated = { ...user, avatar_url: avatarUrl };
      await saveUserProfile(updated);
      onUserUpdated(updated);
    } catch (err) {
      console.error(err);
      alert('Failed to process profile photo.');
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  const handleLogout = async () => {
    await signOut();
    onUserUpdated(null);
    onClose();
  };

  // Quota computations
  const picsAllowed = currentPackage.monthly_pictures;
  const picsUsed = quota.pictures_used;
  const picsRemaining = Math.max(0, picsAllowed - picsUsed);

  const vidsAllowed = currentPackage.monthly_videos;
  const vidsUsed = quota.videos_used;
  const vidsRemaining = Math.max(0, vidsAllowed - vidsUsed);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
      <div className="w-full max-w-md rounded-2xl bg-white dark:bg-[#1A241E] p-6 shadow-2xl border border-[#E4EAE5] dark:border-[#334539] text-[#19241E] dark:text-[#F2F6F2] max-h-[90vh] overflow-y-auto space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[#E4EAE5] dark:border-[#334539]">
          <h2 className="text-base font-bold">Account & Settings</h2>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-[#748078] hover:bg-[#F1F5F1] dark:hover:bg-[#25332A] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 1. MY ACCOUNT */}
        <div className="space-y-2.5">
          <h3 className="text-xs font-bold uppercase tracking-wider text-[#748078] dark:text-[#A7B8AC]">
            My Account
          </h3>

          <div className="p-4 rounded-xl bg-[#F8F9F7] dark:bg-[#101713] border border-[#E4EAE5] dark:border-[#334539] space-y-3">
            <div className="flex items-center gap-3">
              {/* Profile Photo with Camera Trigger */}
              <div className="relative group shrink-0">
                {user.avatar_url ? (
                  <img
                    src={user.avatar_url}
                    alt={user.full_name}
                    className="w-12 h-12 rounded-2xl object-cover border-2 border-[#21A36B] shadow-sm"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-2xl bg-[#173B2A] dark:bg-[#58C994] text-white dark:text-[#101713] flex items-center justify-center font-bold text-base shadow-sm">
                    {user.full_name?.charAt(0) || 'U'}
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => avatarInputRef.current?.click()}
                  disabled={isUploadingPhoto}
                  className="absolute -bottom-1 -right-1 p-1 rounded-lg bg-[#21A36B] text-white shadow-md hover:bg-[#1b8858] transition-transform active:scale-90"
                  title="Upload profile photo"
                >
                  {isUploadingPhoto ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Camera className="w-3 h-3" />
                  )}
                </button>
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleAvatarChange}
                  className="hidden"
                />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <p className="font-bold text-xs truncate text-[#19241E] dark:text-[#F2F6F2]">
                    {user.full_name}
                  </p>
                  <button
                    type="button"
                    onClick={() => avatarInputRef.current?.click()}
                    disabled={isUploadingPhoto}
                    className="text-[10px] text-[#21A36B] hover:underline font-semibold"
                  >
                    Change Photo
                  </button>
                </div>
                <p className="text-[11px] text-[#748078] dark:text-[#A7B8AC] flex items-center gap-1 truncate mt-0.5">
                  <Mail className="w-3 h-3 shrink-0" />
                  <span className="truncate">{user.email}</span>
                </p>
              </div>
            </div>

            {/* WhatsApp Delivery Number with Edit */}
            <div className="pt-2 border-t border-[#E4EAE5] dark:border-[#334539] text-xs">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-[#748078] dark:text-[#A7B8AC] flex items-center gap-1">
                  <Phone className="w-3 h-3" />
                  <span>WhatsApp Delivery Number:</span>
                </span>
                {!isEditingPhone && (
                  <button
                    onClick={() => setIsEditingPhone(true)}
                    className="text-[11px] text-[#21A36B] hover:underline flex items-center gap-1 font-semibold"
                  >
                    <Edit2 className="w-3 h-3" />
                    <span>Edit</span>
                  </button>
                )}
              </div>

              {isEditingPhone ? (
                <div className="mt-2 space-y-2">
                  <div className="flex gap-1.5">
                    <select
                      value={countryCode}
                      onChange={(e) => setCountryCode(e.target.value)}
                      className="px-2 py-1.5 rounded-lg border border-[#E4EAE5] dark:border-[#334539] bg-white dark:bg-[#1A241E] text-xs"
                    >
                      {SUPPORTED_COUNTRIES.map((c) => (
                        <option key={c.code} value={c.code}>
                          {c.flag} {c.code}
                        </option>
                      ))}
                    </select>
                    <input
                      type="tel"
                      value={localPhone}
                      onChange={(e) => setLocalPhone(e.target.value)}
                      className="flex-1 px-2.5 py-1.5 rounded-lg border border-[#E4EAE5] dark:border-[#334539] bg-white dark:bg-[#1A241E] text-xs outline-none"
                    />
                    <button
                      onClick={handleSavePhone}
                      className="p-2 rounded-lg bg-[#21A36B] text-white hover:bg-[#1b8858]"
                    >
                      <Check className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  {phoneError && <p className="text-[10px] text-red-500">{phoneError}</p>}
                </div>
              ) : (
                <p className="font-semibold text-xs text-[#173B2A] dark:text-[#58C994] mt-0.5">
                  {user.whatsapp_number}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* 2. MY PACKAGE */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#748078] dark:text-[#A7B8AC]">
              My Package
            </h3>
            <button
              onClick={() => {
                onClose();
                onOpenUpgrade();
              }}
              className="text-xs font-semibold text-[#21A36B] hover:underline flex items-center gap-1"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Upgrade Plan</span>
            </button>
          </div>

          <div className="p-4 rounded-xl border border-[#E4EAE5] dark:border-[#334539] bg-white dark:bg-[#1A241E] space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-bold text-xs text-[#19241E] dark:text-[#F2F6F2]">
                {currentPackage.name} Plan
              </span>
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-[#21A36B]/15 text-[#21A36B]">
                Active
              </span>
            </div>

            {/* Pictures quota */}
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-[#748078] dark:text-[#A7B8AC]">Pictures</span>
                <span className="font-semibold">{picsRemaining} remaining this month</span>
              </div>
              <div className="w-full h-1.5 rounded-full bg-[#F1F5F1] dark:bg-[#25332A] overflow-hidden">
                <div
                  className="h-full bg-[#21A36B] rounded-full"
                  style={{ width: `${Math.min(100, (picsUsed / (picsAllowed || 1)) * 100)}%` }}
                />
              </div>
            </div>

            {/* Videos quota */}
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-[#748078] dark:text-[#A7B8AC]">Videos</span>
                <span className="font-semibold">{vidsRemaining} remaining</span>
              </div>
              <div className="w-full h-1.5 rounded-full bg-[#F1F5F1] dark:bg-[#25332A] overflow-hidden">
                <div
                  className="h-full bg-[#58C994] rounded-full"
                  style={{ width: `${Math.min(100, (vidsUsed / (vidsAllowed || 1)) * 100)}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* 3. MY REQUESTS (Simplified, no request codes or internal stages) */}
        <div className="space-y-2.5">
          <h3 className="text-xs font-bold uppercase tracking-wider text-[#748078] dark:text-[#A7B8AC]">
            My Requests
          </h3>

          {recentRequests.length === 0 ? (
            <p className="text-xs text-[#748078] dark:text-[#A7B8AC] italic py-2">
              No recent requests yet.
            </p>
          ) : (
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {recentRequests.map((req) => {
                const isSent = req.status === 'sent';

                return (
                  <div
                    key={req.id}
                    className="p-3 rounded-xl border border-[#E4EAE5] dark:border-[#334539] bg-[#F8F9F7] dark:bg-[#101713] flex items-center justify-between text-xs"
                  >
                    <div>
                      <p className="font-semibold text-[#19241E] dark:text-[#F2F6F2]">
                        {req.media_count} {req.media_type === 'image' ? 'Pictures' : 'Videos'}
                      </p>
                      <p className="text-[10px] text-[#748078] dark:text-[#A7B8AC]">
                        {new Date(req.created_at).toLocaleDateString([], {
                          month: 'short',
                          day: 'numeric',
                        })}{' '}
                        at{' '}
                        {new Date(req.created_at).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <span
                        className={`text-[11px] font-bold px-2 py-0.5 rounded-md ${
                          isSent
                            ? 'bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300'
                            : 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300'
                        }`}
                      >
                        {isSent ? 'Sent' : 'Processing — Awaiting Delivery'}
                      </span>

                      <button
                        onClick={() => {
                          onClose();
                          onSelectRequestForStatus(req);
                        }}
                        className="p-1 rounded-lg text-[#21A36B] hover:bg-[#21A36B]/10"
                        title="View Status"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 4. SETTINGS & APPEARANCE */}
        <div className="space-y-2.5 pt-2 border-t border-[#E4EAE5] dark:border-[#334539]">
          <h3 className="text-xs font-bold uppercase tracking-wider text-[#748078] dark:text-[#A7B8AC]">
            Appearance
          </h3>

          <div className="flex items-center justify-between p-3 rounded-xl border border-[#E4EAE5] dark:border-[#334539] bg-white dark:bg-[#1A241E] text-xs">
            <span className="font-medium text-[#19241E] dark:text-[#F2F6F2]">
              Theme: {theme === 'dark' ? 'Dark Mode' : 'Light Mode'}
            </span>
            <button
              onClick={onToggleTheme}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#E4EAE5] dark:border-[#334539] text-xs font-semibold hover:bg-slate-50 dark:hover:bg-[#25332A] transition-colors"
            >
              {theme === 'dark' ? <Sun className="w-3.5 h-3.5 text-amber-400" /> : <Moon className="w-3.5 h-3.5" />}
              <span>Switch to {theme === 'dark' ? 'Light' : 'Dark'}</span>
            </button>
          </div>
        </div>

        {/* 5. HELP & WHATSAPP SUPPORT */}
        <div className="space-y-2.5 pt-2 border-t border-[#E4EAE5] dark:border-[#334539]">
          <h3 className="text-xs font-bold uppercase tracking-wider text-[#748078] dark:text-[#A7B8AC]">
            Help & Official Contact
          </h3>

          <a
            href="https://wa.me/265993741274?text=Hello%20Breezing%20Status%20HD%20Support"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between p-3 rounded-xl border border-[#E4EAE5] dark:border-[#334539] bg-white dark:bg-[#1A241E] hover:bg-[#F1F5F1] dark:hover:bg-[#25332A] text-xs transition-colors"
          >
            <div className="flex items-center gap-2">
              <span className="font-semibold text-[#19241E] dark:text-[#F2F6F2]">Support Chat (WhatsApp)</span>
              <span className="text-[11px] text-[#748078] dark:text-[#A7B8AC] font-mono">0993741274 (+265 99 374 1274)</span>
            </div>
            <ArrowRight className="w-3.5 h-3.5 text-[#21A36B]" />
          </a>
        </div>

        {/* 6. DANGER ZONE: DELETE ACCOUNT (Strictly for authenticated customer) */}
        <div className="space-y-2.5 pt-2 border-t border-red-100 dark:border-red-950/40">
          <h3 className="text-xs font-bold uppercase tracking-wider text-red-600 dark:text-red-400">
            Account Management
          </h3>

          {isConfirmingDelete ? (
            <div className="p-3.5 rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/20 space-y-2.5 text-xs">
              <div className="flex items-start gap-2 text-red-700 dark:text-red-300">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold">Permanently delete your account?</p>
                  <p className="text-[11px] text-red-600 dark:text-red-400 mt-0.5 leading-relaxed">
                    This will permanently delete your profile ({user.email}), all upload history, and monthly quotas. This action cannot be reversed.
                  </p>
                </div>
              </div>

              {deleteError && (
                <p className="text-[11px] text-red-600 dark:text-red-400 font-semibold">
                  {deleteError}
                </p>
              )}

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={async () => {
                    try {
                      setIsDeleting(true);
                      setDeleteError(null);
                      await deleteCustomerAccount(user.id);
                      onUserUpdated(null);
                      onClose();
                    } catch (err: any) {
                      setDeleteError(err.message || 'Failed to delete account');
                      setIsDeleting(false);
                    }
                  }}
                  className="flex-1 py-2 px-3 rounded-lg bg-red-600 hover:bg-red-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
                >
                  {isDeleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                  <span>{isDeleting ? 'Deleting...' : 'Yes, Delete My Account'}</span>
                </button>

                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={() => {
                    setIsConfirmingDelete(false);
                    setDeleteError(null);
                  }}
                  className="py-2 px-3 rounded-lg border border-[#E4EAE5] dark:border-[#334539] bg-white dark:bg-[#1A241E] text-xs font-semibold hover:bg-slate-50 dark:hover:bg-[#25332A] transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between p-3 rounded-xl border border-red-100 dark:border-red-950/40 bg-red-50/40 dark:bg-red-950/10 text-xs">
              <div>
                <span className="font-semibold text-red-700 dark:text-red-400 block">
                  Delete Account
                </span>
                <span className="text-[11px] text-[#748078] dark:text-[#A7B8AC]">
                  Permanently erase your account and all associated data.
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsConfirmingDelete(true)}
                className="px-3 py-1.5 rounded-lg border border-red-200 dark:border-red-900/60 text-red-600 dark:text-red-400 hover:bg-red-600 hover:text-white text-xs font-semibold transition-colors flex items-center gap-1"
              >
                <Trash2 className="w-3 h-3" />
                <span>Delete</span>
              </button>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="pt-2 border-t border-[#E4EAE5] dark:border-[#334539] flex items-center justify-between">
          <button
            onClick={handleLogout}
            className="text-xs text-red-500 hover:text-red-600 flex items-center gap-1.5 font-medium"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>

          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-[#F1F5F1] dark:bg-[#25332A] text-xs font-semibold text-[#19241E] dark:text-[#F2F6F2] hover:opacity-90"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
