/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react';
import { 
  Shield, 
  ArrowLeft, 
  Clock, 
  CheckCircle2, 
  AlertCircle 
} from 'lucide-react';
import { 
  UserProfile, 
  SubscriptionPackage, 
  UsageQuota, 
  WatermarkSettings, 
  AppSettings, 
  UploadRequest, 
  PaymentRequest 
} from './types';
import {
  getCurrentUser,
  getCachedUser,
  getPackages,
  getWatermarkSettings,
  getAppSettings,
  getUserQuota,
  getUploadRequests,
  subscribeToStateUpdates,
  checkIsAdmin,
  isSupabaseConfigured,
  supabase,
} from './lib/supabase';
import { Header } from './components/common/Header';
import { Footer } from './components/common/Footer';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { UploadSection } from './components/customer/UploadSection';
import { AuthModal } from './components/customer/AuthModal';
import {AdminAccountModal} from './components/admin/AdminAccountModal';
import { AccountModal } from './components/customer/AccountModal';
import { UpgradeModal } from './components/customer/UpgradeModal';
import { CustomerStatusModal } from './components/customer/CustomerStatusModal';
const AdminDashboard=lazy(()=>import('./components/admin/AdminDashboard').then(module=>({default:module.AdminDashboard})));
const AdminSettings=lazy(()=>import('./components/admin/AdminSettings').then(module=>({default:module.AdminSettings})));
import { OfflineIndicator } from './components/pwa/OfflineIndicator';

