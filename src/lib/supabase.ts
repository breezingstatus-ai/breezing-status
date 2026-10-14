// Supabase Client and Unified Data Layer
// Connects to live Supabase Auth, PostgreSQL, Realtime & Edge Functions when configured,
// and provides a fully interactive local state fallback with diagnostics when awaiting deployment keys.

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  UserProfile,
  SubscriptionPackage,
  UsageQuota,
  UploadRequest,
  WatermarkSettings,
  AppSettings,
  PaymentRequest,
  MediaAsset,
  AdminUserListItem,
} from '../types';
import { ENV } from './env';

const supabaseUrl = ENV.supabaseUrl;
const supabaseKey = ENV.supabasePublishableKey;

export const isSupabaseConfigured = (): boolean => {
  return ENV.isSupabaseConfigured;
};

export const supabase: SupabaseClient | null = isSupabaseConfigured()
  ? createClient(supabaseUrl, supabaseKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
      },
    })
  : null;

// ==========================================
// Default Seed Data
// ==========================================

const DEFAULT_PACKAGES: SubscriptionPackage[] = [
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
    description: 'Starter plan for personal WhatsApp status. 30 HD pictures & 2 videos monthly with watermark.',
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
    description: 'Crystal-clear HD media without watermark. 100 pictures & 10 videos with priority delivery.',
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
    description: 'For brands, influencers & power users. 300 pictures, 35 videos, no watermark & VIP fast queue.',
    is_active: true,
  },
];

const DEFAULT_WATERMARK: WatermarkSettings = {
  id: 1,
  logo_url: '/watermark-logo.svg',
  position: 'bottom-right',
  relative_size: 0.15,
  opacity: 0.85,
  padding_pixels: 32,
  enabled_for_free: true,
};

const DEFAULT_APP_SETTINGS: AppSettings = {
  id: 1,
  app_name: 'breezing status HD',
  service_available: true,
  maintenance_mode: false,
  delivery_estimate_text: 'Usually ready in 5–10 minutes. Please allow up to 1 hour.',
  delivery_estimate_busy_text: 'High traffic. Delivery may take 20–45 minutes.',
  retention_hours: 24,
  admin_email: 'breezingstatus@gmail.com',
  email_alerts_enabled: true,
  official_whatsapp_number: '+265 99 374 1274',
  official_contact_name: 'Breezing Status HD',
  official_country_code: '+265',
  payment_demo_mode: true,
};

// ==========================================
// Local Storage State Store for Live Session
// ==========================================

const STORAGE_KEYS = {
  USER: 'breezing_current_user',
  PACKAGES: 'breezing_packages',
  WATERMARK: 'breezing_watermark',
  APP_SETTINGS: 'breezing_app_settings',
  REQUESTS: 'breezing_requests',
  QUOTAS: 'breezing_quotas',
  PAYMENTS: 'breezing_payments',
  THEME: 'breezing_theme',
  CUSTOMERS: 'breezing_customers',
};

// Listeners for realtime reactive UI
type Listener = () => void;
const listeners = new Set<Listener>();
let stateChannel: ReturnType<NonNullable<typeof supabase>['channel']> | null = null;

export function subscribeToStateUpdates(listener: Listener): () => void {
  listeners.add(listener);
  if (supabase && !stateChannel) {
    stateChannel = supabase.channel('app-state');
    for (const table of ['packages','watermark_settings','profiles','usage_quotas','app_settings']) {
      stateChannel.on('postgres_changes', {event:'*', schema:'public', table}, notifyStateChange);
    }
    stateChannel.subscribe();
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size && stateChannel && supabase) { void supabase.removeChannel(stateChannel); stateChannel = null; }
  };
}

function notifyStateChange() {
  listeners.forEach((fn) => {
    try {
      fn();
    } catch (e) {
      console.error(e);
    }
  });
}

// Storage helpers
function getStored<T>(key: string, defaultValue: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return defaultValue;
    return JSON.parse(raw);
  } catch {
    return defaultValue;
  }
}

function setStored<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    notifyStateChange();
  } catch (e) {
    console.error('Storage write error', e);
  }
}

