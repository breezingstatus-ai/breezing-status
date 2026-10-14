import React, { useState, useEffect } from 'react';
import { X, Check, ShieldCheck, ArrowRight, Clock } from 'lucide-react';
import { SubscriptionPackage, UserProfile, PaymentRequest } from '../../types';
import { submitPayment } from '../../lib/supabase';
import { ErrorBoundary } from '../common/ErrorBoundary';

const FALLBACK_PACKAGES: SubscriptionPackage[] = [
  {
    id: 'free',
    name: 'Free',
    price: 0,
    currency: 'MWK',
    duration_days: 30,
    monthly_pictures: 30,
    monthly_videos: 2,
    max_video_size_mb: 20,
    watermark_required: true,
    description: 'Starter plan for personal WhatsApp status.',
    is_active: true,
  },
  {
    id: 'premium',
    name: 'Premium',
    price: 3500,
    currency: 'MWK',
    duration_days: 30,
    monthly_pictures: 100,
    monthly_videos: 10,
    max_video_size_mb: 20,
    watermark_required: false,
    description: 'Crystal-clear HD media without watermark.',
    is_active: true,
  },
  {
    id: 'business',
    name: 'Business Pro',
    price: 8000,
    currency: 'MWK',
    duration_days: 30,
    monthly_pictures: 300,
    monthly_videos: 35,
    max_video_size_mb: 35,
    watermark_required: false,
    description: 'For brands and creators.',
    is_active: true,
  },
];

interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  packages: SubscriptionPackage[];
  user: UserProfile | null;
  onPaymentSubmitted: (payment: PaymentRequest) => void;
  onOpenAuth?: () => void;
}