export default function App() {
  // Theme state: Default Light mode, persisted
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('breezing_theme');
    return saved === 'dark' ? 'dark' : 'light';
  });

  // User and Permissions
  const [user, setUser] = useState<UserProfile | null>(() => getCachedUser());
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [isAdminMode, setIsAdminMode] = useState<boolean>(false);
  const [isCustomerPreviewMode, setIsCustomerPreviewMode] = useState<boolean>(false);

  // App Data
  const [packages, setPackages] = useState<SubscriptionPackage[]>([]);
  const [watermarkSettings, setWatermarkSettings] = useState<WatermarkSettings | null>(null);
  const [appSettings, setAppSettings] = useState<AppSettings | null>(null);
  const [quota, setQuota] = useState<UsageQuota | null>(null);
  const [recentRequests, setRecentRequests] = useState<UploadRequest[]>([]);

  // Modals & Navigation
  const [isAuthModalOpen, setIsAuthModalOpen] = useState<boolean>(false);
  const [isAccountModalOpen, setIsAccountModalOpen] = useState<boolean>(false);
  const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState<boolean>(false);
  const [isStatusModalOpen, setIsStatusModalOpen] = useState<boolean>(false);
  const [selectedRequestForStatus, setSelectedRequestForStatus] = useState<UploadRequest | null>(null);
  const [isAdminSettingsOpen, setIsAdminSettingsOpen] = useState<boolean>(false);

  // Apply theme class to document root
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem('breezing_theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
  };

  const authGeneration=useRef(0);
  const serviceGeneration=useRef(0);
  const loading=useRef<Promise<void>|null>(null);
  const previewMode=useRef(isCustomerPreviewMode); previewMode.current=isCustomerPreviewMode;
  const connectionHealthy=useRef(false);
  const [serviceVerified,setServiceVerified]=useState(false);
  const refreshService=useCallback(async()=>{
    const generation=serviceGeneration.current;
    try {const settings=await getAppSettings();if(generation===serviceGeneration.current){setAppSettings(settings);setServiceVerified(true);}}
    catch {if(generation===serviceGeneration.current)setServiceVerified(false);}
  },[]);
  // Load core application state
  const loadState = useCallback(():Promise<void> => {
    if(loading.current) return loading.current;
    const authVersion=authGeneration.current;
    const serviceVersion=serviceGeneration.current;
    const task=(async()=>{
    try {
      const currentUser = await getCurrentUser();
      if(authVersion!==authGeneration.current)return;
      setUser(currentUser);

      // Check admin status on server
      if (currentUser) {
        const adminStatus = await checkIsAdmin(currentUser.id);
        if(authVersion!==authGeneration.current)return;
        setIsAdmin(adminStatus);
        
        // Auto-redirect approved admin on first login if not explicitly in preview mode
        if (adminStatus && !previewMode.current) {
          setIsAdminMode(true);
        }
      } else {
        setIsAdmin(false);
        setIsAdminMode(false);
      }

      const [pkgs, wm, settings] = await Promise.all([
        getPackages(),
        getWatermarkSettings(),
        getAppSettings(),
      ]);

      if(authVersion!==authGeneration.current)return;
      setPackages(pkgs);
      setWatermarkSettings(wm);
      if(serviceVersion===serviceGeneration.current){setAppSettings(settings);setServiceVerified(true);}

      if (currentUser) {
        const [userQuota, userRequests] = await Promise.all([
          getUserQuota(currentUser.id),
          getUploadRequests(currentUser.id),
        ]);
        if(authVersion!==authGeneration.current)return;
        setQuota(userQuota);
        setRecentRequests(userRequests);
      } else {
        setRecentRequests([]);
      }
    } catch (err) {
      setServiceVerified(false);
      console.error('Failed to load application state:', err);
    } finally {
      setIsAuthLoading(false);
    }
    })(); loading.current=task;
    void task.finally(()=>{if(loading.current===task) loading.current=null;});
    return task;
  }, []);

  useEffect(()=>{void loadState();},[loadState]);
  useEffect(()=>subscribeToStateUpdates((table,settings)=>{
    if(table==='connection') {connectionHealthy.current=!!settings; if(settings) void refreshService(); else setServiceVerified(false); return;}
    if(table==='app_settings' && settings) {serviceGeneration.current++;setAppSettings(settings);setServiceVerified(true);return;}
    if(table==='app_settings') {void refreshService();return;}
    if(table==='packages') {void getPackages().then(setPackages).catch(()=>undefined);return;}
    if(table==='watermark_settings') {void getWatermarkSettings().then(setWatermarkSettings).catch(()=>undefined);return;}
    void loadState();
  },user?.id || ''),[loadState,refreshService,user?.id]);
  useEffect(()=>{
    const refresh=()=>{if(document.visibilityState==='visible') void refreshService();};
    const offline=()=>setServiceVerified(false);
    window.addEventListener('online',refresh);window.addEventListener('offline',offline);
    document.addEventListener('visibilitychange',refresh);
    const timer=setInterval(()=>{if(!connectionHealthy.current) refresh();},30_000);
    return ()=>{clearInterval(timer);window.removeEventListener('online',refresh);window.removeEventListener('offline',offline);document.removeEventListener('visibilitychange',refresh);};
  },[refreshService]);

  // Listen to Supabase Auth state changes
  useEffect(() => {
    if (isSupabaseConfigured() && supabase) {
      let reloadTimer: ReturnType<typeof setTimeout> | undefined;
      const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
        if(event!=='INITIAL_SESSION' && event!=='TOKEN_REFRESHED') authGeneration.current++;
        if (!session?.user) {
          setQuota(null);setRecentRequests([]);setSelectedRequestForStatus(null);
          setUser(null);
          setIsAdmin(false);
          setIsAdminMode(false);
          setIsCustomerPreviewMode(false);
        }
        if(event==='INITIAL_SESSION' || event==='TOKEN_REFRESHED') return;
        // Auth callbacks run under Supabase's session lock. Defer API calls
        // until the callback returns so login and token refresh can finish.
        clearTimeout(reloadTimer);
        reloadTimer = setTimeout(() => { const previous=loading.current; if(previous) void previous.then(()=>loadState()); else void loadState(); }, 0);
      });
      return () => {
        clearTimeout(reloadTimer);
        subscription.unsubscribe();
      };
    }
  }, [loadState]);

  // Active package calculation
  const activePackage =
    packages.find((p) => p.id === (user?.package_id || 'free')) ||
    packages[0] || {
      id: 'free',
      name: 'Free',
      price: 0,
      currency: 'MWK',
      duration_days: 30,
      monthly_pictures: 30,
      monthly_videos: 2,
      max_video_size_mb: 20,
      watermark_required: true,
      description: 'Starter plan',
      is_active: true,
    };

  const defaultQuota: UsageQuota = quota || {
    user_id: user?.id || 'anon',
    month_year: new Date().toISOString().slice(0, 7),
    pictures_used: 0,
    videos_used: 0,
    pictures_reserved: 0,
    videos_reserved: 0,
    last_updated: new Date().toISOString(),
  };

  const defaultWatermark: WatermarkSettings = watermarkSettings || {
    id: 1,
    logo_url: '/watermark-logo.svg',
    position: 'bottom-right',
    relative_size: 0.15,
    opacity: 0.85,
    padding_pixels: 32,
    enabled_for_free: true,
  };

  const defaultAppSettings: AppSettings = appSettings || {
    id: 1,
    app_name: 'breezing status HD',
    service_available: true,
    maintenance_mode: false,
    delivery_estimate_text: 'Usually ready in 5–10 minutes. Please allow up to 1 hour.',
    delivery_estimate_busy_text: 'High traffic. Delivery may take 20–45 minutes.',
    retention_hours: 24,
    admin_email: '',
    email_alerts_enabled: true,
    official_whatsapp_number: '+265 99 374 1274',
    official_contact_name: 'Breezing Status HD',
    official_country_code: '+265',
    payment_demo_mode: true,
  };

  const pendingRequestsCount = recentRequests.filter(
    (r) => r.status === 'pending' || r.status === 'processing'
  ).length;

  return (
    <div className={`app-shell ${isAdminMode && isAdmin ? 'admin-view' : 'customer-view'} min-h-screen flex flex-col text-[#19241E] dark:text-[#F2F6F2] antialiased selection:bg-[#21A36B]/20`}>
      <OfflineIndicator />

      {/* Admin Customer Preview Banner (Section 6) */}
      {isAdmin && isCustomerPreviewMode && (
        <aside 
          aria-label="Admin Preview Mode"
          className="preview-banner bg-[#173B2A] text-white px-4 py-2 text-xs font-semibold flex flex-wrap items-center justify-between gap-2"
        >
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-[#58C994]" />
            <span>Administrator Customer Preview Active</span>
          </div>

        </aside>
      )}

      {/* Primary Header Contract (Section 9) */}
      <Header
        user={user}
        isAuthLoading={isAuthLoading}
        isAdmin={isAdmin}
        isAdminMode={isAdminMode}
        onToggleAdminMode={() => {
          if (isAdmin) {
            if (isAdminMode) {
              // Admin wants to preview customer app
              setIsCustomerPreviewMode(true);
              setIsAdminMode(false);
            } else {
              setIsCustomerPreviewMode(false);
              setIsAdminMode(true);
            }
          }
        }}
        onOpenRequests={() => {
          if (recentRequests.length > 0) {
            setSelectedRequestForStatus(recentRequests[0]);
            setIsStatusModalOpen(true);
          } else {
            setIsAccountModalOpen(true);
          }
        }}
        onOpenSettings={() => setIsAccountModalOpen(true)}
        onOpenAuth={() => setIsAuthModalOpen(true)}
        pendingRequestsCount={pendingRequestsCount}
      />

      {/* Main Content Area */}
      <main className="app-main flex-1 w-full mx-auto">
        <ErrorBoundary fallbackTitle="Error loading view">
          <Suspense fallback={<p role="status" className="p-8 text-center text-sm opacity-60">Opening your workspace…</p>}>
          {isAdminMode && isAdmin ? (
            isAdminSettingsOpen ? (
              <AdminSettings onBack={() => setIsAdminSettingsOpen(false)} />
            ) : (
              <AdminDashboard
                onOpenSettings={() => setIsAdminSettingsOpen(true)}
                onViewCustomerApp={() => {
                  setIsCustomerPreviewMode(true);
                  setIsAdminMode(false);
                }}
              />
            )
          ) : (
            <UploadSection
              user={user}
              isAuthLoading={isAuthLoading}
              currentPackage={activePackage}
              quota={defaultQuota}
              watermarkSettings={defaultWatermark}
              serviceVerified={serviceVerified}
              appSettings={defaultAppSettings}
              onOpenAuth={() => setIsAuthModalOpen(true)}
              onOpenProfile={() => setIsAccountModalOpen(true)}
              onOpenUpgrade={() => setIsUpgradeModalOpen(true)}
              onRequestCreated={(req) => {
                setRecentRequests((prev) => [req, ...prev]);
                setSelectedRequestForStatus(req);
              }}
              onViewRequestStatus={(req) => {
                setSelectedRequestForStatus(req);
                setIsStatusModalOpen(true);
              }}
            />
          )}
          </Suspense>
        </ErrorBoundary>
      </main>

      {/* Quiet Minimal Footer (No bottom nav) */}
      <Footer />

      {/* Modals & Dialogs */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        existingProfile={user}
        onSuccess={(profile) => {
          setUser(profile);
          setIsAuthModalOpen(false);
          loadState();
        }}
      />

      {user && isAdmin && <AdminAccountModal isOpen={isAccountModalOpen} user={user} onClose={()=>setIsAccountModalOpen(false)} theme={theme} onToggleTheme={toggleTheme} onSettings={()=>{setIsAccountModalOpen(false);setIsCustomerPreviewMode(false);setIsAdminMode(true);setIsAdminSettingsOpen(true);}} onSignedOut={()=>{setUser(null);setIsAdmin(false);setIsAdminMode(false);setIsAccountModalOpen(false);}}/>}
      {user && !isAdmin && (
        <AccountModal
          isOpen={isAccountModalOpen}
          onClose={() => setIsAccountModalOpen(false)}
          user={user}
          currentPackage={activePackage}
          quota={defaultQuota}
          recentRequests={recentRequests}
          onOpenUpgrade={() => setIsUpgradeModalOpen(true)}
          onUserUpdated={(updated) => {
            setUser(updated);
            if (!updated) {
              setIsAdmin(false);
              setIsAdminMode(false);
            }
          }}
          onSelectRequestForStatus={(req) => {
            setSelectedRequestForStatus(req);
            setIsStatusModalOpen(true);
          }}
          theme={theme}
          onToggleTheme={toggleTheme}
          appSettings={defaultAppSettings}
        />
      )}

      <UpgradeModal
        isOpen={isUpgradeModalOpen}
        onClose={() => setIsUpgradeModalOpen(false)}
        packages={packages}
        user={user}
        onPaymentSubmitted={(_payment: PaymentRequest) => {
          loadState();
        }}
        onOpenAuth={() => setIsAuthModalOpen(true)}
      />

      <CustomerStatusModal
        isOpen={isStatusModalOpen}
        onClose={() => setIsStatusModalOpen(false)}
        request={selectedRequestForStatus}
        appSettings={defaultAppSettings}
      />
    </div>
  );
}