// Initialize system defaults and purge legacy demo records
export function initializeLocalState() {
  if (!localStorage.getItem(STORAGE_KEYS.PACKAGES)) {
    setStored(STORAGE_KEYS.PACKAGES, DEFAULT_PACKAGES);
  }
  if (!localStorage.getItem(STORAGE_KEYS.WATERMARK)) {
    setStored(STORAGE_KEYS.WATERMARK, DEFAULT_WATERMARK);
  }
  if (!localStorage.getItem(STORAGE_KEYS.APP_SETTINGS)) {
    setStored(STORAGE_KEYS.APP_SETTINGS, DEFAULT_APP_SETTINGS);
  }

  // Purge any legacy demo data from localStorage
  const rawRequests = getStored<UploadRequest[]>(STORAGE_KEYS.REQUESTS, []);
  const cleanRequests = rawRequests.filter((r) => !r.id.startsWith('demo-req-'));
  if (cleanRequests.length !== rawRequests.length) {
    setStored(STORAGE_KEYS.REQUESTS, cleanRequests);
  }

  const rawCustomers = getStored<UserProfile[]>(STORAGE_KEYS.CUSTOMERS, []);
  const cleanCustomers = rawCustomers.filter((c) => !c.id.startsWith('usr-demo-'));
  if (cleanCustomers.length !== rawCustomers.length) {
    setStored(STORAGE_KEYS.CUSTOMERS, cleanCustomers);
  }

  const rawQuotas = getStored<Record<string, UsageQuota>>(STORAGE_KEYS.QUOTAS, {});
  let quotasModified = false;
  Object.keys(rawQuotas).forEach((key) => {
    if (key.startsWith('usr-demo-')) {
      delete rawQuotas[key];
      quotasModified = true;
    }
  });
  if (quotasModified) {
    setStored(STORAGE_KEYS.QUOTAS, rawQuotas);
  }
}

// Call init on bundle load
initializeLocalState();

// ==========================================
// Authentication Layer
// ==========================================

// A cached profile is display state only; server checks still authorize every action.
export function getCachedUser(): UserProfile | null {
  if (!isSupabaseConfigured()) return getStored<UserProfile | null>(STORAGE_KEYS.USER, null);
  const projectRef = new URL(supabaseUrl).hostname.split('.')[0];
  const session = getStored<any>(`sb-${projectRef}-auth-token`, null);
  const profile = getStored<UserProfile | null>(STORAGE_KEYS.USER, null);
  if (!session?.user?.id) return null;
  return profile?.id === session.user.id ? profile : null;
}

export async function getCurrentUser(): Promise<UserProfile | null> {
  if (isSupabaseConfigured() && supabase) {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (profile) {
        // Do not emit a state-change event here: loadState itself calls this.
        try { localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(profile)); } catch {}
        return profile as UserProfile;
      }
    } catch (err) {
      console.warn('Supabase auth fetch error, falling back to local user', err);
    }
  }

  return getStored<UserProfile | null>(STORAGE_KEYS.USER, null);
}

