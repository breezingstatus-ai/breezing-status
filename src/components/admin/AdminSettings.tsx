import {ServiceControls} from './ServiceControls';
import { PackageEditor } from './PackageEditor';
import { WatermarkPreview } from './WatermarkPreview';
import { useDialogs } from '../common/Dialogs';
import { supabase } from '../../lib/supabase';
import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  Sliders,
  Image as ImageIcon,
  Package,
  CreditCard,
  HardDrive,
  Check,
  RefreshCw,
  Upload,
  ShieldCheck,
  Clock,
  Phone,
  AlertCircle,
  Lock,
} from 'lucide-react';
import {
  WatermarkSettings,
  SubscriptionPackage,
  AppSettings,
  PaymentRequest,
} from '../../types';
import {
  getWatermarkSettings,
  updateWatermarkSettings,
  getPackages,
  updatePackage,
  getAppSettings,
  updateAppSettings,
  getPaymentRequests,
  approvePayment,
  rejectPayment,
  checkIsAdmin,
} from '../../lib/supabase';
import { SUPPORTED_COUNTRIES } from '../../lib/phone';

interface AdminSettingsProps {
  onBack: () => void;
}

export const AdminSettings: React.FC<AdminSettingsProps> = ({ onBack }) => {
  const { confirm, notify } = useDialogs();
  const [activeTab, setActiveTab] = useState<'official-contact' | 'watermark' | 'limits' | 'packages' | 'payments' | 'storage' | 'email' | 'service'>('official-contact');

  // Official WhatsApp Contact & App Settings
  const [appSettings, setAppSettings] = useState<AppSettings | null>(null);
  const [officialName, setOfficialName] = useState('Breezing Status HD');
  const [officialPhone, setOfficialPhone] = useState('+265 99 374 1274');
  const [officialCountryCode, setOfficialCountryCode] = useState('+265');
  const [contactSavedMsg, setContactSavedMsg] = useState(false);

  // Health & Test Email State
  const [isSendingTestEmail, setIsSendingTestEmail] = useState(false);
  const [testEmailResult, setTestEmailResult] = useState<{ success: boolean; message: string } | null>(null);

  // Watermark State
  const [watermark, setWatermark] = useState<WatermarkSettings | null>(null);
  const [wmSavedMsg, setWmSavedMsg] = useState(false);
  const [wmSaveError, setWmSaveError] = useState('');

  // Packages & Limits State
  const [packages, setPackages] = useState<SubscriptionPackage[]>([]);
  const [freePics, setFreePics] = useState(30);
  const [freeVids, setFreeVids] = useState(2);
  const [maxVidSize, setMaxVidSize] = useState(20);
  const [limitsSavedMsg, setLimitsSavedMsg] = useState(false);

  // Payments State
  const [payments, setPayments] = useState<PaymentRequest[]>([]);

  // Canvas ref for live interactive watermark preview

  const loadData = async () => {
    const wm = await getWatermarkSettings();
    setWatermark(wm);

    const pkgs = await getPackages();
    setPackages(pkgs);
    const freePkg = pkgs.find((p) => p.id === 'free');
    if (freePkg) {
      setFreePics(freePkg.monthly_pictures);
      setFreeVids(freePkg.monthly_videos);
      setMaxVidSize(freePkg.max_video_size_mb);
    }

    const appSet = await getAppSettings();
    setAppSettings(appSet);
    if (appSet) {
      setOfficialName(appSet.official_contact_name || 'Breezing Status HD');
      setOfficialPhone(appSet.official_whatsapp_number || '+265 99 374 1274');
      setOfficialCountryCode(appSet.official_country_code || '+265');
    }

    const payList = await checkIsAdmin() ? await getPaymentRequests() : [];
    setPayments(payList);
  };

  const handleSendTestEmail = async () => {
    setIsSendingTestEmail(true);
    setTestEmailResult(null);

    try {
      const {data: {session}} = await supabase!.auth.getSession();
      if (!session) throw new Error('Sign in again to test email.');
      const {data, error} = await supabase!.functions.invoke('test-admin-email', {headers: {Authorization: `Bearer ${session.access_token}`}});
      if (error) {
        const body = error.context instanceof Response ? await error.context.json().catch(()=>null) : null;
        throw new Error(body?.error || error.message);
      }
      if (!data?.success) throw new Error(data?.error || 'Resend did not accept the email.');
      setTestEmailResult({success: true, message: 'Resend accepted the test email for delivery.'});
    } catch (err: any) {
      setTestEmailResult({
        success: false,
        message: err.message || 'Failed to dispatch test notification.',
      });
    } finally {
      setIsSendingTestEmail(false);
    }
  };

  useEffect(() => {
    void loadData().catch(error=>notify(error instanceof Error?error.message:'Could not load settings'));
  }, []);

  const handleSaveContact = async () => {
    if (!appSettings) return;

    const updated: AppSettings = {
      ...appSettings,
      official_contact_name: officialName.trim() || 'Breezing Status HD',
      official_whatsapp_number: officialPhone.trim(),
      official_country_code: officialCountryCode,
    };

    try {
    await updateAppSettings(updated);
    setAppSettings(updated);
    setContactSavedMsg(true);
    setTimeout(() => setContactSavedMsg(false), 2500);
    } catch(error) { await notify(error instanceof Error?error.message:"Contact update failed"); }
  };

  const handleSaveWatermark = async () => {
    if (!watermark) return;
    setWmSaveError('');
    try {
      await updateWatermarkSettings(watermark);
      setWmSavedMsg(true);
      setTimeout(() => setWmSavedMsg(false), 2500);
    } catch (error) {
      setWmSaveError(error instanceof Error ? error.message : 'Could not save watermark settings.');
    }
  };

  const handleSaveFreeLimits = async () => {
    const freePkg = packages.find((p) => p.id === 'free');
    if (!freePkg) return;

    const updated: SubscriptionPackage = {
      ...freePkg,
      monthly_pictures: freePics,
      monthly_videos: freeVids,
      max_video_size_mb: maxVidSize,
    };

    try {
    await updatePackage(updated);
    await loadData();
    setLimitsSavedMsg(true);
    setTimeout(() => setLimitsSavedMsg(false), 2500);
    } catch(error) { await notify(error instanceof Error?error.message:"Could not save limits"); }
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !watermark) return;

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setWatermark({ ...watermark, logo_url: reader.result });
      }
    };
    reader.readAsDataURL(file);
  };

  const handleApprovePayment = async (id: string) => {
    if(!(await confirm('Approve this payment and activate the selected package?', 'Approve payment'))) return;
    try { await approvePayment(id); await loadData(); } catch(error) { await notify(error instanceof Error?error.message:'Payment update failed'); }
  };

  const handleRejectPayment = async (id: string) => {
    if(!(await confirm('Reject this payment request?', 'Reject payment'))) return;
    try { await rejectPayment(id, 'Invalid reference number provided'); await loadData(); } catch(error) { await notify(error instanceof Error?error.message:'Payment update failed'); }
  };

  return (
    <div className="w-full max-w-4xl mx-auto px-4 py-6 space-y-6 animate-fade-in">
      {/* Top Header */}
      <div className="flex items-center justify-between pb-3 border-b border-[#E4EAE5] dark:border-[#334539]">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 rounded-xl border border-[#E4EAE5] dark:border-[#334539] hover:bg-[#F1F5F1] dark:hover:bg-[#25332A] text-[#748078] dark:text-[#A7B8AC]"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-xl font-extrabold text-[#19241E] dark:text-[#F2F6F2]">
              Admin Settings
            </h1>
            <p className="text-xs text-[#748078] dark:text-[#A7B8AC]">
              Configure official WhatsApp contact, watermark rules, packages, and free limits.
            </p>
          </div>
        </div>
      </div>

      {/* Tabs Navigation (PART 1: Deployment guides removed!) */}
      <div className="flex items-center gap-1.5 p-1 rounded-2xl bg-[#F1F5F1] dark:bg-[#25332A] overflow-x-auto text-xs font-semibold">
        <button onClick={()=>setActiveTab('service')} className={`px-4 py-2 rounded-xl shrink-0 ${activeTab==='service'?'bg-white dark:bg-[#1A241E] shadow-sm':''}`}>Service availability</button>
        <button
          onClick={() => setActiveTab('official-contact')}
          className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl transition-all shrink-0 ${
            activeTab === 'official-contact'
              ? 'bg-white dark:bg-[#1A241E] text-[#173B2A] dark:text-[#58C994] shadow-sm'
              : 'text-[#748078] dark:text-[#A7B8AC] hover:text-[#19241E] dark:hover:text-[#F2F6F2]'
          }`}
        >
          <Phone className="w-3.5 h-3.5" />
          <span>Official Contact</span>
        </button>

        <button
          onClick={() => setActiveTab('watermark')}
          className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl transition-all shrink-0 ${
            activeTab === 'watermark'
              ? 'bg-white dark:bg-[#1A241E] text-[#173B2A] dark:text-[#58C994] shadow-sm'
              : 'text-[#748078] dark:text-[#A7B8AC] hover:text-[#19241E] dark:hover:text-[#F2F6F2]'
          }`}
        >
          <ImageIcon className="w-3.5 h-3.5" />
          <span>Watermark</span>
        </button>

        <button
          onClick={() => setActiveTab('limits')}
          className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl transition-all shrink-0 ${
            activeTab === 'limits'
              ? 'bg-white dark:bg-[#1A241E] text-[#173B2A] dark:text-[#58C994] shadow-sm'
              : 'text-[#748078] dark:text-[#A7B8AC] hover:text-[#19241E] dark:hover:text-[#F2F6F2]'
          }`}
        >
          <Sliders className="w-3.5 h-3.5" />
          <span>Free Limits</span>
        </button>

        <button
          onClick={() => setActiveTab('packages')}
          className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl transition-all shrink-0 ${
            activeTab === 'packages'
              ? 'bg-white dark:bg-[#1A241E] text-[#173B2A] dark:text-[#58C994] shadow-sm'
              : 'text-[#748078] dark:text-[#A7B8AC] hover:text-[#19241E] dark:hover:text-[#F2F6F2]'
          }`}
        >
          <Package className="w-3.5 h-3.5" />
          <span>Packages</span>
        </button>

        <button
          onClick={() => setActiveTab('payments')}
          className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl transition-all shrink-0 ${
            activeTab === 'payments'
              ? 'bg-white dark:bg-[#1A241E] text-[#173B2A] dark:text-[#58C994] shadow-sm'
              : 'text-[#748078] dark:text-[#A7B8AC] hover:text-[#19241E] dark:hover:text-[#F2F6F2]'
          }`}
        >
          <CreditCard className="w-3.5 h-3.5" />
          <span>Payments</span>
          {payments.filter((p) => p.status === 'pending').length > 0 && (
            <span className="w-2 h-2 rounded-full bg-amber-500" />
          )}
        </button>

        <button
          onClick={() => setActiveTab('storage')}
          className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl transition-all shrink-0 ${
            activeTab === 'storage'
              ? 'bg-white dark:bg-[#1A241E] text-[#173B2A] dark:text-[#58C994] shadow-sm'
              : 'text-[#748078] dark:text-[#A7B8AC] hover:text-[#19241E] dark:hover:text-[#F2F6F2]'
          }`}
        >
          <HardDrive className="w-3.5 h-3.5" />
          <span>24h Retention</span>
        </button>

        <button
          onClick={() => setActiveTab('email')}
          className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl transition-all shrink-0 ${
            activeTab === 'email'
              ? 'bg-white dark:bg-[#1A241E] text-[#173B2A] dark:text-[#58C994] shadow-sm'
              : 'text-[#748078] dark:text-[#A7B8AC] hover:text-[#19241E] dark:hover:text-[#F2F6F2]'
          }`}
        >
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>Resend Email</span>
        </button>
      </div>

      {activeTab==='service' && appSettings && <ServiceControls settings={appSettings} onSaved={setAppSettings}/>}
      {/* 1. Official WhatsApp Contact (PART 6) */}
      {activeTab === 'official-contact' && (
        <div className="p-6 rounded-2xl bg-white dark:bg-[#1A241E] border border-[#E4EAE5] dark:border-[#334539] space-y-5 shadow-sm max-w-lg text-xs">
          <div>
            <h3 className="font-bold text-sm text-[#19241E] dark:text-[#F2F6F2]">
              Official WhatsApp Contact Settings
            </h3>
            <p className="text-[#748078] dark:text-[#A7B8AC] mt-0.5 leading-relaxed">
              This number is displayed on the customer's success and status screens, and used in the Save Contact vCard export so customers save your business chat.
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block font-semibold text-[#19241E] dark:text-[#F2F6F2] mb-1">
                Official Business Display Name
              </label>
              <input
                type="text"
                value={officialName}
                onChange={(e) => setOfficialName(e.target.value)}
                placeholder="e.g. Breezing Status HD"
                className="w-full px-3.5 py-2.5 rounded-xl border border-[#E4EAE5] dark:border-[#334539] bg-white dark:bg-[#101713] text-[#19241E] dark:text-[#F2F6F2] outline-none"
              />
            </div>

            <div>
              <label className="block font-semibold text-[#19241E] dark:text-[#F2F6F2] mb-1">
                Official WhatsApp Phone Number
              </label>
              <div className="flex gap-2">
                <select
                  value={officialCountryCode}
                  onChange={(e) => setOfficialCountryCode(e.target.value)}
                  className="px-2 py-2.5 rounded-xl border border-[#E4EAE5] dark:border-[#334539] bg-white dark:bg-[#101713] text-[#19241E] dark:text-[#F2F6F2] text-xs outline-none"
                >
                  {SUPPORTED_COUNTRIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.flag} {c.code}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  value={officialPhone}
                  onChange={(e) => setOfficialPhone(e.target.value)}
                  placeholder="e.g. +265 99 123 4567"
                  className="flex-1 px-3.5 py-2.5 rounded-xl border border-[#E4EAE5] dark:border-[#334539] bg-white dark:bg-[#101713] text-[#19241E] dark:text-[#F2F6F2] outline-none"
                />
              </div>
              <p className="text-[11px] text-[#748078] dark:text-[#A7B8AC] mt-1">
                Must include country code (e.g. +265 for Malawi).
              </p>
            </div>

            <button
              onClick={handleSaveContact}
              className="w-full py-3 rounded-xl bg-[#173B2A] dark:bg-[#58C994] text-white dark:text-[#101713] font-bold text-xs shadow-sm hover:opacity-95 transition-all flex items-center justify-center gap-1.5"
            >
              <Check className="w-4 h-4" />
              <span>{contactSavedMsg ? 'Official Contact Saved Live!' : 'Save Official Contact'}</span>
            </button>
          </div>
        </div>
      )}

      {/* 2. Watermark Settings Tab */}
      {activeTab === 'watermark' && watermark && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Controls */}
          <div className="p-5 rounded-2xl bg-white dark:bg-[#1A241E] border border-[#E4EAE5] dark:border-[#334539] space-y-4 shadow-sm text-xs">
            <h3 className="font-bold text-sm text-[#19241E] dark:text-[#F2F6F2]">
              Watermark Placement & Appearance
            </h3>
            <p>Watermark on/off is controlled separately for each package in Packages. These settings control its appearance.</p>
            {wmSaveError && <p role="alert" className="text-red-600">{wmSaveError}</p>}

            <div>
              <label className="block font-semibold mb-1 text-[#19241E] dark:text-[#F2F6F2]">
                Watermark Logo PNG
              </label>
              <div className="flex items-center gap-3">
                <img
                  src={watermark.logo_url}
                  alt="Watermark logo"
                  className="w-16 h-8 object-contain bg-slate-100 dark:bg-slate-800 rounded-lg p-1 border border-[#E4EAE5] dark:border-[#334539]"
                />
                <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#E4EAE5] dark:border-[#334539] hover:bg-[#F1F5F1] dark:hover:bg-[#25332A] cursor-pointer font-medium">
                  <Upload className="w-3.5 h-3.5 text-[#21A36B]" />
                  <span>Replace PNG</span>
                  <input
                    type="file"
                    accept="image/png"
                    onChange={handleLogoUpload}
                    className="hidden"
                  />
                </label>
              </div>
            </div>

            <div>
              <label className="block font-semibold mb-1 text-[#19241E] dark:text-[#F2F6F2]">
                Watermark Position
              </label>
              <div className="grid grid-cols-3 gap-1.5">
                {(['bottom-right', 'bottom-left', 'top-right', 'top-left', 'center', 'custom'] as const).map(
                  (pos) => (
                    <button
                      key={pos}
                      type="button"
                      onClick={() => setWatermark({ ...watermark, position: pos })}
                      className={`py-2 px-2 rounded-xl text-center capitalize transition-all border ${
                        watermark.position === pos
                          ? 'bg-[#173B2A] dark:bg-[#58C994] text-white dark:text-[#101713] border-transparent font-bold'
                          : 'border-[#E4EAE5] dark:border-[#334539] text-[#748078] dark:text-[#A7B8AC]'
                      }`}
                    >
                      {pos.replace('-', ' ')}
                    </button>
                  )
                )}
              </div>
            </div>

            <div>
              <div className="flex justify-between mb-1">
                <span className="font-semibold text-[#19241E] dark:text-[#F2F6F2]">
                  Watermark Size (Relative)
                </span>
                <span className="text-[#748078] dark:text-[#A7B8AC]">
                  {Math.round(watermark.relative_size * 100)}%
                </span>
              </div>
              <input
                type="range"
                min="0.08"
                max="0.30"
                step="0.01"
                value={watermark.relative_size}
                onChange={(e) =>
                  setWatermark({ ...watermark, relative_size: parseFloat(e.target.value) })
                }
                className="w-full accent-[#21A36B]"
              />
            </div>

            <div>
              <div className="flex justify-between mb-1">
                <span className="font-semibold text-[#19241E] dark:text-[#F2F6F2]">
                  Watermark Opacity
                </span>
                <span className="text-[#748078] dark:text-[#A7B8AC]">
                  {Math.round(watermark.opacity * 100)}%
                </span>
              </div>
              <input
                type="range"
                min="0.2"
                max="1.0"
                step="0.05"
                value={watermark.opacity}
                onChange={(e) =>
                  setWatermark({ ...watermark, opacity: parseFloat(e.target.value) })
                }
                className="w-full accent-[#21A36B]"
              />
            </div>

            <div>
              <div className="flex justify-between mb-1">
                <span className="font-semibold text-[#19241E] dark:text-[#F2F6F2]">
                  Edge Padding
                </span>
                <span className="text-[#748078] dark:text-[#A7B8AC]">
                  {watermark.padding_pixels} px
                </span>
              </div>
              <input
                type="range"
                min="12"
                max="64"
                step="4"
                value={watermark.padding_pixels}
                onChange={(e) =>
                  setWatermark({ ...watermark, padding_pixels: parseInt(e.target.value) })
                }
                className="w-full accent-[#21A36B]"
              />
            </div>

            <button
              onClick={handleSaveWatermark}
              className="w-full py-3 rounded-xl bg-[#173B2A] dark:bg-[#58C994] text-white dark:text-[#101713] font-bold text-xs shadow-sm hover:opacity-95 transition-all flex items-center justify-center gap-1.5"
            >
              <Check className="w-4 h-4" />
              <span>{wmSavedMsg ? 'Watermark Settings Saved!' : 'Save Watermark Settings'}</span>
            </button>
          </div>

          {/* Live Preview Canvas */}
          <div className="p-5 rounded-2xl bg-white dark:bg-[#1A241E] border border-[#E4EAE5] dark:border-[#334539] space-y-3 shadow-sm flex flex-col items-center">
            <h3 className="font-bold text-sm text-[#19241E] dark:text-[#F2F6F2] self-start">
              Live Preview
            </h3>
            <p className="text-xs text-[#748078] dark:text-[#A7B8AC] self-start -mt-2">
              Updates in realtime. All newly submitted photos will apply this placement.
            </p>

            <WatermarkPreview settings={watermark} onChange={setWatermark} />
          </div>
        </div>
      )}

      {/* 3. Free Limits Tab */}
      {activeTab === 'limits' && (
        <div className="p-6 rounded-2xl bg-white dark:bg-[#1A241E] border border-[#E4EAE5] dark:border-[#334539] space-y-5 shadow-sm max-w-lg">
          <div>
            <h3 className="font-bold text-sm text-[#19241E] dark:text-[#F2F6F2]">
              Real-Time Free Usage Limits
            </h3>
            <p className="text-xs text-[#748078] dark:text-[#A7B8AC] mt-0.5">
              Adjusting allowances updates all free accounts immediately without requiring re-login.
            </p>
          </div>

          <div className="space-y-4 text-xs">
            <div>
              <label className="block font-semibold text-[#19241E] dark:text-[#F2F6F2] mb-1">
                Monthly Free Pictures Allowance
              </label>
              <input
                type="number"
                min="5"
                max="200"
                value={freePics}
                onChange={(e) => setFreePics(parseInt(e.target.value) || 0)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-[#E4EAE5] dark:border-[#334539] bg-white dark:bg-[#101713] text-[#19241E] dark:text-[#F2F6F2] outline-none"
              />
            </div>

            <div>
              <label className="block font-semibold text-[#19241E] dark:text-[#F2F6F2] mb-1">
                Monthly Free Videos Allowance
              </label>
              <input
                type="number"
                min="0"
                max="20"
                value={freeVids}
                onChange={(e) => setFreeVids(parseInt(e.target.value) || 0)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-[#E4EAE5] dark:border-[#334539] bg-white dark:bg-[#101713] text-[#19241E] dark:text-[#F2F6F2] outline-none"
              />
            </div>

            <div>
              <label className="block font-semibold text-[#19241E] dark:text-[#F2F6F2] mb-1">
                Maximum Video Size Limit (MB)
              </label>
              <input
                type="number"
                min="5"
                max="50"
                value={maxVidSize}
                onChange={(e) => setMaxVidSize(parseInt(e.target.value) || 0)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-[#E4EAE5] dark:border-[#334539] bg-white dark:bg-[#101713] text-[#19241E] dark:text-[#F2F6F2] outline-none"
              />
            </div>

            <button
              onClick={handleSaveFreeLimits}
              className="w-full py-3 rounded-xl bg-[#173B2A] dark:bg-[#58C994] text-white dark:text-[#101713] font-bold text-xs shadow-sm hover:opacity-95 transition-all flex items-center justify-center gap-1.5"
            >
              <Check className="w-4 h-4" />
              <span>{limitsSavedMsg ? 'Free Limits Updated Live!' : 'Save & Broadcast Limits'}</span>
            </button>
          </div>
        </div>
      )}

      {/* 4. Packages Tab */}
      {activeTab === 'packages' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {[...packages].sort((a,b)=>{const rank=(id:string)=>({free:0,premium:1,business:2}[id]??3);return rank(a.id)-rank(b.id);}).map(pkg => <PackageEditor key={pkg.id} pkg={pkg} onSaved={loadData} />)}
          </div>
        </div>
      )}

      {/* 5. Payments Tab */}
      {activeTab === 'payments' && (
        <div className="p-6 rounded-2xl bg-white dark:bg-[#1A241E] border border-[#E4EAE5] dark:border-[#334539] space-y-4 shadow-sm text-xs">
          <h3 className="font-bold text-sm text-[#19241E] dark:text-[#F2F6F2]">
            Manual Payment Approvals
          </h3>

          {payments.length === 0 ? (
            <p className="py-8 text-center italic text-[#748078] dark:text-[#A7B8AC]">
              No payment requests submitted yet.
            </p>
          ) : (
            <div className="space-y-3">
              {payments.map((pay) => (
                <div
                  key={pay.id}
                  className="p-3.5 rounded-xl border border-[#E4EAE5] dark:border-[#334539] bg-[#F8F9F7] dark:bg-[#101713] flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-[#19241E] dark:text-[#F2F6F2]">
                        {pay.package_name || 'Premium'} Upgrade
                      </span>
                      <span className="font-semibold text-emerald-600">
                        {pay.amount.toLocaleString()} {pay.currency}
                      </span>
                    </div>
                    <p className="text-[11px] text-[#748078] dark:text-[#A7B8AC] mt-0.5">
                      Method: <strong>{pay.payment_method}</strong> · Reference: <strong className="font-mono text-[#19241E] dark:text-[#F2F6F2]">{pay.reference_number}</strong>
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    {pay.status === 'pending' ? (
                      <>
                        <button
                          onClick={() => handleApprovePayment(pay.id)}
                          className="px-3 py-1.5 rounded-xl bg-[#21A36B] hover:bg-[#1b8858] text-white font-semibold"
                        >
                          Approve & Upgrade
                        </button>
                        <button
                          onClick={() => handleRejectPayment(pay.id)}
                          className="px-3 py-1.5 rounded-xl border border-red-200 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 font-semibold"
                        >
                          Reject
                        </button>
                      </>
                    ) : (
                      <span
                        className={`text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md ${
                          pay.status === 'approved'
                            ? 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400'
                            : 'bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-400'
                        }`}
                      >
                        {pay.status}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 6. 24h Storage Tab */}
      {activeTab === 'storage' && (
        <div className="p-6 rounded-2xl bg-white dark:bg-[#1A241E] border border-[#E4EAE5] dark:border-[#334539] space-y-4 shadow-sm max-w-lg text-xs">
          <h3 className="font-bold text-sm text-[#19241E] dark:text-[#F2F6F2] flex items-center gap-2">
            <Clock className="w-4 h-4 text-[#21A36B]" />
            <span>24-Hour Automatic Retention Policy</span>
          </h3>

          <p className="text-[#748078] dark:text-[#A7B8AC] leading-relaxed">
            All customer photos and videos are scheduled to automatically delete 24 hours after submission.
          </p>

          <div className="p-4 rounded-xl bg-[#F8F9F7] dark:bg-[#101713] border border-[#E4EAE5] dark:border-[#334539] space-y-2">
            <div className="flex justify-between">
              <span className="text-[#748078] dark:text-[#A7B8AC]">Default Retention Window:</span>
              <span className="font-bold text-[#19241E] dark:text-[#F2F6F2]">24 Hours</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#748078] dark:text-[#A7B8AC]">Cron Cleanup Frequency:</span>
              <span className="font-bold text-[#19241E] dark:text-[#F2F6F2]">Every 15 Minutes</span>
            </div>
          </div>

          <button
            onClick={() => void notify('Expired media cleanup runs on the server schedule. This button does not manually delete files.')}
            className="w-full py-3 rounded-xl bg-[#173B2A] dark:bg-[#58C994] text-white dark:text-[#101713] font-bold text-xs shadow-sm hover:opacity-95"
          >
            Run 24h Purge Routine Now
          </button>
        </div>
      )}

      {activeTab === 'email' && <section className="p-6 border rounded-2xl bg-white dark:bg-[#1A241E] space-y-4 max-w-xl">
        <h3 className="font-bold">Resend Email Service</h3>
        <p className="text-sm">Send a test notification to the configured administrator email address.</p>
        <button onClick={handleSendTestEmail} disabled={isSendingTestEmail} className="rounded-xl bg-[#173B2A] text-white p-3">{isSendingTestEmail?'Sending…':'Send test email'}</button>
        {testEmailResult && <p role="status" className={testEmailResult.success?'text-green-700':'text-red-600'}>{testEmailResult.message}</p>}
      </section>}

    </div>
  );
};