const UpgradeModalContent: React.FC<UpgradeModalProps> = ({
  isOpen,
  onClose,
  packages,
  user,
  onPaymentSubmitted,
}) => {
  // Ensure safePackages is always an array of valid SubscriptionPackage objects
  const safePackages: SubscriptionPackage[] = React.useMemo(() => {
    if (Array.isArray(packages) && packages.length > 0) {
      const valid = packages.filter(
        (p): p is SubscriptionPackage =>
          Boolean(p && typeof p === 'object' && typeof p.id === 'string' && p.id.trim().length > 0)
      );
      if (valid.length > 0) return valid;
    }
    return FALLBACK_PACKAGES;
  }, [packages]);

  const defaultPkg: SubscriptionPackage = React.useMemo(() => {
    return (
      safePackages.find((p) => p && p.id === 'premium') ||
      safePackages[0] ||
      FALLBACK_PACKAGES[0]
    );
  }, [safePackages]);

  const [selectedPkg, setSelectedPkg] = useState<SubscriptionPackage>(defaultPkg);

  const [paymentMethod, setPaymentMethod] = useState<
    'Airtel Money' | 'TNM Mpamba' | 'Bank Transfer'
  >('Airtel Money');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittedSuccess, setSubmittedSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync selected package if packages change or when modal opens
  useEffect(() => {
    setSelectedPkg((prev) => {
      if (prev && typeof prev === 'object' && prev.id && safePackages.some((p) => p && p.id === prev.id)) {
        return prev;
      }
      return defaultPkg;
    });
  }, [safePackages, defaultPkg, isOpen]);

  if (!isOpen) return null;

  const activePkg: SubscriptionPackage =
    (selectedPkg && typeof selectedPkg === 'object' && selectedPkg.id
      ? safePackages.find((p) => p && p.id === selectedPkg.id) || selectedPkg
      : null) || defaultPkg;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!user || !user.id) {
      setError('Please sign in with Google before submitting payment.');
      return;
    }

    if (!referenceNumber.trim()) {
      setError('Please provide the transaction reference number or SMS code.');
      return;
    }

    setIsSubmitting(true);
    try {
      const payment = await submitPayment({
        user_id: user.id,
        package_id: activePkg?.id || 'premium',
        package_name: activePkg?.name || 'Premium',
        amount: typeof activePkg?.price === 'number' ? activePkg.price : 0,
        currency: activePkg?.currency || 'MWK',
        payment_method: paymentMethod,
        reference_number: referenceNumber.trim(),
        notes: notes.trim() || undefined,
        customer_name: user.full_name || 'Customer',
      });

      setSubmittedSuccess(true);
      onPaymentSubmitted(payment);
    } catch (err: any) {
      setError(err.message || 'Payment submission failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
      <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-[#1A241E] p-6 shadow-2xl border border-[#E4EAE5] dark:border-[#334539] text-[#19241E] dark:text-[#F2F6F2] max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-3 border-b border-[#E4EAE5] dark:border-[#334539]">
          <h2 className="text-base font-bold">Upgrade Status Package</h2>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-[#748078] hover:bg-[#F1F5F1] dark:hover:bg-[#25332A]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {submittedSuccess ? (
          <div className="mt-6 text-center py-4 space-y-3">
            <div className="w-12 h-12 rounded-full bg-[#21A36B]/15 text-[#21A36B] mx-auto flex items-center justify-center">
              <Check className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-[#19241E] dark:text-[#F2F6F2]">
              Payment Reference Submitted!
            </h3>
            <p className="text-xs text-[#748078] dark:text-[#A7B8AC] max-w-xs mx-auto leading-relaxed">
              Our administrator will verify reference{' '}
              <strong>{referenceNumber}</strong>. Once approved, your{' '}
              <strong>{activePkg?.name}</strong> package and watermark removal will
              activate immediately.
            </p>
            <div className="p-3 bg-[#F1F5F1] dark:bg-[#25332A] rounded-xl text-xs text-[#173B2A] dark:text-[#58C994] font-medium flex items-center justify-center gap-2">
              <Clock className="w-4 h-4" />
              <span>Status: Pending Administrator Approval</span>
            </div>
            <button
              onClick={onClose}
              className="mt-4 w-full py-2.5 rounded-xl bg-[#173B2A] dark:bg-[#58C994] text-white dark:text-[#101713] text-xs font-semibold hover:opacity-95"
            >
              Back to Home
            </button>
          </div>
        ) : (
          <div className="mt-4 space-y-5">
            {/* Package selector */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {safePackages.map((pkg) => {
                if (!pkg || !pkg.id) return null;
                const isSelected = Boolean(activePkg && activePkg.id && activePkg.id === pkg.id);
                const isCurrent = Boolean(user && user.package_id && user.package_id === pkg.id);

                return (
                  <button
                    key={pkg.id}
                    type="button"
                    onClick={() => setSelectedPkg(pkg)}
                    className={`p-3 rounded-xl border text-left transition-all relative ${
                      isSelected
                        ? 'border-[#21A36B] bg-[#F1F5F1]/80 dark:bg-[#25332A] shadow-sm'
                        : 'border-[#E4EAE5] dark:border-[#334539] hover:bg-slate-50 dark:hover:bg-[#1f2c24]'
                    }`}
                  >
                    {isCurrent && (
                      <span className="text-[9px] font-bold uppercase tracking-wider text-[#21A36B] block mb-1">
                        Current
                      </span>
                    )}
                    <p className="font-bold text-xs text-[#19241E] dark:text-[#F2F6F2]">
                      {pkg.name || 'Package'}
                    </p>
                    <p className="text-sm font-extrabold text-[#173B2A] dark:text-[#58C994] mt-1">
                      {pkg.price === 0
                        ? 'Free'
                        : `${(pkg.price ?? 0).toLocaleString()} ${pkg.currency || 'MWK'}`}
                    </p>
                    <ul className="mt-2 space-y-1 text-[11px] text-[#748078] dark:text-[#A7B8AC]">
                      <li>• {pkg.monthly_pictures ?? 30} pictures/mo</li>
                      <li>• {pkg.monthly_videos ?? 2} videos/mo</li>
                      <li
                        className={
                          pkg.watermark_required
                            ? ''
                            : 'text-[#21A36B] font-medium'
                        }
                      >
                        •{' '}
                        {pkg.watermark_required
                          ? 'With watermark'
                          : 'No watermark'}
                      </li>
                    </ul>
                  </button>
                );
              })}
            </div>

            {activePkg && typeof activePkg.price === 'number' && activePkg.price > 0 && (
              <form
                onSubmit={handleSubmit}
                className="space-y-4 pt-2 border-t border-[#E4EAE5] dark:border-[#334539]"
              >
                <div className="bg-[#F1F5F1] dark:bg-[#25332A] p-3.5 rounded-xl space-y-2 text-xs">
                  <p className="font-semibold text-[#173B2A] dark:text-[#58C994] flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4" />
                    <span>Payment Instructions</span>
                  </p>
                  <p className="text-[#748078] dark:text-[#A7B8AC] leading-relaxed">
                    Send{' '}
                    <strong>
                      {(activePkg.price ?? 0).toLocaleString()} {activePkg.currency || 'MWK'}
                    </strong>{' '}
                    using one of our official business accounts:
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-2 pt-2 border-t border-black/5 dark:border-white/5 font-mono text-[11px]">
                    <div className="bg-white dark:bg-[#1A241E] p-2 rounded-lg">
                      <span className="font-semibold text-red-600 block">
                        Airtel Money
                      </span>
                      <span className="font-bold text-xs">0993741274</span>
                      <span className="block text-[10px] text-gray-500">
                        Breezing Status (+265 99 374 1274)
                      </span>
                    </div>
                    <div className="bg-white dark:bg-[#1A241E] p-2 rounded-lg">
                      <span className="font-semibold text-emerald-600 block">
                        TNM Mpamba
                      </span>
                      <span>+265 88 123 4567</span>
                      <span className="block text-[10px] text-gray-500">
                        Breezing Status
                      </span>
                    </div>
                    <div className="bg-white dark:bg-[#1A241E] p-2 rounded-lg">
                      <span className="font-semibold text-blue-600 block">
                        National Bank
                      </span>
                      <span>Acc: 1009876543</span>
                      <span className="block text-[10px] text-gray-500">
                        Breezing Status
                      </span>
                    </div>
                  </div>
                </div>

                {error && (
                  <div className="p-2.5 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 text-xs">
                    {error}
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-[#19241E] dark:text-[#F2F6F2] mb-1">
                    Select Payment Method Used
                  </label>
                  <div className="flex gap-2">
                    {(
                      ['Airtel Money', 'TNM Mpamba', 'Bank Transfer'] as const
                    ).map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setPaymentMethod(m)}
                        className={`flex-1 py-2 px-2.5 rounded-xl text-xs font-medium border text-center transition-all ${
                          paymentMethod === m
                            ? 'bg-[#173B2A] dark:bg-[#58C994] text-white dark:text-[#101713] border-transparent font-semibold'
                            : 'border-[#E4EAE5] dark:border-[#334539] text-[#748078] dark:text-[#A7B8AC]'
                        }`}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#19241E] dark:text-[#F2F6F2] mb-1">
                    Transaction Reference / SMS Code
                  </label>
                  <input
                    type="text"
                    value={referenceNumber}
                    onChange={(e) => setReferenceNumber(e.target.value)}
                    placeholder="e.g. TXN-89312 or MPAMBA-4421"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#E4EAE5] dark:border-[#334539] bg-white dark:bg-[#101713] text-[#19241E] dark:text-[#F2F6F2] text-xs outline-none focus:ring-2 focus:ring-[#21A36B]/40"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#19241E] dark:text-[#F2F6F2] mb-1">
                    Sender Phone or Note (Optional)
                  </label>
                  <input
                    type="text"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="e.g. Paid from phone +265993741274"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#E4EAE5] dark:border-[#334539] bg-white dark:bg-[#101713] text-[#19241E] dark:text-[#F2F6F2] text-xs outline-none focus:ring-2 focus:ring-[#21A36B]/40"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-[#173B2A] dark:bg-[#58C994] text-white dark:text-[#101713] font-semibold text-xs shadow-sm hover:opacity-95 transition-all"
                >
                  {isSubmitting ? (
                    <span>Submitting Reference...</span>
                  ) : (
                    <>
                      <span>Submit Payment for Approval</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>
            )}

            {activePkg && activePkg.price === 0 && (
              <p className="text-center text-xs text-[#748078] dark:text-[#A7B8AC] py-3">
                Free plan is already active on your account.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export const UpgradeModal: React.FC<UpgradeModalProps> = (props) => {
  if (!props.isOpen) return null;
  return (
    <ErrorBoundary fallbackTitle="Could not load subscription packages">
      <UpgradeModalContent {...props} />
    </ErrorBoundary>
  );
};