export async function signInWithGoogle(): Promise<{ error?: string; user?: UserProfile }> {
  if (isSupabaseConfigured() && supabase) {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/`,
      },
    });
    if (error) return { error: error.message };
    return {};
  }

  return {
    error: 'Supabase authentication is not configured yet. Please configure VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in your environment to sign in with Google.',
  };
}

export async function signOut(): Promise<void> {
  if (isSupabaseConfigured() && supabase) {
    await supabase.auth.signOut();
  }
  setStored<UserProfile | null>(STORAGE_KEYS.USER, null);
}

export async function saveUserProfile(profile: UserProfile): Promise<void> {
  if (isSupabaseConfigured() && supabase) {
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) throw new Error('Please sign in again before saving your profile.');
    if (user.id !== profile.id) throw new Error('This profile does not belong to your signed-in account.');
    const { data, error } = await supabase.from('profiles').update({
      full_name: profile.full_name,
      whatsapp_number: profile.whatsapp_number,
      country_code: profile.country_code,
      whatsapp_consent: profile.whatsapp_consent,
      avatar_url: profile.avatar_url,
      avatar_thumbnail_url: profile.avatar_thumbnail_url,
      theme_preference: profile.theme_preference,
    }).eq('id', user.id).select('*').single();
    if (error) throw new Error(error.message);
    setStored(STORAGE_KEYS.USER, data);
    return;
  }
  setStored(STORAGE_KEYS.USER, profile);
}

// ==========================================
// Packages & Watermark
// ==========================================

export async function getPackages(): Promise<SubscriptionPackage[]> {
  if (isSupabaseConfigured() && supabase) {
    const { data, error } = await supabase.from('packages').select('*').order('price', { ascending: true });
    if (error) throw new Error(error.message);
    if (data && data.length > 0) return data;
  }
  return getStored<SubscriptionPackage[]>(STORAGE_KEYS.PACKAGES, DEFAULT_PACKAGES);
}

export async function updatePackage(pkg: SubscriptionPackage): Promise<void> {
  if (isSupabaseConfigured() && supabase) {
    const numbers = [pkg.price, pkg.duration_days, pkg.monthly_pictures, pkg.monthly_videos, pkg.max_video_size_mb, pkg.max_video_duration_seconds ?? 60];
    if (!pkg.name.trim() || numbers.some(n => !Number.isFinite(n) || n < 0) || pkg.duration_days < 1 || pkg.max_video_size_mb < 1 || (pkg.max_video_duration_seconds ?? 60) < 1 || numbers.slice(1).some(n => !Number.isInteger(n))) throw new Error('Enter valid prices and whole-number package limits.');
    const { error } = await supabase.from('packages').upsert(pkg);
    if (error) throw new Error(error.message);
  }
  const current = await getPackages();
  const updated = current.map((p) => (p.id === pkg.id ? pkg : p));
  setStored(STORAGE_KEYS.PACKAGES, updated);
}

export async function getWatermarkSettings(): Promise<WatermarkSettings> {
  if (isSupabaseConfigured() && supabase) {
    const { data, error } = await supabase.from('watermark_settings').select('*').single();
    if (error) throw new Error(error.message);
    if (data) return { ...data, logo_url: data.logo_url === '/watermark-logo.png' ? '/watermark-logo.svg' : data.logo_url };
  }
  return getStored<WatermarkSettings>(STORAGE_KEYS.WATERMARK, DEFAULT_WATERMARK);
}

export async function updateWatermarkSettings(settings: WatermarkSettings): Promise<void> {
  if (isSupabaseConfigured() && supabase) {
    const { error } = await supabase.from('watermark_settings').upsert({ ...settings, id: 1 });
    if (error) throw new Error(error.message);
  }
  setStored(STORAGE_KEYS.WATERMARK, settings);
}

// ==========================================
// App Settings
// ==========================================

export async function getAppSettings(): Promise<AppSettings> {
  if (isSupabaseConfigured() && supabase) {
    const { data } = await supabase.from('app_settings').select('*').single();
    let privateSettings: Partial<AppSettings> | null = null;
    const { data: { session } } = await supabase.auth.getSession();
    if (session && await checkIsAdmin(session.user.id)) {
      const { data: priv } = await supabase.from('admin_private_settings').select('*').maybeSingle();
      if (priv) privateSettings = priv;
    }
    if (data) {
      return {
        ...DEFAULT_APP_SETTINGS,
        ...data,
        ...(privateSettings || {}),
      };
    }
  }
  const stored = getStored<AppSettings>(STORAGE_KEYS.APP_SETTINGS, DEFAULT_APP_SETTINGS);
  return {
    ...DEFAULT_APP_SETTINGS,
    ...stored,
  };
}

export async function updateAppSettings(settings: AppSettings): Promise<void> {
  if (isSupabaseConfigured() && supabase) {
    const publicSettings = {
      id: 1,
      app_name: settings.app_name,
      service_available: settings.service_available,
      maintenance_mode: settings.maintenance_mode,
      delivery_estimate_text: settings.delivery_estimate_text,
      delivery_estimate_busy_text: settings.delivery_estimate_busy_text,
      retention_hours: settings.retention_hours,
      official_whatsapp_number: settings.official_whatsapp_number,
      official_contact_name: settings.official_contact_name,
      official_country_code: settings.official_country_code,
      payment_demo_mode: settings.payment_demo_mode,
    };
    await supabase.from('app_settings').upsert(publicSettings);

    if (settings.admin_email !== undefined || settings.email_alerts_enabled !== undefined) {
      try {
        await supabase.from('admin_private_settings').upsert({
          id: 1,
          admin_email: settings.admin_email || 'breezingstatus@gmail.com',
          email_alerts_enabled: settings.email_alerts_enabled ?? true,
        });
      } catch (err) {
        console.warn('Could not update admin private settings:', err);
      }
    }
  }
  setStored(STORAGE_KEYS.APP_SETTINGS, settings);
}

// ==========================================
// Usage Quotas
// ==========================================

export async function getUserQuota(userId: string): Promise<UsageQuota> {
  const dateParts = new Intl.DateTimeFormat('en', {
    timeZone: 'Africa/Blantyre', year: 'numeric', month: '2-digit',
  }).formatToParts(new Date());
  const currentMonth = `${dateParts.find(p => p.type === 'year')!.value}-${dateParts.find(p => p.type === 'month')!.value}`;

  if (isSupabaseConfigured() && supabase) {
    const { data } = await supabase
      .from('usage_quotas')
      .select('*')
      .eq('user_id', userId)
      .eq('month_year', currentMonth)
      .maybeSingle();

    if (data) return data;
  }

  const quotas = getStored<Record<string, UsageQuota>>(STORAGE_KEYS.QUOTAS, {});
  const key = `${userId}_${currentMonth}`;
  if (!quotas[key]) {
    quotas[key] = {
      user_id: userId,
      month_year: currentMonth,
      pictures_used: 0,
      videos_used: 0,
      pictures_reserved: 0,
      videos_reserved: 0,
      last_updated: new Date().toISOString(),
    };
    setStored(STORAGE_KEYS.QUOTAS, quotas);
  }
  return quotas[key];
}

export async function reserveMediaQuota(
  userId: string,
  count: number,
  mediaType: 'image' | 'video',
  reservationToken: string
): Promise<{ success: boolean; error?: string; reservation_token?: string }> {
  if (isSupabaseConfigured() && supabase) {
    const { data, error } = await supabase.rpc('reserve_media_quota', {
      p_user_id: userId,
      p_count: count,
      p_media_type: mediaType,
      p_reservation_token: reservationToken,
    });
    if (error) {
      throw new Error(error.message);
    }
    if (data && !data.success) {
      throw new Error(data.error || 'Quota reservation failed.');
    }
    return data;
  }
  return { success: true, reservation_token: reservationToken };
}

export async function releaseMediaQuota(reservationToken: string): Promise<void> {
  if (isSupabaseConfigured() && supabase) {
    try {
      await supabase.rpc('release_media_quota', {
        p_reservation_token: reservationToken,
      });
    } catch (e) {
      console.warn('Failed to release quota reservation:', e);
    }
  }
}

// ==========================================
// Upload Requests Management
// ==========================================

export async function createUploadRequest(
  user: UserProfile,
  pkg: SubscriptionPackage,
  mediaType: 'image' | 'video',
  assets: MediaAsset[],
  notes?: string,
  reservationToken?: string
): Promise<UploadRequest> {
  const watermarkApplied = pkg.watermark_required;
  const requestCode = `BRZ-${Math.floor(10000 + Math.random() * 90000)}`;
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  const newRequest: UploadRequest = {
    id: `req-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    request_code: requestCode,
    user_id: user.id,
    customer_name: user.full_name,
    customer_email: user.email,
    customer_phone: user.whatsapp_number,
    package_id: pkg.id,
    package_name: pkg.name,
    media_type: mediaType,
    media_count: assets.length,
    watermark_applied: watermarkApplied,
    status: 'pending',
    admin_notes: notes,
    expires_at: expiresAt,
    created_at: new Date().toISOString(),
    assets,
  };

  if (isSupabaseConfigured() && supabase) {
    try {
      // 1. Preferred route: finalize through backend Edge Function (verifies Cloudinary, reservation token, and quota)
      if (reservationToken) {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError || !session) throw new Error('Please sign in again before submitting your upload.');
        const { data: edgeData, error: edgeError } = await supabase.functions.invoke('finalize-request', {
          headers: { Authorization: `Bearer ${session.access_token}` },
          body: {
            mediaType,
            assets: assets.map(asset => ({
              ...asset,
              public_id: asset.cloudinary_public_id,
              asset_id: asset.cloudinary_asset_id,
              bytes: asset.file_size_bytes,
              duration: asset.duration_seconds,
            })),
            reservationToken,
            customerNotes: notes,
          },
        });

        if (!edgeError && edgeData?.request) {
          const req: UploadRequest = {
            ...edgeData.request,
            assets: edgeData.request.assets || assets,
          };
          const requests = getStored<UploadRequest[]>(STORAGE_KEYS.REQUESTS, []);
          setStored(STORAGE_KEYS.REQUESTS, [req, ...requests.filter((r) => r.id !== req.id)]);
          return req;
        }
        if (edgeError?.context instanceof Response) {
          const body = await edgeError.context.json().catch(() => null);
          throw new Error(body?.error || edgeError.message);
        }
        throw new Error(edgeData?.error || edgeError?.message || 'The upload could not be finalized.');
      }

      // 2. Direct fallback (for active administrators)
      const { data, error } = await supabase
        .from('upload_requests')
        .insert({
          request_code: requestCode,
          user_id: user.id,
          customer_name: user.full_name,
          customer_email: user.email,
          customer_phone: user.whatsapp_number,
          package_id: pkg.id,
          package_name: pkg.name,
          media_type: mediaType,
          media_count: assets.length,
          watermark_applied: watermarkApplied,
          status: 'pending',
          admin_notes: notes,
          expires_at: expiresAt,
        })
        .select()
        .single();

      if (!error && data) {
        newRequest.id = data.id;
        const assetRows = assets.map((a) => ({
          request_id: data.id,
          user_id: user.id,
          cloudinary_public_id: a.cloudinary_public_id,
          resource_type: mediaType,
          secure_url: a.secure_url,
          original_filename: a.original_filename,
          file_size_bytes: a.file_size_bytes,
          format: a.format,
          expires_at: expiresAt,
        }));
        await supabase.from('media_assets').insert(assetRows);
      }
    } catch (e) {
      throw e;
    }
  }

  // Update local storage requests
  const requests = getStored<UploadRequest[]>(STORAGE_KEYS.REQUESTS, []);
  setStored(STORAGE_KEYS.REQUESTS, [newRequest, ...requests]);

  // Update quota
  const currentMonth = new Date().toISOString().slice(0, 7);
  const quotas = getStored<Record<string, UsageQuota>>(STORAGE_KEYS.QUOTAS, {});
  const qKey = `${user.id}_${currentMonth}`;
  if (quotas[qKey]) {
    if (mediaType === 'image') {
      quotas[qKey].pictures_used += assets.length;
    } else {
      quotas[qKey].videos_used += assets.length;
    }
    quotas[qKey].last_updated = new Date().toISOString();
    setStored(STORAGE_KEYS.QUOTAS, quotas);
  }

  return newRequest;
}

