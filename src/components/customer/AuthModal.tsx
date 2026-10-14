import React, { useState, useEffect } from 'react';
import { X, ArrowRight, ShieldCheck, Check } from 'lucide-react';
import { UserProfile } from '../../types';
import { SUPPORTED_COUNTRIES, normalizePhoneNumber, validatePhoneNumber } from '../../lib/phone';
import { saveUserProfile, signInWithGoogle } from '../../lib/supabase';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (profile: UserProfile) => void;
  existingProfile?: UserProfile | null;
  mode?: 'login' | 'onboarding';
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  existingProfile,
  mode = 'login',
}) => {
  // If the user is logged in but missing a phone number, default directly to onboarding!
  const needsOnboarding = existingProfile && !existingProfile.whatsapp_number;
  const [currentStep, setCurrentStep] = useState<'login' | 'onboarding'>(
    mode === 'onboarding' || needsOnboarding ? 'onboarding' : 'login'
  );

  const [fullName, setFullName] = useState(existingProfile?.full_name || '');
  const [countryCode, setCountryCode] = useState(existingProfile?.country_code || '+265');
  const [localNumber, setLocalNumber] = useState(
    existingProfile?.whatsapp_number
      ? existingProfile.whatsapp_number.replace(existingProfile.country_code || '+265', '')
      : ''
  );
  const [consent, setConsent] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSigningIn, setIsSigningIn] = useState(false);

  useEffect(() => {
    if (existingProfile) {
      setFullName(existingProfile.full_name || '');
      if (!existingProfile.whatsapp_number) {
        setCurrentStep('onboarding');
      }
    }
  }, [existingProfile]);

  if (!isOpen) return null;

  const handleGoogleSignInClick = async () => {
    setError(null);
    setIsSigningIn(true);
    try {
      const res = await signInWithGoogle();
      if (res.error) {
        setError(res.error);
        setIsSigningIn(false);
        return;
      }

      if (res.user) {
        if (!res.user.whatsapp_number) {
          // Incomplete profile -> show One Last Step
          setFullName(res.user.full_name || 'Customer');
          setCurrentStep('onboarding');
          setIsSigningIn(false);
        } else {
          // Complete profile -> finish immediately
          onSuccess(res.user);
          onClose();
        }
      } else {
        // OAuth redirect was initiated or completed
        setIsSigningIn(false);
      }
    } catch (err: any) {
      setError(err.message || 'Google Sign-In failed.');
      setIsSigningIn(false);
    }
  };

  const handleSaveOnboarding = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!fullName.trim()) {
      setError('Please enter your full name.');
      return;
    }

    if (!localNumber.trim()) {
      setError('Please enter your WhatsApp phone number.');
      return;
    }

    const normalized = normalizePhoneNumber(countryCode, localNumber);
    const validation = validatePhoneNumber(normalized);
    if (!validation.isValid) {
      setError(validation.error || 'Please enter a valid international phone number.');
      return;
    }

    if (!consent) {
      setError('Please confirm consent to receive your prepared status media on WhatsApp.');
      return;
    }

    setIsSubmitting(true);
    try {
      const updatedProfile: UserProfile = {
        id: existingProfile?.id || `usr-${Date.now()}`,
        email: existingProfile?.email || 'customer@gmail.com',
        full_name: fullName.trim(),
        whatsapp_number: normalized,
        country_code: countryCode,
        whatsapp_consent: true,
        role: existingProfile?.role || 'customer',
        package_id: existingProfile?.package_id || 'free',
        status: 'active',
        created_at: existingProfile?.created_at || new Date().toISOString(),
      };

      await saveUserProfile(updatedProfile);
      onSuccess(updatedProfile);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save account details.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedCountry = SUPPORTED_COUNTRIES.find((c) => c.code === countryCode) || SUPPORTED_COUNTRIES[0];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
      <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-[#1A241E] p-6 shadow-2xl border border-[#E4EAE5] dark:border-[#334539] text-[#19241E] dark:text-[#F2F6F2]">
        <div className="flex items-center justify-between pb-3 border-b border-[#E4EAE5] dark:border-[#334539]">
          <h2 className="text-base font-bold">
            {currentStep === 'login' ? 'Sign In' : 'One Last Step'}
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-[#748078] hover:bg-[#F1F5F1] dark:hover:bg-[#25332A] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {error && (
          <div className="mt-3 p-2.5 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 text-xs">
            {error}
          </div>
        )}

        {currentStep === 'login' ? (
          <div className="mt-6 flex flex-col items-center text-center space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-[#173B2A] dark:bg-[#58C994] flex items-center justify-center text-white dark:text-[#101713] font-bold text-lg shadow-sm">
              HD
            </div>
            <div>
              <h3 className="font-bold text-base text-[#19241E] dark:text-[#F2F6F2]">
                Better Quality. Better Status.
              </h3>
              <p className="mt-1 text-xs text-[#748078] dark:text-[#A7B8AC] leading-relaxed">
                Sign in with Google to prepare your pictures and receive them directly on WhatsApp.
              </p>
            </div>

            <button
              onClick={handleGoogleSignInClick}
              disabled={isSigningIn}
              className="w-full flex items-center justify-center gap-3 px-4 py-3 rounded-xl border border-[#E4EAE5] dark:border-[#334539] bg-white dark:bg-[#25332A] hover:bg-[#F1F5F1] dark:hover:bg-[#334539] text-xs font-semibold shadow-sm transition-all active:scale-[0.98]"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
              <span>{isSigningIn ? 'Connecting...' : 'Continue with Google'}</span>
            </button>
          </div>
        ) : (
          <form onSubmit={handleSaveOnboarding} className="mt-4 space-y-4">
            <div>
              <p className="text-xs text-[#748078] dark:text-[#A7B8AC] mb-3">
                Where should we send your pictures?
              </p>

              <label className="block text-xs font-semibold text-[#19241E] dark:text-[#F2F6F2] mb-1">
                Full Name
              </label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="e.g. Grace Banda"
                className="w-full px-3.5 py-2.5 rounded-xl border border-[#E4EAE5] dark:border-[#334539] bg-white dark:bg-[#101713] text-[#19241E] dark:text-[#F2F6F2] text-xs outline-none focus:ring-2 focus:ring-[#21A36B]/40"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#19241E] dark:text-[#F2F6F2] mb-1">
                WhatsApp Number
              </label>
              <div className="flex gap-2">
                <select
                  value={countryCode}
                  onChange={(e) => setCountryCode(e.target.value)}
                  className="px-2 py-2.5 rounded-xl border border-[#E4EAE5] dark:border-[#334539] bg-white dark:bg-[#101713] text-[#19241E] dark:text-[#F2F6F2] text-xs outline-none cursor-pointer"
                >
                  {SUPPORTED_COUNTRIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.flag} {c.code}
                    </option>
                  ))}
                </select>
                <input
                  type="tel"
                  value={localNumber}
                  onChange={(e) => setLocalNumber(e.target.value)}
                  placeholder={`e.g. ${selectedCountry.example}`}
                  className="flex-1 px-3.5 py-2.5 rounded-xl border border-[#E4EAE5] dark:border-[#334539] bg-white dark:bg-[#101713] text-[#19241E] dark:text-[#F2F6F2] text-xs outline-none focus:ring-2 focus:ring-[#21A36B]/40"
                  required
                />
              </div>
            </div>

            <label className="flex items-start gap-2 pt-1 cursor-pointer">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                className="mt-0.5 rounded text-[#21A36B] focus:ring-[#21A36B]"
              />
              <span className="text-[11px] text-[#748078] dark:text-[#A7B8AC] leading-tight">
                I agree to receive my requested media on WhatsApp.
              </span>
            </label>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full mt-2 flex items-center justify-center gap-2 py-3 rounded-xl bg-[#173B2A] dark:bg-[#58C994] text-white dark:text-[#101713] font-semibold text-xs shadow-sm hover:opacity-95 transition-all"
            >
              {isSubmitting ? (
                <span>Saving Profile...</span>
              ) : (
                <>
                  <span>Continue</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
