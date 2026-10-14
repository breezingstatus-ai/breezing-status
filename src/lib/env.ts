// Centralized Environment Variable Configuration and Validation
// Validates frontend variables and normalizes Supabase endpoint safely.

export interface AppEnvConfig {
  appName: string;
  appEnv: 'development' | 'production' | 'test';
  supabaseUrl: string;
  supabasePublishableKey: string;
  cloudinaryCloudName: string;
  defaultTheme: 'light' | 'dark';
  paymentDemoMode: boolean;
  isSupabaseConfigured: boolean;
  isCloudinaryConfigured: boolean;
}

// Normalizes Supabase URL to root (strips trailing slashes and /rest/v1 endpoint)
export function normalizeSupabaseUrl(url?: string): string {
  if (!url) return '';
  let cleaned = url.trim().replace(/\/+$/, '');
  cleaned = cleaned.replace(/\/rest\/v1\/?$/, '');
  return cleaned;
}

const rawSupabaseUrl =
  import.meta.env.VITE_SUPABASE_URL ||
  'https://mzmnjrrgnqvzzxzupydx.supabase.co';

const rawPublishableKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  '';

const rawCloudinaryCloudName =
  import.meta.env.VITE_CLOUDINARY_CLOUD_NAME || 'scaycidy';

export const ENV: AppEnvConfig = {
  appName: import.meta.env.VITE_APP_NAME || 'breezing status HD',
  appEnv: (import.meta.env.VITE_APP_ENV as any) || 'production',
  supabaseUrl: normalizeSupabaseUrl(rawSupabaseUrl),
  supabasePublishableKey: rawPublishableKey,
  cloudinaryCloudName: rawCloudinaryCloudName,
  defaultTheme:
    (import.meta.env.VITE_DEFAULT_THEME as 'light' | 'dark') || 'light',
  paymentDemoMode: import.meta.env.VITE_PAYMENT_DEMO_MODE !== 'false',
  isSupabaseConfigured: Boolean(
    rawSupabaseUrl &&
      rawPublishableKey &&
      !rawSupabaseUrl.includes('your-project-id') &&
      !rawPublishableKey.includes('your-anon-public-key')
  ),
  isCloudinaryConfigured: Boolean(
    rawCloudinaryCloudName &&
      !rawCloudinaryCloudName.includes('your-cloud-name')
  ),
};

// Safe client-side diagnostics (never prints secret values)
export function getClientConfigStatus(): {
  supabaseOk: boolean;
  cloudinaryOk: boolean;
  environment: string;
  normalizedUrl: string;
} {
  return {
    supabaseOk: ENV.isSupabaseConfigured,
    cloudinaryOk: ENV.isCloudinaryConfigured,
    environment: ENV.appEnv,
    normalizedUrl: ENV.supabaseUrl ? new URL(ENV.supabaseUrl).hostname : 'unconfigured',
  };
}