export async function getUploadRequests(userId?: string): Promise<UploadRequest[]> {
  if (isSupabaseConfigured() && supabase) {
    let query = supabase
      .from('upload_requests')
      .select('*, media_assets(*)')
      .order('created_at', { ascending: false });

    if (userId) {
      query = query.eq('user_id', userId);
    }

    const { data, error } = await query;
    if (error) {
      console.error('Failed to query upload requests from Supabase:', error);
      throw new Error(`Failed to load requests from Supabase: ${error.message}`);
    }
    return (data || []).map((d: any) => ({
      ...d,
      assets: d.media_assets || [],
    }));
  }

  const all = getStored<UploadRequest[]>(STORAGE_KEYS.REQUESTS, []).filter(
    (r) => !r.id.startsWith('demo-req-')
  );
  if (userId) {
    return all.filter((r) => r.user_id === userId);
  }
  return all;
}

export async function updateRequestStatus(
  requestId: string,
  status: UploadRequest['status'],
  notes?: string
): Promise<void> {
  if (isSupabaseConfigured() && supabase) {
    await supabase
      .from('upload_requests')
      .update({ status, admin_notes: notes, updated_at: new Date().toISOString() })
      .eq('id', requestId);
  }

  const requests = getStored<UploadRequest[]>(STORAGE_KEYS.REQUESTS, []);
  const updated = requests.map((r) =>
    r.id === requestId ? { ...r, status, admin_notes: notes || r.admin_notes } : r
  );
  setStored(STORAGE_KEYS.REQUESTS, updated);
}

export async function deleteUploadRequest(requestId: string): Promise<void> {
  if (isSupabaseConfigured() && supabase) {
    const {error} = await supabase.from('upload_requests').delete().eq('id', requestId);
    if(error) throw new Error(error.message);
  }
  const requests = getStored<UploadRequest[]>(STORAGE_KEYS.REQUESTS, []);
  const filtered = requests.filter((r) => r.id !== requestId);
  setStored(STORAGE_KEYS.REQUESTS, filtered);
}

// ==========================================
// Payments Workflow
// ==========================================

export async function submitPayment(payment: Omit<PaymentRequest, 'id' | 'status' | 'created_at'>): Promise<PaymentRequest> {
  const newPayment: PaymentRequest = {
    id: crypto.randomUUID(),
    ...payment,
    status: 'pending',
    created_at: new Date().toISOString(),
  };

  if (isSupabaseConfigured() && supabase) {
    const {data,error} = await supabase.from('payment_requests').insert({id:newPayment.id,user_id:payment.user_id,package_id:payment.package_id,amount:payment.amount,currency:payment.currency,payment_method:payment.payment_method,reference_number:payment.reference_number,notes:payment.notes,status:'pending'}).select('*').single();
    if(error) throw new Error(error.message);
    Object.assign(newPayment,data);
  }

  const payments = getStored<PaymentRequest[]>(STORAGE_KEYS.PAYMENTS, []);
  setStored(STORAGE_KEYS.PAYMENTS, [newPayment, ...payments]);
  return newPayment;
}

export async function getPaymentRequests(): Promise<PaymentRequest[]> {
  if (isSupabaseConfigured() && supabase) {
    const { data, error } = await supabase.from('payment_requests').select('*').order('created_at', { ascending: false });
    if(error) throw new Error(error.message);
    const packages = await getPackages();
    return (data || []).map(payment => ({...payment,package_name:packages.find(pkg=>pkg.id===payment.package_id)?.name}));
  }
  return getStored<PaymentRequest[]>(STORAGE_KEYS.PAYMENTS, []);
}

export async function approvePayment(paymentId: string): Promise<void> {
  if(supabase) {
    const {error} = await supabase.from('payment_requests').update({status:'approved'}).eq('id',paymentId);
    if(error) throw new Error(error.message);
    notifyStateChange();return;
  }
  const payments = await getPaymentRequests();
  const payment = payments.find((p) => p.id === paymentId);
  if (!payment) return;

  payment.status = 'approved';
  setStored(
    STORAGE_KEYS.PAYMENTS,
    payments.map((p) => (p.id === paymentId ? payment : p))
  );

  // Upgrade the user's package
  const currentUser = await getCurrentUser();
  if (currentUser && currentUser.id === payment.user_id) {
    currentUser.package_id = payment.package_id;
    currentUser.package_expiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    await saveUserProfile(currentUser);
  }
}

export async function rejectPayment(paymentId: string, adminNotes?: string): Promise<void> {
  if(supabase) {
    const {error} = await supabase.from('payment_requests').update({status:'rejected',admin_notes:adminNotes}).eq('id',paymentId);
    if(error) throw new Error(error.message);
    notifyStateChange();return;
  }
  const payments = await getPaymentRequests();
  const payment = payments.find((p) => p.id === paymentId);
  if (!payment) return;

  payment.status = 'rejected';
  payment.admin_notes = adminNotes;
  setStored(
    STORAGE_KEYS.PAYMENTS,
    payments.map((p) => (p.id === paymentId ? payment : p))
  );
}

// ==========================================
// Customer Management (Admin Portal)
// ==========================================

export async function getAllCustomers(): Promise<AdminUserListItem[]> {
  const currentMonth = new Intl.DateTimeFormat('en-CA', {timeZone:'Africa/Blantyre', year:'numeric',month:'2-digit'}).format(new Date()).slice(0,7);
  const pkgs = await getPackages();
  const pkgMap = new Map(pkgs.map((p) => [p.id, p]));
  const quotas = getStored<Record<string, UsageQuota>>(STORAGE_KEYS.QUOTAS, {});
  if (supabase) {
    const {data,error} = await supabase.from('usage_quotas').select('*').eq('month_year',currentMonth);
    if(error) throw new Error(error.message);
    for(const quota of data || []) quotas[`${quota.user_id}_${currentMonth}`] = quota;
  }
  const allRequests = await getUploadRequests().catch(() => []);

  let profiles: UserProfile[] = [];

  if (isSupabaseConfigured() && supabase) {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Failed to query profiles from Supabase:', error);
      throw new Error(`Failed to load customer profiles: ${error.message}`);
    }
    profiles = (data || []) as UserProfile[];
  } else {
    // Only genuine registered customer in local session, never fake demo accounts
    const storedCustomers = getStored<UserProfile[]>(STORAGE_KEYS.CUSTOMERS, []).filter(
      (c) => !c.id.startsWith('usr-demo-')
    );
    const currentUser = getStored<UserProfile | null>(STORAGE_KEYS.USER, null);

    const merged = [...storedCustomers];
    if (currentUser && !merged.some((c) => c.id === currentUser.id)) {
      merged.unshift(currentUser);
    }
    profiles = merged;
  }

  return profiles.map((p) => {
    const qKey = `${p.id}_${currentMonth}`;
    const userQuota = quotas[qKey] || {
      pictures_used: 0,
      videos_used: 0,
    };
    const userPkg = pkgMap.get(p.package_id || 'free') || pkgs[0];
    const userRequests = allRequests.filter((r) => r.user_id === p.id);

    return {
      ...p,
      requests_count: userRequests.length,
      pictures_used: userQuota.pictures_used,
      videos_used: userQuota.videos_used,
      pictures_allowed: userPkg ? userPkg.monthly_pictures : 30,
      videos_allowed: userPkg ? userPkg.monthly_videos : 2,
    };
  });
}

export async function deleteCustomerAccount(userId: string): Promise<{ success: boolean }> {
  if (isSupabaseConfigured() && supabase) {
    try {
      // 1. Invoke protected delete-account Edge Function to wipe Cloudinary assets and delete auth account
      const { data, error: fnError } = await supabase.functions.invoke('delete-account');
      if (fnError) {
        throw new Error(fnError.message || 'Failed to delete customer account via secure Edge Function.');
      }
      await supabase.auth.signOut();
    } catch (err: any) {
      console.error('Failed to delete user account on Supabase:', err);
      throw new Error(err.message || 'Failed to delete customer account.');
    }
  }

  // Clear local session storage for this user
  const currentUser = getStored<UserProfile | null>(STORAGE_KEYS.USER, null);
  if (currentUser?.id === userId) {
    setStored<UserProfile | null>(STORAGE_KEYS.USER, null);
  }

  const customers = getStored<UserProfile[]>(STORAGE_KEYS.CUSTOMERS, []);
  setStored(STORAGE_KEYS.CUSTOMERS, customers.filter((c) => c.id !== userId));

  const requests = getStored<UploadRequest[]>(STORAGE_KEYS.REQUESTS, []);
  setStored(STORAGE_KEYS.REQUESTS, requests.filter((r) => r.user_id !== userId));

  notifyStateChange();
  return { success: true };
}

export async function updateCustomerPlan(
  userId: string,
  packageId: string,
  durationDays: number = 30
): Promise<void> {
  const expiry = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000).toISOString();

  if (isSupabaseConfigured() && supabase) {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ package_id: packageId, package_expiry: expiry, updated_at: new Date().toISOString() })
        .eq('id', userId);
      if (error) throw new Error(error.message);
    } catch (e) {
      throw e;
    }
  }

  // Update in stored customers
  const customers = getStored<UserProfile[]>(STORAGE_KEYS.CUSTOMERS, []);
  const updatedCustomers = customers.map((c) =>
    c.id === userId ? { ...c, package_id: packageId, package_expiry: expiry } : c
  );
  setStored(STORAGE_KEYS.CUSTOMERS, updatedCustomers);

  // Update current user if matching
  const currentUser = getStored<UserProfile | null>(STORAGE_KEYS.USER, null);
  if (currentUser && currentUser.id === userId) {
    currentUser.package_id = packageId;
    currentUser.package_expiry = expiry;
    setStored(STORAGE_KEYS.USER, currentUser);
  }
}

export async function resetCustomerQuota(userId: string): Promise<void> {
  if (isSupabaseConfigured() && supabase) {
    const { error } = await supabase.rpc('reset_customer_to_free', {p_user_id: userId});
    if (error) throw new Error(error.message);
    notifyStateChange();
    return;
  }
  await updateCustomerPlan(userId, 'free', 30);
  const currentMonth = new Date().toISOString().slice(0, 7);
  const quotas = getStored<Record<string, UsageQuota>>(STORAGE_KEYS.QUOTAS, {});
  const qKey = `${userId}_${currentMonth}`;

  quotas[qKey] = {
    user_id: userId,
    month_year: currentMonth,
    pictures_used: 0,
    videos_used: 0,
    pictures_reserved: 0,
    videos_reserved: 0,
    last_updated: new Date().toISOString(),
  };
  setStored(STORAGE_KEYS.QUOTAS, quotas);
}

export async function toggleCustomerStatus(userId: string, status: 'active' | 'suspended'): Promise<void> {
  if (isSupabaseConfigured() && supabase) {
    try {
      const { error } = await supabase.from('profiles').update({ status, updated_at: new Date().toISOString() }).eq('id', userId);
      if (error) throw new Error(error.message);
    } catch (e) {
      throw e;
    }
  }

  const customers = getStored<UserProfile[]>(STORAGE_KEYS.CUSTOMERS, []);
  const updated = customers.map((c) => (c.id === userId ? { ...c, status } : c));
  setStored(STORAGE_KEYS.CUSTOMERS, updated);

  const currentUser = getStored<UserProfile | null>(STORAGE_KEYS.USER, null);
  if (currentUser && currentUser.id === userId) {
    currentUser.status = status;
    setStored(STORAGE_KEYS.USER, currentUser);
  }
}

export async function updateCustomerDetails(userId: string, updates: Partial<UserProfile>): Promise<void> {
  if (isSupabaseConfigured() && supabase) {
    try {
      await supabase.from('profiles').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', userId);
    } catch (e) {
      console.warn(e);
    }
  }

  const customers = getStored<UserProfile[]>(STORAGE_KEYS.CUSTOMERS, []);
  const updated = customers.map((c) => (c.id === userId ? { ...c, ...updates } : c));
  setStored(STORAGE_KEYS.CUSTOMERS, updated);

  const currentUser = getStored<UserProfile | null>(STORAGE_KEYS.USER, null);
  if (currentUser && currentUser.id === userId) {
    const updatedUser = { ...currentUser, ...updates };
    setStored(STORAGE_KEYS.USER, updatedUser);
  }
}

// ==========================================
// Admin Security & Server-Side Role Authorization
// ==========================================

export async function checkIsAdmin(userId?: string): Promise<boolean> {
  if (isSupabaseConfigured() && supabase) {
    try {
      // 1. Check server-side is_admin() RPC function
      const { data, error } = await supabase.rpc('is_admin');
      if (!error && typeof data === 'boolean') {
        return data;
      }

    } catch (e) {
      console.warn('Server admin verification check:', e);
    }
    return false;
  }

  // Fallback to active session profile role
  const currentUser = getStored<UserProfile | null>(STORAGE_KEYS.USER, null);
  return currentUser?.role === 'admin';
}

// ==========================================
// Profile Photo Processing & Upload
// ==========================================

export async function uploadProfileAvatar(file: File, userId: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read image file'));
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => reject(new Error('Failed to decode image'));
      img.onload = async () => {
        try {
          const size = 320;
          const canvas = document.createElement('canvas');
          canvas.width = size;
          canvas.height = size;
          const ctx = canvas.getContext('2d');
          if (!ctx) throw new Error('Canvas not available');

          // Center crop square
          const minDim = Math.min(img.width, img.height);
          const sx = (img.width - minDim) / 2;
          const sy = (img.height - minDim) / 2;

          ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, size, size);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.88);

          // Update profile in storage & Supabase
          await updateCustomerDetails(userId, { avatar_url: dataUrl });
          resolve(dataUrl);
        } catch (err) {
          reject(err);
        }
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  });
}

export async function getFailedDeletionAssets(): Promise<any[]> {
  if (isSupabaseConfigured() && supabase) {
    if (!(await checkIsAdmin())) return [];
    try {
      const { data, error } = await supabase.rpc('get_failed_deletion_assets', { p_limit: 20 });
      if (!error && data) return data;
    } catch (e) {
      console.warn('Failed to query failed deletion assets:', e);
    }
  }
  return [];
}

